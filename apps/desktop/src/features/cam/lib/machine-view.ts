/**
 * Which machine the CAM preview shows, and its set-up (spec 31 §4.5, §5.6).
 *
 * Order: the user's pick in the preview; else what produced the text (the generator's machine for its own output, a mill for
 * the kernel's program); else what the program's words say when they are clear; else the generator's machine. A program whose
 * words clearly belong to another machine than its source is flagged, never switched silently.
 */
import { cam } from "@cadcamfun/core"

export type MachineSource = "override" | "generator" | "kernel" | "inferred" | "settings"

export interface MachineChoice {
  readonly kind: cam.MachineKind
  readonly source: MachineSource
  /** The program's words point at another machine than the one shown. */
  readonly mismatch?: { readonly inferred: cam.MachineKind; readonly reasons: ReadonlyArray<string> }
}

export interface MachineInputs {
  readonly override?: cam.MachineKind | undefined
  /** The machine of the program's producer, when it is known. */
  readonly produced?: { readonly kind: cam.MachineKind; readonly source: "generator" | "kernel" } | undefined
  readonly inferred?: cam.MachineInference | undefined
  /** The generator's machine setting. */
  readonly setting: cam.MachineKind
}

export const resolveMachineKind = (input: MachineInputs): MachineChoice => {
  const pick = (): Omit<MachineChoice, "mismatch"> => {
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

/** The preview's set-up for the chosen machine: the kernel's stock and table for its program, the generator's settings otherwise. */
export const previewSetup = (
  kind: cam.MachineKind,
  settings: cam.generator.ToolpathSettings,
  stock: cam.generator.Stock,
  options: { readonly artifact?: cam.kernel.CamArtifact | undefined; readonly machineId?: string | undefined; readonly program?: cam.Program; readonly gcode?: string; readonly tool?: cam.ToolModel } = {}
): cam.viewer.MachineSetup => {
  const table = options.machineId !== undefined ? cam.kernel.findMachine(options.machineId)?.table : undefined
  const tableSize = table !== undefined ? { length: table.length, width: table.width } : undefined
  const base = kind === "mill" && options.artifact !== undefined ? cam.viewer.millSetupFromArtifact(options.artifact, settings, tableSize)
    : kind === "lathe" ? cam.viewer.latheSetupOf(settings, options.tool?.family === "lathe" ? options.tool : undefined)
    : kind === "3dprinter" ? { ...cam.viewer.printerSetupOf(settings), ...(options.tool?.family === "nozzle" ? { tool: options.tool, nozzle: options.tool.diameter } : {}) }
    : cam.viewer.setupOf(kind, settings, stock, tableSize)
  // A rotary program (A/B/C words, indexed Orient moves) gets its trunnion table; a lathe program that mills gets its B head and C spindle.
  const setup = options.program !== undefined ? cam.viewer.withRotary(base, options.program, options.gcode ?? "") : base
  const fiveAxis = options.machineId !== undefined ? cam.kernel.findMachine(options.machineId)?.fiveAxis : undefined
  return setup.kind === "mill" && setup.rotary !== undefined && fiveAxis !== undefined
    ? { ...setup, rotary: { ...setup.rotary, layout: fiveAxis.layout, pivot: fiveAxis.pivot, reasons: [...setup.rotary.reasons, "layout and pivot from the selected machine"] } }
    : setup
}

/**
 * The model of the tool the preview draws for the generator's program: the user's tool resource when one is chosen for this
 * machine (and its diameter is still the generator's), else the generator's tool settings (spec 31: the same model the
 * resource's page shows).
 */
export const previewToolModel = (kind: cam.MachineKind, settings: cam.generator.ToolpathSettings, library: Partial<cam.ToolResource> | null | undefined): cam.ToolModel =>
  cam.previewToolModel(kind, settings, library?.type !== undefined && library.diameter !== undefined ? { ...library, type: library.type, diameter: library.diameter } : undefined)

/** The tool an operation of a multi-operation program uses, as the preview draws it, and what is wrong with it. */
export interface OperationTool {
  readonly toolId: string
  readonly name: string
  readonly model: cam.ToolModel
  readonly issues: ReadonlyArray<cam.ToolOperationIssue>
  readonly source?: cam.ProgramTool["source"]
  readonly operations?: ReadonlyArray<string>
}

/**
 * The tools of the operations of a combined program (spec 32 §4.2), keyed like `combineCamOperations` keys its toolpaths: every
 * operation that carries its settings draws its own operation's tool, so drill → tap → chamfer shows three tools. Operations
 * without settings resolve their own NC evidence. The first operation to use a tool id names it.
 */
export const operationToolsOf = (results: ReadonlyArray<{ readonly id: string; readonly name: string; readonly tool?: string; readonly settings?: cam.generator.ToolpathSettings; readonly program: cam.Program; readonly gcode?: string }>): ReadonlyArray<OperationTool> => {
  const out = new Map<string, OperationTool>()
  for (const r of results) {
    const parsed = r.gcode !== undefined && (r.settings === undefined || r.program.toolpaths.length > 1) ? cam.generator.analyseGcode(r.gcode) : undefined
    const inferred = parsed !== undefined ? cam.programTools(r.program, parsed.motion, r.gcode ?? "", r.settings?.machineType ?? cam.inferMachineKind(r.gcode ?? "")?.kind ?? "mill") : undefined
    for (const tp of r.program.toolpaths) {
      const own = inferred?.get(tp.toolId)
      const model = r.settings !== undefined && (r.program.toolpaths.length === 1 || own?.source !== "header") ? cam.toolForOperation(r.settings) : own?.model
      if (model === undefined) continue
      const issues = r.settings !== undefined ? cam.settingsToolIssues(r.settings, model) : own?.issues ?? []
      const toolId = r.tool ?? `${r.id}:${tp.toolId}`
      const previous = out.get(toolId)
      if (previous === undefined) out.set(toolId, { toolId, name: r.name, model, issues, ...(r.settings === undefined && own !== undefined ? { source: own.source, operations: own.operations } : {}) })
      else if (JSON.stringify(previous.model) !== JSON.stringify(model)) out.set(toolId, { ...previous, issues: [...previous.issues, { code: "TOOL_CANNOT_DO_OPERATION", severity: "error", message: `Operation ${r.name} assigns a different model to shared tool ${toolId}. Give distinct physical tools distinct tool ids.` }] })
    }
  }
  return [...out.values()]
}

export const MACHINE_LABELS: Readonly<Record<cam.MachineKind, string>> = { mill: "Mill", lathe: "Lathe", "3dprinter": "3D printer" }
export const SOURCE_LABELS: Readonly<Record<MachineSource, string>> = { override: "chosen", generator: "generator", kernel: "kernel", inferred: "from the G-code", settings: "generator setting" }

/** What the assistant is told about the preview (spec 31 §7): the machine shown and why, how the part is held, what turns. */
export const previewSummary = (input: {
  readonly gcode: string
  readonly kernelNc?: string | undefined
  readonly generatorGcode: string
  readonly settings: cam.generator.ToolpathSettings
  readonly override?: cam.MachineKind | undefined
  readonly motion?: cam.viewer.MotionTrack | undefined
}): Record<string, unknown> | undefined => {
  if (input.gcode.trim() === "") return undefined
  const produced = input.kernelNc !== undefined && input.kernelNc === input.gcode ? { kind: "mill" as const, source: "kernel" as const }
    : input.generatorGcode !== "" && input.generatorGcode === input.gcode ? { kind: input.settings.machineType, source: "generator" as const } : undefined
  const choice = resolveMachineKind({ override: input.override, produced, inferred: cam.inferMachineKind(input.gcode), setting: input.settings.machineType })
  const s = input.settings
  const workholding = choice.kind === "mill"
    ? s.workholding === "vise" ? `vise, jaws along ${s.viseJawAxis.toUpperCase()}, clamp ${s.clampDepth > 0 ? `${s.clampDepth} mm` : "auto"}, parallels ${s.parallelsHeight} mm` : s.workholding
    : choice.kind === "lathe"
      ? `${s.chuckType} ${s.chuckType === "collet" ? "" : "chuck "}grip ${s.gripLength} mm (stickout ${s.stockLength - s.gripLength} mm) on Ø${s.stockDiameter}×${s.stockLength}, ${s.latheTurret} turret, Z0 ${s.latheZero === "face" ? "finished face" : "chuck end"}${s.tailstock ? ", tailstock" : ""}`
      : `bed ${s.bedWidth}×${s.bedDepth} (${s.bedOrigin} origin), ${s.printerKinematics}, build height ${s.buildHeight}`
  return {
    machine: choice.kind, source: choice.source,
    ...(choice.mismatch !== undefined ? { mismatch: choice.mismatch.inferred } : {}),
    turns: choice.kind === "mill" ? "the tool turns, the part is clamped" : choice.kind === "lathe" ? "the part turns in the chuck, the tool travels in X (diameter) and Z" : "nothing turns, the nozzle deposits",
    workholding, assumed: choice.kind !== "3dprinter" && !s.workholdingConfigured,
    unsupportedLines: input.motion?.unsupported.length ?? 0
  }
}
