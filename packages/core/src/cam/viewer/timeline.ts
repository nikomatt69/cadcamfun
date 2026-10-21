/**
 * The program's moves on the playback clock (spec 31 §5.7): the same durations the viewport's playback uses (feed moves at
 * their feed, rapids at `rapidRate`, dwells their seconds, comments / orientations / cycles take none after expansion), with
 * the motion state of each move. The live turned profile, the printer deposits, the spindle angle and the setup checks all
 * read this one list, so what is drawn at time t is what the checks talk about.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { expandMoves, type Program } from "../ir.ts"
import { anglesAfter, previewMoveDuration } from "./motion-duration.ts"
import type { MachineKind } from "../machine.ts"
import { lerpAngles } from "./rotary.ts"
import { displaySpinRate, spinSense } from "./frames.ts"
import { stateAt, trackFor, type MotionState, type MotionTrack } from "./motion-track.ts"
import type { Angles as RotaryAngles } from "./rotary.ts"

export interface TimedMove {
  readonly path: number
  /** Index in `expandMoves(path.moves)` (the motion track's index). */
  readonly index: number
  readonly kind: "rapid" | "feed" | "dwell"
  readonly from: Vec3
  readonly to: Vec3
  /** Arc centre (XY), when the move is an arc. */
  readonly center?: { readonly x: number; readonly y: number }
  readonly clockwise?: boolean
  readonly start: number
  readonly duration: number
  readonly state: MotionState
  /** Rotary angles at the start and the end of the move (empty for a 3-axis program). */
  readonly anglesFrom: RotaryAngles
  readonly angles: RotaryAngles
  /** The IR move carries rotary words; imported programs may repeat modal angles. */
  readonly rotaryCommand?: boolean
}

export interface Timeline {
  readonly moves: ReadonlyArray<TimedMove>
  readonly duration: number
  readonly track: MotionTrack
}

export const DEFAULT_RAPID_RATE = 5000

/**
 * `start` is where the machine is before the first move (the program does not say; `programStart` gives a believable one per
 * machine). The origin when absent, as the playback always assumed.
 */
export const buildTimeline = (program: Program, track?: MotionTrack, rapidRate = DEFAULT_RAPID_RATE, start: Vec3 = { x: 0, y: 0, z: 0 }): Timeline => {
  const used = trackFor(program, track)
  const moves: TimedMove[] = []
  let from: Vec3 = start
  let time = 0
  let angles: RotaryAngles = {}
  program.toolpaths.forEach((path, p) => {
    expandMoves(path.moves, from).forEach((move, index) => {
      if (move._tag === "Comment" || move._tag === "Cycle") return
      const state = stateAt(used, p, index)
      const anglesFrom = angles
      angles = anglesAfter(move, angles)
      if (move._tag === "Orient") {
        const duration = previewMoveDuration(move, from, anglesFrom, angles, rapidRate)
        moves.push({ path: p, index, kind: "rapid", from, to: from, start: time, duration, state, anglesFrom, angles, rotaryCommand: true })
        time += duration
        return
      }
      if (move._tag === "Dwell") {
        moves.push({ path: p, index, kind: "dwell", from, to: from, start: time, duration: move.seconds, state, anglesFrom, angles })
        time += move.seconds
        return
      }
      const duration = previewMoveDuration(move, from, anglesFrom, angles, rapidRate)
      moves.push({
        path: p, index, kind: move._tag === "Rapid" ? "rapid" : "feed", from, to: move.to, start: time, duration, state, anglesFrom, angles,
        ...((move._tag === "Rapid" || move._tag === "Linear") && move.rotary !== undefined ? { rotaryCommand: true } : {}),
        ...(move._tag === "Arc" ? { center: move.center, clockwise: move.clockwise } : {})
      })
      time += duration
      from = move.to
    })
  })
  return { moves, duration: time, track: used }
}

/**
 * Index of the move playing at `seconds` (the move count past the end). At the instant one move ends and the next starts,
 * the next one plays: stepping to an operation's start shows that operation, its tool and its line.
 */
export const timedIndexAt = (timeline: Timeline, seconds: number): number => {
  const t = Math.max(0, Math.min(timeline.duration, seconds))
  let lo = 0, hi = timeline.moves.length
  while (lo < hi) { const mid = (lo + hi) >>> 1; const m = timeline.moves[mid]!; if (m.start + m.duration <= t) lo = mid + 1; else hi = mid }
  return lo
}

