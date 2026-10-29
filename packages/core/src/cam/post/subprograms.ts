/**
 * Subprograms from repeated toolpaths (spec 04 §4, spec 29 §10): the holes of a pattern, the copies of a pocket and a
 * counterbore at every bolt position are the same motion at another place. The planner finds the toolpaths whose motion is
 * another's translated and gives each group of them one subprogram.
 *
 * What counts as the same motion: after the first (positioning) move, the remaining moves are the same kinds in the same
 * order (rapid, feed move, arc, dwell), every end point and arc centre differs by the one translation that separates the two
 * positioning moves, the feeds and the senses of the arcs are equal. A toolpath with a canned cycle, a rotary word or a
 * positioned rotary axis is never a candidate: cycles are already one block per hole, and a rotary move is not a translation.
 *
 * The call goes right after the positioning move, which the main program writes as usual, so the subprogram starts where
 * the tool stands and is written incrementally: one text serves every copy.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { isControlNode, type ArcMove, type Move, type Program, type Toolpath } from "../ir.ts"

/** Moves two toolpaths must have after their positioning move to be worth a subprogram. */
export const MIN_BODY_MOVES = 6
/** Moves the calls must save in total (a copy replaces its body by one block). */
export const MIN_SAVED_MOVES = 12
/** Largest distance between corresponding points once translated, mm. Far below the 1 µm the output resolves. */
export const TRANSLATION_TOLERANCE = 5e-6
/**
 * Coarsest output unit (mm) at which any translation may share a body. A copy is written as the leader's rounded steps, so
 * its points can be a unit and a half off what the text of the copy alone would round to (1.5 µm at three metric decimals).
 * Output coarser than this (inches, two decimals) shares only translations that are whole multiples of the unit, where
 * rounding and translation commute and the copy is exactly its own text.
 */
export const FREE_TRANSLATION_UNIT = 0.0015

export interface SubprogramGroup {
  /** `O` number of the subprogram. */
  readonly number: number
  /** Toolpath whose motion is written out as the body. */
  readonly leader: number
  /** Toolpaths that call it, the leader included, in program order. */
  readonly members: ReadonlyArray<number>
}

export interface SubprogramCall {
  readonly group: number
  /** Index in `Toolpath.moves` of the positioning move after which the call is written. */
  readonly head: number
}

export interface SubprogramPlan {
  readonly groups: ReadonlyArray<SubprogramGroup>
  readonly callOf: ReadonlyMap<number, SubprogramCall>
}

/** A toolpath that can be a subprogram: where it is positioned, and the motion after that. */
export interface Candidate {
  readonly head: number
  readonly origin: Vec3
  readonly body: ReadonlyArray<Move>
}

const candidateOf = (toolpath: Toolpath): Candidate | undefined => {
  let head = -1
  const body: Move[] = []
  for (let i = 0; i < toolpath.moves.length; i++) {
    const m = toolpath.moves[i]!
    if (m._tag === "Comment") continue
    if (m._tag === "Cycle" || m._tag === "Orient" || isControlNode(m)) return undefined
    if ((m._tag === "Rapid" || m._tag === "Linear") && (m.rotary !== undefined || m.expr !== undefined)) return undefined
    if (head < 0) {
      if (m._tag !== "Rapid" && m._tag !== "Linear") return undefined
      head = i
      continue
    }
    body.push(m)
  }
  if (head < 0) return undefined
  const first = toolpath.moves[head]!
  if (first._tag !== "Rapid" && first._tag !== "Linear") return undefined
  return { head, origin: first.to, body }
}

