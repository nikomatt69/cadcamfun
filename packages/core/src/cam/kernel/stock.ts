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
import { assemblyProfile, type AssemblyPart } from "./assembly.ts"
import type { Cutter } from "./cutters.ts"
import type { HeightField } from "../verify/heightfield.ts"

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

/**
 * Carry the 3-axis removal recorded on `hf` (the height field the operations carved) onto a voxel grid, so a later rotary /
 * four-axis operation is measured against the material the 3-axis predecessor actually left instead of the original stock box.
 *
 * The carry is one-sided and conservative, so it can only tighten the bracket downwards to what the predecessor proved:
 *
 *   - a voxel lying wholly above the remaining top of EVERY height-field column it overlaps is certainly gone
 *     (`removedSure`, and therefore also `removedPossible`);
 *   - a voxel whose top rises above the lowest remaining top in its footprint may have been cut (`removedPossible` only);
 *   - a voxel that still straddles or lies under the deepest remaining material is left as stock.
 *
 * A voxel is only ever added to the removal sets, never taken out of them, so carrying a height field can never turn a
 * possibly-removed voxel back into material. The height field reads each column at its centre and quantises walls to half a
 * cell, which is why the straddling band is only "possible": the carry never asserts more removal than the predecessor proved.
 */
export const carryHeightField = (voxels: VoxelStock, hf: HeightField): void => {
  const h = voxels.voxel, hd = h / 2
  const topsOf = (x: number, y: number): { min: number; max: number } => {
    // Columns whose extent overlaps this voxel's XY footprint. The voxel centre is clamped into the field first, so an edge
    // voxel resolves to its nearest columns instead of an empty range; the grid and the field share the stock's XY extent, so
    // this clamp only bites at the boundary.
    const cx = Math.min(hf.minX + (hf.nx - 0.5) * hf.cellX, Math.max(hf.minX + 0.5 * hf.cellX, x))
    const cy = Math.min(hf.minY + (hf.ny - 0.5) * hf.cellY, Math.max(hf.minY + 0.5 * hf.cellY, y))
    const i0 = Math.max(0, Math.floor((cx - hd - hf.minX) / hf.cellX)), i1 = Math.min(hf.nx - 1, Math.floor((cx + hd - hf.minX) / hf.cellX))
    const j0 = Math.max(0, Math.floor((cy - hd - hf.minY) / hf.cellY)), j1 = Math.min(hf.ny - 1, Math.floor((cy + hd - hf.minY) / hf.cellY))
    let min = Infinity, max = -Infinity
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const top = hf.top[j * hf.nx + i]!
      if (top < min) min = top
      if (top > max) max = top
    }
    return { min, max }
  }
  for (let k = 0; k < voxels.nz; k++) {
    const cz = voxels.origin.z + (k + 0.5) * h
    for (let j = 0; j < voxels.ny; j++) {
      const cy = voxels.origin.y + (j + 0.5) * h
      for (let i = 0; i < voxels.nx; i++) {
        const id = index(voxels, i, j, k)
        if (voxels.material[id] !== 1 || voxels.removedSure[id] === 1) continue
        const { min, max } = topsOf(voxels.origin.x + (i + 0.5) * h, cy)
        if (!Number.isFinite(min)) continue
        // Above the deepest remaining column in the footprint: at least some of this voxel was cut away.
        if (cz + hd > min) voxels.removedPossible[id] = 1
        // Above the highest remaining column: the whole voxel is gone, in this footprint and everywhere under it.
        if (cz - hd > max) voxels.removedSure[id] = 1
      }
    }
  }
}

/** What the tool assembly touches in the stock at one pose: a contact that is certain, or one that cannot be excluded. */
export interface StockContact {
  /** Centre of a voxel that certainly remains (not possibly removed) and lies wholly inside the probed part of the tool. */
  readonly sure?: Vec3
  /** A voxel that may remain (not surely removed) lies within the probed part's expansion. */
  readonly possible: boolean
}

