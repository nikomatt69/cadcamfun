/**
 * Exact curve and surface geometry of the B-rep kernel. Analytic types use STEP's (ISO 10303-42) parameterisations so
 * that faces read from and written to STEP keep their parameters:
 *
 *   line      C(t) = O + t d                                   (d unit, t = arc length)
 *   circle    C(t) = O + r (cos t x + sin t y)
 *   ellipse   C(t) = O + a cos t x + b sin t y
 *   plane     S(u,v) = O + u x + v y
 *   cylinder  S(u,v) = O + r (cos u x + sin u y) + v z
 *   cone      S(u,v) = O + (R + v tan α)(cos u x + sin u y) + v z
 *   sphere    S(u,v) = O + r cos v (cos u x + sin u y) + r sin v z
 *   torus     S(u,v) = O + (R + r cos v)(cos u x + sin u y) + r sin v z
 *   revolution S(u,v) = rotate(C(v), axis, u)           (u = angle about the axis)
 *   extrusion  S(u,v) = C(u) + v d
 *
 * Every surface's natural normal is S_u × S_v; a face that wants the other side says `reversed`.
 */
import {
  add3,
  applyDir,
  applyPoint,
  clamp,
  cross3,
  dirFromFrame,
  dot3,
  frame,
  fromFrame,
  length3,
  madd3,
  normalize3,
  rotation,
  scale3,
  scaleOf,
  solve2,
  sub3,
  toFrame,
  transformFrame,
  wrap,
  type Frame,
  type Transform,
  type Vec2,
  type Vec3
} from "./math.ts"
import { curveDomain, nurbsCurveDerivs, nurbsSurfaceDerivs, surfaceDomain, type NurbsCurveData, type NurbsSurfaceData } from "./nurbs.ts"

const TAU = Math.PI * 2

// ================================================================ curves (3D)

export type Curve3 =
  | { readonly kind: "line"; readonly origin: Vec3; readonly dir: Vec3 }
  | { readonly kind: "circle"; readonly frame: Frame; readonly radius: number }
  | { readonly kind: "ellipse"; readonly frame: Frame; readonly a: number; readonly b: number }
  | { readonly kind: "nurbs"; readonly data: NurbsCurveData }

export const lineCurve = (origin: Vec3, dir: Vec3): Curve3 => ({ kind: "line", origin, dir: normalize3(dir) })
export const circleCurve = (f: Frame, radius: number): Curve3 => ({ kind: "circle", frame: f, radius })
export const nurbsCurve = (data: NurbsCurveData): Curve3 => ({ kind: "nurbs", data })

const toV3 = (a: ReadonlyArray<number>): Vec3 => ({ x: a[0]!, y: a[1]!, z: a[2] ?? 0 })

/** Point and derivatives (order ≤ 2): `[C, C', C'']`. */
export const curveDerivs = (c: Curve3, t: number): readonly [Vec3, Vec3, Vec3] => {
  switch (c.kind) {
    case "line":
      return [madd3(c.origin, c.dir, t), c.dir, { x: 0, y: 0, z: 0 }]
    case "circle": {
      const cs = Math.cos(t), sn = Math.sin(t), r = c.radius
      return [fromFrame(c.frame, r * cs, r * sn), dirFromFrame(c.frame, -r * sn, r * cs), dirFromFrame(c.frame, -r * cs, -r * sn)]
    }
    case "ellipse": {
      const cs = Math.cos(t), sn = Math.sin(t)
      return [
        fromFrame(c.frame, c.a * cs, c.b * sn),
        dirFromFrame(c.frame, -c.a * sn, c.b * cs),
        dirFromFrame(c.frame, -c.a * cs, -c.b * sn)
      ]
    }
    case "nurbs": {
      const d = nurbsCurveDerivs(c.data, t, 2)
      return [toV3(d[0]!), toV3(d[1]!), toV3(d[2]!)]
    }
  }
}

export const curvePoint = (c: Curve3, t: number): Vec3 => curveDerivs(c, t)[0]

/** Natural parameter range; lines are unbounded. */
export const curveRange = (c: Curve3): readonly [number, number] =>
  c.kind === "line" ? [-Infinity, Infinity] : c.kind === "nurbs" ? curveDomain(c.data) : [0, TAU]

