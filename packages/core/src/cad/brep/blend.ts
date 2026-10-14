/**
 * Exact constant-radius fillets and equal-distance chamfers on the edges of a B-rep (SMLib's SmBlend, Fusion's Fillet and
 * Chamfer with the rolling-ball cross-section).
 *
 * Edges taken:
 *   line    a straight edge between two planar faces: the fillet is an exact cylinder (a chamfer a plane);
 *   circle  the rim where a plane meets a cylinder standing square on it (a hole's mouth, a boss's foot or top): the fillet is
 *           an exact torus (a chamfer a cone).
 *
 * Each edge is blended with an exact Boolean of a tool: the region between the edge and the rolling ball tangent to both faces,
 * swept along the edge (an extrusion of the cross-section for a line, a full revolution about the cylinder's axis for a rim).
 * A convex edge is cut away (subtract), a concave one filled (union). The cross-section reaches a little beyond the faces, so
 * the tool's sides cross them instead of lying on them.
 *
 * Along a line edge the tool runs a little past a free end (a convex corner, where the edge leaves the body) and stops on the
 * plane of a wall it runs into (the edge ends against a face square to it): the fillet dies into the wall as Fusion's does.
 *
 * Where three filleted convex line edges of one radius meet in a vertex, the three edge tools leave the mitred intersection of
 * three cylinders; the rolling ball leaves a sphere. The corner region is the convex cell of the vertex between its three faces
 * and the three planes through the ball centre square to the edges (the points whose nearest point of the inward offset solid
 * is the ball centre): the cell minus the ball is cut away, which leaves exactly the spherical corner patch.
 *
 * Every edge that cannot be blended (the faces are too narrow for the size, a knife edge, an edge ending at a slanted wall, a
 * failed Boolean) is reported with its reason and left alone: nothing is approximated.
 */
import { add3, cross3, dot3, frame, length3, madd3, MODEL_TOL, neg3, normalize3, scale3, sub3, type Vec2, type Vec3 } from "./math.ts"
import { curveDerivs, curvePoint, surfaceNormal, surfaceProject, type Surface } from "./geom.ts"
import { BooleanError, booleanBrep } from "./boolean.ts"
import { makeSphere, polyhedron } from "./primitives.ts"
import { extrudeProfile, revolveProfile, type ProfileLoop, type ProfileSegment } from "./sweep.ts"
import { edgeUses, type Brep } from "./topology.ts"

// ================================================================ candidate edges

export interface BlendCandidate {
  /** Index of the edge in the B-rep the candidates were found on. */
  readonly edge: number
  readonly curve: "line" | "circle"
  /** End points (both the rim's seam point for a closed rim). */
  readonly a: Vec3
  readonly b: Vec3
  /** Outward unit normals of the two faces at `a`; for a rim `nA` is the plane's and `nB` the cylinder's. */
  readonly nA: Vec3
  readonly nB: Vec3
  readonly faceA: number
  readonly faceB: number
  readonly convex: boolean
  readonly length: number
  /** How far each face reaches from the edge (the blend cannot be wider than this). */
  readonly reachA: number
  readonly reachB: number
  /** For a rim: the cylinder's axis point (in the rim's plane), direction and radius. */
  readonly axis?: { readonly origin: Vec3; readonly dir: Vec3; readonly radius: number }
  /** Rims are the "curved" edges of the mesh blend's selection: taken only when asked for. */
  readonly curved: boolean
}

const outwardNormal = (b: Brep, fi: number, p: Vec3): Vec3 => {
  const f = b.faces[fi]!
  const q = surfaceProject(f.surface, p)
  const n = surfaceNormal(f.surface, q.u, q.v)
  return f.reversed ? neg3(n) : n
}

/** The edge's tangent at `t` in the direction a coedge runs it. */
const coedgeTangent = (b: Brep, edge: number, t: number, reversed: boolean): Vec3 => {
  const d = normalize3(curveDerivs(b.edges[edge]!.curve, t)[1])
  return reversed ? neg3(d) : d
}

/** Points along a face's boundary. */
const faceBoundaryPoints = (b: Brep, fi: number): Vec3[] => {
  const out: Vec3[] = []
  for (const l of b.faces[fi]!.loops) for (const c of l.coedges) {
    const e = b.edges[c.edge]!
    for (let k = 0; k <= 8; k++) out.push(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 8))
  }
  return out
}

