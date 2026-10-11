/**
 * What a 5-axis machine is, kinematically, and how a program has to be written for it (spec 04 §14).
 *
 * Two families are modelled, both trunnion tables (the tool always stays along machine +Z):
 *   `table-AC`  the table turns C about Z, then tilts A about X:  R = Rx(A) Rz(C)
 *   `table-BC`  the table turns C about Z, then tilts B about Y:  R = Ry(B) Rz(C)
 * The maths (`anglesFor`, `partToMachine`) lives in `indexing.ts` and is shared with indexed (3+2)
 * machining; here it is used for *simultaneous* motion, where the angles change at every point.
 *
 * The second question a 5-axis program has to answer is **which frame the coordinates are in**:
 *   `tcp: "control"`  the control applies the tool centre point itself (Haas NGC `G234` TCPC, driven by the
 *                     MRZP settings). The program is written in the work offset: X Y Z are the tool tip in part
 *                     coordinates, B/C are the rotary angles, and the control moves the linear axes as the table
 *                     turns. No coordinate transform happens in the CAM.
 *   `tcp: "program"`  the control has no tool-centre-point control. The program must be in machine coordinates:
 *                     the tip position is `R (p - pivot) + pivot` for the table angles, so the control only has to
 *                     drive X Y Z B C together. Correct for a table-tilting machine; nothing has to be trusted to
 *                     the control.
 * A head that tilts (the pivot then moves with the tool length) is **not** modelled: the tool length would have
 * to enter the transform, which no machine model here provides.
 */
import type { Vec3 } from "../cad/vec.ts"
import { anglesFor, partToMachine, type RotaryAngles, type RotaryLayout, type RotaryLimits } from "./indexing.ts"
import type { MachineRotary } from "./ir.ts"

export type FiveAxisLayout = RotaryLayout

/** How the rotary axes of a trunnion machine may move, degrees. */
export interface FiveAxisLimits {
  /** Tilt axis (A or B): the range it may take. */
  readonly tilt: readonly [number, number]
  /** Rotation axis C: the range it may take (default -180..180). */
  readonly rotation?: readonly [number, number]
}

export interface FiveAxisKinematic {
  readonly layout: FiveAxisLayout
  readonly limits: FiveAxisLimits
  /** Centre of rotation of the table (MRZP) in machine coordinates, mm. */
  readonly pivot: Vec3
  /** Frame the program is written in; see the module comment. */
  readonly tcp: "control" | "program"
}

/** Fills in what a machine model may leave out: rotation range and pivot at the origin. */
export const fiveAxisKinematic = (partial: Partial<FiveAxisKinematic> & { readonly layout: FiveAxisLayout }): FiveAxisKinematic => ({
  layout: partial.layout,
  limits: partial.limits ?? { tilt: [-120, 120] },
  pivot: partial.pivot ?? { x: 0, y: 0, z: 0 },
  tcp: partial.tcp ?? "control"
})

const limitsOf = (limits: FiveAxisLimits): RotaryLimits => ({
  tiltMin: limits.tilt[0],
  tiltMax: limits.tilt[1],
  ...(limits.rotation !== undefined ? { cMin: limits.rotation[0], cMax: limits.rotation[1] } : {})
})

/** Ranges of the rotary axes this kinematic really has, for `validate`. */
export const rotaryRangesOf = (k: FiveAxisKinematic): MachineRotary => {
  const [min, max] = k.limits.tilt
  const c = k.limits.rotation ?? [-180, 180]
  return k.layout === "table-AC"
    ? { a: { min, max }, c: { min: c[0], max: c[1] } }
    : { b: { min, max }, c: { min: c[0], max: c[1] } }
}

/**
 * The angles that point the tool axis of the spindle (machine +Z) along `direction` **in the part**,
 * or `undefined` when the machine cannot reach that direction within its limits. `direction` is the
 * outward surface normal: the tool comes down onto the surface from above.
 */
export const solveOrientation = (direction: Vec3, k: FiveAxisKinematic): RotaryAngles | undefined =>
  anglesFor(direction, k.layout, limitsOf(k.limits))[0]

/**
 * Where the tool tip goes for contact point `point` (part coordinates) at these angles:
 * the part-frame point itself when the control applies the tool centre point, or the machine
 * position after the table has turned when the program must be in machine coordinates.
 */
export const tipPosition = (point: Vec3, angles: RotaryAngles, k: FiveAxisKinematic): Vec3 =>
  k.tcp === "program" ? partToMachine(point, angles, k.layout, k.pivot) : point

/** Which rotary axis letters this kinematic uses (for comments and the machine table). */
export const rotaryAxesOf = (k: FiveAxisKinematic): ReadonlyArray<"A" | "B" | "C"> =>
  k.layout === "table-AC" ? ["A", "C"] : ["B", "C"]

/** Human-readable one-liner for the machine table and the assistant. */
export const describeFiveAxis = (k: FiveAxisKinematic): string => {
  const [tiltMin, tiltMax] = k.limits.tilt
  const c = k.limits.rotation
  const [tilt, turn] = k.layout === "table-AC" ? (["A", "C"] as const) : (["B", "C"] as const)
  const range = c === undefined ? `${tilt} ${tiltMin}..${tiltMax} deg` : `${tilt} ${tiltMin}..${tiltMax} deg, ${turn} ${c[0]}..${c[1]} deg`
  return `${k.layout} trunnion table (${range}); ${k.tcp === "control" ? "the control applies the tool centre point (Haas G234)" : "the program is in machine coordinates"}`
}
