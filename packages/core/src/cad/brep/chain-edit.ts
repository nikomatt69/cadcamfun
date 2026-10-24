/**
 * Push/pull of the smooth wall of an extrusion on the exact model (spec 40 U2): a rounded edge's fillet belongs to a chain of vertical walls
 * (planes and cylinders along Z) that run into each other tangentially, like the wall of a plate with rounded corners, or the end of a rib. The
 * mesh rebuild offsets the whole smooth chain along its normals (`history.ts` `pushpull` of a curved face), leaving a step where the chain stops.
 * Seen from above the chain is a curve of lines and arcs, closed (the wall all the way round a plate or a pocket) or open (it ends at a corner or an
 * edge); every piece moves exactly (a line parallel, an arc keeping its centre and changing its radius) and the pieces still meet tangentially.
 * The edit unites (out of the solid) or subtracts (into it) the region between the curve and its moved copy, swept over the wall's height; for an
 * open chain the region is closed by a straight connector across each end, which is the step. The tool reaches a little into the solid or the void
 * past the old curve so none of its faces is identical to the old wall.
 *
 * The wall's top and bottom may be level (the sweep is an extrusion between the two levels) or planes of any slope (the sweep is cut by those two
 * planes). A top or bottom that is not a plane (a dome, a free-form face), a chain whose walls do not share the same top and bottom plane, a move that
 * makes an arc collapse and an edit that runs into a neighbouring feature are refused with the reason.
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { curvePoint, surfaceNormal, surfaceProject } from "./geom.ts"
import { massProperties } from "./mass.ts"
import { frame, type Vec3 } from "./math.ts"
import { makeBox } from "./primitives.ts"
import { extrudeProfile, loopMoments, reverseLoop, segmentPoint, type ProfileSegment } from "./sweep.ts"
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

/** A plane, and a point of the wall on the side of it the wall lies on. */
interface Plane { readonly origin: Vec3; readonly normal: Vec3; readonly wallSide: Vec3 }

interface Chain {
  /** The curve seen from above, in the order of travel (outward is to the right of it). */
  readonly segments: ReadonlyArray<ProfileSegment>
  readonly closed: boolean
  readonly zLo: number
  readonly zHi: number
  /** The planes the wall stands on and ends in, with their normals pointing out of the solid. */
  readonly bottom: Plane
  readonly top: Plane
  /** Both planes are horizontal at the ends of the vertical edges: the sweep is a plain extrusion. */
  readonly level: boolean
}

const near2 = (p: { x: number; y: number }, q: { x: number; y: number }): boolean => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6