/** Cheap grouping key: what must be equal before the geometry is compared. */
const keyOf = (c: Candidate): string => {
  const parts: string[] = [String(c.body.length)]
  for (const m of c.body) {
    switch (m._tag) {
      case "Rapid": parts.push("R"); break
      case "Linear": parts.push(`L${m.feed.toFixed(3)}`); break
      case "Arc": parts.push(`${m.clockwise ? "C" : "A"}${m.feed.toFixed(3)}`); break
      case "Dwell": parts.push(`D${m.seconds.toFixed(3)}`); break
      default: break
    }
  }
  return parts.join(" ")
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= TRANSLATION_TOLERANCE

/**
 * Whether `b` is `a` moved by the difference of their positioning moves. With a `unit` (mm per output step) coarser than
 * {@link FREE_TRANSLATION_UNIT} the move must also be a whole number of output steps on every axis.
 */
export const isTranslation = (a: Candidate, b: Candidate, unit = 0): boolean => {
  const t = { x: b.origin.x - a.origin.x, y: b.origin.y - a.origin.y, z: b.origin.z - a.origin.z }
  if (unit > FREE_TRANSLATION_UNIT && [t.x, t.y, t.z].some((v) => Math.abs(v / unit - Math.round(v / unit)) > 1e-4)) return false
  if (a.body.length !== b.body.length) return false
  for (let i = 0; i < a.body.length; i++) {
    const p = a.body[i]!, q = b.body[i]!
    if (p._tag !== q._tag) return false
    switch (p._tag) {
      case "Rapid":
      case "Linear": {
        const r = q as typeof p
        if (!near(r.to.x - p.to.x, t.x) || !near(r.to.y - p.to.y, t.y) || !near(r.to.z - p.to.z, t.z)) return false
        if (p._tag === "Linear" && !near((r as typeof p & { feed: number }).feed, p.feed)) return false
        break
      }
      case "Arc": {
        const r = q as ArcMove
        if (r.clockwise !== p.clockwise || !near(r.feed, p.feed)) return false
        if (!near(r.to.x - p.to.x, t.x) || !near(r.to.y - p.to.y, t.y) || !near(r.to.z - p.to.z, t.z)) return false
        if (!near(r.center.x - p.center.x, t.x) || !near(r.center.y - p.center.y, t.y)) return false
        break
      }
      case "Dwell":
        if (!near((q as typeof p).seconds, p.seconds)) return false
        break
      default:
        return false
    }
  }
  return true
}

/**
 * Groups the toolpaths of a program whose motion repeats and numbers a subprogram for each group from `first` up to `last`.
 * A group is kept when its bodies are long enough and the calls save enough moves. `unit` is the output step in mm.
 */
export const planSubprograms = (program: Program, first: number, last: number, unit = 0): SubprogramPlan => {
  const candidates = program.toolpaths.map(candidateOf)
  const buckets = new Map<string, Array<{ readonly leader: number; readonly members: number[] }>>()
  candidates.forEach((c, index) => {
    if (c === undefined || c.body.length < MIN_BODY_MOVES) return
    const key = keyOf(c)
    const list = buckets.get(key) ?? []
    const group = list.find((g) => isTranslation(candidates[g.leader]!, c, unit))
    if (group !== undefined) group.members.push(index)
    else list.push({ leader: index, members: [index] })
    buckets.set(key, list)
  })
  const kept = [...buckets.values()].flat()
    .filter((g) => g.members.length >= 2 && (g.members.length - 1) * candidates[g.leader]!.body.length >= MIN_SAVED_MOVES)
    .sort((a, b) => a.leader - b.leader)
    .slice(0, Math.max(0, last - first + 1))
  const groups: SubprogramGroup[] = kept.map((g, i) => ({ number: first + i, leader: g.leader, members: g.members }))
  const callOf = new Map<number, SubprogramCall>()
  groups.forEach((g, gi) => { for (const m of g.members) callOf.set(m, { group: gi, head: candidates[m]!.head }) })
  return { groups, callOf }
}

/** The motion of a candidate toolpath, for the writer of the body: its positioning point and the moves after it. */
export const bodyOf = (toolpath: Toolpath): { readonly origin: Vec3; readonly body: ReadonlyArray<Move> } | undefined => {
  const c = candidateOf(toolpath)
  return c === undefined ? undefined : { origin: c.origin, body: c.body }
}
