/**
 * Simultaneous five-axis toolpaths in the frame the output needs (spec 72 P4-6, TCP on posted programs).
 *
 * A toolpath that turns the rotary axes with the linear moves is in one of two frames (`five-axis.ts`): part coordinates when the
 * control keeps the tool tip itself (`kinematic.tcp === "control"`: G43.4, TRAORI, M128, G234), machine coordinates when the program
 * does (`"program"`: the table has turned, so the tip is `R (p - pivot) + pivot`). The post decides which frame it writes:
 *
 *   TCP on   the dialect has a tip-control word: the linear words are the tip in part coordinates, the word is written;
 *   TCP off  the linear words are machine-axis positions after the table turned, no word is written.
 *
 * When the toolpath's frame is not the output's, every point is carried across with the rotary angles that are in force at it (the
 * angles are modal, a move that names none keeps the last). A straight line between two such points is not the same path in both
 * frames when the angle changes, so a move that turns an axis is split at the parameters where the chord leaves the true path by more
 * than `tolerance`; the true path is the one the input frame's control interpolates (linear in its own words and angles).
 *
 * Feed. Every written move knows how long it takes at the tool tip (`tipMinutes`: the chord of the tip path over the programmed feed,
 * lengthened to the time the slowest rotary axis needs at `rotaryMaxRate`). The feed word is that move's tip feed, reduced by the same
 * ratio when an axis limits it; with inverse-time feed the writer states 1 / minutes instead, which is the only feed word that means
 * the same thing in both frames. Without it, the tip speed of a machine-coordinate move depends on how the control feeds rotary axes
 * (FGROUP on Siemens, the vector with degrees as millimetres on Fanuc) and is not corrected here.
 *
 * Not covered: a head that tilts (the pivot moves with the tool length), arcs and cycles while the axes stand tilted (refused, never
 * approximated), rotary-axis shortest-path wrap (the angles are written as given).
 */
import type { Vec3 } from "../../cad/vec.ts"
import { partToMachine, tableRotation, type RotaryAngles } from "../indexing.ts"
import type { FiveAxisKinematic } from "../five-axis.ts"
import type { Move, Program, Rotary, Toolpath } from "../ir.ts"
import type { Dialect, PostOptions } from "./types.ts"

const tipMinutes = new WeakMap<object, number>()

/** Minutes the written move takes at the tool tip (set by {@link prepareFiveAxis}), for the writer's inverse-time feed. */
export const tipMinutesOf = (move: Move): number | undefined => tipMinutes.get(move)

type Held = { a?: number; b?: number; c?: number }

const carriesRotary = (m: Move): boolean => (m._tag === "Rapid" || m._tag === "Linear") && m.rotary !== undefined
const merged = (held: Held, r: Rotary | undefined): Held => ({ ...held, ...(r?.a !== undefined ? { a: r.a } : {}), ...(r?.b !== undefined ? { b: r.b } : {}), ...(r?.c !== undefined ? { c: r.c } : {}) })
const angles = (h: Held): RotaryAngles => ({ ...(h.a !== undefined ? { a: h.a } : {}), ...(h.b !== undefined ? { b: h.b } : {}), c: h.c ?? 0 })
const tilted = (h: Held): boolean => (h.a ?? 0) !== 0 || (h.b ?? 0) !== 0 || (h.c ?? 0) !== 0
const lerp = (p: Vec3, q: Vec3, t: number): Vec3 => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t })
const lerpHeld = (p: Held, q: Held, t: number): Held => ({
  ...(p.a !== undefined || q.a !== undefined ? { a: (p.a ?? 0) + ((q.a ?? 0) - (p.a ?? 0)) * t } : {}),
  ...(p.b !== undefined || q.b !== undefined ? { b: (p.b ?? 0) + ((q.b ?? 0) - (p.b ?? 0)) * t } : {}),
  c: (p.c ?? 0) + ((q.c ?? 0) - (p.c ?? 0)) * t
})
const dist = (p: Vec3, q: Vec3): number => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
const rotaryOf = (h: Held, layout: FiveAxisKinematic["layout"]): Rotary => (layout === "table-AC" ? { a: h.a ?? 0, c: h.c ?? 0 } : { b: h.b ?? 0, c: h.c ?? 0 })

