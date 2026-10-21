/**
 * How a program's machine is set up, as the toolpath preview shows it and the setup checks use it (spec 31 §4.1).
 *
 *   mill     the tool turns in the spindle; the stock is held still by a vise (jaws along X or Y), strap clamps, a plate or
 *            nothing; the table is under it. The stock box is in program (work) coordinates.
 *   lathe    the stock bar turns with the chuck about the spindle axis (machine Z); the tool travels in X (diameter or
 *            radius) and Z on a rear or front turret. No Y.
 *   printer  nothing turns; the nozzle deposits on a bed of the given size and origin.
 *
 * Every builder fills what the settings do not say with defaults and records it in `assumed`: the preview draws assumed parts
 * translucent and the checks never report them as verified (principle 4 of the spec).
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { WorkOffset } from "../ir.ts"
import type { Stock, ToolpathSettings } from "../generator/schema.ts"
import { stockInWork } from "../generator/dispatch.ts"
import type { CamArtifact } from "../kernel/contracts.ts"
import { toolModelFromSettings, type LatheModel, type NozzleModel } from "../tool-model.ts"
import { toolForOperation } from "../operation-tools.ts"
import { rotaryOfProgram, type RotarySetup } from "./rotary.ts"
import type { Program } from "../ir.ts"
import { turnMillAxesOf } from "./turn-mill.ts"

export interface StockBox { readonly min: Vec3; readonly max: Vec3 }

export type MillWorkholding =
  | { readonly kind: "vise"; readonly jawAxis: "x" | "y"; readonly clampDepth: number; readonly jawHeight: number; readonly jawThickness: number; readonly jawLength: number; readonly maxOpening: number; readonly parallels: number }
  | { readonly kind: "clamps"; readonly height: number }
  | { readonly kind: "plate" }
  | { readonly kind: "none" }

export interface LatheWorkholding {
  readonly kind: "3-jaw" | "4-jaw" | "collet"
  /** Stock length inside the jaws, mm. */
  readonly gripLength: number
  readonly chuckDiameter: number
  /** Radial size of a jaw, mm. */
  readonly jawHeight: number
  readonly tailstock: boolean
}

export type PrinterKinematics = "cartesian" | "corexy" | "bed-slinger" | "delta"

export type AssumedPart = "workholding" | "table" | "stock"

export interface MillSetup {
  readonly kind: "mill"
  readonly axes: 3 | 4 | 5
  /** A 4/5-axis or indexed program: its trunnion table and the frame of its coordinates (`rotary.ts`). */
  readonly rotary?: RotarySetup
  readonly workholding: MillWorkholding
  readonly table: { readonly length: number; readonly width: number }
  readonly stock: StockBox
  readonly workOffset: WorkOffset
  readonly assumed: ReadonlyArray<AssumedPart>
}

export interface LatheSetup {
  readonly kind: "lathe"
  /** A mill-turn centre (X/Y/Z + B head + C spindle): activated by B, Y or positioned C, with an assumed B range. */
  readonly turnMill?: { readonly b: readonly [number, number] }
  readonly turret: "rear" | "front"
  readonly xMode: "diameter" | "radius"
  readonly zero: "face" | "chuck"
  readonly stock: { readonly diameter: number; readonly length: number; readonly bore: number }
  readonly workholding: LatheWorkholding
  /** The tool works inside a bore (boring, internal turning): it removes material outwards from the axis. */
  readonly internal: boolean
  /** The tool's cutting width along Z, mm (a grooving or parting blade; a turning insert is a point). */
  readonly toolWidth: number
  readonly toolType: string
  /** Nose radius of the insert, mm (0: a sharp point). The programmed point is the theoretical sharp tip. */
  readonly noseRadius: number
  /** The insert as the preview draws it (`tool-model.ts`). */
  readonly tool: LatheModel
  readonly assumed: ReadonlyArray<AssumedPart>
}

export interface PrinterSetup {
  readonly kind: "3dprinter"
  readonly kinematics: PrinterKinematics
  readonly bed: { readonly width: number; readonly depth: number; readonly origin: "corner" | "center" }
  readonly buildHeight: number
  readonly nozzle: number
  readonly layerHeight: number
  readonly extrusionWidth: number
  /** The hot end as the preview draws it (`tool-model.ts`). */
  readonly tool: NozzleModel
  readonly assumed: ReadonlyArray<AssumedPart>
}

export type MachineSetup = MillSetup | LatheSetup | PrinterSetup

/** Clamp depth of a vise: the setting, or a third of the stock (3..10 mm); never the whole stock. */
export const clampDepthOf = (setting: number, stockDepth: number): number =>
  setting > 0 ? setting : Math.max(Math.min(3, stockDepth / 2), Math.min(10, stockDepth / 3))

