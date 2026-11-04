/**
 * Where a moving stylus ball first touches a surface (spec 73 §5.10). A surface is anything that answers its nearest point; the ball
 * is swept by sphere tracing: from the ball centre, the distance to the nearest surface point less the ball radius is a step the ball
 * can always take without touching (the distance is exact, so the step never crosses the surface), and the steps converge on the
 * contact. Exact for exact distances, to 1e-12 mm; nothing is sampled along the path, so a thin wall or a corner cannot be skipped.
 */
import type { Vec2, Vec3 } from "../../cad/vec.ts"

export interface Nearest {
  readonly distance: number
  readonly point: Vec3
}

/** A surface the ball can touch: its nearest point to `p` (unsigned distance). */
export interface Surface {
  readonly nearest: (p: Vec3) => Nearest
  /** Bounding box, when finite (the mesh BVH and a union skip far surfaces with it). */
  readonly bounds?: { readonly min: Vec3; readonly max: Vec3 }
}

export interface SweepHit {
  /** Distance travelled along the path to the contact. */
  readonly t: number
  /** Ball centre at contact. */
  readonly centre: Vec3
  /** Unit normal of the surface at the contact, pointing to the ball. */
  readonly normal: Vec3
  readonly point: Vec3
}

const CONTACT_EPS = 1e-12
const MAX_STEPS = 100_000
/** Distance over which a ball leaving the surface it starts on is not taken as touching it. */
const LEAVE = 1e-5

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)

/**
 * The first contact of a ball of `radius` whose centre moves from `from` to `to`, or undefined when it reaches `to` free. A ball that
 * already touches at `from` (it starts in contact) reports a contact at t = 0.
 */
export const sweepSphere = (surface: Surface, from: Vec3, to: Vec3, radius: number): SweepHit | undefined => {
  const path = sub(to, from)
  const L = len(path)
  const d = L > 0 ? { x: path.x / L, y: path.y / L, z: path.z / L } : { x: 0, y: 0, z: 0 }
  let t = 0
  for (let i = 0; i < MAX_STEPS; i++) {
    const c = { x: from.x + d.x * t, y: from.y + d.y * t, z: from.z + d.z * t }
    const q = surface.nearest(c)
    const gap = q.distance - radius
    if (gap <= CONTACT_EPS) {
      const n = sub(c, q.point)
      const nl = len(n)
      const normal = nl > 0 ? { x: n.x / nl, y: n.y / nl, z: n.z / nl } : { x: -d.x, y: -d.y, z: -d.z }
      // A ball that starts in contact and moves away from the surface leaves it (a retract from a touch): not a contact.
      if (t <= LEAVE && normal.x * d.x + normal.y * d.y + normal.z * d.z > 1e-9) { t = Math.min(L, t + 1e-7); if (t >= L) return undefined; continue }
      return { t, centre: c, point: q.point, normal }
    }
    if (t >= L) return undefined
    t = Math.min(L, t + gap)
  }
  // A path that grazes a surface for 100 000 steps comes closer than any probe resolves: it is treated as touching.
  const c = { x: from.x + d.x * t, y: from.y + d.y * t, z: from.z + d.z * t }
  const q = surface.nearest(c)
  const n = sub(c, q.point)
  const nl = len(n)
  return q.distance - radius <= 1e-9 ? { t, centre: c, point: q.point, normal: nl > 0 ? { x: n.x / nl, y: n.y / nl, z: n.z / nl } : { x: -d.x, y: -d.y, z: -d.z } } : undefined
}

// ---------------------------------------------------------------- nearest points of primitives

export const nearestOnSegment = (p: Vec3, a: Vec3, b: Vec3): Vec3 => {
  const ab = sub(b, a)
  const l2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / l2))
  return { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t }
}

/** Nearest point of a triangle (Ericson, Real-Time Collision Detection 5.1.5). */
export const nearestOnTriangle = (p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 => {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a)
  const dot = (u: Vec3, v: Vec3): number => u.x * v.x + u.y * v.y + u.z * v.z
  const d1 = dot(ab, ap), d2 = dot(ac, ap)
  if (d1 <= 0 && d2 <= 0) return a
  const bp = sub(p, b)
  const d3 = dot(ab, bp), d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return b
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return { x: a.x + ab.x * v, y: a.y + ab.y * v, z: a.z + ab.z * v } }
  const cp = sub(p, c)
  const d5 = dot(ab, cp), d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return c
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return { x: a.x + ac.x * w, y: a.y + ac.y * w, z: a.z + ac.z * w } }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6))
    return { x: b.x + (c.x - b.x) * w, y: b.y + (c.y - b.y) * w, z: b.z + (c.z - b.z) * w }
  }
  const denom = 1 / (va + vb + vc)
  const v = vb * denom, w = vc * denom
  return { x: a.x + ab.x * v + ac.x * w, y: a.y + ab.y * v + ac.y * w, z: a.z + ab.z * v + ac.z * w }
}

