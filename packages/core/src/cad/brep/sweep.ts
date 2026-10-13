/**
 * Exact sweeps of planar profiles (SMLib's linear_sweep / rotational_sweep): extrusion along the sketch normal and
 * revolution about an axis in the sketch plane. Lines, arcs and NURBS segments of the profile become planes,
 * cylinders and extrusion surfaces (extrude) or planes, cylinders, cones, spheres, tori and surfaces of revolution
 * (revolve), all exact.
 */
import { applyPoint, cross3, dot3, frame, fromFrame, MODEL_TOL, neg3, normalize3, rotation, sub3, WORLD, type Frame, type Vec2, type Vec3 } from "./math.ts"
import { circleCurve, lineCurve, surfaceDerivs, surfaceNormal, surfaceProject, transformCurve, type Curve3, type Surface } from "./geom.ts"
import { curveDomain, nurbsCurveDerivs, type NurbsCurveData } from "./nurbs.ts"
import { BrepBuilder, type Brep } from "./topology.ts"

const TAU = Math.PI * 2

// ================================================================ profiles

/** One piece of a closed planar profile, traversed in the order given. */
export type ProfileSegment =
  | { readonly kind: "line"; readonly a: Vec2; readonly b: Vec2 }
  /** Arc of `radius` about `center` from angle `start` to `end` (counter-clockwise when end > start). */
  | { readonly kind: "arc"; readonly center: Vec2; readonly radius: number; readonly start: number; readonly end: number }
  /** A 2D NURBS curve traversed over its whole domain. */
  | { readonly kind: "nurbs"; readonly data: NurbsCurveData }

export type ProfileLoop = ReadonlyArray<ProfileSegment>

/** Closed loops; the one of largest area is the outer boundary, the others are holes. */
export interface Profile {
  readonly loops: ReadonlyArray<ProfileLoop>
}

export const segmentStart = (s: ProfileSegment): Vec2 => segmentPoint(s, 0)
export const segmentEnd = (s: ProfileSegment): Vec2 => segmentPoint(s, 1)

/** Point at fraction `f` of the segment. */
export const segmentPoint = (s: ProfileSegment, f: number): Vec2 => {
  switch (s.kind) {
    case "line":
      return { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f }
    case "arc": {
      const t = s.start + (s.end - s.start) * f
      return { x: s.center.x + s.radius * Math.cos(t), y: s.center.y + s.radius * Math.sin(t) }
    }
    case "nurbs": {
      const [a, b] = curveDomain(s.data)
      const p = nurbsCurveDerivs(s.data, a + (b - a) * f, 0)[0]!
      return { x: p[0]!, y: p[1]! }
    }
  }
}

export const reverseSegment = (s: ProfileSegment): ProfileSegment => {
  switch (s.kind) {
    case "line":
      return { kind: "line", a: s.b, b: s.a }
    case "arc":
      return { ...s, start: s.end, end: s.start }
    case "nurbs": {
      const d = s.data
      const [a, b] = curveDomain(d)
      const knots = [...d.knots].reverse().map((k) => a + b - k)
      const points = [...d.points].reverse()
      return { kind: "nurbs", data: d.weights === undefined ? { degree: d.degree, knots, points } : { degree: d.degree, knots, points, weights: [...d.weights].reverse() } }
    }
  }
}

export const reverseLoop = (l: ProfileLoop): ProfileLoop => [...l].reverse().map(reverseSegment)

/** Signed area of a loop (positive counter-clockwise), from a fine sampling of its segments. */
export const loopArea = (l: ProfileLoop): number => {
  let area = 0
  for (const s of l) {
    const n = s.kind === "line" ? 1 : 64
    let prev = segmentPoint(s, 0)
    for (let i = 1; i <= n; i++) {
      const p = segmentPoint(s, i / n)
      area += prev.x * p.y - p.x * prev.y
      prev = p
    }
  }
  return area / 2
}