/** (radial distance from the axis, axial position) of `p` about the axis through `o` along `z`. */
const radialAxial = (p: Vec3, o: Vec3, z: Vec3): [number, number] => {
  const d = sub3(p, o)
  const h = dot3(d, z)
  return [length3(madd3(d, z, -h)), h]
}

/**
 * The straight edges between two planes and the rims between a plane and a square cylinder, classified. Straight edges whose
 * faces meet at less than `minAngleDegrees` are left out (the mesh blend uses 25 degrees to tell edges from facets).
 */
export const blendCandidates = (b: Brep, minAngleDegrees = 0.5): BlendCandidate[] => {
  const minSin = Math.sin((minAngleDegrees * Math.PI) / 180)
  const uses = edgeUses(b)
  const out: BlendCandidate[] = []
  b.edges.forEach((e, ei) => {
    const u = uses[ei]!
    if (u.length !== 2 || u[0]!.face === u[1]!.face) return
    const fa = b.faces[u[0]!.face]!, fb = b.faces[u[1]!.face]!
    const tm = (e.t0 + e.t1) / 2
    if (e.curve.kind === "line" && fa.surface.kind === "plane" && fb.surface.kind === "plane") {
      const pm = curvePoint(e.curve, tm)
      const nA = outwardNormal(b, u[0]!.face, pm), nB = outwardNormal(b, u[1]!.face, pm)
      if (length3(cross3(nA, nB)) < Math.max(1e-9, minSin)) return // coplanar, tangent or shallow: not an edge to blend
      // A face's material lies on the left of its coedge seen from its outward normal: n x d points into the face.
      const intoA = cross3(nA, coedgeTangent(b, ei, tm, u[0]!.reversed))
      const a = b.vertices[e.v0]!.point, c = b.vertices[e.v1]!.point
      const dir = normalize3(sub3(c, a))
      const reach = (fi: number) => faceBoundaryPoints(b, fi).reduce((m, p) => Math.max(m, length3(cross3(sub3(p, a), dir))), 0)
      out.push({ edge: ei, curve: "line", a, b: c, nA, nB, faceA: u[0]!.face, faceB: u[1]!.face, convex: dot3(intoA, nB) < 0, length: length3(sub3(c, a)), reachA: reach(u[0]!.face), reachB: reach(u[1]!.face), curved: false })
      return
    }
    if (e.curve.kind === "circle" && e.v0 === e.v1) {
      // A rim between two faces whose sections through the axis are straight: a plane square to the axis, a cylinder or a
      // cone about it (a hole's mouth, a boss's foot, a turned shoulder, a cone meeting a cylinder or another cone). The
      // rolling ball's section is then the same 2D corner as for a straight edge, revolved: an exact torus.
      type Straight = Extract<Surface, { kind: "plane" | "cylinder" | "cone" }>
      const straight = (s: Surface): s is Straight => s.kind === "plane" || s.kind === "cylinder" || s.kind === "cone"
      const pair = [fa.surface, fb.surface]
      if (!pair.every(straight)) return
      // The axis: the first face of revolution's; every face must share it.
      const rev = (pair as Straight[]).find((s) => s.kind !== "plane")
      if (rev === undefined) return
      const dir = rev.frame.z
      const p0 = b.vertices[e.v0]!.point
      const centre = madd3(rev.frame.origin, dir, dot3(sub3(p0, rev.frame.origin), dir))
      for (const s of pair as Straight[]) {
        if (Math.abs(Math.abs(dot3(s.frame.z, dir)) - 1) > 1e-9) return
        if (s.kind !== "plane" && length3(cross3(sub3(s.frame.origin, rev.frame.origin), dir)) > 1e-7) return
      }
      // The edge must be the circle about that axis through p0.
      if (length3(cross3(sub3(e.curve.frame.origin, rev.frame.origin), dir)) > 1e-7) return
      const nA = outwardNormal(b, u[0]!.face, p0), nB = outwardNormal(b, u[1]!.face, p0)
      // A plane face goes first (the cross-section is symmetric in the two faces; the order only names them).
      const [ua, ub, na, nb] = fa.surface.kind === "plane" || fb.surface.kind !== "plane" ? [u[0]!, u[1]!, nA, nB] : [u[1]!, u[0]!, nB, nA]
      if (length3(cross3(na, nb)) < Math.max(1e-9, minSin)) return // tangent faces: nothing to blend
      const intoA = cross3(na, coedgeTangent(b, ei, e.t0, ua.reversed))
      const [rho, h0] = radialAxial(p0, centre, dir)
      // How far each face reaches from the edge along its section (a straight line through the edge's point).
      const reach = (fi: number) => faceBoundaryPoints(b, fi).reduce((m, p) => { const [r, h] = radialAxial(p, centre, dir); return Math.max(m, Math.hypot(r - rho, h - h0)) }, 0)
      out.push({
        edge: ei, curve: "circle", a: p0, b: p0, nA: na, nB: nb, faceA: ua.face, faceB: ub.face, convex: dot3(intoA, nb) < 0,
        length: 2 * Math.PI * rho, reachA: reach(ua.face), reachB: reach(ub.face), axis: { origin: centre, dir, radius: rho }, curved: true
      })
    }
  })
  return out
}

