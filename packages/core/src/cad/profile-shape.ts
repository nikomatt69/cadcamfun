/**
 * Shaping of extruded profiles for the feature history: rounding or bevelling the sharp vertical corners of a profile, and breaking
 * the edges round its end faces (a chamfer, or a quarter-round fillet) by lofting the profile through a stack of inset copies.
 *
 * An extruded profile is a prismatic solid, so these operations are exact on it (no topology kernel needed): every edge of an end
 * face is the boundary of the profile, and the broken edge is the profile moved inwards by the chamfer / fillet profile at the right
 * height. The same stack, grown instead of shrunk, is the tool that breaks the rim of a hole.
 *
 * All rings are polygons in the sketch plane; the meshes are in the plane's local frame (z along the extrusion).
 */
import type { Mesh } from "./solid.ts"
import { selfIntersects } from "./offset.ts"
import { triangulateRing } from "./triangulate.ts"
import { signedArea } from "./shapes.ts"
import type { Vec2 } from "./vec.ts"

export type TreatmentStyle = "chamfer" | "fillet"
export type TreatmentEnds = "top" | "bottom" | "both"

/** Flat sketch vertices turning less than this are part of a curve (a tessellated arc or circle), not corners. */
const CORNER_TURN = (10 * Math.PI) / 180
/** Chord deviation of the arcs this module draws, mm. */
const ARC_TOLERANCE = 0.01

const unit = (x: number, y: number): Vec2 => {
  const l = Math.hypot(x, y)
  if (l < 1e-12) throw new RangeError("Profile has a zero-length edge")
  return { x: x / l, y: y / l }
}

const counterClockwise = (ring: ReadonlyArray<Vec2>): Vec2[] => (signedArea(ring) >= 0 ? [...ring] : [...ring].reverse())

/** Vertices to draw a circular arc of `radius` through `sweep` radians within the chord tolerance. */
const arcSteps = (radius: number, sweep: number): number => {
  const step = 2 * Math.acos(Math.max(0, 1 - ARC_TOLERANCE / Math.max(radius, ARC_TOLERANCE)))
  return Math.min(64, Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-3))))
}

/**
 * Which vertices of a ring are corners and which belong to a curve. A vertex turning less than 10 degrees is on a curve. A coarser
 * turn (up to 45 degrees) is still a curve when its neighbours turn the same amount between edges of the same length: that is how a
 * small circle or arc is tessellated within the chord tolerance (a 2 mm radius circle has 11.25 degree steps), not a corner.
 */
export const sharpVertices = (ring: ReadonlyArray<Vec2>): boolean[] => {
  const n = ring.length
  const turn = new Array<number>(n)
  const before = new Array<number>(n)
  const radius = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const a = ring[(i + n - 1) % n]!, b = ring[i]!, c = ring[(i + 1) % n]!
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y)
    before[i] = l1
    turn[i] = l1 < 1e-12 || l2 < 1e-12 ? 0 : Math.acos(Math.max(-1, Math.min(1, ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (l1 * l2))))
    // Circumradius of the vertex and its two neighbours: the radius of the curve it sits on.
    const twiceArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
    radius[i] = twiceArea < 1e-12 ? Infinity : (l1 * l2 * Math.hypot(c.x - a.x, c.y - a.y)) / (2 * twiceArea)
  }
  const near = (a: number, b: number): boolean => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.05 * Math.max(a, b)
  return ring.map((_, i) => {
    if (turn[i]! < CORNER_TURN) return false
    if (turn[i]! > Math.PI / 4) return true
    const prev = (i + n - 1) % n, next = (i + 1) % n
    // On a curve the chords on both sides are equal and the vertex lies on the same circle as a neighbouring vertex.
    return !(near(before[i]!, before[next]!) && (near(radius[prev]!, radius[i]!) || near(radius[next]!, radius[i]!)))
  })
}

/**
 * The profile with its sharp corners rounded (`fillet`, radius `size`) or bevelled (`chamfer`, setback `size` along each edge).
 * Vertices that turn less than 10 degrees belong to a curve and are left alone. Throws a `RangeError` when two neighbouring corners
 * need more of an edge than it has.
 */
