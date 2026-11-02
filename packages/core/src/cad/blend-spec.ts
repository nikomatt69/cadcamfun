/**
 * The chamfer's two setbacks: the drawing callout "2 x 1" (a distance on each face) or "2 x 30°" (a distance and the angle of
 * the chamfer face to it). The exact kernel and the mesh build their section from the same numbers here, so a part looks the
 * same in the viewport, in a STEP file and in a CAM job.
 *
 * The callout names the first face and the second one. The first face is the more horizontal of the two (the top of a plate,
 * the mouth of a hole): the setback goes on it, the second on the other. Two equally horizontal faces (two vertical walls) have
 * no such first face, so an asymmetric chamfer is refused there rather than guessed.
 */
import { dot3, type Vec3 } from "./vec.ts"

export interface ChamferSpec {
  /** The setback on the first face, mm. */
  readonly distance: number
  /** The setback on the second face, mm (an equal chamfer when absent). */
  readonly secondDistance?: number
  /** The angle between the chamfer face and the first face, radians (it fixes the second setback). */
  readonly angle?: number
}

/** The setbacks of a chamfer on the two faces of an edge, in the faces' own order. */
export interface ChamferSetbacks {
  /** The setback on the face whose outward normal is nA. */
  readonly onA: number
  /** The setback on the face whose outward normal is nB. */
  readonly onB: number
}

/**
 * The setback on the second face for a chamfer of `distance` on the first face at `angle` radians to it, between two faces
 * whose outward normals make the angle `alpha` (their dot product is `cosAlpha`).
 *
 * The section is a triangle: the chamfer face cuts the corner at the angle wanted from the first face, so the second setback
 * follows from the geometry of the two faces. It has no solution when the angle is steeper than the corner allows (the chamfer
 * face would have to cut into the second face) or when it is exactly the corner's angle (the chamfer face would be parallel to
 * the second face: nothing is removed).
 */
export const chamferSecondDistance = (distance: number, angle: number, cosAlpha: number): number | undefined => {
  if (!Number.isFinite(distance) || !(distance > 0) || !Number.isFinite(angle) || !(angle > 0 && angle < Math.PI / 2)) return undefined
  const theta = angle
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)))
  if (!(alpha > theta)) return undefined
  // The sine rule avoids the removable singularity of the rationalized form at theta = pi - alpha.
  const denominator = Math.sin(alpha - theta)
  if (!(denominator > 1e-12)) return undefined
  const second = distance * Math.sin(theta) / denominator
  return second > 0 && Number.isFinite(second) ? second : undefined
}

/**
 * The setbacks of the chamfer on the edge between the faces with the outward normals `nA` and `nB`: the first distance goes on
 * the more horizontal face, the second on the other. `undefined` when the callout cannot be honoured (an angle the corner does
 * not allow, or two faces that are equally horizontal, so neither of them is the first).
 */
export const chamferSetbacks = (spec: ChamferSpec, nA: Vec3, nB: Vec3): ChamferSetbacks | undefined => {
  if (chamferRefusal(spec, nA, nB) !== undefined) return undefined
  const firstIsA = Math.abs(nA.z) >= Math.abs(nB.z)
  const second = spec.secondDistance !== undefined
    ? spec.secondDistance
    : spec.angle !== undefined
      ? chamferSecondDistance(spec.distance, spec.angle, dot3(nA, nB))
      : spec.distance
  if (second === undefined) return undefined
  return firstIsA ? { onA: spec.distance, onB: second } : { onA: second, onB: spec.distance }
}

