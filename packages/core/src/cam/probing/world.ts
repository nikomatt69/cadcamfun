/**
 * The part a simulated probe touches (spec 73 §5.10): analytic worlds for exact tests (a box, a plate with bores, a boss, a sphere, a
 * plane) and the part's triangle meshes, each placed on the machine by a `Placement` (where the stock really sits). Coordinates are
 * the machine's; the stylus is the ball at the tip of the probe.
 */
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import { boxSurface, cylinderWallSurface, discSurface, faceSurface, meshSurface, nearestOnSegment, planeSurface, rectangleSurface, sphereSurface, sweepSphere, unionSurface, type Nearest, type Surface } from "./sphere-cast.ts"

/**
 * How the part sits: rotated about the vertical through the origin by `rotate` (radians), then shifted by `translate`. A part on a turned
 * table or in a tilted plane is placed by `matrix` instead (row-major 3x3, the part's frame to the world's: its columns are the part's axes
 * seen in the world); `rotate` is then ignored.
 */
export interface Placement {
  readonly translate: Vec3
  readonly rotate?: number
  readonly matrix?: ReadonlyArray<number>
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
  const m = p.matrix
  if (m !== undefined) return { x: m[0]! * x + m[3]! * y + m[6]! * z, y: m[1]! * x + m[4]! * y + m[7]! * z, z: m[2]! * x + m[5]! * y + m[8]! * z }
  const r = p.rotate ?? 0
  const c = Math.cos(r), s = Math.sin(r)
  return { x: c * x + s * y, y: -s * x + c * y, z }
}
/** A direction of the part's frame in the world's. */
const placeDir = (p: Placement | undefined) => (v: Vec3): Vec3 => {
  const m = p?.matrix
  if (m !== undefined) return { x: m[0]! * v.x + m[1]! * v.y + m[2]! * v.z, y: m[3]! * v.x + m[4]! * v.y + m[5]! * v.z, z: m[6]! * v.x + m[7]! * v.y + m[8]! * v.z }
  const r = p?.rotate ?? 0
  const c = Math.cos(r), s = Math.sin(r)
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y, z: v.z }
}
/** A direction of the world's frame in the part's. */
const unplaceDir = (p: Placement | undefined) => (v: Vec3): Vec3 => {
  const m = p?.matrix
  if (m !== undefined) return { x: m[0]! * v.x + m[3]! * v.y + m[6]! * v.z, y: m[1]! * v.x + m[4]! * v.y + m[7]! * v.z, z: m[2]! * v.x + m[5]! * v.y + m[8]! * v.z }
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

/**
 * A block `min..max` with a rectangular pocket `pocket.min..pocket.max` (XY) cut `pocket.depth` into its top: the top face around the
 * opening, the four walls and the floor.
 */
export const pocketWorld = (min: Vec3, max: Vec3, pocket: { readonly min: Vec2; readonly max: Vec2; readonly depth: number }, placement?: Placement): ProbeWorld3 => {
  const z = max.z, f = max.z - pocket.depth
  const a = pocket.min, b = pocket.max
  const s: Surface[] = [
    faceSurface({ x: min.x, y: min.y }, { x: max.x, y: a.y }, z), faceSurface({ x: min.x, y: b.y }, { x: max.x, y: max.y }, z),
    faceSurface({ x: min.x, y: a.y }, { x: a.x, y: b.y }, z), faceSurface({ x: b.x, y: a.y }, { x: max.x, y: b.y }, z),
    faceSurface(a, b, f),
    rectangleSurface({ x: a.x, y: a.y, z: f }, { x: b.x - a.x, y: 0, z: 0 }, { x: 0, y: 0, z: pocket.depth }),
    rectangleSurface({ x: a.x, y: b.y, z: f }, { x: b.x - a.x, y: 0, z: 0 }, { x: 0, y: 0, z: pocket.depth }),
    rectangleSurface({ x: a.x, y: a.y, z: f }, { x: 0, y: b.y - a.y, z: 0 }, { x: 0, y: 0, z: pocket.depth }),
    rectangleSurface({ x: b.x, y: a.y, z: f }, { x: 0, y: b.y - a.y, z: 0 }, { x: 0, y: 0, z: pocket.depth }),
    faceSide(min, max)
  ]
  return surfaceWorld(unionSurface(s), placement)
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


// ---------------------------------------------------------------- a plate with several kinds of feature

type P2 = Vec2
type Poly = ReadonlyArray<P2>
type Circle = { readonly centre: Vec2; readonly radius: number }

/** The features a probe's cycles find on a part, in the part's own frame (z up): where the solid is, what is cut into it. */
export interface PlateFeatures {
  /** Bottom and top of the solid, mm. */
  readonly lo: number
  readonly hi: number
  /** The solid's outline(s) seen from above: convex polygons (counter-clockwise) or circles. Two of them must not overlap. */
  readonly islands: ReadonlyArray<{ readonly polygon: Poly } | { readonly circle: Circle }>
  /** Through bores. */
  readonly bores: ReadonlyArray<Circle>
  /** Blind pockets: a convex counter-clockwise polygon cut `depth` into the top. A pocket may run out through the edge of its island. */
  readonly pockets: ReadonlyArray<{ readonly polygon: Poly; readonly depth: number }>
}

const EPS2 = 1e-9
const cross2 = (o: P2, a: P2, b: P2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
const inConvex = (poly: Poly, x: number, y: number): boolean => {
  for (let i = 0; i < poly.length; i++) if (cross2(poly[i]!, poly[(i + 1) % poly.length]!, { x, y }) < -EPS2) return false
  return true
}
const inCircle = (c: Circle, x: number, y: number): boolean => Math.hypot(x - c.centre.x, y - c.centre.y) <= c.radius + EPS2
/** The part of `subject` inside the convex counter-clockwise `clip` (Sutherland-Hodgman). */
const clipPolygon = (subject: Poly, clip: Poly): Poly => {
  let out: P2[] = [...subject]
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const a = clip[i]!, b = clip[(i + 1) % clip.length]!
    const input = out
    out = []
    const side = (p: P2): number => cross2(a, b, p)
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!, q = input[(j + 1) % input.length]!
      const sp = side(p), sq = side(q)
      if (sp >= 0) out.push(p)
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }) }
    }
  }
  return out
}
const area = (poly: Poly): number => poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]!; return sum + (p.x * q.y - q.x * p.y) }, 0) / 2
/** The part of the segment a-b inside the convex polygon, as a parameter range (Cyrus-Beck), or undefined when none of it is. */
const clipSegment = (a: P2, b: P2, poly: Poly): readonly [number, number] | undefined => {
  let t0 = 0, t1 = 1
  const dx = b.x - a.x, dy = b.y - a.y
  for (let i = 0; i < poly.length; i++) {
    const e0 = poly[i]!, e1 = poly[(i + 1) % poly.length]!
    const nx = -(e1.y - e0.y), ny = e1.x - e0.x
    const num = nx * (a.x - e0.x) + ny * (a.y - e0.y), den = nx * dx + ny * dy
    if (Math.abs(den) < 1e-14) { if (num < -EPS2) return undefined; continue }
    const t = -num / den
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t)
    if (t0 > t1) return undefined
  }
  return t1 - t0 > 1e-12 ? [t0, t1] : undefined
}
const at2 = (a: P2, b: P2, t: number): P2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
/** The ranges of 0..1 left when `cut` ranges are taken out. */
const without = (cut: ReadonlyArray<readonly [number, number]>): ReadonlyArray<readonly [number, number]> => {
  const sorted = [...cut].sort((p, q) => p[0] - q[0])
  const out: Array<readonly [number, number]> = []
  let from = 0
  for (const [a, b] of sorted) { if (a > from + 1e-12) out.push([from, a]); from = Math.max(from, b) }
  if (from < 1 - 1e-12) out.push([from, 1])
  return out
}
const nearestOnRim = (p: Vec3, c: Circle, z: number): Vec3 => {
  const dx = p.x - c.centre.x, dy = p.y - c.centre.y
  const l = Math.hypot(dx, dy)
  return l === 0 ? { x: c.centre.x + c.radius, y: c.centre.y, z } : { x: c.centre.x + (dx * c.radius) / l, y: c.centre.y + (dy * c.radius) / l, z }
}

