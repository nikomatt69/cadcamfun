/**
 * Volumetric stock of the CAM kernel (spec 29 §5, "Retain an outer bound on potentially remaining material and an inner bound on
 * definitely remaining material"): a voxel grid that the cutter sweeps remove from. Each voxel is in one of three states after a
 * set of moves:
 *
 *   material          it was stock before any removal
 *   removed sure      its whole cube lay inside the cutter at some sampled position, so it is certainly removed
 *   removed possible  its cube came within the cutter's expansion (half a diagonal, and half the sample spacing) at some sampled
 *                     position, so it may be removed
 *
 * The remaining volume is therefore bracketed: the material not possibly removed is definitely left, the material not surely
 * removed may be left. The bracket is what the replay reports; a voxel is never called removed without a sampled cutter covering it.
 * Only vertical (3-axis) tool moves are removed here: the tool axis is +Z and the tip path is a polyline. Units: mm.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { assemblyProfile } from "./assembly.ts"
import type { Cutter } from "./cutters.ts"

export interface VoxelStock {
  /** Minimum corner of the grid, mm. */
  readonly origin: Vec3
  readonly voxel: number
  readonly nx: number
  readonly ny: number
  readonly nz: number
  /** 1 where the stock was before any removal. */
  readonly material: Uint8Array
  /** 1 where the whole voxel was inside the cutter at a sampled position. */
  readonly removedSure: Uint8Array
  /** 1 where the voxel may have been touched by the cutter (outer bound). */
  readonly removedPossible: Uint8Array
  /** Sample spacing used along the moves, mm. */
  readonly step: number
}

interface Seg { readonly a: { r: number; z: number }; readonly b: { r: number; z: number } }

/** The cutting-zone profile of a tool: the segments from the tip (z = 0) to the top of the flutes. */
const cuttingSegments = (c: Cutter): { readonly segs: Seg[]; readonly top: number; readonly maxRadius: number } => {
  const p = assemblyProfile(c)
  const segs: Seg[] = []
  for (let i = 0; i + 1 < p.points.length; i++) if (p.parts[i] === "cutting") segs.push({ a: p.points[i]!, b: p.points[i + 1]! })
  const top = Math.max(...segs.map((s) => Math.max(s.a.z, s.b.z)))
  const maxRadius = Math.max(...segs.map((s) => Math.max(s.a.r, s.b.r)))
  return { segs, top, maxRadius }
}

/** The cutting radius at `dz` above the tip; -1 outside the flutes. Zero-height segments (a flat bottom) give their larger radius. */
const radiusAt = (segs: ReadonlyArray<Seg>, top: number, dz: number): number => {
  if (dz < 0 || dz > top) return -1
  let best = -1
  for (const s of segs) {
    const lo = Math.min(s.a.z, s.b.z), hi = Math.max(s.a.z, s.b.z)
    if (dz < lo - 1e-12 || dz > hi + 1e-12) continue
    if (hi - lo < 1e-12) { best = Math.max(best, s.a.r, s.b.r); continue }
    const t = (dz - s.a.z) / (s.b.z - s.a.z)
    best = Math.max(best, s.a.r + (s.b.r - s.a.r) * t)
  }
  return best
}

/** An empty grid of material over the box [min, max], with voxels of side `voxel`. */
export const voxelStock = (min: Vec3, max: Vec3, voxel: number): VoxelStock => {
  const nx = Math.max(1, Math.ceil((max.x - min.x) / voxel))
  const ny = Math.max(1, Math.ceil((max.y - min.y) / voxel))
  const nz = Math.max(1, Math.ceil((max.z - min.z) / voxel))
  const n = nx * ny * nz
  return {
    origin: min, voxel, nx, ny, nz, step: voxel / 2,
    material: new Uint8Array(n).fill(1), removedSure: new Uint8Array(n), removedPossible: new Uint8Array(n)
  }
}

const index = (s: VoxelStock, i: number, j: number, k: number): number => (k * s.ny + j) * s.nx + i

/**
 * Remove the cutter along a polyline of tip points (3-axis, tool axis +Z; each point is the tip, the flutes rise from it). The
 * path is sampled every `stock.step` mm; between samples the cutter's expansion covers the motion.
 */
export const removeTipPath = (stock: VoxelStock, cutter: Cutter, path: ReadonlyArray<Vec3>): void => {
  const { segs, top, maxRadius } = cuttingSegments(cutter)
  const h = stock.voxel, hd = (Math.sqrt(3) / 2) * h, e = stock.step / 2
  const samples: Vec3[] = []
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!
    if (i === 0) { samples.push(p); continue }
    const q = path[i - 1]!
    const len = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
    const n = Math.max(1, Math.ceil(len / stock.step))
    for (let k = 1; k <= n; k++) samples.push({ x: q.x + ((p.x - q.x) * k) / n, y: q.y + ((p.y - q.y) * k) / n, z: q.z + ((p.z - q.z) * k) / n })
  }
  for (const tip of samples) {
    // Voxels whose cube could meet the expanded cutter: a box around the tip of radius maxRadius + diagonal + expansion.
    const reach = maxRadius + hd + e
    const i0 = Math.max(0, Math.floor((tip.x - reach - stock.origin.x) / h)), i1 = Math.min(stock.nx - 1, Math.floor((tip.x + reach - stock.origin.x) / h))
    const j0 = Math.max(0, Math.floor((tip.y - reach - stock.origin.y) / h)), j1 = Math.min(stock.ny - 1, Math.floor((tip.y + reach - stock.origin.y) / h))
    const k0 = Math.max(0, Math.floor((tip.z - e - hd - stock.origin.z) / h)), k1 = Math.min(stock.nz - 1, Math.floor((tip.z + top + e + hd - stock.origin.z) / h))
    for (let k = k0; k <= k1; k++) {
      const cz = stock.origin.z + (k + 0.5) * h
      const dz = cz - tip.z
      for (let j = j0; j <= j1; j++) {
        const cy = stock.origin.y + (j + 0.5) * h
        for (let i = i0; i <= i1; i++) {
          const cx = stock.origin.x + (i + 0.5) * h
          const d = Math.hypot(cx - tip.x, cy - tip.y)
          const id = index(stock, i, j, k)
          // Sure: the cube is inside the cutter at this position. The radius is the least over the cube's height.
          const low = radiusAt(segs, top, Math.max(0, dz - hd)), mid = radiusAt(segs, top, dz), high = radiusAt(segs, top, Math.min(top, dz + hd))
          const rMin = Math.min(low, mid, high)
          if (dz - hd >= 0 && dz + hd <= top && rMin >= 0 && d + hd <= rMin) stock.removedSure[id] = 1
          // Possible: the cube meets the cutter, with the cutter's radius and height widened by the expansion.
          if (dz >= -(hd + e) && dz <= top + hd + e && d - hd - e <= maxRadius) stock.removedPossible[id] = 1
        }
      }
    }
  }
}

/** The remaining volume bracket (mm³): definitely left (lower) and possibly left (upper). */
export const remainingVolume = (stock: VoxelStock): { readonly lower: number; readonly upper: number } => {
  const v = stock.voxel ** 3
  let lower = 0, upper = 0
  for (let id = 0; id < stock.material.length; id++) {
    if (stock.material[id] !== 1) continue
    if (stock.removedPossible[id] !== 1) lower++
    if (stock.removedSure[id] !== 1) upper++
  }
  return { lower: lower * v, upper: upper * v }
}
