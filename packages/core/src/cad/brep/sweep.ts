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

// ------------------------------------------------ corner treatments

/** Turn above which a junction is a corner (the mesh treatment's `CORNER_TURN`). */
const CORNER_TURN = (10 * Math.PI) / 180

const segmentTangent = (s: ProfileSegment, atEnd: boolean): Vec2 => {
  const f = atEnd ? 1 : 0
  const h = 1e-6
  const a = segmentPoint(s, atEnd ? f - h : f), b = segmentPoint(s, atEnd ? f : f + h)
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

/**
 * The loop with its sharp corners rounded (`fillet`, an exact tangent arc of radius `size`) or bevelled (`chamfer`, a line
 * with setback `size` along both edges), as `treatCorners` does to a polygon. Junctions that turn less than 10 degrees are
 * left alone. Corners between two lines are exact; a sharp corner touching an arc is a `RangeError` (no exact model yet),
 * as is a treatment that needs more of an edge than it has.
 */
export const treatLoopCorners = (loop: ProfileLoop, style: "fillet" | "chamfer", size: number): ProfileLoop => {
  if (!(size > 0)) throw new RangeError(`A corner ${style} needs a positive size (it is ${size})`)
  const n = loop.length
  // Junction j is between segment j (incoming) and segment j+1 (outgoing), at the end of segment j.
  const corners = loop.map((s, j) => {
    const next = loop[(j + 1) % n]!
    const tin = segmentTangent(s, true), tout = segmentTangent(next, false)
    const turn = Math.acos(Math.max(-1, Math.min(1, tin.x * tout.x + tin.y * tout.y)))
    if (turn < CORNER_TURN) return undefined
    if (s.kind !== "line" || next.kind !== "line") throw new RangeError(`A corner ${style} next to an arc or a spline has no exact model yet`)
    const phi = Math.PI - turn
    const setback = style === "chamfer" ? size : size / Math.tan(phi / 2)
    return { B: s.b, u1: { x: -tin.x, y: -tin.y }, u2: tout, phi, setback }
  })
  // Trimmed lines: each line gives `setback` to the corner at each of its ends.
  const out: ProfileSegment[] = []
  loop.forEach((s, j) => {
    const startCorner = corners[(j + n - 1) % n]
    const endCorner = corners[j]
    if (s.kind === "line") {
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
      const s0 = startCorner?.setback ?? 0, s1 = endCorner?.setback ?? 0
      if (s0 + s1 > len + 1e-9) throw new RangeError(`The corner ${style} of ${size} mm does not fit: an edge of ${len.toFixed(3)} mm has to give ${(s0 + s1).toFixed(3)} mm to its two corners`)
      const d = { x: (s.b.x - s.a.x) / len, y: (s.b.y - s.a.y) / len }
      const a = { x: s.a.x + d.x * s0, y: s.a.y + d.y * s0 }, b = { x: s.b.x - d.x * s1, y: s.b.y - d.y * s1 }
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) out.push({ kind: "line", a, b })
    } else out.push(s)
    if (endCorner === undefined) return
    const { B, u1, u2, phi, setback } = endCorner
    const t1 = { x: B.x + u1.x * setback, y: B.y + u1.y * setback }
    const t2 = { x: B.x + u2.x * setback, y: B.y + u2.y * setback }
    if (style === "chamfer") { out.push({ kind: "line", a: t1, b: t2 }); return }
    const bl = Math.hypot(u1.x + u2.x, u1.y + u2.y)
    const bis = { x: (u1.x + u2.x) / bl, y: (u1.y + u2.y) / bl }
    const dist = size / Math.sin(phi / 2)
    const centre = { x: B.x + bis.x * dist, y: B.y + bis.y * dist }
    const a1 = Math.atan2(t1.y - centre.y, t1.x - centre.x)
    let delta = Math.atan2(t2.y - centre.y, t2.x - centre.x) - a1
    while (delta > Math.PI) delta -= 2 * Math.PI
    while (delta < -Math.PI) delta += 2 * Math.PI
    out.push({ kind: "arc", center: centre, radius: size, start: a1, end: a1 + delta })
  })
  return out
}