// ================================================================ selection (the mesh blend's semantics)

export interface BlendSelector {
  readonly parallel?: "x" | "y" | "z"
  /** Only edges lying wholly inside this box. */
  readonly within?: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }
  /** Convex (outside) edges, concave (inside) edges or both. Default convex. */
  readonly kind?: "convex" | "concave" | "both"
  readonly minLength?: number
  /** Also take rims (a plane against a cylinder). */
  readonly curved?: boolean
}

export const selectBlendEdges = (edges: ReadonlyArray<BlendCandidate>, s: BlendSelector = {}): BlendCandidate[] => {
  const kind = s.kind ?? "convex"
  const axis = s.parallel === undefined ? undefined : ({ x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } } as const)[s.parallel]
  const inside = (q: Vec3): boolean => s.within === undefined || (
    q.x >= s.within.min[0] - 1e-3 && q.x <= s.within.max[0] + 1e-3 && q.y >= s.within.min[1] - 1e-3 && q.y <= s.within.max[1] + 1e-3 &&
    q.z >= s.within.min[2] - 1e-3 && q.z <= s.within.max[2] + 1e-3)
  const extremes = (e: BlendCandidate): Vec3[] => {
    if (e.axis === undefined) return [e.a, e.b]
    const f = frame(e.axis.origin, e.axis.dir)
    return [0, 1, 2, 3].map((k) => madd3(madd3(e.axis!.origin, f.x, e.axis!.radius * Math.cos((k * Math.PI) / 2)), f.y, e.axis!.radius * Math.sin((k * Math.PI) / 2)))
  }
  return edges.filter((e) =>
    (s.curved === true || !e.curved) && (kind === "both" || (kind === "convex") === e.convex) &&
    (axis === undefined || (e.curve === "line" && Math.abs(dot3(normalize3(sub3(e.b, e.a)), axis)) > Math.cos((2 * Math.PI) / 180))) &&
    e.length >= (s.minLength ?? 0) && extremes(e).every(inside))
}

// ================================================================ the cross-section

/**
 * The tool's cross-section for faces with outward normals nA, nB (2D, in a basis of the plane square to the edge) meeting at
 * the origin: the corner region between the faces (reaching `g` beyond them) and the ball's arc (fillet) or the flat (chamfer).
 */
