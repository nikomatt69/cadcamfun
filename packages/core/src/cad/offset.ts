/**
 * Robust polygon/polyline offsetting for cutter compensation.
 *
 * Algorithm ("raw offset, split, trim by distance"):
 *  1. Every segment is shifted by `distance`; corners are joined with a mitre
 *     (up to `mitreLimit`), a round join (tangent-chord polygon, so it never
 *     comes closer than `|distance|`) or a bevel. Corners on the inside of the
 *     bend are joined by a plain chord and will be trimmed away.
 *  2. The raw curve is split at every self- and cross-intersection.
 *  3. A piece survives only if its midpoint is at least `|distance|` away from
 *     every original segment (and on the correct side of the region).
 *  4. Surviving pieces are chained into loops/paths.
 * This handles collapsing features, concave corners, several resulting loops and
 * holes/islands (see `offsetRings`) without a general polygon-clipping library.
 *
 * Sign convention: a **positive** distance offsets to the **right** of the
 * direction of travel, so a counter-clockwise ring grows and a clockwise ring
 * shrinks. Callers that think in "inside/outside" terms normalise the winding
 * first (`winding` in `shapes.ts`) and then use the sign they mean.
 */
import { add, cross2, distance, dot, length, scale, sub, type Vec2 } from "./vec.ts"
import { signedArea } from "./shapes.ts"

export interface OffsetOptions {
  /** Mitre length limit as a multiple of `|distance|`; beyond it `joinFallback` applies. Default 2.5. */
  readonly mitreLimit?: number
  /** Use round joins at every outer corner instead of mitres. */
  readonly arcJoins?: boolean
  /** Join used when the mitre limit is exceeded. Default `"bevel"`; `"round"` never gets closer than `|distance|`. */
  readonly joinFallback?: "bevel" | "round"
  /** Chord tolerance of round joins in mm (they stay outside the true arc by at most this). Default `max(|d|/500, 1e-4)`. */
  readonly arcTolerance?: number
  /**
   * Which side of the original rings (even-odd) the result must lie on. Derived
   * from the sign of `distance` and the ring winding when omitted (single ring).
   */
  readonly keep?: "inside" | "outside"
}

export interface OffsetPath {
  readonly points: ReadonlyArray<Vec2>
  readonly closed: boolean
}

const DEFAULT_MITRE_LIMIT = 2.5

type PieceSource =
  | { readonly kind: "segment" }
  | { readonly kind: "inner" }
  | { readonly kind: "round" }
  | { readonly kind: "bevel"; readonly ring: number; readonly vertex: number }

interface RawSegment {
  readonly a: Vec2
  readonly b: Vec2
  readonly source: PieceSource
}

interface OriginalSegment {
  readonly ring: number
  readonly index: number
  readonly a: Vec2
  readonly b: Vec2
}

const norm = (v: Vec2): Vec2 => {
  const l = length(v)
  return l < 1e-18 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l }
}

/** The side a positive offset goes to: right of the direction of travel. */
const rightNormal = (d: Vec2): Vec2 => ({ x: d.y, y: -d.x })

const dedupeRing = (points: ReadonlyArray<Vec2>, closed: boolean, eps = 1e-9): Vec2[] => {
  const out: Vec2[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last === undefined || distance(last, p) > eps) out.push(p)
  }
  if (closed && out.length > 1 && distance(out[0]!, out[out.length - 1]!) <= eps) out.pop()
  return out
}

/** Even-odd containment over a set of rings. */
const insideEvenOdd = (p: Vec2, rings: ReadonlyArray<ReadonlyArray<Vec2>>): boolean => {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!
      const b = ring[j]!
      if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside
    }
  }
  return inside
}

const pointSegmentDistance = (p: Vec2, a: Vec2, b: Vec2): number => {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}

