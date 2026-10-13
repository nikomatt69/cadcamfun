/**
 * Adaptive (engagement-bounded) clearing: the tool never meets more material than a chosen radial depth ae, however the region is
 * shaped, so it can run deep and fast under a constant load. A contour-parallel pocket (`pocket.ts`) cuts a full-width slot in
 * every corner and a step of its own stepover everywhere else; this follows the stock in process instead.
 *
 * The geometry is the region the tool CENTRE may occupy (as the 3D roughing computes it), with islands. Everything within one
 * tool radius of that region is material the tool can reach. It is kept on a raster, `uncut`, and every pass removes the disc of
 * the tool from it.
 *
 *   one pass    To take a strip of width ae beyond the front of the stock, the centre has to stand R - ae from the stock. So the
 *               centre line of a pass is the level set `distance to uncut stock = R - ae`: an exact Euclidean distance transform
 *               of the raster, traced with marching squares. It runs with the stock on its right (climb milling) or left.
 *   clipping    Where that line leaves the region (the centre may not go there) it is cut into pieces; each piece is a run. A
 *               wall or an island is not a special case: it is the edge of the region, and the passes that arrive at it do so one
 *               ae at a time, because the stock they are measured from has only ever advanced by ae.
 *   repeating   The stock is updated and the next level set is a pass closer to the walls, until nothing is left. Where no level
 *               of the stock can be reached, stock thinner than a pass remains near the edge of the region, and one last pass
 *               along that edge takes it (the only place the load can exceed ae, and by no more than what is left).
 *   entries     The first entry is a helix where there is most room. Every other run starts in the air a little back from the
 *               stock and stays down when the straight link is feasible and light, otherwise it lifts.
 *
 * Nothing is steered or searched for, so there is nothing to lose track of: the number of passes is the depth of the region over
 * ae, and each costs one distance transform. The signed distance to the region (`Field`) is exact at its nodes and interpolated
 * between them; material thinner than a few nodes is below the resolution of the raster and is left for the next operation.
 */
import { Schema } from "effect"
import type { Vec2 } from "../../cad/vec.ts"
import { regionOf, type RegionInput } from "../geometry.ts"
import type { Toolpath } from "../ir.ts"
import { OperationFields, Positive, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import type { Stock, Tool } from "../tool.ts"
import { toolRadius } from "../tool.ts"
import { MoveBuilder, approach, finish, helixDown, liftTo } from "./common.ts"
import { distanceTo } from "./rest.ts"
import { contour, simplify } from "./surface-field.ts"

export class AdaptiveParams extends Schema.Class<AdaptiveParams>("cam/AdaptiveParams")(
  Schema.Struct({
    ...OperationFields,
    /** Maximum radial engagement as a percentage of the tool diameter (the "optimal load"). */
    engagement: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 50 })), 12),
    climb: withDefault(Schema.Boolean, true),
    helixPitch: withDefault(Positive, 1),
    /** Chord tolerance of the simplified path, mm. */
    tolerance: withDefault(Positive, 0.01)
  }).check(heightsOrdered)
) {}

export interface AdaptiveStats {
  readonly runs: number
  readonly steps: number
  /** Steps whose engagement exceeded the target by more than 5% (corners and entries that cannot be made lighter). */
  readonly overloaded: number
  /** Largest engagement met, as a fraction of the target. */
  readonly peak: number
  /** Uncut nodes left, and how many were ignored as slivers thinner than the raster. */
  readonly left: number
  readonly slivers: number
  readonly plunges: number
}

export interface AdaptiveResult {
  readonly toolpath: Toolpath
  readonly warnings: ReadonlyArray<string>
  readonly stats: AdaptiveStats
}

// ---------------------------------------------------------------- signed distance to the region

/** Signed distance to a region (positive inside), exact at the nodes of a regular grid and capped at `cap`. */
class Field {
  readonly w: number
  readonly rows: number
  readonly phi: Float64Array

