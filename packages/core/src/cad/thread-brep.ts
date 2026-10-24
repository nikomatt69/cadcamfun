/**
 * The exact model of a modelled thread (spec 40 U1): the ISO metric thread of `thread.ts` as a valid B-rep, so STEP, drawings and the
 * CAM features see the same thread the viewport shows.
 *
 * A true helicoid is not one of the kernel's surfaces. The thread is therefore a **faceted helicoid** with its chords declared: the
 * ridge is the trapezoid of the ISO basic profile, in the axial plane (so the axial widths and the pitch are exact, not corrected
 * for a skew), carried along the helix in steps of at most 11 degrees; each step joins two copies of the profile with two planar
 * triangles per profile edge, and the two ends are planar quads in axial planes. The core is a cylinder at the root diameter, and
 * the ridge is united with it by one exact Boolean. Every face is planar or the core's cylinder.
 *
 * Differences from the mesh thread, stated, not hidden:
 *  - the ridge starts and stops on an axial plane inside the thread length (a runout), where the mesh thread clips it flat at the
 *    ends: the exact thread is `ridgeTurns` turns, a little shorter than the mesh one;
 *  - the volume of the ridge is that of the profile swept about the axis (Pappus) up to the chord error of the facets: the step count
 *    keeps the facets within 0.02 mm of the helicoid and their radius is widened so that their area is the circle's (under 0.2 %).
 */
import { booleanBrep } from "./brep/boolean.ts"
import { frame, type Vec3 } from "./brep/math.ts"
import { makeCylinder, polyhedron } from "./brep/primitives.ts"
import type { Brep } from "./brep/topology.ts"
import { threadProblem, threadSizes, type ThreadSpec } from "./thread.ts"

const TAN30 = Math.tan(Math.PI / 6)
/**
 * Where the ridge starts and the seams of the core and the sleeve lie, radians: off the plane y = 0, where a shaft's own seam is, so the
 * start cap of the ridge and the seams of the cylinders do not line up for a Boolean to trip on.
 */
const PHASE = 0.37
/** Most turns of ridge the exact model builds: the Boolean work grows faster than the facets (an M6 of 39 turns takes 20 s, of 9 turns 3 s). */
export const EXACT_THREAD_MAX_TURNS = 24
/** The facets stay this close to the helicoid, mm; the area compensation (`widen`) keeps the volume, not this, within 0.2 %. */
const FACET_TOLERANCE = 0.02
/** Facets per turn for a ridge reaching `radius`: chords of at most 13 degrees. */
const facetsPerTurn = (radius: number): number => Math.max(28, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - FACET_TOLERANCE / Math.max(radius, 1e-6)))))

/** What the exact thread of `spec` is: the turns of its ridge and the facets it takes, or why it is refused. */
export const exactThreadPlan = (t: ThreadSpec): { readonly turns: number; readonly steps: number; readonly sizes: ReturnType<typeof threadSizes> } | string => {
  const problem = threadProblem(t)
  if (problem !== undefined) return problem
  const sizes = threadSizes(t.diameter, t.pitch, t.internal)
  const sink = 0.05 * t.pitch
  const baseWidth = sizes.rootWidth + 2 * sink * TAN30
  const turns = (t.length - baseWidth) / t.pitch
  if (!(turns > 0.25)) return `a thread of ${t.length} mm at a ${t.pitch} mm pitch is too short for a ridge (the profile alone is ${baseWidth.toFixed(2)} mm wide)`
  if (turns > EXACT_THREAD_MAX_TURNS) return `a thread of ${turns.toFixed(1)} turns has more facets than the exact model builds (at most ${EXACT_THREAD_MAX_TURNS} turns)`
  return { turns, steps: Math.ceil(turns * facetsPerTurn(sizes.major / 2)), sizes }
}

/** Volume of the exact thread: the core plus the ridge outside it (Pappus), mm³. Independent of the facets: the oracle of the tests. */
export const exactThreadVolume = (t: ThreadSpec): number | string => {
  const plan = exactThreadPlan(t)
  if (typeof plan === "string") return plan
  const { sizes } = plan
  const area = ((sizes.rootWidth + sizes.crestWidth) / 2) * sizes.height
  const centroid = (sizes.height * (sizes.rootWidth + 2 * sizes.crestWidth)) / (3 * (sizes.rootWidth + sizes.crestWidth))
  return Math.PI * (sizes.minor / 2) ** 2 * t.length + area * 2 * Math.PI * (sizes.minor / 2 + centroid) * plan.turns
}

/**
 * The thread as a solid along +Z in its own frame, then carried by `place` to the world: a threaded rod (external) or the tool
 * that cuts a tapped hole (internal). `crestTrim` brings the crest in by that many mm and `coreExtend` runs the core that far past both ends (see `makeThreadGrooveBrep`). Throws a
 * `RangeError` with the reason when it cannot be built.
 */