const nearest = (p: Vec3, q: Vec3): Nearest => ({ distance: len(sub(p, q)), point: q })

/** The surface of an axis-aligned box. */
export const boxSurface = (min: Vec3, max: Vec3): Surface => ({
  bounds: { min, max },
  nearest: (p) => {
    const inside = p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z
    if (!inside) return nearest(p, { x: Math.max(min.x, Math.min(max.x, p.x)), y: Math.max(min.y, Math.min(max.y, p.y)), z: Math.max(min.z, Math.min(max.z, p.z)) })
    const faces: Array<[number, Vec3]> = [
      [p.x - min.x, { ...p, x: min.x }], [max.x - p.x, { ...p, x: max.x }],
      [p.y - min.y, { ...p, y: min.y }], [max.y - p.y, { ...p, y: max.y }],
      [p.z - min.z, { ...p, z: min.z }], [max.z - p.z, { ...p, z: max.z }]
    ]
    let best = faces[0]!
    for (const f of faces) if (f[0] < best[0]) best = f
    return { distance: best[0], point: best[1] }
  }
})

/** A circle in a horizontal plane (the rim of a bore or a boss). */
const nearestOnCircle = (p: Vec3, c: Vec2, r: number, z: number): Vec3 => {
  const dx = p.x - c.x, dy = p.y - c.y
  const l = Math.hypot(dx, dy)
  return l === 0 ? { x: c.x + r, y: c.y, z } : { x: c.x + (dx * r) / l, y: c.y + (dy * r) / l, z }
}

/** The lateral surface of a vertical cylinder from z0 to z1 (a bore wall or a boss wall), without caps. */
export const cylinderWallSurface = (centre: Vec2, radius: number, z0: number, z1: number): Surface => ({
  bounds: { min: { x: centre.x - radius, y: centre.y - radius, z: Math.min(z0, z1) }, max: { x: centre.x + radius, y: centre.y + radius, z: Math.max(z0, z1) } },
  nearest: (p) => {
    const z = Math.max(Math.min(z0, z1), Math.min(Math.max(z0, z1), p.z))
    return nearest(p, nearestOnCircle({ ...p, z }, centre, radius, z))
  }
})

/** A horizontal disc (a boss top, a bore floor). */
export const discSurface = (centre: Vec2, radius: number, z: number): Surface => ({
  bounds: { min: { x: centre.x - radius, y: centre.y - radius, z }, max: { x: centre.x + radius, y: centre.y + radius, z } },
  nearest: (p) => {
    const dx = p.x - centre.x, dy = p.y - centre.y
    const l = Math.hypot(dx, dy)
    return nearest(p, l <= radius ? { x: p.x, y: p.y, z } : { x: centre.x + (dx * radius) / l, y: centre.y + (dy * radius) / l, z })
  }
})

/**
 * A horizontal face: the rectangle `min..max` (XY) at height `z` with circular holes (a plate top with bores in it). The nearest point
 * is the projection when it falls on the face, else the nearest point of its boundary (the rectangle's sides, the holes' rims).
 */
export const faceSurface = (min: Vec2, max: Vec2, z: number, holes: ReadonlyArray<{ readonly centre: Vec2; readonly radius: number }> = []): Surface => ({
  bounds: { min: { x: min.x, y: min.y, z }, max: { x: max.x, y: max.y, z } },
  nearest: (p) => {
    const inRect = p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y
    const inHole = holes.some((h) => Math.hypot(p.x - h.centre.x, p.y - h.centre.y) < h.radius)
    if (inRect && !inHole) return nearest(p, { x: p.x, y: p.y, z })
    let best: Nearest | undefined
    const consider = (q: Vec3): void => { const n = nearest(p, q); if (best === undefined || n.distance < best.distance) best = n }
    if (!inRect) consider({ x: Math.max(min.x, Math.min(max.x, p.x)), y: Math.max(min.y, Math.min(max.y, p.y)), z })
    for (const h of holes) consider(nearestOnCircle(p, h.centre, h.radius, z))
    return best!
  }
})

