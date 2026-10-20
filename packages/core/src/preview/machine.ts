/**
 * Which machine a stored program is for, its set-up, and the display-ready bodies, spinner and tool of the phone's
 * preview (spec 31 §4–5; the payload contract of spec 13 §6).
 *
 * This is the desktop's policy (`apps/desktop/src/features/cam/lib/machine-view.ts`) restated in the core, so the sidecar
 * can serve the phone the same machine scene the desktop draws without importing a desktop module. Keep the two in step.
 * Everything here is plain data: the phone tessellates the body shapes and draws them, and never maps a program
 * coordinate itself.
 */
import type { Vec3 } from "../cad/vec.ts"
import type { Stock, ToolpathSettings } from "../cam/generator/schema.ts"
import type { Program } from "../cam/ir.ts"
import type { CamArtifact } from "../cam/kernel/contracts.ts"
import type { MachineInference, MachineKind } from "../cam/machine.ts"
import { assumedHolderOf, type ToolModel } from "../cam/tool-model.ts"
import type { Body } from "../cam/viewer/machine-bodies.ts"
import { latheStockEnds, machineBodies } from "../cam/viewer/machine-bodies.ts"
import { latheSetupOf, millSetupFromArtifact, millSetupOf, printerSetupOf, withRotary, type AssumedPart, type MachineSetup } from "../cam/viewer/machine-setup.ts"

// Re-exported so callers of this module keep a single import site (the model itself lives in the `cam` namespace).
export { previewToolModel } from "../cam/operation-tools.ts"

export interface PreviewBounds {
  readonly min: readonly [number, number, number]
  readonly max: readonly [number, number, number]
}

export const EMPTY_BOUNDS: PreviewBounds = { min: [0, 0, 0], max: [0, 0, 0] }

/** A sink of min/max corners, so the same widgets can grow a known bound or a fresh one. */
export interface BoundsSink {
  min: [number, number, number]
  max: [number, number, number]
}

export const freshBounds = (): BoundsSink => ({
  min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
  max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
})

export const grow = (bounds: BoundsSink, x: number, y: number, z: number): void => {
  bounds.min[0] = Math.min(bounds.min[0], x)
  bounds.min[1] = Math.min(bounds.min[1], y)
  bounds.min[2] = Math.min(bounds.min[2], z)
  bounds.max[0] = Math.max(bounds.max[0], x)
  bounds.max[1] = Math.max(bounds.max[1], y)
  bounds.max[2] = Math.max(bounds.max[2], z)
}

export const finishBounds = (bounds: BoundsSink): PreviewBounds =>
  Number.isFinite(bounds.min[0]) ? bounds : EMPTY_BOUNDS

// ---------------------------------------------------------------- which machine

export type PreviewMachineSource = "override" | "kernel" | "generator" | "inferred" | "settings"

export interface PreviewMachineChoice {
  readonly kind: MachineKind
  readonly source: PreviewMachineSource
  /** The program's words point at another machine than the one shown. Flagged, never switched silently. */
  readonly mismatch?: { readonly inferred: MachineKind; readonly reasons: ReadonlyArray<string> }
}

export interface PreviewMachineInputs {
  readonly override?: MachineKind | undefined
  /** The machine that produced the program: the kernel artifact, or the generator for its own G-code. */
  readonly produced?: { readonly kind: MachineKind; readonly source: "kernel" | "generator" } | undefined
  readonly inferred?: MachineInference | undefined
  /** The generator's machine setting. */
  readonly setting: MachineKind
}

/**
 * Order (spec 31 §4.5): the user's pick; else what produced the text (the kernel's program, the generator's own output);
 * else what the program's words say when they are clear; else the generator's machine.
 */
export const choosePreviewMachine = (input: PreviewMachineInputs): PreviewMachineChoice => {
  const pick = (): Omit<PreviewMachineChoice, "mismatch"> => {
    if (input.override !== undefined) return { kind: input.override, source: "override" }
    if (input.produced !== undefined) return input.produced
    if (input.inferred?.confidence === "strong") return { kind: input.inferred.kind, source: "inferred" }
    return { kind: input.setting, source: "settings" }
  }
  const choice = pick()
  const inferred = input.inferred
  return inferred !== undefined && inferred.confidence === "strong" && inferred.kind !== choice.kind
    ? { ...choice, mismatch: { inferred: inferred.kind, reasons: inferred.reasons } }
    : choice
}

// ---------------------------------------------------------------- the set-up