export const curvePeriod = (c: Curve3): number | undefined => (c.kind === "circle" || c.kind === "ellipse" ? TAU : undefined)

/** Parameter of the point of `c` closest to `p`, optionally restricted to `[lo, hi]`. */
export const curveProject = (c: Curve3, p: Vec3, lo?: number, hi?: number, hint?: number): number => {
  const bounded = (t: number): number => (lo === undefined || hi === undefined ? t : clamp(t, lo, hi))
  switch (c.kind) {
    case "line":
      return bounded(dot3(sub3(p, c.origin), c.dir))
    case "circle": {
      const l = toFrame(c.frame, p)
      let t = Math.atan2(l.y, l.x)
      if (lo !== undefined && hi !== undefined) {
        t = wrap(t, lo - (TAU - (hi - lo)) / 2, TAU)
        return clamp(t, lo, hi)
      }
      return wrap(t, 0, TAU)
    }
    case "ellipse":
    case "nurbs": {
      const [a, b] = lo !== undefined && hi !== undefined ? [lo, hi] : c.kind === "ellipse" ? [0, TAU] : curveDomain(c.data)
      const samples = c.kind === "nurbs" ? Math.max(16, c.data.points.length * 6) : 32
      let best = hint ?? a
      let bestD = hint === undefined ? Infinity : length3(sub3(curvePoint(c, hint), p))
      for (let i = 0; i <= samples; i++) {
        const t = a + ((b - a) * i) / samples
        const d = length3(sub3(curvePoint(c, t), p))
        if (d < bestD) { bestD = d; best = t }
      }
      return newtonCurve(c, p, best, a, b, c.kind === "ellipse" && lo === undefined)
    }
  }
}

const newtonCurve = (c: Curve3, p: Vec3, t0: number, a: number, b: number, periodic: boolean): number => {
  let t = t0
  for (let it = 0; it < 30; it++) {
    const [C, d1, d2] = curveDerivs(c, t)
    const r = sub3(C, p)
    const f = dot3(r, d1)
    const df = dot3(d1, d1) + dot3(r, d2)
    // A coarse seed at a flat ellipse's end can have negative curvature of squared distance while the minimum lies
    // inside the interval. Use a descent step there; even a Newton step must reduce distance before it is accepted.
    const step = df > 0 ? -f / df : -Math.sign(f) * (b - a) / 32
    const distance2 = dot3(r, r)
    let next = t
    for (let scale = 1; scale >= 1 / 65536; scale /= 2) {
      const candidate = periodic ? wrap(t + step * scale, a, b - a) : clamp(t + step * scale, a, b)
      const delta = sub3(curvePoint(c, candidate), p)
      if (dot3(delta, delta) <= distance2) { next = candidate; break }
    }
    if (Math.abs(next - t) < 1e-14 * Math.max(1, Math.abs(t))) { t = next; break }
    t = next
  }
  return t
}

export const transformCurve = (c: Curve3, tr: Transform): Curve3 => {
  const s = scaleOf(tr)
  switch (c.kind) {
    case "line":
      return { kind: "line", origin: applyPoint(tr, c.origin), dir: normalize3(applyDir(tr, c.dir)) }
    case "circle":
      return { kind: "circle", frame: transformFrame(tr, c.frame), radius: c.radius * s }
    case "ellipse":
      return { kind: "ellipse", frame: transformFrame(tr, c.frame), a: c.a * s, b: c.b * s }
    case "nurbs":
      return {
        kind: "nurbs",
        data: { ...c.data, points: c.data.points.map((q) => { const v = applyPoint(tr, toV3(q)); return [v.x, v.y, v.z] }) }
      }
  }
}

// ================================================================ curves (2D, parameter space)

/** Curves in a surface's (u, v) domain: edge-use p-curves and sketch profiles. */
export type Curve2 =
  | { readonly kind: "line2"; readonly origin: Vec2; readonly dir: Vec2 }
  | { readonly kind: "circle2"; readonly center: Vec2; readonly radius: number }
  | { readonly kind: "nurbs2"; readonly data: NurbsCurveData }
  /** Piecewise linear in its parameter: point i at parameter `params[i]`. */
  | { readonly kind: "poly2"; readonly points: ReadonlyArray<Vec2>; readonly params: ReadonlyArray<number> }

