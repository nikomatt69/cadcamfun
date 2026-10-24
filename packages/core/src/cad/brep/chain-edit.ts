/**
 * Push/pull of the smooth wall of an extrusion on the exact model (spec 40 U2): a rounded edge's fillet belongs to a chain of vertical walls
 * (planes and cylinders along Z) that run into each other tangentially all the way round, like the wall of a plate with rounded corners. The
 * mesh rebuild offsets the whole smooth chain along its normals (`history.ts` `pushpull` of a curved face); for a closed chain between two
 * level planes that is the offset of its outline, which the kernel does exactly (`offsetLoop`: lines move parallel, arcs keep their centre and
 * change their radius). The edit unites (out of the solid) or subtracts (into it) the ring between the outline and its offset, extruded over
 * the wall's height; the tool reaches a little into the solid or the void past the old outline so none of its faces is identical to the old wall.
 *
 * A chain that is not closed, one whose faces are not all between the same two levels, an offset that makes the outline collapse or cross itself,
 * and an edit that runs into a neighbouring feature are refused with the reason.
 */
import { dot3, normalize3, scale3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { curvePoint, surfaceNormal, surfaceProject } from "./geom.ts"
import { massProperties } from "./mass.ts"
import { frame, type Vec3 } from "./math.ts"
import { extrudeProfile, loopMoments, offsetLoop, segmentPoint, type ProfileLoop, type ProfileSegment } from "./sweep.ts"
import { edgeUses, type Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

const TAU = 2 * Math.PI
const SKIN = 0.5
const TANGENT = Math.cos((0.5 * Math.PI) / 180)

const isWall = (b: Brep, face: number): boolean => {
  const s = b.faces[face]!.surface
  return s.kind === "plane" ? Math.abs(s.frame.z.z) < 1e-6 : s.kind === "cylinder" && Math.abs(Math.abs(s.frame.z.z) - 1) < 1e-9
}

const outward = (b: Brep, face: number, p: Vec3): Vec3 => {
  const f = b.faces[face]!, uv = surfaceProject(f.surface, p)
  const n = surfaceNormal(f.surface, uv.u, uv.v)
  return f.reversed ? scale3(n, -1) : n
}

/** The loop of the bottom edges of the closed tangent chain of vertical walls `face` belongs to, with its height, or why there is none. */
const readChain = (b: Brep, face: number): { readonly loop: ProfileLoop; readonly z0: number; readonly height: number; readonly faces: ReadonlyArray<number> } | string => {
  if (!isWall(b, face)) return "not a vertical wall"
  const uses = edgeUses(b)
  const vertical = (e: number): boolean => { const c = b.edges[e]!.curve; return c.kind === "line" && Math.abs(Math.abs(c.dir.z) - 1) < 1e-9 }
  // The chain: walls that meet tangentially along vertical edges.
  const links = new Map<number, number[]>()
  const chain = [face], seen = new Set([face])
  for (let k = 0; k < chain.length; k++) {
    const fi = chain[k]!
    const next: number[] = []
    for (const l of b.faces[fi]!.loops) for (const c of l.coedges) {
      if (!vertical(c.edge)) continue
      const e = b.edges[c.edge]!
      const mid = curvePoint(e.curve, (e.t0 + e.t1) / 2)
      for (const u of uses[c.edge]!) {
        if (u.face === fi || !isWall(b, u.face)) continue
        if (dot3(normalize3(outward(b, fi, mid)), normalize3(outward(b, u.face, mid))) < TANGENT) continue
        if (!next.includes(u.face)) next.push(u.face)
        if (!seen.has(u.face)) { seen.add(u.face); chain.push(u.face) }
      }
    }
    links.set(fi, next)
  }
  for (const fi of chain) if ((links.get(fi) ?? []).length !== 2) return "the smooth wall is not a closed chain: it ends at a corner or an edge (only the whole wall round a plate or a pocket is offset)"
  let zLo = Infinity, zHi = -Infinity
  for (const fi of chain) for (const l of b.faces[fi]!.loops) for (const c of l.coedges) {
    const e = b.edges[c.edge]!
    for (let k = 0; k <= 4; k++) { const z = curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 4).z; zLo = Math.min(zLo, z); zHi = Math.max(zHi, z) }
  }
  if (!(zHi - zLo > 1e-6)) return "the wall has no height"
  // Each wall's bottom edge, in the order the chain goes round.
  const bottoms: Array<{ readonly start: Vec3; readonly end: Vec3; readonly seg: ProfileSegment }> = []
  for (const fi of chain) {
    let found = false
    for (const l of b.faces[fi]!.loops) for (const c of l.coedges) {
      const e = b.edges[c.edge]!
      const pts = [0, 0.5, 1].map((t) => curvePoint(e.curve, e.t0 + (e.t1 - e.t0) * t))
      if (vertical(c.edge) || pts.some((p) => Math.abs(p.z - zLo) > 1e-6)) continue
      const [p0, pm, p1] = c.reversed ? [pts[2]!, pts[1]!, pts[0]!] : [pts[0]!, pts[1]!, pts[2]!]
      if (e.curve.kind === "line") bottoms.push({ start: p0, end: p1, seg: { kind: "line", a: { x: p0.x, y: p0.y }, b: { x: p1.x, y: p1.y } } })
      else if (e.curve.kind === "circle") {
        const o = e.curve.frame.origin, ang = (p: Vec3) => Math.atan2(p.y - o.y, p.x - o.x)
        const a0 = ang(p0), a1 = ang(p1), am = ang(pm)
        const wrap = (x: number) => ((x % TAU) + TAU) % TAU
        const ccw = wrap(a1 - a0), mid = wrap(am - a0)
        const sweep = mid <= ccw ? ccw : -(TAU - ccw)
        bottoms.push({ start: p0, end: p1, seg: { kind: "arc", center: { x: o.x, y: o.y }, radius: e.curve.radius, start: a0, end: a0 + sweep } })
      } else return "a wall of the chain has an edge that is neither a line nor a circle"
      found = true
    }
    if (!found) return "a wall of the chain has no bottom edge at the lowest level"
  }
  const ordered: ProfileSegment[] = []
  const near = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6
  const used = new Set<number>()
  let current = bottoms[0]!
  used.add(0); ordered.push(current.seg)
  for (let k = 1; k < bottoms.length; k++) {
    const idx = bottoms.findIndex((x, i) => !used.has(i) && near(x.start, current.end))
    if (idx < 0) return "the bottom edges of the chain do not form one loop"
    used.add(idx); current = bottoms[idx]!; ordered.push(current.seg)
  }
  if (!near(current.end, bottoms[0]!.start)) return "the bottom edges of the chain do not close"
  return { loop: ordered, z0: zLo, height: zHi - zLo, faces: chain }
}

const insideLoop = (loop: ProfileLoop, x: number, y: number): boolean => {
  let inside = false
  for (const s of loop) {
    const n = s.kind === "line" ? 1 : 64
    let prev = segmentPoint(s, 0)
    for (let i = 1; i <= n; i++) {
      const p = segmentPoint(s, i / n)
      if ((prev.y > y) !== (p.y > y) && x < prev.x + ((y - prev.y) / (p.y - prev.y)) * (p.x - prev.x)) inside = !inside
      prev = p
    }
  }
  return inside
}

/** The solid with the closed smooth wall `face` belongs to offset by `distance` along its normals (out of the solid when positive), or why not. */
export const pushPullChain = (b: Brep, face: number, distance: number): Brep | string => {
  if (!(Math.abs(distance) > 1e-9)) return "the distance must be a non-zero number"
  const chain = readChain(b, face)
  if (typeof chain === "string") return chain
  const { loop, z0, height } = chain
  // The solid is inside the loop when the outward normal of the wall points away from it.
  const f = b.faces[face]!
  const probe = (() => { const e = b.edges[f.loops[0]!.coedges.find((c) => b.edges[c.edge]!.curve.kind !== "line" || Math.abs(Math.abs((b.edges[c.edge]!.curve as { dir: Vec3 }).dir.z) - 1) > 1e-9)!.edge]!; return curvePoint(e.curve, (e.t0 + e.t1) / 2) })()
  const n = normalize3(outward(b, face, probe))
  const isOuter = !insideLoop(loop, probe.x + n.x * 1e-4, probe.y + n.y * 1e-4)
  try {
    const moved = offsetLoop(loop, isOuter ? -distance : distance)
    const gains = distance > 0
    // The tool: the ring between the moved outline and an outline a skin further into the solid (united) or into the void (subtracted).
    const intoSolid = isOuter ? SKIN : -SKIN
    const other = offsetLoop(loop, gains ? intoSolid : -intoSolid)
    const ring = extrudeProfile({ loops: [moved, other] }, height, { placement: frame({ x: 0, y: 0, z: z0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }) })
    const before = massProperties(b).volume
    const solid = booleanBrep(b, ring, gains ? "union" : "subtract").brep
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const expected = (Math.abs(loopMoments(moved).area) - Math.abs(loopMoments(loop).area)) * height * (isOuter ? 1 : -1)
    const after = massProperties(solid).volume
    if (Math.abs(after - before - expected) > 1e-6 * Math.max(before, 1) + 1e-6 * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the offset wall accounts for ${expected.toFixed(6)} mm³: it ran into a neighbouring feature`
    }
    return solid
  } catch (cause) {
    return `the offset failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}
