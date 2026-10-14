/**
 * 3D tool assemblies (spec 29 §3 ToolAssemblySnapshot, §5 "derive tip/contact offsets and usable cutting zones from the
 * full cutter profile"): the half-section of a cutter from its tip up — cutting zone, shank and holder — and its solid of
 * revolution, so the viewport, the simulation and the tool library draw the same tool the replay checks.
 *
 *   profile   (r, z) polyline from the tip on the axis (z = 0) to the top of the holder on the axis; each segment tagged
 *             with the part it belongs to (cutting / shank / holder)
 *   mesh      the profile revolved about +Z, one mesh per part (flat-shaded per profile segment, smooth around the axis)
 *
 * Millimetres, tool coordinates: the tip at the origin, the spindle axis +Z. A holder the cutter does not describe is drawn
 * only when asked (`assumeHolder`) and is flagged `assumed`, never mistaken for modelled geometry.
 */
import type { Cutter } from "./cutters.ts"

export type AssemblyPart = "cutting" | "shank" | "holder"

export interface ProfilePoint { readonly r: number; readonly z: number }

export interface AssemblyProfile {
  /** Polyline from the tip on the axis to the top on the axis. */
  readonly points: ReadonlyArray<ProfilePoint>
  /** Part of the segment from `points[i]` to `points[i + 1]`. */
  readonly parts: ReadonlyArray<AssemblyPart>
  /** Total length from the tip to the top of the holder (or the shank), mm. */
  readonly length: number
  /** The holder is a generic one drawn because the cutter has none. */
  readonly assumedHolder: boolean
}

export interface AssemblyMesh {
  readonly part: AssemblyPart
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly indices: Uint32Array
  readonly assumed: boolean
}

const ARC_STEPS = 10

const arc = (cr: number, cz: number, radius: number, from: number, to: number, steps = ARC_STEPS): ProfilePoint[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps
    return { r: cr + radius * Math.cos(a), z: cz + radius * Math.sin(a) }
  })

/** The cutting zone from the tip (on the axis) to the top of the flutes at the cutting radius. */
const cuttingZone = (c: Cutter): ProfilePoint[] => {
  const R = c.diameter / 2
  const top = Math.max(c.fluteLength, 1e-3)
  switch (c.kind) {
    case "ball": {
      const pts = arc(0, R, R, -Math.PI / 2, 0)
      return [...pts, { r: R, z: Math.max(top, R) }]
    }
    case "bull": {
      const rc = Math.min(Math.max(c.cornerRadius ?? 0, 0), R)
      if (rc <= 1e-9) return [{ r: 0, z: 0 }, { r: R, z: 0 }, { r: R, z: top }]
      return [{ r: 0, z: 0 }, ...arc(R - rc, rc, rc, -Math.PI / 2, 0), { r: R, z: Math.max(top, rc) }]
    }
    case "chamfer":
    case "spot":
    case "engraver": {
      const half = (((c.angle ?? 90) / 2) * Math.PI) / 180
      const tip = c.kind === "spot" ? 0 : Math.min(Math.max(c.tipDiameter ?? 0, 0) / 2, R)
      const coneHeight = (R - tip) / Math.max(Math.tan(half), 1e-6)
      return [{ r: 0, z: 0 }, ...(tip > 0 ? [{ r: tip, z: 0 }] : []), { r: R, z: coneHeight }, ...(top > coneHeight + 1e-9 ? [{ r: R, z: top }] : [])]
    }
    case "drill": {
      const half = (((c.angle ?? 140) / 2) * Math.PI) / 180
      const point = R / Math.max(Math.tan(half), 1e-6)
      return [{ r: 0, z: 0 }, { r: R, z: point }, { r: R, z: Math.max(top, point) }]
    }
    case "flat":
    case "facemill":
    case "threadmill":
      return [{ r: 0, z: 0 }, { r: R, z: 0 }, { r: R, z: top }]
  }
}

/** A generic collet holder for a shank: what the viewport may draw when the cutter does not describe one. */
export const genericHolder = (c: Cutter): { readonly diameter: number; readonly length: number } =>
  ({ diameter: Math.round(Math.max(c.shankDiameter * 1.6 + 12, 22)), length: 45 })