/** A table the kernel machine does not describe: a 600 x 400 mm VMC table. */
export const ASSUMED_TABLE = { length: 600, width: 400 } as const

export const millWorkholdingOf = (settings: ToolpathSettings, stock: StockBox): MillWorkholding => {
  const depth = stock.max.z - stock.min.z
  switch (settings.workholding) {
    case "vise": {
      const along = settings.viseJawAxis === "x" ? stock.max.x - stock.min.x : stock.max.y - stock.min.y
      return {
        kind: "vise", jawAxis: settings.viseJawAxis, clampDepth: clampDepthOf(settings.clampDepth, depth), jawHeight: settings.viseJawHeight,
        jawThickness: 20, jawLength: Math.max(100, Math.min(along + 20, 200)), maxOpening: 160, parallels: settings.parallelsHeight
      }
    }
    case "clamps": return { kind: "clamps", height: 12 }
    case "plate": return { kind: "plate" }
    case "none": return { kind: "none" }
  }
}

/** The mill set-up of the generator: its settings, the stock moved into the program's coordinates, an optional machine table. */
export const millSetupOf = (settings: ToolpathSettings, stock: Stock, table?: { readonly length: number; readonly width: number }): MillSetup => {
  const box = stockInWork(settings, stock)
  return {
    kind: "mill", axes: 3, workholding: millWorkholdingOf(settings, box), table: table ?? ASSUMED_TABLE, stock: box, workOffset: settings.workOffset,
    assumed: [...(settings.workholdingConfigured ? [] : ["workholding" as const]), ...(table === undefined ? ["table" as const] : [])]
  }
}

/** The kernel's set-up: its stock relative to its work zero and the table of its machine preset. */
export const millSetupFromArtifact = (artifact: CamArtifact, settings: ToolpathSettings, table?: { readonly length: number; readonly width: number }): MillSetup => {
  const { min, max } = artifact.stockBounds
  const o = artifact.origin
  // The original fixture cannot be reused as evidence after a manual refixture.
  const manual = artifact.setupOrientation !== undefined && artifact.setupOrientation !== "+Z"
  const setupSettings = manual ? { ...settings, workholding: "none" as const, workholdingConfigured: false } : settings
  const box: StockBox = { min: { x: min.x - o.x, y: min.y - o.y, z: min.z - o.z }, max: { x: max.x - o.x, y: max.y - o.y, z: max.z - o.z } }
  return {
    kind: "mill", axes: 3, workholding: millWorkholdingOf(setupSettings, box), table: table ?? ASSUMED_TABLE, stock: box, workOffset: artifact.program.workOffset,
    assumed: [...(setupSettings.workholdingConfigured ? [] : ["workholding" as const]), ...(table === undefined ? ["table" as const] : [])]
  }
}

const INTERNAL_TOOLS = new Set(["boring"])

export const latheSetupOf = (settings: ToolpathSettings, tool: LatheModel = toolForOperation(settings, "lathe") as LatheModel): LatheSetup => {
  const diameter = settings.stockDiameter
  const internal = INTERNAL_TOOLS.has(settings.toolType) || tool.insert === "boring" || settings.operationType === "boring" || settings.turningOperation === "internal"
  const blade = tool.insert === "grooving" || tool.insert === "parting" || settings.operationType === "grooving" || settings.operationType === "parting"
  return {
    kind: "lathe", turret: settings.latheTurret, xMode: "diameter", zero: settings.latheZero,
    stock: { diameter, length: settings.stockLength, bore: Math.min(settings.stockBore, diameter * 0.95) },
    workholding: {
      kind: settings.chuckType, gripLength: settings.gripLength, chuckDiameter: Math.max(160, 2.6 * diameter),
      jawHeight: Math.max(12, diameter * 0.3), tailstock: settings.tailstock
    },
    internal,
    toolWidth: blade ? Math.max(0.5, Math.min(tool.width > 0 ? tool.width : settings.toolDiameter, 10)) : 0,
    toolType: tool.insert,
    noseRadius: tool.noseRadius,
    tool,
    assumed: settings.workholdingConfigured ? [] : ["workholding"]
  }
}

export const printerSetupOf = (settings: ToolpathSettings): PrinterSetup => ({
  kind: "3dprinter", kinematics: settings.printerKinematics,
  bed: { width: settings.bedWidth, depth: settings.bedDepth, origin: settings.bedOrigin },
  buildHeight: settings.buildHeight, nozzle: settings.nozzleDiameter, layerHeight: settings.layerHeight, extrusionWidth: settings.extrusionWidth,
  tool: toolModelFromSettings(settings, "3dprinter") as NozzleModel,
  assumed: []
})

