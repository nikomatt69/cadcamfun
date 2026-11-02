/**
 * The R5 gate of spec 42: seeded surface pairs (NURBS x plane / sphere / cylinder, NURBS x NURBS), the intersection computed by
 * `intersectPatches`, and a dense-grid truth to measure it against.
 *
 * Truth: patch A is sampled on a 160 x 160 grid, the signed distance to B is taken at every node (exact for an analytic B, from
 * a 160 x 160 point cloud of B with the normal at the nearest node for a NURBS B). A node whose neighbour has the other sign
 * lies within one grid step of the true curve. Connected groups of those nodes are the truth's loops/branches; a group has to
 * be covered by the computed curves (every node within `COVER` mm of one) or it is a missed branch, and a computed curve far
 * from every truth node is spurious. Every computed point is measured against both surfaces (<= 1e-6 mm), and so is every
 * chord midpoint (the fit).
 *
 * `bun packages/core/src/cad/brep/ssi-gate.ts [first] [count] [density]` prints the table.
 */
import { add3, cross3, dist3, dot3, frame, normalize3, scale3, sub3, type Vec3 } from "./math.ts"
import { clampedUniformKnots, type NurbsSurfaceData } from "./nurbs.ts"
import { fitCurve } from "./boolean.ts"
import { curvePoint, surfaceDistance, surfaceNormal, surfacePoint, surfaceProject, type Surface } from "./geom.ts"
import { densify, intersectPatches, nurbsRange, type ParamRange, type PatchCurve } from "./ssi.ts"

const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export type PairKind = "nurbs-plane" | "nurbs-sphere" | "nurbs-cylinder" | "nurbs-nurbs"

export interface SsiPair {
  readonly seed: number
  readonly kind: PairKind
  readonly a: Surface
  readonly ra: ParamRange
  readonly b: Surface
  readonly rb: ParamRange
}

const rotate = (v: Vec3, axis: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a)
  return add3(add3(scale3(v, c), scale3(cross3(axis, v), s)), scale3(axis, dot3(axis, v) * (1 - c)))
}

/** A bicubic patch over `size` x `size` mm with `n` x `n` control points, heights within +-`amp`, optionally rational. */
const patch = (r: () => number, size: number, n: number, amp: number, rational: boolean): NurbsSurfaceData => {
  const step = size / (n - 1)
  const points = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => [i * step + (r() - 0.5) * step * 0.5, j * step + (r() - 0.5) * step * 0.5, (r() * 2 - 1) * amp]))
  return {
    degreeU: 3, degreeV: 3,
    knotsU: clampedUniformKnots(n, 3), knotsV: clampedUniformKnots(n, 3),
    points,
    ...(rational ? { weights: points.map((col) => col.map(() => 0.7 + r() * 0.7)) } : {})
  }
}

const place = (d: NurbsSurfaceData, axis: Vec3, angle: number, to: Vec3, centre: Vec3): NurbsSurfaceData => ({
  ...d,
  points: d.points.map((col) => col.map((p) => {
    const q = add3(rotate(sub3({ x: p[0]!, y: p[1]!, z: p[2]! }, centre), axis, angle), to)
    return [q.x, q.y, q.z]
  }))
})