const near2 = (a: Vec2, b: Vec2, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol

/** Checks closure and returns the loops oriented: outer counter-clockwise first, holes clockwise. */
export const normalizeProfile = (p: Profile, tol = 1e-7): ReadonlyArray<ProfileLoop> => {
  if (p.loops.length === 0) throw new RangeError("profile has no loops")
  const loops = p.loops.map((l, li) => {
    if (l.length === 0) throw new RangeError(`profile loop ${li} is empty`)
    for (let i = 0; i < l.length; i++) {
      const a = segmentEnd(l[i]!), b = segmentStart(l[(i + 1) % l.length]!)
      if (!near2(a, b, Math.max(tol, 1e-9 * (1 + Math.abs(a.x) + Math.abs(a.y))))) throw new RangeError(`profile loop ${li} is open between segments ${i} and ${(i + 1) % l.length}`)
    }
    return l
  })
  const areas = loops.map(loopArea)
  let outer = 0
  for (let i = 1; i < loops.length; i++) if (Math.abs(areas[i]!) > Math.abs(areas[outer]!)) outer = i
  if (Math.abs(areas[outer]!) <= 0) throw new RangeError("profile has zero area")
  const out: ProfileLoop[] = [areas[outer]! > 0 ? loops[outer]! : reverseLoop(loops[outer]!)]
  loops.forEach((l, i) => {
    if (i !== outer) out.push(areas[i]! < 0 ? l : reverseLoop(l))
  })
  return out
}

// ------------------------------------------------ profile constructors

export const polygonProfileLoop = (points: ReadonlyArray<Vec2>): ProfileLoop =>
  points.map((a, i) => ({ kind: "line", a, b: points[(i + 1) % points.length]! }) as const)

export const rectangleProfileLoop = (x0: number, y0: number, x1: number, y1: number): ProfileLoop =>
  polygonProfileLoop([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }])

export const circleProfileLoop = (center: Vec2, radius: number): ProfileLoop => [{ kind: "arc", center, radius, start: 0, end: TAU }]

/** Rectangle with rounded corners of radius `r` (0 ≤ r ≤ half the smaller side). */
export const roundedRectangleLoop = (x0: number, y0: number, x1: number, y1: number, r: number): ProfileLoop => {
  if (r <= 0) return rectangleProfileLoop(x0, y0, x1, y1)
  const h = Math.PI / 2
  const segs: ProfileSegment[] = []
  const line = (a: Vec2, b: Vec2) => { if (!near2(a, b, 1e-12)) segs.push({ kind: "line", a, b }) }
  line({ x: x0 + r, y: y0 }, { x: x1 - r, y: y0 })
  segs.push({ kind: "arc", center: { x: x1 - r, y: y0 + r }, radius: r, start: -h, end: 0 })
  line({ x: x1, y: y0 + r }, { x: x1, y: y1 - r })
  segs.push({ kind: "arc", center: { x: x1 - r, y: y1 - r }, radius: r, start: 0, end: h })
  line({ x: x1 - r, y: y1 }, { x: x0 + r, y: y1 })
  segs.push({ kind: "arc", center: { x: x0 + r, y: y1 - r }, radius: r, start: h, end: 2 * h })
  line({ x: x0, y: y1 - r }, { x: x0, y: y0 + r })
  segs.push({ kind: "arc", center: { x: x0 + r, y: y0 + r }, radius: r, start: 2 * h, end: 3 * h })
  return segs
}

// ================================================================ 3D curves of segments

/** The segment as an exact 3D curve in `f` (sketch x/y → frame x/y), its range, and whether it runs forward. */
const segmentCurve = (s: ProfileSegment, f: Frame): { readonly curve: Curve3; readonly t0: number; readonly t1: number; readonly forward: boolean } => {
  switch (s.kind) {
    case "line": {
      const a = fromFrame(f, s.a.x, s.a.y), b = fromFrame(f, s.b.x, s.b.y)
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
      return { curve: lineCurve(a, sub3(b, a)), t0: 0, t1: len, forward: true }
    }
    case "arc": {
      const cf: Frame = { ...f, origin: fromFrame(f, s.center.x, s.center.y) }
      const forward = s.end > s.start
      const lo = Math.min(s.start, s.end), hi = Math.max(s.start, s.end)
      return { curve: circleCurve(cf, s.radius), t0: lo, t1: hi, forward }
    }
    case "nurbs": {
      const [a, b] = curveDomain(s.data)
      const points = s.data.points.map((q) => { const p = fromFrame(f, q[0]!, q[1]!); return [p.x, p.y, p.z] })
      return { curve: { kind: "nurbs", data: { ...s.data, points } }, t0: a, t1: b, forward: true }
    }
  }
}