/** Why a chamfer callout cannot be honoured, for the message the rebuild reports. */
export const chamferRefusal = (spec: ChamferSpec, nA: Vec3, nB: Vec3): string | undefined => {
  if (!Number.isFinite(spec.distance) || !(spec.distance > 0)) return `the chamfer distance must be finite and positive (it is ${spec.distance})`
  if (spec.secondDistance !== undefined && spec.angle !== undefined) return "a chamfer takes either two distances or a distance and an angle, not both"
  if (spec.angle !== undefined && (!Number.isFinite(spec.angle) || !(spec.angle > 0 && spec.angle < Math.PI / 2))) return `the chamfer angle must be between 0 and pi/2 radians (it is ${spec.angle})`
  if (spec.secondDistance !== undefined && (!Number.isFinite(spec.secondDistance) || !(spec.secondDistance > 0))) return `the second chamfer distance must be finite and positive (it is ${spec.secondDistance})`
  const second = spec.angle !== undefined ? chamferSecondDistance(spec.distance, spec.angle, dot3(nA, nB)) : spec.secondDistance ?? spec.distance
  if (second === undefined) {
    return `a chamfer of ${spec.distance} mm at ${spec.angle} radians is not possible between these faces`
  }
  if (Math.abs(Math.abs(nA.z) - Math.abs(nB.z)) <= 1e-6 && Math.abs(second - spec.distance) > 1e-9 * Math.max(second, spec.distance)) {
    return "an unequal chamfer needs a uniquely more horizontal face: these two are equally inclined"
  }
  return undefined
}

// ================================================================ strips that collide on a shared face

/** What the overlap check needs of an edge: the mesh's `BlendEdge` and the B-rep's `BlendCandidate` both have these fields. */
export interface StripEdge {
  readonly a: Vec3
  readonly b: Vec3
  /** Outward unit normals of the two faces. */
  readonly nA: Vec3
  readonly nB: Vec3
  readonly convex: boolean
  readonly length: number
}

/** One blended edge as the check sees it: the width of the strip it takes on each face, at its `a` end and at its `b` end. */
export interface BlendStrip {
  readonly edge: StripEdge
  readonly onA: readonly [number, number]
  readonly onB: readonly [number, number]
}

/** Two blended edges whose strips cross on the face between them (the edge of `index` conflicts with the one of `other`). */
export interface StripConflict {
  readonly index: number
  readonly other: number
  /** Which face of `index` the strips share. */
  readonly face: "A" | "B"
  /** How wide the face is between the two edges, mm. */
  readonly available: number
  /** The most the two strips take together along their overlap, mm. */
  readonly needed: number
}

const sub = (p: Vec3, q: Vec3): Vec3 => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z })
const cross = (p: Vec3, q: Vec3): Vec3 => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x })
const dot = (p: Vec3, q: Vec3): number => p.x * q.x + p.y * q.y + p.z * q.z
const norm = (p: Vec3): number => Math.hypot(p.x, p.y, p.z)
const unitOf = (e: StripEdge): Vec3 => { const d = sub(e.b, e.a), l = norm(d) || 1; return { x: d.x / l, y: d.y / l, z: d.z / l } }

/**
 * The direction into face A (or B) of an edge, in the face's plane and square to the edge: the material of a convex edge lies
 * behind the other face, the fill of a concave one in front of it.
 */
const inward = (e: StripEdge, side: "A" | "B", dir: Vec3): Vec3 => {
  const n = side === "A" ? e.nA : e.nB, other = side === "A" ? e.nB : e.nA
  const d = cross(n, dir), l = norm(d) || 1
  const sign = dot(d, other) * (e.convex ? -1 : 1) >= 0 ? 1 : -1
  return { x: (sign * d.x) / l, y: (sign * d.y) / l, z: (sign * d.z) / l }
}

/**
 * The blended edges whose strips collide. An edge blend takes a strip of each of its two faces (a fillet of radius r on an edge
 * between faces at the angle alpha takes r * tan(alpha / 2) of each; a chamfer takes its setbacks). Two parallel blended edges on
 * the two sides of one face leave the face `s` mm wide between them, and their strips must fit in it: when they take more than
 * `s` together the two tangent lines cross, the face is eaten away and the cutting tools of the two edges overlap, so the solid
 * that comes out is not the one asked for (a 60 x 40 plate with its four vertical edges rounded at R30 came out 56.55 mm long).
 * The widths run linearly along an edge, so the overlap is checked at its two ends. Strips of edges that are not parallel (the
 * two edges at a corner) meet at the vertex, which the corner blend handles; they are not conflicts.
 *
 * Every pair is reported once for each of its edges, so the caller can name the edge that was refused.
 */