export const curve2Point = (c: Curve2, t: number): Vec2 => {
  switch (c.kind) {
    case "line2":
      return { x: c.origin.x + c.dir.x * t, y: c.origin.y + c.dir.y * t }
    case "circle2":
      return { x: c.center.x + c.radius * Math.cos(t), y: c.center.y + c.radius * Math.sin(t) }
    case "nurbs2": {
      const d = nurbsCurveDerivs(c.data, t, 0)[0]!
      return { x: d[0]!, y: d[1]! }
    }
    case "poly2": {
      const P = c.params
      const n = P.length
      if (t <= P[0]!) return c.points[0]!
      if (t >= P[n - 1]!) return c.points[n - 1]!
      let lo = 0, hi = n - 1
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1
        if (P[m]! <= t) lo = m
        else hi = m
      }
      const f = (t - P[lo]!) / (P[hi]! - P[lo]!)
      const a = c.points[lo]!, b = c.points[hi]!
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
    }
  }
}

// ================================================================ surfaces

export type Surface =
  | { readonly kind: "plane"; readonly frame: Frame }
  | { readonly kind: "cylinder"; readonly frame: Frame; readonly radius: number }
  | { readonly kind: "cone"; readonly frame: Frame; readonly radius: number; readonly semiAngle: number }
  | { readonly kind: "sphere"; readonly frame: Frame; readonly radius: number }
  | { readonly kind: "torus"; readonly frame: Frame; readonly major: number; readonly minor: number }
  | { readonly kind: "nurbs"; readonly data: NurbsSurfaceData }
  | { readonly kind: "revolution"; readonly curve: Curve3; readonly origin: Vec3; readonly axis: Vec3 }
  | { readonly kind: "extrusion"; readonly curve: Curve3; readonly dir: Vec3 }

export interface SurfaceDerivs {
  readonly p: Vec3
  readonly su: Vec3
  readonly sv: Vec3
  readonly suu: Vec3
  readonly suv: Vec3
  readonly svv: Vec3
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 }

export const surfaceDerivs = (s: Surface, u: number, v: number): SurfaceDerivs => {
  switch (s.kind) {
    case "plane":
      return { p: fromFrame(s.frame, u, v), su: s.frame.x, sv: s.frame.y, suu: ZERO, suv: ZERO, svv: ZERO }
    case "cylinder": {
      const c = Math.cos(u), sn = Math.sin(u), r = s.radius, f = s.frame
      return {
        p: fromFrame(f, r * c, r * sn, v),
        su: dirFromFrame(f, -r * sn, r * c),
        sv: f.z,
        suu: dirFromFrame(f, -r * c, -r * sn),
        suv: ZERO,
        svv: ZERO
      }
    }
    case "cone": {
      const c = Math.cos(u), sn = Math.sin(u), f = s.frame, t = Math.tan(s.semiAngle)
      const rho = s.radius + v * t
      return {
        p: fromFrame(f, rho * c, rho * sn, v),
        su: dirFromFrame(f, -rho * sn, rho * c),
        sv: dirFromFrame(f, t * c, t * sn, 1),
        suu: dirFromFrame(f, -rho * c, -rho * sn),
        suv: dirFromFrame(f, -t * sn, t * c),
        svv: ZERO
      }
    }
    case "sphere": {
      const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v), r = s.radius, f = s.frame
      return {
        p: fromFrame(f, r * cv * cu, r * cv * su, r * sv),
        su: dirFromFrame(f, -r * cv * su, r * cv * cu),
        sv: dirFromFrame(f, -r * sv * cu, -r * sv * su, r * cv),
        suu: dirFromFrame(f, -r * cv * cu, -r * cv * su),
        suv: dirFromFrame(f, r * sv * su, -r * sv * cu),
        svv: dirFromFrame(f, -r * cv * cu, -r * cv * su, -r * sv)
      }
    }
    case "torus": {
      const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v), f = s.frame
      const R = s.major, r = s.minor, rho = R + r * cv
      return {
        p: fromFrame(f, rho * cu, rho * su, r * sv),
        su: dirFromFrame(f, -rho * su, rho * cu),
        sv: dirFromFrame(f, -r * sv * cu, -r * sv * su, r * cv),
        suu: dirFromFrame(f, -rho * cu, -rho * su),
        suv: dirFromFrame(f, r * sv * su, -r * sv * cu),
        svv: dirFromFrame(f, -r * cv * cu, -r * cv * su, -r * sv)
      }
    }
    case "nurbs": {
      const S = nurbsSurfaceDerivs(s.data, u, v, 2)
      return {
        p: toV3(S[0]![0]!),
        su: toV3(S[1]![0]!),
        sv: toV3(S[0]![1]!),
        suu: toV3(S[2]![0]!),
        suv: toV3(S[1]![1]!),
        svv: toV3(S[0]![2]!)
      }
    }
    case "revolution": {
      const [C, C1, C2] = curveDerivs(s.curve, v)
      const tr = rotation(s.axis, u, s.origin)
      const p = applyPoint(tr, C)
      const k = s.axis
      const rel = sub3(p, s.origin)
      const su = cross3(k, rel)
      const sv = applyDir(tr, C1)
      return { p, su, sv, suu: cross3(k, su), suv: cross3(k, sv), svv: applyDir(tr, C2) }
    }
    case "extrusion": {
      const [C, C1, C2] = curveDerivs(s.curve, u)
      return { p: madd3(C, s.dir, v), su: C1, sv: s.dir, suu: C2, suv: ZERO, svv: ZERO }
    }
  }
}

