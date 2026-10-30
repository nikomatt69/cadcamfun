/**
 * Tri-dexel stock of the CAM kernel (spec 53 V1, spec 69 B1): the workpiece as three families of rays (along X, Y and Z), each
 * ray holding the sorted intervals of material it still has. A cutter removes material by subtracting from every ray it crosses
 * the interval the cutter's solid of revolution occupies on that ray, which is exact along the ray whatever the tool axis is, so a
 * tilted five-axis sweep needs no special case. Three directions keep walls that are steep to one family visible to another.
 *
 * Storage is flat: per direction an `Int32Array` of ray heads, `Uint16Array` counts and capacities and one `Float32Array` pool of
 * interval ends (relative to the box minimum, so a part a metre from the origin keeps its resolution). A ray that needs more room
 * is moved to the end of the pool with double the capacity. There is no per-interval object and no per-ray allocation.
 *
 * Declared error (`errorBound`): the stock is known at the ray lattice of side `cell`, so a feature thinner than one cell can lie
 * between rays and a wall is placed within one cell; the sweep adds the sagitta between sampled poses (`sampleStep` keeps it under
 * a quarter cell). The bound is `cell + sagitta`, in mm, and every figure derived here (volume, gouge, leftover) is true within it.
 *
 * The part is cast into the same rays (`PartDexels`, exact ray/triangle hits with the surface normal at each hit) so the stock is
 * compared with it ray by ray: material the part has that the stock lost (`gouge`) and material the stock keeps that the part does
 * not (`left`), measured along the surface normal, not along the ray.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { assemblyProfile, type AssemblyPart } from "./assembly.ts"
import type { Cutter } from "./cutters.ts"
import type { Mesh64 } from "../model/element-mesh.ts"

/** Facets per quarter turn of a rounded cutter edge in the tool solid; the facet sagitta is R (1 - cos(pi / 4 / this)). */
const ARC_STEPS = 24

// ---------------------------------------------------------------- tool solid

/** A cutter (or a part of its assembly) as a stack of coaxial truncated cones, tool frame: tip at 0, axis +Z. */
export interface ToolSolid {
  readonly count: number
  readonly z0: Float64Array
  readonly z1: Float64Array
  readonly r0: Float64Array
  readonly r1: Float64Array
  readonly top: number
  readonly bottom: number
  readonly maxRadius: number
  /** The least radius of the profile that matters for the sampling sagitta (the tip radius of a rounded tool, else the radius). */
  readonly sagRadius: number
}

/** The solid of the parts of the assembly in `parts` (default the flutes), as the union of the cones between profile points. */
export const toolSolid = (cutter: Cutter, parts: ReadonlyArray<AssemblyPart> = ["cutting"]): ToolSolid => {
  const p = assemblyProfile(cutter, { arcSteps: ARC_STEPS })
  const z0: number[] = [], z1: number[] = [], r0: number[] = [], r1: number[] = []
  for (let i = 0; i + 1 < p.points.length; i++) {
    if (!parts.includes(p.parts[i]!)) continue
    const a = p.points[i]!, b = p.points[i + 1]!
    // Zero-height steps are discs of no thickness: the cones above and below carry the volume.
    if (Math.abs(b.z - a.z) < 1e-9) continue
    if (a.z <= b.z) { z0.push(a.z); z1.push(b.z); r0.push(a.r); r1.push(b.r) } else { z0.push(b.z); z1.push(a.z); r0.push(b.r); r1.push(a.r) }
  }
  const maxRadius = r0.length === 0 ? 0 : Math.max(...r0, ...r1)
  const radius = cutter.diameter / 2
  const sagRadius = cutter.kind === "ball" ? radius : cutter.kind === "bull" ? Math.max(cutter.cornerRadius ?? radius, radius * 0.25) : radius
  return {
    count: z0.length, z0: Float64Array.from(z0), z1: Float64Array.from(z1), r0: Float64Array.from(r0), r1: Float64Array.from(r1),
    top: z1.length === 0 ? 0 : Math.max(...z1), bottom: z0.length === 0 ? 0 : Math.min(...z0), maxRadius, sagRadius
  }
}

// ---------------------------------------------------------------- the stock

interface Grid {
  /** Ray direction axis: 0 = X, 1 = Y, 2 = Z. */
  readonly axis: 0 | 1 | 2
  /** The two lattice axes across the ray, ascending. */
  readonly b: 0 | 1 | 2
  readonly c: 0 | 1 | 2
  readonly nb: number
  readonly nc: number
  /** Ray length (the box extent along the axis), mm. */
  readonly length: number
  readonly head: Int32Array
  readonly count: Uint16Array
  readonly cap: Uint16Array
  pool: Float32Array
  used: number
}

const lattice = (axis: 0 | 1 | 2): readonly [0 | 1 | 2, 0 | 1 | 2] => (axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1])

export interface Removal {
  /** Total ray length taken out, mm (a diagnostic; the volume is `volume()`). */
  readonly length: number
}

/** The tri-dexel stock. Build it with `TriDexel.box`, `TriDexel.fromTop` or `TriDexel.fromPart`. */
export class TriDexel {
  /** Largest sagitta between sampled poses seen so far, mm (grows with the paths removed). */
  sagitta = 0
  readonly extent: readonly [number, number, number]
  readonly n: readonly [number, number, number]
  private readonly grids: readonly [Grid, Grid, Grid]
  /** Sums used by `removePath` bookkeeping. */
  poses = 0

