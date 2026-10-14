/**
 * Exact loft through planar sections of lines and circular arcs, with the mesh rebuild's correspondence: each section runs
 * counter-clockwise about the loft direction (first centre to last), from its own start point, rotated to the start that
 * best matches the section before (over the same evenly spaced samples), and points correspond by fraction of arc length.
 *
 * Every section is cut at the union of all sections' corners (and its arcs at quarter turns at most), so each column of
 * the loft pairs one line or arc of every section. A column is one rational Bezier face: the sections' rational
 * quadratic arcs and lines are brought over one common denominator (the product of the distinct arc weight polynomials,
 * which is what lets an arc span to a line or to an arc of another angle exactly), then joined linearly (straight spans)
 * or by the uniform Catmull-Rom spline of the mesh's smooth loft (one cubic span per pair of sections). Spans join along
 * straight rulings (or the spline's cubic), the ends are the planar sections.
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { circleCurve, lineCurve, nurbsCurve, surfaceNormal, surfaceProject, type Curve3, type Surface } from "./geom.ts"
import { frame, type Frame, type Vec3 } from "./math.ts"
import type { ProfileLoop } from "./sweep.ts"
import { BrepBuilder, type Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

/** A line, or an arc about `axis` (right hand) from `center + radius x` through `angle` radians. */
export type LoftSegment =
  | { readonly kind: "line"; readonly a: Vec3; readonly b: Vec3 }
  | { readonly kind: "arc"; readonly center: Vec3; readonly axis: Vec3; readonly radius: number; readonly x: Vec3; readonly angle: number }

/** A closed 2D profile loop placed on a frame (x, y in its plane) as a loft section. */
export const loftSection = (loop: ProfileLoop, f: Frame): LoftSegment[] => {
  const at = (p: { readonly x: number; readonly y: number }): Vec3 => add3(f.origin, add3(scale3(f.x, p.x), scale3(f.y, p.y)))
  return loop.map((s): LoftSegment => {
    if (s.kind === "line") return { kind: "line", a: at(s.a), b: at(s.b) }
    if (s.kind === "arc") {
      const sweep = s.end - s.start
      return { kind: "arc", center: at(s.center), axis: sweep > 0 ? f.z : scale3(f.z, -1), radius: s.radius, x: add3(scale3(f.x, Math.cos(s.start)), scale3(f.y, Math.sin(s.start))), angle: Math.abs(sweep) }
    }
    throw new RangeError("a loft section bounded by a spline has no exact model yet")
  })
}

const segLength = (s: LoftSegment): number => (s.kind === "line" ? length3(sub3(s.b, s.a)) : s.radius * s.angle)
const arcDir = (s: LoftSegment & { kind: "arc" }, t: number): Vec3 => add3(scale3(s.x, Math.cos(t)), scale3(cross3(s.axis, s.x), Math.sin(t)))
const segPoint = (s: LoftSegment, f: number): Vec3 => {
  if (s.kind === "line") return f <= 0 ? s.a : f >= 1 ? s.b : add3(s.a, scale3(sub3(s.b, s.a), f))
  return add3(s.center, scale3(arcDir(s, f * s.angle), s.radius))
}
const segPiece = (s: LoftSegment, f0: number, f1: number): LoftSegment =>
  s.kind === "line" ? { kind: "line", a: segPoint(s, f0), b: segPoint(s, f1) } : { ...s, x: arcDir(s, f0 * s.angle), angle: (f1 - f0) * s.angle }
const segReverse = (s: LoftSegment): LoftSegment =>
  s.kind === "line" ? { kind: "line", a: s.b, b: s.a } : { ...s, axis: scale3(s.axis, -1), x: arcDir(s, s.angle) }
/** Fraction (0..1) of the point of `s` nearest `p`. */
const segProject = (s: LoftSegment, p: Vec3): number => {
  if (s.kind === "line") { const d = sub3(s.b, s.a); return Math.max(0, Math.min(1, dot3(sub3(p, s.a), d) / dot3(d, d))) }
  const q = sub3(p, s.center), y = cross3(s.axis, s.x)
  let t = Math.atan2(dot3(q, y), dot3(q, s.x))
  if (t < 0) t += 2 * Math.PI
  // Past the end: the nearer of the two ends.
  if (t > s.angle) t = t - s.angle < 2 * Math.PI - t ? s.angle : 0
  return t / s.angle
}

