/**
 * Exact shell of a solid made of planar and cylindrical faces, by dilation of its boundary.
 *
 * The cavity of a shell of wall `t` is the solid eroded by `t`: the points of the body at least `t` from its surface. The
 * points less than `t` from the surface are the union of the pieces the surface is made of, each swept by a ball of radius `t`:
 *
 *   a planar face      a slab, the face's outline extruded `t` into the body
 *   a cylindrical face a band of the cylinder, from `r - t` to `r + t`, over the face's axial and angular extent
 *   a straight edge    a cylinder of radius `t` along it
 *   a circular edge    a torus, the disc of radius `t` revolved along the arc
 *   a vertex           a sphere of radius `t`
 *
 * The cavity is the body minus those pieces and the shell is the body minus the cavity, so every step is an exact Boolean and
 * the result keeps the analytic surfaces: the offset faces are planes and coaxial cylinders, a re-entrant edge becomes a
 * cylinder (the rounded inside of an offset), a convex edge stays sharp. Convex edges and vertices need no piece: the slabs
 * cover them. A face left open is not swept (nor its edges and vertices), so the cavity reaches it and the face disappears.
 *
 * The pieces that meet along a line of tangency (an edge cylinder against the slab's inner plane) are made a millionth larger
 * so they cross instead of touching. What the construction cannot do is refused with the reason: a face that is neither planar
 * nor a cylinder between planes square to its axis, a circular edge of radius below the wall (the offset is then a spindle),
 * a wall as thick as half the body.
 */
