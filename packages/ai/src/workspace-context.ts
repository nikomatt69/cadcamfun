/**
 * The workspace as the assistant reads it: the snapshot the desktop keeps in `ai.context.<projectId>` rendered as short,
 * sectioned text inside a character budget, instead of a JSON dump of everything on screen.
 *
 * Sections come in order of how much they matter (document and units, what is selected, the model, the machining, the
 * last verification, attached files, notes); when the budget runs out the long, low-value parts shrink first (the element
 * list, then the G-code preview) and the text says how much was left out, so the model knows to call
 * `cad_describe_drawing` rather than guess. Unknown or missing fields are skipped, never invented.
 */
import { attachmentNames } from "./attachments.ts"

export const DEFAULT_CONTEXT_BUDGET = 6_000

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {})
const arr = (v: unknown): ReadonlyArray<unknown> => (Array.isArray(v) ? v : [])
// Snapshot labels are data: keep them on one line so they cannot forge context sections.
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.replace(/[\r\n\t\u0000-\u001f]/g, " ").trim() : undefined)
const label = (v: unknown): string => str(v)?.slice(0, 160) ?? "?"
const count = (v: unknown): number | undefined => {
  const value = num(v)
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)

/** Keep the exact finite value: display rounding must not erase a modelling tolerance. */
const n = (v: unknown): string => {
  const x = num(v)
  return x === undefined ? "?" : String(x)
}

const SIZE_KEYS: ReadonlyArray<readonly [string, string]> = [["width", "w"], ["height", "h"], ["depth", "d"], ["radius", "r"]]

/** `id type "name" @x,y,z size` on one line. The id is whole: the tools need it as is. */
const elementLine = (element: Rec, selected: boolean): string => {
  const at = ["x", "y", "z"].every((k) => num(element[k]) !== undefined) ? ` @${n(element["x"])},${n(element["y"])},${n(element["z"])}` : ""
  const size = SIZE_KEYS.filter(([k]) => num(element[k]) !== undefined).map(([k, label]) => `${label}${n(element[k])}`).join(" ")
  const name = str(element["name"])
  return `${selected ? "*" : "-"} ${str(element["id"]) ?? "?"} ${label(element["type"])}${name !== undefined ? ` ${JSON.stringify(name.slice(0, 160))}` : ""}${at}${size !== "" ? ` ${size}` : ""}`
}

const unitLabel = (display: string | undefined): string => (display === undefined ? "unknown" : display === "mm" ? "mm" : `${display} on screen (tools still take mm)`)

export interface RenderOptions {
  readonly budget?: number
  /** Project id: attached files and nothing else are read from outside the snapshot. */
  readonly projectId?: string
}

