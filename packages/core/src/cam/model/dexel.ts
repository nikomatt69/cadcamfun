/**
 * Z-dexel model: the solid as vertical rays. Every column of a regular XY grid holds the sorted, disjoint intervals of Z that are
 * inside the material. Unlike a height field it keeps holes, undercuts and several bodies in one column, and union, difference and
 * intersection are exact interval operations per column, which is what a boolean of CAD solids needs.
 *
 * A closed triangle mesh fills it by casting each column's ray against the triangles and pairing the hits (enter, leave). Sample
 * positions are shifted by a tiny irrational fraction of a cell so a ray never lands exactly on an edge or vertex of an
 * axis-aligned mesh, which would count a hit twice.
 *
 * For 3-axis machining the visible surface is the top of each column (`top`); everything that is cut from above lowers it.
 */
import type { Mesh64 } from "./element-mesh.ts"

export interface Grid {
  readonly minX: number
  readonly minY: number
  readonly nx: number
  readonly ny: number
  readonly cellX: number
  readonly cellY: number
}

/** A grid over `[minX,maxX] x [minY,maxY]` with square cells of about `cell` mm, never more than `maxCells` columns. */
export const gridFor = (minX: number, minY: number, maxX: number, maxY: number, cell: number, maxCells = 1_500_000): Grid => {
  const w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6)
  let c = Math.max(cell, 1e-6)
  while ((Math.ceil(w / c) + 1) * (Math.ceil(h / c) + 1) > maxCells) c *= 1.1
  const nx = Math.max(1, Math.ceil(w / c)), ny = Math.max(1, Math.ceil(h / c))
  return { minX, minY, nx, ny, cellX: w / nx, cellY: h / ny }
}

const JITTER_X = 0.2360679775, JITTER_Y = 0.1415926536

type Intervals = Float64Array

const EMPTY: Intervals = new Float64Array(0)
const EPS = 1e-9

const merge = (a: Intervals, b: Intervals): Intervals => {
  if (a.length === 0) return b
  if (b.length === 0) return a
  const all: Array<[number, number]> = []
  for (let i = 0; i < a.length; i += 2) all.push([a[i]!, a[i + 1]!])
  for (let i = 0; i < b.length; i += 2) all.push([b[i]!, b[i + 1]!])
  all.sort((p, q) => p[0] - q[0])
  const out: number[] = []
  let [lo, hi] = all[0]!
  for (let i = 1; i < all.length; i++) {
    const [l, h] = all[i]!
    if (l <= hi + EPS) hi = Math.max(hi, h)
    else { out.push(lo, hi); lo = l; hi = h }
  }
  out.push(lo, hi)
  return Float64Array.from(out)
}

const subtractIntervals = (a: Intervals, b: Intervals): Intervals => {
  if (a.length === 0 || b.length === 0) return a
  const out: number[] = []
  for (let i = 0; i < a.length; i += 2) {
    let lo = a[i]!
    const hi = a[i + 1]!
    for (let j = 0; j < b.length && lo < hi; j += 2) {
      const bl = b[j]!, bh = b[j + 1]!
      if (bh <= lo || bl >= hi) continue
      if (bl > lo) out.push(lo, bl)
      lo = Math.max(lo, bh)
    }
    if (lo < hi - EPS) out.push(lo, hi)
  }
  return Float64Array.from(out)
}

const intersectIntervals = (a: Intervals, b: Intervals): Intervals => {
  const out: number[] = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i]!, b[j]!), hi = Math.min(a[i + 1]!, b[j + 1]!)
    if (lo < hi - EPS) out.push(lo, hi)
    if (a[i + 1]! < b[j + 1]!) i += 2
    else j += 2
  }
  return Float64Array.from(out)
}

export class Dexels {
  constructor(readonly grid: Grid, readonly cols: ReadonlyArray<Intervals>) {}

  static empty(grid: Grid): Dexels {
    return new Dexels(grid, Array.from({ length: grid.nx * grid.ny }, () => EMPTY))
  }