// ================================================================ extrude

export interface ExtrudeOptions {
  /** Sketch plane: profile x/y are the frame's x/y; the solid grows along +z (or −z for a negative distance). */
  readonly placement?: Frame
  /** Face name prefix for persistent naming (`<prefix>.bottom`, `.top`, `.side<i>.<j>`). */
  readonly name?: string
}

/** Linear sweep of a closed profile by `distance` along the sketch normal. */
export const extrudeProfile = (profile: Profile, distance: number, options: ExtrudeOptions = {}): Brep => {
  if (!(Number.isFinite(distance) && Math.abs(distance) > MODEL_TOL)) throw new RangeError("extrude distance must be non-zero")
  const base = options.placement ?? WORLD
  // Grow along +z from the lower plane.
  const f0: Frame = distance > 0 ? base : { ...base, origin: fromFrame(base, 0, 0, distance) }
  const d = Math.abs(distance)
  const f1: Frame = { ...f0, origin: fromFrame(f0, 0, 0, d) }
  const prefix = options.name ?? "extrude"
  const loops = normalizeProfile(profile)
  const b = new BrepBuilder()
  const bottomLoops: Array<Array<readonly [number, boolean]>> = []
  const topLoops: Array<Array<readonly [number, boolean]>> = []
  loops.forEach((loop, li) => {
    const n = loop.length
    const vb = loop.map((s) => b.newVertex(fromFrame(f0, segmentStart(s).x, segmentStart(s).y)))
    const vt = loop.map((s) => b.newVertex(fromFrame(f1, segmentStart(s).x, segmentStart(s).y)))
    const verticals = loop.map((_, i) => b.edge(lineCurve(b.vertices[vb[i]!]!.point, f0.z), 0, d, vb[i], vt[i]))
    const bottom: Array<readonly [number, boolean]> = []
    const top: Array<readonly [number, boolean]> = []
    loop.forEach((s, i) => {
      const j = (i + 1) % n
      const cb = segmentCurve(s, f0)
      const ct = segmentCurve(s, f1)
      const [b0, b1] = cb.forward ? [vb[i]!, vb[j]!] : [vb[j]!, vb[i]!]
      const [t0, t1] = cb.forward ? [vt[i]!, vt[j]!] : [vt[j]!, vt[i]!]
      const eb = b.edge(cb.curve, cb.t0, cb.t1, b0, b1)
      const et = b.edge(ct.curve, ct.t0, ct.t1, t0, t1)
      bottom.push([eb, cb.forward])
      top.push([et, !ct.forward])
      let surface: Surface
      let reversed = false
      switch (s.kind) {
        case "line": {
          const a = b.vertices[vb[i]!]!.point, c = b.vertices[vb[j]!]!.point
          const dir = normalize3(sub3(c, a))
          surface = { kind: "plane", frame: frame(a, cross3(dir, f0.z), dir) }
          break
        }
        case "arc":
          surface = { kind: "cylinder", frame: { ...f0, origin: fromFrame(f0, s.center.x, s.center.y) }, radius: s.radius }
          reversed = s.end < s.start
          break
        case "nurbs":
          surface = { kind: "extrusion", curve: cb.curve, dir: f0.z }
          break
      }
      b.face(surface, reversed, [[[eb, !cb.forward], [verticals[j]!, false], [et, cb.forward], [verticals[i]!, true]]], `${prefix}.side${li}.${i}`)
    })
    // Bottom face sees the profile from below: every coedge reversed, order reversed.
    bottomLoops.push(bottom.reverse())
    topLoops.push(top)
  })
  b.face({ kind: "plane", frame: frame(f0.origin, neg3(f0.z), f0.x) }, false, bottomLoops, `${prefix}.bottom`)
  b.face({ kind: "plane", frame: f1 }, false, topLoops, `${prefix}.top`)
  return b.build()
}

// ================================================================ revolve

export interface RevolveOptions {
  /** Axis origin; profile x is the distance from the axis along `radial`, profile y the position along `axis`. */
  readonly origin?: Vec3
  readonly axis?: Vec3
  readonly radial?: Vec3
  readonly name?: string
}

