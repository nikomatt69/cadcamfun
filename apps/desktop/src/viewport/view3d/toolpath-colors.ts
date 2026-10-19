/**
 * The toolpath's line buffers in the colour mode the user picks (spec 32 §4.4): by tool, by operation, by what each move is
 * for (Fusion / hyperMILL move colours), by feed or by height. Pure: positions and colours as typed arrays with each
 * segment's start time, so `View3D` draws one line object for the cuts and one for the rapids and shows "only what has run"
 * by a draw range, with no rebuild while playing.
 */
import { cam, type Vec3 } from "@cadcamfun/core"
import type { Playback } from "./playback.ts"

export type ColorMode = "tool" | "operation" | "move" | "feed" | "z"
export const COLOR_MODES: ReadonlyArray<ColorMode> = ["tool", "operation", "move", "feed", "z"]

export interface LineBuffer {
  /** xyz of both ends of every segment. */
  readonly positions: Float32Array
  /** rgb of both ends (absent for the rapids, drawn in one colour). */
  readonly colors?: Float32Array
  /** Start time of every segment, ascending (segments are in playback order). */
  readonly starts: Float64Array
}

export interface LegendEntry { readonly label: string; readonly color: number }

export interface PathBuffers { readonly cut: LineBuffer; readonly rapid: LineBuffer; readonly legend: ReadonlyArray<LegendEntry> }

export interface PathBufferInput {
  readonly mode: ColorMode
  /** Tool id -> colour (`toolColors`). */
  readonly toolColors: ReadonlyMap<string, number>
  /** The class of the move a segment belongs to (move mode). */
  readonly classOf?: (path: number, index: number) => cam.viewer.MoveClass | undefined
  /** Operation names by toolpath index, for the legend. */
  readonly operationNames?: ReadonlyArray<string>
  /** Toolpaths not drawn (the operation browser's eye). */
  readonly hidden?: ReadonlySet<number>
  /** Program point -> display point (lathe mapping, rotary part frame). */
  readonly shown: (p: Vec3, path: number, index: number) => Vec3
}

/** The colour of operation `i` (the tool palette, so a one-operation program keeps its colour). */
export const operationColor = (i: number, palette: ReadonlyArray<number>): number => palette[i % palette.length]!

const rgb = (c: number): readonly [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]
/** Blue (low) -> green -> red (high), the usual CAM ramp. */
export const rampColor = (f: number): number => {
  const t = Math.max(0, Math.min(1, f))
  const h = (1 - t) * 0.66
  const s = 0.85, l = 0.55
  const k = (n: number) => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const ch = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  return (ch(0) << 16) | (ch(8) << 8) | ch(4)
}

