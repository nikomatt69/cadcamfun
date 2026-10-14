/**
 * Continuous collision of the tool assembly with the machine (spec 29 §8, §12 "check swept machine motion"). The module checks
 * a joint move, not only its end poses: the controller moves the table or the head linearly in its joints between two
 * points, and a clash can happen between them.
 *
 *   probes     the holder and shank of the tool, each non-cutting profile segment enclosed by a capsule (a swept ball of its
 *              larger radius along the segment), and optionally the spindle housing; they move with a tilting head
 *   obstacles  the table envelope (a capped cylinder) and the part envelope (a box); the part moves with a trunnion table
 *   clearance  the smallest signed distance between any probe and any obstacle, mm; negative means the envelopes overlap
 *
 * Verdicts (`checkMotion`), exact in the sense of a certified bound:
 *   collision   a sampled point of a probe lies inside an obstacle; the envelope overlaps at that pose
 *   clear       on every interval the lower bound of the clearance is at least `margin`
 *   unresolved  an interval could not be proven clear within the subdivision depth, and no overlap was found
 *
 * The lower bound is the Lipschitz argument: a signed distance changes by at most the displacement of the moving solid, and a
 * joint rotation by Δθ displaces a point at most ρ·Δθ, with ρ its distance from the rotation centre. Probe samples are points on
 * their axis, and the signed distance is 1-Lipschitz, so the sampled minimum is at most half a sample spacing above the true one.
 *
 * Conservative by construction: a capsule encloses its holder segment, so an envelope overlap can be reported where the real
 * tool would only come close. The housing is optional and off by default; a shop enters its own spindle geometry.
 * Units: mm and degrees (the layouts of `indexing.ts`). Pure: same inputs, same answer.
 */
import { length3, type Vec3 } from "../../cad/vec.ts"
import { tableRotation, type RotaryLayout } from "../indexing.ts"
import { assemblyProfile } from "./assembly.ts"
import type { Cutter } from "./cutters.ts"
import { headAxis, type HeadKinematic } from "./head.ts"

const DEG = Math.PI / 180
const SAMPLES = 9

export interface Capsule { readonly a: Vec3; readonly b: Vec3; readonly radius: number }
export interface Solid { readonly sdf: (p: Vec3) => number }

/** The moving joint values of a motion: the tilt (A or B) and C, degrees. A head has no C. */
export interface Pose { readonly tilt: number; readonly c: number }

export interface Scene {
  readonly probesAt: (pose: Pose) => ReadonlyArray<Capsule>
  readonly obstaclesAt: (pose: Pose) => ReadonlyArray<Solid>
  /** Largest distance of a probe sample from its rotation centre, mm. */
  readonly reachProbes: number
  /** Largest distance of an obstacle point from its rotation centre, mm. */
  readonly reachObstacles: number
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

/** A capped cylinder: base centre, unit axis, extent [z0, z1] along the axis, radius. Exact signed distance. */
export const cylinderSolid = (base: Vec3, axis: Vec3, z0: number, z1: number, radius: number): Solid => ({
  sdf: (p) => {
    const q = sub(p, base)
    const a = dot(q, axis)
    const radial = Math.hypot(q.x - a * axis.x, q.y - a * axis.y, q.z - a * axis.z) - radius
    const mid = (z0 + z1) / 2, half = (z1 - z0) / 2
    const axial = Math.abs(a - mid) - half
    return Math.hypot(Math.max(radial, 0), Math.max(axial, 0)) + Math.min(Math.max(radial, axial), 0)
  }
})

/**
 * An axis-aligned box in its own frame. `toBox` maps a machine point into that frame (the identity for a fixed box, the inverse
 * table rotation for a box carried by the table). Exact signed distance.
 */
export const boxSolid = (center: Vec3, half: Vec3, toBox: (p: Vec3) => Vec3): Solid => ({
  sdf: (p) => {
    const q = toBox(p)
    const dx = Math.abs(q.x - center.x) - half.x, dy = Math.abs(q.y - center.y) - half.y, dz = Math.abs(q.z - center.z) - half.z
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0)
  }
})

