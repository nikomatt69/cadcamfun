/**
 * Exact shell of a solid made of planar and cylindrical faces and faces of revolution (cones, spheres, tori), by dilation of its boundary.
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
import { makeBox, makeCylinder, makeSphere, makeTorus } from "./primitives.ts"
import { blendBrep, blendCandidates } from "./blend.ts"
import { extrudeProfile, loopMoments, offsetLoop, revolveProfile, type ProfileLoop, type ProfileSegment } from "./sweep.ts"
import { faceProfile, type PlanarFacePick } from "./draft.ts"
import { edgeUses, type Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

const CROSS = 1 + 1e-6

export interface ShellOptions {
  /** Faces left open (indices into the body's faces): the cavity reaches them. */
  readonly open?: ReadonlyArray<number>
  /** Per-face wall thickness (face index -> mm), overriding the call's wall where given. Edges and vertices shared by two
   * faces take the thicker of the two walls, so the cavity never breaks through the thinner side's neighbour. */
  readonly wallByFace?: ReadonlyMap<number, number>
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
const facePiece = (b: Brep, fi: number, t: number, margin: number): Brep | string => {
  const f = b.faces[fi]!
  const s = f.surface
  if (s.kind === "plane") {
    const n = f.reversed ? scale3(s.frame.z, -1) : s.frame.z
    const u = s.frame.x
    const pick: PlanarFacePick = { face: fi, origin: s.frame.origin, normal: n, u, v: cross3(n, u), distance: 0 }
    const raw = faceProfile(b, pick)
    if (typeof raw === "string") return raw
    // With a `margin`, a little wider than the face (its outline out, its holes in) so the slab's sides cross whatever stands on
    // the face's boundary instead of lying tangent to it (a dome whose base meets the face's hole along a cylinder). What it gains
    // is within the wall of the boundary but for a sliver of margin²/2t, so the shell is tried without it first.
    const loops = raw.map((l) => {
      if (margin === 0) return l
      try { return offsetLoop(l, loopMoments(l).area > 0 ? -margin : margin) } catch { return l }
    })
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
  if (s.kind === "sphere" || s.kind === "cone" || s.kind === "torus") return revolutionPiece(b, fi, t)
  return `a ${s.kind} face has no exact shell yet (planes, cylinders, cones, spheres and tori only)`
}

/** The smallest arc [start, start + sweep] of the circle that holds all the angles (the largest gap left out). */
const arcRange = (angles: ReadonlyArray<number>): { readonly start: number; readonly sweep: number } => {
  const sorted = [...angles].sort((p, q) => p - q)
  let bestGap = -1, at = 0
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + 2 * Math.PI
    if (next - sorted[i]! > bestGap) { bestGap = next - sorted[i]!; at = i }
  }
  const sweep = 2 * Math.PI - bestGap
  return { start: sorted[(at + 1) % sorted.length]!, sweep: sweep > 2 * Math.PI - 1e-6 ? 2 * Math.PI : sweep }
}

/**
 * The band of a face of revolution (sphere, cone, torus) swept by the ball: its meridian section, the region within `t` of the
 * face's meridian arc, revolved over the face's angular extent. The face must be bounded by circles about its own axis and
 * meridians (a dome, a countersink, a fillet ring); anything else is refused.
 */