interface Ring {
  readonly segs: ReadonlyArray<LoftSegment>
  /** Fraction of the ring's length at the start of each segment, then 1. */
  readonly at: ReadonlyArray<number>
}
const ringOf = (segs: ReadonlyArray<LoftSegment>): Ring => {
  const lengths = segs.map(segLength)
  const total = lengths.reduce((a, b) => a + b, 0)
  if (!(total > 1e-9)) throw new RangeError("A loft section has no length")
  const at = [0]
  for (const l of lengths) at.push(at[at.length - 1]! + l / total)
  at[at.length - 1] = 1
  return { segs, at }
}
const ringPoint = (r: Ring, g: number): Vec3 => {
  let i = 0
  while (i < r.segs.length - 1 && g >= r.at[i + 1]!) i++
  return segPoint(r.segs[i]!, (g - r.at[i]!) / (r.at[i + 1]! - r.at[i]!))
}
/** The part of the ring between fractions g0 < g1 that lie within one segment. */
const ringPiece = (r: Ring, g0: number, g1: number): LoftSegment => {
  const mid = (g0 + g1) / 2
  let i = 0
  while (i < r.segs.length - 1 && mid >= r.at[i + 1]!) i++
  const span = r.at[i + 1]! - r.at[i]!
  const snap = (f: number): number => (f < 1e-9 ? 0 : f > 1 - 1e-9 ? 1 : f)
  return segPiece(r.segs[i]!, snap((g0 - r.at[i]!) / span), snap((g1 - r.at[i]!) / span))
}
/** The same closed ring started at fraction `g`. */
const startAt = (segs: ReadonlyArray<LoftSegment>, g: number): LoftSegment[] => {
  const r = ringOf(segs)
  let i = 0
  while (i < segs.length - 1 && g >= r.at[i + 1]!) i++
  const f = (g - r.at[i]!) / (r.at[i + 1]! - r.at[i]!)
  if (f < 1e-9) return [...segs.slice(i), ...segs.slice(0, i)]
  if (f > 1 - 1e-9) return [...segs.slice(i + 1), ...segs.slice(0, i + 1)]
  const s = segs[i]!
  return [segPiece(s, f, 1), ...segs.slice(i + 1), ...segs.slice(0, i), segPiece(s, 0, f)]
}
const samples = (segs: ReadonlyArray<LoftSegment>, n: number): Vec3[] => {
  const r = ringOf(segs)
  return Array.from({ length: n }, (_, k) => ringPoint(r, k / n))
}
const newell = (pts: ReadonlyArray<Vec3>): Vec3 => {
  let x = 0, y = 0, z = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!
    x += (p.y - q.y) * (p.z + q.z); y += (p.z - q.z) * (p.x + q.x); z += (p.x - q.x) * (p.y + q.y)
  }
  return { x, y, z }
}
const mean = (pts: ReadonlyArray<Vec3>): Vec3 => scale3(pts.reduce(add3, { x: 0, y: 0, z: 0 }), 1 / pts.length)

// ---------------------------------------------------------------- rational Bezier rows

/** Homogeneous control points (w x, w y, w z, w) of a Bezier curve. */
type Hom = ReadonlyArray<readonly [number, number, number, number]>

const binom = (n: number, k: number): number => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r }