/** The set-up of the generator settings for a machine kind (the stock is needed by a mill only). */
export const setupOf = (kind: MachineSetup["kind"], settings: ToolpathSettings, stock: Stock, table?: { readonly length: number; readonly width: number }): MachineSetup =>
  kind === "lathe" ? latheSetupOf(settings) : kind === "3dprinter" ? printerSetupOf(settings) : millSetupOf(settings, stock, table)

/** Activate the existing lathe's mill-turn scene for B, Y or positioned C; remove it for a turning-only program. */
export const withTurnMill = (setup: MachineSetup, program: Program): MachineSetup => {
  if (setup.kind !== "lathe") return setup
  const used = turnMillAxesOf(program)
  const { turnMill: _drop, ...base } = setup
  return used.b || used.y || used.cPositioned ? { ...base, turnMill: { b: [-120, 120] as const } } : base
}

/** A mill set-up with the rotary table its program uses (none for a 3-axis program). */
export const withRotary = (setup: MachineSetup, program: Program, gcode = "", pivot?: Vec3): MachineSetup => {
  if (setup.kind === "lathe") return withTurnMill(setup, program)
  if (setup.kind !== "mill") return setup
  const rotary = rotaryOfProgram(program, gcode, pivot)
  if (rotary === undefined) { const { rotary: _drop, ...rest } = setup; void _drop; return { ...rest, axes: 3 } }
  return { ...setup, rotary, axes: 5 }
}

export interface SetupProblem {
  readonly code: string
  readonly severity: "error" | "warning"
  readonly message: string
}

const finite = (...values: number[]): boolean => values.every(Number.isFinite)

/** What is physically wrong with a set-up. The preview still draws it; the problems are shown and returned to the assistant. */
export const validateMachineSetup = (setup: MachineSetup): ReadonlyArray<SetupProblem> => {
  const out: SetupProblem[] = []
  const add = (severity: SetupProblem["severity"], code: string, message: string) => out.push({ severity, code, message })
  if (setup.kind === "mill") {
    const s = setup.stock
    if (!finite(s.min.x, s.min.y, s.min.z, s.max.x, s.max.y, s.max.z) || s.max.x <= s.min.x || s.max.y <= s.min.y || s.max.z <= s.min.z) {
      add("error", "STOCK_INVALID", "The stock box must be finite with a positive size")
      return out
    }
    const w = setup.workholding
    if (w.kind === "vise") {
      const depth = s.max.z - s.min.z
      const across = w.jawAxis === "x" ? s.max.y - s.min.y : s.max.x - s.min.x
      if (w.clampDepth >= depth) add("error", "VISE_ABOVE_STOCK", `The jaws grip ${w.clampDepth} mm of a ${depth} mm stock: their top is at or above the stock top`)
      else if (depth - w.clampDepth < 2) add("warning", "VISE_LOW_MARGIN", `Only ${(depth - w.clampDepth).toFixed(2)} mm of stock stands above the jaws`)
      if (across > w.maxOpening) add("error", "STOCK_WIDER_THAN_VISE", `The stock is ${across} mm across the jaws; the vise opens ${w.maxOpening} mm`)
      if (w.clampDepth + w.parallels > w.jawHeight) add("warning", "VISE_JAWS_LOW", `Clamp depth plus parallels (${w.clampDepth + w.parallels} mm) exceed the ${w.jawHeight} mm jaws`)
    }
  } else if (setup.kind === "lathe") {
    const { diameter, length, bore } = setup.stock
    if (!finite(diameter, length, bore) || diameter <= 0 || length <= 0) add("error", "STOCK_INVALID", "The bar needs a positive diameter and length")
    if (setup.workholding.gripLength >= length) add("error", "GRIP_TOO_LONG", `The chuck grips ${setup.workholding.gripLength} mm of a ${length} mm bar: nothing sticks out to machine`)
    const stickout = length - setup.workholding.gripLength
    if (!setup.workholding.tailstock && stickout / diameter > 4) add("warning", "LATHE_STICKOUT", `Stickout ${stickout} mm is ${(stickout / diameter).toFixed(1)} x the diameter: the bar will deflect; support it with the tailstock`)
    if (bore >= diameter) add("error", "BORE_TOO_LARGE", "The bore must be smaller than the bar")
  } else {
    if (!finite(setup.bed.width, setup.bed.depth, setup.buildHeight) || setup.bed.width <= 0 || setup.bed.depth <= 0) add("error", "BED_INVALID", "The bed needs a positive size")
  }
  return out
}
