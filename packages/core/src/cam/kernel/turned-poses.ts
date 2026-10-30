/**
 * The poses of a move made with the table turning (spec 69 A4): the tip and tool axis in the part, for each interpolation step of
 * the joints. Shared by the kernel's own replay and by `verifyNc`, which reads a program the kernel did not write.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { tableRotation, type RotaryAngles, type RotaryLayout } from "../indexing.ts"

/** Largest table turn between two poses of a move, degrees: the angles are interpolated in steps of at most this. */
export const TURN_STEP = 3

/**
 * The poses of a move made with the table turning from `a0` to `a1` (what the controller interpolates linearly in the joints).
 * The NC position is the tip in machine coordinates, so the tip in the part is `Rᵀ (m - pivot) + pivot` and the tool axis (up from
 * the tip) in the part is `Rᵀ ẑ`; the angles of each pose come from the interpolation, not only from the end of the move.
 */
export const turnedPoses = (layout: RotaryLayout, pivot: Vec3, from: Vec3, to: Vec3, a0: RotaryAngles, a1: RotaryAngles, spacing: number): ReadonlyArray<{ readonly tip: Vec3; readonly axis: Vec3; readonly machine: Vec3 }> => {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
  const turn = Math.max(Math.abs((a1.a ?? 0) - (a0.a ?? 0)), Math.abs((a1.b ?? 0) - (a0.b ?? 0)), Math.abs((a1.c ?? 0) - (a0.c ?? 0)))
  const n = Math.min(2000, Math.max(1, Math.ceil(Math.max(length / spacing, turn / TURN_STEP))))
  const out: Array<{ tip: Vec3; axis: Vec3; machine: Vec3 }> = []
  for (let k = 0; k <= n; k++) {
    const f = k / n
    const m = tableRotation({ a: (a0.a ?? 0) + ((a1.a ?? 0) - (a0.a ?? 0)) * f, b: (a0.b ?? 0) + ((a1.b ?? 0) - (a0.b ?? 0)) * f, c: (a0.c ?? 0) + ((a1.c ?? 0) - (a0.c ?? 0)) * f }, layout)
    const machine = { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, z: from.z + (to.z - from.z) * f }
    const x = machine.x - pivot.x, y = machine.y - pivot.y, z = machine.z - pivot.z
    out.push({
      machine,
      tip: { x: m[0] * x + m[3] * y + m[6] * z + pivot.x, y: m[1] * x + m[4] * y + m[7] * z + pivot.y, z: m[2] * x + m[5] * y + m[8] * z + pivot.z },
      axis: { x: m[6], y: m[7], z: m[8] }
    })
  }
  return out
}
