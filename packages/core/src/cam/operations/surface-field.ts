/**
 * The mathematics under the 3D strategies: the finished surface as a height field, what a tool does on it, and the contour lines of
 * that.
 *
 * - `Surface.tip(tool, x, y)` is the drop-cutter: the lowest height of the tool tip at (x, y) with no part of the cutter inside the
 *   surface, `max over the footprint of (surface height - cutter profile)`. Columns are sampled at their centres and the footprint is
 *   widened by half a cell diagonal, so the answer is never below the true one: a path built on it does not gouge.
 * - `contour` traces the line where a function of (x, y) crosses a level (marching squares), with each crossing refined by
 *   bisection on the function itself, so the line is as accurate as the function and not as coarse as the grid. Segments are
 *   oriented with the "forbidden" side on the left of travel, which is what makes climb and conventional cutting a choice of
 *   direction rather than a guess.
 */
import { signedArea } from "../../cad/shapes.ts"
import type { Vec2 } from "../../cad/vec.ts"
import type { Grid } from "../model/dexel.ts"
import { toolModel } from "../verify/tool-model.ts"
import type { Tool } from "../tool.ts"

/**
 * A cutter as the surface strategies see it: the radius it sweeps, the height of its profile above the tip at radius r, and how
 * far its tip sits above the lowest point of the body that is tested against the part (`lift`, non-zero with an allowance).
 */
export interface Cutter {
  readonly radius: number
  readonly profile: (r: number) => number
  readonly flat: boolean
  readonly lift: number
}

/**
 * The cutter of `tool`; with `allowance` > 0 its body is grown by that much in every direction, so a path computed with it stays
 * `allowance` away from the part: material left on walls and floors alike (stock to leave). A V-bit or a drill has no
 * allowance model; they are used as they are.
 */
export const cutterOf = (tool: Tool, allowance = 0): Cutter => {
  const R = tool.diameter / 2
  if (tool.kind === "vbit" || tool.kind === "drill") {
    const m = toolModel({ kind: tool.kind, diameter: tool.diameter, ...(tool.angle !== undefined ? { angle: tool.angle } : {}) })
    return { radius: m.radius, profile: m.profile, flat: false, lift: 0 }
  }
  const corner = tool.kind === "ballnose" ? R : Math.min(tool.tipRadius ?? 0, R)
  const a = Math.max(0, allowance)
  const Rg = R + a, c = corner + a
  const inner = Rg - c
  return {
    radius: Rg,
    flat: c === 0,
    lift: a,
    profile: c === 0 ? () => 0 : (r) => (r <= inner ? 0 : c - Math.sqrt(Math.max(0, c * c - (r - inner) * (r - inner))))
  }
}

export class Surface {
  constructor(readonly grid: Grid, /** Top of the part per column, -Infinity where there is none. */ readonly height: Float64Array) {}

