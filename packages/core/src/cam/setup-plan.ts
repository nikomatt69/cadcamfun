/**
 * Setup planning on the exact model (hyperMILL's setup / orientation planning, Fusion's "setup from faces"; spec 54 R4).
 *
 * The CAM kernel plans one three-axis setup at a time (`setupOrientation`, spec 34). This module answers the question before
 * it: which orientations does a part need, what does each one reach, and which faces no three-axis setup can reach.
 *
 *  - **Reach.** A face is reachable from a spindle direction `d` (one of the six axes) when a tool coming along `-d` can see
 *    it: its outward normal does not point away from `d` and the line along `d` leaves the solid. The line starts 1.5 chord
 *    tolerances outside the facet; for a wall parallel to `d` that means the space above the wall must be free (a flat end mill
 *    machines it from the side). The test samples every triangle of the
 *    exact tessellation and ray-casts it along the axis, so it is exact up to the chord tolerance. It ignores the cutter:
 *    a face seen but inside a slot narrower than every tool is "reachable" here and refused later by the planner.
 *  - **Cover.** The orientations are a six-element set, so the subset that reaches the most face area (the smaller subset
 *    on equal area) is found exhaustively (63 subsets), not greedily; ties go to the larger reach, then to the fixed order +Z, -Z, +X, -X, +Y, -Y.
 *  - **Held face.** With `fixture: "bottom"` (default) the planar bottom face of the part's bounding box is the fixturing
 *    face: it is exempt from the cover and reported in `held`, as a vise or a fixture plate holds the stock there.
 *  - **Holes** come from `recognizeHoles`; a hole belongs to the setup whose spindle direction is the opposite of the way
 *    the drill goes into the material. A hole not parallel to an axis is `indexed`: it needs 3+2 indexing, which a manual
 *    three-axis setup does not provide, so it is reported and never assigned.
 *  - **Prismatic.** For every chosen setup the part is rotated like the planner rotates it and `brepFeatures` is asked
 *    whether the 2.5D recogniser accepts the oriented solid (its reason otherwise).
 *
 * Nothing here claims the part is machinable: it says what the geometry allows. Workholding, cutter fit and collision stay
 * with the kernel's claims.
 */
import { bodyTessellation, transformBrep, type Brep } from "../cad/brep/index.ts"
import { EPS, reachShares, START } from "../cad/brep/visibility.ts"
import { recognizeHoles } from "../cad/brep/features.ts"
import type { Vec3 } from "../cad/brep/math.ts"
import { brepFeatures } from "./brep-part.ts"
import { SETUP_ORIENTATIONS, setupTransform, type SetupOrientation } from "./setup.ts"

/** A face whose reachable area share is at least this is reachable. */
const FULL = 0.999
/** Triangles beyond this make the tessellation coarser (the reach test is O(triangles) per direction). */
const MAX_TRIANGLES = 80_000

/** Preference order of orientations on ties and in the output. */
const ORDER: ReadonlyArray<SetupOrientation> = ["+Z", "-Z", "+X", "-X", "+Y", "-Y"]

export interface SetupPlanOptions {
  /** "bottom" (default): the planar bottom of the bounding box is the fixturing face and needs no setup. "none": every face counts. */
  readonly fixture?: "bottom" | "none"
  /** Chord tolerance of the tessellation the reach test samples, mm (default: 1/1000 of the diagonal, at least 0.02). */
  readonly chordTol?: number
  /** Orientations the shop can use (default all six). */
  readonly allowed?: ReadonlyArray<SetupOrientation>
}

export interface SetupFace {
  readonly face: number
  readonly kind: string
  readonly area: number
}

export interface SetupHole {
  readonly entry: Vec3
  readonly direction: Vec3
  readonly diameter: number
  readonly depth: number
  readonly form: "simple" | "counterbore" | "countersink"
}

export type SetupPrismatic =
  | { readonly ok: true; readonly holes: number; readonly pockets: number; readonly outlines: number }
  | { readonly ok: false; readonly reason: string }

export interface PlannedSetup {
  readonly orientation: SetupOrientation
  /** Faces this setup is the first (in `setups` order) to reach. */
  readonly faces: ReadonlyArray<number>
  /** Area of those faces and its share of the area that needs a setup. */
  readonly area: number
  readonly share: number
  /** Holes drilled from this setup. */
  readonly holes: ReadonlyArray<SetupHole>
  /** Whether the 2.5D recogniser accepts the part in this orientation. */
  readonly prismatic: SetupPrismatic
}