// ------------------------------------------------ offset

type Carrier =
  | { readonly kind: "line"; readonly p: Vec2; readonly d: Vec2 }
  | { readonly kind: "circle"; readonly c: Vec2; readonly r: number }

const lineCircle = (p: Vec2, d: Vec2, c: Vec2, r: number): Vec2[] => {
  const fx = p.x - c.x, fy = p.y - c.y
  const b = fx * d.x + fy * d.y, cc = fx * fx + fy * fy - r * r
  const disc = b * b - cc
  if (disc < -1e-9 * r * r) return []
  const s = Math.sqrt(Math.max(0, disc))
  return [-b - s, -b + s].map((t) => ({ x: p.x + d.x * t, y: p.y + d.y * t }))
}

const intersectCarriers = (a: Carrier, b: Carrier): Vec2[] => {
  if (a.kind === "line" && b.kind === "line") {
    const den = a.d.x * b.d.y - a.d.y * b.d.x
    if (Math.abs(den) < 1e-14) return []
    const t = ((b.p.x - a.p.x) * b.d.y - (b.p.y - a.p.y) * b.d.x) / den
    return [{ x: a.p.x + a.d.x * t, y: a.p.y + a.d.y * t }]
  }
  if (a.kind === "line" && b.kind === "circle") return lineCircle(a.p, a.d, b.c, b.r)
  if (a.kind === "circle" && b.kind === "line") return lineCircle(b.p, b.d, a.c, a.r)
  const A = a as Extract<Carrier, { kind: "circle" }>, B = b as Extract<Carrier, { kind: "circle" }>
  const dx = B.c.x - A.c.x, dy = B.c.y - A.c.y, D = Math.hypot(dx, dy)
  if (D < 1e-14) return []
  const x = (D * D + A.r * A.r - B.r * B.r) / (2 * D)
  const h2 = A.r * A.r - x * x
  if (h2 < -1e-9 * A.r * A.r) return []
  const h = Math.sqrt(Math.max(0, h2))
  const ux = dx / D, uy = dy / D
  return [-1, 1].map((s) => ({ x: A.c.x + ux * x - uy * h * s, y: A.c.y + uy * x + ux * h * s }))
}

/** Unit tangent of a line or arc at its start or end, in the direction of travel (analytic, unlike `segmentTangent`). */
const exactTangent = (s: ProfileSegment, atEnd: boolean): Vec2 => {
  if (s.kind === "line") {
    const l = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
    return { x: (s.b.x - s.a.x) / l, y: (s.b.y - s.a.y) / l }
  }
  if (s.kind === "arc") {
    const t = atEnd ? s.end : s.start, k = Math.sign(s.end - s.start)
    return { x: -Math.sin(t) * k, y: Math.cos(t) * k }
  }
  return segmentTangent(s, atEnd)
}

/** True when two closed polylines' edges cross (shared end points of neighbouring edges excepted). */
const polylineCrosses = (pts: ReadonlyArray<Vec2>): boolean => {
  const n = pts.length
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  for (let i = 0; i < n; i++) {
    const a = pts[i]!, b = pts[(i + 1) % n]!
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const c = pts[j]!, d = pts[(j + 1) % n]!
      const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b)
      if (((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12))) return true
    }
  }
  return false
}

/**
 * The loop with its boundary moved `distance` into its interior (negative: outwards), exactly: lines move parallel, arcs keep
 * their centre and change their radius, and neighbouring pieces meet where their moved curves intersect (a mitre, as
 * `moveRing` does to a polygon; tangent junctions stay tangent). A move that collapses a piece, turns an arc inside out or
 * makes the loop cross itself is a `RangeError`, as is a spline piece (no exact offset curve).
 */