  private constructor(readonly min: Vec3, max: Vec3, readonly cell: number, grids: readonly [Grid, Grid, Grid]) {
    this.extent = [max.x - min.x, max.y - min.y, max.z - min.z]
    this.n = [Math.max(1, Math.ceil(this.extent[0] / cell)), Math.max(1, Math.ceil(this.extent[1] / cell)), Math.max(1, Math.ceil(this.extent[2] / cell))]
    this.grids = grids
  }

  private static grids(min: Vec3, max: Vec3, cell: number, fill: (g: Grid, r: number, ib: number, ic: number) => void): TriDexel {
    const extent = [max.x - min.x, max.y - min.y, max.z - min.z] as const
    const n = [Math.max(1, Math.ceil(extent[0] / cell)), Math.max(1, Math.ceil(extent[1] / cell)), Math.max(1, Math.ceil(extent[2] / cell))] as const
    const make = (axis: 0 | 1 | 2): Grid => {
      const [b, c] = lattice(axis)
      const rays = n[b] * n[c]
      return { axis, b, c, nb: n[b], nc: n[c], length: extent[axis], head: new Int32Array(rays), count: new Uint16Array(rays), cap: new Uint16Array(rays), pool: new Float32Array(rays * 4), used: 0 }
    }
    const grids = [make(0), make(1), make(2)] as const
    for (const g of grids) {
      for (let ic = 0; ic < g.nc; ic++) for (let ib = 0; ib < g.nb; ib++) fill(g, ic * g.nb + ib, ib, ic)
    }
    return new TriDexel(min, max, cell, grids)
  }

  /** A solid box of material over [min, max] with rays `cell` apart. */
  static box(min: Vec3, max: Vec3, cell: number): TriDexel {
    if (!(cell > 0)) throw new RangeError("The dexel cell must be positive")
    return TriDexel.grids(min, max, cell, (g, r) => {
      g.head[r] = g.used; g.cap[r] = 2; g.count[r] = 1
      g.pool[g.used] = 0; g.pool[g.used + 1] = g.length
      g.used += 4
    })
  }

  /** Material under the surface `top(x, y)` (mm, absolute) inside the box: a stock cut by three-axis operations, or a casting with a flat top. */
  static fromTop(min: Vec3, max: Vec3, cell: number, top: (x: number, y: number) => number): TriDexel {
    const s = TriDexel.box(min, max, cell)
    const [gx, gy, gz] = s.grids
    // Z rays: one interval from the floor to the surface (clipped to the box).
    for (let j = 0; j < gz.nc; j++) for (let i = 0; i < gz.nb; i++) {
      const r = j * gz.nb + i
      const t = Math.min(gz.length, Math.max(0, top(s.centre(0, i), s.centre(1, j)) - min.z))
      if (t <= 0) gz.count[r] = 0
      else gz.pool[gz.head[r]! + 1] = t
    }
    // X and Y rays: runs where the surface lies above the ray's height, edges on the lattice.
    const run = (g: Grid, along: 0 | 1): void => {
      const nAlong = s.n[along]
      for (let k = 0; k < g.nc; k++) for (let m = 0; m < g.nb; m++) {
        const zc = min.z + s.centre(2, k)
        const lo: number[] = [], hi: number[] = []
        let start = -1
        for (let q = 0; q <= nAlong; q++) {
          const x = along === 0 ? s.centre(0, Math.min(q, nAlong - 1)) : s.centre(0, m)
          const y = along === 0 ? s.centre(1, m) : s.centre(1, Math.min(q, nAlong - 1))
          const inside = q < nAlong && top(min.x + x, min.y + y) > zc
          if (inside && start < 0) start = q
          if (!inside && start >= 0) { lo.push(Math.min(g.length, start * s.cell)); hi.push(Math.min(g.length, q * s.cell)); start = -1 }
        }
        s.setRay(g, k * g.nb + m, lo, hi)
      }
    }
    run(gx, 0)
    run(gy, 1)
    return s
  }

  /** A stock shaped like a closed part (a casting, a scan, the previous setup's result). */
  static fromPart(part: PartDexels): TriDexel {
    const max = { x: part.min.x + part.extent[0], y: part.min.y + part.extent[1], z: part.min.z + part.extent[2] }
    const s = TriDexel.box(part.min, max, part.cell)
    for (let a = 0; a < 3; a++) {
      const g = s.grids[a]!, p = part.dirs[a]!
      for (let r = 0; r < g.count.length; r++) {
        const lo: number[] = [], hi: number[] = []
        for (let h = p.offset[r]!; h + 1 < p.offset[r + 1]!; h += 2) { lo.push(p.t[h]!); hi.push(p.t[h + 1]!) }
        s.setRay(g, r, lo, hi)
      }
    }
    return s
  }

  /** Centre of lattice cell `i` along `axis`, relative to the box minimum (the last cell may be partial). */
  centre(axis: 0 | 1 | 2, i: number): number {
    const w = Math.min(this.cell, this.extent[axis] - i * this.cell)
    return i * this.cell + w / 2
  }
  private width(axis: 0 | 1 | 2, i: number): number { return Math.min(this.cell, this.extent[axis] - i * this.cell) }

  /** @internal */
  setRay(g: Grid, r: number, lo: ReadonlyArray<number>, hi: ReadonlyArray<number>): void {
    const k = lo.length
    this.reserve(g, r, k)
    const h = g.head[r]!
    for (let i = 0; i < k; i++) { g.pool[h + 2 * i] = lo[i]!; g.pool[h + 2 * i + 1] = hi[i]! }
    g.count[r] = k
  }