export interface SetupPlan {
  readonly setups: ReadonlyArray<PlannedSetup>
  /** Faces no allowed orientation reaches, with the reason. */
  readonly uncovered: ReadonlyArray<SetupFace & { readonly reason: string; readonly bestShare: number; readonly bestOrientation: SetupOrientation }>
  /** Faces exempt from the cover because they are the fixturing face. */
  readonly held: ReadonlyArray<SetupFace>
  /** Holes that are not parallel to an axis: they need 3+2 indexing. */
  readonly indexed: ReadonlyArray<SetupHole>
  /** What each single orientation reaches, in `SETUP_ORIENTATIONS` order. */
  readonly reach: ReadonlyArray<{ readonly orientation: SetupOrientation; readonly faces: number; readonly area: number; readonly share: number }>
  readonly faces: number
  /** Area that needs a setup (all faces minus the held ones), mm². */
  readonly area: number
  readonly notes: ReadonlyArray<string>
}


const areaOf = (positions: Float64Array, indices: Uint32Array, triangleFace: Uint32Array, faces: number): Float64Array => {
  const area = new Float64Array(faces)
  for (let t = 0; t < indices.length / 3; t++) {
    const i0 = indices[t * 3]! * 3, i1 = indices[t * 3 + 1]! * 3, i2 = indices[t * 3 + 2]! * 3
    const e1x = positions[i1]! - positions[i0]!, e1y = positions[i1 + 1]! - positions[i0 + 1]!, e1z = positions[i1 + 2]! - positions[i0 + 2]!
    const e2x = positions[i2]! - positions[i0]!, e2y = positions[i2 + 1]! - positions[i0 + 1]!, e2z = positions[i2 + 2]! - positions[i0 + 2]!
    area[triangleFace[t]!]! += Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x) / 2
  }
  return area
}

const axisOf = (direction: Vec3): SetupOrientation | undefined => {
  const c = [direction.x, direction.y, direction.z]
  const k = c.findIndex((x) => Math.abs(Math.abs(x) - 1) < 1e-6)
  if (k < 0) return undefined
  return `${c[k]! > 0 ? "+" : "-"}${"XYZ"[k]}` as SetupOrientation
}

/** The spindle direction that drills a hole going into the material along `direction`. */
const spindleFor = (direction: Vec3): SetupOrientation | undefined => {
  const a = axisOf(direction)
  return a === undefined ? undefined : (`${a[0] === "+" ? "-" : "+"}${a[1]}` as SetupOrientation)
}

