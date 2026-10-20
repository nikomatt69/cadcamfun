/**
 * Toolpath simulation clock for the phone preview.
 *
 * The desktop sends motion as straight segments tagged with their G-code line. Timing comes from the
 * program itself: the modal `F` word in effect on each line (units per minute, in the program's own
 * units, so inch and metric programs both work without conversion). Rapids have no feed word; they
 * run at the desktop simulator's rapid rate, so the phone and the desktop quote the same cycle time. It is
 * still an estimate (no acceleration, no machine rapid override) and is labelled as one in the UI.
 * Everything here is pure so playback can be tested without a device.
 */

import type { Bounds } from "./preview-math"

export interface SimSegment {
  readonly kind: "rapid" | "linear" | "circular"
  readonly line: number
  readonly from: readonly [number, number, number]
  readonly to: readonly [number, number, number]
}

/**
 * Rapid traverse, units per minute: mirrors `RAPID_FEEDRATE_MM_MIN` in `packages/core/src/cam/viewer/toolpath.ts`
 * (the phone bundle does not import `@cadcamfun/core`; `test/preview-sim.test.ts` keeps the two equal).
 */
export const RAPID_FEEDRATE_MM_MIN = 1_000
export const DEFAULT_RAPID_FEED = RAPID_FEEDRATE_MM_MIN

/** A cutting move before any `F` word runs at the desktop's `DEFAULT_CUTTING_FEEDRATE_MM_MIN`. */
export const DEFAULT_CUTTING_FEEDRATE_MM_MIN = 500
export const FALLBACK_CUT_FEED = DEFAULT_CUTTING_FEEDRATE_MM_MIN

/** Playback multipliers offered in the simulation bar. */
export const PLAYBACK_SPEEDS = [1, 5, 25, 100] as const

/**
 * Largest spin the preview shows, display revolutions per second: mirrors `MAX_DISPLAY_REV_PER_SECOND`
 * in `packages/core/src/cam/viewer/frames.ts` (faster would alias at 60 frames per second).
 */
export const MAX_DISPLAY_REV_PER_SECOND = 2

/** A run of equal display spin of the machine block: from `segment` on, `rate` signed revolutions per second. */
export interface SpinRun {
  readonly segment: number
  readonly rate: number
}

/**
 * The display spin in effect on `playhead`: the last run that starts at or before it, zero before the first run
 * and whenever the simulation is not running (a paused preview holds the spindle still). Non-finite or
 * out-of-range rates from the wire are clamped, never handed to the native view.
 */
export const spinRateAt = (spin: readonly SpinRun[], playhead: number, simulating: boolean): number => {
  if (!simulating) return 0
  const at = Number.isFinite(playhead) ? playhead : 0
  let best: SpinRun | undefined
  for (const run of spin) {
    if (run.segment > at) continue
    if (best === undefined || run.segment >= best.segment) best = run
  }
  if (best === undefined) return 0
  const rate = Math.max(-MAX_DISPLAY_REV_PER_SECOND, Math.min(MAX_DISPLAY_REV_PER_SECOND, best.rate))
  return Number.isFinite(rate) ? rate : 0
}

/**
 * ISO 6983 sense of `rate`, as `cam.viewer.spinSense` reads it: a mill runs clockwise at a negative display rate
 * (about +Z), a lathe clockwise at a positive one (about +x). A printer has no spindle.
 */
export const spinIsClockwise = (kind: "mill" | "lathe" | "3dprinter", rate: number): boolean =>
  kind === "lathe" ? rate > 0 : kind === "mill" ? rate < 0 : false

const FEED_WORD = /(?:^|[^A-Z])F\s*([+-]?(?:\d+\.?\d*|\.\d+))/i

/** Strip `( … )` and `; …` comments so a feed in a comment is not read as a command. */
const stripComments = (line: string): string => line.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "")

/**
 * Modal feed in effect on each line, 1-based like the listing (index 0 unused).
 * `undefined` until the program sets a positive feed.
 *
 * The program is scanned line by line instead of being split into an array: a big program holds hundreds of
 * thousands of lines, and the phone must not pay for a copy of every one of them.
 */
export const modalFeeds = (gcode: string): Array<number | undefined> => {
  const feeds: Array<number | undefined> = [undefined]
  let feed: number | undefined
  let start = 0
  for (;;) {
    const end = gcode.indexOf("\n", start)
    const raw = end < 0 ? gcode.slice(start) : gcode.slice(start, end)
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw
    const match = FEED_WORD.exec(stripComments(line))
    if (match) {
      const value = Number(match[1])
      if (Number.isFinite(value) && value > 0) feed = value
    }
    feeds.push(feed)
    if (end < 0) break
    start = end + 1
  }
  return feeds
}

