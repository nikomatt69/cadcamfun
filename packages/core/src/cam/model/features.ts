/**
 * Named machining features on the exact B-rep, with the faces they own (spec 72 P2-5): the slots, steps and ring grooves a floor and
 * its walls make, and the chamfer and fillet bands that break the edges. Holes are `recognizeHoles` (`cad/brep/features.ts`) and stay
 * there; this module does not look at them and never claims a face of a hole.
 *
 * Everything comes from the faces and how they meet, no history needed, so a STEP import and a Boolean result read alike:
 *
 *   edges      two faces meet in a convex edge (material in a corner), a concave edge (a corner of void) or tangentially; the kind
 *              is read from the outward normals at the middle of the edge (`n_B . (n_A x t)`, t the direction the face A runs the edge)
 *   bands      a fillet is a cylinder / torus / sphere tangent to its neighbours on two or more sides (vertical concave radii of
 *              slot ends and pocket corners are not edge treatments and are left to the cutter radius); a chamfer is a narrow planar
 *              or conical face whose two long edges are non-tangent, of one kind, and turn 8..82 degrees. Both are no wider than
 *              `maxBand` (default half of the smallest extent of the part). Touching faces of one kind are one band
 *   slots      an up-facing planar floor with two facing parallel walls (concave edges, a fillet band between floor and wall is looked
 *              through); the other floor edges are open (convex) or closed by a perpendicular wall or a round end. A slot closed at
 *              both ends by plain walls is a pocket and is not named here (the pocket recognition owns it)
 *   steps      an up-facing floor with exactly one wall
 *   grooves    a full cylinder between two coaxial planar rings that face each other (a ring groove, outside or inside)
 *
 * Limits, stated rather than guessed around: the machining axis is one direction (default +Z) and a floor must face along it;
 * a slot with no floor (cut through the whole part) is not recognised; bands are found only between planes and cylinders and the
 * band `loops` only along straight and circular edges. A feature that cannot be read is simply absent, never approximated.
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3, type Vec2, type Vec3 } from "../../cad/vec.ts"
import { curveDerivs, curvePoint, edgeUses, surfaceNormal, surfaceProject, type Brep } from "../../cad/brep/index.ts"

export type NamedFeatureKind = "slot" | "step" | "groove" | "chamfer-band" | "fillet-band"
export type SlotEnd = "open" | "closed" | "round"

export interface NamedFeature {
  readonly id: string
  readonly kind: NamedFeatureKind
  /** The faces of the B-rep the feature owns (indices into `Brep.faces`). */
  readonly faces: ReadonlyArray<number>
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 }
  /** Slot: channel width between the walls, depth of the walls above the floor, length along the walls. Step: height of the wall, length of the wall. Groove: width, depth. */
  readonly width?: number
  readonly depth?: number
  readonly length?: number
  /** Slot / step: the floor face, the Z of the floor, the Z of the top of the walls. */
  readonly floor?: number
  readonly floorZ?: number
  readonly topZ?: number
  /** Slot / step: the walls (face indices), unit direction along the slot or wall. */
  readonly walls?: ReadonlyArray<number>
  readonly direction?: Vec3
  readonly ends?: ReadonlyArray<SlotEnd>
  /** Groove: the axis, a point on it, the diameter of its floor and whether it cuts the outside of a shaft. */
  readonly origin?: Vec3
  readonly diameter?: number
  readonly external?: boolean
  /** Bands: material in a corner (convex) or a corner of void; the size (chamfer width across the face, fillet radius); the turn at the long edges, degrees. */
  readonly convex?: boolean
  readonly size?: number
  readonly turn?: number
  /** Chamfer band along horizontal edges: Z of its upper and lower edge and the closed XY loops of the lower edge (where it meets the wall). */
  readonly upperZ?: number
  readonly lowerZ?: number
  readonly loops?: ReadonlyArray<ReadonlyArray<Vec2>>
  /** For each loop: `outside` when the material is inside it (an outline), `inside` when it is outside it (the rim of a pocket or a hole). */
  readonly loopSides?: ReadonlyArray<"outside" | "inside">
  /** Fillet band of cylinders that all share one axis: that unit axis (an edge along it, or an outline corner radius when parallel to the machining axis). */
  readonly axis?: Vec3
}