import { add3, cross3, dot3, frame, length3, madd3, normalize3, scale3, sub3, type Vec3 } from "./math.ts"
import { curvePoint, surfaceNormal, surfaceProject } from "./geom.ts"
import { booleanBrep } from "./boolean.ts"
import { brepLocator } from "./classify.ts"
import { makeCylinder, makeSphere } from "./primitives.ts"
import { extrudeProfile, revolveProfile, type ProfileLoop } from "./sweep.ts"
import { faceProfile, type PlanarFacePick } from "./draft.ts"
import { edgeUses, type Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

const CROSS = 1 + 1e-6

export interface ShellOptions {
  /** Faces left open (indices into the body's faces): the cavity reaches them. */
  readonly open?: ReadonlyArray<number>
}

export interface ShellResult {
  readonly brep: Brep
  readonly cavity: Brep
  /** Pieces swept (slabs, bands, edge and vertex pieces). */
  readonly pieces: number
}

const outward = (b: Brep, fi: number, p: Vec3): Vec3 => {
  const f = b.faces[fi]!
  const q = surfaceProject(f.surface, p)
  const n = surfaceNormal(f.surface, q.u, q.v)
  return f.reversed ? scale3(n, -1) : n
}

/** The pieces of one face, or the reason there are none. */
const facePiece = (b: Brep, fi: number, t: number): Brep | string => {
  const f = b.faces[fi]!
  const s = f.surface
  if (s.kind === "plane") {
    const n = f.reversed ? scale3(s.frame.z, -1) : s.frame.z
    const u = s.frame.x
    const pick: PlanarFacePick = { face: fi, origin: s.frame.origin, normal: n, u, v: cross3(n, u), distance: 0 }
    const loops = faceProfile(b, pick)
    if (typeof loops === "string") return loops
    // From t inside the body to a little outside it, so the slab crosses the face instead of lying on it.
    const out = 0.02 * t
    return extrudeProfile({ loops }, t + out, { placement: frame(madd3(s.frame.origin, n, -t), n, u), name: "shell.slab" })
  }
  if (s.kind === "cylinder") {
    const axis = normalize3(s.frame.z)
    const x = s.frame.x
    let lo = Infinity, hi = -Infinity
    const angles: number[] = []
    let seam = false
    const uses = new Map<number, number>()
    for (const l of f.loops) for (const c of l.coedges) uses.set(c.edge, (uses.get(c.edge) ?? 0) + 1)
    for (const l of f.loops) for (const c of l.coedges) {
      const e = b.edges[c.edge]!
      if ((uses.get(c.edge) ?? 0) >= 2) seam = true
      for (let k = 0; k <= 12; k++) {
        const p = curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 12)
        const d = sub3(p, s.frame.origin)
        const h = dot3(d, axis)
        lo = Math.min(lo, h); hi = Math.max(hi, h)
        angles.push(Math.atan2(dot3(d, cross3(axis, x)), dot3(d, x)))
      }
    }
    if (!(hi - lo > 1e-9)) return "a cylindrical face with no length"
    // The ends must be planes square to the axis: the face's boundary is circles (or arcs) at lo and hi.
    for (const l of f.loops) for (const c of l.coedges) {
      const e = b.edges[c.edge]!
      if (e.curve.kind === "line") { const dir = normalize3(sub3(curvePoint(e.curve, e.t1), curvePoint(e.curve, e.t0))); if (Math.abs(Math.abs(dot3(dir, axis)) - 1) > 1e-6) return "a cylindrical face whose edge is not along its axis" }
      else if (e.curve.kind === "circle") { if (Math.abs(Math.abs(dot3(e.curve.frame.z, axis)) - 1) > 1e-6) return "a cylindrical face cut slantwise" }
      else return `a cylindrical face bounded by a ${e.curve.kind}`
    }
    let a0 = 0, sweep = 2 * Math.PI
    if (!seam) {
      const sorted = [...angles].sort((p, q) => p - q)
      let bestGap = -1, at = 0
      for (let i = 0; i < sorted.length; i++) {
        const next = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + 2 * Math.PI
        if (next - sorted[i]! > bestGap) { bestGap = next - sorted[i]!; at = i }
      }
      a0 = sorted[(at + 1) % sorted.length]!
      sweep = 2 * Math.PI - bestGap
      if (sweep > 2 * Math.PI - 1e-6) sweep = 2 * Math.PI
    }
    const r = s.radius
    if (r - t < 1e-6) return `a cylindrical face of radius ${r} is thinner than the wall ${t}`
    const loop: ProfileLoop = [
      { kind: "line", a: { x: r - t, y: lo }, b: { x: r + t, y: lo } },
      { kind: "line", a: { x: r + t, y: lo }, b: { x: r + t, y: hi } },
      { kind: "line", a: { x: r + t, y: hi }, b: { x: r - t, y: hi } },
      { kind: "line", a: { x: r - t, y: hi }, b: { x: r - t, y: lo } }
    ]
    const radial = add3(scale3(x, Math.cos(a0)), scale3(cross3(axis, x), Math.sin(a0)))
    return revolveProfile({ loops: [loop] }, sweep, { origin: s.frame.origin, axis, radial, name: "shell.band" })
  }
  return `a ${s.kind} face has no exact shell yet (planes and cylinders only)`
}

/** Pieces for an edge: a cylinder along a straight one, a torus along a circular one. */
const edgePiece = (b: Brep, ei: number, t: number): Brep | string => {
  const e = b.edges[ei]!
  const tt = t * CROSS
  if (e.curve.kind === "line") {
    const p0 = curvePoint(e.curve, e.t0), p1 = curvePoint(e.curve, e.t1)
    const d = sub3(p1, p0), len = length3(d)
    return makeCylinder(tt, len, frame(p0, normalize3(d)))
  }
  if (e.curve.kind === "circle") {
    const R = e.curve.radius
    if (R < tt + 1e-6) return `a circular edge of radius ${R} is smaller than the wall ${t}`
    const cf = e.curve.frame
    const disc: ProfileLoop = [{ kind: "arc", center: { x: R, y: 0 }, radius: tt, start: 0, end: 2 * Math.PI }]
    const sweep = e.t1 - e.t0
    const full = Math.abs(sweep) >= 2 * Math.PI - 1e-9
    const start = Math.min(e.t0, e.t1)
    const radial = add3(scale3(cf.x, Math.cos(start)), scale3(cf.y, Math.sin(start)))
    return revolveProfile({ loops: [disc] }, full ? 2 * Math.PI : Math.abs(sweep), { origin: cf.origin, axis: cf.z, radial, name: "shell.torus" })
  }
  return `a ${e.curve.kind} edge has no exact shell yet`
}

