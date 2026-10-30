import { cam, type Vec3 } from "@cadcamfun/core"
import { allocatePlaybackBuffer, BUFFER_VERSION, type PlaybackBuffer } from "@cadcamfun/buffer"

/**
 * The playback of a program: its segments as typed arrays, not as objects.
 *
 * A program is thousands to millions of segments, and one object per segment costs hundreds of megabytes of
 * heap. The segments live in the packed layout of `@cadcamfun/buffer`, so the same bytes can travel over the
 * wire and be drawn without a copy (spec 36 §3).
 */
export type Playback = PlaybackBuffer

/** An empty playback, for a program that is not there yet. */
export const emptyPlayback = (): Playback => {
  const writer = allocatePlaybackBuffer(0)
  const end = { x: 0, y: 0, z: 0 }
  return { version: BUFFER_VERSION, segmentCount: 0, views: writer.views, toolIds: writer.toolIds, duration: 0, end, bytes: writer.finalize(0, end) }
}

/** The number of chords an arc is drawn with: the sweep, at the chord height the tolerance allows. */
const arcChordCount = (from: Vec3, move: cam.ArcMove, tolerance: number): number => {
  const radius = Math.hypot(from.x - move.center.x, from.y - move.center.y)
  const sweep = cam.arcSweepBetween(from, move.to, move.center, move.clockwise)
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - Math.max(1e-6, tolerance) / Math.max(radius, 1e-6))))
  return Math.min(65536, Math.max(2, Math.ceil(sweep / Math.max(step, 1e-6))))
}

/** The tool ids of a program, in the order the program first uses them. */
const toolTable = (program: cam.Program): { readonly ids: readonly string[]; readonly index: ReadonlyMap<string, number> } => {
  const ids: string[] = []
  const index = new Map<string, number>()
  for (const path of program.toolpaths) {
    if (index.has(path.toolId)) continue
    index.set(path.toolId, ids.length)
    ids.push(path.toolId)
  }
  return { ids, index }
}

/** Rotary trajectories are curved in the part frame even when XYZ is stationary. */
const rotarySamples = (before: cam.Rotary, after: cam.Rotary): number => Math.min(4096, Math.max(1, Math.ceil(Math.max(...(["a", "b", "c"] as const).map((k) => Math.abs((after[k] ?? 0) - (before[k] ?? 0)))) / 2)))

/**
 * The program's segments, counted.
 *
 * The count has to be known before the buffer exists, so the program is walked twice: once to count, once to
 * fill. Both walks use the same helpers, and the filling walk refuses to write past the count, so a
 * divergence between the two is a loud failure rather than a corrupted buffer.
 */
const countSegments = (program: cam.Program, tolerance: number, start: Vec3): number => {
  let count = 0
  let from: Vec3 = start
  let angles: cam.Rotary = {}
  for (const path of program.toolpaths) {
    for (const move of cam.expandMoves(path.moves, from)) {
      if (move._tag === "Comment" || move._tag === "Cycle") continue
      const after = cam.viewer.anglesAfter(move, angles)
      const samples = rotarySamples(angles, after)
      angles = after
      if (move._tag === "Orient") { count += samples; continue }
      if (move._tag === "Dwell" || move._tag === "SpindleOrient") { count++; continue }
      if (cam.isControlNode(move)) continue
      if (move._tag === "Arc") { count += arcChordCount(from, move, tolerance); from = move.to; continue }
      count += samples
      from = move.to
    }
  }
  return count
}

/**
 * The playback of a program: every move as a segment, every arc as its chords.
 *
 * `start` is where the machine is before the first move (the origin when not given, as before; see
 * `cam.viewer.programStart`).
 */
export const buildPlayback = (
  program: cam.Program,
  rapidRate = 5000,
  tolerance = 0.1,
  start: Vec3 = { x: 0, y: 0, z: 0 },
): Playback => {
  const tools = toolTable(program)
  const segmentCount = countSegments(program, tolerance, start)
  const writer = allocatePlaybackBuffer(segmentCount, tools.ids)
  const { views } = writer
  let index = 0
  let from: Vec3 = start
  let time = 0
  let angles: cam.Rotary = {}
  const write = (
    segmentFrom: Vec3,
    segmentTo: Vec3,
    rapid: boolean,
    duration: number,
    path: number,
    move: number,
    tool: number,
    end?: number,
  ): void => {
    if (index >= segmentCount) throw new RangeError("the playback has more segments than it counted")
    const at = index * 3
    views.starts[index] = time
    views.durations[index] = end !== undefined ? end - time : duration
    views.from[at] = segmentFrom.x; views.from[at + 1] = segmentFrom.y; views.from[at + 2] = segmentFrom.z
    views.to[at] = segmentTo.x; views.to[at + 1] = segmentTo.y; views.to[at + 2] = segmentTo.z
    views.pathIndex[index] = path
    views.moveIndex[index] = move
    views.toolIndex[index] = tool
    views.rapid[index] = rapid ? 1 : 0
    index++
    time = end ?? time + duration
  }
  for (const [path, toolpath] of program.toolpaths.entries()) {
    const tool = tools.index.get(toolpath.toolId) ?? 0
    for (const [move, entry] of cam.expandMoves(toolpath.moves, from).entries()) {
      if (entry._tag === "Comment" || entry._tag === "Cycle" || cam.isControlNode(entry)) continue
      const after = cam.viewer.anglesAfter(entry, angles)
      const moveStart = time
      const duration = cam.viewer.previewMoveDuration(entry, from, angles, after, rapidRate)
      const samples = rotarySamples(angles, after)
      angles = after
      if (entry._tag === "Orient") { for (let i = 1; i <= samples; i++) write(from, from, true, duration / samples, path, move, tool, moveStart + duration * (i / samples)); continue }
      if (entry._tag === "Dwell") { write(from, from, false, entry.seconds, path, move, tool); continue }
      // Spindle orientation: the tool stands still for the beat the clock gives it.
      if (entry._tag === "SpindleOrient") { write(from, from, false, duration, path, move, tool); continue }
      if (entry._tag !== "Arc") {
        const origin = from
        for (let i = 1; i <= samples; i++) {
          const f = i / samples
          const to = i === samples ? entry.to : { x: origin.x + (entry.to.x - origin.x) * f, y: origin.y + (entry.to.y - origin.y) * f, z: origin.z + (entry.to.z - origin.z) * f }
          write(from, to, entry._tag === "Rapid", duration / samples, path, move, tool, samples > 1 ? moveStart + duration * f : undefined)
          from = to
        }
        continue
      }
      const origin = from
      const radius = Math.hypot(from.x - entry.center.x, from.y - entry.center.y)
      const sweep = cam.arcSweepBetween(from, entry.to, entry.center, entry.clockwise)
      const angle = Math.atan2(from.y - entry.center.y, from.x - entry.center.x)
      const count = arcChordCount(from, entry, tolerance)
      for (let i = 1; i <= count; i++) {
        const t = i / count, a = angle + (entry.clockwise ? -1 : 1) * sweep * t
        const to = i === count
          ? entry.to
          : { x: entry.center.x + radius * Math.cos(a), y: entry.center.y + radius * Math.sin(a), z: origin.z + (entry.to.z - origin.z) * t }
        write(from, to, false, duration / count, path, move, tool, moveStart + duration * t)
        from = to
      }
    }
  }
  const bytes = writer.finalize(time, from)
  return { version: BUFFER_VERSION, segmentCount, views, toolIds: writer.toolIds, duration: time, end: from, bytes }
}

