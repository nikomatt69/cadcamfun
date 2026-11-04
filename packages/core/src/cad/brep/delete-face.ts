/**
 * Delete face with heal (spec 72 P2-10, Fusion's "Delete" in the Modify menu): the faces are removed and the faces around them are
 * extended until they meet again, so deleting the faces of a hole fills it, deleting a fillet or a chamfer restores the sharp edge,
 * deleting a boss removes it and deleting a pocket closes it.
 *
 * Construction. The removed faces `S` and the planes of their neighbours `N` bound a region: the part of the bounding box of `S` that
 * lies on the material side of every neighbour plane (the material was lost there: hole, fillet, chamfer, pocket) or on the free
 * side of all of them (material was added there: boss, rib, concave fillet). The region is built from exact Booleans of boxes, and
 * united with the body (convex boundary, material comes back) or subtracted from it (concave boundary, material goes). The region's
 * faces lie on the neighbour planes, so the result's faces on those planes are the neighbours' own, extended, and the designed
 * coincidence of the Boolean (spec 42 R3) merges them.
 *
 * Refused with the reason: neighbours that are not planar (a plane cannot be extended into a curved neighbour without a surface
 * intersection that a box cannot express), a boundary that is convex at some edges and concave at others (the faces do not close the
 * same way), a heal that does not validate, and faces that are the whole shell.
 */
import { add3, cross3, dot3, frame, length3, normalize3, scale3, type Vec3 } from "./math.ts"
import { curvePoint, curveDerivs, surfaceNormal, surfaceProject } from "./geom.ts"
import { booleanBrep } from "./boolean.ts"
import { makeBox } from "./primitives.ts"
import { tessellateBrep } from "./tessellate.ts"
import { edgeUses, type Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

export interface DeleteFaceResult {
  readonly brep: Brep
  /** `fill`: material was added back (hole, fillet, pocket); `cut`: material was removed (boss, concave fillet). */
  readonly effect: "fill" | "cut"
  /** The distinct neighbour planes the faces were extended to. */
  readonly planes: number
}

const outwardNormal = (b: Brep, fi: number, p: Vec3): Vec3 => {
  const f = b.faces[fi]!
  const q = surfaceProject(f.surface, p)
  const n = surfaceNormal(f.surface, q.u, q.v)
  return f.reversed ? scale3(n, -1) : n
}

export const deleteFaces = (b: Brep, faces: ReadonlyArray<number>): DeleteFaceResult | string => {
  const set = new Set(faces)
  if (set.size === 0) return "no face was given"
  for (const fi of set) if (!Number.isInteger(fi) || b.faces[fi] === undefined) return `face ${fi} does not exist`
  if (b.shells.length !== 1 || !b.shells[0]!.closed) return "delete-face needs one closed solid"
  if (set.size >= b.faces.length) return "the faces are the whole solid"
  const uses = edgeUses(b)
  const boundary: Array<{ edge: number; inS: { face: number; reversed: boolean }; other: number }> = []
  for (let ei = 0; ei < b.edges.length; ei++) {
    const us = uses[ei]!
    const inside = us.filter((u) => set.has(u.face)), outside = us.filter((u) => !set.has(u.face))
    if (inside.length === 1 && outside.length === 1) boundary.push({ edge: ei, inS: { face: inside[0]!.face, reversed: inside[0]!.reversed }, other: outside[0]!.face })
  }
  if (boundary.length === 0) return "the faces have no boundary with the rest of the solid"
  // Neighbour planes.
  const planes: Array<{ n: Vec3; d: number }> = []
  for (const bd of boundary) {
    const f = b.faces[bd.other]!
    if (f.surface.kind !== "plane") return `a neighbouring face (${bd.other}) is a ${f.surface.kind}; only planar neighbours can be extended`
    const s = f.surface
    const n = f.reversed ? scale3(s.frame.z, -1) : s.frame.z
    const d = dot3(n, s.frame.origin)
    if (!planes.some((p) => dot3(p.n, n) > 1 - 1e-9 && Math.abs(p.d - d) < 1e-7)) planes.push({ n, d })
  }
  // Convex (material comes back) or concave (material goes) at every boundary edge.
  let convex = 0, concave = 0
  for (const bd of boundary) {
    const e = b.edges[bd.edge]!
    const tm = (e.t0 + e.t1) / 2
    const m = curvePoint(e.curve, tm)
    const tangent = normalize3(curveDerivs(e.curve, tm)[1])
    const along = bd.inS.reversed ? scale3(tangent, -1) : tangent
    const nS = outwardNormal(b, bd.inS.face, m), nG = outwardNormal(b, bd.other, m)
    const intoS = cross3(nS, along)
    if (length3(intoS) < 1e-9) continue
    const side = dot3(normalize3(intoS), nG)
    if (side < -1e-9) convex++
    else if (side > 1e-9) concave++
  }
  if (convex > 0 && concave > 0) return `the boundary of the faces is convex at ${convex} edges and concave at ${concave}: select the whole feature (a hole with its floor, a boss with its top)`
  if (convex === 0 && concave === 0) return "the faces are tangent to their neighbours; there is no edge to heal"
  const fill = convex > 0
  // Bounding box of the removed faces: their mesh and their edges.
  const tess = tessellateBrep(b)
  const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  const grow = (p: Vec3) => { lo.x = Math.min(lo.x, p.x); lo.y = Math.min(lo.y, p.y); lo.z = Math.min(lo.z, p.z); hi.x = Math.max(hi.x, p.x); hi.y = Math.max(hi.y, p.y); hi.z = Math.max(hi.z, p.z) }
  for (const m of tess.faces) if (set.has(m.face)) for (let i = 0; i < m.positions.length; i += 3) grow({ x: m.positions[i]!, y: m.positions[i + 1]!, z: m.positions[i + 2]! })
  for (const fi of set) for (const l of b.faces[fi]!.loops) for (const c of l.coedges) {
    const e = b.edges[c.edge]!
    for (let k = 0; k <= 16; k++) grow(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 16))
  }
  const diag = Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
  const big = Math.max(4 * diag, 10)
  let region: Brep
  try {
    region = makeBox(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, frame(lo))
    for (const p of planes) {
      const o = scale3(p.n, p.d)
      const zdir = fill ? scale3(p.n, -1) : p.n
      const ref = Math.abs(p.n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
      const fr = frame(o, zdir, ref)
      const origin = add3(o, add3(scale3(fr.x, -big / 2), scale3(fr.y, -big / 2)))
      const half = makeBox(big, big, big, frame(origin, zdir, ref))
      region = booleanBrep(region, half, "intersect").brep
    }
  } catch (err) {
    return `the healing region could not be built: ${err instanceof Error ? err.message : String(err)}`
  }
  let out: Brep
  try {
    out = booleanBrep(b, region, fill ? "union" : "subtract").brep
  } catch (err) {
    return `the heal failed: ${err instanceof Error ? err.message : String(err)}`
  }
  const check = validateBrep(out)
  if (!check.valid) return `the heal did not validate: ${check.issues[0]?.message ?? "unknown"}`
  if (out.shells.length !== 1) return "the heal left more than one shell"
  return { brep: out, effect: fill ? "fill" : "cut", planes: planes.length }
}
