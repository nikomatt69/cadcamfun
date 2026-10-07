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
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)

/** Short number: up to 3 decimals, no trailing zeros. */
const n = (v: unknown): string => {
  const x = num(v)
  return x === undefined ? "?" : String(Math.round(x * 1000) / 1000)
}

const SIZE_KEYS: ReadonlyArray<readonly [string, string]> = [["width", "w"], ["height", "h"], ["depth", "d"], ["radius", "r"]]

/** `id type "name" @x,y,z size` on one line. The id is whole: the tools need it as is. */
const elementLine = (element: Rec, selected: boolean): string => {
  const at = ["x", "y", "z"].every((k) => num(element[k]) !== undefined) ? ` @${n(element["x"])},${n(element["y"])},${n(element["z"])}` : ""
  const size = SIZE_KEYS.filter(([k]) => num(element[k]) !== undefined).map(([k, label]) => `${label}${n(element[k])}`).join(" ")
  const name = str(element["name"])
  return `${selected ? "*" : "-"} ${String(element["id"])} ${String(element["type"])}${name !== undefined ? ` "${name}"` : ""}${at}${size !== "" ? ` ${size}` : ""}`
}

const unitLabel = (display: string | undefined): string => (display === undefined || display === "mm" ? "mm" : `${display} on screen (tools still take mm)`)

export interface RenderOptions {
  readonly budget?: number
  /** Project id: attached files and nothing else are read from outside the snapshot. */
  readonly projectId?: string
}