/** The half-section of a tool assembly. */
export const assemblyProfile = (c: Cutter, options: { readonly assumeHolder?: boolean } = {}): AssemblyProfile => {
  const points: ProfilePoint[] = []
  const parts: AssemblyPart[] = []
  const push = (p: ProfilePoint, part: AssemblyPart): void => {
    const last = points[points.length - 1]
    if (last !== undefined && Math.abs(last.r - p.r) < 1e-9 && Math.abs(last.z - p.z) < 1e-9) return
    if (last !== undefined) parts.push(part)
    points.push({ r: Math.max(0, p.r), z: p.z })
  }
  for (const p of cuttingZone(c)) push(p, "cutting")
  const R = c.diameter / 2
  const Rs = Math.max(c.shankDiameter / 2, 1e-3)
  const fluteTop = points[points.length - 1]!.z
  const stickout = Math.max(c.stickout, fluteTop + 1e-3)
  // Shank: a 45° step from the cutting diameter to the shank (necked or stepped tools), then straight to the holder face.
  const step = Math.min(Math.abs(R - Rs), Math.max(0, stickout - fluteTop))
  if (Math.abs(R - Rs) > 1e-9) push({ r: Rs, z: fluteTop + step }, "shank")
  push({ r: Rs, z: stickout }, "shank")
  const holder = c.holder ?? (options.assumeHolder === true ? genericHolder(c) : undefined)
  let length = stickout
  if (holder !== undefined) {
    const Rh = Math.max(holder.diameter / 2, Rs)
    push({ r: Rh, z: stickout }, "holder")
    push({ r: Rh, z: stickout + holder.length }, "holder")
    push({ r: 0, z: stickout + holder.length }, "holder")
    length = stickout + holder.length
  } else {
    push({ r: 0, z: stickout }, "shank")
  }
  return { points, parts, length, assumedHolder: c.holder === undefined && holder !== undefined }
}

/**
 * The assembly revolved about +Z with `segments` facets around, one mesh per part. Each profile segment owns its two rings,
 * so a corner of the profile stays sharp while the surface is smooth around the axis.
 */
export const assemblyMeshes = (c: Cutter, options: { readonly assumeHolder?: boolean; readonly segments?: number } = {}): ReadonlyArray<AssemblyMesh> => {
  const profile = assemblyProfile(c, options)
  const n = Math.max(6, Math.min(256, Math.round(options.segments ?? 48)))
  const cos = Array.from({ length: n + 1 }, (_, k) => Math.cos((2 * Math.PI * k) / n))
  const sin = Array.from({ length: n + 1 }, (_, k) => Math.sin((2 * Math.PI * k) / n))
  const out: AssemblyMesh[] = []
  for (const part of ["cutting", "shank", "holder"] as const) {
    const positions: number[] = [], normals: number[] = [], indices: number[] = []
    for (let i = 0; i + 1 < profile.points.length; i++) {
      if (profile.parts[i] !== part) continue
      const a = profile.points[i]!, b = profile.points[i + 1]!
      const dr = b.r - a.r, dz = b.z - a.z
      const len = Math.hypot(dr, dz)
      if (len < 1e-12) continue
      // Outward normal of the segment in the (r, z) half plane: the profile runs tip -> top with the material on its left.
      const nr = dz / len, nz = -dr / len
      const base = positions.length / 3
      for (const p of [a, b]) {
        for (let k = 0; k <= n; k++) {
          positions.push(p.r * cos[k]!, p.r * sin[k]!, p.z)
          normals.push(nr * cos[k]!, nr * sin[k]!, nz)
        }
      }
      for (let k = 0; k < n; k++) {
        const i0 = base + k, i1 = base + k + 1, j0 = base + n + 1 + k, j1 = base + n + 2 + k
        indices.push(i0, i1, j1, i0, j1, j0)
      }
    }
    if (indices.length > 0) out.push({ part, positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices), assumed: part === "holder" && profile.assumedHolder })
  }
  return out
}

/** Volume of the solid of revolution of a profile (Pappus on each segment), mm³: a closed-form check of the mesh. */
export const assemblyVolume = (profile: AssemblyProfile, part?: AssemblyPart): number => {
  let v = 0
  for (let i = 0; i + 1 < profile.points.length; i++) {
    if (part !== undefined && profile.parts[i] !== part) continue
    const a = profile.points[i]!, b = profile.points[i + 1]!
    // Frustum swept by the segment between z_a and z_b against the axis: π/3 (z_b - z_a)(r_a² + r_a r_b + r_b²).
    v += (Math.PI / 3) * (b.z - a.z) * (a.r * a.r + a.r * b.r + b.r * b.r)
  }
  return v
}
