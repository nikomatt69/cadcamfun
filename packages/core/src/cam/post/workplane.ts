/**
 * Tilted work planes in the posts (spec 72 P4-6, 3+2 written with the control's own swivel words).
 *
 * A setup's `WorkFrame` (origin, x, y, z axes in the work offset's coordinates) is turned into the plane word of each control, and the
 * toolpath that follows stays in the plane's own coordinates, as an ordinary 3-axis operation computes it. The control, not the CAM,
 * turns the rotary axes and carries the coordinates into the machine. The tool axis is the frame's z axis, so a frame with z = +Z writes
 * no plane at all (the plane is the work offset).
 *
 * The rotation of the frame is `M = [x y z]` (columns): a program point `p` is the work-offset point `origin + M p`. Each control names
 * that same rotation with three angles in its own order, and the conventions below are the part that must be right:
 *
 *   Fanuc  `G68.2 X Y Z I J K` (P0, Euler angles)   M = Rz(I) Rx(J) Rz(K)   rotate about Z by I, then about the new X by J, then about the new Z by K
 *   Siemens `CYCLE800(.., 57, X0 Y0 Z0, A B C, ..)`  M = Rx(A) Ry(B) Rz(C)   mode 57: axis by axis, X then the new Y then the new Z
 *   Heidenhain `PLANE SPATIAL SPA SPB SPC`           M = Rz(SPC) Ry(SPB) Rx(SPA)   rotations about the fixed X, then Y, then Z axes
 *
 * The reference interpreter (`testing/gcode-interpreter.ts`) reads the same three words with the same conventions, so a posted program
 * replays to the tool-tip positions of the toolpath. That closes the loop CAM -> text -> replay; it does not prove the vendor convention
 * itself: none of these words has been run on a real control (the posts say so in their headers).
 */
import { cross3, dot3, length3 } from "../../cad/vec.ts"
import { validateWorkFrame, type WorkFrame } from "../setup.ts"
import { KLARTEXT_PREFIX } from "./macro-syntax.ts"
import type { PlaneCall, TiltedPlaneCodes } from "./types.ts"

export type Mat3 = PlaneCall["matrix"]

const DEG = 180 / Math.PI
const RAD = Math.PI / 180

/** Rotation matrix whose columns are the frame axes. */
export const frameMatrix = (frame: WorkFrame): Mat3 => {
  const issues = validateWorkFrame(frame)
  if (issues.length > 0) throw new RangeError(`Tilted plane: ${issues[0]!.message}`)
  const { xAxis: x, yAxis: y, zAxis: z } = frame
  return [x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z]
}

/** A plane that is the work offset itself (no rotation, no shift): no word needed. */
export const isIdentityPlane = (frame: WorkFrame, eps = 1e-9): boolean => {
  const m = frameMatrix(frame)
  return [1, 0, 0, 0, 1, 0, 0, 0, 1].every((v, i) => Math.abs(m[i]! - v) <= eps) && length3(frame.origin) <= eps
}

export const rotation = (axis: "x" | "y" | "z", degrees: number): Mat3 => {
  const c = Math.cos(degrees * RAD), s = Math.sin(degrees * RAD)
  return axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === "y" ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1]
}

export const matMul = (a: Mat3, b: Mat3): Mat3 => {
  const out: number[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!)
  return out as unknown as Mat3
}

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v))
const near0 = 1e-9

/** Fanuc Euler angles (I, J, K) with `M = Rz(I) Rx(J) Rz(K)`, J in [0, 180]. At J = 0 or 180 only I + K (I - K) is defined: K = 0. */
export const eulerZXZ = (m: Mat3): { readonly i: number; readonly j: number; readonly k: number } => {
  const j = Math.acos(clamp1(m[8]))
  if (Math.sin(j) > near0) return { i: Math.atan2(m[2], -m[5]) * DEG, j: j * DEG, k: Math.atan2(m[6], m[7]) * DEG }
  return { i: Math.atan2(m[3], m[0]) * DEG, j: j * DEG, k: 0 }
}

/** Siemens axis-by-axis angles (A, B, C) with `M = Rx(A) Ry(B) Rz(C)`, B in [-90, 90]. At B = +-90 only A -/+ C is defined: C = 0. */
export const eulerXYZ = (m: Mat3): { readonly a: number; readonly b: number; readonly c: number } => {
  const b = Math.asin(clamp1(m[2]))
  if (Math.cos(b) > near0) return { a: Math.atan2(-m[5], m[8]) * DEG, b: b * DEG, c: Math.atan2(-m[1], m[0]) * DEG }
  return { a: Math.atan2(b > 0 ? m[3] : -m[3], m[4]) * DEG, b: b * DEG, c: 0 }
}