export const stripConflicts = (strips: ReadonlyArray<BlendStrip>): StripConflict[] => {
  const out: StripConflict[] = []
  for (let i = 0; i < strips.length; i++) for (let j = i + 1; j < strips.length; j++) {
    const si = strips[i]!, sj = strips[j]!
    const di = unitOf(si.edge), dj = unitOf(sj.edge)
    if (norm(cross(di, dj)) > 0.02) continue
    for (const sideI of ["A", "B"] as const) for (const sideJ of ["A", "B"] as const) {
      const ni = sideI === "A" ? si.edge.nA : si.edge.nB, nj = sideJ === "A" ? sj.edge.nA : sj.edge.nB
      if (dot(ni, nj) < 0.9999) continue
      const between = sub(sj.edge.a, si.edge.a)
      if (Math.abs(dot(between, ni)) > 2e-3) continue
      // Edge j must lie ahead of edge i in the direction its face runs, and its own face must run back towards i.
      const ahead = inward(si.edge, sideI, di)
      const back = inward(sj.edge, sideJ, dj)
      const s = dot(between, ahead)
      if (!(s > 1e-6) || dot(ahead, back) > -0.5) continue
      // The overlap of the two edges along edge i's line.
      const tj0 = dot(between, di), tj1 = dot(sub(sj.edge.b, si.edge.a), di)
      const lo = Math.max(0, Math.min(tj0, tj1)), hi = Math.min(si.edge.length, Math.max(tj0, tj1))
      if (!(hi - lo > 1e-6)) continue
      const wi = sideI === "A" ? si.onA : si.onB, wj = sideJ === "A" ? sj.onA : sj.onB
      const widthI = (t: number): number => wi[0] + (wi[1] - wi[0]) * (si.edge.length > 0 ? t / si.edge.length : 0)
      // `tj0` is where j's `a` end lies along i's line; the width of j runs from there (its a end) to tj1 (its b end).
      const widthJ = (t: number): number => wj[0] + (wj[1] - wj[0]) * (tj1 !== tj0 ? Math.min(1, Math.max(0, (t - tj0) / (tj1 - tj0))) : 0)
      const needed = Math.max(widthI(lo) + widthJ(lo), widthI(hi) + widthJ(hi))
      if (needed <= s + 1e-6) continue
      out.push({ index: i, other: j, face: sideI, available: s, needed }, { index: j, other: i, face: sideJ, available: s, needed })
    }
  }
  return out
}

/**
 * For each strip (by index) that collides, the reason of its tightest conflict (the one that allows the smallest size), so the
 * limit a person is told is the one that holds for every pair. See `stripConflictReason` for `style`, `size` and `linear`.
 */
export const stripCollisionReasons = (strips: ReadonlyArray<BlendStrip>, style: "fillet" | "chamfer", size: number, linear: boolean): Map<number, string> => {
  const tightest = new Map<number, StripConflict>()
  for (const c of stripConflicts(strips)) {
    const seen = tightest.get(c.index)
    if (seen === undefined || c.available / c.needed < seen.available / seen.needed) tightest.set(c.index, c)
  }
  return new Map([...tightest].map(([index, c]) => [index, stripConflictReason(c, style, size, linear)] as const))
}

/** The largest size at or below `size` that fits a conflict whose strips grow in proportion to the size, rounded down to 0.01 mm. */
export const stripConflictLimit = (c: StripConflict, size: number): number => Math.floor((size * c.available) / c.needed * 100 + 1e-6) / 100

/**
 * The text of a conflict for the edge it refuses. `linear` says the strips grow in proportion to the size (a fillet; a chamfer of
 * one distance or of a distance and an angle), so the largest size that fits can be named; else the room the strips need is.
 */
export const stripConflictReason = (c: StripConflict, style: "fillet" | "chamfer", size: number, linear: boolean): string => {
  const word = style === "chamfer" ? "chamfer" : "fillet"
  const noun = style === "chamfer" ? "distance" : "radius"
  const room = `the face between this edge and the opposite blended edge is only ${c.available.toFixed(2)} mm wide, but the two ${word}s need ${c.needed.toFixed(2)} mm of it`
  return linear
    ? `${noun} ${size} exceeds the maximum ${stripConflictLimit(c, size)} for this edge: ${room}`
    : `the ${word} does not fit: ${room}`
}