export interface FeatureOptions {
  /** The direction a tool comes from; floors face it. Default +Z. */
  readonly axis?: Vec3
  /** Widest band (chamfer width, fillet radius), mm. Default half of the smallest extent of the part. */
  readonly maxBand?: number
}

const TANGENT_DEG = 0.5
const PARALLEL = 1e-6
const DEG = Math.PI / 180

type LinkKind = "convex" | "concave" | "tangent"
interface Link {
  readonly edge: number
  readonly a: number
  readonly b: number
  readonly kind: LinkKind
  /** Angle between the outward normals, degrees. */
  readonly turn: number
  readonly length: number
  readonly mid: Vec3
}

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v))

/** Reads a B-rep's faces and how they meet. */
class Topology {
  readonly links: Link[] = []
  readonly byFace = new Map<number, Link[]>()
  private readonly planeN = new Map<number, Vec3>()

  constructor(readonly b: Brep) {
    const uses = edgeUses(b)
    b.edges.forEach((e, ei) => {
      const u = uses[ei]!
      if (u.length !== 2 || u[0]!.face === u[1]!.face) return
      const tm = (e.t0 + e.t1) / 2
      const mid = curvePoint(e.curve, tm)
      const t = normalize3(curveDerivs(e.curve, tm)[1])
      const nA = this.normal(u[0]!.face, mid), nB = this.normal(u[1]!.face, mid)
      const dirA = u[0]!.reversed ? scale3(t, -1) : t
      const kappa = dot3(nB, cross3(nA, dirA))
      const turn = Math.acos(clamp1(dot3(nA, nB))) / DEG
      const kind: LinkKind = turn < TANGENT_DEG ? "tangent" : kappa < 0 ? "convex" : "concave"
      let length = 0
      let prev = curvePoint(e.curve, e.t0)
      for (let k = 1; k <= 16; k++) { const p = curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 16); length += length3(sub3(p, prev)); prev = p }
      const link: Link = { edge: ei, a: u[0]!.face, b: u[1]!.face, kind, turn, length, mid }
      this.links.push(link)
      for (const f of [link.a, link.b]) { const l = this.byFace.get(f); if (l === undefined) this.byFace.set(f, [link]); else l.push(link) }
    })
  }

  /** Outward normal of a face at a point on it. */
  normal(fi: number, p: Vec3): Vec3 {
    const f = this.b.faces[fi]!
    if (f.surface.kind === "plane") {
      let n = this.planeN.get(fi)
      if (n === undefined) { n = f.reversed ? scale3(f.surface.frame.z, -1) : f.surface.frame.z; this.planeN.set(fi, n) }
      return n
    }
    const q = surfaceProject(f.surface, p)
    const n = surfaceNormal(f.surface, q.u, q.v)
    return f.reversed ? scale3(n, -1) : n
  }

  linksOf(fi: number): ReadonlyArray<Link> { return this.byFace.get(fi) ?? [] }
  other(l: Link, fi: number): number { return l.a === fi ? l.b : l.a }

  /** Sampled boundary points of a face. */
  points(fi: number, n = 8): Vec3[] {
    const out: Vec3[] = []
    for (const loop of this.b.faces[fi]!.loops) for (const c of loop.coedges) {
      const e = this.b.edges[c.edge]!
      for (let k = 0; k <= n; k++) out.push(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / n))
    }
    return out
  }
}

const boundsOf = (pts: ReadonlyArray<Vec3>): { min: Vec3; max: Vec3 } => ({
  min: { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)), z: Math.min(...pts.map((p) => p.z)) },
  max: { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)), z: Math.max(...pts.map((p) => p.z)) }
})

const median = (v: ReadonlyArray<number>): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!

/** Distance from a point to a sampled polyline. */
const distanceToPoints = (p: Vec3, pts: ReadonlyArray<Vec3>): number => {
  let best = Infinity
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, d = sub3(pts[i + 1]!, a)
    const l2 = dot3(d, d)
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot3(sub3(p, a), d) / l2))
    best = Math.min(best, length3(sub3(p, add3(a, scale3(d, t)))))
  }
  return best
}

// ---------------------------------------------------------------- bands