  /** Make room for `k` intervals in ray `r`, moving it to the end of the pool when its slot is too small. */
  /** @internal */
  reserve(g: Grid, r: number, k: number): void {
    if (k <= g.cap[r]!) return
    const cap = Math.max(4, k * 2)
    if (g.used + cap * 2 > g.pool.length) {
      const next = new Float32Array(Math.max(g.pool.length * 2, g.used + cap * 2))
      next.set(g.pool.subarray(0, g.used))
      g.pool = next
    }
    const old = g.head[r]!, n = g.count[r]!
    g.pool.copyWithin(g.used, old, old + 2 * n)
    g.head[r] = g.used
    g.cap[r] = cap
    g.used += cap * 2
  }

  /** The declared error of every figure derived from this stock, mm. */
  get errorBound(): number { return this.cell + this.sagitta }

  /** Material volume, mm³, from the rays of `axis` (the average of the three is `volumeMean`). */
  volume(axis: 0 | 1 | 2 = 2): number {
    const g = this.grids[axis]
    let sum = 0
    for (let k = 0; k < g.nc; k++) {
      const wc = this.width(g.c, k)
      for (let m = 0; m < g.nb; m++) {
        const r = k * g.nb + m
        const h = g.head[r]!
        let len = 0
        for (let i = 0, n = g.count[r]!; i < n; i++) len += g.pool[h + 2 * i + 1]! - g.pool[h + 2 * i]!
        sum += len * this.width(g.b, m) * wc
      }
    }
    return sum
  }

  /** Mean of the three directions' volumes: the directions err on different faces, so the mean is steadier than any one. */
  volumeMean(): number { return (this.volume(0) + this.volume(1) + this.volume(2)) / 3 }

  /** Number of material intervals over all rays of all directions (a measure of how fragmented the stock is). */
  intervals(): number {
    let n = 0
    for (const g of this.grids) for (let r = 0; r < g.count.length; r++) n += g.count[r]!
    return n
  }

  /** Bytes held by the ray tables and pools. */
  bytes(): number {
    let b = 0
    for (const g of this.grids) b += g.head.byteLength + g.count.byteLength + g.cap.byteLength + g.used * 4
    return b
  }

  /** The intervals of ray `(ib, ic)` of `axis` as absolute coordinates (for tests and inspection). */
  ray(axis: 0 | 1 | 2, ib: number, ic: number): ReadonlyArray<readonly [number, number]> {
    const g = this.grids[axis]
    const r = ic * g.nb + ib, h = g.head[r]!
    const out: Array<readonly [number, number]> = []
    for (let i = 0; i < g.count[r]!; i++) out.push([this.min[axisName(axis)] + g.pool[h + 2 * i]!, this.min[axisName(axis)] + g.pool[h + 2 * i + 1]!])
    return out
  }

  /** Whether the stock has material at `p` (exact along the Z ray through the cell that holds the point). */
  has(p: Vec3): boolean {
    const g = this.grids[2]
    const i = Math.min(g.nb - 1, Math.max(0, Math.floor((p.x - this.min.x) / this.cell))), j = Math.min(g.nc - 1, Math.max(0, Math.floor((p.y - this.min.y) / this.cell)))
    const r = j * g.nb + i, h = g.head[r]!, t = p.z - this.min.z
    for (let q = 0; q < g.count[r]!; q++) if (t >= g.pool[h + 2 * q]! && t <= g.pool[h + 2 * q + 1]!) return true
    return false
  }

  // -------------------------------------------------------------- cutting

  /** The sampling step that keeps the sagitta between poses under a quarter cell for a tool of this solid. */
  sampleStep(tool: ToolSolid): number {
    const r = Math.max(tool.sagRadius, this.cell)
    return Math.max(this.cell, Math.min(Math.sqrt(2 * r * this.cell), 2 * r))
  }