export const surfacePoint = (s: Surface, u: number, v: number): Vec3 => {
  switch (s.kind) {
    case "plane":
      return fromFrame(s.frame, u, v)
    case "cylinder":
      return fromFrame(s.frame, s.radius * Math.cos(u), s.radius * Math.sin(u), v)
    case "sphere": {
      const r = s.radius * Math.cos(v)
      return fromFrame(s.frame, r * Math.cos(u), r * Math.sin(u), s.radius * Math.sin(v))
    }
    default:
      return surfaceDerivs(s, u, v).p
  }
}

/**
 * Unit natural normal `S_u × S_v`. At a singular point (sphere/cone pole) the normal is taken a small step inside the
 * domain, which is its limit.
 */
export const surfaceNormal = (s: Surface, u: number, v: number): Vec3 => {
  const d = surfaceDerivs(s, u, v)
  const n = cross3(d.su, d.sv)
  const l = length3(n)
  if (l > 1e-12 * Math.max(1, length3(d.su) * length3(d.sv) + 1)) return scale3(n, 1 / l)
  const dom = surfaceBounds(s)
  const eps = 1e-6
  const vv = v + (v - (dom.v0 + dom.v1) / 2 > 0 ? -eps : eps)
  const uu = u + (u - (dom.u0 + dom.u1) / 2 > 0 ? -eps : eps)
  const d2 = surfaceDerivs(s, Number.isFinite(uu) ? uu : u, Number.isFinite(vv) ? vv : v)
  return normalize3(cross3(d2.su, d2.sv))
}

/** Periods of the parameters (undefined: not periodic). */
export const surfacePeriods = (s: Surface): { readonly u?: number; readonly v?: number } => {
  switch (s.kind) {
    case "cylinder":
    case "cone":
    case "sphere":
    case "revolution":
      return { u: TAU }
    case "torus":
      return { u: TAU, v: TAU }
    case "extrusion":
      return s.curve.kind === "circle" || s.curve.kind === "ellipse" ? { u: TAU } : {}
    default:
      return {}
  }
}

/** Natural parameter box (infinite where unbounded); periodic directions span one period from 0. */
export const surfaceBounds = (s: Surface): { readonly u0: number; readonly u1: number; readonly v0: number; readonly v1: number } => {
  switch (s.kind) {
    case "plane":
      return { u0: -Infinity, u1: Infinity, v0: -Infinity, v1: Infinity }
    case "cylinder":
    case "cone":
      return { u0: 0, u1: TAU, v0: -Infinity, v1: Infinity }
    case "sphere":
      return { u0: 0, u1: TAU, v0: -Math.PI / 2, v1: Math.PI / 2 }
    case "torus":
      return { u0: 0, u1: TAU, v0: 0, v1: TAU }
    case "nurbs": {
      const [u0, u1, v0, v1] = surfaceDomain(s.data)
      return { u0, u1, v0, v1 }
    }
    case "revolution": {
      const [v0, v1] = curveRange(s.curve)
      return { u0: 0, u1: TAU, v0, v1 }
    }
    case "extrusion": {
      const [u0, u1] = curveRange(s.curve)
      return { u0, u1, v0: -Infinity, v1: Infinity }
    }
  }
}