/**
 * Rotational sweep of a closed profile lying on one side of the axis (profile x ≥ 0) by `angle` ∈ (0, 2π] about the
 * axis (right-hand rule). A full turn has no caps; segments on the axis produce no face.
 */
export const revolveProfile = (profile: Profile, angle: number, options: RevolveOptions = {}): Brep => {
  if (!(angle > 0 && angle <= TAU + 1e-12)) throw new RangeError("revolve angle must be in (0, 2π]")
  const full = angle >= TAU - 1e-9
  const theta = full ? TAU : angle
  const A = normalize3(options.axis ?? { x: 0, y: 0, z: 1 })
  const O = options.origin ?? { x: 0, y: 0, z: 0 }
  const F = frame(O, A, options.radial ?? { x: 1, y: 0, z: 0 })
  const X = F.x
  const prefix = options.name ?? "revolve"
  // Profile plane frame: x = radial, y = axis.
  const P: Frame = frame(O, cross3(X, A), X)
  const tol = MODEL_TOL
  const loops = normalizeProfile(profile)
  for (const l of loops) for (const s of l) for (let k = 0; k <= 8; k++) if (segmentPoint(s, k / 8).x < -tol) throw new RangeError("revolve profile crosses the axis")
  const rot = rotation(A, theta, O)
  const b = new BrepBuilder()
  const onAxis = (p: Vec2) => Math.abs(p.x) <= tol
  // Vertices at angle 0 and θ (shared when on the axis or for a full turn).
  // Profile points are welded by distance (the end of a full-circle arc comes back as cos 2π, sin 2π ≈ −2e-16).
  const profilePoints: Vec2[] = []
  const pid = (p: Vec2): number => {
    const i = profilePoints.findIndex((q) => near2(q, p, tol))
    if (i >= 0) return i
    profilePoints.push(p)
    return profilePoints.length - 1
  }
  const v0Of = new Map<number, number>()
  const vtOf = new Map<number, number>()
  const vertex0 = (p: Vec2): number => {
    const k = pid(p)
    let v = v0Of.get(k)
    if (v === undefined) { const q = profilePoints[k]!; v = b.newVertex(fromFrame(P, q.x, q.y)); v0Of.set(k, v) }
    return v
  }
  const vertexT = (p: Vec2): number => {
    if (full || onAxis(p)) return vertex0(p)
    const k = pid(p)
    let v = vtOf.get(k)
    if (v === undefined) { const q = profilePoints[k]!; v = b.newVertex(applyPoint(rot, fromFrame(P, q.x, q.y))); vtOf.set(k, v) }
    return v
  }
  // Circle (arc) swept by an off-axis profile vertex.
  const circleOf = new Map<number, number>()
  const circle = (p: Vec2): number | undefined => {
    if (onAxis(p)) return undefined
    const k = pid(p)
    let e = circleOf.get(k)
    if (e === undefined) {
      const q = profilePoints[k]!
      const cf = frame(fromFrame(P, 0, q.y), A, X)
      e = b.edge(circleCurve(cf, q.x), 0, theta, vertex0(p), vertexT(p))
      circleOf.set(k, e)
    }
    return e
  }
  const capLoops0: Array<Array<readonly [number, boolean]>> = []
  const capLoopsT: Array<Array<readonly [number, boolean]>> = []
  loops.forEach((loop, li) => {
    const cap0: Array<readonly [number, boolean]> = []
    const capT: Array<readonly [number, boolean]> = []
    loop.forEach((s, si) => {
      const pa = segmentStart(s), pb = segmentEnd(s)
      const axial = onAxis(pa) && onAxis(pb) && (s.kind === "line" || [0.25, 0.5, 0.75].every((f) => onAxis(segmentPoint(s, f))))
      const perpendicular = s.kind === "line" && Math.abs(pa.y - pb.y) <= tol
      const c = segmentCurve(s, P)
      const [a0, a1] = c.forward ? [vertex0(pa), vertex0(pb)] : [vertex0(pb), vertex0(pa)]
      // Profile edges are needed for caps (partial turn) and as seams (non-planar faces of a full turn).
      const needEdge0 = !full || (!axial && !perpendicular)
      const e0 = needEdge0 ? b.edge(c.curve, c.t0, c.t1, a0, a1) : -1
      let eT = e0
      if (!full && !axial) {
        const [t0v, t1v] = c.forward ? [vertexT(pa), vertexT(pb)] : [vertexT(pb), vertexT(pa)]
        eT = b.edge(transformCurve(c.curve, rot), c.t0, c.t1, t0v, t1v)
      }
      if (!full) {
        cap0.push([e0, !c.forward])
        capT.push([eT, !c.forward])
      }
      if (axial) return
      const ca = circle(pa), cb = circle(pb)
      const generic: Surface = { kind: "revolution", curve: c.curve, origin: O, axis: A }
      const surface = recognise(s, P, O, A, X) ?? generic
      // Natural normal of the generic surface points out of the material for a counter-clockwise (x = r, y = axis) loop.
      const vMid = (c.t0 + c.t1) / 2
      const sample = surfaceDerivs(generic, theta / 2, vMid)
      const outward = normalize3(cross3(sample.su, sample.sv))
      const outwardSigned = c.forward ? outward : neg3(outward)
      let reversed = false
      if (surface !== generic) {
        const uv = surfaceProject(surface, sample.p)
        reversed = dot3(surfaceNormal(surface, uv.u, uv.v), outwardSigned) < 0
      } else reversed = !c.forward
      const name = `${prefix}.side${li}.${si}`
      if (full && perpendicular) {
        // A flat ring or disc: circles only, no seam.
        const ls: Array<Array<readonly [number, boolean]>> = []
        if (ca !== undefined) ls.push([[ca, false]])
        if (cb !== undefined) ls.push([[cb, true]])
        b.face(surface, reversed, ls, name)
        return
      }
      const loopEdges: Array<readonly [number, boolean]> = []
      if (ca !== undefined) loopEdges.push([ca, false])
      loopEdges.push([eT, !c.forward])
      if (cb !== undefined) loopEdges.push([cb, true])
      loopEdges.push([e0, c.forward])
      b.face(surface, reversed, [loopEdges], name)
    })
    if (!full) {
      capLoops0.push(cap0.map(([e, r]) => [e, r] as const))
      capLoopsT.push(capT.reverse().map(([e, r]) => [e, !r] as const))
    }
  })
  if (!full) {
    b.face({ kind: "plane", frame: frame(O, cross3(X, A), X) }, false, capLoops0, `${prefix}.start`)
    const Xt = normalize3(applyDir(rot, X))
    b.face({ kind: "plane", frame: frame(O, cross3(A, Xt), A) }, false, capLoopsT, `${prefix}.end`)
  }
  return b.build()
}