  private box: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } | undefined
  /** Extent in XY of the columns that hold material (undefined when there is none). */
  materialBox(): { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } | undefined {
    if (this.box !== undefined) return this.box
    const { nx, ny, minX, minY, cellX, cellY } = this.grid
    let i0 = nx, i1 = -1, j0 = ny, j1 = -1
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (this.height[j * nx + i]! !== -Infinity) {
      if (i < i0) i0 = i
      if (i > i1) i1 = i
      if (j < j0) j0 = j
      if (j > j1) j1 = j
    }
    if (i1 < 0) return undefined
    this.box = { x0: minX + i0 * cellX, y0: minY + j0 * cellY, x1: minX + (i1 + 1) * cellX, y1: minY + (j1 + 1) * cellY }
    return this.box
  }

  /** Column holding (x, y), or -1 outside the grid. */
  column(x: number, y: number): number {
    const i = Math.floor((x - this.grid.minX) / this.grid.cellX), j = Math.floor((y - this.grid.minY) / this.grid.cellY)
    return i < 0 || j < 0 || i >= this.grid.nx || j >= this.grid.ny ? -1 : j * this.grid.nx + i
  }

  /** Height of the part at (x, y); -Infinity outside the part. */
  at(x: number, y: number): number {
    const k = this.column(x, y)
    return k < 0 ? -Infinity : this.height[k]!
  }

  /**
   * Lowest tip height of `cutter` at (x, y) that does not cut into the part; -Infinity when no part is under the cutter.
   *
   * Each column is a square of material of its own height. Its distance to the axis is measured from the exact (x, y), and
   * reduced by half a cell (the nearest point of the column), so the answer errs on the safe side by at most the slope times
   * half a cell, never on the gouging side.
   */
  tip(cutter: Cutter, x: number, y: number): number {
    const { nx, ny, minX, minY, cellX, cellY } = this.grid
    // Nothing of the part within reach of this position: no need to look at a single column.
    const box = this.materialBox()
    const reach = cutter.radius + Math.hypot(cellX, cellY)
    if (box === undefined || x < box.x0 - reach || x > box.x1 + reach || y < box.y0 - reach || y > box.y1 + reach) return -Infinity
    const gx = (x - minX) / cellX, gy = (y - minY) / cellY
    const half = 0.5 * Math.min(cellX, cellY)
    const R = cutter.radius
    const rx = Math.ceil(reach / cellX), ry = Math.ceil(reach / cellY)
    const ci = Math.floor(gx), cj = Math.floor(gy)
    const i0 = Math.max(0, ci - rx), i1 = Math.min(nx - 1, ci + rx)
    const j0 = Math.max(0, cj - ry), j1 = Math.min(ny - 1, cj + ry)
    const bmax = this.blockMax()
    const bnx = Math.ceil(nx / BLOCK)
    let best = -Infinity
    // A real column near the axis gives a lower bound immediately. Starting at -Infinity makes a ball cutter scan
    // progressively closer columns before it can reject any blocks, even on a flat surface.
    const si = Math.max(i0, Math.min(i1, ci)), sj = Math.max(j0, Math.min(j1, cj))
    if (si <= i1 && sj <= j1) {
      const ox = (si + 0.5 - gx) * cellX, oy = (sj + 0.5 - gy) * cellY
      const d = Math.sqrt(ox * ox + oy * oy) - half
      if (d <= R) {
        const candidate = this.height[sj * nx + si]! - cutter.profile(d > 0 ? d : 0)
        if (candidate > best) best = candidate
      }
    }
    for (let bj = Math.floor(j0 / BLOCK); bj <= Math.floor(j1 / BLOCK); bj++) {
      // Nearest the block's rows come to the axis along y (distance between cell centres, 0 when the axis is inside).
      const ja = Math.max(j0, bj * BLOCK), jb = Math.min(j1, bj * BLOCK + BLOCK - 1)
      const dyMin = gy < ja + 0.5 ? (ja + 0.5 - gy) * cellY : gy > jb + 0.5 ? (gy - jb - 0.5) * cellY : 0
      for (let bi = Math.floor(i0 / BLOCK); bi <= Math.floor(i1 / BLOCK); bi++) {
        const top = bmax[bj * bnx + bi]!
        // The profile never falls with the distance, so nothing in this block can beat `top - profile(nearest distance)`.
        if (top <= best) continue
        const ia = Math.max(i0, bi * BLOCK), ib = Math.min(i1, bi * BLOCK + BLOCK - 1)
        const dxMin = gx < ia + 0.5 ? (ia + 0.5 - gx) * cellX : gx > ib + 0.5 ? (gx - ib - 0.5) * cellX : 0
        const dBlock = Math.sqrt(dxMin * dxMin + dyMin * dyMin) - half
        if (dBlock > R) continue
        if (top - cutter.profile(dBlock > 0 ? dBlock : 0) <= best) continue
        for (let j = ja; j <= jb; j++) {
          const oy = (j + 0.5 - gy) * cellY
          const row = j * nx
          for (let i = ia; i <= ib; i++) {
            const v = this.height[row + i]!
            // The profile is never negative, so a column no higher than the best tip so far cannot raise it.
            if (v <= best) continue
            const ox = (i + 0.5 - gx) * cellX
            const d = Math.sqrt(ox * ox + oy * oy) - half
            if (d > R) continue
            const t = v - cutter.profile(d > 0 ? d : 0)
            if (t > best) best = t
          }
        }
      }
    }
    return best === -Infinity ? best : best + cutter.lift
  }

  private blocks: Float64Array | undefined
  /** Highest column of every BLOCK x BLOCK group of columns (-Infinity where empty), for rejecting whole groups in `tip`. */
  private blockMax(): Float64Array {
    if (this.blocks !== undefined) return this.blocks
    const { nx, ny } = this.grid
    const bnx = Math.ceil(nx / BLOCK), bny = Math.ceil(ny / BLOCK)
    const out = new Float64Array(bnx * bny).fill(-Infinity)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = this.height[j * nx + i]!
      const k = Math.floor(j / BLOCK) * bnx + Math.floor(i / BLOCK)
      if (v > out[k]!) out[k] = v
    }
    this.blocks = out
    return out
  }
}