export const treatCorners = (ring: ReadonlyArray<Vec2>, style: TreatmentStyle, size: number): Vec2[] => {
  if (!(size > 0)) throw new RangeError(`A corner ${style} needs a positive size (it is ${size})`)
  const n = ring.length
  const sharpAt = sharpVertices(ring)
  const geometry = ring.map((b, i) => {
    const a = ring[(i + n - 1) % n]!, c = ring[(i + 1) % n]!
    const u1 = unit(a.x - b.x, a.y - b.y), u2 = unit(c.x - b.x, c.y - b.y)
    const phi = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)))
    const sharp = sharpAt[i]! && phi > 1e-6
    // How far from the vertex the treatment starts along each edge.
    const setback = !sharp ? 0 : style === "chamfer" ? size : size / Math.tan(phi / 2)
    return { b, u1, u2, phi, sharp, setback }
  })
  geometry.forEach((g, i) => {
    const next = geometry[(i + 1) % n]!
    const length = Math.hypot(next.b.x - g.b.x, next.b.y - g.b.y)
    if (g.setback + next.setback > length + 1e-9) {
      throw new RangeError(`The corner ${style} of ${size} mm does not fit: an edge of ${length.toFixed(3)} mm has to give ${(g.setback + next.setback).toFixed(3)} mm to its two corners`)
    }
  })
  const out: Vec2[] = []
  for (const g of geometry) {
    if (!g.sharp) { out.push(g.b); continue }
    const t1 = { x: g.b.x + g.u1.x * g.setback, y: g.b.y + g.u1.y * g.setback }
    const t2 = { x: g.b.x + g.u2.x * g.setback, y: g.b.y + g.u2.y * g.setback }
    out.push(t1)
    if (style === "fillet") {
      const bis = unit(g.u1.x + g.u2.x, g.u1.y + g.u2.y)
      const distance = size / Math.sin(g.phi / 2)
      const centre = { x: g.b.x + bis.x * distance, y: g.b.y + bis.y * distance }
      const a1 = Math.atan2(t1.y - centre.y, t1.x - centre.x)
      let delta = Math.atan2(t2.y - centre.y, t2.x - centre.x) - a1
      while (delta > Math.PI) delta -= 2 * Math.PI
      while (delta < -Math.PI) delta += 2 * Math.PI
      const steps = arcSteps(size, delta)
      for (let k = 1; k < steps; k++) out.push({ x: centre.x + size * Math.cos(a1 + (delta * k) / steps), y: centre.y + size * Math.sin(a1 + (delta * k) / steps) })
    }
    out.push(t2)
  }
  // Two treatments that use a whole edge between them meet at one point: keep it once.
  const distinct = out.filter((p, k) => {
    const q = out[(k + out.length - 1) % out.length]!
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-9
  })
  return distinct
}

/**
 * The ring with its boundary moved `distance` into its interior (negative: outwards), every vertex along its mitre so the vertex
 * count and order are kept. Throws a `RangeError` when the move makes the ring cross itself or vanish (a fillet bigger than the
 * narrowest feature).
 */
export const moveRing = (ring: ReadonlyArray<Vec2>, distance: number): Vec2[] => {
  const ccw = counterClockwise(ring)
  if (distance === 0) return ccw
  const n = ccw.length
  const out = ccw.map((p, i) => {
    const a = ccw[(i + n - 1) % n]!, c = ccw[(i + 1) % n]!
    const d1 = unit(p.x - a.x, p.y - a.y), d2 = unit(c.x - p.x, c.y - p.y)
    // Left normals point into the interior of a counter-clockwise ring.
    const n1 = { x: -d1.y, y: d1.x }, n2 = { x: -d2.y, y: d2.x }
    const k = 1 + n1.x * n2.x + n1.y * n2.y
    if (k < 1e-6) throw new RangeError("The profile doubles back on itself at a vertex")
    return { x: p.x + (distance * (n1.x + n2.x)) / k, y: p.y + (distance * (n1.y + n2.y)) / k }
  })
  // Past the point where the ring collapses it turns inside out: every edge has to keep its direction.
  const inverted = out.some((q, i) => {
    const r = out[(i + 1) % n]!, a = ccw[i]!, b = ccw[(i + 1) % n]!
    return (r.x - q.x) * (b.x - a.x) + (r.y - q.y) * (b.y - a.y) <= 0
  })
  const area = signedArea(out)
  const original = signedArea(ccw)
  if (inverted) throw new RangeError(`The edge size of ${Math.abs(distance)} mm is too big for this profile: its boundary collapses or crosses itself`)
  // Moving inwards must shrink the ring and keep its orientation; moving outwards must grow it.
  if (!(area > 1e-9) || (distance > 0 ? area >= original : area <= original) || selfIntersects(out)) {
    throw new RangeError(`The edge size of ${Math.abs(distance)} mm is too big for this profile: its boundary collapses or crosses itself`)
  }
  return out
}

export interface Level { readonly inset: number; readonly z: number }

/**
 * The cross-section of a broken edge as `(inset, z)` levels from the bottom face to the top face: the profile is inset by `inset`
 * at height `z`. A chamfer is two levels per end, a fillet a quarter-circle sampled within the chord tolerance.
 */
