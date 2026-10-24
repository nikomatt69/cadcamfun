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
import { tessellateBrep, transformBrep, type Brep, type BrepTessellation } from "../cad/brep/index.ts"
import { recognizeHoles } from "../cad/brep/features.ts"
import type { Vec3 } from "../cad/brep/math.ts"
import { brepFeatures } from "./brep-part.ts"
import { SETUP_ORIENTATIONS, setupTransform, type SetupOrientation } from "./setup.ts"

/** A sight line starts this many chord tolerances outside its facet: facets of one curved face overlap by up to the sagitta. */
const START = 1.5
/** Smallest start distance, mm. */
const EPS = 1e-4
/** A face whose reachable area share is at least this is reachable. */
const FULL = 0.999
/** `n . d` below the negative of this is a face that looks away from the spindle; within it, a wall (tessellation noise is ~1e-3). */
const WALL = 0.01
/** Triangles beyond this make the tessellation coarser (the reach test is O(triangles) per direction). */
const MAX_TRIANGLES = 80_000

const AXIS: Readonly<Record<SetupOrientation, { readonly k: 0 | 1 | 2; readonly s: 1 | -1 }>> = {
  "+X": { k: 0, s: 1 }, "-X": { k: 0, s: -1 }, "+Y": { k: 1, s: 1 }, "-Y": { k: 1, s: -1 }, "+Z": { k: 2, s: 1 }, "-Z": { k: 2, s: -1 }
}
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

/** Triangle soup in the frame of one direction: (u, v) across the sight lines, w towards the spindle. */
interface Projected {
  readonly n: number
  readonly u: Float64Array
  readonly v: Float64Array
  readonly w: Float64Array
  readonly cells: ReadonlyArray<ReadonlyArray<number>>
  readonly grid: number
  readonly min: readonly [number, number]
  readonly size: readonly [number, number]
}

const project = (positions: Float64Array, indices: Uint32Array, o: SetupOrientation): Projected => {
  const { k, s } = AXIS[o]
  const a = (k + 1) % 3, b = (k + 2) % 3
  const n = indices.length / 3
  const u = new Float64Array(n * 3), v = new Float64Array(n * 3), w = new Float64Array(n * 3)
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity
  for (let t = 0; t < n; t++) {
    for (let c = 0; c < 3; c++) {
      const i = indices[t * 3 + c]! * 3
      const pu = positions[i + a]!, pv = positions[i + b]!
      u[t * 3 + c] = pu; v[t * 3 + c] = pv; w[t * 3 + c] = s * positions[i + k]!
      u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv)
    }
  }
  const grid = Math.max(1, Math.min(128, Math.ceil(Math.sqrt(n / 4))))
  const su = Math.max(u1 - u0, 1e-9), sv = Math.max(v1 - v0, 1e-9)
  const cells: number[][] = Array.from({ length: grid * grid }, () => [])
  const cell = (x: number, lo: number, size: number): number => Math.max(0, Math.min(grid - 1, Math.floor(((x - lo) / size) * grid)))
  for (let t = 0; t < n; t++) {
    const t3 = t * 3
    const cu0 = cell(Math.min(u[t3]!, u[t3 + 1]!, u[t3 + 2]!), u0, su), cu1 = cell(Math.max(u[t3]!, u[t3 + 1]!, u[t3 + 2]!), u0, su)
    const cv0 = cell(Math.min(v[t3]!, v[t3 + 1]!, v[t3 + 2]!), v0, sv), cv1 = cell(Math.max(v[t3]!, v[t3 + 1]!, v[t3 + 2]!), v0, sv)
    for (let i = cu0; i <= cu1; i++) for (let j = cv0; j <= cv1; j++) cells[j * grid + i]!.push(t)
  }
  return { n, u, v, w, cells, grid, min: [u0, v0], size: [su, sv] }
}