/** The inverse of a rotation about `pivot`: a machine point back into the part's frame. */
const toPartFrame = (layout: RotaryLayout, pose: Pose, pivot: Vec3): ((p: Vec3) => Vec3) => {
  const m = tableRotation(layout === "table-AC" ? { a: pose.tilt, c: pose.c } : { b: pose.tilt, c: pose.c }, layout)
  return (p) => {
    const v = sub(p, pivot)
    // The rotation is orthonormal, so its inverse is its transpose.
    return add({ x: m[0] * v.x + m[3] * v.y + m[6] * v.z, y: m[1] * v.x + m[4] * v.y + m[7] * v.z, z: m[2] * v.x + m[5] * v.y + m[8] * v.z }, pivot)
  }
}

/** The non-cutting segments of a tool as capsules along the tool axis, from the tip (z = 0) up the shank and holder. */
const toolSegments = (cutter: Cutter): Array<{ readonly z0: number; readonly z1: number; readonly radius: number }> => {
  const profile = assemblyProfile(cutter)
  const out: Array<{ z0: number; z1: number; radius: number }> = []
  for (let i = 0; i + 1 < profile.points.length; i++) {
    if (profile.parts[i] === "cutting") continue
    const a = profile.points[i]!, b = profile.points[i + 1]!
    out.push({ z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), radius: Math.max(a.r, b.r) })
  }
  return out
}

/** The capsules of a tool whose spindle nose is at `nose`, pointing down along `down` (into the part). */
const toolCapsules = (cutter: Cutter, nose: Vec3, down: Vec3, gauge: number, housing?: { readonly radius: number; readonly height: number }): Capsule[] => {
  const up = scale(down, -1)
  const at = (z: number): Vec3 => add(nose, scale(up, z - gauge))
  const out: Capsule[] = toolSegments(cutter).map((s) => ({ a: at(s.z0), b: at(s.z1), radius: s.radius }))
  if (housing !== undefined) out.push({ a: nose, b: add(nose, scale(up, housing.height)), radius: housing.radius })
  return out
}

export interface TableEnvelope {
  /** Centre of the table top in the machine (x, y), mm. */
  readonly centre: { readonly x: number; readonly y: number }
  /** Height of the table top, mm. */
  readonly top: number
  readonly radius: number
  readonly depth: number
}

const tableSolid = (t: TableEnvelope): Solid =>
  cylinderSolid({ x: t.centre.x, y: t.centre.y, z: t.top - t.depth }, { x: 0, y: 0, z: 1 }, 0, t.depth, t.radius)

/** A tilting head (B about Y) on a fixed table: the tool and housing move with the head, the table and the part stand still. */
export const headScene = (cutter: Cutter, head: HeadKinematic, table: TableEnvelope, options: { readonly housing?: { readonly radius: number; readonly height: number }; readonly part?: { readonly centre: Vec3; readonly half: Vec3 } } = {}): Scene => {
  const obstacles: Solid[] = [tableSolid(table)]
  if (options.part !== undefined) obstacles.push(boxSolid(options.part.centre, options.part.half, (p) => p))
  const segs = toolSegments(cutter)
  const reachProbes = Math.max(
    ...segs.flatMap((s) => [Math.abs(s.z0 - cutter.stickout), Math.abs(s.z1 - cutter.stickout)]),
    options.housing !== undefined ? options.housing.height : 0,
    0
  )
  return {
    probesAt: (pose) => {
      const a = headAxis(pose.tilt)
      return toolCapsules(cutter, head.pivot, a, cutter.stickout, options.housing)
    },
    obstaclesAt: () => obstacles,
    reachProbes,
    reachObstacles: 0
  }
}

/**
 * A trunnion table (AC or BC) with a fixed spindle: the tool is still and the part box turns on the table about `pivot`. The table
 * top itself is not modelled here; the part envelope is the moving obstacle.
 */
export const trunnionScene = (cutter: Cutter, layout: RotaryLayout, nose: Vec3, pivot: Vec3, part: { readonly centre: Vec3; readonly half: Vec3 }, options: { readonly housing?: { readonly radius: number; readonly height: number } } = {}): Scene => {
  const down = { x: 0, y: 0, z: -1 }
  const probes = toolCapsules(cutter, nose, down, cutter.stickout, options.housing)
  const corners: Vec3[] = []
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    corners.push(add(part.centre, { x: sx * part.half.x, y: sy * part.half.y, z: sz * part.half.z }))
  const reachObstacles = Math.max(...corners.map((c) => length3(sub(c, pivot))))
  return {
    probesAt: () => probes,
    obstaclesAt: (pose) => [boxSolid(part.centre, part.half, toPartFrame(layout, pose, pivot))],
    reachProbes: 0,
    reachObstacles
  }
}