const revolutionPiece = (b: Brep, fi: number, t: number): Brep | string => {
  const f = b.faces[fi]!
  const s = f.surface
  if (s.kind !== "sphere" && s.kind !== "cone" && s.kind !== "torus") return "not a surface of revolution"
  const axis = normalize3(s.frame.z), x = s.frame.x, y = cross3(axis, x)
  const uses = new Map<number, number>()
  for (const l of f.loops) for (const c of l.coedges) uses.set(c.edge, (uses.get(c.edge) ?? 0) + 1)
  let seam = false
  let fullMeridian = false
  const pts: Array<{ rho: number; h: number; ang: number }> = []
  for (const l of f.loops) for (const c of l.coedges) {
    const e = b.edges[c.edge]!
    if ((uses.get(c.edge) ?? 0) >= 2) seam = true
    if (e.curve.kind === "circle") {
      const aligned = Math.abs(Math.abs(dot3(e.curve.frame.z, axis)) - 1) < 1e-6
      // A meridian lies in a plane through the axis: its normal is square to the axis and the plane passes through the surface's origin.
      const meridian = Math.abs(dot3(e.curve.frame.z, axis)) < 1e-6 && Math.abs(dot3(sub3(e.curve.frame.origin, s.frame.origin), e.curve.frame.z)) < 1e-6
      if (!aligned && !meridian) return `a ${s.kind} face bounded by a circle that is neither about its axis nor a meridian`
      if (meridian && Math.abs(e.t1 - e.t0) > 2 * Math.PI - 1e-6) fullMeridian = true
    } else if (e.curve.kind !== "line") return `a ${s.kind} face bounded by a ${e.curve.kind}`
    for (let k = 0; k <= 12; k++) {
      const d = sub3(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 12), s.frame.origin)
      pts.push({ rho: Math.hypot(dot3(d, x), dot3(d, y)), h: dot3(d, axis), ang: Math.atan2(dot3(d, y), dot3(d, x)) })
    }
  }
  // Angular extent: the whole turn when the face has a seam or reaches the axis, else the arc its boundary spans.
  const onAxis = pts.some((p) => p.rho < 1e-7)
  const around = pts.filter((p) => p.rho > 1e-7).map((p) => p.ang)
  const range = seam || onAxis || around.length === 0 ? { start: 0, sweep: 2 * Math.PI } : arcRange(around)
  const radial = add3(scale3(x, Math.cos(range.start)), scale3(y, Math.sin(range.start)))
  const line = (a: { x: number; y: number }, c: { x: number; y: number }): ProfileSegment => ({ kind: "line", a, b: c })
  let loop: ProfileLoop
  if (s.kind === "sphere") {
    const R = s.radius
    if (R - t < 1e-6) return `a spherical face of radius ${R} is thinner than the wall ${t}`
    const lat = pts.map((p) => Math.atan2(p.h, p.rho))
    const lo = Math.min(...lat), hi = Math.max(...lat)
    if (!(hi - lo > 1e-9)) return "a spherical face with no extent"
    const o = R + t, i = R - t
    loop = [
      { kind: "arc", center: { x: 0, y: 0 }, radius: o, start: lo, end: hi },
      line({ x: o * Math.cos(hi), y: o * Math.sin(hi) }, { x: i * Math.cos(hi), y: i * Math.sin(hi) }),
      { kind: "arc", center: { x: 0, y: 0 }, radius: i, start: hi, end: lo },
      line({ x: i * Math.cos(lo), y: i * Math.sin(lo) }, { x: o * Math.cos(lo), y: o * Math.sin(lo) })
    ]
  } else if (s.kind === "cone") {
    const al = s.semiAngle, tn = Math.tan(al)
    const hs = pts.map((p) => p.h)
    const lo = Math.min(...hs), hi = Math.max(...hs)
    if (!(hi - lo > 1e-9)) return "a conical face with no extent"
    const P = (h: number) => ({ x: s.radius + h * tn, y: h })
    const n = { x: Math.cos(al), y: -Math.sin(al) }
    const q = (h: number, sign: number) => ({ x: P(h).x + sign * t * n.x, y: P(h).y + sign * t * n.y })
    const corners = [q(lo, -1), q(lo, 1), q(hi, 1), q(hi, -1)]
    if (corners.some((c) => c.x < 1e-6)) return `a conical face closer to its apex than the wall ${t}`
    loop = [line(corners[0]!, corners[1]!), line(corners[1]!, corners[2]!), line(corners[2]!, corners[3]!), line(corners[3]!, corners[0]!)]
  } else {
    const R = s.major, r = s.minor
    if (r - t < 1e-6) return `a toroidal face of tube radius ${r} is thinner than the wall ${t}`
    if (R - r - t < 1e-6) return "a toroidal face whose offset reaches its axis"
    const th = pts.map((p) => Math.atan2(p.h, p.rho - R))
    const a = fullMeridian ? { start: 0, sweep: 2 * Math.PI } : arcRange(th)
    const o = r + t, i = r - t, a1 = a.start + a.sweep
    const at = (rad: number, ang: number) => ({ x: R + rad * Math.cos(ang), y: rad * Math.sin(ang) })
    if (a.sweep >= 2 * Math.PI - 1e-6) {
      // The whole tube: a torus of tube radius r + t less one of r - t.
      try { return booleanBrep(makeTorus(R, o, s.frame), makeTorus(R, i, s.frame), "subtract").brep } catch (err) { return `exact Boolean failed: ${err instanceof Error ? err.message : String(err)}` }
    }
    loop = [
          { kind: "arc", center: { x: R, y: 0 }, radius: o, start: a.start, end: a1 },
          line(at(o, a1), at(i, a1)),
          { kind: "arc", center: { x: R, y: 0 }, radius: i, start: a1, end: a.start },
          line(at(i, a.start), at(o, a.start))
        ]
  }
  return revolveProfile({ loops: [loop] }, range.sweep, { origin: s.frame.origin, axis, radial, name: "shell.revolution" })
}

