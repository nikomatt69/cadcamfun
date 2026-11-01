/**
 * Adaptive layer height: thick layers where the part's wall is steep, thin ones where it leans over, with every layer ending on a
 * flat face that the part has at that height. The stair-step error of a wall inclined `alpha` from the vertical is `h * sin(alpha)`
 * (the distance of the step's corner from the true surface), and `sin(alpha)` is the z component of the surface normal, so the
 * layer a wall allows is `tolerance / |nz|`, clamped to what the printer can lay. Horizontal faces have no step error; they are
 * layer boundaries instead (the layer that reaches one is cut to end on it).
 *
 * The profile is read from the triangles in one pass (a bin of `min / 2` per slice of height keeps the largest |nz| over the
 * non-flat triangles that cross it), so the cost is linear in the triangles and in the height.
 */
import type { SliceMesh } from "./slice.ts"

export interface AdaptiveOptions {
  /** Thinnest and thickest layer, mm. Defaults 0.08 and 0.28. */
  readonly min?: number
  readonly max?: number
  /** The largest stair-step deviation from the surface, mm. Default 0.04. */
  readonly tolerance?: number
  /** Layers snap to this grid, mm. Default 0.01. */
  readonly quantum?: number
}

export interface AdaptiveStack {
  readonly tops: number[]
  readonly heights: number[]
  /** The largest stair-step deviation over the layers the tolerance governs, mm (<= tolerance up to the quantum). */
  readonly worstDeviation: number
  /** Layers where even the minimum layer is coarser than the tolerance allows (near-horizontal surfaces), and the worst deviation there, mm. */
  readonly minLimited: number
  readonly worstMinLimitedDeviation: number
  /** Number of layers held at the maximum. */
  readonly clamped: number
}

const FLAT = 0.99

export const adaptiveStack = (meshes: ReadonlyArray<SliceMesh>, height: number, firstLayer: number, options: AdaptiveOptions = {}): AdaptiveStack => {
  const hMin = options.min ?? 0.08
  const hMax = options.max ?? 0.28
  const tol = options.tolerance ?? 0.04
  const q = options.quantum ?? 0.01
  if (!(hMin > 0) || hMax < hMin) throw new RangeError("Adaptive layers need 0 < min <= max")
  if (!Number.isFinite(height) || height <= 0) throw new RangeError("The model height must be finite and positive")
  const bin = hMin / 2
  const bins = Math.ceil(height / bin) + 2
  const steep = new Float32Array(bins)
  const flatLevels = new Set<number>()
  for (const mesh of meshes) {
    const p = mesh.positions
    for (let k = 0; k + 2 < mesh.indices.length; k += 3) {
      const a = mesh.indices[k]! * 3, b = mesh.indices[k + 1]! * 3, c = mesh.indices[k + 2]! * 3
      const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!
      const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz)
      if (len < 1e-14) continue
      const s = Math.abs(nz) / len
      const z0 = Math.min(p[a + 2]!, p[b + 2]!, p[c + 2]!), z1 = Math.max(p[a + 2]!, p[b + 2]!, p[c + 2]!)
      if (s > FLAT) { flatLevels.add(Math.round(((z0 + z1) / 2) * 1000) / 1000); continue }
      const i0 = Math.max(0, Math.floor(z0 / bin)), i1 = Math.min(bins - 1, Math.floor(z1 / bin))
      for (let i = i0; i <= i1; i++) if (steep[i]! < s) steep[i] = s
    }
  }
  const levels = [...flatLevels].filter((z) => z > 1e-6 && z < height - 1e-6).sort((x, y) => x - y)
  const maxSteep = (z0: number, z1: number): number => {
    let m = 0
    for (let i = Math.max(0, Math.floor(z0 / bin)); i <= Math.min(bins - 1, Math.floor(z1 / bin)); i++) if (steep[i]! > m) m = steep[i]!
    return m
  }
  const tops: number[] = []
  const heights: number[] = []
  let z = 0
  let worst = 0, clamped = 0, minLimited = 0, worstMin = 0
  let first = true
  let level = 0
  while (z < height - 1e-9) {
    let h: number
    if (first) h = Math.min(firstLayer, height)
    else {
      h = hMax
      for (let pass = 0; pass < 3; pass++) {
        const s = maxSteep(z, z + h)
        const allowed = s > 1e-6 ? tol / s : hMax
        const next = Math.max(hMin, Math.min(hMax, allowed))
        if (next >= h - 1e-9) break
        h = next
      }
      h = Math.max(hMin, Math.floor(h / q + 1e-9) * q)
      while (level < levels.length && levels[level]! <= z + hMin * 0.5) level++
      const f = levels[level]
      if (f !== undefined) {
        const gap = f - z
        if (gap <= h + 1e-9) h = gap // end the layer on the flat face
        else if (gap < h + hMin) h = gap <= hMax ? gap : gap / 2 // do not leave a sliver between this layer and the face
      }
    }
    h = Math.min(h, height - z)
    const s = first ? 0 : maxSteep(z, z + h)
    const dev = h * s
    if (!first) {
      if (s > 1e-6 && tol / s < hMin - 1e-9 && h <= hMin + q) { minLimited++; if (dev > worstMin) worstMin = dev }
      else {
        if (h >= hMax - 1e-9) clamped++
        if (dev > worst) worst = dev
      }
    }
    z += h
    tops.push(z)
    heights.push(h)
    first = false
  }
  // The last slab may be thinner than a printer lays: share it with the layer under it.
  const last = heights.length - 1
  if (last > 0 && heights[last]! < 0.04) {
    const shared = (heights[last - 1]! + heights[last]!) / 2
    tops[last - 1] = tops[last]! - shared
    heights[last - 1] = shared
    heights[last] = shared
  }
  tops[tops.length - 1] = height
  return { tops, heights, worstDeviation: worst, minLimited, worstMinLimitedDeviation: worstMin, clamped }
}
