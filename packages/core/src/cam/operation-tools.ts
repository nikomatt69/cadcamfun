/**
 * Which tool can do which operation (spec 32 §4.2): one table for the preview, the generator panel, the kernel and the
 * assistant. The preview draws the tool of the operation, not whatever the tool type field last held: a lathe parting
 * operation draws a parting blade, a mill drilling operation a drill. A tool that cannot do the operation is never swapped
 * silently; it is drawn as configured and reported by `toolOperationIssues`.
 *
 * A tool's kind is its mill shape, its lathe insert, `probe`, `setter` or `nozzle` (`toolKind`).
 */
import type { MachineKind } from "./machine.ts"
import type { ToolpathSettings } from "./generator/schema.ts"
import type { Strategy } from "./kernel/contracts.ts"
import type { Program } from "./ir.ts"
import type { MotionTrack } from "./viewer/motion-track.ts"
import { headerTools } from "./testing/header-tools.ts"
import { toolMachineOf, toolModelOf, toolTypeIn, toolModelFromSettings, type LatheInsert, type MillShape, type ToolModel, type ToolResource } from "./tool-model.ts"

export type OperationToolKind = MillShape | LatheInsert | "probe" | "setter" | "nozzle"

export interface OperationTools {
  /** Tool kinds that can do the operation. */
  readonly allowed: ReadonlyArray<OperationToolKind>
  /** The kind drawn and suggested when the operation has no tool of its own. */
  readonly preferred: OperationToolKind
  /** One line for the panel and the assistant: why these tools. */
  readonly why: string
}

const ROUGH: ReadonlyArray<OperationToolKind> = ["flat", "roughing", "bull"]
const FINISH_3D: ReadonlyArray<OperationToolKind> = ["ball", "bull", "barrel", "tapered", "lollipop", "flat"]

/** Operation key -> tools. Keys are `machine/operation`, with the variant that changes the tool (`/finish`, `/internal`). */
export const OPERATION_TOOLS: Readonly<Record<string, OperationTools>> = {
  "mill/contour": { allowed: ["flat", "roughing", "bull", "ball", "tapered", "chamfer", "cornerRounding"], preferred: "flat", why: "a side-cutting end mill follows the wall; chamfer and corner-rounding mills break the edge" },
  "mill/profile": { allowed: ["flat", "roughing", "bull", "ball", "tapered", "chamfer", "cornerRounding"], preferred: "flat", why: "a side-cutting end mill follows the wall; chamfer and corner-rounding mills break the edge" },
  "mill/pocket": { allowed: ROUGH, preferred: "flat", why: "a pocket floor needs a flat or bull bottom that plunges or ramps" },
  "mill/drill": { allowed: ["drill", "spot", "reamer", "tap", "boringBar", "counterbore"], preferred: "drill", why: "a hole is made along the tool axis: spot, drill, then ream, bore, counterbore or tap" },
  "mill/engrave": { allowed: ["engraver", "chamfer", "ball", "flat", "tapered"], preferred: "engraver", why: "engraving follows a line with a pointed or small tip" },
  "mill/threading": { allowed: ["threadmill", "tap"], preferred: "threadmill", why: "a thread is cut by a thread mill on a helix or by a tap at the pitch" },
  "mill/3d_surface": { allowed: ROUGH, preferred: "flat", why: "3D roughing clears levels with a flat, bull or roughing end mill" },
  "mill/3d_surface/finish": { allowed: FINISH_3D, preferred: "ball", why: "3D finishing follows the surface with a ball, bull, barrel, tapered or lollipop tip" },
  "mill/probing": { allowed: ["probe", "setter"], preferred: "probe", why: "probing touches the part with a probe; a tool setter measures the tool" },
  "mill/multiaxis": { allowed: FINISH_3D, preferred: "ball", why: "simultaneous 5-axis keeps a ball, bull, barrel, tapered or lollipop tip on the surface" },
  "mill/face": { allowed: ["facemill", "flat", "bull"], preferred: "facemill", why: "facing takes the top off with a face mill or a large end mill" },
  "mill/undercut": { allowed: ["disc", "dovetail"], preferred: "disc", why: "an undercut channel (T-slot, dovetail) is cut by a disc or dovetail cutter that enters through a narrower slot on its neck" },
  "mill/chamfer": { allowed: ["chamfer", "engraver", "spot", "cornerRounding", "backChamfer"], preferred: "chamfer", why: "an edge break needs a cone (or a corner-rounding form)" },
  "lathe/facing": { allowed: ["facing", "turning"], preferred: "facing", why: "facing feeds across the end with a facing or turning insert" },
  "lathe/turning": { allowed: ["turning", "facing"], preferred: "turning", why: "external turning needs a turning insert" },
  "lathe/turning/internal": { allowed: ["boring"], preferred: "boring", why: "internal turning reaches into the bore with a boring bar" },
  "lathe/boring": { allowed: ["boring"], preferred: "boring", why: "boring reaches into the bore with a boring bar" },
  "lathe/threading": { allowed: ["threading"], preferred: "threading", why: "a lathe thread needs a threading insert of the thread's profile" },
  "lathe/grooving": { allowed: ["grooving", "parting"], preferred: "grooving", why: "a groove is plunged by a blade of its width" },
  "lathe/parting": { allowed: ["parting", "grooving"], preferred: "parting", why: "parting off needs a narrow blade that reaches the axis" },
  "lathe/knurling": { allowed: ["knurling"], preferred: "knurling", why: "knurling presses a pattern with knurl wheels" },
  "3dprinter/print": { allowed: ["nozzle"], preferred: "nozzle", why: "a printer deposits through its nozzle" }
}