/** The smooth chain of vertical walls `face` belongs to, seen from above, or why it is not one this edit takes. */
const readChain = (b: Brep, face: number): Chain | string => {
  if (!isWall(b, face)) return "not a vertical wall"
  const uses = edgeUses(b)
  const vertical = (e: number): boolean => { const c = b.edges[e]!.curve; return c.kind === "line" && Math.abs(Math.abs(c.dir.z) - 1) < 1e-9 }
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
  const degrees = chain.map((fi) => (links.get(fi) ?? []).length)
  if (degrees.some((d) => d > 2)) return "the smooth wall branches (three walls meet tangentially along one edge)"
  const ends = degrees.filter((d) => d < 2).length
  const closed = ends === 0
  if (!closed && !(ends === 2 || chain.length === 1)) return "the smooth wall is neither a closed chain nor one path with two ends"
  // Each wall as a piece of curve seen from above, travelled with the outside on its right.
  const pieces: Array<{ readonly start: { x: number; y: number }; readonly end: { x: number; y: number }; readonly seg: ProfileSegment }> = []
  let zLo = Infinity, zHi = -Infinity
  const topNeighbours: Array<Plane | string> = [], bottomNeighbours: Array<Plane | string> = []
  for (const fi of chain) {
    const f = b.faces[fi]!
    const ver: Vec3[] = []
    const flat: Array<{ readonly edge: number; readonly zMean: number }> = []
    for (const l of f.loops) for (const c of l.coedges) {
      const e = b.edges[c.edge]!
      if (vertical(c.edge)) {
        const p0 = curvePoint(e.curve, e.t0), p1 = curvePoint(e.curve, e.t1)
        ver.push(p0, p1)
        zLo = Math.min(zLo, p0.z, p1.z); zHi = Math.max(zHi, p0.z, p1.z)
      } else {
        const zs = [0, 0.5, 1].map((t) => curvePoint(e.curve, e.t0 + (e.t1 - e.t0) * t).z)
        flat.push({ edge: c.edge, zMean: (zs[0]! + zs[1]! + zs[2]!) / 3 })
      }
    }
    // The wall's two vertical edges: their positions seen from above are its ends.
    const pts: Array<{ x: number; y: number }> = []
    for (const p of ver) if (!pts.some((q) => near2(q, p))) pts.push({ x: p.x, y: p.y })
    if (pts.length !== 2) return "a wall of the chain does not stand between two vertical edges"
    if (flat.length < 2) return "a wall of the chain has no top and bottom edge"
    flat.sort((x, y) => x.zMean - y.zMean)
    // The lowest and the highest point of the wall's vertical edges: the wall lies above the bottom plane's side of the low point... below the top plane.
    const lowPoint = ver.reduce((m, p) => (p.z < m.z ? p : m)), highPoint = ver.reduce((m, p) => (p.z > m.z ? p : m))
    const planeOf = (edge: number, side: Vec3): Plane | string => {
      const other = uses[edge]!.find((u) => u.face !== fi)
      if (other === undefined) return "the top or bottom of a wall is open"
      const s = b.faces[other.face]!.surface
      if (s.kind !== "plane") return `the ${s.kind} face at the top or bottom of the wall is not a plane: a curved top has no exact offset of the wall`
      const nat = s.frame.z
      return { origin: s.frame.origin, normal: b.faces[other.face]!.reversed ? scale3(nat, -1) : nat, wallSide: side }
    }
    bottomNeighbours.push(planeOf(flat[0]!.edge, highPoint)); topNeighbours.push(planeOf(flat[flat.length - 1]!.edge, lowPoint))
    // Direction of travel: z x outward, so the outside is on the right.
    const mid = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 }
    const s = f.surface
    let seg: ProfileSegment, startPt = pts[0]!, endPt = pts[1]!
    if (s.kind === "plane") {
      const n = normalize3(outward(b, fi, { x: mid.x, y: mid.y, z: (zLo + zHi) / 2 }))
      const t = { x: -n.y, y: n.x }
      if ((endPt.x - startPt.x) * t.x + (endPt.y - startPt.y) * t.y < 0) [startPt, endPt] = [endPt, startPt]
      seg = { kind: "line", a: startPt, b: endPt }
    } else if (s.kind === "cylinder") {
      const c = { x: s.frame.origin.x, y: s.frame.origin.y }
      // Which way round the cylinder the wall goes: the side of its two ends that holds the middle of its bottom edge.
      const bottomEdge = b.edges[flat[0]!.edge]!
      const m = curvePoint(bottomEdge.curve, (bottomEdge.t0 + bottomEdge.t1) / 2)
      const ang = (p: { x: number; y: number }) => Math.atan2(p.y - c.y, p.x - c.x)
      const wrap = (x: number) => ((x % TAU) + TAU) % TAU
      const a0 = ang(startPt), a1 = ang(endPt), am = ang(m)
      const ccw01 = wrap(am - a0) <= wrap(a1 - a0)
      // The outside of a convex cylinder is away from the centre: travelling counter-clockwise has the centre on the left, the outside on the right.
      const nOut = outward(b, fi, { x: m.x, y: m.y, z: (zLo + zHi) / 2 })
      const convex = (m.x - c.x) * nOut.x + (m.y - c.y) * nOut.y > 0
      const travelCcw = convex
      if (travelCcw !== ccw01) [startPt, endPt] = [endPt, startPt]
      const s0 = ang(startPt), s1 = ang(endPt)
      const sweep = travelCcw ? wrap(s1 - s0) : -wrap(s0 - s1)
      seg = { kind: "arc", center: c, radius: s.radius, start: s0, end: s0 + sweep }
    } else return "a wall of the chain is neither a plane nor a cylinder"
    pieces.push({ start: startPt, end: endPt, seg })
  }
  if (!(zHi - zLo > 1e-6)) return "the wall has no height"
  // Put the pieces in order of travel.
  const hasPredecessor = pieces.map((p, i) => pieces.some((q, j) => j !== i && near2(q.end, p.start)))
  const first = closed ? 0 : hasPredecessor.findIndex((h) => !h)
  if (first < 0) return "the pieces of the smooth wall do not form a path"
  const ordered: ProfileSegment[] = [pieces[first]!.seg]
  const used = new Set([first])
  let current = pieces[first]!
  for (let k = 1; k < pieces.length; k++) {
    const idx = pieces.findIndex((x, i) => !used.has(i) && near2(x.start, current.end))
    if (idx < 0) return "the pieces of the smooth wall do not join end to start"
    used.add(idx); current = pieces[idx]!; ordered.push(current.seg)
  }
  if (closed && !near2(current.end, pieces[first]!.start)) return "the pieces of the smooth wall do not close"
  // One top plane and one bottom plane for the whole wall (or both level).
  const same = (a: Plane, c: Plane) => Math.abs(dot3(normalize3(a.normal), normalize3(c.normal)) - 1) < 1e-9 && Math.abs(dot3(sub3(a.origin, c.origin), normalize3(a.normal))) < 1e-6
  const unify = (planes: ReadonlyArray<Plane | string>): Plane | string => {
    for (const p of planes) if (typeof p === "string") return p
    const all = planes as ReadonlyArray<Plane>
    return all.every((p) => same(p, all[0]!)) ? all[0]! : "the walls of the chain do not share one top plane (or one bottom plane)"
  }
  const top = unify(topNeighbours), bottom = unify(bottomNeighbours)
  if (typeof top === "string") return top
  if (typeof bottom === "string") return bottom
  const levelAt = (p: Plane, z: number) => Math.abs(Math.abs(p.normal.z) - 1) < 1e-9 && Math.abs(p.origin.z - z) < 1e-6
  const level = levelAt(top, zHi) && levelAt(bottom, zLo)
  return { segments: ordered, closed, zLo, zHi, top, bottom, level }
}