/** Raw offset of one ring/path: shifted segments with joins. Returns the directed raw segments. */
const rawOffset = (
  ringIndex: number,
  points: ReadonlyArray<Vec2>,
  closed: boolean,
  d: number,
  options: OffsetOptions
): RawSegment[] => {
  const n = points.length
  const segCount = closed ? n : n - 1
  const dirs: Vec2[] = []
  for (let i = 0; i < segCount; i++) dirs.push(norm(sub(points[(i + 1) % n]!, points[i]!)))
  const shiftA = (i: number): Vec2 => add(points[i]!, scale(rightNormal(dirs[i]!), d))
  const shiftB = (i: number): Vec2 => add(points[(i + 1) % n]!, scale(rightNormal(dirs[i]!), d))
  const limit = options.mitreLimit ?? DEFAULT_MITRE_LIMIT
  const absD = Math.abs(d)
  const arcTol = options.arcTolerance ?? Math.max(absD / 500, 1e-4)
  const fallback = options.joinFallback ?? "bevel"

  const out: RawSegment[] = []
  const seg = (a: Vec2, b: Vec2, source: PieceSource): void => {
    if (distance(a, b) > 1e-12) out.push({ a, b, source })
  }
  const segmentSource: PieceSource = { kind: "segment" }

  // Join points between segment i-1 (incoming) and segment i (outgoing) at vertex v.
  const joinAt = (v: number, inIdx: number, outIdx: number): { readonly pts: Vec2[]; readonly source: PieceSource } => {
    const p = points[v]!
    const inDir = dirs[inIdx]!
    const outDir = dirs[outIdx]!
    const off1 = shiftB(inIdx)
    const off2 = shiftA(outIdx)
    const cross = cross2(inDir, outDir)
    const dotp = dot(inDir, outDir)
    if (Math.abs(cross) < 1e-12 && dotp > 0) return { pts: [off1], source: segmentSource }
    const outer = Math.abs(cross) < 1e-12 ? true : cross * d > 0
    if (!outer) return { pts: [off1, off2], source: { kind: "inner" } }
    const ratio = Math.abs(cross) < 1e-12 ? Infinity : 1 / Math.sqrt((1 + dotp) / 2)
    if (options.arcJoins !== true && ratio <= limit) {
      const p1 = add(p, scale(rightNormal(inDir), d))
      const denom = cross2(inDir, outDir)
      const t = cross2(sub(add(p, scale(rightNormal(outDir), d)), p1), outDir) / denom
      return { pts: [add(p1, scale(inDir, t))], source: segmentSource }
    }
    if (options.arcJoins === true || fallback === "round") {
      // Tangent-chord (circumscribed) polygon around the vertex: every vertex lies
      // at |d| / cos(step / 2) >= |d| from the corner, so the path never gouges.
      const a1 = Math.atan2(off1.y - p.y, off1.x - p.x)
      // Sweep follows the turn direction: left turn is counter-clockwise.
      let sweep = Math.atan2(cross, dotp)
      if (Math.abs(cross) < 1e-12) sweep = d > 0 ? Math.PI : -Math.PI
      const maxStep = 2 * Math.acos(absD / (absD + arcTol))
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) / maxStep))
      const step = sweep / steps
      const pts: Vec2[] = [off1]
      const vr = absD / Math.cos(step / 2)
      for (let k = 0; k < steps; k++) {
        const a = a1 + step * (k + 0.5)
        pts.push({ x: p.x + Math.cos(a) * vr, y: p.y + Math.sin(a) * vr })
      }
      pts.push(off2)
      return { pts, source: { kind: "round" } }
    }
    return { pts: [off1, off2], source: { kind: "bevel", ring: ringIndex, vertex: v } }
  }

  if (closed) {
    // Chain: join(v0) -> join(v1) ... each join's last point leads into the next segment.
    const joins: Array<{ readonly pts: Vec2[]; readonly source: PieceSource }> = []
    for (let v = 0; v < n; v++) joins.push(joinAt(v, (v - 1 + n) % n, v))
    // Raw loop vertices: for each vertex v, the join points; the segment between
    // join v and join v+1 is the shifted segment v.
    for (let v = 0; v < n; v++) {
      const j = joins[v]!
      const next = joins[(v + 1) % n]!
      for (let k = 0; k + 1 < j.pts.length; k++) seg(j.pts[k]!, j.pts[k + 1]!, j.source)
      seg(j.pts[j.pts.length - 1]!, next.pts[0]!, segmentSource)
    }
  } else {
    let prev = shiftA(0)
    for (let v = 1; v < n - 1; v++) {
      const j = joinAt(v, v - 1, v)
      seg(prev, j.pts[0]!, segmentSource)
      for (let k = 0; k + 1 < j.pts.length; k++) seg(j.pts[k]!, j.pts[k + 1]!, j.source)
      prev = j.pts[j.pts.length - 1]!
    }
    seg(prev, shiftB(n - 2), segmentSource)
  }
  return out
}

