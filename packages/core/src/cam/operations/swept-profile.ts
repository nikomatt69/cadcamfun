/**
 * Swept-profile (form) cutter model (spec 72 P2-4): a cutter defined by its profile, a polyline of (r, z) points from the tip on the
 * axis up, revolved about the spindle axis. Covers barrel, lens, tapered-ball, lollipop and any form tool that the named kinds
 * (flat, ball, bull, ...) cannot describe.
 *
 *  - `sweptProfile` validates the profile (starts on the axis, z strictly increasing, radii >= 0, bounded point count).
 *  - `radiusAt(z)`: the cutter's radius at a height above the tip.
 *  - `clearsWall`: whether a vertical wall at distance `d` from the axis would be touched (the profile reaches that radius within
 *    the flute length).
 *  - `ballProfile`, `barrelProfile`, `lollipopProfile`, `taperedBallProfile`: generators from the usual catalogue parameters.
 *  - `toAssemblyProfile`: the same profile as the kernel's holder/collision `AssemblyProfile`, so collision checks use it unchanged.
 * Pure geometry; picking the cutter-location point for a surface contact (offset along the profile's normal) is the next step and
 * is not claimed here.
 */
import type { AssemblyProfile, ProfilePoint } from "../kernel/assembly.ts"

export interface SweptProfile {
  readonly points: ReadonlyArray<ProfilePoint>
  readonly maxRadius: number
  readonly height: number
}

export const MAX_PROFILE_POINTS = 2000

/** Validates and wraps a profile. Throws a RangeError naming the first problem. */
export const sweptProfile = (points: ReadonlyArray<ProfilePoint>): SweptProfile => {
  if (points.length < 2) throw new RangeError("a swept profile needs at least two points")
  if (points.length > MAX_PROFILE_POINTS) throw new RangeError(`a swept profile is limited to ${MAX_PROFILE_POINTS} points`)
  if (Math.abs(points[0]!.z) > 1e-9) throw new RangeError("the profile must start at the tip, z = 0")
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    if (!Number.isFinite(p.r) || !Number.isFinite(p.z)) throw new RangeError(`profile point ${i} is not finite`)
    if (p.r < 0) throw new RangeError(`profile point ${i} has a negative radius`)
    if (i > 0 && p.z < points[i - 1]!.z - 1e-12) throw new RangeError(`profile point ${i} goes back down: z must not decrease (undercut profiles are not cutters of revolution this model can sweep)`)
  }
  if (points.every((p) => p.r === 0)) throw new RangeError("the profile has no radius anywhere")
  return { points, maxRadius: Math.max(...points.map((p) => p.r)), height: points[points.length - 1]!.z }
}

/** Radius at height `z` above the tip; 0 above the profile's end and below the tip. */
export const radiusAt = (p: SweptProfile, z: number): number => {
  if (z < 0 || z > p.height + 1e-12) return 0
  for (let i = 0; i + 1 < p.points.length; i++) {
    const a = p.points[i]!, b = p.points[i + 1]!
    if (z <= b.z + 1e-12) return b.z - a.z < 1e-12 ? Math.max(a.r, b.r) : a.r + ((b.r - a.r) * (z - a.z)) / (b.z - a.z)
  }
  return 0
}

/** Volume of the solid of revolution (frustum sum), mm^3. */
export const profileVolume = (p: SweptProfile): number => {
  let v = 0
  for (let i = 0; i + 1 < p.points.length; i++) {
    const a = p.points[i]!, b = p.points[i + 1]!
    v += (Math.PI / 3) * (b.z - a.z) * (a.r * a.r + a.r * b.r + b.r * b.r)
  }
  return v
}

/** Does the cutter reach a point at radius `r` from the axis and height `z` above its tip (the point is inside or on the cutter)? */
export const contains = (p: SweptProfile, r: number, z: number): boolean => r <= radiusAt(p, z) + 1e-9

const arc = (cx: number, cz: number, radius: number, from: number, to: number, steps: number): ProfilePoint[] =>
  Array.from({ length: steps + 1 }, (_, i) => { const a = from + ((to - from) * i) / steps; return { r: Math.max(0, cx + radius * Math.cos(a)), z: cz + radius * Math.sin(a) } })

/** A ball end: hemisphere of radius `d / 2` then a straight shank of `length`. */
export const ballProfile = (diameter: number, length: number, steps = 24): SweptProfile => {
  const r = diameter / 2
  if (length < r) throw new RangeError("the length must cover the hemisphere")
  return sweptProfile([...arc(0, r, r, -Math.PI / 2, 0, steps), { r, z: length }])
}

/** A barrel: a large-radius arc of radius `arcRadius` bulging to `diameter / 2` over `height`, flat-ended. */
export const barrelProfile = (diameter: number, height: number, arcRadius: number, steps = 24): SweptProfile => {
  const r = diameter / 2
  if (arcRadius <= height / 2) throw new RangeError("a barrel arc must be larger than half its height")
  // arc centred at (r - arcRadius, height / 2): the bulge touches radius r at mid height
  const cx = r - arcRadius
  const half = Math.asin(height / 2 / arcRadius)
  const pts = arc(cx, height / 2, arcRadius, -half, half, steps)
  return sweptProfile([{ r: 0, z: 0 }, ...pts])
}

/** A lollipop: sphere of `ballDiameter` on a thinner neck of `neckDiameter` and `neckLength`. */
export const lollipopProfile = (ballDiameter: number, neckDiameter: number, neckLength: number, steps = 24): SweptProfile => {
  const R = ballDiameter / 2, n = neckDiameter / 2
  if (n >= R) throw new RangeError("a lollipop neck must be thinner than its ball")
  // the sphere is cut off where it meets the neck (z above the equator)
  const zNeck = R + Math.sqrt(R * R - n * n)
  const upper = arc(0, R, R, 0, Math.asin(Math.sqrt(R * R - n * n) / R), Math.max(2, Math.floor(steps / 2)))
  return sweptProfile([...arc(0, R, R, -Math.PI / 2, 0, steps), ...upper.slice(1), { r: n, z: zNeck }, { r: n, z: zNeck + neckLength }])
}

/** A tapered ball end: ball of `tipDiameter` blending into a cone of half angle `halfAngleDeg` up to `diameter` at `height`. */
export const taperedBallProfile = (tipDiameter: number, halfAngleDeg: number, diameter: number, height: number, steps = 16): SweptProfile => {
  const rt = tipDiameter / 2, a = (halfAngleDeg * Math.PI) / 180
  const top = diameter / 2
  // tangent point of the cone on the ball: ball centre at z = rt; the cone flank leans outward at angle a from the axis
  const tz = rt - rt * Math.sin(a), tr = rt * Math.cos(a)
  const ball = arc(0, rt, rt, -Math.PI / 2, -a, steps)
  const zTop = tz + (top - tr) / Math.tan(a)
  if (zTop > height + 1e-9) throw new RangeError("the cone reaches the diameter above the stated height")
  return sweptProfile([...ball, { r: top, z: zTop }, { r: top, z: height }])
}

/** The profile as an assembly profile of cutting segments (no shank or holder), for the kernel's collision checks. */
export const toAssemblyProfile = (p: SweptProfile): AssemblyProfile => ({
  points: p.points, parts: p.points.slice(1).map(() => "cutting" as const), length: p.height, assumedHolder: false
})
