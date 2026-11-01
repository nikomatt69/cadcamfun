/**
 * Geometry of a turned part in the (z, r) half-plane: contours as polylines, the offset of a contour by a nose radius, and the
 * raster of a revolved region used to verify stock removal.
 *
 * Conventions (the same as `kernel/turning.ts`): z = 0 is the finished face and grows towards the tailstock; the chuck is at
 * negative z. Programs are written in diameter X; everything here is a radius `r`. A contour runs from the face towards the
 * chuck (non-increasing z for an external profile).
 */
export interface RZ {
  readonly z: number
  readonly r: number
}

/** Radius of a contour at `z` (piecewise linear). Outside its z range the end radius is returned. */
export const radiusAt = (contour: ReadonlyArray<RZ>, z: number): number => {
  if (contour.length === 0) return 0
  const first = contour[0]!
  const last = contour[contour.length - 1]!
  const descending = first.z >= last.z
  if (descending ? z >= first.z : z <= first.z) return first.r
  if (descending ? z <= last.z : z >= last.z) return last.r
  for (let i = 1; i < contour.length; i++) {
    const a = contour[i - 1]!, b = contour[i]!
    if (descending ? z <= a.z && z >= b.z : z >= a.z && z <= b.z) {
      const span = b.z - a.z
      return Math.abs(span) < 1e-12 ? Math.max(a.r, b.r) : a.r + ((b.r - a.r) * (z - a.z)) / span
    }
  }
  return last.r
}

/** Volume of the solid of revolution of a contour down to the axis, mm³ (sum of frusta). */
export const revolvedVolume = (contour: ReadonlyArray<RZ>): number => {
  let v = 0
  for (let i = 1; i < contour.length; i++) {
    const a = contour[i - 1]!, b = contour[i]!
    v += (Math.PI * Math.abs(a.z - b.z) * (a.r * a.r + a.r * b.r + b.r * b.r)) / 3
  }
  return v
}

/** Length of the polyline, mm. */
export const pathLength = (path: ReadonlyArray<RZ>): number => {
  let l = 0
  for (let i = 1; i < path.length; i++) l += Math.hypot(path[i]!.z - path[i - 1]!.z, path[i]!.r - path[i - 1]!.r)
  return l
}

export type FreeSide = "above" | "below"

/**
 * The path of the centre of a nose circle of radius `radius` that touches `contour` from its free side: the contour offset by
 * `radius`. `free` is the side of the contour with air (`above`: an external profile, material below; `below`: a bore, material
 * above). Convex corners are rounded by an arc of the nose radius (4° steps), concave corners are the intersection of the two offset
 * lines. A `radius` of 0 returns the contour. The undercut (a tool that cannot follow the profile) is not decided here, see
 * `insert.ts`.
 */
export const offsetContour = (contour: ReadonlyArray<RZ>, radius: number, free: FreeSide): RZ[] => {
  const pts: RZ[] = []
  for (const p of contour) {
    const last = pts[pts.length - 1]
    if (last === undefined || Math.hypot(p.z - last.z, p.r - last.r) > 1e-9) pts.push(p)
  }
  if (radius <= 0 || pts.length < 2) return pts.map((p) => ({ ...p }))
  // Unit travel directions and the free-side normals: for travel v = (vz, vr) the air of an external profile is on the right.
  const seg = pts.slice(1).map((b, i) => {
    const a = pts[i]!
    const l = Math.hypot(b.z - a.z, b.r - a.r)
    const v = { z: (b.z - a.z) / l, r: (b.r - a.r) / l }
    return { v, n: free === "above" ? { z: v.r, r: -v.z } : { z: -v.r, r: v.z } }
  })
  const out: RZ[] = [{ z: pts[0]!.z + radius * seg[0]!.n.z, r: pts[0]!.r + radius * seg[0]!.n.r }]
  for (let i = 1; i < pts.length - 1; i++) {
    const s0 = seg[i - 1]!, s1 = seg[i]!
    const p = pts[i]!
    const cross = s0.v.z * s1.v.r - s0.v.r * s1.v.z
    // Air on the right (external): a left turn opens a gap on the offset side (a convex corner of the material).
    const convex = free === "above" ? cross > 1e-12 : cross < -1e-12
    const concave = free === "above" ? cross < -1e-12 : cross > 1e-12
    if (convex) {
      const a0 = Math.atan2(s0.n.r, s0.n.z)
      let a1 = Math.atan2(s1.n.r, s1.n.z)
      // Sweep the short way round the vertex, in the direction of the turn.
      let delta = a1 - a0
      while (delta > Math.PI) delta -= 2 * Math.PI
      while (delta < -Math.PI) delta += 2 * Math.PI
      a1 = a0 + delta
      const steps = Math.max(1, Math.ceil(Math.abs(delta) / ((4 * Math.PI) / 180)))
      for (let k = 0; k <= steps; k++) {
        const a = a0 + (delta * k) / steps
        out.push({ z: p.z + radius * Math.cos(a), r: p.r + radius * Math.sin(a) })
      }
    } else if (concave) {
      // Intersection of the two offset lines: p + r (n0 + n1) / (1 + n0 . n1).
      const dot = s0.n.z * s1.n.z + s0.n.r * s1.n.r
      const k = radius / Math.max(1 + dot, 1e-6)
      out.push({ z: p.z + k * (s0.n.z + s1.n.z), r: p.r + k * (s0.n.r + s1.n.r) })
    } else out.push({ z: p.z + radius * s0.n.z, r: p.r + radius * s0.n.r })
  }
  const lastSeg = seg[seg.length - 1]!
  const end = pts[pts.length - 1]!
  out.push({ z: end.z + radius * lastSeg.n.z, r: end.r + radius * lastSeg.n.r })
  return out
}