// ---------------------------------------------------------------- split / trim / chain

interface Piece {
  readonly a: Vec2
  readonly b: Vec2
  readonly source: PieceSource
}

const GRID = 1e-7
const keyOf = (p: Vec2): string => `${Math.round(p.x / GRID)}:${Math.round(p.y / GRID)}`

/** Splits every raw segment at its intersections with every other raw segment. */
const splitAtIntersections = (segments: ReadonlyArray<RawSegment>): Piece[] => {
  const n = segments.length
  const cuts: Array<Array<{ readonly t: number; readonly p: Vec2 }>> = segments.map(() => [])
  const minX = segments.map((s) => Math.min(s.a.x, s.b.x))
  const maxX = segments.map((s) => Math.max(s.a.x, s.b.x))
  const minY = segments.map((s) => Math.min(s.a.y, s.b.y))
  const maxY = segments.map((s) => Math.max(s.a.y, s.b.y))
  const pad = 1e-9
  for (let i = 0; i < n; i++) {
    const si = segments[i]!
    const r = sub(si.b, si.a)
    for (let j = i + 1; j < n; j++) {
      if (maxX[j]! < minX[i]! - pad || minX[j]! > maxX[i]! + pad) continue
      if (maxY[j]! < minY[i]! - pad || minY[j]! > maxY[i]! + pad) continue
      const sj = segments[j]!
      const s = sub(sj.b, sj.a)
      const denom = cross2(r, s)
      if (Math.abs(denom) < 1e-14) continue
      const qp = sub(sj.a, si.a)
      const t = cross2(qp, s) / denom
      const u = cross2(qp, r) / denom
      const eps = 1e-10
      if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) continue
      const p = add(si.a, scale(r, t))
      // Endpoint touches are already shared nodes; only interior cuts matter.
      if (t > eps && t < 1 - eps) cuts[i]!.push({ t, p })
      if (u > eps && u < 1 - eps) cuts[j]!.push({ t: u, p })
    }
  }
  const pieces: Piece[] = []
  for (let i = 0; i < n; i++) {
    const s = segments[i]!
    const list = cuts[i]!.sort((x, y) => x.t - y.t)
    let prev = s.a
    for (const c of list) {
      if (distance(prev, c.p) > 1e-10) pieces.push({ a: prev, b: c.p, source: s.source })
      prev = c.p
    }
    if (distance(prev, s.b) > 1e-10) pieces.push({ a: prev, b: s.b, source: s.source })
  }
  return pieces
}