const BLOCK = 8

// ---------------------------------------------------------------- contour lines

export interface Rect { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }

/** Node counts of the contour grid over `rect` at spacing `step`. */
export const nodeGrid = (rect: Rect, step: number): { readonly nx: number; readonly ny: number; readonly dx: number; readonly dy: number } => {
  const nx = Math.max(2, Math.ceil((rect.x1 - rect.x0) / step)), ny = Math.max(2, Math.ceil((rect.y1 - rect.y0) / step))
  return { nx, ny, dx: (rect.x1 - rect.x0) / nx, dy: (rect.y1 - rect.y0) / ny }
}

/** `value` at every node of the contour grid (row-major, (nx+1) per row); a level-independent cache shared by all levels. */
export const sampleNodes = (value: (x: number, y: number) => number, rect: Rect, step: number): Float64Array => {
  const { nx, ny, dx, dy } = nodeGrid(rect, step)
  const out = new Float64Array((nx + 1) * (ny + 1))
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) out[j * (nx + 1) + i] = value(rect.x0 + i * dx, rect.y0 + j * dy)
  return out
}

/**
 * Closed loops of the boundary of {value > level}, each oriented with that "forbidden" side on its LEFT. `value` must be pure and is
 * only asked for points inside `rect`; the nodes on the border of the rect are forced to `outside` (true = forbidden), which closes
 * every loop. `nodes` (from `sampleNodes`) avoids re-evaluating the nodes for every level; crossings are always refined on `value`.
 */
