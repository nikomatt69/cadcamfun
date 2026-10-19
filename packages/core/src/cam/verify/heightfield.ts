/**
 * Stock as a height field (a dexel model with one column per cell): `top[i]` is the Z of the highest
 * material in the column, the stock is solid from `floor` up to it. That is exact for 3-axis work, where
 * a vertical tool can only lower a column, and cheap enough to replay a whole program.
 *
 * Accuracy: columns are sampled at their centres, so walls are quantised to half a cell. Callers that
 * compare against a model must allow one cell of lateral slack (see `neighbourhood`).
 */
import type { Mesh } from "../../cad/solid.ts"

/** Height tolerance below which a column is considered untouched, mm. */
export const EPS = 1e-6

/**
 * What the height field needs of a cutter: its radius and the height of its cutting surface above
 * the tip at a radial distance. The verifier's `ToolModel` and the live simulation's cutter both
 * satisfy it, so the two remove the same material.
 */
export interface CuttingProfile {
  readonly radius: number
  /** `true` when the cutting profile is flat, so the stamp needs no square root. */
  readonly flat: boolean
  /** Height of the cutting surface above the tip at radial distance `r` (0 ≤ r ≤ radius). */
  readonly profile: (r: number) => number
}

export class HeightField {
  readonly top: Float64Array
  readonly cellX: number
  readonly cellY: number

  constructor(
    readonly nx: number,
    readonly ny: number,
    readonly minX: number,
    readonly minY: number,
    readonly width: number,
    readonly height: number,
    readonly floor: number,
    readonly ceiling: number
  ) {
    this.cellX = width / nx
    this.cellY = height / ny
    this.top = new Float64Array(nx * ny).fill(ceiling)
  }

  get cellArea(): number {
    return this.cellX * this.cellY
  }

  centreX(i: number): number {
    return this.minX + (i + 0.5) * this.cellX
  }

  centreY(j: number): number {
    return this.minY + (j + 0.5) * this.cellY
  }

  /** Column range whose centres lie within `r` of `c` along one axis. */
  private span(c: number, r: number, min: number, cell: number, n: number): readonly [number, number] {
    const lo = Math.max(0, Math.ceil((c - r - min) / cell - 0.5))
    const hi = Math.min(n - 1, Math.floor((c + r - min) / cell - 0.5))
    return [lo, hi]
  }

  /**
   * Lowers every column under the cutting profile at `(cx, cy)` with the tip at `tipZ`. Returns the
   * removed volume, mm³.
   */
  cut(tool: CuttingProfile, cx: number, cy: number, tipZ: number): number {
    const [i0, i1] = this.span(cx, tool.radius, this.minX, this.cellX, this.nx)
    const [j0, j1] = this.span(cy, tool.radius, this.minY, this.cellY, this.ny)
    const r2 = tool.radius * tool.radius
    let removed = 0
    for (let j = j0; j <= j1; j++) {
      const dy = this.centreY(j) - cy
      const row = j * this.nx
      for (let i = i0; i <= i1; i++) {
        const dx = this.centreX(i) - cx
        const d2 = dx * dx + dy * dy
        if (d2 > r2) continue
        const h = tool.flat ? tipZ : tipZ + tool.profile(Math.sqrt(d2))
        const t = this.top[row + i]!
        if (t > h) {
          removed += t - h
          this.top[row + i] = h
        }
      }
    }
    return removed * this.cellArea
  }

  /** Whether the cutting profile at `(cx, cy, tipZ)` would touch material (nothing is removed). */
  touches(tool: CuttingProfile, cx: number, cy: number, tipZ: number): boolean {
    const [i0, i1] = this.span(cx, tool.radius, this.minX, this.cellX, this.nx)
    const [j0, j1] = this.span(cy, tool.radius, this.minY, this.cellY, this.ny)
    const r2 = tool.radius * tool.radius
    for (let j = j0; j <= j1; j++) {
      const dy = this.centreY(j) - cy
      const row = j * this.nx
      for (let i = i0; i <= i1; i++) {
        const dx = this.centreX(i) - cx
        const d2 = dx * dx + dy * dy
        if (d2 > r2) continue
        const h = tool.flat ? tipZ : tipZ + tool.profile(Math.sqrt(d2))
        if (this.top[row + i]! > h + EPS) return true
      }
    }
    return false
  }