/** A horizontal region at `z`: the projection when the point is over it, else the nearest point of its boundary (segments and circles). */
const regionSurface = (z: number, inside: (x: number, y: number) => boolean, segments: ReadonlyArray<readonly [P2, P2]>, circles: ReadonlyArray<Circle>, bounds: { readonly min: P2; readonly max: P2 }): Surface => ({
  bounds: { min: { x: bounds.min.x, y: bounds.min.y, z }, max: { x: bounds.max.x, y: bounds.max.y, z } },
  nearest: (p) => {
    if (inside(p.x, p.y)) return { distance: Math.abs(p.z - z), point: { x: p.x, y: p.y, z } }
    let best: Nearest = { distance: Infinity, point: p }
    const consider = (q: Vec3): void => { const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); if (d < best.distance) best = { distance: d, point: q } }
    for (const [a, b] of segments) consider(nearestOnSegment(p, { x: a.x, y: a.y, z }, { x: b.x, y: b.y, z }))
    for (const c of circles) consider(nearestOnRim(p, c, z))
    return best
  }
})
/** A vertical wall over the segment a-b from z0 to z1. */
const wallSurface = (a: P2, b: P2, z0: number, z1: number): Surface | undefined =>
  Math.hypot(b.x - a.x, b.y - a.y) < 1e-9 || !(z1 - z0 > 1e-9) ? undefined : rectangleSurface({ x: a.x, y: a.y, z: z0 }, { x: b.x - a.x, y: b.y - a.y, z: 0 }, { x: 0, y: 0, z: z1 - z0 })