/** Heidenhain spatial angles (SPA, SPB, SPC) with `M = Rz(SPC) Ry(SPB) Rx(SPA)`, SPB in [-90, 90]. At SPB = +-90 SPC = 0. */
export const spatialAngles = (m: Mat3): { readonly spa: number; readonly spb: number; readonly spc: number } => {
  const b = Math.asin(clamp1(-m[6]))
  if (Math.cos(b) > near0) return { spa: Math.atan2(m[7], m[8]) * DEG, spb: b * DEG, spc: Math.atan2(m[3], m[0]) * DEG }
  const s = b > 0 ? 1 : -1
  return { spa: Math.atan2(s * m[1], s * m[2]) * DEG, spb: b * DEG, spc: 0 }
}

/** Whether `a` and `b` are the same plane (origin and axes) within `eps`. */
export const samePlane = (a: WorkFrame, b: WorkFrame, eps = 1e-9): boolean =>
  [[a.origin, b.origin], [a.xAxis, b.xAxis], [a.yAxis, b.yAxis], [a.zAxis, b.zAxis]].every(([p, q]) => length3({ x: p!.x - q!.x, y: p!.y - q!.y, z: p!.z - q!.z }) <= eps)

/** Handedness and unit length of a frame, for the callers that build one by hand. */
export const frameIsRigid = (frame: WorkFrame): boolean =>
  validateWorkFrame(frame).length === 0 && Math.abs(dot3(cross3(frame.xAxis, frame.yAxis), frame.zAxis) - 1) < 1e-9

// ------------------------------------------------------------------------------------------------- Fanuc

const signedNumber = (text: string): string => (text.startsWith("-") || text.startsWith("+") ? text : `+${text}`)

/**
 * Fanuc 30i/31i/32i-B tilted working plane indexing:
 *  - `G68.2 X Y Z I J K`  defines the feature coordinate system (P omitted = P0, Euler angles in the order Z, X', Z''; the origin is
 *    in the active work coordinate system). It rotates the programmed coordinates only.
 *  - `G53.1`  tool-axis direction control: turns the rotary axes so that the tool is perpendicular to the feature's XY plane.
 *  - `G69`    cancels the feature coordinate system; the rotary axes stay where they are, so they are sent to 0 explicitly.
 *  - `G91 G28 Z0` before every rotary move retracts the tool axis to the machine's reference point (the table must not turn with the
 *    tool in the cut), then `G90` restores absolute programming.
 * Needs the machine builder's option "tilted working plane indexing" (and the rotary axes' parameters set). Not run on a real control.
 */
export const fanucTiltedPlane: TiltedPlaneCodes = {
  set: (c) => {
    const e = eulerZXZ(c.matrix)
    return [
      "G91 G28 Z0", "G90",
      `G68.2 X${c.origin.x} Y${c.origin.y} Z${c.origin.z} I${c.angle(e.i)} J${c.angle(e.j)} K${c.angle(e.k)}`,
      "G53.1"
    ]
  },
  reset: (c) => ["G91 G28 Z0", "G90", "G69", ...(c.rotaryAxes.length > 0 ? [`G0 ${c.rotaryAxes.map((a) => `${a}${c.number(0)}`).join(" ")}`] : [])]
}

// ------------------------------------------------------------------------------------------------- Siemens

/**
 * Siemens 840D sl swivel cycle, all 16 parameters (SINUMERIK Operate milling, CYCLE800):
 *
 *   CYCLE800(_FR, _TC, _ST, _MODE, _X0, _Y0, _Z0, _A, _B, _C, _X1, _Y1, _Z1, _DIR, _FR_I, _DMODE)
 *
 *   _FR    retraction before swivelling (0 none, 1 Z to its maximum, 2 Z then X/Y, 4 Z by _FR_I)
 *   _TC    name of the swivel data record (machine data of the kinematic chain)
 *   _ST    status word of the swivel data (units digit 1: add to the active swivel)
 *   _MODE  57 = axis by axis, rotation sequence X, new Y, new Z (A about X, B about Y, C about Z)
 *   _X0 _Y0 _Z0  reference point before the swivel = the plane's origin in the work offset
 *   _A _B _C     the rotations, degrees
 *   _X1 _Y1 _Z1  reference point after the swivel (a shift in the swivelled plane): 0
 *   _DIR   -1 / +1 selects one of the two rotary solutions
 *   _FR_I  incremental retraction distance for _FR = 4, mm
 *   _DMODE display mode of the swivel in the control's screens: 1
 * `CYCLE800()` without parameters deselects the swivel. The cancel first swivels the axes back to the basic position (all angles 0, the
 * same cycle), then deselects.
 */