const chain = (pieces: ReadonlyArray<Piece>): OffsetPath[] => {
  // Canonical node per grid cell so that split points shared by two pieces match.
  const canon = new Map<string, Vec2>()
  const node = (p: Vec2): { readonly key: string; readonly p: Vec2 } => {
    const key = keyOf(p)
    const existing = canon.get(key)
    if (existing !== undefined) return { key, p: existing }
    canon.set(key, p)
    return { key, p }
  }
  interface Edge {
    readonly from: string
    readonly to: string
    readonly a: Vec2
    readonly b: Vec2
    used: boolean
  }
  const edges: Edge[] = []
  const seen = new Set<string>()
  for (const piece of pieces) {
    const a = node(piece.a)
    const b = node(piece.b)
    if (a.key === b.key) continue
    const id = `${a.key}>${b.key}`
    if (seen.has(id)) continue
    seen.add(id)
    edges.push({ from: a.key, to: b.key, a: a.p, b: b.p, used: false })
  }
  const outgoing = new Map<string, Edge[]>()
  const incoming = new Map<string, number>()
  for (const e of edges) {
    const list = outgoing.get(e.from)
    if (list === undefined) outgoing.set(e.from, [e])
    else list.push(e)
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1)
  }
  const walk = (first: Edge): OffsetPath => {
    const pts: Vec2[] = [first.a]
    let current = first
    current.used = true
    const startKey = first.from
    for (;;) {
      pts.push(current.b)
      if (current.to === startKey) return { points: pts.slice(0, -1), closed: true }
      const next = (outgoing.get(current.to) ?? []).find((e) => !e.used)
      if (next === undefined) return { points: pts, closed: false }
      next.used = true
      current = next
    }
  }
  const paths: OffsetPath[] = []
  // Open chains first: they start where nothing arrives.
  for (const e of edges) {
    if (!e.used && !incoming.has(e.from)) paths.push(walk(e))
  }
  for (const e of edges) {
    if (!e.used) paths.push(walk(e))
  }
  return paths
}

const simplifyCollinear = (points: ReadonlyArray<Vec2>, closed: boolean): Vec2[] => {
  const n = points.length
  if (n < 3) return [...points]
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) {
      out.push(points[i]!)
      continue
    }
    const prev = points[(i - 1 + n) % n]!
    const cur = points[i]!
    const next = points[(i + 1) % n]!
    const a = sub(cur, prev)
    const b = sub(next, cur)
    const la = length(a)
    const lb = length(b)
    if (la < 1e-12 || lb < 1e-12) continue
    const c = Math.abs(cross2(a, b)) / (la * lb)
    if (c < 1e-9 && dot(a, b) > 0) continue
    out.push(cur)
  }
  return out
}

/**
 * Offsets a set of rings/paths. All inputs share one trimming pass, so several
 * rings (for instance a pocket boundary and its islands) interact correctly.
 * `distance` is signed per ring in the right-of-travel convention.
 */
export const offsetRings = (
  inputs: ReadonlyArray<{ readonly points: ReadonlyArray<Vec2>; readonly closed: boolean }>,
  distanceOffset: number,
  options: OffsetOptions = {}
): OffsetPath[] => {
  const absD = Math.abs(distanceOffset)
  const cleaned = inputs
    .map((i) => ({ points: dedupeRing(i.points, i.closed), closed: i.closed }))
    .filter((i) => i.points.length >= (i.closed ? 3 : 2))
  if (cleaned.length === 0) return []
  if (absD < 1e-12) return cleaned.map((c) => ({ points: c.points, closed: c.closed }))

  const raw: RawSegment[] = []
  const originals: OriginalSegment[] = []
  const closedRings: Vec2[][] = []
  cleaned.forEach((input, ringIndex) => {
    raw.push(...rawOffset(ringIndex, input.points, input.closed, distanceOffset, options))
    const n = input.points.length
    const count = input.closed ? n : n - 1
    for (let i = 0; i < count; i++) {
      originals.push({ ring: ringIndex, index: i, a: input.points[i]!, b: input.points[(i + 1) % n]! })
    }
    if (input.closed) closedRings.push([...input.points])
  })

  // Which parity of the original rings the result must have.
  let keep = options.keep
  if (keep === undefined) {
    const first = cleaned.find((c) => c.closed)
    if (first !== undefined) {
      const ccw = signedArea(first.points) >= 0
      const growing = ccw ? distanceOffset > 0 : distanceOffset < 0
      keep = growing ? "outside" : "inside"
    }
  }
  const tol = Math.max(1e-9, absD * 1e-9)
  const pieces = splitAtIntersections(raw)
  const ringSizes = cleaned.map((c) => c.points.length)

  const valid = (piece: Piece): boolean => {
    const mid = { x: (piece.a.x + piece.b.x) / 2, y: (piece.a.y + piece.b.y) / 2 }
    for (const o of originals) {
      // A segment further than the offset distance from the point (by its box) cannot be nearer than it.
      if (mid.x < Math.min(o.a.x, o.b.x) - absD || mid.x > Math.max(o.a.x, o.b.x) + absD || mid.y < Math.min(o.a.y, o.b.y) - absD || mid.y > Math.max(o.a.y, o.b.y) + absD) continue
      if (piece.source.kind === "bevel" && o.ring === piece.source.ring) {
        const n = ringSizes[o.ring]!
        const v = piece.source.vertex
        // The bevel chord is allowed to cut the corner: skip the two segments at its vertex.
        if (o.index === v || o.index === (v - 1 + n) % n) continue
      }
      if (pointSegmentDistance(mid, o.a, o.b) < absD - tol) return false
    }
    if (keep !== undefined && closedRings.length > 0) {
      if (insideEvenOdd(mid, closedRings) !== (keep === "inside")) return false
    }
    return true
  }

  const kept = pieces.filter(valid)
  return chain(kept)
    .map((p) => ({ points: simplifyCollinear(p.points, p.closed), closed: p.closed }))
    .filter((p) => p.points.length >= (p.closed ? 3 : 2))
}