  constructor(readonly rings: ReadonlyArray<ReadonlyArray<Vec2>>, readonly x0: number, readonly y0: number, nx: number, ny: number, readonly h: number, readonly cap: number) {
    this.w = nx + 1
    this.rows = ny + 1
    const n = this.w * this.rows
    const inside = new Uint8Array(n)
    const crossings: number[] = []
    for (let j = 0; j < this.rows; j++) {
      const y = y0 + j * h
      crossings.length = 0
      for (const ring of rings) {
        for (let a = 0, p = ring.length - 1; a < ring.length; p = a++) {
          const A = ring[a]!, B = ring[p]!
          if (A.y > y !== B.y > y) crossings.push(A.x + ((y - A.y) / (B.y - A.y)) * (B.x - A.x))
        }
      }
      crossings.sort((u, v) => u - v)
      for (let c = 0; c + 1 < crossings.length; c += 2) {
        const i0 = Math.max(0, Math.ceil((crossings[c]! - x0) / h)), i1 = Math.min(nx, Math.floor((crossings[c + 1]! - x0) / h))
        for (let i = i0; i <= i1; i++) inside[j * this.w + i] = 1
      }
    }
    const dmin = new Float64Array(n).fill(cap)
    const piece = Math.max(2 * cap, h)
    for (const ring of rings) {
      for (let a = 0, p = ring.length - 1; a < ring.length; p = a++) {
        const A = ring[p]!, B = ring[a]!
        const len = Math.hypot(B.x - A.x, B.y - A.y)
        const parts = Math.max(1, Math.ceil(len / piece))
        for (let q = 0; q < parts; q++) {
          const ax = A.x + ((B.x - A.x) * q) / parts, ay = A.y + ((B.y - A.y) * q) / parts
          const bx = A.x + ((B.x - A.x) * (q + 1)) / parts, by = A.y + ((B.y - A.y) * (q + 1)) / parts
          const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - cap - x0) / h)), i1 = Math.min(nx, Math.ceil((Math.max(ax, bx) + cap - x0) / h))
          const j0 = Math.max(0, Math.floor((Math.min(ay, by) - cap - y0) / h)), j1 = Math.min(ny, Math.ceil((Math.max(ay, by) + cap - y0) / h))
          const dx = bx - ax, dy = by - ay
          const l2 = dx * dx + dy * dy
          for (let j = j0; j <= j1; j++) {
            const py = y0 + j * h
            for (let i = i0; i <= i1; i++) {
              const px = x0 + i * h
              const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
              const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
              const k = j * this.w + i
              if (d < dmin[k]!) dmin[k] = d
            }
          }
        }
      }
    }
    this.phi = new Float64Array(n)
    for (let k = 0; k < n; k++) this.phi[k] = inside[k] === 1 ? dmin[k]! : -dmin[k]!
  }

  /** Bilinear value at (x, y); `-cap` outside the grid. */
  at(x: number, y: number): number {
    const gx = (x - this.x0) / this.h, gy = (y - this.y0) / this.h
    if (gx < 0 || gy < 0 || gx > this.w - 1 || gy > this.rows - 1) return -this.cap
    const i = Math.min(this.w - 2, Math.floor(gx)), j = Math.min(this.rows - 2, Math.floor(gy))
    const fx = gx - i, fy = gy - j
    const k = j * this.w + i
    const p = this.phi
    return (p[k]! * (1 - fx) + p[k + 1]! * fx) * (1 - fy) + (p[k + this.w]! * (1 - fx) + p[k + this.w + 1]! * fx) * fy
  }

  /** Unit direction of steepest increase (into the region) at (x, y); undefined where the field is flat. */
  gradient(x: number, y: number): Vec2 | undefined {
    const e = this.h * 0.5
    const gx = this.at(x + e, y) - this.at(x - e, y), gy = this.at(x, y + e) - this.at(x, y - e)
    const m = Math.hypot(gx, gy)
    return m < 1e-9 ? undefined : { x: gx / m, y: gy / m }
  }
}

// ---------------------------------------------------------------- the clearing

interface Entry {
  /** Where the tool arrives at the cutting depth before it follows `points`. */
  readonly at: Vec2
  readonly helix?: { readonly centre: Vec2; readonly clockwise: boolean }
}

interface Run {
  readonly entry: Entry
  readonly points: Vec2[]
  /** The tool may travel to `entry.at` at depth from the end of the previous run. */
  readonly stayDown: boolean
}

const MAX_NODES = 1_200_000

/**
 * Plans the runs that clear a region of tool centres with a tool of radius `R` at a given engagement; pure, no moves.
 *
 * To remove a strip of width ae beyond the front of the stock in process, the centre must stand R - ae from the stock: the centre
 * line of every pass is the level set `distance to uncut stock = R - ae`, which is traced exactly (marching squares on the
 * distance field), cut where the centre may not go, and cut. The stock is then updated and the next level set is a pass nearer the
 * walls. Nothing is steered, so there is nothing to lose track of: islands, walls and corners are all just stock and region.
 */
