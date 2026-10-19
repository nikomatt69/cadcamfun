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
