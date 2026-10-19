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
  // A rotary program (A/B/C words, indexed Orient moves) gets its trunnion table.
  return options.program !== undefined ? cam.viewer.withRotary(base, options.program, options.gcode ?? "") : base
}

/**
 * The model of the tool the preview draws for the generator's program: the user's tool resource when one is chosen for this
 * machine (and its diameter is still the generator's), else the generator's tool settings (spec 31: the same model the
 * resource's page shows).
 */
export const previewToolModel = (kind: cam.MachineKind, settings: cam.generator.ToolpathSettings, library: (cam.ToolResource & { readonly type?: string }) | null | undefined): cam.ToolModel =>
  cam.previewToolModel(kind, settings, library?.type !== undefined ? library as cam.ToolResource : undefined)

/** The tool an operation of a multi-operation program uses, as the preview draws it, and what is wrong with it. */
export interface OperationTool {
  readonly toolId: string
  readonly name: string
  readonly model: cam.ToolModel
  readonly issues: ReadonlyArray<cam.ToolOperationIssue>
}

/**
 * The tools of the operations of a combined program (spec 32 §4.2), keyed like `combineCamOperations` keys its toolpaths: every
 * operation that carries its settings draws its own operation's tool, so drill → tap → chamfer shows three tools. Operations
 * without settings are left to the preview's default tool. The first operation to use a tool id names it.
 */
export const operationToolsOf = (results: ReadonlyArray<{ readonly id: string; readonly name: string; readonly tool?: string; readonly settings?: cam.generator.ToolpathSettings; readonly program: cam.Program }>): ReadonlyArray<OperationTool> => {
  const out = new Map<string, OperationTool>()
  for (const r of results) {
    if (r.settings === undefined) continue
    const model = cam.toolForOperation(r.settings)
    const issues = cam.settingsToolIssues(r.settings, model)
    for (const tp of r.program.toolpaths) {
      const toolId = r.tool ?? `${r.id}:${tp.toolId}`
      if (!out.has(toolId)) out.set(toolId, { toolId, name: r.name, model, issues })
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