const plan = (rings: ReadonlyArray<ReadonlyArray<Vec2>>, R: number, engagementPct: number, diameter: number, climb: boolean, material: ((x: number, y: number) => boolean) | undefined, helix: boolean) => {
  const warnings: string[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of rings[0]!) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
  // The raster must resolve the cut itself: a pass of radial depth ae is only a few nodes thick unless h is a fraction of ae.
  const target = Math.min((engagementPct / 100) * diameter, 2 * R)
  let h = Math.max(Math.min(R / 12, target / 5), R / 80)
  while (((maxX - minX + 2 * (R + 3 * h)) / h + 1) * ((maxY - minY + 2 * (R + 3 * h)) / h + 1) > MAX_NODES) h *= 1.1
  const cap = R + 2 * h
  const x0 = minX - cap - h, y0 = minY - cap - h
  const nx = Math.ceil((maxX - minX + 2 * (cap + h)) / h), ny = Math.ceil((maxY - minY + 2 * (cap + h)) / h)
  const field = new Field(rings, x0, y0, nx, ny, h, cap)
  const { w, rows } = field

  const uncut = new Uint8Array(w * rows)
  let uncutCount = 0
  for (let k = 0; k < uncut.length; k++) {
    if (field.phi[k]! >= -(R - 0.25 * h) && (material === undefined || material(x0 + (k % w) * h, y0 + Math.floor(k / w) * h))) { uncut[k] = 1; uncutCount++ }
  }
  const initial = uncutCount
  // Uncut nodes per BxB block, so a disc over cleared ground costs nothing and a block wholly inside the disc is added in one go.
  const B = 8
  const bw = Math.ceil(w / B)
  const blocks = new Int32Array(bw * Math.ceil(rows / B))
  for (let k = 0; k < uncut.length; k++) if (uncut[k] === 1) blocks[Math.floor(Math.floor(k / w) / B) * bw + Math.floor((k % w) / B)]!++

  const eps = 0.02 * h
  const feasible = (x: number, y: number): boolean => field.at(x, y) >= -eps
  /** Removes the disc of the tool at (x, y) from the stock in process; returns how many nodes it cleared. */
  const clear = (cx: number, cy: number): number => {
    const i0 = Math.max(0, Math.floor((cx - R - x0) / h)), i1 = Math.min(w - 1, Math.ceil((cx + R - x0) / h))
    const j0 = Math.max(0, Math.floor((cy - R - y0) / h)), j1 = Math.min(rows - 1, Math.ceil((cy + R - y0) / h))
    let n = 0
    const R2 = R * R
    for (let j = j0; j <= j1; j++) {
      const dy = y0 + j * h - cy
      for (let i = i0; i <= i1; i++) {
        const k = j * w + i
        if (uncut[k] === 0) continue
        const dx = x0 + i * h - cx
        if (dx * dx + dy * dy <= R2) { uncut[k] = 0; blocks[Math.floor(j / B) * bw + Math.floor(i / B)]!--; n++ }
      }
    }
    uncutCount -= n
    return n
  }
  /** How many uncut nodes lie within `radius` of (x, y). */
  const uncutWithin = (cx: number, cy: number, radius: number): number => {
    const i0 = Math.max(0, Math.floor((cx - radius - x0) / h)), i1 = Math.min(w - 1, Math.ceil((cx + radius - x0) / h))
    const j0 = Math.max(0, Math.floor((cy - radius - y0) / h)), j1 = Math.min(rows - 1, Math.ceil((cy + radius - y0) / h))
    const r2 = radius * radius
    let n = 0
    for (let bj = Math.floor(j0 / B); bj <= Math.floor(j1 / B); bj++) {
      for (let bi = Math.floor(i0 / B); bi <= Math.floor(i1 / B); bi++) {
        const cnt = blocks[bj * bw + bi]!
        if (cnt === 0) continue
        const ia = bi * B, ib = Math.min(w - 1, ia + B - 1), ja = bj * B, jb = Math.min(rows - 1, ja + B - 1)
        // Farthest corner of the block from the centre: if even that is inside, the whole block is.
        const fx = Math.max(Math.abs(x0 + ia * h - cx), Math.abs(x0 + ib * h - cx)), fy = Math.max(Math.abs(y0 + ja * h - cy), Math.abs(y0 + jb * h - cy))
        if (fx * fx + fy * fy <= r2) { n += cnt; continue }
        for (let j = Math.max(ja, j0); j <= Math.min(jb, j1); j++) {
          const dy = y0 + j * h - cy
          for (let i = Math.max(ia, i0); i <= Math.min(ib, i1); i++) {
            if (uncut[j * w + i] === 0) continue
            const dx = x0 + i * h - cx
            if (dx * dx + dy * dy <= r2) n++
          }
        }
      }
    }
    return n
  }
  const step = Math.max(h, 0.1 * R)
  /** Width of the strip a cutter at (cx, cy) removes with a move of `len`: the uncut area inside its disc over that length (mm). */
  const widthAt = (cx: number, cy: number, len: number): number => (uncutWithin(cx, cy, R) * h * h) / Math.max(len, h)
  const minCells = Math.max(6, Math.round(0.02 * Math.PI * (R / h) ** 2))

  const stats = { runs: 0, steps: 0, overloaded: 0, peak: 0, slivers: 0, plunges: 0 }
  const runs: Run[] = []
  let end: Vec2 | undefined

  /** A light, feasible straight link at depth from `a` to `b`. */
  const linkOk = (a: Vec2, b: Vec2): boolean => {
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > 8 * diameter) return false
    const n = Math.max(1, Math.ceil(len / (0.25 * R)))
    for (let i = 0; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n
      if (!feasible(x, y) || widthAt(x, y, 0.25 * R) > 1.5 * target) return false
    }
    return true
  }

  // ---- first entry: a helix where there is most room (the deepest nodes tie, the field being capped; take the one nearest their
  // centroid). Without it (rest machining) the stock lies in free air that the previous tool cleared: it is peeled from outside,
  // and nothing is plunged into.
  if (helix) {
    let top = -Infinity
    for (let k = 0; k < field.phi.length; k++) if (uncut[k] === 1 && field.phi[k]! > top) top = field.phi[k]!
    let sx = 0, sy = 0, sn = 0
    for (let k = 0; k < field.phi.length; k++) if (uncut[k] === 1 && field.phi[k]! >= top - 1e-9) { sx += x0 + (k % w) * h; sy += y0 + Math.floor(k / w) * h; sn++ }
    if (sn === 0) return { runs, warnings, stats: { ...stats, left: 0, uncutInitial: initial } }
    // The deepest uncut node must be a place the centre may stand: when all the stock lies outside the region (a band narrower
    // than the tool round a part), a helix or plunge there would put the cutter into the part; the runs then enter from the side.
    if (top >= 0) {
      let best = -1, bd = Infinity
      for (let k = 0; k < field.phi.length; k++) {
        if (uncut[k] !== 1 || field.phi[k]! < top - 1e-9) continue
        const d = (x0 + (k % w) * h - sx / sn) ** 2 + (y0 + Math.floor(k / w) * h - sy / sn) ** 2
        if (d < bd) { bd = d; best = k }
      }
      const c: Vec2 = { x: x0 + (best % w) * h, y: y0 + Math.floor(best / w) * h }
      let rh = Math.min(0.6 * R, 0.9 * Math.max(0, field.at(c.x, c.y)))
      let entry: Entry
      if (rh >= 0.25 * R) entry = { at: { x: c.x + rh, y: c.y }, helix: { centre: c, clockwise: climb } }
      else { rh = 0; stats.plunges++; entry = { at: c } }
      for (let k = 0; rh > 0 && k < 24; k++) clear(c.x + rh * Math.cos((2 * Math.PI * k) / 24), c.y + rh * Math.sin((2 * Math.PI * k) / 24))
      clear(c.x, c.y)
      runs.push({ entry, points: [c], stayDown: false })
      stats.runs++
      end = c
    }
  }

  /** Splits a closed loop into the pieces where the centre may stand; a loop wholly feasible stays closed (first point repeated). */
  const clip = (loop: ReadonlyArray<Vec2>): Vec2[][] => {
    const n = loop.length
    const ok = loop.map((p) => feasible(p.x, p.y))
    if (ok.every(Boolean)) return [[...loop, loop[0]!]]
    const first = ok.findIndex((v) => !v)
    // Where the segment from an infeasible point `a` to a feasible one `b` crosses the edge of the region.
    const crossing = (a: Vec2, b: Vec2): Vec2 => {
      let lo = 0, hi = 1
      for (let it = 0; it < 14; it++) {
        const m = (lo + hi) / 2
        if (feasible(a.x + (b.x - a.x) * m, a.y + (b.y - a.y) * m)) hi = m
        else lo = m
      }
      return { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi }
    }
    const pieces: Vec2[][] = []
    let cur: Vec2[] = []
    for (let i = 1; i <= n; i++) {
      const prev = (first + i - 1) % n, k = (first + i) % n
      if (ok[k]) {
        if (cur.length === 0) cur.push(crossing(loop[prev]!, loop[k]!))
        cur.push(loop[k]!)
      } else if (cur.length > 0) {
        const last = cur[cur.length - 1]!
        cur.push(crossing(loop[k]!, last))
        pieces.push(cur)
        cur = []
      }
    }
    if (cur.length > 0) pieces.push(cur)
    return pieces
  }

  const valueOf = (d: Float64Array) => (x: number, y: number): number => {
    const gx = Math.min(w - 1 - 1e-9, Math.max(0, (x - x0) / h)), gy = Math.min(rows - 1 - 1e-9, Math.max(0, (y - y0) / h))
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j
    const a = d[j * w + i]!, b = d[j * w + i + 1]!, c = d[(j + 1) * w + i]!, e = d[(j + 1) * w + i + 1]!
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy
  }
  const rect = { x0, y0, x1: x0 + (w - 1) * h, y1: y0 + (rows - 1) * h }

  /** A traced contour cuts the corner of a concave corner of the region with a chord; push such a point back to where a centre may be. */
  const repair = (p: Vec2): Vec2 => {
    let q = p
    for (let it = 0; it < 4 && !feasible(q.x, q.y); it++) {
      const g = field.gradient(q.x, q.y)
      if (g === undefined) break
      const push = -field.at(q.x, q.y) + 0.1 * eps
      q = { x: q.x + g.x * push, y: q.y + g.y * push }
    }
    return q
  }
  /** Points `step` apart along a polyline (ends kept). */
  const resample = (pts: ReadonlyArray<Vec2>): Vec2[] => {
    const out: Vec2[] = [pts[0]!]
    let carry = 0
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      let at = step - carry
      while (at <= len) { out.push({ x: a.x + ((b.x - a.x) * at) / len, y: a.y + ((b.y - a.y) * at) / len }); at += step }
      carry = len - (at - step)
    }
    const last = pts[pts.length - 1]!, tail = out[out.length - 1]!
    if (Math.hypot(last.x - tail.x, last.y - tail.y) > 1e-9) out.push(last)
    return out.map(repair)
  }

  const negPhi = Float64Array.from(field.phi, (v) => -v)
  const maxRings = 4000
  for (let ring = 0; ring < maxRings && uncutCount > minCells; ring++) {
    const dist = distanceTo(uncut, w, rows, h, h)
    // Normally the pass that removes `target`; when that finds nothing the centre may not stand there, and the lightest pass that
    // can be made is taken instead (a deeper cut, never a skipped one).
    let pieces: Vec2[][] = []
    for (let t = 1; pieces.length === 0 && t * target <= 2 * R + 1e-9; t++) {
      const level = Math.max(R - t * target, 0.5 * h)
      const loops = contour(valueOf(dist), level, rect, h * (1 + 1e-9), true, dist)
      pieces = loops.flatMap(clip).filter((p) => p.length >= 3)
      for (const piece of pieces) {
        // Closed loops run with the deep side on their left, so the stock is on the right: climb milling. Conventional is the reverse.
        if (!climb) piece.reverse()
      }
    }
    if (pieces.length === 0) {
      // No level of the stock can be reached by a centre, yet stock is within reach of the region's edge: it is thinner than the
      // passes this tool can step in. The last resort is one pass along the edge of the region itself, which takes what is left.
      const loops = contour((x, y) => -field.at(x, y), 0, rect, h * (1 + 1e-9), true, negPhi)
      pieces = loops.flatMap(clip).filter((p) => p.length >= 3)
      for (const piece of pieces) if (climb) piece.reverse() // these run with the outside (the stock) on the left
    }
    if (pieces.length === 0) break
    const before = uncutCount
    const remaining = pieces.map((p) => resample(p))
    while (remaining.length > 0) {
      let bi = 0, bd = Infinity
      remaining.forEach((p, i) => { const d = end === undefined ? 0 : Math.hypot(p[0]!.x - end.x, p[0]!.y - end.y); if (d < bd) { bd = d; bi = i } })
      const [piece] = remaining.splice(bi, 1)
      // Start in the air, a little back from the stock, so the tool is not plunged into the strip it is about to take.
      const first = piece![0]!
      const d0 = valueOf(dist)
      const gx = d0(first.x + h, first.y) - d0(first.x - h, first.y), gy = d0(first.x, first.y + h) - d0(first.x, first.y - h)
      const gl = Math.hypot(gx, gy)
      const back = { x: first.x + (gl > 1e-9 ? gx / gl : 0) * (target + 2 * h), y: first.y + (gl > 1e-9 ? gy / gl : 0) * (target + 2 * h) }
      const air = gl > 1e-9 && feasible(back.x, back.y) && uncutWithin(back.x, back.y, 0.95 * R) === 0
      const entry: Entry = { at: air ? back : first }
      const points = air ? [back, ...piece!] : piece!
      const stayDown = end !== undefined && linkOk(end, entry.at)
      let prev: Vec2 | undefined
      for (const p of points) {
        const len = prev === undefined ? step : Math.hypot(p.x - prev.x, p.y - prev.y)
        const width = widthAt(p.x, p.y, len)
        stats.steps++
        if (width > target * 1.05) stats.overloaded++
        stats.peak = Math.max(stats.peak, width / target)
        clear(p.x, p.y)
        prev = p
      }
      runs.push({ entry, points, stayDown })
      stats.runs++
      end = points[points.length - 1]
    }
    if (uncutCount === before) break
  }
  if (uncutCount > minCells) warnings.push(`${uncutCount} raster node(s) of stock are left that no pass reached; the next operation takes them.`)
  stats.slivers = uncutCount
  return { runs, warnings, stats: { ...stats, left: uncutCount, uncutInitial: initial } }
}