const applyDir = (tr: ReturnType<typeof rotation>, v: Vec3): Vec3 => sub3(applyPoint(tr, v), applyPoint(tr, { x: 0, y: 0, z: 0 }))

/** Analytic surface swept by a line or an arc of the profile (plane, cylinder, cone, sphere, torus). */
const recognise = (s: ProfileSegment, P: Frame, O: Vec3, A: Vec3, X: Vec3): Surface | undefined => {
  const tol = MODEL_TOL
  if (s.kind === "line") {
    const { a, b } = s
    if (Math.abs(a.y - b.y) <= tol) return { kind: "plane", frame: frame(fromFrame(P, 0, a.y), A, X) }
    if (Math.abs(a.x - b.x) <= tol) return { kind: "cylinder", frame: frame(O, A, X), radius: a.x }
    const tanA = (b.x - a.x) / (b.y - a.y)
    // Cone apex side: place the frame at the profile point's height; radius there must be ≥ 0.
    return { kind: "cone", frame: frame(fromFrame(P, 0, a.y), A, X), radius: a.x, semiAngle: Math.atan(tanA) }
  }
  if (s.kind === "arc") {
    if (Math.abs(s.center.x) <= tol) return { kind: "sphere", frame: frame(fromFrame(P, 0, s.center.y), A, X), radius: s.radius }
    if (s.radius < s.center.x) return { kind: "torus", frame: frame(fromFrame(P, 0, s.center.y), A, X), major: s.center.x, minor: s.radius }
  }
  return undefined
}