export const contour = (
  value: (x: number, y: number) => number,
  level: number,
  rect: Rect,
  step: number,
  outside: boolean,
  nodes?: Float64Array,
  resolution = step / 1024
): Vec2[][] => {
  const { nx, ny, dx, dy } = nodeGrid(rect, step)
  const forbiddenAt = (x: number, y: number): boolean => value(x, y) > level
  const state = new Uint8Array((nx + 1) * (ny + 1))
  const node = (i: number, j: number): number => j * (nx + 1) + i
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const border = i === 0 || j === 0 || i === nx || j === ny
    const v = nodes !== undefined ? nodes[node(i, j)]! : value(rect.x0 + i * dx, rect.y0 + j * dy)
    state[node(i, j)] = border ? (outside ? 1 : 0) : v > level ? 1 : 0
  }
  const iterations = Math.max(4, Math.min(20, Math.ceil(Math.log2(step / Math.max(resolution, 1e-9)))))
  const points = new Map<string, Vec2>()
  const cross = (key: string, ax: number, ay: number, bx: number, by: number, aForb: boolean): Vec2 => {
    const hit = points.get(key)
    if (hit !== undefined) return hit
    let lo = 0, hi = 1
    for (let it = 0; it < iterations; it++) {
      const mid = (lo + hi) / 2
      const x = ax + (bx - ax) * mid, y = ay + (by - ay) * mid
      const border = x <= rect.x0 || y <= rect.y0 || x >= rect.x1 || y >= rect.y1
      const f = border ? outside : forbiddenAt(x, y)
      if (f === aForb) lo = mid
      else hi = mid
    }
    const t = (lo + hi) / 2
    const p = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t }
    points.set(key, p)
    return p
  }
  const next = new Map<string, string>()
  const place = new Map<string, Vec2>()
  const link = (from: string, to: string, pf: Vec2, pt: Vec2): void => { next.set(from, to); place.set(from, pf); place.set(to, pt) }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = state[node(i, j)]!, b = state[node(i + 1, j)]!, c = state[node(i + 1, j + 1)]!, d = state[node(i, j + 1)]!
    const code = a | (b << 1) | (c << 2) | (d << 3)
    if (code === 0 || code === 15) continue
    const x0 = rect.x0 + i * dx, y0 = rect.y0 + j * dy, x1 = x0 + dx, y1 = y0 + dy
    const kB = `h${i},${j}`, kT = `h${i},${j + 1}`, kL = `v${i},${j}`, kR = `v${i + 1},${j}`
    const B = (): Vec2 => cross(kB, x0, y0, x1, y0, a === 1)
    const T = (): Vec2 => cross(kT, x0, y1, x1, y1, d === 1)
    const L = (): Vec2 => cross(kL, x0, y0, x0, y1, a === 1)
    const R = (): Vec2 => cross(kR, x1, y0, x1, y1, b === 1)
    const seg = (fk: string, f: () => Vec2, tk: string, t: () => Vec2): void => link(fk, tk, f(), t())
    switch (code) {
      case 1: seg(kB, B, kL, L); break
      case 2: seg(kR, R, kB, B); break
      case 4: seg(kT, T, kR, R); break
      case 8: seg(kL, L, kT, T); break
      case 14: seg(kL, L, kB, B); break
      case 13: seg(kB, B, kR, R); break
      case 11: seg(kR, R, kT, T); break
      case 7: seg(kT, T, kL, L); break
      case 3: seg(kR, R, kL, L); break
      case 12: seg(kL, L, kR, R); break
      case 6: seg(kT, T, kB, B); break
      case 9: seg(kB, B, kT, T); break
      case 5:
      case 10: {
        const centre = forbiddenAt((x0 + x1) / 2, (y0 + y1) / 2)
        if (code === 5) {
          if (centre) { seg(kB, B, kR, R); seg(kT, T, kL, L) } else { seg(kB, B, kL, L); seg(kT, T, kR, R) }
        } else if (centre) { seg(kL, L, kB, B); seg(kR, R, kT, T) } else { seg(kR, R, kB, B); seg(kL, L, kT, T) }
        break
      }
    }
  }
  const loops: Vec2[][] = []
  const seen = new Set<string>()
  for (const start of next.keys()) {
    if (seen.has(start)) continue
    const loop: Vec2[] = []
    let k: string | undefined = start
    let closed = false
    while (k !== undefined && !seen.has(k)) {
      seen.add(k)
      loop.push(place.get(k)!)
      k = next.get(k)
      if (k === start) { closed = true; break }
    }
    if (closed && loop.length >= 3) loops.push(loop)
  }
  return loops
}

