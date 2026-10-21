/**
 * Rest machining: clear only what a previous, larger tool could not reach.
 *
 * At a Z level the previous tool (radius Rp, centres allowed where `Surface.tip(previous) <= z`) has swept every point within Rp of
 * an allowed centre. What is left is the unswept material: stock that is not part (the part's top is not above the level) and lies
 * farther than Rp from every allowed centre of the previous tool. The current tool (radius R) needs to visit a centre exactly when
 * its disc touches that material, i.e. when the centre is allowed for it and its distance to the unswept material is below R. The
 * result is a function `value(x, y)` for `contour`: the current tool's own drop-cutter height where a visit is needed, and
 * Infinity (forbidden) everywhere else, so the pocket engine clears only those regions.
 *
 * Both distances come from an exact Euclidean distance transform over the contour grid. Two resolutions are declared, because
 * without them the pass would chase numerical noise along every wall instead of real remnants: the drop-cutter errs on the safe
 * side by up to a model cell, by a different amount for each tool, and the part's own outline is known to a cell. So the swept area
 * is widened by `slack` (three quarters of a contour-grid step), and a centre is visited only when its disc overlaps unswept
 * material by more than `margin` (two model cells). Material thinner than that stays for the finishing pass.
 */
import type { Surface, Cutter, Rect } from "./surface-field.ts"
import { nodeGrid, sampleNodes } from "./surface-field.ts"

/** Squared-distance stand-in for "no feature": finite, so the parabola intersections never become NaN. */
const FAR = 1e12

/**
 * One pass of the squared Euclidean distance transform (Felzenszwalb and Huttenlocher) along a line of `n` samples `s` apart:
 * `out[p] = min over q of ((p - q) s)^2 + f[q]`.
 */
const lowerEnvelope = (f: Float64Array, n: number, s: number, out: Float64Array, v: Int32Array, z: Float64Array): void => {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let at: number
    for (;;) {
      const p = v[k]!
      at = (f[q]! + (q * s) ** 2 - (f[p]! + (p * s) ** 2)) / (2 * s * (q - p))
      if (at <= z[k]!) k--
      else break
    }
    k++
    v[k] = q
    z[k] = at
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q * s) k++
    out[q] = ((q - v[k]!) * s) ** 2 + f[v[k]!]!
  }
}

/**
 * Distance from every node of a `w` x `h` grid (row-major, spacing `dx` x `dy`) to the nearest node with `mask` set;
 * Infinity when no node is set.
 */
export const distanceTo = (mask: Uint8Array, w: number, h: number, dx: number, dy: number): Float64Array => {
  const cost = new Float64Array(w * h)
  let any = false
  for (let k = 0; k < cost.length; k++) {
    if (mask[k] === 1) { cost[k] = 0; any = true } else cost[k] = FAR
  }
  if (!any) return new Float64Array(w * h).fill(Infinity)
  const m = Math.max(w, h)
  const line = new Float64Array(m), res = new Float64Array(m)
  const v = new Int32Array(m), z = new Float64Array(m + 1)
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) line[j] = cost[j * w + i]!
    lowerEnvelope(line, h, dy, res, v, z)
    for (let j = 0; j < h; j++) cost[j * w + i] = res[j]!
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) line[i] = cost[j * w + i]!
    lowerEnvelope(line, w, dx, res, v, z)
    for (let i = 0; i < w; i++) cost[j * w + i] = res[i]!
  }
  for (let k = 0; k < cost.length; k++) cost[k] = cost[k]! >= FAR / 2 ? Infinity : Math.sqrt(cost[k]!)
  return cost
}

export interface RestSetup {
  readonly surface: Surface
  /** The previous tool's cutter (with the allowance it left on the part). Unused when `remaining` is given. */
  readonly previous?: Cutter
  /** Physical radii of the previous and of the current tool: what each one sweeps. */
  readonly previousRadius?: number
  /**
   * The stock really left, from the operations before (spec 29 §6): its top height at (x, y). When given it replaces the model of
   * a single previous tool, so any chain of cutters, entries and rest passes is accounted for. `allowance` is the layer the earlier
   * passes meant to leave on the part (floors and walls); it is not remnant, and `threshold` is the thickness below which material
   * is not chased.
   */
  readonly remaining?: (x: number, y: number) => number
  readonly allowance?: number
  readonly threshold?: number
  readonly radius: number
  /** Where a tool centre may be, and the grid the contour is traced on. */
  readonly keep: Rect
  readonly rect: Rect
  readonly step: number
  /** Where there is stock (the raw piece in XY). */
  readonly stock: Rect
  /** Two model cells: material this thin, or an overlap this shallow, is below the resolution of the part model and is not chased. */
  readonly margin: number
  /** Level-independent: the current tool's drop-cutter height at each node (Infinity outside `keep`). */
  readonly nodes: Float64Array
  readonly value: (x: number, y: number) => number
}