interface BandFace {
  readonly face: number
  readonly kind: "chamfer-band" | "fillet-band"
  readonly size: number
  readonly convex: boolean
  readonly turn: number
  /** The long non-tangent links of a chamfer face. */
  readonly long: ReadonlyArray<Link>
  /** Axis of a cylinder fillet. */
  readonly axis?: Vec3
}

const bandFaces = (t: Topology, axis: Vec3, maxBand: number): BandFace[] => {
  const out: BandFace[] = []
  t.b.faces.forEach((f, fi) => {
    const links = t.linksOf(fi)
    const tangent = links.filter((l) => l.kind === "tangent")
    const s = f.surface
    // Fillets: cylinder, torus or sphere that runs tangent into its neighbours.
    if (s.kind === "cylinder" || s.kind === "torus" || s.kind === "sphere") {
      const neighbours = new Set(tangent.map((l) => t.other(l, fi)))
      const size = s.kind === "cylinder" ? s.radius : s.kind === "torus" ? s.minor : s.radius
      const need = s.kind === "sphere" ? 3 : 2
      if (neighbours.size < need || size > maxBand) return
      const mid = t.points(fi, 4)[Math.floor(t.points(fi, 4).length / 2)]!
      const n = t.normal(fi, mid)
      // A cylinder parallel to the machining axis is a corner radius of an outline, a slot end or a pocket: left to the cutter radius when concave.
      const vertical = s.kind === "cylinder" && Math.abs(Math.abs(dot3(s.frame.z, axis)) - 1) < PARALLEL
      const convex = s.kind === "sphere" || s.kind === "torus"
        ? (links.find((l) => l.kind !== "tangent")?.kind ?? "convex") === "convex"
        : dot3(n, sub3(mid, add3(s.frame.origin, scale3(s.frame.z, dot3(sub3(mid, s.frame.origin), s.frame.z))))) > 0
      if (vertical && !convex) return
      out.push({ face: fi, kind: "fillet-band", size, convex, turn: 0, long: [], ...(s.kind === "cylinder" ? { axis: s.frame.z } : {}) })
      return
    }
    // Chamfers: a narrow plane (or cone) between two faces it is not tangent to.
    if (s.kind !== "plane" && s.kind !== "cone") return
    const hard = links.filter((l) => l.kind !== "tangent").sort((x, y) => y.length - x.length)
    if (hard.length < 2 || tangent.length > 0) return
    const [e1, e2] = [hard[0]!, hard[1]!]
    if (t.other(e1, fi) === t.other(e2, fi) || e1.kind !== e2.kind) return
    // The long edges of a chamfer run side by side: two straight ones must be parallel.
    const c1 = t.b.edges[e1.edge]!.curve, c2 = t.b.edges[e2.edge]!.curve
    if (c1.kind === "line" && c2.kind === "line" && Math.abs(dot3(c1.dir, c2.dir)) < 0.99) return
    if (!(e1.turn >= 8 && e1.turn <= 82 && e2.turn >= 8 && e2.turn <= 82)) return
    const edgePts = (l: Link): Vec3[] => { const e = t.b.edges[l.edge]!; return Array.from({ length: 17 }, (_, k) => curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 16)) }
    const width = distanceToPoints(e1.mid, edgePts(e2))
    // A chamfer is a band: clearly longer than it is wide.
    if (!(width > 0) || width > maxBand || e1.length < 1.5 * width) return
    out.push({ face: fi, kind: "chamfer-band", size: width, convex: e1.kind === "convex", turn: (e1.turn + e2.turn) / 2, long: [e1, e2] })
  })
  return out
}