/**
 * Whether the parts of the assembly given in `parts` (shank and holder while cutting; every part for a rapid) touch material of the
 * stock at a pose: the tip at `tip`, the tool axis up from it along `axis` (both in the stock's frame). Same two tests as the
 * removal, in the other direction: material the cutter did not possibly remove is certainly there, and a cube wholly inside the
 * revolved part is certainly touched; a cube whose centre is within its half diagonal of the part may be. A voxel the cutter
 * possibly removed is never a certain contact, so a shank following the flutes through their own cut is not a collision.
 */
export const stockContact = (stock: VoxelStock, cutter: Cutter, tip: Vec3, axis: Vec3, parts: ReadonlyArray<AssemblyPart>): StockContact => {
  const p = assemblyProfile(cutter)
  const segs: Seg[] = []
  for (let i = 0; i + 1 < p.points.length; i++) if (parts.includes(p.parts[i]!)) segs.push({ a: p.points[i]!, b: p.points[i + 1]! })
  if (segs.length === 0) return { possible: false }
  const d = unitOf(axis)
  const h = stock.voxel, hd = (Math.sqrt(3) / 2) * h
  const top = Math.max(...segs.map((q) => Math.max(q.a.z, q.b.z)))
  const bottom = Math.min(...segs.map((q) => Math.min(q.a.z, q.b.z)))
  const maxR = Math.max(...segs.map((q) => Math.max(q.a.r, q.b.r)))
  const reach = maxR + hd, axialLo = bottom - hd, axialTop = top + hd
  // The box that holds the probed part: the tip plus its extent along the axis, widened by the radius in every direction.
  const x0 = tip.x + Math.min(axialLo * d.x, axialTop * d.x) - reach, x1 = tip.x + Math.max(axialLo * d.x, axialTop * d.x) + reach
  const y0 = tip.y + Math.min(axialLo * d.y, axialTop * d.y) - reach, y1 = tip.y + Math.max(axialLo * d.y, axialTop * d.y) + reach
  const z0 = tip.z + Math.min(axialLo * d.z, axialTop * d.z) - reach, z1 = tip.z + Math.max(axialLo * d.z, axialTop * d.z) + reach
  const i0 = Math.max(0, Math.floor((x0 - stock.origin.x) / h)), i1 = Math.min(stock.nx - 1, Math.floor((x1 - stock.origin.x) / h))
  const j0 = Math.max(0, Math.floor((y0 - stock.origin.y) / h)), j1 = Math.min(stock.ny - 1, Math.floor((y1 - stock.origin.y) / h))
  const k0 = Math.max(0, Math.floor((z0 - stock.origin.z) / h)), k1 = Math.min(stock.nz - 1, Math.floor((z1 - stock.origin.z) / h))
  let possible = false
  for (let k = k0; k <= k1; k++) {
    const cz = stock.origin.z + (k + 0.5) * h
    for (let j = j0; j <= j1; j++) {
      const cy = stock.origin.y + (j + 0.5) * h
      for (let i = i0; i <= i1; i++) {
        const id = index(stock, i, j, k)
        if (stock.material[id] !== 1 || stock.removedSure[id] === 1) continue
        const cx = stock.origin.x + (i + 0.5) * h
        const vx = cx - tip.x, vy = cy - tip.y, vz = cz - tip.z
        const s = vx * d.x + vy * d.y + vz * d.z
        if (s < axialLo || s > axialTop) continue
        const rho = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - s * s))
        if (rho > reach) continue
        const low = radiusAt(segs, Infinity, s - hd), mid = radiusAt(segs, Infinity, s), high = radiusAt(segs, Infinity, s + hd)
        const rMax = Math.max(low, mid, high)
        if (rMax < 0 || rho > rMax + hd) continue
        possible = true
        const rMin = Math.min(low, mid, high)
        if (stock.removedPossible[id] !== 1 && rMin >= 0 && rho + hd <= rMin) return { sure: { x: cx, y: cy, z: cz }, possible: true }
      }
    }
  }
  return { possible }
}