/**
 * Offsets a polyline by `distanceOffset` (positive = right of the direction of
 * travel, so a CCW ring grows). A closed ring yields one loop per surviving
 * component (possibly none); an open path yields one or more open paths.
 */
export const offsetPolyline = (
  points: ReadonlyArray<Vec2>,
  distanceOffset: number,
  closed: boolean,
  options: OffsetOptions = {}
): Vec2[][] => {
  if (!closed && points.length >= 2 && Math.abs(distanceOffset) < 1e-12) return [[...points]]
  return offsetRings([{ points, closed }], distanceOffset, options).map((p) => [...p.points])
}

/** Offsets every ring of a polygon set independently; loops that collapse are dropped. */
export const offsetPolygon = (
  loops: ReadonlyArray<ReadonlyArray<Vec2>>,
  distanceOffset: number,
  options: OffsetOptions = {}
): Vec2[][] => {
  const out: Vec2[][] = []
  for (const loop of loops) out.push(...offsetPolyline(loop, distanceOffset, true, options))
  return out
}

/** Whether a ring crosses itself (used to discard degenerate inward offsets). */
export const selfIntersects = (points: ReadonlyArray<Vec2>): boolean => {
  const n = points.length
  if (n < 4) return false
  const orient = (a: Vec2, b: Vec2, c: Vec2): number => cross2(sub(b, a), sub(c, a))
  const onSegment = (a: Vec2, b: Vec2, p: Vec2): boolean =>
    p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9 &&
    p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9
  for (let i = 0; i < n; i++) {
    const a1 = points[i]!
    const a2 = points[(i + 1) % n]!
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue
      const b1 = points[j]!
      const b2 = points[(j + 1) % n]!
      const d1 = orient(a1, a2, b1)
      const d2 = orient(a1, a2, b2)
      const d3 = orient(b1, b2, a1)
      const d4 = orient(b1, b2, a2)
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
      // Collinear overlap: a vertex of one segment lying on the other.
      if (Math.abs(d1) < 1e-12 && onSegment(a1, a2, b1)) return true
      if (Math.abs(d2) < 1e-12 && onSegment(a1, a2, b2)) return true
      if (Math.abs(d3) < 1e-12 && onSegment(b1, b2, a1)) return true
      if (Math.abs(d4) < 1e-12 && onSegment(b1, b2, a2)) return true
    }
  }
  return false
}