/** Douglas-Peucker on a closed ring (kept simple: split at the two farthest points) or an open chain. */
export const simplify = (pts: ReadonlyArray<Vec2>, tolerance: number, closed: boolean): Vec2[] => {
  if (pts.length <= (closed ? 3 : 2)) return [...pts]
  const keep = new Uint8Array(pts.length)
  const run = (lo: number, hi: number): void => {
    const stack: Array<[number, number]> = [[lo, hi]]
    while (stack.length > 0) {
      const [a, b] = stack.pop()!
      let worst = -1, wi = -1
      const pa = pts[a]!, pb = pts[b]!
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y)
      for (let i = a + 1; i < b; i++) {
        const p = pts[i]!
        const d = len < 1e-12 ? Math.hypot(p.x - pa.x, p.y - pa.y) : Math.abs((pb.x - pa.x) * (pa.y - p.y) - (pa.x - p.x) * (pb.y - pa.y)) / len
        if (d > worst) { worst = d; wi = i }
      }
      if (worst > tolerance && wi > 0) { keep[wi] = 1; stack.push([a, wi], [wi, b]) }
    }
  }
  if (!closed) {
    keep[0] = 1; keep[pts.length - 1] = 1
    run(0, pts.length - 1)
  } else {
    // Anchor at the point farthest from the first, then simplify the two halves.
    let far = 0, fd = -1
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i]!.x - pts[0]!.x, pts[i]!.y - pts[0]!.y); if (d > fd) { fd = d; far = i } }
    keep[0] = 1; keep[far] = 1
    run(0, far)
    const tail = [...pts.slice(far), pts[0]!]
    const sub = simplify(tail, tolerance, false)
    const out = pts.slice(0, far + 1).filter((_, i) => keep[i] === 1)
    return [...out, ...sub.slice(1, -1)]
  }
  return pts.filter((_, i) => keep[i] === 1)
}

/** 3D version for a sampled path: drops points whose removal moves the path less than `tolerance`. */
export const simplify3 = (pts: ReadonlyArray<readonly [number, number, number]>, tolerance: number): Array<readonly [number, number, number]> => {
  if (pts.length <= 2) return [...pts]
  const keep = new Uint8Array(pts.length)
  keep[0] = 1; keep[pts.length - 1] = 1
  const stack: Array<[number, number]> = [[0, pts.length - 1]]
  while (stack.length > 0) {
    const [a, b] = stack.pop()!
    const pa = pts[a]!, pb = pts[b]!
    const vx = pb[0] - pa[0], vy = pb[1] - pa[1], vz = pb[2] - pa[2]
    const len2 = vx * vx + vy * vy + vz * vz
    let worst = -1, wi = -1
    for (let i = a + 1; i < b; i++) {
      const p = pts[i]!
      const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p[0] - pa[0]) * vx + (p[1] - pa[1]) * vy + (p[2] - pa[2]) * vz) / len2))
      const d = Math.hypot(p[0] - (pa[0] + vx * t), p[1] - (pa[1] + vy * t), p[2] - (pa[2] + vz * t))
      if (d > worst) { worst = d; wi = i }
    }
    if (worst > tolerance && wi > 0) { keep[wi] = 1; stack.push([a, wi], [wi, b]) }
  }
  return pts.filter((_, i) => keep[i] === 1)
}

export interface Nest { readonly boundary: Vec2[]; readonly islands: Vec2[][] }

const inside = (p: Vec2, ring: ReadonlyArray<Vec2>): boolean => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/**
 * Groups loops of a feasible region into outer boundaries with their holes. With the forbidden side on the left, the feasible
 * region is on the right: its outer boundaries run clockwise (negative area) and the islands inside it counter-clockwise.
 */
export const nest = (loops: ReadonlyArray<Vec2[]>): Nest[] => {
  const outers = loops.filter((l) => signedArea(l) < 0)
  const holes = loops.filter((l) => signedArea(l) > 0)
  const groups = outers.map((boundary) => ({ boundary, islands: [] as Vec2[][], area: Math.abs(signedArea(boundary)) }))
  for (const hole of holes) {
    let best: (typeof groups)[number] | undefined
    for (const g of groups) if (inside(hole[0]!, g.boundary) && (best === undefined || g.area < best.area)) best = g
    best?.islands.push(hole)
  }
  return groups.map(({ boundary, islands }) => ({ boundary, islands }))
}