  /**
   * Remove the tool along a polyline of tip points (axes up from each tip into the holder, +Z when absent). Poses are interpolated
   * every `step` mm (default `sampleStep`); the sagitta of that step is added to the declared bound. Returns the ray length removed.
   */
  removePath(tool: ToolSolid, tips: ReadonlyArray<Vec3>, axes?: ReadonlyArray<Vec3>, step: number = this.sampleStep(tool)): Removal {
    this.sagitta = Math.max(this.sagitta, (step * step) / (8 * Math.max(tool.sagRadius, 1e-6)))
    let length = 0
    const pose = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1 }
    for (let i = 0; i < tips.length; i++) {
      const p = tips[i]!
      const d = unit(axes?.[i])
      if (i === 0) { length += this.cutAt(tool, p.x, p.y, p.z, d.x, d.y, d.z); continue }
      const q = tips[i - 1]!, dq = unit(axes?.[i - 1])
      const len = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
      const turn = Math.hypot(d.x - dq.x, d.y - dq.y, d.z - dq.z) * Math.max(tool.top, 1)
      const n = Math.max(1, Math.ceil(Math.max(len, turn) / step))
      for (let k = 1; k <= n; k++) {
        const f = k / n
        let ax = dq.x + (d.x - dq.x) * f, ay = dq.y + (d.y - dq.y) * f, az = dq.z + (d.z - dq.z) * f
        const l = Math.hypot(ax, ay, az) || 1
        ax /= l; ay /= l; az /= l
        pose.x = q.x + (p.x - q.x) * f; pose.y = q.y + (p.y - q.y) * f; pose.z = q.z + (p.z - q.z) * f
        length += this.cutAt(tool, pose.x, pose.y, pose.z, ax, ay, az)
      }
    }
    return { length }
  }

  /** Remove the tool at one pose (tip, unit axis). Returns the ray length removed. */
  cut(tool: ToolSolid, tip: Vec3, axis: Vec3 = { x: 0, y: 0, z: 1 }): number {
    const d = unit(axis)
    return this.cutAt(tool, tip.x, tip.y, tip.z, d.x, d.y, d.z)
  }

  private cutAt(tool: ToolSolid, px: number, py: number, pz: number, dx: number, dy: number, dz: number): number {
    this.poses++
    return sweepPose(this, tool, px, py, pz, dx, dy, dz, 0, undefined)
  }

  /**
   * Whether the tool solid (shank and holder of the assembly) overlaps material at a pose, and how deep: for each direction the
   * longest overlap of a ray's tool interval with a material interval, and the least of the three is the penetration, mm, with where
   * it was found. Overlaps shorter than the caller's tolerance are noise of the lattice, not contact.
   */
  probe(tool: ToolSolid, tip: Vec3, axis: Vec3 = { x: 0, y: 0, z: 1 }): { readonly overlap: number; readonly at?: Vec3 } {
    const d = unit(axis)
    const out: ProbeResult = { overlap: 0, x: 0, y: 0, z: 0, best: [0, 0, 0], px: [0, 0, 0], py: [0, 0, 0], pz: [0, 0, 0] }
    sweepPose(this, tool, tip.x, tip.y, tip.z, d.x, d.y, d.z, 1, out)
    // The penetration is the least of the three directions' longest overlaps: a chord across a shank sunk into a wall is as long as
    // the shank is wide, the overlap along its axis is how deep it sank, and only the smallest of them is the depth.
    let a = 0
    for (let k = 1; k < 3; k++) if (out.best[k]! < out.best[a]!) a = k
    return out.best[a]! > 0 ? { overlap: out.best[a]!, at: { x: out.px[a]!, y: out.py[a]!, z: out.pz[a]! } } : { overlap: 0 }
  }

  /** @internal ray tables for the sweep and the comparison. */
  gridOf(axis: 0 | 1 | 2): Grid { return this.grids[axis] }
  /** @internal */
  latticeWidth(axis: 0 | 1 | 2, i: number): number { return this.width(axis, i) }
}

const axisName = (a: 0 | 1 | 2): "x" | "y" | "z" => (a === 0 ? "x" : a === 1 ? "y" : "z")

const unit = (v: Vec3 | undefined): Vec3 => {
  if (v === undefined) return { x: 0, y: 0, z: 1 }
  const l = Math.hypot(v.x, v.y, v.z)
  return l < 1e-12 ? { x: 0, y: 0, z: 1 } : { x: v.x / l, y: v.y / l, z: v.z / l }
}

interface ProbeResult { overlap: number; x: number; y: number; z: number; best: [number, number, number]; px: [number, number, number]; py: [number, number, number]; pz: [number, number, number] }

// Scratch for the intervals one tool makes on one ray (at most two per cone).
const SCRATCH = 64
const loBuf = new Float64Array(SCRATCH)
const hiBuf = new Float64Array(SCRATCH)
const keep = new Float32Array(1024)

/**
 * The core of cutting and probing: for every ray of the three directions near the tool at this pose, the interval each cone of the
 * tool occupies on the ray is found (a quadratic in the ray parameter), the cones' intervals are merged, and then either subtracted
 * from the ray's material (mode 0) or intersected with it to find the longest overlap (mode 1).
 */