/** Point of a move at fraction `f` (arcs follow the arc in XY, the helix rise linearly). */
export const pointOn = (move: TimedMove, f: number): Vec3 => {
  const t = Math.max(0, Math.min(1, f))
  if (move.center === undefined) return { x: move.from.x + (move.to.x - move.from.x) * t, y: move.from.y + (move.to.y - move.from.y) * t, z: move.from.z + (move.to.z - move.from.z) * t }
  const c = move.center
  const r = Math.hypot(move.from.x - c.x, move.from.y - c.y)
  const a0 = Math.atan2(move.from.y - c.y, move.from.x - c.x)
  const a1 = Math.atan2(move.to.y - c.y, move.to.x - c.x)
  let sweep = move.clockwise ? a0 - a1 : a1 - a0
  sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  if (Math.hypot(move.to.x - move.from.x, move.to.y - move.from.y) < 1e-9 || sweep < 1e-12) sweep = 2 * Math.PI
  const a = a0 + (move.clockwise ? -1 : 1) * sweep * t
  return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), z: move.from.z + (move.to.z - move.from.z) * t }
}

/** Where the tool is at `seconds`, in program coordinates, with the state of that move. */
export const poseAt = (timeline: Timeline, seconds: number): { readonly point: Vec3; readonly state: MotionState | undefined; readonly move: TimedMove | undefined; readonly angles: RotaryAngles } => {
  const i = timedIndexAt(timeline, seconds)
  const move = timeline.moves[i] ?? timeline.moves[timeline.moves.length - 1]
  if (move === undefined) return { point: { x: 0, y: 0, z: 0 }, state: undefined, move: undefined, angles: {} }
  const f = i >= timeline.moves.length ? 1 : move.duration > 0 ? Math.max(0, Math.min(1, (Math.max(0, Math.min(timeline.duration, seconds)) - move.start) / move.duration)) : 1
  return { point: pointOn(move, f), state: move.state, move, angles: lerpAngles(move.anglesFrom, move.angles, f) }
}

/**
 * Where the machine believably is before the first move (spec 31 §9: the program does not say). A mill comes down onto
 * the first position from the program's highest Z; a lathe turret starts out at the largest X and Z the program uses; a
 * printer from its homed origin. Drawn as the first rapid, never checked as a cut.
 */
export const programStart = (kind: "mill" | "lathe" | "3dprinter", program: Program): Vec3 => {
  const targets: Vec3[] = []
  for (const path of program.toolpaths) for (const m of path.moves) if (m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Arc") targets.push(m.to)
  const first = targets[0]
  if (first === undefined || kind === "3dprinter") return { x: 0, y: 0, z: 0 }
  const maxZ = Math.max(...targets.map((p) => p.z))
  if (kind === "mill") return { x: first.x, y: first.y, z: Math.max(first.z, maxZ) }
  return { x: Math.max(...targets.map((p) => p.x)), y: 0, z: maxZ }
}

/**
 * Angle of what turns (mill: the tool; lathe: the part) at `seconds`, radians, signed about the display axis of `spinSense`.
 * A pure function of time: scrubbing back and forth lands on the same angle. The display rate is capped (`displaySpinRate`).
 */
export const spinTable = (timeline: Timeline, kind: MachineKind): Float64Array => {
  const cumulative = new Float64Array(timeline.moves.length + 1)
  timeline.moves.forEach((m, i) => {
    cumulative[i + 1] = cumulative[i]! + spinSense(kind, m.state.spindle) * displaySpinRate(m.state.rpm) * 2 * Math.PI * m.duration
  })
  return cumulative
}

export const spinAngleAt = (timeline: Timeline, kind: MachineKind, table: Float64Array, seconds: number): number => {
  const i = timedIndexAt(timeline, seconds)
  const move = timeline.moves[i]
  if (move === undefined) return table[timeline.moves.length] ?? 0
  const into = Math.max(0, Math.min(move.duration, Math.max(0, seconds) - move.start))
  return table[i]! + spinSense(kind, move.state.spindle) * displaySpinRate(move.state.rpm) * 2 * Math.PI * into
}