export const pathBuffers = (playback: Playback, input: PathBufferInput, palette: ReadonlyArray<number>): PathBuffers => {
  const all = playback.segments
  const shownSegment = (s: Playback["segments"][number]) => input.hidden === undefined || !input.hidden.has(s.path)
  // The ranges the feed and height ramps span, and the size of each buffer (filled in place: a million moves stay cheap).
  let fMin = Infinity, fMax = -Infinity, zMin = Infinity, zMax = -Infinity
  const feedOf = (s: Playback["segments"][number]): number => {
    const length = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y, s.to.z - s.from.z)
    return s.duration > 0 ? (length / s.duration) * 60 : 0
  }
  const asRapid = (s: Playback["segments"][number]): boolean => {
    if (!s.rapid) return false
    if (input.mode !== "move") return true
    const klass = input.classOf?.(s.path, s.index)
    return klass === "rapid" || klass === undefined
  }
  let cuts = 0, rapids = 0
  for (const s of all) {
    if (!shownSegment(s)) continue
    if (asRapid(s)) { rapids++; continue }
    cuts++
    if (s.rapid) continue
    const f = feedOf(s)
    if (f > 0) { if (f < fMin) fMin = f; if (f > fMax) fMax = f }
    zMin = Math.min(zMin, s.from.z, s.to.z); zMax = Math.max(zMax, s.from.z, s.to.z)
  }
  const colorOf = (s: Playback["segments"][number]): number => {
    switch (input.mode) {
      case "tool": return input.toolColors.get(s.toolId) ?? 0x38bdf8
      case "operation": return operationColor(s.path, palette)
      case "move": return cam.viewer.MOVE_CLASS_COLORS[input.classOf?.(s.path, s.index) ?? "cut"]
      case "feed": return rampColor(fMax > fMin ? (feedOf(s) - fMin) / (fMax - fMin) : 0.5)
      case "z": return rampColor(zMax > zMin ? ((s.from.z + s.to.z) / 2 - zMin) / (zMax - zMin) : 0.5)
    }
  }
  const cut = new Float32Array(cuts * 6), cutColors = new Float32Array(cuts * 6), cutStarts = new Float64Array(cuts)
  const rapid = new Float32Array(rapids * 6), rapidStarts = new Float64Array(rapids)
  const rgbCache = new Map<number, readonly [number, number, number]>()
  const used = new Map<string, number>()
  let c = 0, r = 0
  for (const s of all) {
    if (!shownSegment(s)) continue
    const a = input.shown(s.from, s.path, s.index), b = input.shown(s.to, s.path, s.index)
    if (asRapid(s)) {
      rapid[r * 6] = a.x; rapid[r * 6 + 1] = a.y; rapid[r * 6 + 2] = a.z; rapid[r * 6 + 3] = b.x; rapid[r * 6 + 4] = b.y; rapid[r * 6 + 5] = b.z
      rapidStarts[r++] = s.start
      if (input.mode === "move") used.set("rapid", cam.viewer.MOVE_CLASS_COLORS.rapid)
      continue
    }
    const color = colorOf(s)
    let rgbOf = rgbCache.get(color)
    if (rgbOf === undefined) { rgbOf = rgb(color); rgbCache.set(color, rgbOf) }
    const o = c * 6
    cut[o] = a.x; cut[o + 1] = a.y; cut[o + 2] = a.z; cut[o + 3] = b.x; cut[o + 4] = b.y; cut[o + 5] = b.z
    cutColors[o] = cutColors[o + 3] = rgbOf[0]; cutColors[o + 1] = cutColors[o + 4] = rgbOf[1]; cutColors[o + 2] = cutColors[o + 5] = rgbOf[2]
    cutStarts[c++] = s.start
    if (input.mode === "move") { const klass = input.classOf?.(s.path, s.index) ?? "cut"; if (!used.has(klass)) used.set(klass, color) }
    else if (input.mode === "operation") { const name = input.operationNames?.[s.path] ?? `#${s.path + 1}`; if (!used.has(name)) used.set(name, color) }
    else if (input.mode === "tool" && !used.has(s.toolId)) used.set(s.toolId, color)
  }
  let legend: LegendEntry[]
  if (input.mode === "feed") legend = fMax >= fMin ? [{ label: `${Math.round(fMin)} mm/min`, color: rampColor(0) }, { label: `${Math.round(fMax)} mm/min`, color: rampColor(1) }] : []
  else if (input.mode === "z") legend = zMax >= zMin ? [{ label: `Z ${Math.round(zMin * 100) / 100}`, color: rampColor(0) }, { label: `Z ${Math.round(zMax * 100) / 100}`, color: rampColor(1) }] : []
  else if (input.mode === "move") legend = cam.viewer.MOVE_CLASSES.filter((k) => used.has(k)).map((k) => ({ label: k, color: used.get(k)! }))
  else legend = [...used].map(([label, color]) => ({ label, color }))
  return { cut: { positions: cut, colors: cutColors, starts: cutStarts }, rapid: { positions: rapid, starts: rapidStarts }, legend }
}

/** A class lookup by toolpath and move index (no string keys: a million moves). */
export const classLookup = (timeline: cam.viewer.Timeline, classes: ReadonlyArray<cam.viewer.MoveClass>): ((path: number, index: number) => cam.viewer.MoveClass | undefined) => {
  const byPath: Array<Array<cam.viewer.MoveClass>> = []
  timeline.moves.forEach((m, i) => { (byPath[m.path] ??= [])[m.index] = classes[i]! })
  return (path, index) => byPath[path]?.[index]
}

/** How many segments of a buffer have started by `seconds` (the draw range of the "only what has run" view). */
export const startedBy = (starts: Float64Array, seconds: number): number => {
  let lo = 0, hi = starts.length
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (starts[mid]! <= seconds) lo = mid + 1; else hi = mid }
  return lo
}