const segmentLength = (segment: SimSegment): number =>
  Math.hypot(segment.to[0] - segment.from[0], segment.to[1] - segment.from[1], segment.to[2] - segment.from[2])

/** Seconds per segment from its length and the feed in effect on its line. */
export const segmentDurations = (
  segments: readonly SimSegment[],
  feeds: ReadonlyArray<number | undefined>,
  rapidFeed = DEFAULT_RAPID_FEED,
): Float64Array => {
  const out = new Float64Array(segments.length)
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!
    const length = segmentLength(segment)
    const feed = segment.kind === "rapid" ? rapidFeed : feeds[segment.line] ?? FALLBACK_CUT_FEED
    out[index] = Number.isFinite(length) && feed > 0 ? (length / feed) * 60 : 0
  }
  return out
}

/** `ends[i]` is the simulated time at which segment `i` finishes. */
export const cumulativeTimes = (durations: ArrayLike<number>): Float64Array => {
  const out = new Float64Array(durations.length)
  let total = 0
  for (let index = 0; index < durations.length; index++) {
    total += durations[index]!
    out[index] = total
  }
  return out
}

/** Segment running at time `t`: the first whose end is after `t`, clamped to the program. */
export const indexAtTime = (ends: ArrayLike<number>, t: number): number => {
  if (ends.length === 0) return 0
  if (!(t > 0)) return 0
  let low = 0
  let high = ends.length - 1
  if (t >= ends[high]!) return high
  while (low < high) {
    const mid = (low + high) >> 1
    if (ends[mid]! > t) high = mid
    else low = mid + 1
  }
  return low
}

/** Time at which segment `index` starts, so a scrub resumes playback from that block. */
export const startTimeOf = (ends: ArrayLike<number>, index: number): number =>
  index <= 0 || ends.length === 0 ? 0 : ends[Math.min(index, ends.length) - 1]!

export interface PathTotals {
  readonly cutLength: number
  readonly rapidLength: number
  readonly seconds: number
}

export const pathTotals = (segments: readonly SimSegment[], durations: ArrayLike<number>): PathTotals => {
  let cutLength = 0
  let rapidLength = 0
  let seconds = 0
  for (let index = 0; index < segments.length; index++) {
    const length = segmentLength(segments[index]!)
    if (segments[index]!.kind === "rapid") rapidLength += length
    else cutLength += length
    seconds += durations[index] ?? 0
  }
  return { cutLength, rapidLength, seconds }
}

/** `1:05:09`, `12:04`, `0:07`. */
export const formatDuration = (seconds: number): string => {
  const whole = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`
}

/** Edge lengths of the bounds, never negative. */
export const boundsSize = (bounds: Bounds): [number, number, number] => [
  Math.max(0, bounds.max[0] - bounds.min[0]),
  Math.max(0, bounds.max[1] - bounds.min[1]),
  Math.max(0, bounds.max[2] - bounds.min[2]),
]

/** Compact length: three significant digits for small parts, whole units for large ones. */
export const formatLength = (value: number): string => {
  if (!Number.isFinite(value)) return "–"
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  return value.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

/** `120 × 80 × 25 mm`. The desktop kernel works in millimetres. */
export const formatSize = (bounds: Bounds, unit = "mm"): string =>
  `${boundsSize(bounds).map(formatLength).join(" × ")} ${unit}`

/** Axis-aligned bounds of one part's triangles, or undefined for an empty or out-of-range span. */
export const partBounds = (
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  part: { readonly triangleStart: number; readonly triangleCount: number },
): Bounds | undefined => {
  const vertices = Math.floor(positions.length / 3)
  const start = Math.max(0, Math.trunc(part.triangleStart)) * 3
  const end = Math.min(indices.length, start + Math.max(0, Math.trunc(part.triangleCount)) * 3)
  let found = false
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = start; i < end; i++) {
    const vertex = indices[i]!
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= vertices) continue
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[vertex * 3 + axis]!
      if (!Number.isFinite(value)) continue
      if (value < min[axis]!) min[axis] = value
      if (value > max[axis]!) max[axis] = value
    }
    found = true
  }
  return found && min.every(Number.isFinite) && max.every(Number.isFinite) ? { min, max } : undefined
}