export interface PlaybackSegment {
  readonly from: Vec3
  readonly to: Vec3
  readonly rapid: boolean
  readonly start: number
  readonly duration: number
  readonly toolId: string
  readonly path: number
  readonly index: number
}

/** Materialize only the segment a consumer needs; no retained object-per-move array. */
export const playbackSegmentAt = (playback: Playback, index: number): PlaybackSegment | undefined => {
  if (!Number.isInteger(index) || index < 0 || index >= playback.segmentCount) return undefined
  const v = playback.views, at = index * 3
  return {
    from: { x: v.from[at]!, y: v.from[at + 1]!, z: v.from[at + 2]! },
    to: { x: v.to[at]!, y: v.to[at + 1]!, z: v.to[at + 2]! },
    rapid: v.rapid[index] === 1, start: v.starts[index]!, duration: v.durations[index]!,
    toolId: playback.toolIds[v.toolIndex[index]!] ?? "", path: v.pathIndex[index]!, index: v.moveIndex[index]!,
  }
}

export function* playbackSegments(playback: Playback): Generator<PlaybackSegment> {
  for (let i = 0; i < playback.segmentCount; i++) yield playbackSegmentAt(playback, i)!
}

/** Index of the segment playing at `seconds` (the segment count past the end); at a boundary, the one starting there. */
export const segmentIndexAt = (playback: Playback, seconds: number): number => {
  const time = Math.max(0, Math.min(playback.duration, seconds))
  const { starts, durations } = playback.views
  let lo = 0, hi = playback.segmentCount
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (starts[mid]! + durations[mid]! <= time) lo = mid + 1; else hi = mid }
  return lo
}

/** The tool in the spindle at `seconds`: the tool of the playing segment (the last one past the end). */
export const toolAt = (playback: Playback, seconds: number): string | undefined => {
  const index = segmentIndexAt(playback, seconds)
  const at = index < playback.segmentCount ? index : playback.segmentCount - 1
  if (at < 0) return undefined
  return playback.toolIds[playback.views.toolIndex[at]!]
}

export const positionAt = (playback: Playback, seconds: number): Vec3 => {
  const time = Math.max(0, Math.min(playback.duration, seconds))
  const index = segmentIndexAt(playback, seconds)
  if (index >= playback.segmentCount) return playback.end
  const { from, to, durations, starts } = playback.views
  const at = index * 3
  const duration = durations[index]!
  const t = duration > 0 ? Math.max(0, Math.min(1, (time - starts[index]!) / duration)) : 1
  return {
    x: from[at]! + (to[at]! - from[at]!) * t,
    y: from[at + 1]! + (to[at + 1]! - from[at + 1]!) * t,
    z: from[at + 2]! + (to[at + 2]! - from[at + 2]!) * t,
  }
}

/** Colours of the tools in a preview, in the order the program first uses them; the first is the single-tool colour. */
export const TOOL_COLORS: readonly number[] = [0x38bdf8, 0x22c55e, 0xf97316, 0xe879f9, 0xfacc15, 0xf43f5e, 0x2dd4bf, 0xa78bfa, 0x84cc16, 0xfb923c]

/** Tool id -> preview colour, by first use in the program (the same tool keeps its colour across operations). */
export const toolColors = (program: cam.Program): ReadonlyMap<string, number> => {
  const map = new Map<string, number>()
  for (const tp of program.toolpaths) if (!map.has(tp.toolId)) map.set(tp.toolId, TOOL_COLORS[map.size % TOOL_COLORS.length]!)
  return map
}

/** `#rrggbb` of a preview colour, for swatches in the UI. */
export const colorHex = (color: number): string => `#${color.toString(16).padStart(6, "0")}`