const sweepPose = (s: TriDexel, tool: ToolSolid, px: number, py: number, pz: number, dx: number, dy: number, dz: number, mode: 0 | 1, probe: ProbeResult | undefined): number => {
  if (tool.count === 0) return 0
  const P = [px - s.min.x, py - s.min.y, pz - s.min.z] as const
  const D = [dx, dy, dz] as const
  const R = tool.maxRadius
  let removed = 0
  for (let axis = 0 as 0 | 1 | 2; axis < 3; axis = (axis + 1) as 0 | 1 | 2) {
    const g = s.gridOf(axis)
    const { b, c } = g
    const cell = s.cell
    // Lattice window of the rays that can meet the tool: its bounding box across the ray.
    const ext = (k: 0 | 1 | 2): number => R * Math.sqrt(Math.max(0, 1 - D[k]! * D[k]!))
    const bLo = Math.min(P[b]!, P[b]! + D[b]! * tool.top) - ext(b), bHi = Math.max(P[b]!, P[b]! + D[b]! * tool.top) + ext(b)
    const cLo = Math.min(P[c]!, P[c]! + D[c]! * tool.top) - ext(c), cHi = Math.max(P[c]!, P[c]! + D[c]! * tool.top) + ext(c)
    const i0 = Math.max(0, Math.floor(bLo / cell - 0.5)), i1 = Math.min(g.nb - 1, Math.ceil(bHi / cell))
    const j0 = Math.max(0, Math.floor(cLo / cell - 0.5)), j1 = Math.min(g.nc - 1, Math.ceil(cHi / cell))
    if (i0 > i1 || j0 > j1) continue
    // The tool axis segment projected across the ray: a ray farther than R from it cannot meet the tool.
    const ax = P[b]!, ay = P[c]!
    const ex = D[b]! * tool.top, ey = D[c]! * tool.top
    const e2 = ex * ex + ey * ey
    const Pa = P[axis]!, Da = D[axis]!
    const len = g.length
    for (let j = j0; j <= j1; j++) {
      const vc = s.centre(c, j)
      const qc = vc - P[c]!
      for (let i = i0; i <= i1; i++) {
        const r = j * g.nb + i
        const cnt = g.count[r]!
        if (cnt === 0) continue
        const vb = s.centre(b, i)
        // Distance of the ray from the axis segment (2D, across the ray).
        const rx = vb - ax, ry = vc - ay
        const u = e2 > 1e-18 ? Math.max(0, Math.min(1, (rx * ex + ry * ey) / e2)) : 0
        const ddx = rx - u * ex, ddy = ry - u * ey
        if (ddx * ddx + ddy * ddy > R * R) continue
        const qb = vb - P[b]!
        const K = Pa * Pa + qb * qb + qc * qc
        const s0 = -Da * Pa + D[b]! * qb + D[c]! * qc
        // Intervals of the cones on this ray.
        let m = 0
        for (let q = 0; q < tool.count; q++) {
          const z0 = tool.z0[q]!, z1 = tool.z1[q]!, r0 = tool.r0[q]!
          const k = (tool.r1[q]! - r0) / (z1 - z0)
          const mm = r0 - k * z0 + k * s0
          // s(t) = s0 + Da t within [z0, z1].
          let tl: number, th: number
          if (Math.abs(Da) < 1e-12) {
            if (s0 < z0 || s0 > z1) continue
            tl = 0; th = len
          } else {
            const ta = (z0 - s0) / Da, tb = (z1 - s0) / Da
            tl = Math.max(0, Math.min(ta, tb)); th = Math.min(len, Math.max(ta, tb))
          }
          if (tl >= th) continue
          const kd = k * Da
          const a2 = 1 - Da * Da - kd * kd
          const a1 = -2 * Pa - 2 * s0 * Da - 2 * mm * kd
          const a0 = K - s0 * s0 - mm * mm
          if (Math.abs(a2) < 1e-12) {
            if (Math.abs(a1) < 1e-12) { if (a0 <= 0) { loBuf[m] = tl; hiBuf[m++] = th } continue }
            const t = -a0 / a1
            if (a1 > 0) { if (t > tl) { loBuf[m] = tl; hiBuf[m++] = Math.min(th, t) } } else if (t < th) { loBuf[m] = Math.max(tl, t); hiBuf[m++] = th }
            continue
          }
          const disc = a1 * a1 - 4 * a2 * a0
          if (a2 > 0) {
            if (disc < 0) continue
            const sq = Math.sqrt(disc)
            const t1 = (-a1 - sq) / (2 * a2), t2 = (-a1 + sq) / (2 * a2)
            const lo = Math.max(tl, t1), hi = Math.min(th, t2)
            if (lo < hi && m < SCRATCH) { loBuf[m] = lo; hiBuf[m++] = hi }
          } else {
            // Opens downward: the solid is outside the roots.
            if (disc <= 0) { if (m < SCRATCH) { loBuf[m] = tl; hiBuf[m++] = th }; continue }
            const sq = Math.sqrt(disc)
            const t1 = (-a1 + sq) / (2 * a2), t2 = (-a1 - sq) / (2 * a2)
            if (tl < Math.min(th, t1) && m < SCRATCH) { loBuf[m] = tl; hiBuf[m++] = Math.min(th, t1) }
            if (Math.max(tl, t2) < th && m < SCRATCH) { loBuf[m] = Math.max(tl, t2); hiBuf[m++] = th }
          }
          if (m >= SCRATCH - 2) break
        }
        if (m === 0) continue
        // Merge the intervals (insertion sort by start: m is small).
        for (let a = 1; a < m; a++) {
          const lo = loBuf[a]!, hi = hiBuf[a]!
          let z = a - 1
          while (z >= 0 && loBuf[z]! > lo) { loBuf[z + 1] = loBuf[z]!; hiBuf[z + 1] = hiBuf[z]!; z-- }
          loBuf[z + 1] = lo; hiBuf[z + 1] = hi
        }
        let w = 0
        for (let a = 1; a < m; a++) {
          if (loBuf[a]! <= hiBuf[w]! + 1e-9) { if (hiBuf[a]! > hiBuf[w]!) hiBuf[w] = hiBuf[a]! } else { w++; loBuf[w] = loBuf[a]!; hiBuf[w] = hiBuf[a]! }
        }
        const merged = w + 1
        const h = g.head[r]!
        if (mode === 1) {
          // Longest overlap of the tool's intervals with the ray's material.
          let best = 0, bt = 0
          for (let a = 0; a < merged; a++) {
            const lo = loBuf[a]!, hi = hiBuf[a]!
            for (let q = 0; q < cnt; q++) {
              const ml = g.pool[h + 2 * q]!, mh = g.pool[h + 2 * q + 1]!
              if (mh <= lo || ml >= hi) continue
              const o = Math.min(hi, mh) - Math.max(lo, ml)
              if (o > best) { best = o; bt = (Math.max(lo, ml) + Math.min(hi, mh)) / 2 }
            }
          }
          if (best > probe!.best[axis]!) {
            probe!.best[axis] = best
            const pt = [0, 0, 0]
            pt[b] = vb; pt[c] = vc; pt[axis] = bt
            probe!.px[axis] = s.min.x + pt[0]!; probe!.py[axis] = s.min.y + pt[1]!; probe!.pz[axis] = s.min.z + pt[2]!
          }
          continue
        }
        removed += subtractRay(s, g, r, merged)
      }
    }
  }
  return removed
}