/** Largest angle change over the axes, degrees. */
const turn = (p: Held, q: Held): number => Math.max(Math.abs((q.a ?? 0) - (p.a ?? 0)), Math.abs((q.b ?? 0) - (p.b ?? 0)), Math.abs((q.c ?? 0) - (p.c ?? 0)))

/** Part point of a machine position at these angles (the table's inverse rotation about the pivot). */
export const machineToPart = (point: Vec3, h: Held, k: FiveAxisKinematic): Vec3 => {
  const m = tableRotation(angles(h), k.layout)
  const d = { x: point.x - k.pivot.x, y: point.y - k.pivot.y, z: point.z - k.pivot.z }
  // The rotation matrix is orthonormal: its inverse is its transpose.
  return {
    x: m[0] * d.x + m[3] * d.y + m[6] * d.z + k.pivot.x,
    y: m[1] * d.x + m[4] * d.y + m[7] * d.z + k.pivot.y,
    z: m[2] * d.x + m[5] * d.y + m[8] * d.z + k.pivot.z
  }
}

/** Machine position of a part point at these angles. */
export const partToMachinePoint = (point: Vec3, h: Held, k: FiveAxisKinematic): Vec3 => partToMachine(point, angles(h), k.layout, k.pivot)

/** Whether the written program carries the tool tip in part coordinates under a tip-control word. */
export const resolveTcp = (options: Partial<PostOptions>, dialect: Dialect): boolean => {
  const k = options.kinematics
  if (k === undefined) return options.tcp !== false && dialect.tcp !== undefined
  const wanted = options.tcp ?? k.tcp === "control"
  if (wanted && dialect.tcp === undefined) {
    if (options.tcp === true) throw new RangeError(`${dialect.id}: this control has no tool-centre-point word; post with tcp: false (machine coordinates)`)
    return false
  }
  return wanted
}

const MAX_DEPTH = 12

/**
 * The program with every simultaneous move written in the output frame, the feed limited by the rotary axes, and the options the writer
 * has to use (`tcp` made explicit). Without `options.kinematics` the program is returned as it is (and `rotaryMaxRate` /
 * `inverseTimeFeed` are refused: without the machine there is no tip path to measure).
 */
