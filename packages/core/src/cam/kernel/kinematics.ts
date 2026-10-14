/**
 * Machine kinematics of the CAM kernel (spec 29 §8): a trunnion table with a rotary C about Z and a tilt A (about X) or B
 * (about Y) on top of it, the layouts of `cam/indexing.ts`. The module answers, for a sequence of tool-axis directions in the
 * part:
 *
 *   forward   the rotation the table applies and where a part point lands in the machine (`partToMachine`);
 *   inverse   the candidate table angles that bring a direction to machine +Z, each with its residual, its branch, its
 *             singularity and C unwrapped to the nearest turn of the previous one (C is never normalised block by block: a
 *             position equal modulo 360 degrees can need a full turn);
 *   plan      the path through the candidates of every direction that minimises the rotary travel (A/B and C, in degrees),
 *             subject to the limits: a dynamic programme over the candidate graph, so a branch change that is cheap now but
 *             costly later is not taken greedily.
 *
 * Units: angles in degrees (the layouts of `indexing.ts`), positions in mm. Pure: same inputs, same answer.
 * Not covered: a tilting head (the pivot moves with the tool length), simultaneous motion between the samples (the caller
 * checks the interval, see `motion/` in spec 29 §12), and dynamic limits.
 */
import { length3, type Vec3 } from "../../cad/vec.ts"
import { anglesFor, partToMachine, tableRotation, type RotaryAngles, type RotaryLayout, type RotaryLimits } from "../indexing.ts"

export interface TableKinematic {
  readonly layout: RotaryLayout
  readonly limits: RotaryLimits
  /** Centre of rotation of the table in machine coordinates, mm. */
  readonly pivot: Vec3
}

/** Angles with C unwrapped to the turn nearest `previousC` (still within the C limits when one is given). */
export interface Candidate {
  readonly angles: RotaryAngles
  /** The tilt, A or B, degrees. */
  readonly tilt: number
  /** C of the candidate, unwrapped, degrees. */
  readonly c: number
  /** |R·d - z|: 0 when the table puts the direction exactly on machine +Z. */
  readonly residual: number
  /** 1 at zero tilt (the C of the table is undetermined there), 0 when the tilt is far from zero. */
  readonly singularity: number
  /** Which of the two solutions of the layout this is (0: the smaller tilt, 1: the other way round with C + 180). */
  readonly branch: 0 | 1
}

const tiltOf = (a: RotaryAngles): number => a.a ?? a.b ?? 0

/** The rotation of `angles` acting on `v` (a direction or a point relative to the pivot). */
const rotate = (angles: RotaryAngles, layout: RotaryLayout, v: Vec3): Vec3 => {
  const m = tableRotation(angles, layout)
  return { x: m[0] * v.x + m[1] * v.y + m[2] * v.z, y: m[3] * v.x + m[4] * v.y + m[5] * v.z, z: m[6] * v.x + m[7] * v.y + m[8] * v.z }
}

/** The forward kinematics: where a point of the part is in the machine after the table has turned. */
export const forward = (point: Vec3, angles: RotaryAngles, kin: TableKinematic): Vec3 => partToMachine(point, angles, kin.layout, kin.pivot)

/** Where the part's tool axis points in the machine for these angles; equals +Z when the solution is exact. */
export const toolAxisInMachine = (direction: Vec3, angles: RotaryAngles, layout: RotaryLayout): Vec3 => {
  const l = length3(direction)
  return rotate(angles, layout, { x: direction.x / l, y: direction.y / l, z: direction.z / l })
}

/** The C closest to `previous` among C + 360 k within `[min, max]`; `undefined` when no such turn exists. */
export const unwrapC = (c: number, previous: number, min = -Infinity, max = Infinity): number | undefined => {
  let best: number | undefined
  const k0 = Math.round((previous - c) / 360)
  for (let k = k0 - 2; k <= k0 + 2; k++) {
    const v = c + 360 * k
    if (v < min - 1e-9 || v > max + 1e-9) continue
    if (best === undefined || Math.abs(v - previous) < Math.abs(best - previous)) best = v
  }
  return best
}

/**
 * Every turn C + 360 k inside the C limits. Without a C limit the table may take a turn either way: a window of two turns is
 * enough for a plan that never needs a longer rewind (a longer one is a travel cost the planner already refuses to choose).
 */
const allTurns = (c: number, min: number, max: number): number[] => {
  const lo = Number.isFinite(min) ? min : c - 720
  const hi = Number.isFinite(max) ? max : c + 720
  const out: number[] = []
  for (let k = Math.ceil((lo - c) / 360) - 1; k <= Math.floor((hi - c) / 360) + 1; k++) {
    const v = c + 360 * k
    if (v >= lo - 1e-9 && v <= hi + 1e-9) out.push(v)
  }
  return out
}