/** Counts per element type, e.g. `3 cube, 2 cylinder`. */
const countsOf = (elements: ReadonlyArray<unknown>): string => {
  const counts = new Map<string, number>()
  for (const e of elements) counts.set(String(rec(e)["type"]), (counts.get(String(rec(e)["type"])) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([type, count]) => `${count} ${type}`).join(", ")
}

export const renderWorkspaceContext = (snapshot: unknown, options: RenderOptions = {}): string => {
  const budget = options.budget ?? DEFAULT_CONTEXT_BUDGET
  const s = rec(snapshot)
  const cam = rec(s["cam"])
  const settings = rec(cam["settings"])
  const lines: string[] = []

  // 1. Document and units.
  const tolerance = num(s["tolerance"])
  lines.push(
    `Workspace: ${str(s["page"]) === "cam" ? "CAM page" : "CAD editor"}, drawing "${str(s["name"]) ?? "untitled"}"${str(s["projectId"]) !== undefined ? ` (project ${String(s["projectId"]).slice(0, 8)})` : ""}.`,
    `Units: tool calls in mm; the user reads ${unitLabel(str(s["displayUnits"]))}. Drawing tolerance ${tolerance === undefined ? "not set" : `${n(tolerance)} mm (${n(tolerance * 1000)} µm)`}, ${n(s["decimals"])} decimals shown. View: ${str(s["viewMode"]) ?? "?"}.`
  )

  // 2. Selection.
  const selectedIds = arr(s["selectedIds"]).map(String)
  const total = num(s["totalElementCount"]) ?? arr(s["elements"]).length
  lines.push(`Model: ${total} element${total === 1 ? "" : "s"}${total > 0 ? ` (${countsOf(arr(s["elements"]))}${num(s["omittedElementCount"]) ? ", more not listed" : ""})` : ""}; ${selectedIds.length} selected${selectedIds.length > 0 ? ` (${selectedIds.join(", ")})` : ""}.`)
  const layers = arr(s["layers"]).map(rec)
  if (layers.length > 0) lines.push(`Layers: ${layers.map((l) => `${String(l["name"])}${l["visible"] === false ? " (hidden)" : ""}${l["locked"] === true ? " (locked)" : ""}`).join(", ")}; active ${str(s["activeLayer"]) ?? "?"}.`)
  const stock = rec(s["workpiece"])
  if (Object.keys(stock).length > 0 && num(stock["width"]) !== undefined) {
    lines.push(`Stock: ${n(stock["width"])}×${n(stock["height"])}×${n(stock["depth"] ?? stock["thickness"])} mm.`)
  }

  // 3. Machining.
  const machineBits = [
    str(settings["machineType"]) !== undefined ? `machine ${String(settings["machineType"])}` : undefined,
    str(cam["controller"]) !== undefined ? `controller ${String(cam["controller"])}` : undefined,
    str(cam["postProcessor"]) !== undefined ? `post ${String(cam["postProcessor"])}` : undefined,
    str(cam["material"]) !== undefined ? `material ${String(cam["material"])}` : undefined,
    str(settings["operationType"]) !== undefined ? `operation ${String(settings["operationType"])}` : undefined,
    num(settings["toolDiameter"]) !== undefined ? `tool ${str(settings["toolType"]) ?? "endmill"} Ø${n(settings["toolDiameter"])}` : undefined,
    str(settings["workOffset"]) !== undefined ? `offset ${String(settings["workOffset"])}` : undefined
  ].filter((x): x is string => x !== undefined)
  if (machineBits.length > 0) lines.push(`CAM: ${machineBits.join(", ")}.`)
  const toolpaths = arr(cam["toolpaths"]).map(rec)
  if (toolpaths.length > 0) lines.push(`Toolpaths: ${toolpaths.slice(0, 8).map((t) => `${str(t["name"]) ?? String(t["id"])} (${n(t["moveCount"])} moves)`).join(", ")}${toolpaths.length > 8 ? `, +${toolpaths.length - 8} more` : ""}.`)

  // 4. Verification.
  const verification = rec(cam["verification"])
  const state = str(verification["state"])
  if (state !== undefined) {
    const issues = arr(verification["issues"]).map(rec).slice(0, 4).map((i) => `${String(i["code"])}${num(i["line"]) !== undefined ? `@L${n(i["line"])}` : ""}`)
    lines.push(`Verification: ${state === "not-run" ? "not run yet" : state === "stale" ? "stale (G-code changed since)" : state === "ok" ? "passed" : `${n(verification["errors"])} error(s)`}${issues.length > 0 ? ` [${issues.join(", ")}]` : ""}.`)
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
    for (const element of listed) {
      const line = elementLine(element, selected.has(String(element["id"])))
      if (used + line.length + 1 > left * 0.7) break
      rows.push(line)
      used += line.length + 1
    }
    const hidden = Math.max(0, total - rows.length)
    out.push(`Elements (* = selected${hidden > 0 ? `; ${hidden} not shown - call cad_describe_drawing` : ""}):\n${rows.join("\n")}`)
    left -= used
  }
  const preview = str(cam["gcodePreview"])
  if (preview !== undefined && left > 200) {
    const kept: string[] = []
    let used = 30
    for (const line of preview.split(/\r?\n/)) {
      if (used + line.length + 1 > left || kept.length >= 12) break
      kept.push(line)
      used += line.length + 1
    }
    out.push(`G-code start (${kept.length} of ${gcodeLines} lines):\n${kept.join("\n")}`)
  }
  return out.join("\n")
}

/** Notes the assistant saved itself: newest first up to a count and a size, so they never crowd the workspace out. */
export const renderNotes = (notes: ReadonlyArray<{ readonly key: string; readonly value: unknown }>, maxChars = 1_500): string => {
  const lines: string[] = []
  let used = 0
  for (const note of notes) {
    const line = `- ${note.key}: ${String(note.value).replace(/\s+/g, " ").slice(0, 300)}`
    if (used + line.length > maxChars) break
    lines.push(line)
    used += line.length + 1
  }
  const omitted = notes.length - lines.length
  return lines.length === 0 ? "" : `Saved notes${omitted > 0 ? ` (${omitted} older not shown; memory_recall lists all)` : ""}:\n${lines.join("\n")}`
}