/** A sphere surface (a calibration ball). */
export const sphereSurface = (centre: Vec3, radius: number): Surface => ({
  bounds: { min: { x: centre.x - radius, y: centre.y - radius, z: centre.z - radius }, max: { x: centre.x + radius, y: centre.y + radius, z: centre.z + radius } },
  nearest: (p) => {
    const d = sub(p, centre)
    const l = len(d)
    return nearest(p, l === 0 ? { x: centre.x, y: centre.y, z: centre.z + radius } : { x: centre.x + (d.x * radius) / l, y: centre.y + (d.y * radius) / l, z: centre.z + (d.z * radius) / l })
  }
})

/** An unbounded plane through `point` with unit `normal`. */
export const planeSurface = (point: Vec3, normal: Vec3): Surface => ({
  nearest: (p) => {
    const s = (p.x - point.x) * normal.x + (p.y - point.y) * normal.y + (p.z - point.z) * normal.z
    return { distance: Math.abs(s), point: { x: p.x - s * normal.x, y: p.y - s * normal.y, z: p.z - s * normal.z } }
  }
})

const boxDistance = (p: Vec3, b: { readonly min: Vec3; readonly max: Vec3 }): number =>
  Math.hypot(Math.max(b.min.x - p.x, 0, p.x - b.max.x), Math.max(b.min.y - p.y, 0, p.y - b.max.y), Math.max(b.min.z - p.z, 0, p.z - b.max.z))

/** The nearest of several surfaces; a surface whose box is farther than the best found is skipped. */
export const unionSurface = (surfaces: ReadonlyArray<Surface>): Surface => ({
  nearest: (p) => {
    let best: Nearest = { distance: Infinity, point: p }
    const order = surfaces.map((s) => ({ s, lb: s.bounds === undefined ? 0 : boxDistance(p, s.bounds) })).sort((a, b) => a.lb - b.lb)
    for (const { s, lb } of order) {
      if (lb >= best.distance) break
      const n = s.nearest(p)
      if (n.distance < best.distance) best = n
    }
    return best
  }
})

// ---------------------------------------------------------------- triangle meshes

interface Node {
  readonly min: Vec3
  readonly max: Vec3
  readonly left?: Node
  readonly right?: Node
  readonly tris?: ReadonlyArray<number>
}

/** The surface of triangle meshes, with a bounding-volume hierarchy over the triangles. */
export const meshSurface = (meshes: ReadonlyArray<{ readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }>): Surface => {
  const tri: Array<[Vec3, Vec3, Vec3]> = []
  for (const m of meshes) {
    const v = (i: number): Vec3 => ({ x: m.positions[3 * i]!, y: m.positions[3 * i + 1]!, z: m.positions[3 * i + 2]! })
    for (let k = 0; k + 2 < m.indices.length; k += 3) tri.push([v(m.indices[k]!), v(m.indices[k + 1]!), v(m.indices[k + 2]!)])
  }
  const boxOf = (ids: ReadonlyArray<number>): { min: Vec3; max: Vec3 } => {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
    for (const i of ids) for (const p of tri[i]!) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); z1 = Math.max(z1, p.z) }
    return { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } }
  }
  const build = (ids: number[]): Node => {
    const b = boxOf(ids)
    if (ids.length <= 8) return { ...b, tris: ids }
    const ext = { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z }
    const axis = ext.x >= ext.y && ext.x >= ext.z ? "x" : ext.y >= ext.z ? "y" : "z"
    const key = (i: number): number => (tri[i]![0][axis] + tri[i]![1][axis] + tri[i]![2][axis]) / 3
    ids.sort((a, c) => key(a) - key(c))
    const mid = ids.length >> 1
    return { ...b, left: build(ids.slice(0, mid)), right: build(ids.slice(mid)) }
  }
  if (tri.length === 0) return { nearest: (p) => ({ distance: Infinity, point: p }) }
  const root = build(tri.map((_, i) => i))
  return {
    bounds: { min: root.min, max: root.max },
    nearest: (p) => {
      let best: Nearest = { distance: Infinity, point: p }
      const visit = (n: Node): void => {
        if (boxDistance(p, n) >= best.distance) return
        if (n.tris !== undefined) {
          for (const i of n.tris) {
            const [a, b, c] = tri[i]!
            const q = nearestOnTriangle(p, a, b, c)
            const d = len(sub(p, q))
            if (d < best.distance) best = { distance: d, point: q }
          }
          return
        }
        const l = n.left!, r = n.right!
        if (boxDistance(p, l) <= boxDistance(p, r)) { visit(l); visit(r) } else { visit(r); visit(l) }
      }
      visit(root)
      return best
    }
  }
}