const crossSection = (nA: Vec2, nB: Vec2, convex: boolean, size: number, style: "fillet" | "chamfer", g: number): ProfileLoop | string => {
  const cosA = nA.x * nB.x + nA.y * nB.y
  if (1 + cosA < 1e-3) return "the faces meet at a knife edge"
  if (1 - cosA < 1e-9) return "the faces are tangent"
  const sign = convex ? 1 : -1
  const sum = { x: nA.x + nB.x, y: nA.y + nB.y }
  const at = (p: Vec2, d: Vec2, s: number): Vec2 => ({ x: p.x + d.x * s, y: p.y + d.y * s })
  // The outer corner of the margin, moved off the bisector: mitre planes meet along the corner's diagonal, which would
  // otherwise cross the tool exactly at this corner's edge (a degenerate contact). It stays beyond both faces.
  const diff = { x: nA.x - nB.x, y: nA.y - nB.y }
  const dl = Math.hypot(diff.x, diff.y)
  const corner = at(at({ x: 0, y: 0 }, sum, (sign * g) / (1 + cosA)), diff, (sign * 0.173 * g) / dl)
  const line = (a: Vec2, b: Vec2): ProfileSegment => ({ kind: "line", a, b })
  if (style === "chamfer") {
    // Along each face, away from the edge and square to it.
    const along = (n: Vec2, m: Vec2): Vec2 => { const d = { x: -sign * (m.x - n.x * cosA), y: -sign * (m.y - n.y * cosA) }; const l = Math.hypot(d.x, d.y); return { x: d.x / l, y: d.y / l } }
    const pA = at({ x: 0, y: 0 }, along(nA, nB), size), pB = at({ x: 0, y: 0 }, along(nB, nA), size)
    const qA = at(pA, nA, sign * g), qB = at(pB, nB, sign * g)
    return [line(corner, qA), line(qA, pA), line(pA, pB), line(pB, qB), line(qB, corner)]
  }
  const centre = at({ x: 0, y: 0 }, sum, (-sign * size) / (1 + cosA))
  const t1 = at(centre, nA, sign * size), t2 = at(centre, nB, sign * size)
  const q1 = at(t1, nA, sign * g), q2 = at(t2, nB, sign * g)
  const a1 = Math.atan2(t1.y - centre.y, t1.x - centre.x)
  let a2 = Math.atan2(t2.y - centre.y, t2.x - centre.x)
  // The short arc between the tangent points: the ball's side facing the edge.
  while (a2 - a1 > Math.PI) a2 -= 2 * Math.PI
  while (a2 - a1 < -Math.PI) a2 += 2 * Math.PI
  return [line(corner, q1), line(q1, t1), { kind: "arc", center: centre, radius: size, start: a1, end: a2 }, line(t2, q2), line(q2, corner)]
}

// ================================================================ the blend

export interface BlendOptions {
  /** Reach of the tool beyond the faces and past free ends, mm (default 10 % of the size, at least 0.05 mm). */
  readonly margin?: number
  /** Diagnostics: each Boolean's stages (see `BooleanOptions.debug`), tagged with the edge being blended. */
  readonly debug?: (edge: string, stage: string, data: unknown) => void
}

export interface BlendResult {
  readonly brep: Brep
  readonly blended: number
  /** Rolling-ball corners made where three equal fillets meet. */
  readonly vertices: number
  /** Edges refused for their geometry (faces too narrow for the size, knife edges, slanted walls): the mesh refuses them too. */
  readonly rejected: ReadonlyArray<string>
  /** Edges or corners whose exact Boolean failed: the exact solid then differs from the mesh blend. */
  readonly failures: ReadonlyArray<string>
}

export const describeBlendEdge = (e: BlendCandidate): string =>
  e.curve === "circle"
    ? `rim of radius ${e.axis!.radius.toFixed(3)} about ${e.axis!.origin.x.toFixed(2)},${e.axis!.origin.y.toFixed(2)},${e.axis!.origin.z.toFixed(2)}`
    : `edge ${e.a.x.toFixed(2)},${e.a.y.toFixed(2)},${e.a.z.toFixed(2)} to ${e.b.x.toFixed(2)},${e.b.y.toFixed(2)},${e.b.z.toFixed(2)}`

/** Outward normals at vertex `v` of the faces using it other than `skip` (undefined for a curved face). */
const otherFacesAt = (b: Brep, uses: ReturnType<typeof edgeUses>, v: number, skip: ReadonlyArray<number>): Array<Vec3 | undefined> => {
  const faces = new Set<number>()
  b.edges.forEach((e, ei) => { if (e.v0 === v || e.v1 === v) for (const u of uses[ei]!) faces.add(u.face) })
  const p = b.vertices[v]!.point
  return [...faces].filter((f) => !skip.includes(f)).map((f) => (b.faces[f]!.surface.kind === "plane" ? outwardNormal(b, f, p) : undefined))
}

/** A half-space n·p ≤ d. */
interface HalfSpace { readonly n: Vec3; readonly d: number }

/**
 * How each end of a line edge's tool is cut where other blended edges meet it (index 0 at the edge's v0, 1 at v1):
 *   one other   the mitre plane, the bisector of the two edges (two equal fillets' cylinders meet exactly there);
 *   two others  a fillet stops on the plane through the corner ball's centre square to the edge (the corner tool does the
 *               rest); a chamfer takes the mitre plane with each.
 * The half-spaces keep the edge's side. No entry: the end is free or ends against a wall (see `edgeTool`).
 */
