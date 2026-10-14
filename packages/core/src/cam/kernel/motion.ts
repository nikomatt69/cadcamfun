/**
 * Simultaneous five-axis motion of the trunnion kernel (spec 29 §8, §12): a sequence of cutter locations (a tip point in the part
 * and the tool axis through it) becomes one table pose per location, and every move between poses is checked as the controller
 * will run it.
 *
 *   poses      `planTable` picks the candidate pose of each location: the cheapest path of rotary travel, branch and C unwrapped
 *   blocks     each move is split into equal joint blocks: the fewest that keep the tip's controller interpolation error within
 *              the tolerance (`stepsForTolerance`), evaluated at the two ends of the move
 *   collision  each block is checked continuously against the spindle and the part (`checkMotion`, the trunnion scene); a move
 *              is clear only when every block is
 *
 * Not covered: the interior of a move is not certified for the tip deviation (only its two ends are evaluated); the tool-axis
 * error between locations is zero by construction only at the sampled locations. A move the table cannot reach is not planned.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { RotaryAngles } from "../indexing.ts"
import { checkMotion, trunnionScene, type MotionCheck, type Pose } from "./collision.ts"
import type { Cutter } from "./cutters.ts"
import { interpolationDeviation, planTable, stepsForTolerance, type TableKinematic } from "./kinematics.ts"

export interface CutterLocation {
  /** Tip point in part coordinates, mm. */
  readonly point: Vec3
  /** Tool axis (into the part) in part coordinates; it is turned to machine +Z by the table. */
  readonly direction: Vec3
}

export interface PartEnvelope {
  /** Centre of the part box in part coordinates, mm. */
  readonly centre: Vec3
  /** Half extents of the box, mm. */
  readonly half: Vec3
}

export interface SimultaneousInput {
  readonly kin: TableKinematic
  readonly cutter: Cutter
  /** Spindle nose in machine coordinates, mm. */
  readonly nose: Vec3
  readonly part: PartEnvelope
  /** Controller interpolation tolerance of the tip, mm. */
  readonly tolerance: number
  /** Clearance the moves must keep, mm. */
  readonly margin?: number
  /** Table pose before the first location. */
  readonly start: RotaryAngles
  /** Collision bisection depth. */
  readonly maxDepth?: number
}

export interface MotionSegment {
  /** Index of the pose the move starts from (0 is the start pose, 1 the first location, and so on). */
  readonly from: number
  readonly to: number
  /** Equal joint blocks the controller runs the move in. */
  readonly blocks: number
  /** Tip interpolation error at the two ends of the move with `blocks` blocks, mm. */
  readonly deviation: number
  readonly verdict: MotionCheck["verdict"]
  /** Smallest certified clearance over the move's blocks, mm (for a collision, the sampled overlap). */
  readonly clearance: number
  /** Parameter of the collision inside the block, when found. */
  readonly at?: number
}

export interface SimultaneousPlan {
  /** The start pose followed by one pose per location. */
  readonly poses: ReadonlyArray<RotaryAngles>
  /** Rotary travel of the planned path, degrees. */
  readonly travel: number
  readonly segments: ReadonlyArray<MotionSegment>
  /** Overall verdict: a collision anywhere wins over unresolved, and both over clear. */
  readonly verdict: MotionCheck["verdict"]
}

const tiltOf = (a: RotaryAngles): number => a.a ?? a.b ?? 0
const poseOf = (a: RotaryAngles): Pose => ({ tilt: tiltOf(a), c: a.c })

/**
 * Plan the table poses for the locations and check every move. `undefined` when some location has no reachable pose, so the path
 * cannot be run at all.
 */
export const planSimultaneous = (locations: ReadonlyArray<CutterLocation>, input: SimultaneousInput): SimultaneousPlan | undefined => {
  const plan = planTable(locations.map((l) => l.direction), input.kin, { tilt: tiltOf(input.start), c: input.start.c })
  if (plan === undefined) return undefined
  const poses: RotaryAngles[] = [input.start, ...plan.positions.map((p) => p.candidate.angles)]
  const scene = trunnionScene(input.cutter, input.kin.layout, input.nose, input.kin.pivot, input.part)
  const margin = input.margin ?? 0
  const segments: MotionSegment[] = []
  for (let i = 0; i + 1 < poses.length; i++) {
    // The move into pose i + 1 runs while the tip is at location i (or the first one for the lead-in move).
    const loc = locations[Math.max(0, i)]!.point
    const from = poses[i]!, to = poses[i + 1]!
    const blocks = stepsForTolerance(loc, from, to, input.kin, input.tolerance)
    if (blocks === undefined) {
      // The controller cannot hold the tolerance in any block count it accepts: the move is not proven, so it is not clear.
      segments.push({ from: i, to: i + 1, blocks: 0, deviation: Infinity, verdict: "unresolved", clearance: 0 })
      continue
    }
    const n = blocks
    const deviation = interpolationDeviation(loc, from, to, input.kin, n)
    let verdict: MotionCheck["verdict"] = "clear"
    let clearance = Infinity
    let at: number | undefined
    for (let k = 0; k < n && verdict !== "collision"; k++) {
      const a = poseOf(from), b = poseOf(to)
      const blockFrom = { tilt: a.tilt + ((b.tilt - a.tilt) * k) / n, c: a.c + ((b.c - a.c) * k) / n }
      const blockTo = { tilt: a.tilt + ((b.tilt - a.tilt) * (k + 1)) / n, c: a.c + ((b.c - a.c) * (k + 1)) / n }
      const r = checkMotion(scene, blockFrom, blockTo, { margin, ...(input.maxDepth !== undefined ? { maxDepth: input.maxDepth } : {}) })
      clearance = Math.min(clearance, r.clearance)
      if (r.verdict === "collision") { verdict = "collision"; at = (k + (r.at ?? 0)) / n }
      else if (r.verdict === "unresolved" && verdict === "clear") verdict = "unresolved"
    }
    segments.push({ from: i, to: i + 1, blocks: n, deviation, verdict, clearance: Number.isFinite(clearance) ? clearance : 0, ...(at !== undefined ? { at } : {}) })
  }
  const verdict = segments.some((s) => s.verdict === "collision") ? "collision" : segments.some((s) => s.verdict === "unresolved") ? "unresolved" : "clear"
  return { poses, travel: plan.travel, segments, verdict }
}
