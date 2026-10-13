/**
 * Constrained Delaunay triangulation of a planar straight-line graph, with point insertion after the constraints are
 * in (for refinement). Used by the B-rep tessellator in each face's parameter domain.
 *
 * - Incremental Lawson insertion inside a super-triangle; constrained edges are recovered by Sloan's edge flipping.
 * - `orient2d` is exact (Shewchuk-style filtered evaluation with an expansion-arithmetic fallback), so topology
 *   decisions (walks, convexity, crossings) never contradict each other; the in-circle test is filtered and treats
 *   near-cocircular points as "no flip", which keeps flipping finite.
 * - Regions: triangles are classified inside/outside by crossing parity of constrained edges from the super-triangle,
 *   so an outer boundary with any number of holes needs no orientation input.
 */

// ---------------------------------------------------------------- exact orientation

const SPLITTER = 134217729 // 2^27 + 1
const EPS = 1.1102230246251565e-16
const CCW_BOUND = (3 + 16 * EPS) * EPS
const ICC_BOUND = (10 + 96 * EPS) * EPS

const twoProduct = (a: number, b: number, out: number[]): void => {
  const x = a * b
  let c = SPLITTER * a
  const ahi = c - (c - a)
  const alo = a - ahi
  c = SPLITTER * b
  const bhi = c - (c - b)
  const blo = b - bhi
  const err = alo * blo - (x - ahi * bhi - alo * bhi - ahi * blo)
  out.push(x, err)
}

/** Exact sign of a sum of doubles (Shewchuk's grow-expansion, then the most significant non-zero component). */
const exactSign = (terms: ReadonlyArray<number>): number => {
  const e: number[] = []
  for (const b of terms) {
    let q = b
    for (let i = 0; i < e.length; i++) {
      const ei = e[i]!
      const x = q + ei
      const bv = x - q
      const av = x - bv
      const h = q - av + (ei - bv)
      e[i] = h
      q = x
    }
    e.push(q)
  }
  for (let i = e.length - 1; i >= 0; i--) if (e[i] !== 0) return Math.sign(e[i]!)
  return 0
}

/** > 0 when (a, b, c) turn counter-clockwise, < 0 clockwise, 0 exactly collinear. */
export const orient2d = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => {
  const l = (ax - cx) * (by - cy)
  const r = (ay - cy) * (bx - cx)
  const det = l - r
  const bound = CCW_BOUND * (Math.abs(l) + Math.abs(r))
  if (det > bound || -det > bound) return det
  const t: number[] = []
  twoProduct(ax, by, t)
  twoProduct(-ax, cy, t)
  twoProduct(-cx, by, t)
  twoProduct(-ay, bx, t)
  twoProduct(ay, cx, t)
  twoProduct(cy, bx, t)
  return exactSign(t)
}

/** > 0 when d is strictly inside the circumcircle of the counter-clockwise triangle (a, b, c); 0 when uncertain. */
export const incircle = (
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number
): number => {
  const adx = ax - dx, ady = ay - dy, bdx = bx - dx, bdy = by - dy, cdx = cx - dx, cdy = cy - dy
  const alift = adx * adx + ady * ady
  const blift = bdx * bdx + bdy * bdy
  const clift = cdx * cdx + cdy * cdy
  const bc = bdx * cdy - cdx * bdy
  const ca = cdx * ady - adx * cdy
  const ab = adx * bdy - bdx * ady
  const det = alift * bc + blift * ca + clift * ab
  const perm =
    (Math.abs(bdx * cdy) + Math.abs(cdx * bdy)) * alift +
    (Math.abs(cdx * ady) + Math.abs(adx * cdy)) * blift +
    (Math.abs(adx * bdy) + Math.abs(bdx * ady)) * clift
  return Math.abs(det) > ICC_BOUND * perm * 4 ? det : 0
}

// ---------------------------------------------------------------- triangulation