export const makeThreadBrep = (t: ThreadSpec, place?: (p: Vec3) => Vec3, crestTrim = 0, coreExtend = 0): Brep => {
  const plan = exactThreadPlan(t)
  if (typeof plan === "string") throw new RangeError(plan)
  const { turns, steps, sizes } = plan
  const cx = t.cx ?? 0, cy = t.cy ?? 0, z0 = t.z0 ?? 0
  const rRoot = sizes.minor / 2
  const sink = 0.05 * t.pitch
  const baseWidth = sizes.rootWidth + 2 * sink * TAN30
  const sign = t.left === true ? -1 : 1
  // The profile in the axial plane: (radius, axial offset), the root side reaching `sink` into the core so the two unite on a surface.
  const profile = [
    { r: rRoot - sink, a: -baseWidth / 2 }, { r: rRoot + sizes.height - crestTrim, a: -sizes.crestWidth / 2 },
    { r: rRoot + sizes.height - crestTrim, a: sizes.crestWidth / 2 }, { r: rRoot - sink, a: baseWidth / 2 }
  ]
  const move = place ?? ((p: Vec3) => p)
  // A step turns the profile by `alpha`; the polygon of N such steps has the area of the circle when its radius is widened by
  // sqrt(alpha / sin alpha), so the facets are inscribed and circumscribed in turn instead of all inside the true helicoid.
  const alpha = (2 * Math.PI * turns) / steps
  const widen = Math.sqrt(alpha / Math.sin(alpha))
  const points: Vec3[] = []
  for (let k = 0; k <= steps; k++) {
    const turn = (turns * k) / steps
    const angle = PHASE + sign * 2 * Math.PI * turn
    for (const q of profile) points.push(move({ x: cx + widen * q.r * Math.cos(angle), y: cy + widen * q.r * Math.sin(angle), z: z0 + baseWidth / 2 + t.pitch * turn + q.a }))
  }
  const id = (k: number, j: number) => k * 4 + j
  const faces: number[][] = []
  for (let k = 0; k < steps; k++) {
    for (let j = 0; j < 4; j++) {
      const j2 = (j + 1) % 4
      faces.push([id(k, j), id(k + 1, j), id(k + 1, j2)], [id(k, j), id(k + 1, j2), id(k, j2)])
    }
  }
  faces.push([id(0, 0), id(0, 1), id(0, 2), id(0, 3)], [id(steps, 3), id(steps, 2), id(steps, 1), id(steps, 0)])
  // A left-hand helix turns the other way: every face is wound the other way too, so the outside stays outside.
  const ridge = polyhedron(points, sign < 0 ? faces.map((f) => [...f].reverse()) : faces)
  const core = makeCylinder(rRoot, t.length + 2 * coreExtend, coreFrame({ ...t, z0: z0 - coreExtend }, move))
  return booleanBrep(core, ridge, "union").brep
}

/** The core's frame once `place` has carried the local Z axis to the world. */
const coreFrame = (t: ThreadSpec, place: (p: Vec3) => Vec3) => {
  const cx = t.cx ?? 0, cy = t.cy ?? 0, z0 = t.z0 ?? 0
  const o = place({ x: cx, y: cy, z: z0 })
  const z = place({ x: cx, y: cy, z: z0 + 1 })
  const x = place({ x: cx + Math.cos(PHASE), y: cy + Math.sin(PHASE), z: z0 })
  return frame(o, { x: z.x - o.x, y: z.y - o.y, z: z.z - o.z }, { x: x.x - o.x, y: x.y - o.y, z: x.z - o.z })
}

/**
 * How far the crest of a thread that is cut into a shaft is brought in, mm. A shaft turned to the major diameter is almost
 * tangent to the crest of the thread, and a Boolean cannot decide a gap of a few hundredths of a millimetre (0.012 fails, 0.02
 * holds); the crest of the cut thread stays this far inside the shaft: 0.5 % of the radius of an M6, inside the 6g tolerance on
 * the major diameter (-0.026 to -0.144 mm).
 */
export const CUT_CREST_TRIM = 0.03

/**
 * The material an external modelled thread takes off a shaft (`cut`): a sleeve a little wider than the major diameter over the
 * thread length, minus the threaded rod (crest `CUT_CREST_TRIM` inside, core running a pitch past both ends so it crosses the
 * sleeve's end planes instead of sharing them). Same construction and the same meaning as the mesh `threadGroove`: subtracted
 * from a shaft it never adds material, and a shaft narrower than the rod keeps what it has.
 */
export const makeThreadGrooveBrep = (t: ThreadSpec, place?: (p: Vec3) => Vec3): Brep => {
  if (t.internal) throw new RangeError("A groove is cut for an external thread; an internal thread's tool already cuts")
  const move = place ?? ((p: Vec3) => p)
  const sleeve = makeCylinder(t.diameter / 2 + 2 * t.pitch, t.length, coreFrame(t, move))
  return booleanBrep(sleeve, makeThreadBrep(t, place, CUT_CREST_TRIM, t.pitch), "subtract").brep
}