/** Evaluate the clearance of a pose: the least signed distance over probe samples, and the half sample spacing it may hide. */
export interface Clearance {
  /** Smallest sampled value of (distance - radius), mm; an upper bound on the true clearance. */
  readonly value: number
  /** The true clearance is at least `value - slack`. */
  readonly slack: number
}

const evaluate = (scene: Scene, pose: Pose): Clearance => {
  const obstacles = scene.obstaclesAt(pose)
  let value = Infinity, slack = 0
  for (const cap of scene.probesAt(pose)) {
    const spacing = length3(sub(cap.b, cap.a)) / (SAMPLES - 1)
    slack = Math.max(slack, spacing / 2)
    for (let k = 0; k < SAMPLES; k++) {
      const p = add(cap.a, scale(sub(cap.b, cap.a), k / (SAMPLES - 1)))
      for (const o of obstacles) value = Math.min(value, o.sdf(p) - cap.radius)
    }
  }
  return { value: Number.isFinite(value) ? value : Infinity, slack }
}

/** The largest change of clearance over a joint move, mm: Σ reach · |Δθ| in radians, over both moving bodies. */
const motionBound = (scene: Scene, from: Pose, to: Pose): number =>
  (scene.reachProbes + scene.reachObstacles) * (Math.abs(to.tilt - from.tilt) + Math.abs(to.c - from.c)) * DEG

export interface MotionCheck {
  readonly verdict: "clear" | "collision" | "unresolved"
  /** Certified lower bound of the clearance over the whole move, mm (for `clear` and `unresolved`). */
  readonly clearance: number
  /** Parameter of the move, 0 at `from` and 1 at `to`, where an overlap was sampled (`collision`). */
  readonly at?: number
  /** Number of pose evaluations used. */
  readonly evaluations: number
}

/**
 * Check a linear joint move from `from` to `to` (the controller's joint interpolation) against the scene. The move is bisected
 * until every part is proven to stay at least `margin` mm clear, or an overlap is sampled, or the depth runs out.
 */
export const checkMotion = (scene: Scene, from: Pose, to: Pose, options: { readonly margin?: number; readonly maxDepth?: number } = {}): MotionCheck => {
  const margin = options.margin ?? 0
  const maxDepth = options.maxDepth ?? 12
  const poseAt = (t: number): Pose => ({ tilt: from.tilt + (to.tilt - from.tilt) * t, c: from.c + (to.c - from.c) * t })
  let evaluations = 0
  const evalAt = (t: number): Clearance => {
    evaluations++
    return evaluate(scene, poseAt(t))
  }
  const start = evalAt(0)
  if (start.value < 0) return { verdict: "collision", clearance: start.value, at: 0, evaluations }
  const end = evalAt(1)
  if (end.value < 0) return { verdict: "collision", clearance: end.value, at: 1, evaluations }
  let certified = Infinity
  let unresolved = false
  const stack: Array<{ a: number; va: Clearance; b: number; vb: Clearance; depth: number }> = [{ a: 0, va: start, b: 1, vb: end, depth: 0 }]
  while (stack.length > 0) {
    const { a, va, b, vb, depth } = stack.pop()!
    // Each end is a sample: the true clearance there is at least value - slack, and it moves by at most `motion` inside the block.
    const motion = motionBound(scene, poseAt(a), poseAt(b))
    const lower = ((va.value - va.slack) + (vb.value - vb.slack) - motion) / 2
    if (lower >= margin) { certified = Math.min(certified, lower); continue }
    if (depth >= maxDepth) { unresolved = true; certified = Math.min(certified, lower); continue }
    const m = (a + b) / 2
    const vm = evalAt(m)
    if (vm.value < 0) return { verdict: "collision", clearance: vm.value, at: m, evaluations }
    stack.push({ a, va, b: m, vb: vm, depth: depth + 1 }, { a: m, va: vm, b, vb, depth: depth + 1 })
  }
  return { verdict: unresolved ? "unresolved" : "clear", clearance: certified, evaluations }
}