/** Kernel strategies by the generator operation that does the same cut. */
const STRATEGY_KEY: Readonly<Record<Strategy, string>> = {
  face: "mill/face", adaptive: "mill/pocket", pocket: "mill/pocket", profile: "mill/profile", bore: "mill/contour", drill: "mill/drill",
  thread: "mill/threading", engrave: "mill/engrave", chamfer: "mill/chamfer", surface: "mill/3d_surface", multiaxis: "mill/multiaxis"
}

/** The table key of the generator's operation (the variant included). */
export const operationKey = (s: Pick<ToolpathSettings, "machineType" | "operationType" | "surfaceStrategy" | "turningOperation">): string => {
  if (s.machineType === "3dprinter") return "3dprinter/print"
  if (s.machineType === "mill" && s.operationType === "3d_surface" && s.surfaceStrategy !== "roughing") return "mill/3d_surface/finish"
  if (s.machineType === "lathe" && s.operationType === "turning" && s.turningOperation === "internal") return "lathe/turning/internal"
  return `${s.machineType}/${s.operationType}`
}

/** The key of a kernel operation (`surface` finishing modes are finishing). */
export const strategyKey = (strategy: Strategy, mode?: string): string =>
  strategy === "surface" && mode !== undefined && mode !== "roughing" ? "mill/3d_surface/finish" : STRATEGY_KEY[strategy]

export const operationTools = (key: string): OperationTools | undefined => OPERATION_TOOLS[key]

/** A model's kind in the table's terms. */
export const toolKindOf = (model: ToolModel): OperationToolKind => {
  switch (model.family) {
    case "mill": return model.shape
    case "lathe": return model.insert
    case "probe": return "probe"
    case "setter": return "setter"
    case "nozzle": return "nozzle"
  }
}

/** The settings' own tool type for a lathe insert kind, or `undefined` when the settings cannot name it. */
const LATHE_SETTING: Partial<Record<OperationToolKind, ToolpathSettings["toolType"]>> = { turning: "turning", facing: "facing", threading: "threading", grooving: "grooving", boring: "boring", parting: "parting" }
const MILL_SETTING: Partial<Record<OperationToolKind, ToolpathSettings["toolType"]>> = { flat: "endmill", ball: "ballnose", drill: "drill", engraver: "vbit", chamfer: "chamfer", threadmill: "threadmill", reamer: "reamer", probe: "probe", setter: "toolsetter" }

/**
 * The tool type the generator panel should switch to when the operation changes and its current tool cannot do it; `undefined`
 * when the current tool can (it is kept) or the operation is not in the table.
 */
export const toolTypeForOperation = (s: ToolpathSettings): ToolpathSettings["toolType"] | undefined => {
  const tools = operationTools(operationKey(s))
  if (tools === undefined) return undefined
  if (tools.allowed.includes(toolKindOf(toolModelFromSettings(s)))) return undefined
  const names = s.machineType === "lathe" ? LATHE_SETTING : s.machineType === "mill" ? MILL_SETTING : {}
  for (const kind of [tools.preferred, ...tools.allowed]) {
    const type = names[kind]
    if (type !== undefined) return type
  }
  return undefined
}