const rowOf = (s: LoftSegment): { readonly hom: Hom; readonly weight: number } => {
  if (s.kind === "line") return { hom: [[s.a.x, s.a.y, s.a.z, 1], [s.b.x, s.b.y, s.b.z, 1]], weight: 1 }
  const half = s.angle / 2, c = Math.cos(half)
  const p0 = segPoint(s, 0), p2 = segPoint(s, 1)
  const p1 = add3(s.center, scale3(arcDir(s, half), s.radius / c))
  return { hom: [[p0.x, p0.y, p0.z, 1], [p1.x * c, p1.y * c, p1.z * c, c], [p2.x, p2.y, p2.z, 1]], weight: c }
}
/** The product of a homogeneous Bezier curve and the scalar quadratic Bezier (1, c, 1). */
const timesWeight = (h: Hom, c: number): Hom => {
  const p = h.length - 1, s = [1, c, 1]
  return Array.from({ length: p + 3 }, (_, k) => {
    const out: [number, number, number, number] = [0, 0, 0, 0]
    for (let i = Math.max(0, k - 2); i <= Math.min(p, k); i++) {
      const f = (binom(p, i) * binom(2, k - i)) / binom(p + 2, k) * s[k - i]!
      for (let d = 0; d < 4; d++) out[d] = out[d]! + f * h[i]![d]!
    }
    return out
  })
}
const elevate = (h: Hom): Hom => {
  const p = h.length - 1
  return Array.from({ length: p + 2 }, (_, k) => {
    const a = k / (p + 1)
    const lo = h[k - 1], hi = h[k]
    return [0, 1, 2, 3].map((d) => (lo === undefined ? 0 : a * lo[d]!) + (hi === undefined ? 0 : (1 - a) * hi[d]!)) as unknown as readonly [number, number, number, number]
  })
}

/**
 * The rows of one column over a common denominator: the Euclidean control points of each row and the weights they share.
 */
const commonRows = (pieces: ReadonlyArray<LoftSegment>): { readonly points: Vec3[][]; readonly weights: number[] } => {
  const rows = pieces.map(rowOf)
  const distinct: number[] = []
  for (const r of rows) if (r.weight < 1 - 1e-15 && !distinct.some((c) => Math.abs(c - r.weight) < 1e-13)) distinct.push(r.weight)
  let homs = rows.map((r) => {
    let h = r.hom
    for (const c of distinct) if (Math.abs(c - r.weight) >= 1e-13) h = timesWeight(h, c)
    return h
  })
  const degree = Math.max(...homs.map((h) => h.length - 1))
  homs = homs.map((h) => { while (h.length - 1 < degree) h = elevate(h); return h })
  const weights = homs[0]!.map((q) => q[3])
  for (const h of homs) h.forEach((q, i) => { if (Math.abs(q[3] - weights[i]!) > 1e-12) throw new Error("loft rows do not share their weights") })
  return { points: homs.map((h) => h.map((q) => ({ x: q[0] / q[3], y: q[1] / q[3], z: q[2] / q[3] }))), weights }
}

/**
 * The analytic surface of a straight column when it is one: two lines in one plane span a plane, two arcs of one angle
 * about one axis line, started alike, span a cone (a cylinder for equal radii). Else undefined (the column stays a NURBS).
 */
const analyticColumn = (a: LoftSegment, b: LoftSegment): Surface | undefined => {
  const scale = Math.max(segLength(a), segLength(b), length3(sub3(segPoint(b, 0), segPoint(a, 0))))
  const tol = 1e-9 * Math.max(1, scale)
  if (a.kind === "line" && b.kind === "line") {
    const n = cross3(sub3(a.b, a.a), sub3(b.a, a.a))
    if (length3(n) < 1e-9 * scale * scale) return undefined
    const z = normalize3(n)
    if (Math.abs(dot3(sub3(b.b, a.a), z)) > tol) return undefined
    return { kind: "plane", frame: frame(a.a, z, sub3(a.b, a.a)) }
  }
  if (a.kind === "arc" && b.kind === "arc") {
    if (Math.abs(a.angle - b.angle) > 1e-12 || dot3(a.axis, b.axis) < 1 - 1e-12 || dot3(a.x, b.x) < 1 - 1e-12) return undefined
    const d = sub3(b.center, a.center), h = dot3(d, a.axis)
    if (length3(sub3(d, scale3(a.axis, h))) > tol || Math.abs(h) < 1e-9 * scale) return undefined
    const z = scale3(a.axis, Math.sign(h)), f = frame(a.center, z, a.x)
    if (Math.abs(b.radius - a.radius) < tol) return { kind: "cylinder", frame: f, radius: a.radius }
    return { kind: "cone", frame: f, radius: a.radius, semiAngle: Math.atan((b.radius - a.radius) / Math.abs(h)) }
  }
  return undefined
}