export interface PreviewSetupOptions {
  readonly artifact?: CamArtifact | undefined
  /** The kernel machine preset of the program (its table); absent uses the assumed 600 x 400 VMC table. */
  readonly table?: { readonly length: number; readonly width: number } | undefined
  readonly tool?: ToolModel | undefined
  readonly program?: Program | undefined
  readonly gcode?: string | undefined
}

/** The set-up for the chosen machine: the kernel's stock and table for its program, the generator's settings otherwise. */
export const previewSetupOf = (kind: MachineKind, settings: ToolpathSettings, stock: Stock, options: PreviewSetupOptions = {}): MachineSetup => {
  const base = kind === "mill" && options.artifact !== undefined ? millSetupFromArtifact(options.artifact, settings, options.table)
    : kind === "lathe" ? latheSetupOf(settings, options.tool?.family === "lathe" ? options.tool : undefined)
    : kind === "3dprinter" ? { ...printerSetupOf(settings), ...(options.tool?.family === "nozzle" ? { tool: options.tool, nozzle: options.tool.diameter } : {}) }
    : millSetupOf(settings, stock, options.table)
  return options.program !== undefined ? withRotary(base, options.program, options.gcode ?? "") : base
}

// ---------------------------------------------------------------- display-ready data

/** The bodies around the program, in the display world (`cam.viewer.machineBodies`). */
export const previewBodies = (setup: MachineSetup): ReadonlyArray<Body> => machineBodies(setup)

const growShape = (bounds: BoundsSink, shape: Body["shape"], rotateX?: number): void => {
  if (shape.type === "box") {
    const corners: ReadonlyArray<readonly [number, number]> = [
      [shape.min.y, shape.min.z], [shape.min.y, shape.max.z], [shape.max.y, shape.min.z], [shape.max.y, shape.max.z],
    ]
    grow(bounds, shape.min.x, shape.min.y, shape.min.z)
    grow(bounds, shape.max.x, shape.max.y, shape.max.z)
    const angle = rotateX ?? 0
    if (angle === 0) return
    const cos = Math.cos(angle), sin = Math.sin(angle)
    for (const [y, z] of corners) {
      const ry = y * cos - z * sin, rz = y * sin + z * cos
      grow(bounds, shape.min.x, ry, rz)
      grow(bounds, shape.max.x, ry, rz)
    }
    return
  }
  const radius = shape.type === "cylinder-x" ? shape.radius : Math.max(shape.r0, shape.r1)
  grow(bounds, shape.x0, -radius, -radius)
  grow(bounds, shape.x1, radius, radius)
}

/**
 * What the camera frames: the bodies without the parts that exist to explain the machine (the table and the vise base),
 * the desktop's `fitBounds` rule. The stock itself stays in.
 */
export const previewBodyBounds = (setup: MachineSetup): PreviewBounds => {
  const bounds = freshBounds()
  for (const body of previewBodies(setup)) {
    if (body.role === "table" || body.role === "vise-base") continue
    growShape(bounds, body.shape, body.rotateX)
  }
  return finishBounds(bounds)
}

/** The stock on the machine, display coordinates: the work box (mill), the bar (lathe) or the build volume (printer). */
export const previewStockBounds = (setup: MachineSetup): PreviewBounds => {
  const bounds = freshBounds()
  if (setup.kind === "mill") {
    return { min: [setup.stock.min.x, setup.stock.min.y, setup.stock.min.z], max: [setup.stock.max.x, setup.stock.max.y, setup.stock.max.z] }
  }
  if (setup.kind === "lathe") {
    const { back, free } = latheStockEnds(setup)
    const radius = setup.stock.diameter / 2
    grow(bounds, back, -radius, -radius)
    grow(bounds, free, radius, radius)
    return finishBounds(bounds)
  }
  const { width, depth, origin } = setup.bed
  const x0 = origin === "corner" ? 0 : -width / 2
  const y0 = origin === "corner" ? 0 : -depth / 2
  grow(bounds, x0, y0, 0)
  grow(bounds, x0 + width, y0 + depth, setup.buildHeight)
  return finishBounds(bounds)
}

const fmt = (value: number): string => String(Math.round(value * 100) / 100)

export interface PreviewMachineInfo {
  /** What turns while it works, in words (the desktop assistant's phrasing). */
  readonly turns: string
  /** How the part is held, in words. */
  readonly workholding: string
  readonly assumed: ReadonlyArray<AssumedPart>
}

