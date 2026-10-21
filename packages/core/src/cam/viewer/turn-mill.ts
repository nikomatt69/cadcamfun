/**
 * A 5-axis lathe is a mill-turn centre, not a 2-axis lathe with extra words (spec 31/32, lathe mode):
 *
 *   X  radial (diameter programming), Z  along the spindle, Y  off-centre milling,
 *   C  the main spindle as a rotary axis: it turns the workpiece continuously when turning, and positions
 *      (or interpolates) when milling,  B  the milling head tilting about Y.
 *
 * Lathe coordinates here are the program's: X is a diameter, the spindle axis is Z, so C turns about Z and
 * B turns about Y. B = 0 puts the milling spindle axial (its axis along -Z, drilling the face); B = 90 puts
 * it radial (along -X, milling the outside). Turning itself needs no B: the turning tool works in the XZ
 * plane while C spins, which is why a turning-only program is still a plain lathe program.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { Program } from "../ir.ts"

export interface TurnMillLimits {
  /** B head range, degrees. */
  readonly b: readonly [number, number]
  /** C range, degrees; absent: continuous. */
  readonly c?: readonly [number, number]
}

export const TURN_MILL_LIMITS: TurnMillLimits = { b: [-120, 120] }

export interface TurnMillPose {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly b: number
  readonly c: number
}

/** What a program uses the centre as: turning only (X/Z, C spins free), or milling too (Y and/or B, C positions). */
export const turnMillAxesOf = (program: Program): { readonly milling: boolean; readonly b: boolean; readonly y: boolean; readonly cPositioned: boolean } => {
  let b = false, y = false, cPositioned = false
  for (const path of program.toolpaths) for (const m of path.moves) {
    const r = m._tag === "Orient" ? m : (m._tag === "Rapid" || m._tag === "Linear") ? m.rotary : undefined
    if (r?.b !== undefined) b = true
    if (r?.c !== undefined) cPositioned = true
    if ((m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Arc") && m.to.y !== 0) y = true
  }
  return { milling: b || y, b, y, cPositioned }
}

/** The milling spindle axis (holder to tip) at head tilt `bDeg`: Ry(B) applied to the axial direction (0, 0, -1). */
export const turnMillToolAxis = (bDeg: number): Vec3 => {
  const b = (bDeg * Math.PI) / 180
  return { x: -Math.sin(b), y: 0, z: -Math.cos(b) }
}

/** A workpiece point turned by the C axis about the spindle (Z): C90 takes +X to +Y. */
export const turnMillCPoint = (p: Vec3, cDeg: number): Vec3 => {
  const c = (cDeg * Math.PI) / 180, cos = Math.cos(c), sin = Math.sin(c)
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos, z: p.z }
}

/** Problems of a pose on the centre: a B (or finite C) outside its range, or a non-finite joint. Empty when reachable. */
export const validateTurnMillPose = (pose: Partial<TurnMillPose>, limits: TurnMillLimits = TURN_MILL_LIMITS): ReadonlyArray<string> => {
  const out: string[] = []
  for (const k of ["x", "y", "z", "b", "c"] as const) {
    const v = pose[k]
    if (v !== undefined && !Number.isFinite(v)) out.push(`${k.toUpperCase()} is not finite`)
  }
  if (pose.b !== undefined && Number.isFinite(pose.b) && (pose.b < limits.b[0] || pose.b > limits.b[1])) out.push(`B ${pose.b} is outside ${limits.b[0]}..${limits.b[1]}`)
  if (limits.c !== undefined && pose.c !== undefined && Number.isFinite(pose.c) && (pose.c < limits.c[0] || pose.c > limits.c[1])) out.push(`C ${pose.c} is outside ${limits.c[0]}..${limits.c[1]}`)
  return out
}
