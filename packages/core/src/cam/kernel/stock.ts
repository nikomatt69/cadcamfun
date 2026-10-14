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
 * The tool may tilt: each tip point carries the tool axis there (interpolated between the points), and a voxel is measured along
 * that axis, so a five-axis sweep is bracketed by the same two tests. Units: mm.
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

const UP: Vec3 = { x: 0, y: 0, z: 1 }

/** A unit vector; the tool axis +Z when none (or a zero vector) is given. */
const unitOf = (v: Vec3 | undefined): Vec3 => {
  if (v === undefined) return UP
  const l = Math.hypot(v.x, v.y, v.z)
  return l < 1e-12 ? UP : { x: v.x / l, y: v.y / l, z: v.z / l }
}

/**
 * Remove the cutter along a polyline of tip points. The flutes rise from each tip along the tool axis: +Z, unless `axes` gives it at
 * each point (any non-zero vector pointing from the tip up into the holder; it is interpolated and normalised between the points).
 * The path is sampled every `stock.step` mm; between samples the cutter's expansion covers the motion.
 */
export const removeTipPath = (stock: VoxelStock, cutter: Cutter, path: ReadonlyArray<Vec3>, axes?: ReadonlyArray<Vec3>): void => {
  const { segs, top, maxRadius } = cuttingSegments(cutter)
  const h = stock.voxel, hd = (Math.sqrt(3) / 2) * h, e = stock.step / 2
  // A voxel is possibly removed when its centre lies within `delta` of the cutter: the cube's half diagonal plus the sample expansion.
  const delta = hd + e
  const reach = maxRadius + delta
  const axialTop = top + delta
  const samples: Array<{ readonly p: Vec3; readonly d: Vec3 }> = []
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!
    const d = unitOf(axes?.[i])
    if (i === 0) { samples.push({ p, d }); continue }
    const q = path[i - 1]!
    const dq = unitOf(axes?.[i - 1])
    const len = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
    const n = Math.max(1, Math.ceil(len / stock.step))
    for (let k = 1; k <= n; k++) {
      const f = k / n
      const mix = { x: dq.x + (d.x - dq.x) * f, y: dq.y + (d.y - dq.y) * f, z: dq.z + (d.z - dq.z) * f }
      samples.push({ p: { x: q.x + ((p.x - q.x) * k) / n, y: q.y + ((p.y - q.y) * k) / n, z: q.z + ((p.z - q.z) * k) / n }, d: unitOf(mix) })
    }
  }
  for (const { p: tip, d } of samples) {
    // Voxels whose centre could meet the expanded cutter. Every point of it lies within `reach` of the axis and within `axialTop`
    // along it, so each coordinate is within reach + axialTop·|d_k| of the tip.
    const ex = reach + axialTop * Math.abs(d.x), ey = reach + axialTop * Math.abs(d.y), ez = reach + axialTop * Math.abs(d.z)
    const i0 = Math.max(0, Math.floor((tip.x - ex - stock.origin.x) / h)), i1 = Math.min(stock.nx - 1, Math.floor((tip.x + ex - stock.origin.x) / h))
    const j0 = Math.max(0, Math.floor((tip.y - ey - stock.origin.y) / h)), j1 = Math.min(stock.ny - 1, Math.floor((tip.y + ey - stock.origin.y) / h))
    const k0 = Math.max(0, Math.floor((tip.z - ez - stock.origin.z) / h)), k1 = Math.min(stock.nz - 1, Math.floor((tip.z + ez - stock.origin.z) / h))
    for (let k = k0; k <= k1; k++) {
      const cz = stock.origin.z + (k + 0.5) * h
      for (let j = j0; j <= j1; j++) {
        const cy = stock.origin.y + (j + 0.5) * h
        for (let i = i0; i <= i1; i++) {
          const cx = stock.origin.x + (i + 0.5) * h
          // The voxel centre in the tool's frame: s up the axis from the tip, rho from the axis.
          const vx = cx - tip.x, vy = cy - tip.y, vz = cz - tip.z
          const s = vx * d.x + vy * d.y + vz * d.z
          const rho = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - s * s))
          const id = index(stock, i, j, k)
          // Sure: the cube is inside the cutter at this position. The radius is the least over the cube's height.
          const low = radiusAt(segs, top, Math.max(0, s - hd)), mid = radiusAt(segs, top, s), high = radiusAt(segs, top, Math.min(top, s + hd))
          const rMin = Math.min(low, mid, high)
          if (s - hd >= 0 && s + hd <= top && rMin >= 0 && rho + hd <= rMin) stock.removedSure[id] = 1
          // Possible: the centre lies within the cutter's expansion (the flutes' ends widened by delta, and its radius).
          if (s >= -delta && s <= axialTop && rho <= reach) stock.removedPossible[id] = 1
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