/**
 * The tool the preview draws for the generator's operation: the settings' tool, except on a lathe whose tool type is not an
 * insert at all (a mill type left from the defaults), where the operation's preferred insert is drawn, flagged assumed. A tool
 * of this machine that cannot do the operation is kept as configured: `toolOperationIssues` reports it.
 */
export const toolForOperation = (s: ToolpathSettings, kind: MachineKind = s.machineType): ToolModel => {
  if (kind === "lathe" && s.operationType !== "knurling" && toolMachineOf(s.toolType) !== "lathe") {
    const preferred = operationTools(operationKey({ ...s, machineType: "lathe" }))?.preferred ?? "turning"
    const model = toolModelOf({ type: preferred, diameter: s.toolDiameter, cornerRadius: s.noseRadius }, "lathe")
    return { ...model, assumed: [...model.assumed, "type"] }
  }
  return toolModelFromSettings(s, kind)
}

/**
 * The model of the tool a preview draws: the user's tool resource when it belongs to this machine (and, on a mill, its
 * diameter is still the generator's), else the operation's tool (`toolForOperation`). The desktop preview and the sidecar
 * that serves the phone both ask here, so the two draw the same tool.
 */
export const previewToolModel = (kind: MachineKind, settings: ToolpathSettings, library?: ToolResource): ToolModel => {
  if (library !== undefined && toolMachineOf(library.type) === kind && (kind !== "mill" || Math.abs((library.diameter ?? 0) - settings.toolDiameter) < 1e-9)) {
    return toolModelOf(library, kind)
  }
  return toolForOperation(settings, kind)
}

export interface ToolOperationIssue {
  readonly code: "TOOL_CANNOT_DO_OPERATION" | "TOOL_REACH" | "TOOL_FLUTE_LENGTH" | "THREAD_PITCH_MISMATCH" | "TOOL_TOO_LARGE_FOR_FEATURE"
  readonly severity: "error" | "warning"
  readonly message: string
}

/**
 * What is wrong with doing operation `key` with `model`. `depth` is how deep the operation cuts below the stock top, `pitch`
 * the thread's pitch, `feature` the size of the hole or groove the tool works in (each optional: unknown is not checked).
 */
export const toolOperationIssues = (
  key: string,
  model: ToolModel,
  context: { readonly depth?: number; readonly pitch?: number; readonly feature?: { readonly diameter?: number; readonly width?: number; readonly internal?: boolean } } = {}
): ReadonlyArray<ToolOperationIssue> => {
  const issues: ToolOperationIssue[] = []
  const tools = operationTools(key)
  const kind = toolKindOf(model)
  const operation = key.split("/").slice(1).join(" ")
  if (tools !== undefined && !tools.allowed.includes(kind)) {
    issues.push({ code: "TOOL_CANNOT_DO_OPERATION", severity: "error", message: `A ${kind} tool cannot do ${operation}: use ${tools.allowed.join(", ")} (${tools.why}).` })
  }
  if (model.family === "mill" && context.depth !== undefined && context.depth > 0 && kind !== "engraver" && kind !== "chamfer" && kind !== "backChamfer" && kind !== "spot") {
    if (model.stickout < context.depth) {
      issues.push({ code: "TOOL_REACH", severity: "error", message: `The tool sticks out ${round(model.stickout)} mm but the cut is ${round(context.depth)} mm deep: the holder would hit the part${model.assumed.includes("stickout") ? " (stickout assumed)" : ""}.` })
    } else if (model.fluteLength < context.depth && kind !== "disc" && kind !== "lollipop" && kind !== "dovetail") {
      issues.push({ code: "TOOL_FLUTE_LENGTH", severity: "warning", message: `The cutting length is ${round(model.fluteLength)} mm, the cut ${round(context.depth)} mm deep: the shank rubs the wall${model.assumed.includes("cuttingLength") ? " (cutting length assumed)" : ""}.` })
    }
  }
  if (model.family === "mill" && (kind === "threadmill" || kind === "tap") && model.pitch !== undefined && context.pitch !== undefined && Math.abs(model.pitch - context.pitch) > 1e-6) {
    const severity = kind === "tap" || model.assumed.includes("threadPitch") ? "error" : "warning"
    issues.push({ code: "THREAD_PITCH_MISMATCH", severity, message: `The ${kind} has a pitch of ${model.pitch} mm, the thread ${context.pitch} mm.` })
  }
  const feature = context.feature
  if (feature !== undefined) {
    if (model.family === "mill" && feature.diameter !== undefined && feature.internal !== false && kind !== "tap" && kind !== "drill" && kind !== "reamer" && kind !== "spot" && kind !== "counterbore" && model.diameter >= feature.diameter) {
      issues.push({ code: "TOOL_TOO_LARGE_FOR_FEATURE", severity: "error", message: `A Ø${model.diameter} tool does not fit a Ø${feature.diameter} hole it has to move inside.` })
    }
    if (model.family === "lathe" && feature.width !== undefined && (model.insert === "grooving" || model.insert === "parting") && model.width > feature.width + 1e-9) {
      issues.push({ code: "TOOL_TOO_LARGE_FOR_FEATURE", severity: "error", message: `A ${model.width} mm blade is wider than the ${feature.width} mm groove.` })
    }
  }
  return issues
}