const endCuts = (b: Brep, e: BlendCandidate, selected: ReadonlyArray<BlendCandidate>, size: number, style: "fillet" | "chamfer"): [HalfSpace[], HalfSpace[]] => {
  const edge = b.edges[e.edge]!
  const cuts: [HalfSpace[], HalfSpace[]] = [[], []]
  if (e.curve !== "line") return cuts
  ;[edge.v0, edge.v1].forEach((v, end) => {
    const V = b.vertices[v]!.point
    const self = normalize3(sub3(end === 0 ? e.b : e.a, V))
    const others = selected.filter((o) => o !== e && o.curve === "line" && o.convex === e.convex && (b.edges[o.edge]!.v0 === v || b.edges[o.edge]!.v1 === v))
    if (others.length === 0) return
    if (style === "fillet" && others.length === 2 && e.convex) {
      const faces = [...new Set([e, ...others].flatMap((o) => [o.faceA, o.faceB]))]
      if (faces.length === 3) {
        const C = ballCentre(b, faces, V, size)
        if (C !== undefined) { cuts[end]!.push({ n: neg3(self), d: -dot3(self, C) }); return }
      }
    }
    for (const o of others) {
      const oe = b.edges[o.edge]!
      const away = normalize3(sub3(oe.v0 === v ? o.b : o.a, V))
      const m = normalize3(sub3(self, away))
      cuts[end]!.push({ n: neg3(m), d: -dot3(m, V) })
    }
  })
  return cuts
}

/** The centre of the ball of radius r tangent to three planar faces at their common vertex V (behind each of them). */
const ballCentre = (b: Brep, faces: ReadonlyArray<number>, V: Vec3, r: number): Vec3 | undefined => {
  const n = faces.map((f) => outwardNormal(b, f, V)) as [Vec3, Vec3, Vec3]
  const det = dot3(n[0], cross3(n[1], n[2]))
  if (Math.abs(det) < 1e-6) return undefined
  const d = n.map((m) => dot3(m, V) - r) as [number, number, number]
  return scale3(add3(add3(scale3(cross3(n[1], n[2]), d[0]), scale3(cross3(n[2], n[0]), d[1])), scale3(cross3(n[0], n[1]), d[2])), 1 / det)
}