/** Subtract the merged intervals in `loBuf`/`hiBuf` from ray `r`; returns the length removed. */
const subtractRay = (s: TriDexel, g: Grid, r: number, merged: number): number => {
  const cnt = g.count[r]!
  const h = g.head[r]!
  const pool = g.pool
  // Quick reject: no overlap with any material.
  let overlaps = false
  for (let q = 0; q < cnt && !overlaps; q++) {
    const ml = pool[h + 2 * q]!, mh = pool[h + 2 * q + 1]!
    for (let a = 0; a < merged; a++) if (loBuf[a]! < mh && hiBuf[a]! > ml) { overlaps = true; break }
  }
  if (!overlaps) return 0
  let n = 0
  let removed = 0
  const need = cnt + merged + 1
  const out = need * 2 <= keep.length ? keep : new Float32Array(need * 2)
  for (let q = 0; q < cnt; q++) {
    let lo = pool[h + 2 * q]!
    const hi = pool[h + 2 * q + 1]!
    for (let a = 0; a < merged && lo < hi; a++) {
      const cl = loBuf[a]!, ch = hiBuf[a]!
      if (ch <= lo) continue
      if (cl >= hi) break
      if (cl > lo) { out[2 * n] = lo; out[2 * n + 1] = cl; n++; removed += Math.min(ch, hi) - cl } else removed += Math.min(ch, hi) - lo
      lo = ch
    }
    if (lo < hi) { out[2 * n] = lo; out[2 * n + 1] = hi; n++ }
  }
  // Drop slivers below float resolution.
  let m = 0
  for (let q = 0; q < n; q++) if (out[2 * q + 1]! - out[2 * q]! > 1e-6) { out[2 * m] = out[2 * q]!; out[2 * m + 1] = out[2 * q + 1]!; m++ }
  if (m > g.cap[r]!) {
    // Relocate through the stock's own growth routine.
    s.reserve(g, r, m)
  }
  const h2 = g.head[r]!
  const target = g.pool
  for (let q = 0; q < 2 * m; q++) target[h2 + q] = out[q]!
  g.count[r] = m
  return removed
}

// ---------------------------------------------------------------- the part cast into rays

interface PartDir {
  /** CSR offsets per ray into `t` / `nAbs`. */
  readonly offset: Int32Array
  /** Hit parameters along the ray, relative to the box minimum, sorted per ray. */
  readonly t: Float32Array
  /** |n . ray direction| at each hit (1 = the surface is perpendicular to the ray). */
  readonly nAbs: Float32Array
  /** Rays with an odd number of hits (an open or self-intersecting mesh): their last hit is dropped. */
  readonly odd: number
}

/** The closed part meshes cast into the rays of a box: exact ray/triangle hits with the surface normal at each. */
export class PartDexels {
  readonly extent: readonly [number, number, number]
  constructor(readonly min: Vec3, max: Vec3, readonly cell: number, readonly dirs: readonly [PartDir, PartDir, PartDir]) {
    this.extent = [max.x - min.x, max.y - min.y, max.z - min.z]
  }
  /** Rays whose hit count was odd, over the three directions: zero for a closed manifold part. */
  get openRays(): number { return this.dirs[0].odd + this.dirs[1].odd + this.dirs[2].odd }