// ------------------------------------------------------------------------------------------------- raster

/** A shape stamped along a path: a circle (the nose of a turning insert) or a rounded rectangle (a grooving or parting blade). */
export type ToolShape =
  | { readonly kind: "circle"; readonly radius: number }
  /** `width` along z, `height` along r (towards the shank, the blade is that long); the reference point is the +z, tip corner. Corners rounded by `corner`. */
  | { readonly kind: "blade"; readonly width: number; readonly height: number; readonly corner: number }
  /** A closed polygon (the silhouette of an insert: nose arc and both edges) in (z, r) relative to the reference point. */
  | { readonly kind: "polygon"; readonly points: ReadonlyArray<RZ> }

/**
 * Occupancy of a revolved region on a (z, r) grid: one byte per cell, 1 = material. Volumes are the revolved cell areas,
 * `2 π r_c · c²`, with the error that comes with a cell (relative `c / r` at the surface, so a cell of 0.05 mm on a 20 mm part is
 * a quarter of a per cent of the surface layer, not of the volume).
 */
export class LatheRaster {
  readonly data: Uint8Array
  readonly nz: number
  readonly nr: number

  constructor(readonly zMin: number, readonly zMax: number, readonly rMax: number, readonly cell: number) {
    this.nz = Math.max(1, Math.ceil((zMax - zMin) / cell))
    this.nr = Math.max(1, Math.ceil(rMax / cell))
    if (this.nz * this.nr > 40_000_000) throw new RangeError(`the lathe raster would have ${this.nz * this.nr} cells: use a larger cell`)
    this.data = new Uint8Array(this.nz * this.nr)
  }

  zOf(i: number): number { return this.zMin + (i + 0.5) * this.cell }
  rOf(j: number): number { return (j + 0.5) * this.cell }

  /** Fills the cells with `lo(z) <= r <= hi(z)`. */
  fill(lo: (z: number) => number, hi: (z: number) => number): void {
    for (let i = 0; i < this.nz; i++) {
      const z = this.zOf(i)
      const a = lo(z), b = hi(z)
      for (let j = 0; j < this.nr; j++) {
        const r = this.rOf(j)
        if (r >= a && r <= b) this.data[i * this.nr + j] = 1
      }
    }
  }

  /** Volume of the cells selected by `mask` (default: the material), mm³. */
  volume(mask?: (z: number, r: number, k: number) => boolean): number {
    let v = 0
    const area = this.cell * this.cell
    for (let i = 0; i < this.nz; i++) {
      const z = this.zOf(i)
      for (let j = 0; j < this.nr; j++) {
        const k = i * this.nr + j
        if (this.data[k] === 0) continue
        const r = this.rOf(j)
        if (mask === undefined || mask(z, r, k)) v += 2 * Math.PI * r * area
      }
    }
    return v
  }

  /** Number of material cells under the shape at `(z, r)` (reference point). */
  overlap(shape: ToolShape, z: number, r: number): number {
    return this.visit(shape, z, r, false)
  }

  /** Removes the material under the shape at `(z, r)`; returns the number of cells removed. */
  stamp(shape: ToolShape, z: number, r: number): number {
    return this.visit(shape, z, r, true)
  }