  /** Whether any column within `radius` of `(cx, cy)` rises above `z` (a cylinder whose bottom is `z`). */
  reaches(cx: number, cy: number, radius: number, z: number): boolean {
    if (z >= this.ceiling - EPS) return false
    const [i0, i1] = this.span(cx, radius, this.minX, this.cellX, this.nx)
    const [j0, j1] = this.span(cy, radius, this.minY, this.cellY, this.ny)
    const r2 = radius * radius
    for (let j = j0; j <= j1; j++) {
      const dy = this.centreY(j) - cy
      const row = j * this.nx
      for (let i = i0; i <= i1; i++) {
        const dx = this.centreX(i) - cx
        if (dx * dx + dy * dy <= r2 && this.top[row + i]! > z + EPS) return true
      }
    }
    return false
  }

  volume(): number {
    let sum = 0
    for (let k = 0; k < this.top.length; k++) sum += this.top[k]! - this.floor
    return sum * this.cellArea
  }

  /** Per column min and max of `values` over the 3×3 neighbourhood (one cell of lateral slack). */
  neighbourhood(values: Float64Array): { readonly min: Float64Array; readonly max: Float64Array } {
    const { nx, ny } = this
    const rowMin = new Float64Array(nx * ny)
    const rowMax = new Float64Array(nx * ny)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let lo = Infinity
        let hi = -Infinity
        for (let k = Math.max(0, i - 1); k <= Math.min(nx - 1, i + 1); k++) {
          const v = values[j * nx + k]!
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
        rowMin[j * nx + i] = lo
        rowMax[j * nx + i] = hi
      }
    }
    const min = new Float64Array(nx * ny)
    const max = new Float64Array(nx * ny)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let lo = Infinity
        let hi = -Infinity
        for (let k = Math.max(0, j - 1); k <= Math.min(ny - 1, j + 1); k++) {
          const a = rowMin[k * nx + i]!
          const b = rowMax[k * nx + i]!
          if (a < lo) lo = a
          if (b > hi) hi = b
        }
        min[j * nx + i] = lo
        max[j * nx + i] = hi
      }
    }
    return { min, max }
  }

  /**
   * Height of the top surface of `meshes` over every column (the finished part seen from above).
   * Columns no triangle covers fall back to the floor; heights clamp to the stock.
   */
  rasterise(meshes: ReadonlyArray<Mesh>): Float64Array {
    const out = new Float64Array(this.nx * this.ny).fill(this.floor)
    for (const mesh of meshes) {
      const p = mesh.positions
      const ix = mesh.indices
      for (let t = 0; t + 2 < ix.length; t += 3) {
        const a = ix[t]! * 3
        const b = ix[t + 1]! * 3
        const c = ix[t + 2]! * 3
        const ax = p[a]!, ay = p[a + 1]!, az = p[a + 2]!
        const bx = p[b]!, by = p[b + 1]!, bz = p[b + 2]!
        const cx = p[c]!, cy = p[c + 1]!, cz = p[c + 2]!
        const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if (Math.abs(det) < 1e-12) continue
        const [i0, i1] = this.span((Math.min(ax, bx, cx) + Math.max(ax, bx, cx)) / 2, (Math.max(ax, bx, cx) - Math.min(ax, bx, cx)) / 2, this.minX, this.cellX, this.nx)
        const [j0, j1] = this.span((Math.min(ay, by, cy) + Math.max(ay, by, cy)) / 2, (Math.max(ay, by, cy) - Math.min(ay, by, cy)) / 2, this.minY, this.cellY, this.ny)
        for (let j = j0; j <= j1; j++) {
          const y = this.centreY(j)
          for (let i = i0; i <= i1; i++) {
            const x = this.centreX(i)
            const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det
            const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det
            const l3 = 1 - l1 - l2
            if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue
            const z = l1 * az + l2 * bz + l3 * cz
            const k = j * this.nx + i
            if (z > out[k]!) out[k] = z
          }
        }
      }
    }
    for (let k = 0; k < out.length; k++) out[k] = Math.min(this.ceiling, Math.max(this.floor, out[k]!))
    return out
  }
}