/** Counts per element type, e.g. `3 cube, 2 cylinder`. */
const countsOf = (elements: ReadonlyArray<unknown>): string => {
  const counts = new Map<string, number>()
  for (const e of elements) counts.set(label(rec(e)["type"]), (counts.get(label(rec(e)["type"])) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([type, count]) => `${count} ${type}`).join(", ")
}

export const renderWorkspaceContext = (snapshot: unknown, options: RenderOptions = {}): string => {
  const budget = Math.max(0, Math.floor(num(options.budget) ?? DEFAULT_CONTEXT_BUDGET))
  const s = rec(snapshot)
  const cam = rec(s["cam"])
  const settings = rec(cam["settings"])
  const lines: string[] = []

  // 1. Document and units.
  const tolerance = num(s["tolerance"])
  lines.push(
    `Workspace: ${str(s["page"]) === "cam" ? "CAM page" : "CAD editor"}, drawing ${JSON.stringify(str(s["name"])?.slice(0, 160) ?? "name unknown")}${str(s["projectId"]) !== undefined ? ` (project ${str(s["projectId"])})` : ""}${str(s["drawingId"]) ? `; drawingId ${str(s["drawingId"])}` : ""}.`,
    `Units: tool calls in mm; the user reads ${unitLabel(str(s["displayUnits"]))}. Drawing tolerance ${tolerance === undefined ? "not set" : `${n(tolerance)} mm (${n(tolerance * 1000)} µm)`}, ${n(s["decimals"])} decimals shown. View: ${str(s["viewMode"]) ?? "?"}.`
  )
  if (str(s["capturedAt"])) lines.push(`Snapshot: ${str(s["capturedAt"])}. Tool results are newer evidence; inspect before an uncertain mutation.`)

  const coordinates = rec(s["coordinateSystem"])
  if (Object.keys(coordinates).length > 0) {
    const origin = rec(coordinates["originOffset"])
    lines.push(`Coordinates: ${str(coordinates["axes"]) ?? "right-handed XYZ; Z up"}; CAD origin offset (${n(origin["x"])}, ${n(origin["y"])}, ${n(origin["z"])}) mm. Element positions are drawing coordinates; inspect full transforms with cad_inspect. Rotation properties use ${str(coordinates["elementRotationUnit"]) ?? "degrees"}.`)
  }

  // 2. Selection.
  const selectedIds = [...new Set(arr(s["selectedIds"]).flatMap((id) => str(id) ? [str(id)!] : []))]
  const listedCount = arr(s["elements"]).length
  const total = count(s["totalElementCount"]) ?? (Array.isArray(s["elements"]) ? listedCount + (count(s["omittedElementCount"]) ?? 0) : undefined)
  lines.push(`Model: ${total ?? "unknown count of"} element${total === 1 ? "" : "s"}${total !== undefined && total > 0 ? ` (${countsOf(arr(s["elements"]))}${(total > listedCount) ? ", more not listed" : ""})` : ""}; ${Array.isArray(s["selectedIds"]) ? `${selectedIds.length} selected` : "selection unknown"}${selectedIds.length > 0 ? ` (${selectedIds.join(", ")})` : ""}.`)
  const layers = arr(s["layers"]).map(rec)
  if (layers.length > 0) lines.push(`Layers: ${layers.slice(0, 12).map((l) => `${label(l["name"])}${l["visible"] === false ? " (hidden)" : ""}${l["locked"] === true ? " (locked)" : ""}`).join(", ")}${layers.length > 12 ? `, +${layers.length - 12} more` : ""}; active ${str(s["activeLayer"]) ?? "?"}.`)
  const stock = rec(s["workpiece"])
  if (Object.keys(stock).length > 0 && num(stock["width"]) !== undefined) {
    lines.push(`Stock: ${n(stock["width"])}×${n(stock["height"])}×${n(stock["depth"] ?? stock["thickness"])} mm; XY centre (${n(stock["x"])}, ${n(stock["y"])}), top Z ${n(stock["topZ"])} mm${str(stock["material"]) ? `; material ${str(stock["material"])}` : ""}. Missing coordinates require cam_stock inspection.`)
  }

  // 3. Machining.
  const machineBits = [
    str(settings["machineType"] ?? cam["machineType"]) !== undefined ? `machine ${label(settings["machineType"] ?? cam["machineType"])}` : undefined,
    str(cam["controller"]) !== undefined ? `controller ${str(cam["controller"])}` : undefined,
    str(cam["postProcessor"]) !== undefined ? `post ${str(cam["postProcessor"])}` : undefined,
    str(cam["material"]) !== undefined ? `material ${str(cam["material"])}` : undefined,
    str(settings["operationType"]) !== undefined ? `operation ${str(settings["operationType"])}` : undefined,
    num(settings["toolDiameter"]) !== undefined ? `tool ${str(settings["toolType"]) ?? "type unknown"} Ø${n(settings["toolDiameter"])}` : undefined,
    str(cam["selectedOperationId"]) ? `operationId ${str(cam["selectedOperationId"])}` : undefined,
    str(settings["workOffset"]) !== undefined ? `offset ${str(settings["workOffset"])}` : undefined
  ].filter((x): x is string => x !== undefined)
  if (machineBits.length > 0) lines.push(`CAM: ${machineBits.join(", ")}.`)
  const cutting = [["depth", "depth mm"], ["stepdown", "stepdown mm"], ["stepover", "stepover %"], ["feedrate", "feed mm/min"], ["rpm", "spindle rpm"], ["plungerate", "plunge mm/min"], ["safeZ", "safe Z mm"]] as const
  const values = cutting.filter(([key]) => num(settings[key]) !== undefined).map(([key, label]) => `${label} ${n(settings[key])}`)
  if (num(settings["rpm"]) === undefined && num(settings["spindleSpeed"]) !== undefined) values.push(`spindle rpm ${n(settings["spindleSpeed"])}`)
  if (values.length) lines.push(`Cutting settings: ${values.join(", ")}.`)
  const toolpaths = arr(cam["toolpaths"]).map(rec)
  if (toolpaths.length > 0) lines.push(`Toolpaths: ${toolpaths.slice(0, 8).map((t) => `${label(t["name"])} [${str(t["id"]) ?? "id unknown"}] (${n(t["moveCount"])} moves)`).join(", ")}${toolpaths.length > 8 ? `, +${toolpaths.length - 8} more` : ""}.`)

  // 4. Verification.
  const verification = rec(cam["verification"])
  const state = str(verification["state"])
  if (state !== undefined) {
    const issues = arr(verification["issues"]).map(rec).slice(0, 4).map((i) => `${str(i["code"]) ?? "finding"}${num(i["line"]) !== undefined ? `@L${n(i["line"])}` : ""}${str(i["message"]) ? `: ${String(i["message"]).replace(/\s+/g, " ").slice(0, 240)}` : ""}`)
    lines.push(`Verification: ${state === "not-run" ? "not run yet" : state === "stale" ? "stale (G-code changed since)" : state === "ok" ? "passed" : state === "errors" ? `${n(verification["errors"])} error(s)` : `unknown state ${JSON.stringify(state)}`}${issues.length > 0 ? ` [${issues.join(", ")}]` : ""}.`)
    const warnings = count(verification["warnings"])
    if (warnings !== undefined) lines.push(`Verification warnings: ${warnings}.`)
    const hiddenIssues = arr(verification["issues"]).length - issues.length
    if (hiddenIssues > 0) lines.push(`Verification: ${hiddenIssues} more findings not shown; inspect the operation report before fixing.`)
    if (state === "ok") lines.push("Verification covers the configured simulation only; missing tool/holder/fixture data and machine behaviour remain unverified.")
  }

  // 5. Files and G-code size.
  const gcodeLines = num(cam["gcodeLines"]) ?? 0
  if (gcodeLines > 0) lines.push(`G-code: ${gcodeLines} lines.`)
  const files = options.projectId !== undefined ? attachmentNames(options.projectId) : []
  if (files.length > 0) lines.push(`Attached files: ${files.join(", ")}.`)

  // 6. Bulk, trimmed to what is left of the budget.
  const head = lines.join("\n")
  let left = budget - head.length
  const out = [head]
  const listed = arr(s["elements"]).map(rec)
  if (listed.length > 0 && left > 120) {
    const selected = new Set(selectedIds)
    const rows: string[] = []
    let used = 24
    const prioritized = [...listed.filter((element) => selected.has(str(element["id"]) ?? "?")), ...listed.filter((element) => !selected.has(str(element["id"]) ?? "?"))]
    for (const element of prioritized) {
      const line = elementLine(element, selected.has(str(element["id"]) ?? "?"))
      if (used + line.length + 1 > left * 0.7) break
      rows.push(line)
      used += line.length + 1
    }
    const hidden = Math.max(0, (total ?? listed.length) - rows.length)
    out.push(`Elements (* = selected${hidden > 0 ? `; ${hidden} not shown - call cad_describe_drawing` : ""}):\n${rows.join("\n")}`)
    left -= used
  }
  const preview = typeof cam["gcodePreview"] === "string" ? cam["gcodePreview"] : undefined
  if (preview !== undefined && left > 200) {
    const kept: string[] = []
    let used = 30
    for (const line of preview.split(/\r?\n/)) {
      if (used + line.length + 1 > left || kept.length >= 12) break
      kept.push(line)
      used += line.length + 1
    }
    out.push(`G-code start (${kept.length} of ${count(cam["gcodeLines"]) ?? "unknown total"} lines):\n${kept.join("\n")}`)
  }
  const text = out.join("\n")
  if (text.length <= budget) return text
  const marker = "\n[Context truncated; inspect the drawing and machine with tools.]"
  if (budget <= marker.length) return marker.trimStart().slice(0, budget)
  // Omit whole lines rather than publishing a cut entity/operation identifier.
  const available = budget - marker.length
  const complete: string[] = []
  let used = 0
  for (const line of text.split("\n")) {
    if (used + line.length + (complete.length ? 1 : 0) > available) break
    complete.push(line)
    used += line.length + (complete.length > 1 ? 1 : 0)
  }
  return complete.join("\n") + marker
}

/** Notes the assistant saved itself: newest first up to a count and a size, so they never crowd the workspace out. */
export const renderNotes = (notes: ReadonlyArray<{ readonly key: string; readonly value: unknown }>, maxChars = 1_500): string => {
  const budget = Math.max(0, Math.floor(num(maxChars) ?? 1_500))
  if (notes.length === 0 || budget === 0) return ""
  const rows: string[] = []
  const header = (omitted: number) => `Saved notes${omitted > 0 ? ` (${omitted} older not shown; memory_recall lists all)` : ""}:\n`
  for (const note of notes) {
    let value: string
    try { value = typeof note.value === "string" ? note.value : JSON.stringify(note.value) ?? "unknown" }
    catch { value = "unserializable value" }
    const line = `- ${label(note.key)}: ${str(value)?.slice(0, 300) ?? "unknown"}`
    const candidate = [...rows, line]
    if (header(notes.length - candidate.length).length + candidate.join("\n").length > budget) break
    rows.push(line)
  }
  return (header(notes.length - rows.length) + rows.join("\n")).slice(0, budget)
}