/** The sentences the phone's header shows: the same facts `previewSummary` gives the desktop assistant. */
export const previewMachineInfo = (setup: MachineSetup): PreviewMachineInfo => {
  const assumed = setup.assumed
  if (setup.kind === "mill") {
    const w = setup.workholding
    const workholding = w.kind === "vise"
      ? `vise, jaws along ${w.jawAxis.toUpperCase()}, clamp ${fmt(w.clampDepth)} mm, parallels ${fmt(w.parallels)} mm`
      : w.kind === "clamps" ? `strap clamps, ${fmt(w.height)} mm high` : w.kind
    return { turns: "the tool turns, the part is clamped", workholding, assumed }
  }
  if (setup.kind === "lathe") {
    const w = setup.workholding
    const stickout = setup.stock.length - w.gripLength
    const workholding = `${w.kind}${w.kind === "collet" ? "" : " chuck"} grip ${fmt(w.gripLength)} mm (stickout ${fmt(stickout)} mm) on Ø${fmt(setup.stock.diameter)}×${fmt(setup.stock.length)}, ${setup.turret} turret, Z0 ${setup.zero === "face" ? "finished face" : "chuck end"}${w.tailstock ? ", tailstock" : ""}`
    return { turns: `the part turns in the chuck, the tool travels in X (${setup.xMode}) and Z`, workholding, assumed }
  }
  return {
    turns: "nothing turns, the nozzle deposits",
    workholding: `bed ${fmt(setup.bed.width)}×${fmt(setup.bed.depth)} (${setup.bed.origin} origin), ${setup.kinematics}, build height ${fmt(setup.buildHeight)}`,
    assumed,
  }
}

/** The tool the playhead draws, as plain numbers the phone can build its glyph from. */
export interface PreviewToolGlyph {
  readonly family: "mill" | "lathe" | "nozzle"
  /** Cutter diameter (mill) or nozzle opening (printer), mm; 0 when unknown, and the phone falls back to a marker size. */
  readonly diameter: number
  /** Lathe: cutting width along Z, mm (a grooving or parting blade; a turning insert is a point). */
  readonly width: number
  /** Lathe: nose radius of the insert, mm. */
  readonly noseRadius: number
  /** Lathe: insert family (`cam.LatheInsert`), for the glyph's shape. */
  readonly insert: string
  /** Lathe: the tool works inside a bore. */
  readonly internal: boolean
  readonly turret?: "rear" | "front"
}

export const previewToolGlyph = (setup: MachineSetup, tool?: ToolModel): PreviewToolGlyph => {
  if (setup.kind === "lathe") {
    return { family: "lathe", diameter: 0, width: setup.toolWidth, noseRadius: setup.noseRadius, insert: setup.tool.insert, internal: setup.internal, turret: setup.turret }
  }
  if (setup.kind === "3dprinter") return { family: "nozzle", diameter: setup.nozzle, width: 0, noseRadius: 0, insert: "", internal: false }
  return { family: "mill", diameter: tool?.family === "mill" ? tool.diameter : 0, width: 0, noseRadius: 0, insert: "", internal: false }
}

/** A run of equal display spin: from `segment` on, the spindle turns `rate` revolutions per second (signed, capped). */
export interface PreviewSpinRun {
  readonly segment: number
  readonly rate: number
}

/**
 * The cutter the phone draws at the playhead: the real tool of the operation, not a marker.
 *
 * The desktop draws the same assembly (`viewport/view3d/tool-object.ts`), so the phone's tool is the tool the
 * program runs. A mill only: a lathe draws its insert and a printer its nozzle (the `tool` glyph).
 */
export interface PreviewCutter {
  /** Cutting diameter, mm. */
  readonly diameter: number
  /** Cutting length from the tip, mm. */
  readonly fluteLength: number
  /** Shank diameter, mm. */
  readonly shankDiameter: number
  /** Tip to the holder face, mm: the length that reaches below the stock top. */
  readonly stickout: number
  /** Nose radius of a ball nose, 0 for a flat cutter. */
  readonly noseRadius: number
  readonly holder: {
    readonly diameter: number
    readonly length: number
    /** The holder's kind (`er`, `shrink`, ...); `assumed` when the document names none. */
    readonly kind: string
    readonly assumed: boolean
  }
}

/** The cutter of a mill tool model, or undefined for anything that is not a mill. */
export const previewCutterOf = (model: ToolModel | undefined): PreviewCutter | undefined => {
  if (model === undefined || model.family !== "mill") return undefined
  const holder = model.holder ?? assumedHolderOf(model)
  return {
    diameter: model.diameter,
    fluteLength: model.fluteLength,
    shankDiameter: model.shankDiameter,
    stickout: model.stickout,
    noseRadius: model.cornerRadius ?? 0,
    holder: {
      diameter: holder.diameter,
      length: holder.length,
      kind: holder.kind ?? "er",
      assumed: model.assumed.some((entry) => entry.toLowerCase().includes("holder")),
    },
  }
}