export const edgeLevels = (style: TreatmentStyle, size: number, ends: TreatmentEnds, from: number, to: number): Level[] => {
  if (!(size > 0)) throw new RangeError(`An edge ${style} needs a positive size (it is ${size})`)
  const count = ends === "both" ? 2 : 1
  if (size * count >= to - from - 1e-9) {
    throw new RangeError(`The edge ${style} of ${size} mm needs ${(size * count).toFixed(3)} mm of the ${(to - from).toFixed(3)} mm extrusion: make it smaller than the depth`)
  }
  const steps = style === "chamfer" ? 1 : Math.min(16, arcSteps(size, Math.PI / 2))
  const bottom: Level[] = []
  const top: Level[] = []
  for (let k = 0; k <= steps; k++) {
    if (style === "chamfer") {
      bottom.push({ inset: size * (1 - k), z: from + size * k })
      top.push({ inset: size * k, z: to - size * (1 - k) })
      continue
    }
    const theta = (Math.PI / 2) * (k / steps)
    // Quarter circle with its centre inside the solid at `size` from the face and from the side wall.
    top.push({ inset: size * (1 - Math.cos(theta)), z: to - size + size * Math.sin(theta) })
    const down = (Math.PI / 2) * (1 - k / steps)
    bottom.push({ inset: size * (1 - Math.cos(down)), z: from + size - size * Math.sin(down) })
  }
  const levels: Level[] = []
  if (ends === "top") levels.push({ inset: 0, z: from })
  else levels.push(...bottom)
  if (ends === "bottom") levels.push({ inset: 0, z: to })
  else levels.push(...top)
  // The wall between the two treated ends is the plain profile; drop levels that coincide.
  return levels.filter((l, i) => i === 0 || l.z - levels[i - 1]!.z > 1e-9 || Math.abs(l.inset - levels[i - 1]!.inset) > 1e-9)
}

/**
 * A closed solid lofted through counter-clockwise rings with the same vertex count, one per level of `zs` (ascending): the side
 * strips between consecutive rings and a flat cap at each end. Outward-facing triangles.
 */
export const loftRings = (rings: ReadonlyArray<ReadonlyArray<Vec2>>, zs: ReadonlyArray<number>): Mesh => {
  const positions: number[] = []
  const indices: number[] = []
  const n = rings[0]!.length
  rings.forEach((ring, k) => { for (const p of ring) positions.push(p.x, p.y, zs[k]!) })
  for (let k = 0; k + 1 < rings.length; k++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const lo = k * n, up = (k + 1) * n
      indices.push(lo + i, lo + j, up + j, lo + i, up + j, up + i)
    }
  }
  const base = (rings.length - 1) * n
  for (const [a, b, c] of triangulateRing(rings[0]!)) indices.push(a, c, b)
  for (const [a, b, c] of triangulateRing(rings[rings.length - 1]!)) indices.push(base + a, base + b, base + c)
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
}

export interface EdgeShape { readonly style: TreatmentStyle; readonly size: number; readonly ends: TreatmentEnds }

/** An extruded solid (no holes) whose end-face edges are broken: the profile lofted through the inset levels. */
export const edgedPrism = (loop: ReadonlyArray<Vec2>, from: number, to: number, edge: EdgeShape): Mesh => {
  const levels = edgeLevels(edge.style, edge.size, edge.ends, from, to)
  return loftRings(levels.map((l) => moveRing(loop, l.inset)), levels.map((l) => l.z))
}

/**
 * The tool that cuts a hole through a treated extrusion: the hole's loop, flared by the same levels at the treated ends, and carried
 * a millimetre past each face so the cut is clean.
 */
export const edgedHoleTool = (loop: ReadonlyArray<Vec2>, from: number, to: number, edge: EdgeShape): Mesh => {
  const levels = edgeLevels(edge.style, edge.size, edge.ends, from, to)
  const first = levels[0]!, last = levels[levels.length - 1]!
  // A chamfer keeps its 45 degree slope beyond the face; a fillet's flare is flat there.
  const slope = edge.style === "chamfer" ? 1 : 0
  const all: Level[] = [
    { inset: first.inset + (first.inset > 0 ? slope : 0), z: from - 1 }, ...levels,
    { inset: last.inset + (last.inset > 0 ? slope : 0), z: to + 1 }
  ]
  // Growing the hole's loop is moving the solid's boundary away from the hole.
  return loftRings(all.map((l) => moveRing(loop, -l.inset)), all.map((l) => l.z))
}

/**
 * An extruded solid whose walls lean by `radians` from the vertical (draft): the profile is inset by `(z - from) * tan(radians)` at
 * height z, so a positive angle narrows the solid towards the top and a negative one widens it. Holes in the profile lean with it.
 */
export const taperedPrism = (loop: ReadonlyArray<Vec2>, from: number, to: number, radians: number): Mesh => {
  const inset = (to - from) * Math.tan(radians)
  return loftRings([moveRing(loop, 0), moveRing(loop, inset)], [from, to])
}

/**
 * The tool that cuts a leaning hole through a tapered extrusion: the hole's loop, grown by the same amount the material is inset,
 * carried a millimetre past each face.
 */
export const taperedHoleTool = (loop: ReadonlyArray<Vec2>, from: number, to: number, radians: number): Mesh => {
  const slope = Math.tan(radians)
  // Growing the hole is moving the solid's boundary away from it; at height z the hole has grown by (z - from) * slope.
  const at = (z: number): Vec2[] => moveRing(loop, -((z - from) * slope))
  return loftRings([at(from - 1), at(to + 1)], [from - 1, to + 1])
}