export const makePair = (index: number): SsiPair => {
  const seed = 1000 + index
  const r = mulberry(seed * 7919)
  const kind: PairKind = index % 4 === 0 ? "nurbs-plane" : index % 4 === 1 ? "nurbs-sphere" : index % 4 === 2 ? "nurbs-cylinder" : "nurbs-nurbs"
  // Half the pairs are NURBS x NURBS: the harder, and the one the Boolean meets on lofts and sweeps.
  const kinds: PairKind[] = ["nurbs-plane", "nurbs-sphere", "nurbs-cylinder", "nurbs-nurbs", "nurbs-nurbs", "nurbs-nurbs", "nurbs-nurbs", "nurbs-nurbs"]
  const k = kinds[index % kinds.length]!
  void kind
  const a: Surface = { kind: "nurbs", data: patch(r, 20, 5 + Math.floor(r() * 3), 1 + r() * 4, r() < 0.2) }
  const ra = nurbsRange(a)
  const near: Vec3 = { x: 10 + (r() - 0.5) * 8, y: 10 + (r() - 0.5) * 8, z: (r() - 0.5) * 4 }
  const axis = normalize3({ x: r() - 0.5, y: r() - 0.5, z: r() - 0.5 + 0.01 })
  if (k === "nurbs-plane") {
    const n = normalize3({ x: (r() - 0.5) * 1.5, y: (r() - 0.5) * 1.5, z: 1 })
    return { seed, kind: k, a, ra, b: { kind: "plane", frame: frame(near, n) }, rb: { u0: -30, u1: 30, v0: -30, v1: 30 } }
  }
  if (k === "nurbs-sphere") {
    const centre = { x: 10 + (r() - 0.5) * 20, y: 10 + (r() - 0.5) * 20, z: (r() - 0.5) * 16 }
    return { seed, kind: k, a, ra, b: { kind: "sphere", frame: frame(centre, { x: 0, y: 0, z: 1 }), radius: 4 + r() * 10 }, rb: { u0: 0, u1: 2 * Math.PI, v0: -1.45, v1: 1.45 } }
  }
  if (k === "nurbs-cylinder") {
    return { seed, kind: k, a, ra, b: { kind: "cylinder", frame: frame(near, axis), radius: 3 + r() * 7 }, rb: { u0: 0, u1: 2 * Math.PI, v0: -30, v1: 30 } }
  }
  const size = [8, 14, 20, 28][Math.floor(r() * 4)]!
  const raw = patch(r, size, 5 + Math.floor(r() * 3), 1 + r() * 4, r() < 0.2)
  const b: Surface = { kind: "nurbs", data: place(raw, axis, r() * Math.PI, near, { x: size / 2, y: size / 2, z: 0 }) }
  return { seed, kind: "nurbs-nurbs", a, ra, b, rb: nurbsRange(b) }
}

// ------------------------------------------------------------------ truth

const G = 160
const COVER = 0.3

/** Spatial hash of points for nearest-distance queries. */
class Hash {
  private readonly cells = new Map<string, number[]>()
  constructor(readonly pts: ReadonlyArray<Vec3>, readonly h: number) {
    pts.forEach((p, i) => {
      const key = this.key(p)
      const l = this.cells.get(key)
      if (l) l.push(i); else this.cells.set(key, [i])
    })
  }
  private key(p: Vec3): string { return `${Math.floor(p.x / this.h)},${Math.floor(p.y / this.h)},${Math.floor(p.z / this.h)}` }
  /** Index of the nearest point within `reach` (a multiple of the cell size), or -1. */
  nearest(p: Vec3, reach: number): number {
    let best = -1, bd = reach
    const cx = Math.floor(p.x / this.h), cy = Math.floor(p.y / this.h), cz = Math.floor(p.z / this.h)
    const r = Math.ceil(reach / this.h)
    for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
      const l = this.cells.get(`${x},${y},${z}`)
      if (!l) continue
      for (const i of l) { const d = dist3(this.pts[i]!, p); if (d < bd) { bd = d; best = i } }
    }
    return best
  }
}

export interface Truth {
  /** Groups of nodes (3D points) along the true intersection, one per connected branch. */
  readonly branches: ReadonlyArray<ReadonlyArray<Vec3>>
}