/** Whether the sight line from (pu, pv) at depth `w0` towards the spindle meets a triangle other than `skip`. */
const blocked = (p: Projected, pu: number, pv: number, w0: number, skip: number): boolean => {
  const gi = Math.max(0, Math.min(p.grid - 1, Math.floor(((pu - p.min[0]) / p.size[0]) * p.grid)))
  const gj = Math.max(0, Math.min(p.grid - 1, Math.floor(((pv - p.min[1]) / p.size[1]) * p.grid)))
  for (const t of p.cells[gj * p.grid + gi]!) {
    if (t === skip) continue
    const t3 = t * 3
    const ax = p.u[t3]!, ay = p.v[t3]!, bx = p.u[t3 + 1]!, by = p.v[t3 + 1]!, cx = p.u[t3 + 2]!, cy = p.v[t3 + 2]!
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
    if (Math.abs(det) < 1e-14) continue // a triangle parallel to the sight line
    const l1 = ((pu - ax) * (cy - ay) - (cx - ax) * (pv - ay)) / det
    const l2 = ((bx - ax) * (pv - ay) - (pu - ax) * (by - ay)) / det
    const l0 = 1 - l1 - l2
    // Strictly inside: a line along an edge or a vertex is the neighbour's business (the two triangles share it).
    const inside = 1e-9
    if (l0 <= inside || l1 <= inside || l2 <= inside) continue
    const wt = l0 * p.w[t3]! + l1 * p.w[t3 + 1]! + l2 * p.w[t3 + 2]!
    if (wt > w0 + 1e-9) return true
  }
  return false
}

/**
 * The faces' reachable area share from one orientation. The triangles of the whole solid are the occluders; the samples are the
 * triangles of each face with the **exact** surface normal (the mean of their vertex normals): the slivers that join two
 * discretisations of a curved wall are tilted by a degree or two as triangles but not as surface.
 */
const reachShares = (mesh: BrepTessellation, o: SetupOrientation, start: number): Float64Array => {
  const { k, s } = AXIS[o]
  const a = (k + 1) % 3, b = (k + 2) % 3
  const proj = project(mesh.positions, mesh.indices, o)
  const faces = mesh.faces.length
  const seen = new Float64Array(faces), total = new Float64Array(faces)
  for (const fm of mesh.faces) {
    const P = fm.positions, N = fm.normals
    for (let t = 0; t < fm.indices.length; t += 3) {
      const i0 = fm.indices[t]! * 3, i1 = fm.indices[t + 1]! * 3, i2 = fm.indices[t + 2]! * 3
      const e1x = P[i1]! - P[i0]!, e1y = P[i1 + 1]! - P[i0 + 1]!, e1z = P[i1 + 2]! - P[i0 + 2]!
      const e2x = P[i2]! - P[i0]!, e2y = P[i2 + 1]! - P[i0 + 1]!, e2z = P[i2 + 2]! - P[i0 + 2]!
      const area = Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x) / 2
      if (!(area > 1e-18)) continue
      total[fm.face]! += area
      const n3 = [0, 1, 2].map((c) => N[i0 + c]! + N[i1 + c]! + N[i2 + c]!)
      const len = Math.hypot(n3[0]!, n3[1]!, n3[2]!)
      if (!(len > 1e-12)) continue
      for (let c = 0; c < 3; c++) n3[c]! /= len
      const nd = n3[k]! * s
      if (nd < -WALL) continue // looks away from the spindle
      // The sight line starts outside the surface, so the neighbours of a facet cannot block it.
      const cu = (P[i0 + a]! + P[i1 + a]! + P[i2 + a]!) / 3
      const cv = (P[i0 + b]! + P[i1 + b]! + P[i2 + b]!) / 3
      const cw = s * (P[i0 + k]! + P[i1 + k]! + P[i2 + k]!) / 3
      if (!blocked(proj, cu + start * n3[a]!, cv + start * n3[b]!, cw + start * nd, -1)) seen[fm.face]! += area
    }
  }
  const share = new Float64Array(faces)
  for (let f = 0; f < faces; f++) share[f] = total[f]! > 0 ? seen[f]! / total[f]! : 0
  return share
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
  let mesh = tessellateBrep(b, chord === undefined ? {} : { chordTol: chord })
  for (let i = 0; i < mesh.positions.length; i += 3) {
    lo = { x: Math.min(lo.x, mesh.positions[i]!), y: Math.min(lo.y, mesh.positions[i + 1]!), z: Math.min(lo.z, mesh.positions[i + 2]!) }
    hi = { x: Math.max(hi.x, mesh.positions[i]!), y: Math.max(hi.y, mesh.positions[i + 1]!), z: Math.max(hi.z, mesh.positions[i + 2]!) }
  }
  const diagonal = Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
  if (chord === undefined) {
    chord = Math.max(0.02, diagonal / 1000)
    mesh = tessellateBrep(b, { chordTol: chord })
  }
  while (mesh.indices.length / 3 > MAX_TRIANGLES && chord < diagonal / 20) {
    chord *= 2
    mesh = tessellateBrep(b, { chordTol: chord })
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