/** Raised when two constrained segments cross: the boundary handed to the CDT intersects itself. */
export class CdtCrossingError extends Error {}

export interface CdtResult {
  /** All points (inputs first, then inserted ones), normalised back to input coordinates. */
  readonly xs: ReadonlyArray<number>
  readonly ys: ReadonlyArray<number>
  /** Inside triangles, counter-clockwise, as point indices. */
  readonly triangles: ReadonlyArray<readonly [number, number, number]>
}

/**
 * Mutable CDT. Coordinates are normalised to the unit box internally; indices returned by `addPoint` are stable.
 */
export class Cdt {
  private readonly x: number[] = []
  private readonly y: number[] = []
  private readonly tv: number[] = [] // 3 vertices per triangle (ccw)
  private readonly tn: number[] = [] // neighbour across edge i = (v[i], v[i+1])
  private readonly tc: boolean[] = [] // edge i constrained
  private readonly inside: boolean[] = []
  private readonly vtri: number[] = []
  private last = 0
  private readonly ox: number
  private readonly oy: number
  private readonly s: number
  private regionsMarked = false
  readonly superBase: number

  /** `bounds` must contain every point that will ever be added. */
  constructor(bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }) {
    this.ox = bounds.minX
    this.oy = bounds.minY
    this.s = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1
    this.superBase = 0
    this.pushPoint(-100, -100)
    this.pushPoint(101, -100)
    this.pushPoint(0.5, 150)
    this.newTriangle(0, 1, 2, -1, -1, -1)
  }

  private pushPoint(nx: number, ny: number): number {
    this.x.push(nx)
    this.y.push(ny)
    this.vtri.push(-1)
    return this.x.length - 1
  }

  private newTriangle(a: number, b: number, c: number, na: number, nb: number, nc: number): number {
    const t = this.tv.length / 3
    this.tv.push(a, b, c)
    this.tn.push(na, nb, nc)
    this.tc.push(false, false, false)
    this.inside.push(false)
    this.vtri[a] = t
    this.vtri[b] = t
    this.vtri[c] = t
    return t
  }

  private setTri(t: number, a: number, b: number, c: number, na: number, nb: number, nc: number, ca: boolean, cb: boolean, cc: boolean): void {
    const i = t * 3
    this.tv[i] = a; this.tv[i + 1] = b; this.tv[i + 2] = c
    this.tn[i] = na; this.tn[i + 1] = nb; this.tn[i + 2] = nc
    this.tc[i] = ca; this.tc[i + 1] = cb; this.tc[i + 2] = cc
    this.vtri[a] = t; this.vtri[b] = t; this.vtri[c] = t
  }

  private orient(a: number, b: number, c: number): number {
    return orient2d(this.x[a]!, this.y[a]!, this.x[b]!, this.y[b]!, this.x[c]!, this.y[c]!)
  }

  private orientP(a: number, b: number, px: number, py: number): number {
    return orient2d(this.x[a]!, this.y[a]!, this.x[b]!, this.y[b]!, px, py)
  }

  /** Replaces `old` by `nu` in t's neighbour slots. */
  private relink(t: number, old: number, nu: number): void {
    if (t < 0) return
    for (let k = 0; k < 3; k++) if (this.tn[t * 3 + k] === old) { this.tn[t * 3 + k] = nu; return }
  }

  private edgeIndex(t: number, a: number, b: number): number {
    for (let k = 0; k < 3; k++) if (this.tv[t * 3 + k] === a && this.tv[t * 3 + ((k + 1) % 3)] === b) return k
    return -1
  }

  /** Triangle containing (px, py): `[t, edge]` with edge ≥ 0 when the point is on that edge. */
  private locate(px: number, py: number): readonly [number, number] {
    let t = this.last
    const ntri = this.tv.length / 3
    if (t >= ntri) t = 0
    let steps = 0
    let rnd = 0
    while (steps++ < 4 * ntri + 100) {
      let moved = false
      let onEdge = -1
      const start = rnd++ % 3
      for (let kk = 0; kk < 3; kk++) {
        const k = (start + kk) % 3
        const a = this.tv[t * 3 + k]!, b = this.tv[t * 3 + ((k + 1) % 3)]!
        const o = this.orientP(a, b, px, py)
        if (o < 0) {
          const n = this.tn[t * 3 + k]!
          if (n < 0) return [t, -1]
          t = n
          moved = true
          break
        }
        if (o === 0) onEdge = k
      }
      if (!moved) {
        this.last = t
        return [t, onEdge]
      }
    }
    // Fallback: exhaustive search (never expected with exact predicates).
    for (let u = 0; u < ntri; u++) {
      let ok = true
      let onEdge = -1
      for (let k = 0; k < 3 && ok; k++) {
        const o = this.orientP(this.tv[u * 3 + k]!, this.tv[u * 3 + ((k + 1) % 3)]!, px, py)
        if (o < 0) ok = false
        else if (o === 0) onEdge = k
      }
      if (ok) return [u, onEdge]
    }
    throw new Error("cdt: point location failed")
  }

  /** Adds a point; returns its index (an existing point's index when it coincides with one). */
  addPoint(px: number, py: number): number {
    return this.addPointInt(px, py) - 3
  }

  /**
   * Refinement insertion: adds the point only when it lies strictly inside an inside triangle or on an unconstrained
   * edge between inside triangles, so constrained (shared boundary) edges are never split. Returns the new index or
   * undefined.
   */
  addInteriorPoint(px: number, py: number): number | undefined {
    const nx = (px - this.ox) / this.s, ny = (py - this.oy) / this.s
    const [t, edge] = this.locate(nx, ny)
    if (!this.inside[t]) return undefined
    for (let k = 0; k < 3; k++) {
      const v = this.tv[t * 3 + k]!
      if (this.x[v] === nx && this.y[v] === ny) return undefined
    }
    if (edge >= 0 && this.tc[t * 3 + edge]) return undefined
    return this.addPointInt(px, py) - 3
  }

  private addPointInt(px: number, py: number): number {
    const nx = (px - this.ox) / this.s, ny = (py - this.oy) / this.s
    const [t, edge] = this.locate(nx, ny)
    for (let k = 0; k < 3; k++) {
      const v = this.tv[t * 3 + k]!
      if (this.x[v] === nx && this.y[v] === ny) return v
    }
    const p = this.pushPoint(nx, ny)
    const stack: Array<readonly [number, number]> = []
    if (edge < 0) {
      const i = t * 3
      const a = this.tv[i]!, b = this.tv[i + 1]!, c = this.tv[i + 2]!
      const nab = this.tn[i]!, nbc = this.tn[i + 1]!, nca = this.tn[i + 2]!
      const cab = this.tc[i]!, cbc = this.tc[i + 1]!, cca = this.tc[i + 2]!
      const ins = this.inside[t]!
      const t1 = this.newTriangle(b, c, p, nbc, -1, t)
      const t2 = this.newTriangle(c, a, p, nca, t, t1)
      this.tn[t1 * 3 + 1] = t2
      this.tc[t1 * 3] = cbc
      this.tc[t2 * 3] = cca
      this.inside[t1] = ins
      this.inside[t2] = ins
      this.setTri(t, a, b, p, nab, t1, t2, cab, false, false)
      this.relink(nbc, t, t1)
      this.relink(nca, t, t2)
      stack.push([t, 0], [t1, 0], [t2, 0])
    } else {
      this.splitEdge(t, edge, p, stack)
    }
    this.legalize(stack)
    return p
  }

  private splitEdge(t: number, k: number, p: number, stack: Array<readonly [number, number]>): void {
    const i = t * 3
    const a = this.tv[i + k]!, b = this.tv[i + ((k + 1) % 3)]!, c = this.tv[i + ((k + 2) % 3)]!
    const nbc = this.tn[i + ((k + 1) % 3)]!, nca = this.tn[i + ((k + 2) % 3)]!
    const cbc = this.tc[i + ((k + 1) % 3)]!, cca = this.tc[i + ((k + 2) % 3)]!
    const cab = this.tc[i + k]!
    const u = this.tn[i + k]!
    const ins = this.inside[t]!
    if (u < 0) {
      const t2 = this.newTriangle(p, b, c, -1, nbc, t)
      this.tc[t2 * 3] = cab
      this.tc[t2 * 3 + 1] = cbc
      this.inside[t2] = ins
      this.setTri(t, a, p, c, -1, t2, nca, cab, false, cca)
      this.relink(nbc, t, t2)
      stack.push([t2, 1], [t, 2])
      return
    }
    const j = this.edgeIndex(u, b, a)
    const ui = u * 3
    const d = this.tv[ui + ((j + 2) % 3)]!
    const nad = this.tn[ui + ((j + 1) % 3)]!, ndb = this.tn[ui + ((j + 2) % 3)]!
    const cad = this.tc[ui + ((j + 1) % 3)]!, cdb = this.tc[ui + ((j + 2) % 3)]!
    const uins = this.inside[u]!
    // T1=(a,p,c) [t], T2=(p,b,c), U1=(b,p,d) [u], U2=(p,a,d)
    const T2 = this.newTriangle(p, b, c, -1, nbc, t)
    const U2 = this.newTriangle(p, a, d, t, nad, u)
    this.setTri(t, a, p, c, U2, T2, nca, cab, false, cca)
    this.setTri(u, b, p, d, T2, U2, ndb, cab, false, cdb)
    this.tn[T2 * 3] = u
    this.tc[T2 * 3] = cab
    this.tc[T2 * 3 + 1] = cbc
    this.tc[U2 * 3] = cab
    this.tc[U2 * 3 + 1] = cad
    this.inside[T2] = ins
    this.inside[U2] = uins
    this.relink(nbc, t, T2)
    this.relink(nad, u, U2)
    stack.push([t, 2], [T2, 1], [u, 2], [U2, 1])
  }

  /** Flips the edge k of t with its neighbour; returns the two triangles `[t, u]` now sharing edge (c, d). */
  private flip(t: number, k: number): readonly [number, number] {
    const i = t * 3
    const a = this.tv[i + k]!, b = this.tv[i + ((k + 1) % 3)]!, c = this.tv[i + ((k + 2) % 3)]!
    const nbc = this.tn[i + ((k + 1) % 3)]!, nca = this.tn[i + ((k + 2) % 3)]!
    const cbc = this.tc[i + ((k + 1) % 3)]!, cca = this.tc[i + ((k + 2) % 3)]!
    const u = this.tn[i + k]!
    const j = this.edgeIndex(u, b, a)
    const ui = u * 3
    const d = this.tv[ui + ((j + 2) % 3)]!
    const nad = this.tn[ui + ((j + 1) % 3)]!, ndb = this.tn[ui + ((j + 2) % 3)]!
    const cad = this.tc[ui + ((j + 1) % 3)]!, cdb = this.tc[ui + ((j + 2) % 3)]!
    // t = (c, a, d), u = (d, b, c)
    this.setTri(t, c, a, d, nca, nad, u, cca, cad, false)
    this.setTri(u, d, b, c, ndb, nbc, t, cdb, cbc, false)
    this.relink(nad, u, t)
    this.relink(nbc, t, u)
    return [t, u]
  }

  private legalize(stack: Array<readonly [number, number]>): void {
    let guard = 0
    while (stack.length > 0 && guard++ < 1_000_000) {
      const [t, k] = stack.pop()!
      const i = t * 3
      if (this.tc[i + k]) continue
      const u = this.tn[i + k]!
      if (u < 0) continue
      const a = this.tv[i + k]!, b = this.tv[i + ((k + 1) % 3)]!, c = this.tv[i + ((k + 2) % 3)]!
      const j = this.edgeIndex(u, b, a)
      if (j < 0) continue
      const d = this.tv[u * 3 + ((j + 2) % 3)]!
      if (incircle(this.x[a]!, this.y[a]!, this.x[b]!, this.y[b]!, this.x[c]!, this.y[c]!, this.x[d]!, this.y[d]!) <= 0) continue
      // Flip only a strictly convex quad.
      if (this.orient(c, a, d) <= 0 || this.orient(d, b, c) <= 0) continue
      const [t2, u2] = this.flip(t, k)
      // t2 = (c, a, d): edge 1 = (a, d); u2 = (d, b, c): edge 0 = (d, b).
      stack.push([t2, 1], [u2, 0])
    }
  }

  /** Triangles around vertex `a` (walking its fan both ways from `vtri[a]`). */
  private fan(a: number): number[] {
    const start = this.vtri[a]!
    const out: number[] = []
    if (start < 0) return out
    const slot = (t: number): number => {
      for (let q = 0; q < 3; q++) if (this.tv[t * 3 + q] === a) return q
      return -1
    }
    if (slot(start) < 0) return this.fanScan(a)
    out.push(start)
    // Counter-clockwise: across the edge entering a.
    let t = start
    for (let n = 0; n < 1 << 16; n++) {
      const nt = this.tn[t * 3 + ((slot(t) + 2) % 3)]!
      if (nt < 0) break
      if (nt === start) return out
      out.push(nt)
      t = nt
    }
    // Hit the hull: also walk clockwise from the start (across the edge leaving a).
    t = start
    for (let n = 0; n < 1 << 16; n++) {
      const nt = this.tn[t * 3 + slot(t)]!
      if (nt < 0 || nt === start) break
      out.push(nt)
      t = nt
    }
    return out
  }

  private fanScan(a: number): number[] {
    const out: number[] = []
    const ntri = this.tv.length / 3
    for (let t = 0; t < ntri; t++) for (let k = 0; k < 3; k++) if (this.tv[t * 3 + k] === a) { out.push(t); break }
    return out
  }

  /** Triangle and edge index of the directed edge (a, b), or undefined. */
  private findEdge(a: number, b: number): readonly [number, number] | undefined {
    for (const t of this.fan(a)) {
      const k = this.edgeIndex(t, a, b)
      if (k >= 0) return [t, k]
    }
    return undefined
  }

  private markConstrained(a: number, b: number): boolean {
    const f = this.findEdge(a, b)
    const r = this.findEdge(b, a)
    if (f === undefined && r === undefined) return false
    if (f !== undefined) this.tc[f[0] * 3 + f[1]] = true
    if (r !== undefined) this.tc[r[0] * 3 + r[1]] = true
    return true
  }

  /** Strict proper crossing of segments (p, q) and (r, s). */
  private crosses(p: number, q: number, r: number, s: number): boolean {
    const o1 = this.orient(p, q, r), o2 = this.orient(p, q, s)
    const o3 = this.orient(r, s, p), o4 = this.orient(r, s, q)
    return o1 * o2 < 0 && o3 * o4 < 0
  }

  /** Inserts the constrained segment between existing points `a` and `b` (indices from `addPoint`). */
  addConstraint(a: number, b: number): void {
    this.constrain(a + 3, b + 3)
  }

  private constrain(a: number, b: number): void {
    if (a === b) return
    if (this.markConstrained(a, b)) return
    // Walk from a towards b collecting crossed edges; split at collinear vertices.
    let tStart = -1
    let crossedFirst: readonly [number, number] | undefined
    for (const t of this.fan(a)) {
      let ka = 0
      for (let q = 0; q < 3; q++) if (this.tv[t * 3 + q] === a) ka = q
      const x = this.tv[t * 3 + ((ka + 1) % 3)]!, y = this.tv[t * 3 + ((ka + 2) % 3)]!
      const ox = this.orient(a, b, x), oy = this.orient(a, b, y)
      // Collinear vertex in front of a on the segment: split.
      for (const [v, o] of [[x, ox], [y, oy]] as const) {
        if (o === 0 && v !== b) {
          const dx = this.x[b]! - this.x[a]!, dy = this.y[b]! - this.y[a]!
          const ex = this.x[v]! - this.x[a]!, ey = this.y[v]! - this.y[a]!
          const dot = dx * ex + dy * ey
          if (dot > 0 && dot < dx * dx + dy * dy) {
            this.constrain(a, v)
            this.constrain(v, b)
            return
          }
        }
      }
      if (ox < 0 && oy > 0) {
        tStart = t
        crossedFirst = [x, y]
        break
      }
    }
    if (tStart < 0 || crossedFirst === undefined) {
      if (this.markConstrained(a, b)) return
      throw new Error("cdt: cannot recover constraint")
    }
    const crossed: Array<readonly [number, number]> = []
    let t = tStart
    let [x, y] = crossedFirst
    for (let guard = 0; guard < 1_000_000; guard++) {
      crossed.push([x, y])
      const i = t * 3
      // edge (x, y) of t: find neighbour across it
      let k = -1
      for (let q = 0; q < 3; q++) if (this.tv[i + q] === x && this.tv[i + ((q + 1) % 3)] === y) k = q
      if (k < 0 || this.tc[i + k]) throw new CdtCrossingError("cdt: constrained segments cross (self-intersecting boundary)")
      const u = this.tn[i + k]!
      if (u < 0) throw new CdtCrossingError("cdt: constraint leaves the triangulation")
      const j = this.edgeIndex(u, y, x)
      const z = this.tv[u * 3 + ((j + 2) % 3)]!
      if (z === b) break
      const oz = this.orient(a, b, z)
      if (oz === 0) {
        // Collinear vertex: constrain up to it, then from it.
        this.sloan(a, z, crossed)
        this.constrain(z, b)
        return
      }
      t = u
      if (oz < 0) x = z
      else y = z
    }
    this.sloan(a, b, crossed)
  }

  /** Sloan's flip-based recovery of segment (a, b) given the edges it crosses. */
  private sloan(a: number, b: number, crossedIn: ReadonlyArray<readonly [number, number]>): void {
    const queue = [...crossedIn]
    const fresh: Array<readonly [number, number]> = []
    let guard = 0
    while (queue.length > 0 && guard++ < 100_000) {
      const [p, q] = queue.shift()!
      const f = this.findEdge(p, q)
      if (f === undefined) continue
      const [t, k] = f
      const i = t * 3
      const c = this.tv[i + ((k + 2) % 3)]!
      const u = this.tn[i + k]!
      const j = this.edgeIndex(u, q, p)
      const d = this.tv[u * 3 + ((j + 2) % 3)]!
      // Convex quad (p, d, q, c) <=> diagonals cross.
      if (!(this.orient(c, p, d) > 0 && this.orient(d, q, c) > 0)) {
        queue.push([p, q])
        continue
      }
      this.flip(t, k)
      if (this.crosses(a, b, c, d)) queue.push([c, d])
      else fresh.push([c, d])
    }
    this.markConstrained(a, b)
    // Restore the Delaunay property on the new edges.
    for (let pass = 0; pass < 8; pass++) {
      let changed = false
      for (const [p, q] of fresh) {
        if ((p === a && q === b) || (p === b && q === a)) continue
        const f = this.findEdge(p, q)
        if (f === undefined) continue
        const [t, k] = f
        if (this.tc[t * 3 + k]) continue
        const u = this.tn[t * 3 + k]!
        if (u < 0) continue
        const c = this.tv[t * 3 + ((k + 2) % 3)]!
        const j = this.edgeIndex(u, q, p)
        const d = this.tv[u * 3 + ((j + 2) % 3)]!
        if (incircle(this.x[p]!, this.y[p]!, this.x[q]!, this.y[q]!, this.x[c]!, this.y[c]!, this.x[d]!, this.y[d]!) > 0 && this.orient(c, p, d) > 0 && this.orient(d, q, c) > 0) {
          this.flip(t, k)
          changed = true
        }
      }
      if (!changed) break
    }
  }

  /** Marks inside/outside by constrained-edge crossing parity from the super-triangle. Call after the constraints. */
  markRegions(): void {
    const ntri = this.tv.length / 3
    const depth = new Array<number>(ntri).fill(-1)
    let layer: number[] = []
    for (let t = 0; t < ntri; t++) for (let k = 0; k < 3; k++) if (this.tv[t * 3 + k]! < 3) { layer.push(t); break }
    let d = 0
    while (layer.length > 0) {
      const next: number[] = []
      const stack = layer.filter((t) => depth[t]! < 0)
      for (const t of stack) depth[t] = d
      while (stack.length > 0) {
        const t = stack.pop()!
        for (let k = 0; k < 3; k++) {
          const u = this.tn[t * 3 + k]!
          if (u < 0 || depth[u]! >= 0) continue
          if (this.tc[t * 3 + k]) next.push(u)
          else { depth[u] = d; stack.push(u) }
        }
      }
      layer = next
      d++
    }
    for (let t = 0; t < ntri; t++) this.inside[t] = depth[t]! % 2 === 1
    this.regionsMarked = true
  }

  /** True when (px, py) lies in an inside triangle (regions must be marked). */
  isInside(px: number, py: number): boolean {
    const [t] = this.locate((px - this.ox) / this.s, (py - this.oy) / this.s)
    return this.inside[t]!
  }

  get pointCount(): number {
    return this.x.length - 3
  }

  /** Inside triangles (or all non-super ones before `markRegions`). Point indices exclude the 3 super vertices. */
  result(): CdtResult {
    const ntri = this.tv.length / 3
    const triangles: Array<readonly [number, number, number]> = []
    for (let t = 0; t < ntri; t++) {
      const a = this.tv[t * 3]!, b = this.tv[t * 3 + 1]!, c = this.tv[t * 3 + 2]!
      if (a < 3 || b < 3 || c < 3) continue
      if (this.regionsMarked && !this.inside[t]) continue
      triangles.push([a - 3, b - 3, c - 3])
    }
    const xs: number[] = [], ys: number[] = []
    for (let i = 3; i < this.x.length; i++) {
      xs.push(this.x[i]! * this.s + this.ox)
      ys.push(this.y[i]! * this.s + this.oy)
    }
    return { xs, ys, triangles }
  }

  /** Whether the edge between points `a` and `b` is constrained. */
  isConstrained(a: number, b: number): boolean {
    const f = this.findEdge(a + 3, b + 3) ?? this.findEdge(b + 3, a + 3)
    return f !== undefined && this.tc[f[0] * 3 + f[1]] === true
  }
}

/**
 * One-shot CDT of polygons with holes: `rings` are closed point lists (any orientation); returns inside triangles,
 * counter-clockwise, indexing the concatenated ring points (plus any `steiner` points appended after them).
 */
export const triangulateDomain = (
  rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  steiner: ReadonlyArray<readonly [number, number]> = []
): CdtResult => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const r of rings) for (const [x, y] of r) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  const cdt = new Cdt({ minX, minY, maxX, maxY })
  const ids: number[][] = rings.map((r) => r.map(([x, y]) => cdt.addPoint(x, y)))
  ids.forEach((r) => r.forEach((a, i) => cdt.addConstraint(a, r[(i + 1) % r.length]!)))
  cdt.markRegions()
  for (const [x, y] of steiner) if (cdt.isInside(x, y)) cdt.addPoint(x, y)
  return cdt.result()
}