export interface SurfaceParam {
  readonly u: number
  readonly v: number
}

/**
 * Parameters of the point of the surface closest to `p` (orthogonal projection). Analytic surfaces invert in closed
 * form; NURBS, revolution and extrusion surfaces start from the best of a sample grid (or `hint`) and refine with
 * Newton's method on the two orthogonality conditions. Periodic parameters come back in `[0, 2π)`.
 */
export const surfaceProject = (s: Surface, p: Vec3, hint?: SurfaceParam): SurfaceParam => {
  switch (s.kind) {
    case "plane": {
      const l = toFrame(s.frame, p)
      return { u: l.x, v: l.y }
    }
    case "cylinder": {
      const l = toFrame(s.frame, p)
      return { u: wrap(Math.atan2(l.y, l.x), 0, TAU), v: l.z }
    }
    case "cone": {
      const l = toFrame(s.frame, p)
      const t = Math.tan(s.semiAngle)
      const rho = Math.hypot(l.x, l.y)
      return { u: wrap(Math.atan2(l.y, l.x), 0, TAU), v: ((rho - s.radius) * t + l.z) / (t * t + 1) }
    }
    case "sphere": {
      const l = toFrame(s.frame, p)
      return { u: wrap(Math.atan2(l.y, l.x), 0, TAU), v: Math.atan2(l.z, Math.hypot(l.x, l.y)) }
    }
    case "torus": {
      const l = toFrame(s.frame, p)
      const rho = Math.hypot(l.x, l.y) - s.major
      return { u: wrap(Math.atan2(l.y, l.x), 0, TAU), v: wrap(Math.atan2(l.z, rho), 0, TAU) }
    }
    case "revolution": {
      // Angle of p about the axis relative to the profile's half-plane, then project on the profile.
      const k = normalize3(s.axis)
      const [a, b] = curveRange(s.curve)
      const mid = curvePoint(s.curve, (a + b) / 2)
      const radial = (q: Vec3): Vec3 => { const r = sub3(q, s.origin); return sub3(r, scale3(k, dot3(r, k))) }
      const ref = radial(mid)
      const rp = radial(p)
      let u = 0
      if (length3(ref) > 1e-12 && length3(rp) > 1e-12) {
        const x = normalize3(ref), y = cross3(k, x)
        u = wrap(Math.atan2(dot3(rp, y), dot3(rp, x)), 0, TAU)
      }
      const back = applyPoint(rotation(k, -u, s.origin), p)
      const v = curveProject(s.curve, back, a, b)
      return newtonSurface(s, p, { u, v })
    }
    case "extrusion": {
      const d = s.dir
      const [a, b] = curveRange(s.curve)
      const c0 = curvePoint(s.curve, a)
      const flat = madd3(p, d, -dot3(sub3(p, c0), d))
      const u = curveProject(s.curve, flat, a, b)
      const v = dot3(sub3(p, curvePoint(s.curve, u)), d)
      return newtonSurface(s, p, { u, v })
    }
    case "nurbs": {
      let start = hint
      if (start !== undefined) {
        const refined = newtonSurface(s, p, start)
        const d = length3(sub3(surfacePoint(s, refined.u, refined.v), p))
        const scaleLen = nurbsSize(s.data)
        if (d < 1e-3 * scaleLen) return refined
      }
      start = gridStart(s, p)
      return newtonSurface(s, p, start)
    }
  }
}

const nurbsSize = (d: NurbsSurfaceData): number => {
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const row of d.points) for (const q of row) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c]!, q[c]!); hi[c] = Math.max(hi[c]!, q[c]!) }
  return Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) || 1
}

const gridCache = new WeakMap<object, { readonly params: ReadonlyArray<SurfaceParam>; readonly pts: ReadonlyArray<Vec3> }>()