  static fromMeshes(meshes: ReadonlyArray<Mesh64>, min: Vec3, max: Vec3, cell: number): PartDexels {
    const extent = [max.x - min.x, max.y - min.y, max.z - min.z] as const
    const n = [Math.max(1, Math.ceil(extent[0] / cell)), Math.max(1, Math.ceil(extent[1] / cell)), Math.max(1, Math.ceil(extent[2] / cell))] as const
    const centre = (axis: 0 | 1 | 2, i: number): number => i * cell + Math.min(cell, extent[axis] - i * cell) / 2
    const O = [min.x, min.y, min.z] as const
    // A fixed sub-cell offset keeps rays off the edges and vertices of axis-aligned meshes, where hits would be counted twice.
    const jb = cell * 1.3e-6, jc = cell * 0.7e-6
    const dirs = [0, 1, 2].map((axis) => {
      const a = axis as 0 | 1 | 2
      const [b, c] = lattice(a)
      const nb = n[b], nc = n[c], rays = nb * nc
      const counts = new Int32Array(rays + 1)
      // Pass 1 counts hits, pass 2 stores them.
      let hits: Float32Array | undefined, norms: Float32Array | undefined
      for (let pass = 0; pass < 2; pass++) {
        const fill = new Int32Array(rays)
        for (const mesh of meshes) {
          const P = mesh.positions, I = mesh.indices
          for (let f = 0; f + 2 < I.length; f += 3) {
            const i0 = I[f]! * 3, i1 = I[f + 1]! * 3, i2 = I[f + 2]! * 3
            const A = [P[i0]! - O[0], P[i0 + 1]! - O[1], P[i0 + 2]! - O[2]] as const
            const B = [P[i1]! - O[0], P[i1 + 1]! - O[1], P[i1 + 2]! - O[2]] as const
            const C = [P[i2]! - O[0], P[i2 + 1]! - O[1], P[i2 + 2]! - O[2]] as const
            const ab = A[b]!, ac = A[c]!
            const x1 = B[b]! - ab, y1 = B[c]! - ac, x2 = C[b]! - ab, y2 = C[c]! - ac
            const det = x1 * y2 - x2 * y1
            if (Math.abs(det) < 1e-18) continue
            const minb = Math.min(ab, B[b]!, C[b]!), maxb = Math.max(ab, B[b]!, C[b]!)
            const minc = Math.min(ac, B[c]!, C[c]!), maxc = Math.max(ac, B[c]!, C[c]!)
            const ib0 = Math.max(0, Math.floor(minb / cell - 0.5)), ib1 = Math.min(nb - 1, Math.ceil(maxb / cell))
            const ic0 = Math.max(0, Math.floor(minc / cell - 0.5)), ic1 = Math.min(nc - 1, Math.ceil(maxc / cell))
            // Triangle normal component along the ray, for the hit's |n . u|.
            const ux = B[0]! - A[0]!, uy = B[1]! - A[1]!, uz = B[2]! - A[2]!, vx = C[0]! - A[0]!, vy = C[1]! - A[1]!, vz = C[2]! - A[2]!
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
            const nl = Math.hypot(nx, ny, nz)
            if (nl < 1e-18) continue
            const nAxis = Math.abs(a === 0 ? nx : a === 1 ? ny : nz) / nl
            for (let ic = ic0; ic <= ic1; ic++) {
              const qc = centre(c, ic) + jc - ac
              for (let ib = ib0; ib <= ib1; ib++) {
                const qb = centre(b, ib) + jb - ab
                const l1 = (qb * y2 - x2 * qc) / det, l2 = (x1 * qc - qb * y1) / det
                if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue
                const t = A[a]! + l1 * (B[a]! - A[a]!) + l2 * (C[a]! - A[a]!)
                const ray = ic * nb + ib
                if (pass === 0) counts[ray + 1] = counts[ray + 1]! + 1
                else { const at = counts[ray]! + fill[ray]!; fill[ray] = fill[ray]! + 1; hits![at] = t; norms![at] = nAxis }
              }
            }
          }
        }
        if (pass === 0) {
          for (let r = 0; r < rays; r++) counts[r + 1]! += counts[r]!
          hits = new Float32Array(counts[rays]!)
          norms = new Float32Array(counts[rays]!)
        }
      }
      // Sort each ray's hits (with their normals) and pair them up.
      let odd = 0
      const offsets = new Int32Array(rays + 1)
      const t = new Float32Array(hits!.length), na = new Float32Array(hits!.length)
      let w = 0
      for (let r = 0; r < rays; r++) {
        offsets[r] = w
        const s = counts[r]!, e = counts[r + 1]!
        const k = e - s
        const idx = Array.from({ length: k }, (_, q) => s + q).sort((p, q) => hits![p]! - hits![q]!)
        const use = k - (k % 2)
        if (k % 2 === 1) odd++
        for (let q = 0; q < use; q++) { t[w] = hits![idx[q]!]!; na[w] = norms![idx[q]!]!; w++ }
      }
      offsets[rays] = w
      return { offset: offsets, t: t.subarray(0, w), nAbs: na.subarray(0, w), odd } satisfies PartDir
    }) as unknown as readonly [PartDir, PartDir, PartDir]
    return new PartDexels(min, max, cell, dirs)
  }

  /** Volume of the cast part from the rays of `axis`, mm³. */
  volume(axis: 0 | 1 | 2 = 2): number {
    const [b, c] = lattice(axis)
    const n = [Math.max(1, Math.ceil(this.extent[0] / this.cell)), Math.max(1, Math.ceil(this.extent[1] / this.cell)), Math.max(1, Math.ceil(this.extent[2] / this.cell))] as const
    const p = this.dirs[axis]
    let sum = 0
    for (let k = 0; k < n[c]; k++) for (let m = 0; m < n[b]; m++) {
      const r = k * n[b] + m
      let len = 0
      for (let h = p.offset[r]!; h + 1 < p.offset[r + 1]!; h += 2) len += p.t[h + 1]! - p.t[h]!
      sum += len * Math.min(this.cell, this.extent[b] - m * this.cell) * Math.min(this.cell, this.extent[c] - k * this.cell)
    }
    return sum
  }
}

// ---------------------------------------------------------------- comparison

export interface Deviation {
  /** Volume of the deviation, mm³ (the larger of the three directions' estimates). */
  readonly volume: number
  /** Deepest deviation measured along the surface normal, mm. */
  readonly depth: number
  /** Rays that deviate by more than the threshold, in the direction that saw the most. */
  readonly rays: number
  /** Where the deepest deviation is, absolute mm. */
  readonly at?: Vec3
}

export interface PartComparison {
  /** Part material the stock has lost: the cut went below the part surface. */
  readonly gouge: Deviation
  /** Stock material beyond the part plus the allowance. */
  readonly left: Deviation
  /**
   * Volume of stock that faces no part surface along any of its Z rays (a lump off the part's projection, such as a stock corner):
   * it has no normal to measure a depth by, so it is reported as a volume and never as a thickness.
   */
  readonly detached: number
  /** Rays of the part with an odd number of hits (open mesh): the figures above ignore their last hit. */
  readonly openRays: number
}

/** Normals flatter than this to a ray give an unreliable normal thickness (`len * |n.u|`): the other directions measure those faces. */
const MIN_NORMAL = 0.2

/**
 * Compare the stock with the part ray by ray. A deviation interval's length along the ray is turned into a thickness along the surface
 * normal with the normal at the part surface that bounds it (`|n . u|`); the three directions all estimate the same thing, so the volume
 * and depth reported are the largest of them. `allowance` is the material the part is allowed to be short of (finish stock left on purpose);
 * `threshold` is the smallest normal thickness that counts as a deviation (the tolerance).
 */