/**
 * Whether an edge is re-entrant (the body wraps more than a half turn about it): then the offset surface rounds it and it needs a
 * piece. A step into face A, away from the edge in A's own plane, goes behind face B's plane at a convex edge and in front of it at
 * a re-entrant one. Smooth edges (tangent faces) and knife edges have no piece.
 */
const reflex = (b: Brep, uses: ReturnType<typeof edgeUses>, ei: number, loc: ReturnType<typeof brepLocator>): boolean => {
  const e = b.edges[ei]!
  const faces = [...new Set(uses[ei]!.map((u) => u.face))]
  if (faces.length < 2) return false
  const tm = (e.t0 + e.t1) / 2
  const m = curvePoint(e.curve, tm)
  const h = 1e-3 * Math.max(1e-3, length3(sub3(curvePoint(e.curve, e.t1), curvePoint(e.curve, e.t0))))
  const nA = outward(b, faces[0]!, m), nB = outward(b, faces[1]!, m)
  if (dot3(nA, nB) > 1 - 1e-9 || dot3(nA, nB) < -1 + 1e-6) return false
  const tangent = normalize3(sub3(curvePoint(e.curve, Math.min(e.t1, tm + 1e-3 * (e.t1 - e.t0))), curvePoint(e.curve, Math.max(e.t0, tm - 1e-3 * (e.t1 - e.t0)))))
  const w = normalize3(cross3(nA, tangent))
  const into = [w, scale3(w, -1)].find((d) => loc.closest(add3(m, scale3(d, h))).distance < 0.2 * h && loc.closest(add3(m, scale3(d, h))).face === faces[0])
  if (into === undefined) return false
  return dot3(into, nB) > 1e-9
}

export const shellBrep = (b: Brep, thickness: number, options: ShellOptions = {}): ShellResult | string => {
  if (!(thickness > 0) || !Number.isFinite(thickness)) return "the wall must be positive and finite"
  const report = validateBrep(b)
  if (!report.valid || b.shells.length !== 1) return "a shell needs one valid closed solid"
  const open = new Set(options.open ?? [])
  const uses = edgeUses(b)
  const loc = brepLocator(b)
  const pieces: Brep[] = []
  // Faces.
  for (let fi = 0; fi < b.faces.length; fi++) {
    if (open.has(fi)) continue
    const p = facePiece(b, fi, thickness)
    if (typeof p === "string") return `face ${fi}: ${p}`
    pieces.push(p)
  }
  // Re-entrant edges not on an open face, and the vertices they end in.
  const vertices = new Set<number>()
  for (let ei = 0; ei < b.edges.length; ei++) {
    if (uses[ei]!.some((u) => open.has(u.face))) continue
    if (!reflex(b, uses, ei, loc)) continue
    const p = edgePiece(b, ei, thickness)
    if (typeof p === "string") return `edge ${ei}: ${p}`
    pieces.push(p)
    const e = b.edges[ei]!
    vertices.add(e.v0); vertices.add(e.v1)
  }
  for (const v of vertices) {
    pieces.push(makeSphere(thickness * CROSS, frame(b.vertices[v]!.point, { x: 0, y: 0, z: 1 })))
  }
  // The cavity: the body minus the pieces, one exact Boolean each.
  let cavity: Brep = b
  try {
    for (const piece of pieces) {
      cavity = booleanBrep(cavity, piece, "subtract").brep
      if (cavity.faces.length === 0) break
    }
    if (cavity.faces.length === 0) return "the wall leaves no cavity: it is as thick as half the body"
    const shell = booleanBrep(b, cavity, "subtract").brep
    return { brep: shell, cavity, pieces: pieces.length }
  } catch (err) {
    return `exact Boolean failed: ${err instanceof Error ? err.message : String(err)}`
  }
}
