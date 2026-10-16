/**
 * Rotary (4/5-axis and 3+2) programs in the preview (spec 31 §5.5): which trunnion table the program is for, which frame its
 * coordinates are in, and where the part and the tool are for the angles of each move.
 *
 * The table turns, not the head (`indexing.ts`): R = Rx(A) Rz(C) for `table-AC`, Ry(B) Rz(C) for `table-BC`, machine = R (part
 * - pivot) + pivot. A program is written either in part coordinates with the control applying the tool centre point (Haas
 * G234, Fanuc G43.4: "control TCP"), or in machine coordinates (no TCP, and every indexed `Orient` program of the kernel).
 *
 *   part frame     the part (and its stock, vise, path) is still; the tool leans: its axis in the part is R^T (0, 0, 1)
 *   machine frame  the tool stays vertical; the table with everything on it turns by R about the pivot
 */
import type { Vec3 } from "../../cad/vec.ts"
import { expandMoves, type Program, type Rotary } from "../ir.ts"
import { partToMachine, tableRotation, type Matrix, type RotaryLayout } from "../indexing.ts"

/** Rotary axis angles, degrees (an axis not given is 0). */
export type Angles = Rotary
const full = (a: Angles) => ({ ...(a.a !== undefined ? { a: a.a } : {}), ...(a.b !== undefined ? { b: a.b } : {}), c: a.c ?? 0 })

export interface RotarySetup {
  readonly layout: RotaryLayout
  readonly pivot: Vec3
  /** The frame the program's X Y Z are in. */
  readonly coordinates: "part" | "machine"
  /** Layout, pivot or frame were not stated by the program: read from its axes, shown as an assumption. */
  readonly assumed: boolean
  readonly reasons: ReadonlyArray<string>
}

/** The rotary angles the program uses, or `undefined` for a 3-axis program. */
export const rotaryOfProgram = (program: Program, gcode = "", pivot: Vec3 = { x: 0, y: 0, z: 0 }): RotarySetup | undefined => {
  const used = { a: false, b: false, c: false }
  let orient = false
  for (const path of program.toolpaths) for (const m of path.moves) {
    const angles = m._tag === "Orient" ? m : (m._tag === "Rapid" || m._tag === "Linear") ? m.rotary : undefined
    if (m._tag === "Orient") orient = true
    if (angles === undefined) continue
    if (angles.a !== undefined && angles.a !== 0) used.a = true
    if (angles.b !== undefined && angles.b !== 0) used.b = true
    if (angles.c !== undefined && angles.c !== 0) used.c = true
  }
  if (!used.a && !used.b && !used.c && !orient) return undefined
  const header = gcode.slice(0, 4000).toUpperCase()
  const reasons: string[] = []
  let layout: RotaryLayout
  let assumed = false
  if (/TABLE-BC/.test(header)) { layout = "table-BC"; reasons.push("the program header names a table-BC trunnion") }
  else if (/TABLE-AC/.test(header)) { layout = "table-AC"; reasons.push("the program header names a table-AC trunnion") }
  else { layout = used.b && !used.a ? "table-BC" : "table-AC"; assumed = true; reasons.push(`a ${layout} trunnion read from the ${used.b && !used.a ? "B" : "A"} words`) }
  let coordinates: "part" | "machine"
  if (orient) { coordinates = "machine"; reasons.push("indexed (Orient) moves are in machine coordinates") }
  else if (/MACHINE COORDINATES/.test(header)) { coordinates = "machine"; reasons.push("the header says machine coordinates") }
  else if (/CONTROL TCP|\bG234\b|\bG43\.4\b|\bG43\.5\b|\bTRAORI\b|\bM128\b/.test(gcode.toUpperCase())) { coordinates = "part"; reasons.push("the control applies the tool centre point (G234 / G43.4 / TRAORI / M128)") }
  else { coordinates = "part"; assumed = true; reasons.push("no TCP word: part coordinates assumed") }
  return { layout, pivot, coordinates, assumed, reasons }
}

const transpose = (m: Matrix): Matrix => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]
const apply = (m: Matrix, v: Vec3): Vec3 => ({ x: m[0] * v.x + m[1] * v.y + m[2] * v.z, y: m[3] * v.x + m[4] * v.y + m[5] * v.z, z: m[6] * v.x + m[7] * v.y + m[8] * v.z })

/** The table rotation for the angles (row-major 3x3). */
export const rotationOf = (angles: Angles, rotary: RotarySetup): Matrix => tableRotation(full(angles), rotary.layout)

/** The tool axis seen from the part for the angles: R^T (0, 0, 1). */
export const toolAxisInPart = (angles: Angles, rotary: RotarySetup): Vec3 => apply(transpose(rotationOf(angles, rotary)), { x: 0, y: 0, z: 1 })

/** A program point in the part frame. */
export const partPointOf = (p: Vec3, angles: Angles, rotary: RotarySetup): Vec3 => {
  if (rotary.coordinates === "part") return p
  const q = apply(transpose(rotationOf(angles, rotary)), { x: p.x - rotary.pivot.x, y: p.y - rotary.pivot.y, z: p.z - rotary.pivot.z })
  return { x: q.x + rotary.pivot.x, y: q.y + rotary.pivot.y, z: q.z + rotary.pivot.z }
}

/** A program point in the machine frame (after the table has turned). */
export const machinePointOf = (p: Vec3, angles: Angles, rotary: RotarySetup): Vec3 =>
  rotary.coordinates === "machine" ? p : partToMachine(p, full(angles), rotary.layout, rotary.pivot)

/** Angles between two moves' angles at fraction t (linear per axis, as the control interpolates them). */
export const lerpAngles = (from: Angles, to: Angles, t: number): Angles => {
  const out: { a?: number; b?: number; c?: number } = {}
  for (const k of ["a", "b", "c"] as const) {
    const f = from[k], g = to[k]
    if (f === undefined && g === undefined) continue
    out[k] = (f ?? 0) + ((g ?? 0) - (f ?? 0)) * t
  }
  return out
}

/** The angles in effect at each expanded move of each toolpath (Orient sets them; rotary words on a move set its end). */
export const anglesByMove = (program: Program): ReadonlyArray<ReadonlyArray<Angles>> => {
  let current: Angles = {}
  let from: Vec3 = { x: 0, y: 0, z: 0 }
  return program.toolpaths.map((path) => expandMoves(path.moves, from).map((m) => {
    if (m._tag === "Orient") current = { ...current, ...(m.a !== undefined ? { a: m.a } : {}), ...(m.b !== undefined ? { b: m.b } : {}), ...(m.c !== undefined ? { c: m.c } : {}) }
    else if ((m._tag === "Rapid" || m._tag === "Linear") && m.rotary !== undefined) current = { ...current, ...m.rotary }
    if (m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Arc") from = m.to
    return current
  }))
}