const candidatesOf = (direction: Vec3, kin: TableKinematic, turnsOf: (c: number) => ReadonlyArray<number>): Candidate[] => {
  const l = length3(direction)
  const d = { x: direction.x / l, y: direction.y / l, z: direction.z / l }
  const out: Candidate[] = []
  for (const [index, angles] of anglesFor(d, kin.layout, kin.limits).entries()) {
    const branch: 0 | 1 = index === 0 ? 0 : 1
    for (const c of turnsOf(angles.c)) {
      const exact = { ...angles, c }
      const m = toolAxisInMachine(d, exact, kin.layout)
      const tilt = tiltOf(exact)
      out.push({ angles: exact, tilt, c, residual: Math.hypot(m.x, m.y, m.z - 1), singularity: Math.max(0, 1 - Math.abs(tilt) / 5), branch })
    }
  }
  return out
}

/**
 * The candidate table positions for a direction in the part, one per solution of `anglesFor`. With `previousC`, C is unwrapped to
 * the turn nearest it (candidates with no turn inside the limits are dropped). An empty result means the table cannot reach it.
 */
export const candidatesFor = (direction: Vec3, kin: TableKinematic, previousC?: number): ReadonlyArray<Candidate> => {
  const cMin = kin.limits.cMin ?? -Infinity, cMax = kin.limits.cMax ?? Infinity
  return candidatesOf(direction, kin, (c) => {
    if (previousC === undefined) return [c]
    const u = unwrapC(c, previousC, cMin, cMax)
    return u === undefined ? [] : [u]
  })
}

/** The planner's states of a direction: every solution at every turn of C inside the limits (a bounded set). */
const statesFor = (direction: Vec3, kin: TableKinematic): Candidate[] =>
  candidatesOf(direction, kin, (c) => allTurns(c, kin.limits.cMin ?? -Infinity, kin.limits.cMax ?? Infinity))

/** Travel between two candidates, degrees: the tilt and C moves (C by the shorter way only when no unwrap is wanted). */
export const travel = (from: Candidate, to: Candidate): number => Math.abs(to.tilt - from.tilt) + Math.abs(to.c - from.c)

export interface PlannedPosition {
  readonly candidate: Candidate
  readonly index: number
}

export interface TablePlan {
  readonly positions: ReadonlyArray<PlannedPosition>
  /** Total rotary travel, degrees. */
  readonly travel: number
}

/**
 * The cheapest path through the candidate graph of `directions`: a dynamic programme (Viterbi) over the positions, cost = rotary
 * travel, starting from `start` (the table's current C and tilt). `undefined` when some direction has no reachable candidate.
 */
export const planTable = (directions: ReadonlyArray<Vec3>, kin: TableKinematic, start: { readonly tilt: number; readonly c: number }): TablePlan | undefined => {
  if (directions.length === 0) return { positions: [], travel: 0 }
  // The states of a direction do not depend on the previous step (every turn of C within the limits), so each layer has a bounded
  // number of states and the programme is linear in the number of directions.
  const layers: Array<{ candidates: Candidate[]; cost: number[]; from: number[] }> = []
  for (let i = 0; i < directions.length; i++) {
    const candidates: Candidate[] = statesFor(directions[i]!, kin)
    if (candidates.length === 0) return undefined
    if (i === 0) {
      layers.push({ candidates, cost: candidates.map((c) => Math.abs(c.tilt - start.tilt) + Math.abs(c.c - start.c)), from: candidates.map(() => -1) })
      continue
    }
    const prev = layers[i - 1]!
    const cost: number[] = []
    const from: number[] = []
    for (const c of candidates) {
      let bestCost = Infinity, bestFrom = -1
      for (let p = 0; p < prev.candidates.length; p++) {
        const k = prev.cost[p]! + travel(prev.candidates[p]!, c)
        if (k < bestCost) { bestCost = k; bestFrom = p }
      }
      cost.push(bestCost)
      from.push(bestFrom)
    }
    layers.push({ candidates, cost, from })
  }
  // Best final position, then trace back.
  const last = layers[layers.length - 1]!
  let best = 0
  for (let k = 1; k < last.cost.length; k++) if (last.cost[k]! < last.cost[best]!) best = k
  const total = last.cost[best]!
  const positions: PlannedPosition[] = []
  let idx = best
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!
    positions.unshift({ candidate: layer.candidates[idx]!, index: idx })
    idx = layer.from[idx]!
  }
  return { positions, travel: total }
}