const boxOf = (points: ReadonlyArray<P2>): { readonly min: P2; readonly max: P2 } => ({
  min: { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)) }, max: { x: Math.max(...points.map((p) => p.x)), y: Math.max(...points.map((p) => p.y)) }
})

/** Why these features cannot be built as one solid (two outlines, bores or pockets on top of each other), or undefined. */
export const featureProblem = (f: PlateFeatures): string | undefined => {
  const circleCircle = (a: Circle, b: Circle): boolean => Math.hypot(a.centre.x - b.centre.x, a.centre.y - b.centre.y) < a.radius + b.radius - EPS2
  const polyCircle = (poly: Poly, c: Circle): boolean => inConvex(poly, c.centre.x, c.centre.y) || poly.some((p, i) => {
    const q = poly[(i + 1) % poly.length]!
    const n = nearestOnSegment({ x: c.centre.x, y: c.centre.y, z: 0 }, { x: p.x, y: p.y, z: 0 }, { x: q.x, y: q.y, z: 0 })
    return Math.hypot(n.x - c.centre.x, n.y - c.centre.y) < c.radius - EPS2
  })
  const polyPoly = (a: Poly, b: Poly): boolean => Math.abs(area(clipPolygon(a, b))) > 1e-9
  type Shape = { readonly kind: "c"; readonly c: Circle } | { readonly kind: "p"; readonly p: Poly }
  const shapes: ReadonlyArray<Shape> = f.islands.map((i): Shape => ("circle" in i ? { kind: "c", c: i.circle } : { kind: "p", p: i.polygon }))
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    const a = shapes[i]!, b = shapes[j]!
    const hit = a.kind === "c" && b.kind === "c" ? circleCircle(a.c, b.c) : a.kind === "p" && b.kind === "p" ? polyPoly(a.p, b.p) : a.kind === "c" && b.kind === "p" ? polyCircle(b.p, a.c) : polyCircle((a as { p: Poly }).p, (b as { c: Circle }).c)
    if (hit) return "two outlines (boss, web, outside rectangle) overlap: the replay builds them as separate bodies"
  }
  for (let i = 0; i < f.bores.length; i++) for (let j = i + 1; j < f.bores.length; j++) if (circleCircle(f.bores[i]!, f.bores[j]!)) return "two bores overlap"
  for (const b of f.bores) for (const k of f.pockets) if (polyCircle(k.polygon, b)) return "a bore and a pocket overlap"
  for (let i = 0; i < f.pockets.length; i++) for (let j = i + 1; j < f.pockets.length; j++) if (polyPoly(f.pockets[i]!.polygon, f.pockets[j]!.polygon)) return "two pockets overlap: the replay cuts them as separate pockets"
  for (const island of f.islands) if ("circle" in island) for (const k of f.pockets) {
    const centre = { x: k.polygon.reduce((s, p) => s + p.x, 0) / k.polygon.length, y: k.polygon.reduce((s, p) => s + p.y, 0) / k.polygon.length }
    if (inCircle(island.circle, centre.x, centre.y) && !k.polygon.every((p) => inCircle(island.circle, p.x, p.y))) return "a pocket runs out through the wall of a round boss: the replay cuts pockets that run out only through the sides of a straight-sided body"
  }
  return undefined
}