/** The tool of one edge, or the reason there is none. */
const edgeTool = (b: Brep, uses: ReturnType<typeof edgeUses>, e: BlendCandidate, size: number, style: "fillet" | "chamfer", g: number, cuts: [HalfSpace[], HalfSpace[]] = [[], []]): Brep | string => {
  const alpha = Math.acos(Math.max(-1, Math.min(1, dot3(e.nA, e.nB))))
  const need = style === "fillet" ? size * Math.tan(alpha / 2) : size
  const limit = Math.min(e.reachA, e.reachB)
  if (need > limit + 1e-9) return `a ${style} of ${size} mm needs ${need.toFixed(3)} mm of face on each side; the faces reach only ${limit.toFixed(3)} mm`
  if (e.curve === "line") {
    const dir = normalize3(sub3(e.b, e.a))
    const u = normalize3(add3(e.nA, e.nB)), v = cross3(dir, u)
    const to2 = (n: Vec3): Vec2 => ({ x: dot3(n, u), y: dot3(n, v) })
    const loop = crossSection(to2(e.nA), to2(e.nB), e.convex, size, style, g)
    if (typeof loop === "string") return loop
    const edge = b.edges[e.edge]!
    // Past a free end by g; up to the plane of a wall square to the edge.
    const endRun = (vtx: number, out: Vec3): number | string => {
      let run = g
      for (const n of otherFacesAt(b, uses, vtx, [e.faceA, e.faceB])) {
        if (n === undefined) continue
        const d = dot3(out, n)
        if (d < -1e-9) {
          if (d > -1 + 1e-9) return "the edge ends against a wall that is not square to it"
          run = 0
        }
      }
      return run
    }
    // A cut end runs on far enough to cross its cut planes; the cell of the cuts trims it.
    const long = 4 * (size + g)
    const r0 = cuts[0].length > 0 ? long : endRun(edge.v0, neg3(dir)), r1 = cuts[1].length > 0 ? long : endRun(edge.v1, dir)
    if (typeof r0 === "string") return r0
    if (typeof r1 === "string") return r1
    const swept = extrudeProfile({ loops: [loop] }, e.length + r0 + r1, { placement: frame(madd3(e.a, dir, -r0), dir, u), name: "blend" })
    const halfSpaces = [...cuts[0], ...cuts[1]]
    if (halfSpaces.length === 0) return swept
    const reach = e.length + 2 * long + 2 * (size + g)
    const box: HalfSpace[] = (["x", "y", "z"] as const).flatMap((k) => {
      const n = { x: 0, y: 0, z: 0, [k]: 1 } as Vec3
      const lo = Math.min(e.a[k], e.b[k]) - reach, hi = Math.max(e.a[k], e.b[k]) + reach
      return [{ n, d: hi }, { n: neg3(n), d: -lo }]
    })
    const cell = convexCell([...halfSpaces, ...box])
    if (cell === undefined) return "the cuts at its ends leave nothing of the edge"
    return booleanBrep(swept, cell, "intersect").brep
  }
  // A rim: the cross-section in the (radial, axial) half-plane through the edge's point, revolved about the axis.
  const ax = e.axis!
  const [rho, h] = radialAxial(e.a, ax.origin, ax.dir)
  const radial = normalize3(madd3(sub3(e.a, ax.origin), ax.dir, -h))
  const to2 = (n: Vec3): Vec2 => ({ x: dot3(n, radial), y: dot3(n, ax.dir) })
  const loop = crossSection(to2(e.nA), to2(e.nB), e.convex, size, style, g)
  if (typeof loop === "string") return loop
  const moved = loop.map((s): ProfileSegment => s.kind === "line"
    ? { kind: "line", a: { x: s.a.x + rho, y: s.a.y + h }, b: { x: s.b.x + rho, y: s.b.y + h } }
    : s.kind === "arc" ? { ...s, center: { x: s.center.x + rho, y: s.center.y + h } } : s)
  for (const s of moved) if (s.kind === "line" && (s.a.x < MODEL_TOL || s.b.x < MODEL_TOL)) return `the ${style} reaches the axis of the rim`
  return revolveProfile({ loops: [moved] }, 2 * Math.PI, { origin: ax.origin, axis: ax.dir, radial, name: "blend" })
}

/** The convex cell bounded by the planes n·p ≤ d, as a polyhedron (undefined when it is empty or not a solid). */
export const convexCell = (planes: ReadonlyArray<{ readonly n: Vec3; readonly d: number }>): Brep | undefined => {
  const pts: Vec3[] = []
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
    const A = planes[i]!, B = planes[j]!, C = planes[k]!
    const det = dot3(A.n, cross3(B.n, C.n))
    if (Math.abs(det) < 1e-12) continue
    const p = scale3(add3(add3(scale3(cross3(B.n, C.n), A.d), scale3(cross3(C.n, A.n), B.d)), scale3(cross3(A.n, B.n), C.d)), 1 / det)
    if (planes.some((P) => dot3(P.n, p) > P.d + 1e-9 * (1 + Math.abs(P.d)))) continue
    if (pts.some((q) => length3(sub3(q, p)) < 1e-9)) continue
    pts.push(p)
  }
  if (pts.length < 4) return undefined
  const faces: number[][] = []
  for (const P of planes) {
    const ids = pts.map((_, i) => i).filter((i) => Math.abs(dot3(P.n, pts[i]!) - P.d) <= 1e-7 * (1 + Math.abs(P.d)))
    if (ids.length < 3) continue
    const c = scale3(ids.reduce((s, i) => add3(s, pts[i]!), { x: 0, y: 0, z: 0 }), 1 / ids.length)
    const f = frame(c, P.n)
    const angle = (i: number) => Math.atan2(dot3(sub3(pts[i]!, c), f.y), dot3(sub3(pts[i]!, c), f.x))
    faces.push(ids.sort((i, j) => angle(i) - angle(j))) // counter-clockwise seen from outside
  }
  const used = [...new Set(faces.flat())].sort((a, b) => a - b)
  const index = new Map(used.map((i, k) => [i, k]))
  return polyhedron(used.map((i) => pts[i]!), faces.map((f) => f.map((i) => index.get(i)!)))
}