/** Whether a surface's own normal at the column's middle points against the loft's outward normal (a ruled column's). */
const facesInward = (s: Surface, a: LoftSegment, b: LoftSegment): boolean => {
  const p = segPoint(a, 0.5)
  const tangent = sub3(segPoint(a, 0.5 + 1e-4), segPoint(a, 0.5 - 1e-4))
  const outward = cross3(tangent, sub3(segPoint(b, 0.5), p))
  const q = surfaceProject(s, p)
  return dot3(surfaceNormal(s, q.u, q.v), outward) < 0
}

export interface LoftOptions {
  /** A Catmull-Rom spline through the sections rather than straight spans (as the mesh rebuild's smooth loft). */
  readonly smooth?: boolean
  /** The samples the start of each section is matched over (the mesh rebuild's 96). */
  readonly samples?: number
  /** The point each section starts from (the mesh rebuild's first ring point); by default its first segment's start. */
  readonly starts?: ReadonlyArray<Vec3 | undefined>
  readonly name?: string
}

/** The exact solid lofted through two or more closed planar sections. Throws a `RangeError` for what it cannot build. */
export const loftBrep = (sections: ReadonlyArray<ReadonlyArray<LoftSegment>>, o: LoftOptions = {}): Brep => {
  if (sections.length < 2) throw new RangeError("A loft needs at least two sections")
  const count = Math.max(8, Math.min(512, o.samples ?? 96))
  // Each section from its start point.
  let rings = sections.map((segs, i) => {
    const p = o.starts?.[i]
    if (p === undefined) return [...segs]
    const r = ringOf(segs)
    let best = 0, bestD = Infinity
    segs.forEach((s, k) => {
      const f = segProject(s, p), d = length3(sub3(segPoint(s, f), p))
      if (d < bestD) { bestD = d; best = r.at[k]! + f * (r.at[k + 1]! - r.at[k]!) }
    })
    return startAt(segs, best)
  })
  const centres = rings.map((r) => mean(samples(r, count)))
  let direction = sub3(centres[centres.length - 1]!, centres[0]!)
  if (length3(direction) < 1e-9) direction = newell(samples(rings[0]!, count))
  direction = normalize3(direction)
  // Counter-clockwise about the direction, keeping the start.
  rings = rings.map((r) => (dot3(newell(samples(r, count)), direction) < 0 ? [...r].reverse().map(segReverse) : r))
  // Each start rotated to match the section before.
  for (let k = 1; k < rings.length; k++) {
    const prev = samples(rings[k - 1]!, count), cur = samples(rings[k]!, count)
    let best = 0, bestCost = Infinity
    for (let shift = 0; shift < count; shift++) {
      let cost = 0
      for (let i = 0; i < count; i++) { const d = sub3(cur[(i + shift) % count]!, prev[i]!); cost += dot3(d, d) }
      if (cost < bestCost) { bestCost = cost; best = shift }
    }
    if (best !== 0) rings[k] = startAt(rings[k]!, best / count)
  }
  // The columns: every section's corners, and its arcs cut to quarter turns at most.
  const ringData = rings.map(ringOf)
  const cuts: number[] = [0]
  for (const r of ringData) r.segs.forEach((s, i) => {
    cuts.push(r.at[i]!)
    if (s.kind === "arc") { const m = Math.ceil(s.angle / (Math.PI / 2) - 1e-9); for (let j = 1; j < m; j++) cuts.push(r.at[i]! + ((r.at[i + 1]! - r.at[i]!) * j) / m) }
  })
  cuts.sort((a, b) => a - b)
  const columns = cuts.filter((c, i) => c < 1 - 1e-9 && (i === 0 || c - cuts[i - 1]! > 1e-9))
  const C = columns.length
  const pieces = ringData.map((r) => columns.map((g, c) => ringPiece(r, g, c + 1 < C ? columns[c + 1]! : 1)))

  const B = new BrepBuilder()
  const S = rings.length
  const V = pieces.map((row) => row.map((p) => B.newVertex(segPoint(p, 0))))
  const curveOf = (p: LoftSegment): { readonly curve: Curve3; readonly t1: number } =>
    p.kind === "line" ? { curve: lineCurve(p.a, sub3(p.b, p.a)), t1: segLength(p) } : { curve: circleCurve(frame(p.center, p.axis, p.x), p.radius), t1: p.angle }
  const E = pieces.map((row, k) => row.map((p, c) => { const { curve, t1 } = curveOf(p); return B.edge(curve, 0, t1, V[k]![c]!, V[k]![(c + 1) % C]!) }))
  const smooth = o.smooth === true && S > 2
  // Rows of span k: the two sections, or with the spline their neighbours (clamped at the ends) as well.
  const spanRows = (k: number): number[] => (smooth ? [Math.max(0, k - 1), k, k + 1, Math.min(S - 1, k + 2)] : [k, k + 1])
  const spline = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3[] => [b, add3(b, scale3(sub3(c, a), 1 / 6)), sub3(c, scale3(sub3(d, b), 1 / 6)), c]
  const R: number[][] = []
  for (let k = 0; k < S - 1; k++) {
    R.push(Array.from({ length: C }, (_, c) => {
      const a = V[k]![c]!, b = V[k + 1]![c]!
      if (!smooth) return B.edge(lineCurve(B.vertices[a]!.point, sub3(B.vertices[b]!.point, B.vertices[a]!.point)), 0, length3(sub3(B.vertices[b]!.point, B.vertices[a]!.point)), a, b)
      const pts = spline(...(spanRows(k).map((r) => segPoint(pieces[r]![c]!, 0)) as [Vec3, Vec3, Vec3, Vec3]))
      return B.edge(nurbsCurve({ degree: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], points: pts.map((p) => [p.x, p.y, p.z]) }), 0, 1, a, b)
    }))
  }
  const name = o.name ?? "loft"
  for (let k = 0; k < S - 1; k++) {
    for (let c = 0; c < C; c++) {
      const loop: ReadonlyArray<readonly [number, boolean]> = [[E[k]![c]!, false], [R[k]![(c + 1) % C]!, false], [E[k + 1]![c]!, true], [R[k]![c]!, true]]
      const simple = smooth ? undefined : analyticColumn(pieces[k]![c]!, pieces[k + 1]![c]!)
      if (simple !== undefined) { B.face(simple, facesInward(simple, pieces[k]![c]!, pieces[k + 1]![c]!), [loop], `${name}.side`); continue }
      const { points, weights } = commonRows(spanRows(k).map((r) => pieces[r]![c]!))
      const ctrl: Vec3[][] = smooth
        ? points[0]!.map((_, i) => spline(points[0]![i]!, points[1]![i]!, points[2]![i]!, points[3]![i]!))
        : points[0]!.map((_, i) => [points[0]![i]!, points[1]![i]!])
      const degreeU = weights.length - 1, degreeV = smooth ? 3 : 1
      const rational = weights.some((w) => Math.abs(w - 1) > 1e-15)
      const surface: Surface = {
        kind: "nurbs",
        data: {
          degreeU, degreeV,
          knotsU: [...Array(degreeU + 1).fill(0), ...Array(degreeU + 1).fill(1)],
          knotsV: [...Array(degreeV + 1).fill(0), ...Array(degreeV + 1).fill(1)],
          points: ctrl.map((col) => col.map((p) => [p.x, p.y, p.z])),
          ...(rational ? { weights: ctrl.map((col, i) => col.map(() => weights[i]!)) } : {})
        }
      }
      B.face(surface, false, [loop], `${name}.side`)
    }
  }
  // The end sections, facing out.
  const cap = (k: number, out: boolean): void => {
    const n = normalize3(newell(samples(rings[k]!, count)))
    const loop = out ? E[k]!.map((e) => [e, false] as const) : [...E[k]!].reverse().map((e) => [e, true] as const)
    B.face({ kind: "plane", frame: frame(segPoint(pieces[k]![0]!, 0), n) }, !out, [loop], `${name}.${out ? "end" : "start"}`)
  }
  cap(0, false)
  cap(S - 1, true)
  const brep = B.build(true)
  const rep = validateBrep(brep)
  if (rep.issues.length > 0) throw new RangeError(`the lofted solid is not valid: ${rep.issues[0]!.message}`)
  return brep
}
