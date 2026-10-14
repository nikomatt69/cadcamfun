/**
 * Tilting-head kinematics (spec 29 §8): a spindle head that tilts B about the machine Y axis, on a fixed table. The tool points
 * along its axis from the head pivot; the tool tip sits `gauge` mm from the pivot, along that axis. Unlike the trunnion table,
 * the pivot is fixed in the machine and the tool length enters the geometry: the tip moves when the head tilts.
 *
 *   axis(B)       = Ry(B) (0, 0, -1): the tool points down into the part (-Z at B = 0)
 *   tip(B)        = pivot + gauge · axis(B)
 *   inverse(d)    the B that points the tool along d (d in machine coordinates, pointing into the part); only d with no Y
 *                 component is reachable by one tilt, so the residual of any other d is its Y component.
 *
 * Mounted on a table that stays still, the workpiece does not move: a part point stays where it is and the head reaches it.
 * Not covered: a second, A tilt (the head-AB machine) and the table's own C.
 */
import { length3, type Vec3 } from "../../cad/vec.ts"

export interface HeadKinematic {
  /** Head pivot in machine coordinates, mm. */
  readonly pivot: Vec3
  /** Distance from the pivot to the tool tip along the tool axis, mm (the gauge length of the tool assembly). */
  readonly gauge: number
  /** Range of the head's tilt, degrees. */
  readonly tilt: readonly [number, number]
}

export interface HeadSolution {
  /** Tilt about Y, degrees. */
  readonly b: number
  /** Residual: the Y component of the requested axis (0 when reachable exactly). */
  readonly residual: number
  /** Tool axis reached in machine coordinates (unit). */
  readonly axis: Vec3
}

const DEG = Math.PI / 180

/** The tool axis for a tilt B, in machine coordinates. */
export const headAxis = (b: number): Vec3 => ({ x: -Math.sin(b * DEG), y: 0, z: -Math.cos(b * DEG) })

/** The tool tip for a tilt B: the pivot plus the gauge along the tool axis. */
export const headTip = (b: number, k: HeadKinematic): Vec3 => {
  const a = headAxis(b)
  return { x: k.pivot.x + k.gauge * a.x, y: k.pivot.y + k.gauge * a.y, z: k.pivot.z + k.gauge * a.z }
}

/** The tilt that points the tool along `direction` (into the part), when the head can reach it; `undefined` outside the range. */
export const headFor = (direction: Vec3, k: HeadKinematic): HeadSolution | undefined => {
  const l = length3(direction)
  const d = { x: direction.x / l, y: direction.y / l, z: direction.z / l }
  // Ry(B)(0,0,-1) = (-sin B, 0, -cos B): the reachable directions lie in the XZ plane.
  const b = Math.atan2(-d.x, -d.z) / DEG
  const axis = headAxis(b)
  const residual = Math.abs(d.y)
  if (b < k.tilt[0] - 1e-9 || b > k.tilt[1] + 1e-9) return undefined
  return { b, residual, axis }
}

/** A head with two tilts: A about X, then B about Y (the head-AB machine). */
export interface HeadABKinematic {
  readonly pivot: Vec3
  readonly gauge: number
  readonly tiltA: readonly [number, number]
  readonly tiltB: readonly [number, number]
}

export interface HeadABSolution {
  readonly a: number
  readonly b: number
  /** Distance |axis - direction| after the solve (0 when exact). */
  readonly residual: number
  readonly branch: 0 | 1
  /** 1 when A is at ±90° (cos A = 0): B is then undetermined and set to 0. */
  readonly singularity: number
}

/** The tool axis for tilts A (about X) and B (about Y): Ry(B) Rx(A) (0, 0, -1). */
export const headABAxis = (a: number, b: number): Vec3 => {
  const sa = Math.sin(a * DEG), ca = Math.cos(a * DEG), sb = Math.sin(b * DEG), cb = Math.cos(b * DEG)
  return { x: -ca * sb, y: sa, z: -ca * cb }
}

/**
 * The two (A, B) solutions that point the tool along `direction`: A = asin(d_y) with cos A ≥ 0, and the other way round (A → 180 - A,
 * B → B + 180). Each is kept when both tilts are inside their ranges.
 */
export const headABFor = (direction: Vec3, k: HeadABKinematic): ReadonlyArray<HeadABSolution> => {
  const l = Math.hypot(direction.x, direction.y, direction.z)
  const d = { x: direction.x / l, y: direction.y / l, z: direction.z / l }
  const sinA = Math.max(-1, Math.min(1, d.y))
  const a0 = Math.asin(sinA) / DEG
  const cosA = Math.cos(a0 * DEG)
  const singular = cosA < 1e-9 ? 1 : 0
  // With cos A > 0: sin B = -d_x / cos A, cos B = -d_z / cos A.
  const b0 = singular ? 0 : Math.atan2(-d.x, -d.z) / DEG
  const out: HeadABSolution[] = []
  for (const [branch, a, b] of [[0, a0, b0], [1, 180 - a0, b0 + 180]] as const) {
    const aw = ((a + 540) % 360) - 180
    const bw = ((b + 540) % 360) - 180
    if (aw < k.tiltA[0] - 1e-9 || aw > k.tiltA[1] + 1e-9 || bw < k.tiltB[0] - 1e-9 || bw > k.tiltB[1] + 1e-9) continue
    const axis = headABAxis(aw, bw)
    out.push({ a: aw, b: bw, residual: Math.hypot(axis.x - d.x, axis.y - d.y, axis.z - d.z), branch: branch as 0 | 1, singularity: singular })
  }
  return out
}
