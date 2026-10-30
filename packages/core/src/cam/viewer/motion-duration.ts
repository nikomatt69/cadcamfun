import type { Vec3 } from "../../cad/vec.ts"
import { SPINDLE_ORIENT_SECONDS, isControlNode, moveLength, type Move, type Rotary } from "../ir.ts"

/** Assumed rotary ceiling for preview timing, degrees/minute; not a controller cycle-time estimate. */
export const PREVIEW_ROTARY_RATE = 3600

export const anglesAfter = (move: Move, before: Rotary): Rotary => {
  const r = move._tag === "Orient" ? move : move._tag === "Rapid" || move._tag === "Linear" ? move.rotary : undefined
  return r === undefined ? before : { ...before, ...(r.a !== undefined ? { a: r.a } : {}), ...(r.b !== undefined ? { b: r.b } : {}), ...(r.c !== undefined ? { c: r.c } : {}) }
}

/** Shared clock for the pure timeline and packed viewport playback, including stationary indexing. */
export const previewMoveDuration = (move: Move, from: Vec3, before: Rotary, after: Rotary, rapidRate: number): number => {
  if (move._tag === "Dwell") return move.seconds
  if (move._tag === "SpindleOrient") return SPINDLE_ORIENT_SECONDS
  if (move._tag === "Comment" || move._tag === "Cycle" || isControlNode(move)) return 0
  const swing = Math.max(...(["a", "b", "c"] as const).map((k) => Math.abs((after[k] ?? 0) - (before[k] ?? 0))))
  if (move._tag === "Orient") return swing / PREVIEW_ROTARY_RATE * 60
  const length = moveLength(move, from)
  const linear = length / Math.max(1e-6, move._tag === "Rapid" ? rapidRate : move.feed) * 60
  const rotaryRate = length < 1e-9 && move._tag !== "Rapid" ? Math.min(PREVIEW_ROTARY_RATE, Math.max(1e-6, move.feed)) : PREVIEW_ROTARY_RATE
  return Math.max(linear, swing / rotaryRate * 60)
}