/** A piece of the curve moved `s` to its left (positive) or right; an arc keeps its centre and changes its radius. */
const shift = (seg: ProfileSegment, s: number): ProfileSegment => {
  if (seg.kind === "line") {
    const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
    const l = { x: (-(seg.b.y - seg.a.y) / len) * s, y: ((seg.b.x - seg.a.x) / len) * s }
    return { kind: "line", a: { x: seg.a.x + l.x, y: seg.a.y + l.y }, b: { x: seg.b.x + l.x, y: seg.b.y + l.y } }
  }
  if (seg.kind !== "arc") throw new RangeError("only lines and arcs move exactly")
  // Counter-clockwise: the centre is on the left, so moving left shortens the radius.
  const radius = seg.end > seg.start ? seg.radius - s : seg.radius + s
  if (!(radius > 1e-6)) throw new RangeError(`an arc of radius ${seg.radius.toFixed(3)} mm would be ${radius.toFixed(3)} mm: it collapses`)
  return { ...seg, radius }
}

/** The region between the curve moved by `a` and by `c` to its right (outward positive, a < c), closed by a straight connector across each end when the chain is open. */
const region = (chain: Chain, a: number, c: number): { readonly loops: ReadonlyArray<ReadonlyArray<ProfileSegment>> } => {
  // The outside is on the right of the travel: moving outward by x is moving left by -x.
  const curve = (x: number): ProfileSegment[] => chain.segments.map((s) => shift(s, -x))
  const low = curve(a), high = curve(c)
  if (chain.closed) return { loops: [low, high] }
  const end = (list: ProfileSegment[], last: boolean) => segmentPoint(list[last ? list.length - 1 : 0]!, last ? 1 : 0)
  const lowStart = end(low, false), lowEnd = end(low, true), highStart = end(high, false), highEnd = end(high, true)
  const back = reverseLoop(high)
  return { loops: [[...low, { kind: "line", a: lowEnd, b: highEnd }, ...back, { kind: "line", a: highStart, b: lowStart }]] }
}

