import { cam, type Vec3 } from "@cadcamfun/core"

export interface PlaybackSegment {
  readonly from: Vec3
  readonly to: Vec3
  readonly rapid: boolean
  readonly start: number
  readonly duration: number
  /** The tool cutting it (the toolpath's `toolId`), so the preview can colour each tool. */
  readonly toolId: string
}
export interface Playback { readonly segments: readonly PlaybackSegment[]; readonly duration: number; readonly end: Vec3 }

export const buildPlayback = (program: cam.Program, rapidRate = 5000, tolerance = 0.1): Playback => {
  const segments: PlaybackSegment[] = []
  let from: Vec3 = { x: 0, y: 0, z: 0 }, time = 0
  let toolId = ""
  const append = (to: Vec3, rapid: boolean, duration: number) => {
    segments.push({ from, to, rapid, start: time, duration, toolId }); time += duration; from = to
  }
  for (const path of program.toolpaths) {
    toolId = path.toolId
    for (const move of cam.expandMoves(path.moves, from)) {
      if (move._tag === "Comment" || move._tag === "Orient") continue
      if (move._tag === "Dwell") { append(from, false, move.seconds); continue }
      if (move._tag === "Cycle") continue
      const duration = cam.moveLength(move, from) / Math.max(1e-6, move._tag === "Rapid" ? rapidRate : move.feed) * 60
      if (move._tag !== "Arc") { append(move.to, move._tag === "Rapid", duration); continue }
      const origin = from, radius = Math.hypot(from.x - move.center.x, from.y - move.center.y)
      const sweep = cam.arcSweepBetween(from, move.to, move.center, move.clockwise)
      const angle = Math.atan2(from.y - move.center.y, from.x - move.center.x)
      const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - Math.max(1e-6, tolerance) / Math.max(radius, 1e-6))))
      const count = Math.min(65536, Math.max(2, Math.ceil(sweep / Math.max(step, 1e-6))))
      for (let i = 1; i <= count; i++) {
        const t = i / count, a = angle + (move.clockwise ? -1 : 1) * sweep * t
        append(i === count ? move.to : { x: move.center.x + radius * Math.cos(a), y: move.center.y + radius * Math.sin(a), z: origin.z + (move.to.z - origin.z) * t }, false, duration / count)
      }
    }
  }
  return { segments, duration: time, end: from }
}

export const positionAt = (playback: Playback, seconds: number): Vec3 => {
  const time = Math.max(0, Math.min(playback.duration, seconds))
  let lo = 0, hi = playback.segments.length
  while (lo < hi) { const mid = (lo + hi) >>> 1; const s = playback.segments[mid]; if (s && s.start + s.duration < time) lo = mid + 1; else hi = mid }
  const s = playback.segments[lo]
  if (!s) return playback.end
  const t = s.duration > 0 ? Math.max(0, Math.min(1, (time - s.start) / s.duration)) : 1
  return { x: s.from.x + (s.to.x - s.from.x) * t, y: s.from.y + (s.to.y - s.from.y) * t, z: s.from.z + (s.to.z - s.from.z) * t }
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
