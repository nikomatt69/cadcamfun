/**
 * Program coordinates -> the preview's display world (spec 31 §4.2). The display is Three.js-style: millimetres, Z up.
 *
 *   mill, printer  identity: what the program says is where it is drawn (today's coordinates do not move).
 *   lathe          the spindle axis lies horizontal: display x = Z (the chuck on the left, the free end on the right),
 *                  display z = ±radius (X / 2 in diameter mode, X in radius mode; + for a rear turret, - for a front one),
 *                  display y = 0. The part is round, so drawing the tool plane at that azimuth is exact.
 *
 * Rotation senses follow ISO 6983: M3 is clockwise seen from the spindle towards the workpiece. On a mill the spindle looks
 * down -Z, so M3 is a negative rotation about +Z; on a lathe the headstock looks along +Z, so M3 is a positive rotation
 * about the spindle axis (display +x).
 */
import type { Vec3 } from "../../cad/vec.ts"
import { KINEMATICS, type MachineKind } from "../machine.ts"
import type { MachineSetup } from "./machine-setup.ts"

export type XMode = "diameter" | "radius"

/** Where a program point is drawn. `xMode` overrides the set-up's (the program's G7 / G8). */
export const displayPoint = (setup: MachineSetup, p: Vec3, xMode?: XMode): Vec3 => {
  if (setup.kind !== "lathe") return p
  const radius = (xMode ?? setup.xMode) === "diameter" ? p.x / 2 : p.x
  return { x: p.z, y: 0, z: (setup.turret === "rear" ? 1 : -1) * radius }
}

/** The program point under a display point (lathe: the tool plane y = 0; y is ignored). */
export const programPoint = (setup: MachineSetup, d: Vec3, xMode?: XMode): Vec3 => {
  if (setup.kind !== "lathe") return d
  const radius = (setup.turret === "rear" ? 1 : -1) * d.z
  return { x: (xMode ?? setup.xMode) === "diameter" ? 2 * radius : radius, y: 0, z: d.x }
}

export const AXIS_COLORS = { X: 0xef4444, Y: 0x22c55e, Z: 0x3b82f6 } as const

export interface DisplayAxis {
  readonly name: "X" | "Y" | "Z"
  /** Unit direction of the axis' positive sense in the display world. */
  readonly direction: Vec3
  readonly color: number
  readonly label: string
  /** What travels along it, from the kinematics table. */
  readonly moves: string
  readonly positive: string
}

export interface DisplayRotary {
  readonly name: "S" | "C"
  /** Axis the rotation turns about, display world, and a point on it. */
  readonly axis: Vec3
  readonly through: Vec3
  readonly turns: "tool" | "workpiece"
}

/** The machine triad the preview draws at the work zero: the machine's own axes (a lathe has no Y) and what turns. */
export const displayAxes = (setup: MachineSetup): { readonly axes: ReadonlyArray<DisplayAxis>; readonly rotary?: DisplayRotary } => {
  const info = KINEMATICS[setup.kind]
  const of = (name: "X" | "Y" | "Z") => info.axes.find((a) => a.name === name)!
  if (setup.kind === "lathe") {
    const up = setup.turret === "rear" ? 1 : -1
    return {
      axes: [
        { name: "Z", direction: { x: 1, y: 0, z: 0 }, color: AXIS_COLORS.Z, label: "Z", moves: of("Z").moves, positive: of("Z").positive },
        { name: "X", direction: { x: 0, y: 0, z: up }, color: AXIS_COLORS.X, label: setup.xMode === "diameter" ? "X Ø" : "X", moves: of("X").moves, positive: of("X").positive }
      ],
      rotary: { name: "C", axis: { x: 1, y: 0, z: 0 }, through: { x: 0, y: 0, z: 0 }, turns: "workpiece" }
    }
  }
  const axes: DisplayAxis[] = (["X", "Y", "Z"] as const).map((name) => ({
    name, direction: { x: name === "X" ? 1 : 0, y: name === "Y" ? 1 : 0, z: name === "Z" ? 1 : 0 }, color: AXIS_COLORS[name],
    label: setup.kind === "3dprinter" && name === "Z" ? "Z build" : name, moves: of(name).moves, positive: of(name).positive
  }))
  return setup.kind === "mill" ? { axes, rotary: { name: "S", axis: { x: 0, y: 0, z: 1 }, through: { x: 0, y: 0, z: 0 }, turns: "tool" } } : { axes }
}

/** Sign of the rotation about the display axis of what turns (mill: the tool about +Z; lathe: the part about +x). */
export const spinSense = (kind: MachineKind, spindle: "cw" | "ccw" | "off"): -1 | 0 | 1 => {
  if (spindle === "off" || kind === "3dprinter") return 0
  const cw = spindle === "cw"
  return kind === "mill" ? (cw ? -1 : 1) : (cw ? 1 : -1)
}

/** The rotation sense in words, for the assistant and the legend. */
export const spinSenseText = (kind: MachineKind, spindle: "cw" | "ccw"): string =>
  kind === "3dprinter" ? "a printer has no spindle"
    : kind === "mill"
      ? `the tool turns ${spindle === "cw" ? "clockwise" : "counter-clockwise"} seen from the spindle looking down at the part (${spindle === "cw" ? "negative" : "positive"} about +Z); the part does not move`
      : `the part turns with the chuck ${spindle === "cw" ? "clockwise" : "counter-clockwise"} seen from the headstock towards the tailstock (${spindle === "cw" ? "positive" : "negative"} about +Z, the spindle axis); the tool does not turn`

/** Largest spin the preview shows, revolutions per program second (faster would alias at 60 frames per second). */
export const MAX_DISPLAY_REV_PER_SECOND = 2

/** Revolutions per second the preview shows for a spindle at `rpm`. */
export const displaySpinRate = (rpm: number): number => Math.max(0, Math.min(rpm / 60, MAX_DISPLAY_REV_PER_SECOND))