export const planSetups = (b: Brep, options: SetupPlanOptions = {}): SetupPlan => {
  const notes: string[] = []
  const allowed = ORDER.filter((o) => options.allowed === undefined || options.allowed.includes(o))
  if (allowed.length === 0) throw new RangeError("planSetups: no orientation is allowed")

  let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  let chord = options.chordTol
  let mesh = bodyTessellation(b, chord === undefined ? {} : { chordTol: chord })
  for (let i = 0; i < mesh.positions.length; i += 3) {
    lo = { x: Math.min(lo.x, mesh.positions[i]!), y: Math.min(lo.y, mesh.positions[i + 1]!), z: Math.min(lo.z, mesh.positions[i + 2]!) }
    hi = { x: Math.max(hi.x, mesh.positions[i]!), y: Math.max(hi.y, mesh.positions[i + 1]!), z: Math.max(hi.z, mesh.positions[i + 2]!) }
  }
  const diagonal = Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
  if (chord === undefined) {
    chord = Math.max(0.02, diagonal / 1000)
    mesh = bodyTessellation(b, { chordTol: chord })
  }
  while (mesh.indices.length / 3 > MAX_TRIANGLES && chord < diagonal / 20) {
    chord *= 2
    mesh = bodyTessellation(b, { chordTol: chord })
    notes.push(`the tessellation was coarsened to a chord of ${chord.toFixed(3)} mm to keep the reach test under ${MAX_TRIANGLES} triangles`)
  }
  const faces = b.faces.length
  const area = areaOf(mesh.positions, mesh.indices, mesh.triangleFace, faces)
  const kinds = b.faces.map((f) => f.surface.kind)

  // Held face: a planar face on the bounding box bottom looking down.
  const held = new Set<number>()
  if ((options.fixture ?? "bottom") === "bottom") {
    const tol = Math.max(1e-6, diagonal * 1e-9)
    for (let fi = 0; fi < faces; fi++) {
      const f = b.faces[fi]!, s = f.surface
      if (s.kind !== "plane") continue
      const nz = s.frame.z.z * (f.reversed ? -1 : 1)
      if (nz < -1 + 1e-9 && Math.abs(s.frame.origin.z - lo.z) <= tol) held.add(fi)
    }
  }
  const needed = [...Array(faces).keys()].filter((f) => !held.has(f) && area[f]! > 0)
  const needArea = needed.reduce((sum, f) => sum + area[f]!, 0)

  // Reach of every single orientation.
  const reachByOrientation = new Map<SetupOrientation, Float64Array>()
  for (const o of SETUP_ORIENTATIONS) reachByOrientation.set(o, reachShares(mesh, o, Math.max(EPS, START * chord)))
  const reaches = (o: SetupOrientation, f: number): boolean => reachByOrientation.get(o)![f]! >= FULL

  // Exhaustive minimal cover over the allowed orientations.
  const coverArea = (subset: ReadonlyArray<SetupOrientation>): number =>
    needed.reduce((sum, f) => sum + (subset.some((o) => reaches(o, f)) ? area[f]! : 0), 0)
  let best: { subset: SetupOrientation[]; covered: number } | undefined
  for (let mask = 1; mask < 1 << allowed.length; mask++) {
    const subset = allowed.filter((_, i) => (mask & (1 << i)) !== 0)
    const covered = coverArea(subset)
    if (
      best === undefined || covered > best.covered + 1e-9 ||
      (Math.abs(covered - best.covered) <= 1e-9 && subset.length < best.subset.length)
    ) best = { subset, covered }
  }
  const chosen = best!.subset
  // Order: the largest first-reach, ties by the fixed order.
  const firstReach = new Map<SetupOrientation, number[]>()
  const remaining = new Set(needed)
  const ordered: SetupOrientation[] = []
  for (let pool = [...chosen]; pool.length > 0;) {
    const gain = (o: SetupOrientation) => [...remaining].filter((f) => reaches(o, f)).reduce((sum, f) => sum + area[f]!, 0)
    pool.sort((p, q) => gain(q) - gain(p) || ORDER.indexOf(p) - ORDER.indexOf(q))
    const o = pool.shift()!
    const mine = [...remaining].filter((f) => reaches(o, f))
    for (const f of mine) remaining.delete(f)
    firstReach.set(o, mine)
    ordered.push(o)
  }
  const uncovered = [...remaining].map((f) => {
    const [bestOrientation, bestShare] = SETUP_ORIENTATIONS.reduce<[SetupOrientation, number]>((m, o) => (reachByOrientation.get(o)![f]! > m[1] ? [o, reachByOrientation.get(o)![f]!] : m), ["+Z", 0])
    return { bestShare, bestOrientation,
    face: f, kind: kinds[f]!, area: area[f]!,
    reason: SETUP_ORIENTATIONS.some((o) => !allowed.includes(o) && reaches(o, f))
      ? "reachable only from an orientation that is not allowed"
      : [...reachByOrientation.values()].some((r) => r[f]! > 0)
        ? "seen only in part from every axis: it needs a tilted tool (3+2 indexing or 5 axes) or an undercut cutter"
        : "enclosed: no axis direction sees it"
  } })

  // Holes.
  const holes = recognizeHoles(b)
  const byOrientation = new Map<SetupOrientation, SetupHole[]>()
  const indexed: SetupHole[] = []
  for (const h of holes) {
    const site: SetupHole = { entry: h.entry, direction: h.direction, diameter: h.diameter, depth: h.depth, form: h.form }
    const o = spindleFor(h.direction)
    if (o === undefined) { indexed.push(site); continue }
    if (!ordered.includes(o)) {
      notes.push(`a Ø${h.diameter.toFixed(3)} hole is drilled from ${o}, which the plan does not use${allowed.includes(o) ? "" : " (not allowed)"}`)
      indexed.push(site)
      continue
    }
    const list = byOrientation.get(o)
    if (list === undefined) byOrientation.set(o, [site]); else list.push(site)
  }

  const setups: PlannedSetup[] = ordered.map((o) => {
    const mine = firstReach.get(o)!
    const mineArea = mine.reduce((sum, f) => sum + area[f]!, 0)
    let prismatic: SetupPrismatic
    try {
      const r = brepFeatures(o === "+Z" ? b : transformBrep(b, setupTransform(o)), o)
      prismatic = r.features !== undefined
        ? { ok: true, holes: r.features.holes.length, pockets: r.features.pockets.length, outlines: r.features.outlines.length }
        : { ok: false, reason: r.reason }
    } catch (cause) {
      prismatic = { ok: false, reason: `${o}: recognition failed (${cause instanceof Error ? cause.message : String(cause)})` }
    }
    return { orientation: o, faces: mine, area: mineArea, share: needArea > 0 ? mineArea / needArea : 0, holes: byOrientation.get(o) ?? [], prismatic }
  })

  const reach = SETUP_ORIENTATIONS.map((o) => {
    const fs = needed.filter((f) => reaches(o, f))
    const a = fs.reduce((sum, f) => sum + area[f]!, 0)
    return { orientation: o, faces: fs.length, area: a, share: needArea > 0 ? a / needArea : 0 }
  })
  if (indexed.length > 0) notes.push(`${indexed.length} hole(s) are not drilled along an axis of a planned setup: they need 3+2 indexing`)
  if (uncovered.length > 0) notes.push(`${uncovered.length} face(s) cannot be reached by any allowed three-axis setup`)

  return {
    setups,
    uncovered,
    held: [...held].map((f) => ({ face: f, kind: kinds[f]!, area: area[f]! })),
    indexed,
    reach,
    faces,
    area: needArea,
    notes
  }
}