/**
 * One operation of a program: a toolpath and the run of path segments it drew.
 *
 * A program that changes tools is one toolpath per tool (spec 32 §4.8), so the phone can colour, list and hide the
 * operations apart, exactly like the desktop's operation list.
 */
export interface PreviewOperation {
  /** The toolpath's index in the program. */
  readonly index: number
  readonly name: string
  readonly toolId: string
  /** First segment of this operation in the payload's `segments`. */
  readonly startSegment: number
  /** Last segment of this operation (inclusive). */
  readonly endSegment: number
  /** The cutter the operation runs, when the document knows it. */
  readonly cutter?: PreviewCutter
}

/**
 * A contact on the playback clock: the tool into the workholding, into the stock left, or a near miss.
 *
 * The phone marks the segment, lists the message and can seek to the moment. `seconds` is the desktop's own clock
 * (the same one the visualizer plays), so a phone that shows a different estimate still lands on the same move.
 */
export interface PreviewCollisionEvent {
  /** The check's code (`MILL_INTO_VISE`, `HOLDER_IN_STOCK`, `NEAR_MISS`, ...). */
  readonly code: string
  readonly severity: "error" | "warning"
  /** Playback time of the contact, seconds. */
  readonly seconds: number
  /** The first payload segment of the move the contact happens on. */
  readonly segment: number
  /** The source line, when the program has one. */
  readonly line?: number
  readonly message: string
}

/** The whole machine around the program, as the phone draws it. `segments` are in display coordinates then. */
export interface PreviewMachine {
  readonly kind: MachineKind
  readonly source: PreviewMachineSource
  readonly mismatch?: { readonly inferred: MachineKind; readonly reasons: ReadonlyArray<string> }
  /** Counted axes: 3 for a mill (4/5 with a rotary table), 2 for a lathe, 3 for a printer. */
  readonly axes: number
  readonly turns: string
  readonly workholding: string
  readonly assumed: ReadonlyArray<AssumedPart>
  readonly xMode?: "diameter" | "radius"
  readonly turret?: "rear" | "front"
  readonly bodies: ReadonlyArray<Body>
  /** Signed display revolutions per second from `segment` on; empty when nothing turns. */
  readonly spin: ReadonlyArray<PreviewSpinRun>
  /** Indices of the segments whose move runs into a body (drawn red). */
  readonly collisions: ReadonlyArray<number>
  /** The program's operations, in order; each owns a run of the path's segments. */
  readonly operations: ReadonlyArray<PreviewOperation>
  /** Contacts on the playback clock: the tool into the workholding, into the stock left, a near miss. */
  readonly events: ReadonlyArray<PreviewCollisionEvent>
  readonly tool: PreviewToolGlyph
}

export interface MachineBlockInputs {
  readonly setup: MachineSetup
  readonly choice: PreviewMachineChoice
  readonly tool?: ToolModel | undefined
  readonly spin?: ReadonlyArray<PreviewSpinRun>
  readonly collisions?: ReadonlyArray<number>
  readonly operations?: ReadonlyArray<PreviewOperation>
  readonly events?: ReadonlyArray<PreviewCollisionEvent>
}

/** The `machine` block of the phone's toolpath preview. */
export const previewMachineBlock = (input: MachineBlockInputs): PreviewMachine => {
  const { setup } = input
  const info = previewMachineInfo(setup)
  return {
    kind: setup.kind,
    source: input.choice.source,
    ...(input.choice.mismatch !== undefined ? { mismatch: input.choice.mismatch } : {}),
    axes: setup.kind === "mill" ? setup.axes : setup.kind === "lathe" ? 2 : 3,
    turns: info.turns,
    workholding: info.workholding,
    assumed: info.assumed,
    ...(setup.kind === "lathe" ? { xMode: setup.xMode, turret: setup.turret } : {}),
    bodies: previewBodies(setup),
    spin: input.spin ?? [],
    collisions: input.collisions ?? [],
    operations: input.operations ?? [],
    events: input.events ?? [],
    tool: previewToolGlyph(setup, input.tool),
  }
}

export type { Body, BodyShape, BodyRole } from "../cam/viewer/machine-bodies.ts"
export type { AssumedPart } from "../cam/viewer/machine-setup.ts"
export type { Vec3 }