  /** A solid box over the whole grid between two heights (a stock block). */
  static slab(grid: Grid, z0: number, z1: number): Dexels {
    return new Dexels(grid, Array.from({ length: grid.nx * grid.ny }, () => Float64Array.of(z0, z1)))
  }

  /** Fills the grid from a closed mesh. `unpaired` counts columns that had an odd number of hits (an open mesh). */
  static fromMesh(mesh: Mesh64, grid: Grid): { readonly dexels: Dexels; readonly unpaired: number } {
    const { nx, ny, cellX, cellY, minX, minY } = grid
    const hits: number[][] = new Array(nx * ny)
    const p = mesh.positions
    const ox = JITTER_X * cellX, oy = JITTER_Y * cellY
    for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
      const a = mesh.indices[t]! * 3, b = mesh.indices[t + 1]! * 3, c = mesh.indices[t + 2]! * 3
      const ax = p[a]!, ay = p[a + 1]!, az = p[a + 2]!
      const bx = p[b]!, by = p[b + 1]!, bz = p[b + 2]!
      const cx = p[c]!, cy = p[c + 1]!, cz = p[c + 2]!
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
      if (Math.abs(det) < 1e-15) continue
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX - ox) / cellX))
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - minX - ox) / cellX))
      const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - minY - oy) / cellY))
      const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - minY - oy) / cellY))
      for (let j = j0; j <= j1; j++) {
        const y = minY + (j + 0.5) * cellY + oy
        for (let i = i0; i <= i1; i++) {
          const x = minX + (i + 0.5) * cellX + ox
          const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det
          const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det
          const l3 = 1 - l1 - l2
          if (l1 < 0 || l2 < 0 || l3 < 0) continue
          const k = j * nx + i
          ;(hits[k] ??= []).push(l1 * az + l2 * bz + l3 * cz)
        }
      }
    }
    let unpaired = 0
    const cols = Array.from({ length: nx * ny }, (_, k): Intervals => {
      const h = hits[k]
      if (h === undefined) return EMPTY
      h.sort((u, v) => u - v)
      if (h.length % 2 === 1) { unpaired++; h.pop() }
      const out: number[] = []
      for (let q = 0; q < h.length; q += 2) if (h[q + 1]! - h[q]! > 1e-12) out.push(h[q]!, h[q + 1]!)
      return merge(Float64Array.from(out), EMPTY)
    })
    return { dexels: new Dexels(grid, cols), unpaired }
  }

  private zip(other: Dexels, op: (a: Intervals, b: Intervals) => Intervals): Dexels {
    if (other.grid.nx !== this.grid.nx || other.grid.ny !== this.grid.ny) throw new RangeError("Dexel grids differ")
    return new Dexels(this.grid, this.cols.map((c, k) => op(c, other.cols[k]!)))
  }
  union(other: Dexels): Dexels { return this.zip(other, merge) }
  subtract(other: Dexels): Dexels { return this.zip(other, subtractIntervals) }
  intersect(other: Dexels): Dexels { return this.zip(other, intersectIntervals) }

  /** Highest material in each column, `floor` where the column is empty. */
  top(floor = -Infinity): Float64Array {
    return Float64Array.from(this.cols, (c) => (c.length === 0 ? floor : c[c.length - 1]!))
  }
  /** Lowest material in each column, `ceiling` where the column is empty. */
  bottom(ceiling = Infinity): Float64Array {
    return Float64Array.from(this.cols, (c) => (c.length === 0 ? ceiling : c[0]!))
  }
  /** Material volume, mm^3. */
  volume(): number {
    let v = 0
    for (const c of this.cols) for (let i = 0; i < c.length; i += 2) v += c[i + 1]! - c[i]!
    return v * this.grid.cellX * this.grid.cellY
  }
  isEmpty(): boolean { return this.cols.every((c) => c.length === 0) }
}