  private visit(shape: ToolShape, z: number, r: number, remove: boolean): number {
    let z0: number, z1: number, r0: number, r1: number
    if (shape.kind === "circle") { z0 = z - shape.radius; z1 = z + shape.radius; r0 = r - shape.radius; r1 = r + shape.radius }
    else if (shape.kind === "polygon") {
      z0 = Infinity; z1 = -Infinity; r0 = Infinity; r1 = -Infinity
      for (const q of shape.points) { z0 = Math.min(z0, z + q.z); z1 = Math.max(z1, z + q.z); r0 = Math.min(r0, r + q.r); r1 = Math.max(r1, r + q.r) }
    } else { z0 = z - shape.width; z1 = z; r0 = r; r1 = r + shape.height }
    const i0 = Math.max(0, Math.floor((z0 - this.zMin) / this.cell)), i1 = Math.min(this.nz - 1, Math.floor((z1 - this.zMin) / this.cell))
    const j0 = Math.max(0, Math.floor(r0 / this.cell)), j1 = Math.min(this.nr - 1, Math.floor(r1 / this.cell))
    let n = 0
    for (let i = i0; i <= i1; i++) {
      const cz = this.zOf(i)
      for (let j = j0; j <= j1; j++) {
        const k = i * this.nr + j
        if (this.data[k] === 0) continue
        const cr = this.rOf(j)
        let inside: boolean
        if (shape.kind === "circle") inside = (cz - z) * (cz - z) + (cr - r) * (cr - r) <= shape.radius * shape.radius
        else if (shape.kind === "polygon") {
          // Crossing number of a ray towards +z from the cell centre against the polygon edges.
          inside = false
          const pts = shape.points
          for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
            const za = z + pts[a]!.z, ra = r + pts[a]!.r, zb = z + pts[b]!.z, rb = r + pts[b]!.r
            if ((ra > cr) !== (rb > cr) && cz < ((zb - za) * (cr - ra)) / (rb - ra) + za) inside = !inside
          }
        } else {
          // Rounded rectangle [z - w, z] x [r, r + h]: distance of the cell to the inner rectangle shrunk by the corner.
          const c = Math.min(shape.corner, shape.width / 2, shape.height / 2)
          const dz = Math.max(z - shape.width + c - cz, 0, cz - (z - c))
          const dr = Math.max(r + c - cr, 0, cr - (r + shape.height))
          inside = cz >= z - shape.width && cz <= z && cr >= r && cr <= r + shape.height && dz * dz + dr * dr <= c * c + 1e-12
        }
        if (!inside) continue
        n++
        if (remove) this.data[k] = 0
      }
    }
    return n
  }

  /**
   * Moves the shape from `a` to `b` in steps of one cell. With `remove` the swept material goes and the result is the number of cells
   * removed; without it nothing changes and the result is the largest number of material cells under the shape at any step.
   */
  sweep(shape: ToolShape, a: RZ, b: RZ, remove: boolean): number {
    const len = Math.hypot(b.z - a.z, b.r - a.r)
    const steps = Math.max(1, Math.ceil(len / this.cell))
    let n = 0
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const z = a.z + (b.z - a.z) * t, r = a.r + (b.r - a.r) * t
      if (remove) n += this.stamp(shape, z, r)
      else n = Math.max(n, this.visit(shape, z, r, false))
    }
    return n
  }
}

/**
 * The profile a turning tool can follow: an external contour (face to chuck) loses every pocket whose entering wall falls faster than
 * `maxDescend` degrees (a groove, a step the tool cannot reach from this side) and that rises back to the radius it left; the pocket is
 * bridged at that radius. A step down that never returns (the end of the part) stays. For a bore (`free` = `below`) the same with the
 * radius sense reversed. The pockets are the work of a grooving tool.
 */
export const turningEnvelope = (contour: ReadonlyArray<RZ>, maxDescend: number, free: FreeSide = "above"): { readonly profile: RZ[]; readonly bridged: ReadonlyArray<{ readonly z0: number; readonly z1: number; readonly r: number }> } => {
  const sign = free === "above" ? 1 : -1
  const out: RZ[] = []
  const bridged: Array<{ z0: number; z1: number; r: number }> = []
  const limit = Math.tan((maxDescend * Math.PI) / 180)
  let i = 0
  while (i < contour.length) {
    const p = contour[i]!
    out.push(p)
    const q = contour[i + 1]
    if (q !== undefined) {
      const toward = p.z - q.z
      const fall = sign * (p.r - q.r)
      if (fall > 1e-9 && (toward < 1e-9 || fall / toward > limit + 1e-9)) {
        // A wall the tool cannot cut from this side: look for the point where the contour is back at this radius.
        let k = i + 1
        while (k < contour.length && sign * (contour[k]!.r - p.r) < -1e-9) k++
        if (k < contour.length) {
          const a = contour[k - 1]!, b = contour[k]!
          const t = Math.abs(b.r - a.r) < 1e-12 ? 0 : (p.r - a.r) / (b.r - a.r)
          const back = { z: a.z + (b.z - a.z) * t, r: p.r }
          bridged.push({ z0: p.z, z1: back.z, r: p.r })
          out.push(back)
          i = k
          continue
        }
      }
    }
    i++
  }
  return { profile: out, bridged }
}
