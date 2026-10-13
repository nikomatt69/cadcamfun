/**
 * Helices: the centre line and the first profile ring of a wire (or a thread ridge) wound about the Z axis, for `sweepSolid`.
 */
import type { P3 } from "./sweep-loft.ts"
import type { Vec2 } from "./vec.ts"

/** Fewest points per turn of a coil (a chord of 11 degrees). */
export const COIL_STEPS_PER_TURN = 32
/** Most points per turn. */
const COIL_MAX_STEPS_PER_TURN = 128
/** Points per turn for a helix of `radius`: the chords stay within 0.01 mm of the true helix, and a sweep along them within about 0.2 % of the true volume. */
export const stepsPerTurn = (radius: number): number =>
  Math.min(COIL_MAX_STEPS_PER_TURN, Math.max(COIL_STEPS_PER_TURN, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - 0.01 / Math.max(radius, 1e-6))))))
export const COIL_MAX_TURNS = 60

/**
 * The path and the first ring of a coiled wire. The ring lies in the plane square to the helix at its start (spanned by the radial
 * direction and the binormal), which is what the sweep expects: its normal is the start tangent.
 */
export const coilGeometry = (c: { cx: number; cy: number; z0: number; radius: number; pitch: number; turns: number; wire: number; square: boolean; left: boolean; section?: ReadonlyArray<Vec2> }): { path: P3[]; ring: P3[]; ring2d: Vec2[]; normal: P3; centre: P3 } => {
  const steps = Math.ceil(c.turns * stepsPerTurn(c.radius))
  const sign = c.left ? -1 : 1
  const path: P3[] = Array.from({ length: steps + 1 }, (_, k) => {
    const turn = (c.turns * k) / steps
    const angle = sign * 2 * Math.PI * turn
    return { x: c.cx + c.radius * Math.cos(angle), y: c.cy + c.radius * Math.sin(angle), z: c.z0 + c.pitch * turn }
  })
  const a = path[0]!, b = path[1]!
  const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  const tangent: P3 = { x: (b.x - a.x) / length, y: (b.y - a.y) / length, z: (b.z - a.z) / length }
  const radial: P3 = { x: 1, y: 0, z: 0 }
  // The tangent has no radial part at the start of the helix, so radial and tangent are square; the third axis completes the frame.
  const binormal: P3 = { x: tangent.y * radial.z - tangent.z * radial.y, y: tangent.z * radial.x - tangent.x * radial.z, z: tangent.x * radial.y - tangent.y * radial.x }
  const half = c.wire / 2
  const corners: ReadonlyArray<Vec2> = c.section ?? (c.square
    ? [{ x: half, y: -half }, { x: half, y: half }, { x: -half, y: half }, { x: -half, y: -half }]
    : Array.from({ length: Math.max(16, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - 0.01 / half)))) }, (_, k) => k).map((k, _i, all) => ({ x: half * Math.cos((2 * Math.PI * k) / all.length), y: half * Math.sin((2 * Math.PI * k) / all.length) })))
  const ring = corners.map((p) => ({ x: a.x + radial.x * p.x + binormal.x * p.y, y: a.y + radial.y * p.x + binormal.y * p.y, z: a.z + radial.z * p.x + binormal.z * p.y }))
  return { path, ring, ring2d: [...corners], normal: tangent, centre: a }
}