/** The issues of the generator's own operation and tool (depth and pitch from the settings). */
export const settingsToolIssues = (s: ToolpathSettings, model: ToolModel = toolForOperation(s)): ReadonlyArray<ToolOperationIssue> =>
  toolOperationIssues(operationKey(s), model, {
    ...(s.machineType === "mill" && s.operationType !== "probing" ? { depth: s.depth } : {}),
    ...(s.machineType === "mill" && s.operationType === "threading" ? { pitch: s.threadPitch } : {})
  })

const round = (n: number) => Math.round(n * 100) / 100

/**
 * The tool models of a program's tools by toolpath tool id (`T<n>`, as `analyseGcode` splits a program at its tool changes),
 * from the header comments the post wrote (`T1 D=6. CR=1. - … - bull nose end mill`): the preview then draws every tool of an
 * imported program. A description that names no known type is drawn as an end mill and said to be assumed.
 */
export const headerToolModels = (gcode: string, kind: MachineKind = "mill"): ReadonlyMap<string, ToolModel> => {
  const out = new Map<string, ToolModel>()
  for (const tool of headerTools(gcode).byTool.values()) {
    const type = tool.description !== undefined ? toolTypeIn(tool.description) : undefined
    const model = toolModelOf({ type: type ?? "endmill", diameter: tool.diameter, ...(tool.cornerRadius !== undefined ? { cornerRadius: tool.cornerRadius } : {}) }, kind)
    out.set(`T${tool.number}`, type === undefined ? { ...model, assumed: [...model.assumed, "type"] } : model)
  }
  return out
}


/**
 * The insert each tool of a lathe program needs, read from the words of its own blocks (an imported program has no
 * settings to say it): threading (G32 / G33 / G76), grooving (G74 / G75 pecks), parting (a feed down to the axis with no Z
 * travel), else turning.
 * Every model is flagged assumed: the type was read from the moves, not given.
 */
export const latheToolModels = (program: Program, track: MotionTrack | undefined, gcode: string): ReadonlyMap<string, ToolModel> => {
  const out = new Map<string, ToolModel>()
  const lines = gcode.split(/\r?\n/).map((l) => l.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "").toUpperCase())
  program.toolpaths.forEach((path, i) => {
    if (out.has(path.toolId)) return
    const own = new Set((track?.paths[i]?.lines ?? []).filter((n): n is number => n !== undefined))
    const words = [...own].map((n) => lines[n - 1] ?? "").join(" ")
    const g = (n: number) => new RegExp(`\\bG0*${n}(?![\\d.])`).test(words)
    let insert: LatheInsert = "turning"
    if (g(32) || g(33) || g(76)) insert = "threading"
    else if (g(74) || g(75)) insert = "grooving"
    else {
      const feeds = path.moves.filter((m): m is Extract<typeof m, { _tag: "Linear" }> => m._tag === "Linear")
      let at = { x: Infinity, z: 0 }
      let parts = false
      for (const m of path.moves) {
        if ((m._tag === "Linear") && Math.abs(m.to.x) < 1e-6 && Math.abs(m.to.z - at.z) < 1e-6 && at.x > 1e-6) parts = true
        if (m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Arc") at = { x: m.to.x, z: m.to.z }
      }
      if (parts && feeds.length > 0) insert = "parting"
    }
    const model = toolModelOf({ type: insert, diameter: insert === "parting" || insert === "grooving" ? 3 : 12 }, "lathe")
    out.set(path.toolId, { ...model, assumed: [...model.assumed, "type"] })
  })
  return out
}