/** The rolling-ball corner tools: one per vertex where three filleted convex line edges of three faces meet. */
const cornerTools = (b: Brep, done: ReadonlyArray<BlendCandidate>, r: number, g: number): Array<Brep | string> => {
  const at = new Map<number, BlendCandidate[]>()
  for (const e of done) {
    if (e.curve !== "line" || !e.convex) continue
    const edge = b.edges[e.edge]!
    for (const v of [edge.v0, edge.v1]) at.set(v, [...(at.get(v) ?? []), e])
  }
  const tools: Array<Brep | string> = []
  for (const [v, incident] of at) {
    if (incident.length !== 3) continue
    const faces = [...new Set(incident.flatMap((e) => [e.faceA, e.faceB]))]
    if (faces.length !== 3) continue
    const V = b.vertices[v]!.point
    const C = ballCentre(b, faces, V, r)
    if (C === undefined) continue
    const n = faces.map((f) => outwardNormal(b, f, V)) as [Vec3, Vec3, Vec3]
    // The cell: the face planes pushed out by g, and through C the plane square to each edge, keeping V's side.
    const planes: Array<{ n: Vec3; d: number }> = n.map((m) => ({ n: m, d: dot3(m, V) + g }))
    for (let i = 0; i < 3; i++) {
      const m = normalize3(cross3(n[(i + 1) % 3]!, n[(i + 2) % 3]!))
      const s = dot3(m, sub3(V, C)) > 0 ? -1 : 1
      planes.push({ n: scale3(m, s), d: dot3(scale3(m, s), C) })
    }
    const cell = convexCell(planes)
    if (cell === undefined) continue
    // The ball is placed so that the patch it keeps (the octant of the cell at C) holds neither pole nor seam: the pole axis
    // has mixed signs against the three cut planes (neither pole in the octant, none on a plane) and the seam is on the far
    // side. A kept patch around a pole wraps the whole period of the sphere's parameters, which the arrangement cannot cut.
    const m = planes.slice(3).map((p) => neg3(p.n)) as [Vec3, Vec3, Vec3]
    const poles = normalize3(add3(sub3(m[0], m[1]), scale3(m[2], 0.3)))
    const away = neg3(add3(add3(m[0], m[1]), m[2]))
    try {
      tools.push(booleanBrep(cell, makeSphere(r, frame(C, poles, away)), "subtract").brep)
    } catch (err) {
      tools.push(`the corner tool at ${V.x.toFixed(2)},${V.y.toFixed(2)},${V.z.toFixed(2)} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return tools
}

/**
 * Blends the selected edges of `b` (candidates found by `blendCandidates` on this same B-rep) with a fillet of radius `size` or
 * a chamfer of setback `size`, one edge after the other. An edge that cannot be blended is named in `rejected` and left alone.
 */
export const blendBrep = (b: Brep, edges: ReadonlyArray<BlendCandidate>, size: number, style: "fillet" | "chamfer" = "fillet", options: BlendOptions = {}): BlendResult => {
  if (!(size > 0)) throw new RangeError(`A ${style} needs a positive size (it is ${size})`)
  const g = options.margin ?? Math.max(0.05, size * 0.1)
  const uses = edgeUses(b)
  let current = b
  let blended = 0
  const rejected: string[] = []
  const failures: string[] = []
  const done: BlendCandidate[] = []
  for (const e of edges) {
    try {
      const tool = edgeTool(b, uses, e, size, style, g, endCuts(b, e, edges, size, style))
      if (typeof tool === "string") { rejected.push(`${describeBlendEdge(e)}: ${tool}`); continue }
      const debug = options.debug
      current = booleanBrep(current, tool, e.convex ? "subtract" : "union", debug === undefined ? {} : { debug: (stage, data) => debug(describeBlendEdge(e), stage, data) }).brep
      blended++
      done.push(e)
    } catch (err) {
      failures.push(`${describeBlendEdge(e)}: ${err instanceof BooleanError ? `exact Boolean failed: ${err.message}` : err instanceof Error ? err.message : String(err)}`)
    }
  }
  let vertices = 0
  if (style === "fillet") {
    for (const tool of cornerTools(b, done, size, g)) {
      if (typeof tool === "string") { failures.push(`rolling-ball corner: ${tool}`); continue }
      try {
        const debug = options.debug
        current = booleanBrep(current, tool, "subtract", debug === undefined ? {} : { debug: (stage, data) => debug(`corner ${vertices}`, stage, data) }).brep
        vertices++
      } catch (err) {
        failures.push(`rolling-ball corner: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  return { brep: current, blended, vertices, rejected, failures }
}