/** Pieces for an edge: a cylinder along a straight one, a torus along a circular one. `grow` enlarges the piece past `t`. */
const edgePiece = (b: Brep, ei: number, t: number, grow = CROSS): Brep | string => {
  const e = b.edges[ei]!
  const tt = t * grow
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

export interface OffsetResult {
  readonly brep: Brep
  /** Number of boundary pieces used by the construction (zero for a direct primitive). */
  readonly pieces: number
}

/** The offset by uniting the dilation pieces with the body: works where no piece only touches the body along a curve. */
const offsetDirect = (b: Brep, distance: number): OffsetResult | string => {
  const pieces: Brep[] = []
  for (let fi = 0; fi < b.faces.length; fi++) {
    const p = facePiece(b, fi, distance, 0)
    if (typeof p === "string") return `face ${fi}: ${p}`
    pieces.push(p)
  }
  for (let ei = 0; ei < b.edges.length; ei++) {
    const p = edgePiece(b, ei, distance)
    if (typeof p === "string") return `edge ${ei}: ${p}`
    pieces.push(p)
  }
  for (const v of b.vertices) pieces.push(makeSphere(distance * CROSS, frame(v.point, { x: 0, y: 0, z: 1 })))
  let out: Brep = b
  try {
    for (const piece of pieces) out = booleanBrep(out, piece, "union").brep
  } catch (err) {
    return `exact Boolean failed: ${err instanceof Error ? err.message : String(err)}`
  }
  const check = validateBrep(out)
  if (!check.valid) return `the offset did not validate: ${check.issues[0]?.message ?? "unknown"}`
  return { brep: out, pieces: pieces.length }
}

export const offsetBrep = (b: Brep, distance: number): OffsetResult | string => {
  if (!(distance > 0) || !Number.isFinite(distance)) return "the offset must be positive and finite"
  const report = validateBrep(b)
  if (!report.valid || b.shells.length !== 1) return "an offset needs one valid closed solid"
  if (b.faces.length === 1) {
    const s = b.faces[0]!.surface
    if (!b.faces[0]!.reversed && s.kind === "sphere") return { brep: makeSphere(s.radius + distance, s.frame), pieces: 0 }
    if (!b.faces[0]!.reversed && s.kind === "torus" && s.minor + distance < s.major) return { brep: makeTorus(s.major, s.minor + distance, s.frame), pieces: 0 }
  }
  // A rectangular box's dilation is a larger box with every edge rounded by the offset. This construction crosses the
  // faces during the cuts, avoiding the tangent unions of the boundary bands. Detect the box in its own rotated frame.
  if (b.faces.length === 6 && b.vertices.length === 8 && b.edges.length === 12 && b.faces.every((f) => f.surface.kind === "plane") && b.edges.every((e) => e.curve.kind === "line")) {
    const s = b.faces[0]!.surface
    if (s.kind === "plane") {
      const axes = [s.frame.x, s.frame.y, s.frame.z]
      const limits = axes.map((a) => b.vertices.map((v) => dot3(v.point, a)))
      const lo = limits.map((v) => Math.min(...v)), hi = limits.map((v) => Math.max(...v))
      const tol = Math.max(...hi.map((v, i) => v - lo[i]!)) * 1e-8
      const corners = new Set(b.vertices.map((_, i) => limits.map((v, k) => Math.abs(v[i]! - lo[k]!) < tol ? "0" : Math.abs(v[i]! - hi[k]!) < tol ? "1" : "?").join("")))
      if (corners.size === 8 && [...corners].every((v) => !v.includes("?"))) {
        const origin = axes.reduce((p, a, i) => add3(p, scale3(a, lo[i]! - distance)), { x: 0, y: 0, z: 0 })
        const grown = makeBox(hi[0]! - lo[0]! + 2 * distance, hi[1]! - lo[1]! + 2 * distance, hi[2]! - lo[2]! + 2 * distance, frame(origin, axes[2]!, axes[0]!))
        const rounded = blendBrep(grown, blendCandidates(grown), distance)
        if (rounded.failures.length > 0 || rounded.rejected.length > 0) return `offset corner blend failed: ${[...rounded.failures, ...rounded.rejected].join("; ")}`
        const check = validateBrep(rounded.brep)
        if (!check.valid) return `offset corner blend did not validate: ${check.issues[0]?.message}`
        return { brep: rounded.brep, pieces: 26 }
      }
    }
  }
  return offsetDirect(b, distance)
}

export const shellBrep = (b: Brep, thickness: number, options: ShellOptions = {}): ShellResult | string => {
  if (!(thickness > 0) || !Number.isFinite(thickness)) return "the wall must be positive and finite"
  const report = validateBrep(b)
  if (!report.valid || b.shells.length !== 1) return "a shell needs one valid closed solid"
  let last = "no attempt"
  for (const margin of [0, 1e-2 * thickness]) {
    const r = shellAttempt(b, thickness, options, margin)
    if (typeof r !== "string") return r
    last = r
    // Only a failed Boolean is worth another try with wider slabs; a refusal for the geometry is final.
    if (!r.startsWith("exact Boolean failed")) return r
  }
  return last
}

/** The body eroded by its wall(s): the body minus a dilation piece per face, re-entrant edge and vertex. */
const erode = (b: Brep, thickness: number, options: ShellOptions, margin: number): { readonly cavity: Brep; readonly pieces: number } | string => {
  const open = new Set(options.open ?? [])
  const wallOf = (fi: number): number => options.wallByFace?.get(fi) ?? thickness
  for (const [fi, t] of options.wallByFace ?? []) {
    if (b.faces[fi] === undefined) return `wallByFace names face ${fi}, which does not exist`
    if (!(t > 0) || !Number.isFinite(t)) return `the wall of face ${fi} must be positive and finite`
  }
  const uses = edgeUses(b)
  const loc = brepLocator(b)
  const pieces: Brep[] = []
  for (let fi = 0; fi < b.faces.length; fi++) {
    if (open.has(fi)) continue
    const p = facePiece(b, fi, wallOf(fi), margin)
    if (typeof p === "string") return `face ${fi}: ${p}`
    pieces.push(p)
  }
  const vertexWall = new Map<number, number>()
  for (let ei = 0; ei < b.edges.length; ei++) {
    if (uses[ei]!.some((u) => open.has(u.face))) continue
    if (!reflex(b, uses, ei, loc)) continue
    const t = Math.max(...uses[ei]!.map((u) => wallOf(u.face)))
    const p = edgePiece(b, ei, t)
    if (typeof p === "string") return `edge ${ei}: ${p}`
    pieces.push(p)
    const e = b.edges[ei]!
    for (const v of [e.v0, e.v1]) vertexWall.set(v, Math.max(vertexWall.get(v) ?? 0, t))
  }
  for (const [v, t] of vertexWall) pieces.push(makeSphere(t * CROSS, frame(b.vertices[v]!.point, { x: 0, y: 0, z: 1 })))
  let cavity: Brep = b
  try {
    for (const piece of pieces) {
      cavity = booleanBrep(cavity, piece, "subtract").brep
      if (cavity.faces.length === 0) break
    }
  } catch (err) {
    return `exact Boolean failed: ${err instanceof Error ? err.message : String(err)}`
  }
  return { cavity, pieces: pieces.length }
}

const shellAttempt = (b: Brep, thickness: number, options: ShellOptions, margin: number): ShellResult | string => {
  const eroded = erode(b, thickness, options, margin)
  if (typeof eroded === "string") return eroded
  if (eroded.cavity.faces.length === 0) return "the wall leaves no cavity: it is as thick as half the body"
  try {
    const shell = booleanBrep(b, eroded.cavity, "subtract").brep
    return { brep: shell, cavity: eroded.cavity, pieces: eroded.pieces }
  } catch (err) {
    return `exact Boolean failed: ${err instanceof Error ? err.message : String(err)}`
  }
}