export interface RestLevel {
  readonly value: (x: number, y: number) => number
  readonly nodes: Float64Array
  /** Nodes of unswept material at this level (for reporting). */
  readonly unswept: number
  /** Whether the material at (x, y) is left by the previous tool at this level (nearest node of the contour grid). */
  readonly isUnswept: (x: number, y: number) => boolean
}

/** Returns the function that gives the rest region of the current tool at any Z level. */
export const restField = (s: RestSetup): ((level: number) => RestLevel) => {
  const { nx, ny, dx, dy } = nodeGrid(s.rect, s.step)
  const w = nx + 1, h = ny + 1
  const { remaining } = s
  const previous = s.previous
  const nodesPrevious = remaining !== undefined || previous === undefined ? new Float64Array(w * h) : sampleNodes((x, y) => (x < s.keep.x0 || x > s.keep.x1 || y < s.keep.y0 || y > s.keep.y1 ? Infinity : s.surface.tip(previous, x, y)), s.rect, s.step)
  const slack = 0.75 * Math.max(dx, dy)
  const sweptReach = (s.previousRadius ?? 0) + slack
  const allowance = s.allowance ?? 0, thickness = s.threshold ?? 0.02
  const trigger = s.radius - s.margin
  return (level) => {
    const allowed = new Uint8Array(w * h)
    const solid = new Uint8Array(w * h)
    if (remaining === undefined) for (let k = 0; k < allowed.length; k++) allowed[k] = nodesPrevious[k]! <= level + 1e-9 ? 1 : 0
    else for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) solid[j * w + i] = s.surface.at(s.rect.x0 + i * dx, s.rect.y0 + j * dy) > level + 1e-9 ? 1 : 0
    const fromAllowed = remaining === undefined ? distanceTo(allowed, w, h, dx, dy) : new Float64Array(0)
    // Remaining-stock mode: the wall layer is the allowance, measured from the part solid at this level.
    const fromSolid = remaining === undefined ? new Float64Array(0) : distanceTo(solid, w, h, dx, dy)
    const unswept = new Uint8Array(w * h)
    let count = 0
    for (let j = 0; j < h; j++) {
      const y = s.rect.y0 + j * dy
      if (y < s.stock.y0 || y > s.stock.y1) continue
      for (let i = 0; i < w; i++) {
        const x = s.rect.x0 + i * dx
        if (x < s.stock.x0 || x > s.stock.x1) continue
        const k = j * w + i
        // The part occupies the slice when its top is above the level; there is no material there to leave behind.
        if (s.surface.at(x, y) > level + 1e-9) continue
        if (remaining === undefined) {
          if (fromAllowed[k]! > sweptReach) { unswept[k] = 1; count++ }
        } else if (fromSolid[k]! > allowance + slack && remaining(x, y) > Math.max(level, s.surface.at(x, y) + allowance) + thickness) {
          unswept[k] = 1; count++
        }
      }
    }
    // Nothing left by the previous tool at this level: no centre needs a visit (and no distance to interpolate).
    if (count === 0) return { value: () => Infinity, nodes: new Float64Array(w * h).fill(Infinity), unswept: 0, isUnswept: () => false }
    const fromUnswept = distanceTo(unswept, w, h, dx, dy)
    const near = (x: number, y: number): number => {
      const gx = Math.min(w - 1 - 1e-9, Math.max(0, (x - s.rect.x0) / dx)), gy = Math.min(h - 1 - 1e-9, Math.max(0, (y - s.rect.y0) / dy))
      const i = Math.floor(gx), j = Math.floor(gy)
      const fx = gx - i, fy = gy - j
      const a = fromUnswept[j * w + i]!, b = fromUnswept[j * w + i + 1]!, c = fromUnswept[(j + 1) * w + i]!, d = fromUnswept[(j + 1) * w + i + 1]!
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
    }
    const value = (x: number, y: number): number => (near(x, y) < trigger ? s.value(x, y) : Infinity)
    const nodes = new Float64Array(w * h)
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i
        nodes[k] = fromUnswept[k]! < trigger ? s.nodes[k]! : Infinity
      }
    }
    const isUnswept = (x: number, y: number): boolean => {
      const i = Math.round((x - s.rect.x0) / dx), j = Math.round((y - s.rect.y0) / dy)
      return i >= 0 && j >= 0 && i < w && j < h && unswept[j * w + i] === 1
    }
    return { value, nodes, unswept: count, isUnswept }
  }
}