/** Chains line / circle edges (by vertex) into closed XY loops. */
const chainLoops = (b: Brep, edges: ReadonlyArray<number>): Vec2[][] => {
  const at = new Map<number, number[]>()
  edges.forEach((ei, i) => { for (const v of [b.edges[ei]!.v0, b.edges[ei]!.v1]) { const l = at.get(v); if (l === undefined) at.set(v, [i]); else l.push(i) } })
  const used = new Array<boolean>(edges.length).fill(false)
  const loops: Vec2[][] = []
  for (let s = 0; s < edges.length; s++) {
    if (used[s]) continue
    used[s] = true
    const first = b.edges[edges[s]!]!
    const loop: Vec2[] = []
    const sample = (ei: number, forward: boolean): void => {
      const e = b.edges[ei]!
      const n = e.curve.kind === "line" ? 1 : 24
      for (let k = 0; k < n; k++) {
        const u = forward ? k / n : 1 - k / n
        const p = curvePoint(e.curve, e.t0 + (e.t1 - e.t0) * u)
        loop.push({ x: p.x, y: p.y })
      }
    }
    sample(edges[s]!, true)
    let cur = first.v1
    while (cur !== first.v0) {
      const next = (at.get(cur) ?? []).find((i) => !used[i])
      if (next === undefined) { loop.length = 0; break }
      used[next] = true
      const e = b.edges[edges[next]!]!
      const forward = e.v0 === cur
      sample(edges[next]!, forward)
      cur = forward ? e.v1 : e.v0
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

const bands = (t: Topology, axis: Vec3, maxBand: number): { features: NamedFeature[]; faces: ReadonlyMap<number, BandFace> } => {
  const faces = new Map(bandFaces(t, axis, maxBand).map((f) => [f.face, f] as const))
  const parent = new Map<number, number>([...faces.keys()].map((f) => [f, f]))
  const find = (x: number): number => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r }
  for (const l of t.links) {
    const x = faces.get(l.a), y = faces.get(l.b)
    if (x !== undefined && y !== undefined && x.kind === y.kind) parent.set(find(l.a), find(l.b))
  }
  const groups = new Map<number, BandFace[]>()
  for (const f of faces.values()) { const r = find(f.face); const g = groups.get(r); if (g === undefined) groups.set(r, [f]); else g.push(f) }
  const features: NamedFeature[] = []
  for (const g of [...groups.values()].sort((p, q) => Math.min(...p.map((f) => f.face)) - Math.min(...q.map((f) => f.face)))) {
    const ids = g.map((f) => f.face).sort((p, q) => p - q)
    const pts = ids.flatMap((fi) => t.points(fi, 8))
    const kind = g[0]!.kind
    const convex = g.filter((f) => f.convex).length * 2 >= g.length
    const axes = g.map((f) => f.axis)
    const shared = kind === "fillet-band" && axes.every((a) => a !== undefined && Math.abs(Math.abs(dot3(a, axes[0]!)) - 1) < PARALLEL) ? axes[0] : undefined
    const feature: NamedFeature = { id: `${kind === "chamfer-band" ? "chamfer" : "fillet"}-${features.length + 1}`, kind, faces: ids, bounds: boundsOf(pts), convex, size: median(g.map((f) => f.size)), ...(kind === "chamfer-band" ? { turn: g.reduce((s, f) => s + f.turn, 0) / g.length } : {}), ...(shared !== undefined ? { axis: shared } : {}) }
    features.push(kind === "chamfer-band" ? withLoops(t, axis, feature, g) : feature)
  }
  return { features, faces }
}

/** A chamfer along horizontal edges: Z of its edges and the closed loops of the edge on the wall. */
const withLoops = (t: Topology, axis: Vec3, f: NamedFeature, g: ReadonlyArray<BandFace>): NamedFeature => {
  const walls: number[] = []
  const tops: Vec3[] = []
  let upper = -Infinity, lower = Infinity
  for (const bf of g) {
    const horizontal = bf.long.every((l) => Math.abs(dot3(normalize3(curveDerivs(t.b.edges[l.edge]!.curve, (t.b.edges[l.edge]!.t0 + t.b.edges[l.edge]!.t1) / 2)[1]), axis)) < 1e-6 || t.b.edges[l.edge]!.curve.kind === "circle")
    if (!horizontal) return f
    const wall = bf.long.find((l) => { const o = t.other(l, bf.face); const s = t.b.faces[o]!.surface; return (s.kind === "plane" || s.kind === "cylinder") && Math.abs(dot3(t.normal(o, l.mid), axis)) < 1e-6 })
    const top = bf.long.find((l) => l !== wall)
    if (wall === undefined || top === undefined) return f
    walls.push(wall.edge)
    tops.push(top.mid)
    const z = (l: Link): number => dot3(l.mid, axis)
    upper = Math.max(upper, z(top)); lower = Math.min(lower, z(wall))
  }
  const loops = chainLoops(t.b, walls)
  // The upper edge of a chamfer on an outline lies inside the loop of its lower edge (material inside); on the rim of a pocket or hole, outside it.
  const sides = loops.map((loop): "outside" | "inside" => {
    const near = tops.reduce((best, p) => { const d = distanceToPoints({ x: p.x, y: p.y, z: 0 }, [...loop, loop[0]!].map((q) => ({ x: q.x, y: q.y, z: 0 }))); return d < best.d ? { d, p } : best }, { d: Infinity, p: tops[0]! }).p
    let inside = false
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i]!, b = loop[j]!
      if (a.y > near.y !== b.y > near.y && near.x < ((b.x - a.x) * (near.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside ? "outside" : "inside"
  })
  return { ...f, upperZ: upper, lowerZ: lower, ...(loops.length > 0 ? { loops, loopSides: sides } : {}) }
}

// ---------------------------------------------------------------- floors: slots and steps

const isPlane = (t: Topology, fi: number): boolean => t.b.faces[fi]!.surface.kind === "plane"
const planeOrigin = (t: Topology, fi: number): Vec3 => { const s = t.b.faces[fi]!.surface; return s.kind === "plane" ? s.frame.origin : { x: 0, y: 0, z: 0 } }

const floors = (t: Topology, axis: Vec3, bandOf: ReadonlyMap<number, BandFace>): NamedFeature[] => {
  const out: NamedFeature[] = []
  t.b.faces.forEach((f, fi) => {
    if (f.surface.kind !== "plane" || dot3(t.normal(fi, f.surface.frame.origin), axis) < 1 - PARALLEL) return
    // The walls of the floor: concave neighbours, looking through a concave fillet band between floor and wall.
    const claimed: number[] = [fi]
    const walls: Array<{ readonly face: number; readonly via: number | undefined }> = []
    const open: number[] = []
    for (const l of t.linksOf(fi)) {
      const nb = t.other(l, fi)
      const band = bandOf.get(nb)
      if (l.kind === "tangent" && band !== undefined && band.kind === "fillet-band" && !band.convex) {
        // A fillet is tangent on both sides: the face beyond it, across its other tangent edge, is the wall.
        const beyond = t.linksOf(nb).find((m) => m !== l && m.kind === "tangent" && t.other(m, nb) !== fi)
        if (beyond !== undefined) { walls.push({ face: t.other(beyond, nb), via: nb }); claimed.push(nb) }
        continue
      }
      if (l.kind === "concave") walls.push({ face: nb, via: undefined })
      else if (l.kind === "convex") open.push(nb)
    }
    if (walls.length === 0) return
    const vertical = (w: number): boolean => { const s = t.b.faces[w]!.surface; return (s.kind === "plane" && Math.abs(dot3(t.normal(w, s.frame.origin), axis)) < PARALLEL) || (s.kind === "cylinder" && Math.abs(Math.abs(dot3(s.frame.z, axis)) - 1) < PARALLEL) }
    if (!walls.every((w) => vertical(w.face))) return
    const floorZ = dot3(f.surface.frame.origin, axis)
    const floorPts = t.points(fi, 8)
    // The pair of facing parallel planar walls with the narrowest gap.
    let pair: { a: number; b: number; gap: number; n: Vec3 } | undefined
    for (const x of walls) for (const y of walls) {
      if (x.face >= y.face || !isPlane(t, x.face) || !isPlane(t, y.face)) continue
      const nx = t.normal(x.face, planeOrigin(t, x.face)), ny = t.normal(y.face, planeOrigin(t, y.face))
      if (dot3(nx, ny) > -1 + PARALLEL) continue
      const gap = dot3(sub3(planeOrigin(t, y.face), planeOrigin(t, x.face)), nx)
      if (gap > PARALLEL && (pair === undefined || gap < pair.gap)) pair = { a: x.face, b: y.face, gap, n: nx }
    }
    const wallTop = (w: number): number => Math.max(...t.points(w, 4).map((p) => dot3(p, axis)))
    if (pair === undefined) {
      if (walls.length !== 1 || !isPlane(t, walls[0]!.face)) return
      const w = walls[0]!.face
      const tangentDir = normalize3(cross3(axis, t.normal(w, planeOrigin(t, w))))
      const along = floorPts.map((p) => dot3(p, tangentDir))
      const top = wallTop(w)
      out.push({
        id: "", kind: "step", faces: [...claimed, w, ...walls.filter((x) => x.via !== undefined).map((x) => x.via!)].filter((v, i, a) => a.indexOf(v) === i).sort((p, q) => p - q),
        bounds: boundsOf([...floorPts, ...t.points(w, 4)]), depth: top - floorZ, length: Math.max(...along) - Math.min(...along), floor: fi, floorZ, topZ: top, walls: [w], direction: tangentDir
      })
      return
    }
    // Faces of one surface (a cylinder split at its seam, coplanar pieces) are one end.
    const surfaceKey = (w: number): string => {
      const sf = t.b.faces[w]!.surface
      const r = (v: number): string => (Math.round(v * 1e5) / 1e5).toString()
      if (sf.kind === "plane") { const n = t.normal(w, sf.frame.origin); return `p${r(n.x)},${r(n.y)},${r(n.z)},${r(dot3(n, sf.frame.origin))}` }
      if (sf.kind === "cylinder") { const o = sf.frame.origin, a = sf.frame.z; const d = sub3(o, scale3(a, dot3(o, a))); return `c${r(d.x)},${r(d.y)},${r(d.z)},${r(sf.radius)}` }
      return `s${w}`
    }
    const rest: typeof walls = []
    for (const w of walls) if (w.face !== pair.a && w.face !== pair.b && !rest.some((x) => surfaceKey(x.face) === surfaceKey(w.face))) rest.push(w)
    if (rest.length > 2) return
    const tangentDir = normalize3(cross3(axis, pair.n))
    const along = floorPts.map((p) => dot3(p, tangentDir))
    const length = Math.max(...along) - Math.min(...along)
    const ends: SlotEnd[] = rest.map((w) => (isPlane(t, w.face) ? "closed" : "round"))
    // A floor with open sides: its convex edges (other than at the walls) are the open ends.
    while (ends.length < 2) ends.push("open")
    if (open.length === 0 && ends.every((e) => e !== "open") && ends.some((e) => e === "closed")) return // a closed rectangular pocket
    if (ends.every((e) => e !== "open") && length < 1.5 * pair.gap) return // a short round-ended pocket
    const ids = [...claimed, pair.a, pair.b, ...walls.map((w) => w.face), ...walls.filter((x) => x.via !== undefined).map((x) => x.via!)].filter((v, i, a) => a.indexOf(v) === i).sort((p, q) => p - q)
    const top = Math.min(wallTop(pair.a), wallTop(pair.b))
    out.push({
      id: "", kind: "slot", faces: ids, bounds: boundsOf(ids.flatMap((i) => t.points(i, 4))), width: pair.gap, depth: top - floorZ, length, floor: fi, floorZ, topZ: top,
      walls: [pair.a, pair.b], direction: tangentDir, ends
    })
  })
  return out
}

// ---------------------------------------------------------------- ring grooves

const grooves = (t: Topology): NamedFeature[] => {
  const out: NamedFeature[] = []
  t.b.faces.forEach((f, fi) => {
    const s = f.surface
    if (s.kind !== "cylinder") return
    const axis = s.frame.z
    // Full-turn circle edges: a ring groove's floor is bounded by two of them, each against a plane perpendicular to the axis.
    const rings = t.linksOf(fi).filter((l) => l.kind === "concave" && isPlane(t, t.other(l, fi)) && t.b.edges[l.edge]!.curve.kind === "circle" && Math.abs(dot3(t.normal(t.other(l, fi), l.mid), axis)) > 1 - PARALLEL)
    if (rings.length !== 2) return
    const [pa, pb] = [t.other(rings[0]!, fi), t.other(rings[1]!, fi)]
    const na = t.normal(pa, planeOrigin(t, pa)), nb = t.normal(pb, planeOrigin(t, pb))
    const gap = dot3(sub3(planeOrigin(t, pb), planeOrigin(t, pa)), na)
    if (dot3(na, nb) > -1 + PARALLEL || !(gap > PARALLEL)) return
    const radii = [pa, pb].flatMap((p) => t.points(p, 8).map((q) => { const d = sub3(q, s.frame.origin); return length3(sub3(d, scale3(axis, dot3(d, axis)))) }))
    const p0 = t.points(fi, 4)[0]!
    const n = t.normal(fi, p0)
    const radial = sub3(sub3(p0, s.frame.origin), scale3(axis, dot3(sub3(p0, s.frame.origin), axis)))
    const external = dot3(n, radial) > 0
    // The rings run from the groove floor out to the shaft (external) or in to the bore beside it (internal): the depth is how far.
    const reach = external ? Math.max(...radii) : Math.min(...radii)
    const depth = Math.abs(reach - s.radius)
    if (!(depth > PARALLEL) || (external ? reach < s.radius : reach > s.radius)) return
    const ids = [fi, pa, pb].sort((p, q) => p - q)
    out.push({ id: "", kind: "groove", faces: ids, bounds: boundsOf(ids.flatMap((i) => t.points(i, 8))), width: gap, depth, axis, origin: s.frame.origin, diameter: 2 * s.radius, external })
  })
  return out
}

// ---------------------------------------------------------------- entry

/** The slots, steps, ring grooves and chamfer / fillet bands of a solid, with the faces each owns; holes are not looked at. */
export const recognizeNamedFeatures = (b: Brep, options: FeatureOptions = {}): ReadonlyArray<NamedFeature> => {
  const axis = normalize3(options.axis ?? { x: 0, y: 0, z: 1 })
  const t = new Topology(b)
  const box = boundsOf(b.vertices.map((v) => v.point))
  const extents = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].filter((e) => e > 1e-9)
  const maxBand = options.maxBand ?? 0.5 * Math.min(...extents)
  const band = bands(t, axis, maxBand)
  const all = [...floors(t, axis, band.faces), ...grooves(t), ...band.features]
  const count: Record<string, number> = {}
  return all.map((f) => {
    count[f.kind] = (count[f.kind] ?? 0) + 1
    const id = f.id === "" || f.kind === "slot" || f.kind === "step" || f.kind === "groove" ? `${f.kind}-${count[f.kind]}` : f.id
    return { ...f, id }
  })
}

// ---------------------------------------------------------------- measuring the recognition

export interface ExpectedFeature {
  readonly kind: NamedFeatureKind
  /** Centre of the feature's bounding box and the distance within which a found feature is that one, mm. */
  readonly at: Vec3
  readonly tolerance: number
}

export interface KindScore {
  readonly expected: number
  readonly found: number
  readonly truePositive: number
  readonly precision: number
  readonly recall: number
}

const centre = (f: NamedFeature): Vec3 => ({ x: (f.bounds.min.x + f.bounds.max.x) / 2, y: (f.bounds.min.y + f.bounds.max.y) / 2, z: (f.bounds.min.z + f.bounds.max.z) / 2 })

/**
 * Precision and recall of a recognition against what a part is known to contain, per feature kind. A found feature is a true
 * positive when it is of the expected kind and its bounding box is centred within the tolerance of an expected one not yet matched.
 * A kind neither expected nor found scores 1 / 1 (nothing to get wrong).
 */
export const scoreRecognition = (expected: ReadonlyArray<ExpectedFeature>, found: ReadonlyArray<NamedFeature>): Readonly<Record<NamedFeatureKind, KindScore>> => {
  const kinds: NamedFeatureKind[] = ["slot", "step", "groove", "chamfer-band", "fillet-band"]
  const out = {} as Record<NamedFeatureKind, KindScore>
  for (const kind of kinds) {
    const want = expected.filter((e) => e.kind === kind)
    const got = found.filter((f) => f.kind === kind)
    const taken = new Set<number>()
    let tp = 0
    for (const f of got) {
      const c = centre(f)
      const i = want.findIndex((e, k) => !taken.has(k) && length3(sub3(c, e.at)) <= e.tolerance)
      if (i >= 0) { taken.add(i); tp++ }
    }
    out[kind] = { expected: want.length, found: got.length, truePositive: tp, precision: got.length === 0 ? 1 : tp / got.length, recall: want.length === 0 ? 1 : tp / want.length }
  }
  return out
}