export const comparePart = (stock: TriDexel, part: PartDexels, options: { readonly allowance?: number; readonly threshold?: number } = {}): PartComparison => {
  const allowance = options.allowance ?? 0, threshold = options.threshold ?? 0
  let gVol = 0, gDepth = 0, gRays = 0, gAt: Vec3 | undefined
  let lVol = 0, lDepth = 0, lRays = 0, lAt: Vec3 | undefined
  let detached = 0
  for (let axis = 0 as 0 | 1 | 2; axis < 3; axis = (axis + 1) as 0 | 1 | 2) {
    const g = stock.gridOf(axis)
    const p = part.dirs[axis]
    let gv = 0, gr = 0, lv = 0, lr = 0, dv = 0
    const [b, c] = [g.b, g.c]
    for (let k = 0; k < g.nc; k++) for (let m = 0; m < g.nb; m++) {
      const r = k * g.nb + m
      const area = stock.latticeWidth(b, m) * stock.latticeWidth(c, k)
      const sh = g.head[r]!, sn = g.count[r]!
      const ph = p.offset[r]!, pn = (p.offset[r + 1]! - ph) / 2
      let gotG = false, gotL = false
      // Part minus stock: for each part interval, the stretches the stock does not cover.
      for (let q = 0; q < pn; q++) {
        const lo = p.t[ph + 2 * q]!
        const hi = p.t[ph + 2 * q + 1]!
        const nLo = p.nAbs[ph + 2 * q]!, nHi = p.nAbs[ph + 2 * q + 1]!
        const flush = (a: number, e: number, adjLo: boolean, adjHi: boolean): void => {
          const len = e - a
          if (len <= 1e-6) return
          if (!adjLo && !adjHi) {
            // Bounded by the cut on both sides: the chord of a cavity wall, not a depth. It counts in the volume only.
            if (len > threshold) gv += len * area
            return
          }
          // The normal at the part surface that bounds the piece turns the ray length into a depth below that surface.
          const nrm = adjLo && adjHi ? Math.min(nLo, nHi) : adjLo ? nLo : nHi
          if (nrm < MIN_NORMAL) return
          const thick = len * nrm
          if (thick <= threshold) return
          gv += len * area
          if (!gotG) { gr++; gotG = true }
          if (thick > gDepth) { gDepth = thick; const pt = [0, 0, 0]; pt[b] = stock.centre(b, m); pt[c] = stock.centre(c, k); pt[axis] = (a + e) / 2; gAt = { x: stock.min.x + pt[0]!, y: stock.min.y + pt[1]!, z: stock.min.z + pt[2]! } }
        }
        let cursor = lo, firstPiece = true
        for (let q2 = 0; q2 < sn; q2++) {
          const ml = g.pool[sh + 2 * q2]!, mh = g.pool[sh + 2 * q2 + 1]!
          if (mh <= lo || ml >= hi) continue
          if (ml > cursor) flush(cursor, Math.min(ml, hi), firstPiece, false)
          cursor = Math.max(cursor, mh)
          firstPiece = false
          if (cursor >= hi) break
        }
        if (cursor < hi) flush(cursor, hi, firstPiece, true)
      }
      // Stock minus part: material the stock keeps outside every part interval.
      for (let q = 0; q < sn; q++) {
        const sl = g.pool[sh + 2 * q]!, shh = g.pool[sh + 2 * q + 1]!
        let cursor = sl
        let nPrev = 0
        let prevAdj = false
        const emit = (a: number, e: number, nBefore: number, nAfter: number, adjB: boolean, adjA: boolean): void => {
          const len = e - a
          if (len <= 1e-6) return
          if (!adjB && !adjA) {
            // Material that faces no part surface along this ray: a detached lump. Counted once, by the Z rays.
            if (axis === 2 && len > threshold) dv += len * area
            return
          }
          const nrm = adjB && adjA ? Math.min(nBefore, nAfter) : adjB ? nBefore : nAfter
          if (nrm < MIN_NORMAL) return
          const thick = len * nrm
          if (thick > allowance + threshold) {
            const over = Math.max(0, len - allowance / nrm)
            lv += over * area; if (!gotL) { lr++; gotL = true }
            if (thick - allowance > lDepth) { lDepth = thick - allowance; const pt = [0, 0, 0]; pt[b] = stock.centre(b, m); pt[c] = stock.centre(c, k); pt[axis] = (a + e) / 2; lAt = { x: stock.min.x + pt[0]!, y: stock.min.y + pt[1]!, z: stock.min.z + pt[2]! } }
          }
        }
        for (let q2 = 0; q2 < pn; q2++) {
          const pl = p.t[ph + 2 * q2]!, phh = p.t[ph + 2 * q2 + 1]!
          if (phh <= cursor) { nPrev = p.nAbs[ph + 2 * q2 + 1]!; prevAdj = true; continue }
          if (pl >= shh) break
          if (pl > cursor) emit(cursor, Math.min(pl, shh), nPrev, p.nAbs[ph + 2 * q2]!, prevAdj, true)
          cursor = Math.max(cursor, phh)
          nPrev = p.nAbs[ph + 2 * q2 + 1]!; prevAdj = true
          if (cursor >= shh) break
        }
        if (cursor < shh) emit(cursor, shh, nPrev, 0, prevAdj, false)
      }
    }
    if (gv > gVol) { gVol = gv; gRays = gr }
    if (lv > lVol) { lVol = lv; lRays = lr }
    detached = Math.max(detached, dv)
  }
  return {
    gouge: { volume: gVol, depth: gDepth, rays: gRays, ...(gAt !== undefined ? { at: gAt } : {}) },
    left: { volume: lVol, depth: lDepth, rays: lRays, ...(lAt !== undefined ? { at: lAt } : {}) },
    detached,
    openRays: part.openRays
  }
}