export const prepareFiveAxis = (program: Program, options: Partial<PostOptions>, dialect: Dialect): { readonly program: Program; readonly options: Partial<PostOptions> } => {
  const k = options.kinematics
  if (options.rotaryMaxRate !== undefined && !(Number.isFinite(options.rotaryMaxRate) && options.rotaryMaxRate > 0)) throw new RangeError("rotaryMaxRate must be a positive number of degrees per minute")
  if (k === undefined) {
    if (options.rotaryMaxRate !== undefined || options.inverseTimeFeed === true) throw new RangeError("rotaryMaxRate and inverseTimeFeed need options.kinematics: without the machine the tip path of a rotary move is not known")
    return { program, options }
  }
  if (options.inverseTimeFeed === true && dialect.inverseTime === undefined) throw new RangeError(`${dialect.id}: this control has no inverse-time feed word; post without inverseTimeFeed`)
  if (!program.toolpaths.some((tp) => tp.moves.some(carriesRotary))) return { program, options }
  const tcpOut = resolveTcp(options, dialect)
  const inPart = k.tcp === "control", outPart = tcpOut
  const convert = inPart !== outPart
  const tolerance = options.tolerance ?? 0.01
  const rate = options.rotaryMaxRate
  let held: Held = {}
  let prev: Vec3 | undefined

  /** Point in the output frame / in part coordinates, for the input-frame point `p` at angles `h`. */
  const toOut = (p: Vec3, h: Held): Vec3 => (!convert ? p : inPart ? partToMachinePoint(p, h, k) : machineToPart(p, h, k))
  const toPart = (p: Vec3, h: Held): Vec3 => (inPart ? p : machineToPart(p, h, k))

  const prepared = program.toolpaths.map((tp): Toolpath => {
    const moves: Move[] = []
    for (const move of tp.moves) {
      if (move._tag === "Rapid" || move._tag === "Linear") {
        const next = merged(held, move.rotary)
        if (move.rotary !== undefined) {
          const bad = k.layout === "table-AC" ? move.rotary.b : move.rotary.a
          if (bad !== undefined) throw new RangeError(`Toolpath "${tp.name}" turns the ${k.layout === "table-AC" ? "B" : "A"} axis, which a ${k.layout} machine does not have`)
        }
        const explicit = outPart && (tilted(next) || move.rotary !== undefined)
        if (move._tag === "Rapid") {
          const to = toOut(move.to, next)
          moves.push({ ...move, to, ...(explicit || move.rotary !== undefined ? { rotary: rotaryOf(next, k.layout) } : {}) })
          held = next
          prev = move.to
          continue
        }
        // A feed move: split where the output frame's straight line leaves the input frame's path, then limit the feed by the axes.
        const from = prev, h0 = held
        const turns = turn(h0, next) > 1e-12
        const pieces: Array<{ readonly t: number }> = []
        if (convert && turns && from !== undefined) {
          const sample = (t: number): Vec3 => toOut(lerp(from, move.to, t), lerpHeld(h0, next, t))
          const split = (t0: number, t1: number, depth: number): void => {
            const a = sample(t0), b = sample(t1)
            let worst = 0
            for (const f of [0.25, 0.5, 0.75]) {
              const t = t0 + (t1 - t0) * f
              worst = Math.max(worst, dist(sample(t), lerp(a, b, f)))
            }
            if (worst <= tolerance) { pieces.push({ t: t1 }); return }
            if (depth >= MAX_DEPTH) throw new RangeError(`Toolpath "${tp.name}": a move that turns the rotary axes cannot be written within ${tolerance} mm in this frame (split at depth ${MAX_DEPTH}): reduce the angle step of the toolpath`)
            const mid = (t0 + t1) / 2
            split(t0, mid, depth + 1)
            split(mid, t1, depth + 1)
          }
          split(0, 1, 0)
        } else pieces.push({ t: 1 })
        let t0 = 0
        for (const { t: t1 } of pieces) {
          const pIn1 = lerp(from ?? move.to, move.to, from === undefined ? 1 : t1)
          const pIn0 = lerp(from ?? move.to, move.to, from === undefined ? 1 : t0)
          const h1 = from === undefined ? next : lerpHeld(h0, next, t1), hh0 = from === undefined ? next : lerpHeld(h0, next, t0)
          const tipLength = dist(toPart(pIn0, hh0), toPart(pIn1, h1))
          const linMinutes = tipLength > 1e-9 ? tipLength / move.feed : 0
          const rotMinutes = rate !== undefined ? turn(hh0, h1) / rate : 0
          const minutes = Math.max(linMinutes, rotMinutes)
          const feed = tipLength > 1e-9 && minutes > linMinutes ? move.feed * (linMinutes / minutes) : move.feed
          const piece: Move = {
            _tag: "Linear", to: toOut(pIn1, h1), feed,
            ...(explicit || move.rotary !== undefined ? { rotary: rotaryOf(h1, k.layout) } : {}),
            ...(move.expr !== undefined ? { expr: move.expr } : {})
          }
          if (minutes > 0) tipMinutes.set(piece, minutes)
          else if (options.inverseTimeFeed === true && turns) throw new RangeError(`Toolpath "${tp.name}": a feed move that only turns the rotary axes has no tip time; set rotaryMaxRate`)
          moves.push(piece)
          t0 = t1
        }
        held = next
        prev = move.to
        continue
      }
      if (convert && tilted(held) && (move._tag === "Arc" || move._tag === "Cycle")) {
        throw new RangeError(`Toolpath "${tp.name}": a ${move._tag === "Arc" ? "circular move" : "canned cycle"} while the rotary axes stand at ${JSON.stringify(held)} cannot be carried between machine and part coordinates; write it with the rotary axes at 0`)
      }
      if (move._tag === "Arc") prev = move.to
      else if (move._tag === "Cycle") prev = { x: move.to.x, y: move.to.y, z: move.retractHeight }
      moves.push(move)
    }
    return { ...tp, moves }
  })
  return { program: { ...program, toolpaths: prepared }, options: { ...options, tcp: tcpOut } }
}