export const offsetLoop = (loop: ProfileLoop, distance: number): ProfileLoop => {
  if (distance === 0) return loop
  const area = loopArea(loop)
  // Offsets are taken to the left of the travel: the interior of a counter-clockwise loop.
  const d = area > 0 ? distance : -distance
  const n = loop.length
  const carriers: Carrier[] = loop.map((s) => {
    if (s.kind === "line") {
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
      const u = { x: (s.b.x - s.a.x) / len, y: (s.b.y - s.a.y) / len }
      return { kind: "line", p: { x: s.a.x - u.y * d, y: s.a.y + u.x * d }, d: u }
    }
    if (s.kind === "arc") {
      // Counter-clockwise travel has the centre on its left: moving left shrinks the radius.
      const r = s.radius - Math.sign(s.end - s.start) * d
      if (!(r > MODEL_TOL)) throw new RangeError(`A ${Math.abs(distance)} mm offset collapses an arc of radius ${s.radius} mm`)
      return { kind: "circle", c: s.center, r }
    }
    throw new RangeError("A spline in the profile has no exact offset")
  })
  // Joint j: where piece j (incoming) meets piece j + 1 (outgoing).
  const joints: Vec2[] = loop.map((s, j) => {
    const next = loop[(j + 1) % n]!
    const P = segmentEnd(s)
    const tin = exactTangent(s, true), tout = exactTangent(next, false)
    if (Math.abs(tin.x * tout.y - tin.y * tout.x) < 1e-9 && tin.x * tout.x + tin.y * tout.y > 0) return { x: P.x - tin.y * d, y: P.y + tin.x * d }
    const hits = intersectCarriers(carriers[j]!, carriers[(j + 1) % n]!)
    if (hits.length === 0) throw new RangeError(`A ${Math.abs(distance)} mm offset leaves two pieces of the profile apart`)
    return hits.reduce((best, q) => (Math.hypot(q.x - P.x, q.y - P.y) < Math.hypot(best.x - P.x, best.y - P.y) ? q : best))
  })
  const out: ProfileSegment[] = loop.map((s, j) => {
    const a = joints[(j + n - 1) % n]!, b = joints[j]!
    if (s.kind === "line") {
      if ((b.x - a.x) * (s.b.x - s.a.x) + (b.y - a.y) * (s.b.y - s.a.y) <= 0) throw new RangeError(`A ${Math.abs(distance)} mm offset collapses an edge of the profile`)
      return { kind: "line", a, b }
    }
    const arc = s as Extract<ProfileSegment, { kind: "arc" }>
    const sweep = arc.end - arc.start
    const start = Math.atan2(a.y - arc.center.y, a.x - arc.center.x)
    let raw = Math.atan2(b.y - arc.center.y, b.x - arc.center.x) - start
    // A full circle meets itself: its sweep stays a full turn.
    if (n === 1) raw = sweep
    else raw += TAU * Math.round((sweep - raw) / TAU)
    if (raw * sweep <= 0) throw new RangeError(`A ${Math.abs(distance)} mm offset turns an arc of the profile inside out`)
    return { kind: "arc", center: arc.center, radius: (carriers[j] as Extract<Carrier, { kind: "circle" }>).r, start, end: start + raw }
  })
  const moved = loopArea(out)
  if (moved * area <= 0 || (distance > 0 ? Math.abs(moved) >= Math.abs(area) : Math.abs(moved) <= Math.abs(area)))
    throw new RangeError(`A ${Math.abs(distance)} mm offset makes the profile vanish or turn inside out`)
  const samples = out.flatMap((s) => (s.kind === "line" ? [s.a] : Array.from({ length: 16 }, (_, k) => segmentPoint(s, k / 16))))
  if (polylineCrosses(samples)) throw new RangeError(`A ${Math.abs(distance)} mm offset makes the profile cross itself`)
  return out
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