export const truthOf = (pair: SsiPair): Truth => {
  const { a, ra, b, rb } = pair
  const pts: Vec3[] = []
  for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) pts.push(surfacePoint(a, ra.u0 + ((ra.u1 - ra.u0) * i) / G, ra.v0 + ((ra.v1 - ra.v0) * j) / G))
  // Signed distance of every node of A to B.
  let signed: (p: Vec3) => number
  if (b.kind === "plane") signed = (p) => dot3(sub3(p, b.frame.origin), b.frame.z)
  else if (b.kind === "sphere") signed = (p) => dist3(p, b.frame.origin) - b.radius
  else if (b.kind === "cylinder") {
    signed = (p) => {
      const w = sub3(p, b.frame.origin)
      const z = dot3(w, b.frame.z)
      return Math.hypot(w.x - b.frame.z.x * z, w.y - b.frame.z.y * z, w.z - b.frame.z.z * z) - b.radius
    }
  } else {
    const bp: Vec3[] = [], bn: Vec3[] = []
    for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) {
      const u = rb.u0 + ((rb.u1 - rb.u0) * i) / G, v = rb.v0 + ((rb.v1 - rb.v0) * j) / G
      bp.push(surfacePoint(b, u, v)); bn.push(surfaceNormal(b, u, v))
    }
    const hash = new Hash(bp, 0.5)
    // Beyond the reach there is no usable sign: a large positive number with the sign of "far".
    signed = (p) => {
      const k = hash.nearest(p, 1.0)
      if (k < 0) return Number.NaN
      // Beyond the patch's edge the nearest node is a boundary node and its normal says nothing about the other side.
      const bi = Math.floor(k / (G + 1)), bj = k % (G + 1)
      if (bi === 0 || bi === G || bj === 0 || bj === G) return Number.NaN
      return dot3(sub3(p, bp[k]!), bn[k]!)
    }
  }
  // An analytic B is a patch too: beyond its parameter rectangle there is no surface.
  const inB = (p: Vec3): boolean => {
    if (b.kind === "nurbs") return true
    const q = surfaceProject(b, p)
    return q.v >= rb.v0 && q.v <= rb.v1 && (b.kind !== "plane" || (q.u >= rb.u0 && q.u <= rb.u1))
  }
  const s = pts.map((p) => (inB(p) ? signed(p) : Number.NaN))
  // Is the crossing real for a surface that is only a patch? A sign change counts where the nearest B point is near (NaN = far).
  const flagged = new Array<boolean>(pts.length).fill(false)
  const id = (i: number, j: number) => i * (G + 1) + j
  for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) {
    for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
      const i2 = i + di, j2 = j + dj
      if (i2 > G || j2 < 0 || j2 > G) continue
      const x = s[id(i, j)]!, y = s[id(i2, j2)]!
      if (Number.isNaN(x) || Number.isNaN(y)) continue
      if ((x < 0 && y > 0) || (x > 0 && y < 0)) {
        // A sign flip across a distance much larger than the grid step is a jump of the nearest-point lookup, not a crossing.
        if (Math.abs(x) + Math.abs(y) > 1.0) continue
        flagged[id(i, j)] = true
        flagged[id(i2, j2)] = true
      }
    }
  }
  // Connected components of flagged nodes (8-neighbourhood).
  const seen = new Array<boolean>(pts.length).fill(false)
  const branches: Vec3[][] = []
  for (let n0 = 0; n0 < pts.length; n0++) {
    if (!flagged[n0] || seen[n0]) continue
    const comp: Vec3[] = []
    const stack = [n0]
    seen[n0] = true
    while (stack.length > 0) {
      const n = stack.pop()!
      comp.push(pts[n]!)
      const i = Math.floor(n / (G + 1)), j = n % (G + 1)
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const i2 = i + di, j2 = j + dj
        if (i2 < 0 || i2 > G || j2 < 0 || j2 > G) continue
        const m = id(i2, j2)
        if (flagged[m] && !seen[m]) { seen[m] = true; stack.push(m) }
      }
    }
    // Under six nodes is a graze or a patch corner, below what a 160 x 160 grid resolves.
    if (comp.length >= 6) branches.push(comp)
  }
  return { branches }
}

// ------------------------------------------------------------------ measurement

export interface PairReport {
  readonly seed: number
  readonly kind: PairKind
  readonly truthBranches: number
  readonly curves: number
  readonly missed: number
  readonly spurious: number
  /** Largest distance of a computed point (or chord midpoint) to either surface, mm. */
  readonly worstError: number
  readonly ms: number
  readonly pass: boolean
  readonly note?: string
}

