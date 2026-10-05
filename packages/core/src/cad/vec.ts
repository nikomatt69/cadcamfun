/**
 * Immutable 2D/3D vector primitives. Plain objects (no classes) so they pass
 * through JSON and Schema unchanged. Units are millimetres / radians.
 */

export interface Vec2 {
  readonly x: number
  readonly y: number
}

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Default geometric epsilon (mm for lengths, radians for angles). */
export const EPS = 1e-9

export const TAU = Math.PI * 2

export const approxEq = (a: number, b: number, eps: number = EPS): boolean => Math.abs(a - b) <= eps

export const vec2 = (x: number, y: number): Vec2 => ({ x, y })
export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })

export const ZERO2: Vec2 = { x: 0, y: 0 }
export const ZERO3: Vec3 = { x: 0, y: 0, z: 0 }

// ---------------------------------------------------------------- 2D

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
/** Z component of the 3D cross product of two planar vectors. */
export const cross2 = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
export const length = (a: Vec2): number => Math.hypot(a.x, a.y)
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Unit vector; the zero vector is returned unchanged (no NaN). */
export const normalize = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y)
  return l === 0 ? a : { x: a.x / l, y: a.y / l }
}

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
})

/** Rotates `v` counter-clockwise by `angle` radians around `origin` (default: the origin). */
export const rotate = (v: Vec2, angle: number, origin: Vec2 = ZERO2): Vec2 => {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const dx = v.x - origin.x
  const dy = v.y - origin.y
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c }
}

/** Polar angle in radians, in (-π, π]. */
export const angleOf = (v: Vec2): number => Math.atan2(v.y, v.x)

export const fromPolar = (radius: number, angle: number): Vec2 => ({
  x: radius * Math.cos(angle),
  y: radius * Math.sin(angle)
})

export const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x })
export const negate = (a: Vec2): Vec2 => ({ x: -a.x, y: -a.y })
export const vecApproxEq = (a: Vec2, b: Vec2, eps: number = EPS): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps

// ---------------------------------------------------------------- 3D

export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
})
export const length3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
export const distance3 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
export const normalize3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z)
  return l === 0 ? a : { x: a.x / l, y: a.y / l, z: a.z / l }
}
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t
})