const bigBox = (plane: Plane, size: number, overrun: number): Brep => {
  // A box standing on the plane (moved `overrun` away from the wall) and reaching to the side the wall lies on.
  const n = normalize3(plane.normal)
  const into = dot3(n, sub3(plane.wallSide, plane.origin)) >= 0 ? n : scale3(n, -1)
  const f = frame(add3(plane.origin, scale3(into, -overrun)), into)
  const corner = add3(add3(f.origin, scale3(f.x, -size / 2)), scale3(f.y, -size / 2))
  return makeBox(size, size, size, frame(corner, into, f.x))
}

/** Whether a tool may reach past the plane without touching solid: the wall lies on the solid's side of the plane, so past it is void. */
const voidBeyond = (p: Plane): boolean => dot3(normalize3(p.normal), sub3(p.wallSide, p.origin)) < 0

/**
 * The solid swept by a region over the wall's height: an extrusion between two levels, or one cut by the top and bottom planes. Subtracting
 * (`overrun` > 0), the tool reaches past a plane that has only void beyond it, so none of its faces is the solid's own.
 */
const sweep = (chain: Chain, loops: ReadonlyArray<ReadonlyArray<ProfileSegment>>, reach: number, overrun = 0): Brep => {
  const up = { x: 0, y: 0, z: 1 }
  const overTop = voidBeyond(chain.top) ? overrun : 0
  const overBottom = voidBeyond(chain.bottom) ? overrun : 0
  if (chain.level) {
    const lo = chain.zLo - overBottom, hi = chain.zHi + overTop
    return extrudeProfile({ loops }, hi - lo, { placement: frame({ x: 0, y: 0, z: lo }, up, { x: 1, y: 0, z: 0 }) })
  }
  const tan = (p: Plane) => Math.hypot(p.normal.x, p.normal.y) / Math.max(1e-9, Math.abs(p.normal.z))
  const margin = chain.zHi - chain.zLo + 2 * (reach + SKIN + 1) * (1 + tan(chain.top) + tan(chain.bottom))
  const prism = extrudeProfile({ loops }, chain.zHi - chain.zLo + 2 * margin, { placement: frame({ x: 0, y: 0, z: chain.zLo - margin }, up, { x: 1, y: 0, z: 0 }) })
  const size = 10 * (margin + 100)
  let out = booleanBrep(prism, bigBox(chain.top, size, overTop), "intersect").brep
  out = booleanBrep(out, bigBox(chain.bottom, size, overBottom), "intersect").brep
  return out
}

/** The solid with the smooth wall `face` belongs to offset by `distance` along its normals (out of the solid when positive), or why not. */
export const pushPullChain = (b: Brep, face: number, distance: number): Brep | string => {
  if (!(Math.abs(distance) > 1e-9)) return "the distance must be a non-zero number"
  const chain = readChain(b, face)
  if (typeof chain === "string") return chain
  const gains = distance > 0
  try {
    // The tool reaches `SKIN` into the solid (united) or into the void (subtracted) past the old wall; the pure region is the volume the edit accounts for.
    const tool = gains ? region(chain, -SKIN, distance) : region(chain, distance, SKIN)
    const pure = gains ? region(chain, 0, distance) : region(chain, distance, 0)
    const before = massProperties(b).volume
    // Subtracting, the tool may reach past the top and bottom (there is only void there): its faces are then not the solid's own.
    const solid = booleanBrep(b, sweep(chain, tool.loops, Math.abs(distance), gains ? 0 : SKIN), gains ? "union" : "subtract").brep
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const expected = (gains ? 1 : -1) * massProperties(sweep(chain, pure.loops, Math.abs(distance))).volume
    const after = massProperties(solid).volume
    // The expected volume is the integral of the swept region; where a sloped plane cuts a cylinder the integrator's trimming is good to a few parts in 10^4.
    const slack = chain.level ? 1e-6 : 1e-3
    if (Math.abs(after - before - expected) > 1e-6 * Math.max(before, 1) + slack * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the offset wall accounts for ${expected.toFixed(6)} mm³: it ran into a neighbouring feature`
    }
    return solid
  } catch (cause) {
    return `the offset failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}
void cross3; void length3; void loopMoments
