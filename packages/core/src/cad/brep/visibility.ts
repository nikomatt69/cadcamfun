/**
 * Line-of-sight visibility of the faces of an exact solid along one of the six axes: which share of each face's area a tool coming
 * along that axis can see. It ray-casts the triangles of the exact tessellation (every sight line is parallel to an axis, so the
 * casting is a 2D grid lookup), with the exact surface normal of each facet, not the normal of its triangle: the slivers that join
 * two discretisations of a curved wall are tilted by a degree or two as triangles but not as surface.
 *
 * It is the one place that decides "can this face be seen from this side": the setup planner (`cam/setup-plan.ts`) and the shadow
 * of a solid (`brep/shadow.ts`) both read it.
 */
import type { BrepTessellation } from "./tessellate.ts"

/** The six directions a three-axis setup can look along: the side of the part that faces the spindle. */
export type Axis6 = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z"

/** A sight line starts this many chord tolerances outside its facet: facets of one curved face overlap by up to the sagitta. */
export const START = 1.5
/** Smallest start distance, mm. */
export const EPS = 1e-4
/** `n . d` below the negative of this is a face that looks away from the spindle; within it, a wall (tessellation noise is ~1e-3). */
const WALL = 0.01

const AXIS: Readonly<Record<Axis6, { readonly k: 0 | 1 | 2; readonly s: 1 | -1 }>> = {
  "+X": { k: 0, s: 1 }, "-X": { k: 0, s: -1 }, "+Y": { k: 1, s: 1 }, "-Y": { k: 1, s: -1 }, "+Z": { k: 2, s: 1 }, "-Z": { k: 2, s: -1 }
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

const project = (positions: Float64Array, indices: Uint32Array, o: Axis6): Projected => {
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
    // A line along an edge or through a vertex grazes this triangle and its neighbour alike: it is blocked by either, so one
    // of them is enough (skipping both let a sight line slip through the seam of a roof tessellated symmetrically to its floor).
    const grazing = 1e-9
    if (l0 < -grazing || l1 < -grazing || l2 < -grazing) continue
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
export const reachShares = (mesh: BrepTessellation, o: Axis6, start: number): Float64Array => {
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