export const measurePair = (pair: SsiPair, density = 1): PairReport => {
  const t0 = Date.now()
  const truth = truthOf(pair)
  let curves: PatchCurve[]
  try {
    curves = intersectPatches(pair.a, pair.ra, pair.b, pair.rb, { density })
  } catch (e) {
    return { seed: pair.seed, kind: pair.kind, truthBranches: truth.branches.length, curves: 0, missed: truth.branches.length, spurious: 0, worstError: Infinity, ms: Date.now() - t0, pass: false, note: `threw: ${(e as Error).message.slice(0, 80)}` }
  }
  const all: Vec3[] = curves.flatMap((c) => densify(c, 0.05))
  const hash = new Hash(all, 0.4)
  let missed = 0
  for (const br of truth.branches) {
    const covered = br.filter((p) => hash.nearest(p, COVER) >= 0).length
    if (covered < 0.8 * br.length) missed++
  }
  const truthPts = truth.branches.flat()
  const th = new Hash(truthPts, 0.4)
  let spurious = 0
  for (const c of curves) {
    const d = densify(c, 0.3)
    const far = d.filter((p) => th.nearest(p, 0.6) < 0).length
    // A curve entirely off the truth, or mostly (a branch the 6-node floor dropped counts as truth-free: allow short curves).
    if (far > 0.5 * d.length && d.length > 3) spurious++
  }
  // The curve is what the Boolean keeps (`fitCurve`: line, circle, or the cubic through the points with a degree-1 fallback). The
  // points, and the curve at the middle of every span between two data points, are measured against both surfaces; the nearest
  // data point's parameters are the hint of the projection (a projection without one can land in another fold of the patch).
  let worst = 0
  for (const c of curves) {
    const n = c.points.length
    const pts = c.points.map((q) => q.p)
    const hintA = (q: { ua: number; va: number }) => ({ u: q.ua, v: q.va })
    const hintB = (q: { ub: number; vb: number }) => ({ u: q.ub, v: q.vb })
    for (const q of c.points) worst = Math.max(worst, Math.abs(dist3(surfacePoint(pair.a, q.ua, q.va), q.p)), Math.abs(dist3(surfacePoint(pair.b, q.ub, q.vb), q.p)))
    if (n < 3) continue
    try {
      const fit = fitCurve(pts, c.closed, 1e-6)
      const m = c.closed ? n : n - 1
      for (let i = 0; i < m; i++) {
        const t = (fit.params[i]! + (i + 1 < fit.params.length ? fit.params[i + 1]! : fit.t1)) / 2
        const mid = curvePoint(fit.curve, t)
        const q = c.points[i]!, q2 = c.points[(i + 1) % n]!
        worst = Math.max(worst, surfaceDistance(pair.a, mid, hintA({ ua: (q.ua + q2.ua) / 2, va: (q.va + q2.va) / 2 })), surfaceDistance(pair.b, mid, hintB({ ub: (q.ub + q2.ub) / 2, vb: (q.vb + q2.vb) / 2 })))
      }
    } catch { worst = Infinity }
  }
  const pass = missed === 0 && spurious === 0 && worst <= 1e-6
  return { seed: pair.seed, kind: pair.kind, truthBranches: truth.branches.length, curves: curves.length, missed, spurious, worstError: worst, ms: Date.now() - t0, pass }
}

if (import.meta.main) {
  const first = Number(process.argv[2] ?? 0), count = Number(process.argv[3] ?? 200), density = Number(process.argv[4] ?? 1)
  const rows: PairReport[] = []
  for (let i = first; i < first + count; i++) {
    const r = measurePair(makePair(i), density)
    rows.push(r)
    if (!r.pass) console.error(`FAIL #${i} ${r.kind} seed ${r.seed}: truth ${r.truthBranches} curves ${r.curves} missed ${r.missed} spurious ${r.spurious} worst ${r.worstError.toExponential(2)} ${r.note ?? ""}`)
  }
  const by = (k: string) => rows.filter((r) => r.kind === k)
  console.log(JSON.stringify({
    pairs: rows.length,
    passed: rows.filter((r) => r.pass).length,
    byKind: Object.fromEntries(["nurbs-plane", "nurbs-sphere", "nurbs-cylinder", "nurbs-nurbs"].map((k) => [k, { n: by(k).length, passed: by(k).filter((r) => r.pass).length, missed: by(k).reduce((s, r) => s + r.missed, 0), spurious: by(k).reduce((s, r) => s + r.spurious, 0), badFit: by(k).filter((r) => r.worstError > 1e-6).length, withCurves: by(k).filter((r) => r.truthBranches > 0).length }])),
    maxMs: Math.max(...rows.map((r) => r.ms)),
    totalMs: rows.reduce((s, r) => s + r.ms, 0)
  }, null, 1))
}