// ---------------------------------------------------------------- the operation

export interface AdaptiveOptions {
  /** Where there is stock to take; the default is everything within a tool radius of the region. */
  readonly material?: (x: number, y: number) => boolean
  /** Enter the first run with a helix. The default is yes unless `material` is given (rest machining peels stock from free air). */
  readonly helix?: boolean
}

export const generateAdaptive = (params: AdaptiveParams, geometry: RegionInput, tool: Tool, stock: Stock, options: AdaptiveOptions = {}): AdaptiveResult => {
  const levels = levelsOf(params, stock.origin.z)
  const b = new MoveBuilder()
  b.comment(`Adaptive clearing: ${params.name}`)
  const empty: AdaptiveStats = { runs: 0, steps: 0, overloaded: 0, peak: 0, left: 0, slivers: 0, plunges: 0 }
  const done = (warnings: ReadonlyArray<string>, stats: AdaptiveStats): AdaptiveResult => {
    finish(b, levels)
    return { toolpath: { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves: b.moves }, warnings, stats }
  }
  const region = regionOf(geometry, params.tolerance)
  if (region === undefined) {
    b.comment("nothing to cut: no closed boundary")
    return done([], empty)
  }
  const R = toolRadius(tool)
  const planned = plan([region.boundary, ...region.islands], R, params.engagement, tool.diameter, params.climb, options.material, options.helix ?? options.material === undefined)
  if (planned.runs.length === 0) {
    b.comment("nothing to cut: the region leaves no material within reach of the tool")
    return done(planned.warnings, { ...planned.stats, runs: 0 })
  }
  const runs = planned.runs.map((r) => ({ ...r, points: simplify(r.points, params.tolerance, false) }))
  levels.passZ.forEach((z, j) => {
    const zPrev = j === 0 ? levels.entryZ : levels.passZ[j - 1]!
    runs.forEach((run, i) => {
      const A = run.entry.at
      if (i > 0 && run.stayDown && b.started && Math.abs(b.pos.z - z) < 1e-9) {
        b.linear({ x: A.x, y: A.y, z }, params.feed)
      } else {
        if (b.started) liftTo(b, levels.retractZ)
        approach(b, A, levels)
        if (j === 0) b.rapid({ x: A.x, y: A.y, z: levels.entryZ })
        else {
          // Everything above the previous floor was cleared by the previous pass along this very plan.
          b.rapid({ x: A.x, y: A.y, z: Math.max(levels.entryZ, zPrev) })
          b.linear({ x: A.x, y: A.y, z: zPrev }, params.feed)
        }
        if (run.entry.helix !== undefined) helixDown(b, run.entry.helix.centre, run.entry.helix.clockwise, zPrev, z, params.helixPitch, params.plungeFeed)
        else b.linear({ x: A.x, y: A.y, z }, params.plungeFeed)
      }
      for (const p of run.points) b.linear({ x: p.x, y: p.y, z }, params.feed)
    })
  })
  liftTo(b, levels.retractZ)
  return done(planned.warnings, planned.stats)
}

export const Adaptive = { Params: AdaptiveParams, generate: generateAdaptive } as const
