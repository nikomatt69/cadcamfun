/**
 * The part a simulated probe touches (spec 73 §5.10): analytic worlds for exact tests (a box, a plate with bores, a boss, a sphere, a
 * plane) and the part's triangle meshes, each placed on the machine by a `Placement` (where the stock really sits). Coordinates are
 * the machine's; the stylus is the ball at the tip of the probe.
 */
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import { boxSurface, cylinderWallSurface, discSurface, faceSurface, meshSurface, planeSurface, sphereSurface, sweepSphere, unionSurface, type Surface } from "./sphere-cast.ts"

/** How the part sits: rotated about the vertical through the origin by `rotate` (radians), then shifted by `translate`. */
export interface Placement {
  readonly translate: Vec3
  readonly rotate?: number
}

export interface StylusBall {
  /** Radius at which the probe triggers in this direction (the ball radius less the pre-travel), mm. */
  readonly radius: number
  /** Distance from the tip to the ball centre along the tool axis (the ball radius), mm. */
  readonly centre: number
  /** Tool axis in the world, unit; default +Z. */
  readonly axis?: Vec3
}

export interface ProbeWorld3 {
  /** The first contact of the stylus moving with its tip from `from` to `to`: the tip there and the surface normal, or a free path. */
  readonly touch: (from: Vec3, to: Vec3, stylus: StylusBall) => { readonly tip: Vec3; readonly normal: Vec3; readonly travelled: number } | undefined
}

const placeInverse = (p: Placement | undefined) => (q: Vec3): Vec3 => {
  if (p === undefined) return q
  const x = q.x - p.translate.x, y = q.y - p.translate.y, z = q.z - p.translate.z
  const r = p.rotate ?? 0
  const c = Math.cos(r), s = Math.sin(r)
  return { x: c * x + s * y, y: -s * x + c * y, z }
}
const placeDir = (p: Placement | undefined) => (v: Vec3): Vec3 => {
  const r = p?.rotate ?? 0
  const c = Math.cos(r), s = Math.sin(r)
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y, z: v.z }
}
const unplaceDir = (p: Placement | undefined) => (v: Vec3): Vec3 => {
  const r = p?.rotate ?? 0
  const c = Math.cos(r), s = Math.sin(r)
  return { x: c * v.x + s * v.y, y: -s * v.x + c * v.y, z: v.z }
}

/** A world made of surfaces given in the part's own coordinates, placed on the machine. */
export const surfaceWorld = (surface: Surface, placement?: Placement): ProbeWorld3 => {
  const toPart = placeInverse(placement)
  const back = placeDir(placement)
  const dirToPart = unplaceDir(placement)
  return {
    touch: (from, to, stylus) => {
      const axis = dirToPart(stylus.axis ?? { x: 0, y: 0, z: 1 })
      const a = toPart(from), b = toPart(to)
      const c0 = { x: a.x + axis.x * stylus.centre, y: a.y + axis.y * stylus.centre, z: a.z + axis.z * stylus.centre }
      const c1 = { x: b.x + axis.x * stylus.centre, y: b.y + axis.y * stylus.centre, z: b.z + axis.z * stylus.centre }
      const hit = sweepSphere(surface, c0, c1, stylus.radius)
      if (hit === undefined) return undefined
      const L = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
      const k = L === 0 ? 0 : hit.t / L
      return { tip: { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k }, normal: back(hit.normal), travelled: hit.t }
    }
  }
}

/** A solid block `min..max`. */
export const boxWorld = (min: Vec3, max: Vec3, placement?: Placement): ProbeWorld3 => surfaceWorld(boxSurface(min, max), placement)

/** A vertical cylinder: a boss standing from `z0` to `z1` (`inside: false`, with its top), or a bore of that depth (`inside: true`, with its floor). */
export const cylinderWorld = (c: { readonly centre: Vec2; readonly radius: number; readonly z0: number; readonly z1: number; readonly inside: boolean }, placement?: Placement): ProbeWorld3 =>
  surfaceWorld(unionSurface([cylinderWallSurface(c.centre, c.radius, c.z0, c.z1), discSurface(c.centre, c.radius, c.inside ? c.z0 : c.z1)]), placement)

/** A plate `min..max` with through bores (walls from the bottom to the top) and bosses on top, the shape of most probed parts. */
export const plateWorld = (p: {
  readonly min: Vec3
  readonly max: Vec3
  readonly bores?: ReadonlyArray<{ readonly centre: Vec2; readonly radius: number }>
  readonly bosses?: ReadonlyArray<{ readonly centre: Vec2; readonly radius: number; readonly height: number }>
}, placement?: Placement): ProbeWorld3 => {
  const bores = p.bores ?? []
  const s: Surface[] = [
    faceSurface({ x: p.min.x, y: p.min.y }, { x: p.max.x, y: p.max.y }, p.max.z, bores),
    faceSurface({ x: p.min.x, y: p.min.y }, { x: p.max.x, y: p.max.y }, p.min.z, bores),
    // the four sides
    faceSide(p.min, p.max)
  ]
  for (const b of bores) s.push(cylinderWallSurface(b.centre, b.radius, p.min.z, p.max.z))
  for (const b of p.bosses ?? []) s.push(cylinderWallSurface(b.centre, b.radius, p.max.z, p.max.z + b.height), discSurface(b.centre, b.radius, p.max.z + b.height))
  return surfaceWorld(unionSurface(s), placement)
}

/** The four vertical sides of a block (its box surface without top and bottom). */
const faceSide = (min: Vec3, max: Vec3): Surface => {
  return {
    bounds: { min, max },
    nearest: (p) => {
      // Nearest on each side rectangle, clamped.
      const clampY = Math.max(min.y, Math.min(max.y, p.y)), clampX = Math.max(min.x, Math.min(max.x, p.x)), clampZ = Math.max(min.z, Math.min(max.z, p.z))
      const cands: Vec3[] = [{ x: min.x, y: clampY, z: clampZ }, { x: max.x, y: clampY, z: clampZ }, { x: clampX, y: min.y, z: clampZ }, { x: clampX, y: max.y, z: clampZ }]
      let best = { distance: Infinity, point: p }
      for (const q of cands) { const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); if (d < best.distance) best = { distance: d, point: q } }
      return best
    }
  }
}

export const sphereWorld = (centre: Vec3, radius: number, placement?: Placement): ProbeWorld3 => surfaceWorld(sphereSurface(centre, radius), placement)

/** An unbounded plane (a table, a datum face). */
export const planeWorld = (point: Vec3, normal: Vec3, placement?: Placement): ProbeWorld3 => {
  const l = Math.hypot(normal.x, normal.y, normal.z)
  return surfaceWorld(planeSurface(point, { x: normal.x / l, y: normal.y / l, z: normal.z / l }), placement)
}

/** The part as triangle meshes (its own coordinates), placed. */
export const meshWorld = (meshes: ReadonlyArray<{ readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }>, placement?: Placement): ProbeWorld3 =>
  surfaceWorld(meshSurface(meshes), placement)

/** Several worlds at once: the first contact of any. */
export const unionWorld = (worlds: ReadonlyArray<ProbeWorld3>): ProbeWorld3 => ({
  touch: (from, to, stylus) => {
    let best: ReturnType<ProbeWorld3["touch"]>
    for (const w of worlds) {
      const hit = w.touch(from, to, stylus)
      if (hit !== undefined && (best === undefined || hit.travelled < best.travelled)) best = hit
    }
    return best
  }
})