const gridStart = (s: Surface & { readonly kind: "nurbs" }, p: Vec3): SurfaceParam => {
  let grid = gridCache.get(s.data)
  if (grid === undefined) {
    const { u0, u1, v0, v1 } = surfaceBounds(s)
    const nu = Math.min(64, Math.max(12, s.data.points.length * 4))
    const nv = Math.min(64, Math.max(12, s.data.points[0]!.length * 4))
    const params: SurfaceParam[] = []
    const pts: Vec3[] = []
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const u = u0 + ((u1 - u0) * i) / nu, v = v0 + ((v1 - v0) * j) / nv
        params.push({ u, v })
        pts.push(surfacePoint(s, u, v))
      }
    }
    grid = { params, pts }
    gridCache.set(s.data, grid)
  }
  let best = 0, bestD = Infinity
  for (let i = 0; i < grid.pts.length; i++) {
    const q = grid.pts[i]!
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  return grid.params[best]!
}

/** Newton iteration for the foot point of `p` on `s`, clamped to the natural domain (periodic directions wrap). */
export const newtonSurface = (s: Surface, p: Vec3, start: SurfaceParam): SurfaceParam => {
  const dom = surfaceBounds(s)
  const per = surfacePeriods(s)
  let { u, v } = start
  for (let it = 0; it < 40; it++) {
    const d = surfaceDerivs(s, u, v)
    const r = sub3(d.p, p)
    const f = dot3(r, d.su)
    const g = dot3(r, d.sv)
    const a = dot3(d.su, d.su) + dot3(r, d.suu)
    const b = dot3(d.su, d.sv) + dot3(r, d.suv)
    const dd = dot3(d.sv, d.sv) + dot3(r, d.svv)
    const step = solve2(a, b, b, dd, -f, -g)
    if (step === undefined) break
    let nu = u + step[0], nv = v + step[1]
    nu = per.u !== undefined ? nu : clamp(nu, dom.u0, dom.u1)
    nv = per.v !== undefined ? nv : clamp(nv, dom.v0, dom.v1)
    const moved = Math.abs(nu - u) + Math.abs(nv - v)
    u = nu
    v = nv
    if (moved < 1e-13 * (1 + Math.abs(u) + Math.abs(v))) break
  }
  if (per.u !== undefined) u = wrap(u, dom.u0, per.u)
  if (per.v !== undefined) v = wrap(v, dom.v0, per.v)
  return { u, v }
}

export const transformSurface = (s: Surface, tr: Transform): Surface => {
  const k = scaleOf(tr)
  switch (s.kind) {
    case "plane":
      return { kind: "plane", frame: transformFrame(tr, s.frame) }
    case "cylinder":
      return { kind: "cylinder", frame: transformFrame(tr, s.frame), radius: s.radius * k }
    case "cone":
      return { kind: "cone", frame: transformFrame(tr, s.frame), radius: s.radius * k, semiAngle: s.semiAngle }
    case "sphere":
      return { kind: "sphere", frame: transformFrame(tr, s.frame), radius: s.radius * k }
    case "torus":
      return { kind: "torus", frame: transformFrame(tr, s.frame), major: s.major * k, minor: s.minor * k }
    case "nurbs":
      return {
        kind: "nurbs",
        data: {
          ...s.data,
          points: s.data.points.map((row) => row.map((q) => { const v = applyPoint(tr, toV3(q)); return [v.x, v.y, v.z] }))
        }
      }
    case "revolution":
      return { kind: "revolution", curve: transformCurve(s.curve, tr), origin: applyPoint(tr, s.origin), axis: normalize3(applyDir(tr, s.axis)) }
    case "extrusion":
      return { kind: "extrusion", curve: transformCurve(s.curve, tr), dir: normalize3(applyDir(tr, s.dir)) }
  }
}

/** True when the surface is a plane (or a NURBS/extrusion that is flat is not detected here). */
export const isPlanar = (s: Surface): s is Surface & { readonly kind: "plane" } => s.kind === "plane"

/** Plane through `origin` with unit normal `normal` and optional in-plane reference `xDir`. */
export const planeSurface = (origin: Vec3, normal: Vec3, xDir?: Vec3): Surface => ({ kind: "plane", frame: frame(origin, normal, xDir) })

/** Distance from `p` to the surface (by projection). */
export const surfaceDistance = (s: Surface, p: Vec3, hint?: SurfaceParam): number => {
  const q = surfaceProject(s, p, hint)
  return length3(sub3(surfacePoint(s, q.u, q.v), p))
}