export const siemensTiltedPlane: TiltedPlaneCodes = {
  set: (c) => {
    const s = c.swivel
    if (s === undefined || s.dataRecord.length === 0) throw new RangeError("Siemens tilted plane: set options.swivel.dataRecord (the machine's swivel data record, CYCLE800 _TC)")
    const e = eulerXYZ(c.matrix)
    return [cycle800(c, s, [c.origin.x, c.origin.y, c.origin.z], [c.angle(e.a), c.angle(e.b), c.angle(e.c)])]
  },
  reset: (c) => {
    const s = c.swivel
    if (s === undefined || s.dataRecord.length === 0) throw new RangeError("Siemens tilted plane: set options.swivel.dataRecord (the machine's swivel data record, CYCLE800 _TC)")
    const zero = c.number(0)
    return [cycle800(c, s, [zero, zero, zero], [c.angle(0), c.angle(0), c.angle(0)]), "CYCLE800()"]
  }
}

const cycle800 = (c: PlaneCall, s: NonNullable<PlaneCall["swivel"]>, at: readonly [string, string, string], abc: readonly [string, string, string]): string => {
  const direction = c.plane.solution ?? -1
  return `CYCLE800(${s.retraction ?? 1},"${s.dataRecord.replace(/"/g, "")}",${s.status ?? 0},57,${at.join(",")},${abc.join(",")},0,0,0,${direction},${s.retractDistance ?? 100},1)`
}

// ------------------------------------------------------------------------------------------------- Heidenhain

/**
 * Heidenhain TNC 640 / TNC7: the datum goes to the plane's origin (cycle 7, absolute to the preset), then
 * `PLANE SPATIAL SPA SPB SPC TURN MB MAX FMAX [SEQ+|SEQ-]`:
 *  - SPA SPB SPC  spatial angles, rotations about the fixed X, Y, Z axes in that order;
 *  - TURN         the control positions the rotary axes (MOVE would only rotate the coordinate system, STAY leaves the axes);
 *  - MB MAX       before turning, the tool axis retracts to its software limit; FMAX rapid;
 *  - SEQ+/SEQ-    which of the two rotary solutions.
 * `PLANE RESET TURN MB MAX FMAX` cancels the plane and turns the axes back; the datum is then moved back to the preset (cycle 7 with
 * zeros). Lines carry the Klartext prefix: the Klartext writer passes them through unchanged.
 */
export const klartextTiltedPlane: TiltedPlaneCodes = {
  set: (c) => {
    const a = spatialAngles(c.matrix)
    const seq = c.plane.solution === undefined ? "" : c.plane.solution > 0 ? " SEQ+" : " SEQ-"
    return [
      ...datum(c.origin.x, c.origin.y, c.origin.z),
      `${KLARTEXT_PREFIX}PLANE SPATIAL SPA${signedNumber(c.angle(a.spa))} SPB${signedNumber(c.angle(a.spb))} SPC${signedNumber(c.angle(a.spc))} TURN MB MAX FMAX${seq}`
    ]
  },
  reset: (c) => [`${KLARTEXT_PREFIX}PLANE RESET TURN MB MAX FMAX`, ...datum(c.number(0), c.number(0), c.number(0))]
}

/** Cycle 7 DATUM SHIFT, one block per row as the TNC writes it. */
const datum = (x: string, y: string, z: string): string[] => [
  `${KLARTEXT_PREFIX}CYCL DEF 7.0 DATUM SHIFT`,
  `${KLARTEXT_PREFIX}CYCL DEF 7.1 X${signedNumber(x)}`,
  `${KLARTEXT_PREFIX}CYCL DEF 7.2 Y${signedNumber(y)}`,
  `${KLARTEXT_PREFIX}CYCL DEF 7.3 Z${signedNumber(z)}`
]