/**
 * A plate with its features as one world: for each outline (the blank's own, or each boss, web or outside rectangle the cycles measure)
 * the top and the bottom faces with the bores and pockets cut out, the walls (a pocket that runs out through the edge interrupts the wall
 * down to its floor), the bore walls, the pocket walls and floors. A feature belongs to the outline its centre is in; one that is in none
 * is not cut anywhere (the touch that looks for it finds nothing). Exact for every surface, to the same 1e-12 mm as the single-feature worlds.
 */
export const featureWorld = (f: PlateFeatures, placement?: Placement): ProbeWorld3 => {
  const surfaces: Surface[] = []
  const push = (s: Surface | undefined): void => { if (s !== undefined) surfaces.push(s) }
  const centreOf = (poly: Poly): P2 => ({ x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length })
  for (const island of f.islands) {
    const isCircle = "circle" in island
    const poly = isCircle ? undefined : island.polygon
    const circle = isCircle ? island.circle : undefined
    const within = (x: number, y: number): boolean => (poly !== undefined ? inConvex(poly, x, y) : inCircle(circle!, x, y))
    const bores = f.bores.filter((b) => within(b.centre.x, b.centre.y))
    const pockets = f.pockets.filter((k) => { const c = centreOf(k.polygon); return within(c.x, c.y) })
    const outline = poly ?? [{ x: circle!.centre.x - circle!.radius, y: circle!.centre.y - circle!.radius }, { x: circle!.centre.x + circle!.radius, y: circle!.centre.y + circle!.radius }]
    const bounds = boxOf(outline)
    const edges: Array<readonly [P2, P2]> = poly === undefined ? [] : poly.map((p, i) => [p, poly[(i + 1) % poly.length]!] as const)
    const inPocket = (x: number, y: number): boolean => pockets.some((k) => inConvex(k.polygon, x, y))
    const inBore = (x: number, y: number): boolean => bores.some((b) => inCircle(b, x, y))
    // The island's edges split by the pockets that run through them: [range, floor of the pocket there or undefined].
    const wallPieces: Array<{ readonly a: P2; readonly b: P2; readonly top: number }> = []
    const rimPieces: Array<readonly [P2, P2]> = []
    for (const [a, b] of edges) {
      const cuts = pockets.flatMap((k) => { const r = clipSegment(a, b, k.polygon); return r === undefined ? [] : [{ r, floor: f.hi - k.depth }] })
      for (const [t0, t1] of without(cuts.map((c) => c.r))) { wallPieces.push({ a: at2(a, b, t0), b: at2(a, b, t1), top: f.hi }); rimPieces.push([at2(a, b, t0), at2(a, b, t1)]) }
      for (const c of cuts) wallPieces.push({ a: at2(a, b, c.r[0]), b: at2(a, b, c.r[1]), top: c.floor })
    }
    // The pocket rims inside the island: the top face's boundary there, and the pocket walls from the floor up.
    const pocketRims: Array<readonly [P2, P2]> = []
    for (const k of pockets) {
      const floor = f.hi - k.depth
      const shape = poly === undefined ? k.polygon : clipPolygon(k.polygon, poly)
      k.polygon.forEach((p, i) => {
        const q = k.polygon[(i + 1) % k.polygon.length]!
        const r = poly === undefined ? ([0, 1] as const) : clipSegment(p, q, poly)
        if (r === undefined) return
        const a = at2(p, q, r[0]), b = at2(p, q, r[1])
        pocketRims.push([a, b])
        push(wallSurface(a, b, floor, f.hi))
      })
      if (shape.length >= 3 && Math.abs(area(shape)) > 1e-9) {
        const sb = boxOf(shape)
        push(regionSurface(floor, (x, y) => inConvex(shape, x, y), shape.map((p, i) => [p, shape[(i + 1) % shape.length]!] as const), [], sb))
      }
    }
    const boreCircles = bores
    push(regionSurface(f.hi, (x, y) => within(x, y) && !inPocket(x, y) && !inBore(x, y), [...rimPieces, ...pocketRims], [...(circle !== undefined ? [circle] : []), ...boreCircles], bounds))
    push(regionSurface(f.lo, (x, y) => within(x, y) && !inBore(x, y), edges, [...(circle !== undefined ? [circle] : []), ...boreCircles], bounds))
    for (const w of wallPieces) push(wallSurface(w.a, w.b, f.lo, w.top))
    if (circle !== undefined) push(cylinderWallSurface(circle.centre, circle.radius, f.lo, f.hi))
    for (const b of bores) push(cylinderWallSurface(b.centre, b.radius, f.lo, f.hi))
  }
  return surfaceWorld(unionSurface(surfaces), placement)
}
