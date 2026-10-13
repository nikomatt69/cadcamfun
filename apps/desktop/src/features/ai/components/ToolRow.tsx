/**
 * One tool call in the transcript, drawn the way nikcli's session view draws it (`routes/session/tool-view.tsx`): every tool has
 * its own view, in one of two shapes. An inline row is one line (a glyph and what it did, or `~ Writing ...` while the call is
 * still being written or running); a block has a title and a body (the elements that were built, the findings of a check, the
 * G-code with line numbers, the report of a specialist). The exact input and output stay one click away under every view.
 *
 * Who ran it (a specialist's name), how it ended (finished, failed, refused) and the facts of version control and workflows are
 * part of the row. Version-control tools link to the project's version-control screen.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import { t } from "../../../i18n/index.ts"
import type { AiToolCall } from "../lib/types.ts"
import { isVcsTool, toolFacts } from "../lib/tool-facts.ts"
import { actionOf } from "../lib/tool-schemas.ts"
import { toolTitle } from "../lib/tools.ts"

const SPECIALISTS = ["researcher", "editor", "modeler", "machinist", "reviewer", "planner", "diagnostician", "verifier", "optimizer"] as const
/** The specialist's name in the user's language (an agent this version does not know keeps its own name). */
export const agentLabel = (name: string): string => ((SPECIALISTS as ReadonlyArray<string>).includes(name) ? t(`ai.agent.name.${name}` as never) : name)

/** The router is absent in isolated renders; the link then stays a plain label. */
const useMaybeNavigate = (): ((to: string) => void) | undefined => {
  try { return useNavigate() } catch { return undefined }
}

type Rec = Record<string, unknown>
const rec = (value: unknown): Rec | undefined => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : undefined)
const arr = (value: unknown): ReadonlyArray<unknown> => (Array.isArray(value) ? value : [])
const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)
const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined)
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
const mm = (value: unknown): string => (num(value) === undefined ? "?" : `${Math.round(num(value)! * 100) / 100}`)
const kb = (chars: number): string => (chars < 1000 ? `${chars} B` : `${(chars / 1000).toFixed(1)} KB`)

const parse = (output: string | undefined): unknown => {
  if (output === undefined || output === "") return undefined
  try { return JSON.parse(output) } catch { return undefined }
}

const pretty = (value: unknown): string => {
  if (typeof value === "string") {
    try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value }
  }
  try { return JSON.stringify(value, null, 2) ?? "" } catch { return String(value) }
}
const MAX_SHOWN = 6_000
const clip = (text: string): string => (text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}\n…` : text)

/** Why a finished call counts as failed: the host marked it an error, or the tool answered `{ok:false, error}`. */
const failureOf = (call: AiToolCall | undefined, data: unknown): string | undefined => {
  if (call?.status === "error") return call.output ?? "The tool call failed."
  const value = rec(data)
  if (value?.["ok"] !== false) return undefined
  // `ok:false` with findings (a design check, a simulation) is a result about the model, not a call that was refused.
  if (str(value["error"]) !== undefined) return str(value["error"])
  return arr(value["problems"]).length > 0 ? arr(value["problems"]).map(String).join("; ") : undefined
}

// ------------------------------------------------------------------------------------------------ view model

interface Args {
  readonly input: Rec
  readonly data: unknown
  readonly output: string | undefined
}
type Tone = "ok" | "warn" | "error"
interface View {
  /** One plain glyph, as nikcli draws (no emoji). */
  readonly icon: string
  /** What the call did, once it ended. */
  readonly title: string
  /** What it is doing while it is written or runs. */
  readonly pending: string
  readonly tone?: Tone
  /** A body makes the row a block. */
  readonly detail?: () => JSX.Element
}
type ViewFn = (args: Args) => View

const Chips = (props: { readonly items: ReadonlyArray<string> }): JSX.Element => (
  <p class="flex flex-wrap gap-1">
    <For each={props.items}>{(item) => <span class="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] dark:bg-gray-700">{item}</span>}</For>
  </p>
)
const Lines = (props: { readonly lines: ReadonlyArray<string>; readonly max?: number }): JSX.Element => {
  const max = props.max ?? 12
  return (
    <ul class="space-y-0.5">
      <For each={props.lines.slice(0, max)}>{(line) => <li class="break-words">{line}</li>}</For>
      <Show when={props.lines.length > max}><li class="text-gray-500">… {props.lines.length - max} more</li></Show>
    </ul>
  )
}
const Issues = (props: { readonly issues: ReadonlyArray<Rec> }): JSX.Element => (
  <ul class="space-y-0.5" data-testid="tool-issues">
    <For each={props.issues.slice(0, 20)}>{(issue) => {
      const severity = str(issue["severity"]) ?? "info"
      return (
        <li class="flex gap-1.5">
          <span class="shrink-0 rounded px-1 text-[10px] font-semibold uppercase" classList={{
            "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200": severity === "error",
            "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200": severity === "warning",
            "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200": severity !== "error" && severity !== "warning"
          }}>{severity}</span>
          <span class="break-words"><Show when={str(issue["code"])}>{(code) => <code class="mr-1 text-[10px]">{code()}</code>}</Show>{str(issue["message"])}<Show when={num(issue["line"])}>{(line) => <span class="text-gray-500"> · line {line()}</span>}</Show></span>
        </li>
      )
    }}</For>
    <Show when={props.issues.length > 20}><li class="text-gray-500">… {props.issues.length - 20} more</li></Show>
  </ul>
)
const Pair = (props: { readonly rows: ReadonlyArray<readonly [string, string | undefined]> }): JSX.Element => (
  <dl class="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5">
    <For each={props.rows.filter((row) => row[1] !== undefined && row[1] !== "")}>{(row) => <><dt class="text-gray-500">{row[0]}</dt><dd class="break-words">{row[1]}</dd></>}</For>
  </dl>
)
const Code = (props: { readonly text: string; readonly lines?: number; readonly numbered?: boolean }): JSX.Element => {
  const [all, setAll] = createSignal(false)
  const lines = createMemo(() => props.text.split("\n"))
  const limit = props.lines ?? 12
  const shown = createMemo(() => (all() ? lines() : lines().slice(0, limit)))
  return (
    <div>
      <pre class="max-h-72 overflow-auto rounded bg-gray-100 p-1.5 text-[10px] dark:bg-gray-800" data-testid="tool-code">
        <For each={shown()}>{(line, index) => <div>{props.numbered ? <span class="mr-2 select-none text-gray-400">{String(index() + 1).padStart(3, " ")}</span> : null}{line}</div>}</For>
      </pre>
      <Show when={lines().length > limit}>
        <button type="button" class="mt-0.5 text-[10px] text-blue-700 underline dark:text-blue-300" onClick={() => setAll(!all())}>{all() ? "Show less" : `Show ${lines().length - limit} more lines`}</button>
      </Show>
    </div>
  )
}

const countBy = (items: ReadonlyArray<unknown>, key: string): ReadonlyArray<string> => {
  const counts = new Map<string, number>()
  for (const item of items) {
    const type = str(rec(item)?.[key]) ?? "?"
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  return [...counts].map(([type, n]) => (n > 1 ? `${type} ×${n}` : type))
}

const changedKeys = (changes: unknown): ReadonlyArray<string> => arr(changes).flatMap((entry) => {
  const e = rec(entry)
  const keys = Object.keys(rec(e?.["changes"]) ?? {})
  return e === undefined ? [] : [`${str(e["id"]) ?? "?"}: ${keys.join(", ") || "no change"}`]
})

const issueCounts = (issues: ReadonlyArray<Rec>): string => {
  const e = issues.filter((i) => i["severity"] === "error").length
  const w = issues.filter((i) => i["severity"] === "warning").length
  return [e > 0 ? plural(e, "error") : "", w > 0 ? plural(w, "warning") : ""].filter(Boolean).join(", ")
}

const VIEWS: Readonly<Record<string, ViewFn>> = {
  "cad_edit.add": ({ input, data }) => {
    const d = rec(data)
    const made = arr(d?.["elements"]).length > 0 ? arr(d?.["elements"]) : arr(d?.["ids"])
    const asked = arr(input["elements"])
    const skipped = arr(d?.["skipped"])
    return {
      icon: "◆", pending: `Writing ${plural(asked.length || 1, "element")}...`,
      title: d?.["ok"] === false ? "No element was added" : `Built ${plural(made.length || asked.length, "element")}${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}`,
      tone: d?.["ok"] === false ? "error" : skipped.length > 0 ? "warn" : "ok",
      detail: () => (
        <div class="space-y-1">
          <Chips items={countBy(made.length > 0 && rec(made[0]) ? made : asked, "type")} />
          <Lines lines={(made.length > 0 && rec(made[0]) ? made : asked).flatMap((e) => (str(rec(e)?.["name"]) ? [str(rec(e)?.["name"])!] : []))} max={10} />
          <Show when={skipped.length > 0}><Lines lines={skipped.map((s) => `#${num(rec(s)?.["index"]) ?? "?"}: ${str(rec(s)?.["error"]) ?? ""}`)} /></Show>
          <Show when={arr(d?.["warnings"]).length > 0}><Lines lines={arr(d?.["warnings"]).map(String)} /></Show>
        </div>
      )
    }
  },
  "cad_edit.add_entities": ({ input, data }) => {
    const d = rec(data)
    const made = arr(d?.["elements"])
    return { icon: "◇", pending: "Drawing...", title: `Sketched ${plural(made.length || arr(input["entities"]).length, "entity", "entities")}`, tone: d?.["ok"] === false ? "error" : "ok",
      detail: () => <Chips items={countBy(made, "type")} /> }
  },
  "cad_edit.import": ({ input, data }) => {
    const d = rec(data)
    const made = arr(d?.["elements"])
    return { icon: "⇩", pending: "Importing drawing...", title: `Imported ${str(input["attachment"]) ?? "drawing"}: ${plural(made.length, "solid")}`, tone: d?.["ok"] === false ? "error" : arr(d?.["warnings"]).length > 0 ? "warn" : "ok",
      detail: () => <div class="space-y-1"><Chips items={countBy(made, "type")} /><Lines lines={arr(d?.["warnings"]).map(String)} /></div> }
  },
  "cad_edit.modify": ({ input, data }) => {
    const d = rec(data)
    return { icon: "✎", pending: "Modifying...", title: `Modified ${plural(num(d?.["modified"]) ?? arr(input["changes"]).length, "entity", "entities")}`,
      detail: () => <Lines lines={changedKeys(input["changes"])} /> }
  },
  "cad_edit.transform": ({ input, data }) => {
    const d = rec(data)
    const ids = arr(d?.["ids"]).length
    const how = Object.keys(input).filter((k) => k !== "ids" && k !== "id" && input[k] !== undefined && input[k] !== null).join(", ")
    return { icon: "↔", pending: "Transforming...", title: `${d?.["mode"] === "copied" ? "Copied" : "Transformed"} ${plural(ids || arr(input["ids"]).length, "entity", "entities")}${how ? ` (${how})` : ""}` }
  },
  "cad_edit.group": ({ data }) => {
    const d = rec(data)
    return { icon: "▣", pending: "Grouping...", title: arr(d?.["removed"]).length > 0 ? `Grouped ${plural(arr(d?.["removed"]).length, "part")}` : `Opened ${plural(arr(d?.["ids"]).length, "component")}` }
  },
  "cad_edit.editor": ({ input, data }) => {
    const actions = arr(rec(data)?.["actions"]).length > 0 ? arr(rec(data)?.["actions"]) : arr(input["actions"])
    const cut = actions.map(rec).find((a) => str(a?.["action"]) === "section_on")
    const section = cut ? ` (section ${str(cut["axis"]) ?? "z"} = ${mm(cut["position"])} mm)` : ""
    return { icon: "⚙", pending: "Editor...", title: `Editor: ${actions.map((a) => str(rec(a)?.["action"]) ?? "?").join(", ") || "actions"}${section}` }
  },
  "cad_edit.delete": ({ data, input }) => {
    const d = rec(data)
    return { icon: "✕", pending: "Deleting...", title: `Deleted ${plural(num(d?.["deleted"]) ?? arr(input["ids"]).length, "entity", "entities")}` }
  },
  "cad.describe": ({ data }) => {
    const d = rec(data)
    const counts = rec(d?.["counts"]) ?? {}
    const bounds = rec(d?.["bounds"])
    const lo = rec(bounds?.["min"]), hi = rec(bounds?.["max"])
    return { icon: "▤", pending: "Reading the drawing...", title: `Drawing: ${plural(num(d?.["total"]) ?? 0, "element")}`,
      detail: () => (
        <div class="space-y-1">
          <Chips items={Object.entries(counts).map(([k, v]) => `${k} ×${String(v)}`)} />
          <Show when={lo && hi}><p class="text-gray-500">x {mm(lo?.["x"])} … {mm(hi?.["x"])} · y {mm(lo?.["y"])} … {mm(hi?.["y"])} · z {mm(lo?.["z"])} … {mm(hi?.["z"])} mm</p></Show>
        </div>
      ) }
  },
  "cad.parametric_validate": ({ input, data }) => {
    const d = rec(data)
    const action = str(input["action"]) ?? "inspect"
    const listed = (value: unknown): Rec[] => arr(value).flatMap((i) => (rec(i) ? [rec(i)!] : []))
    if (action === "dfm") {
      const issues = listed(d?.["issues"])
      const metrics = rec(d?.["metrics"])
      return { icon: "✓", pending: "Checking the design rules...", title: `Design rules (${str(d?.["process"]) ?? str(input["process"]) ?? "mill"}, cutter Ø${mm(d?.["toolDiameter"] ?? input["toolDiameter"] ?? 6)} mm): ${issues.length === 0 ? "no findings" : issueCounts(issues) || plural(issues.length, "finding")}`,
        tone: d?.["ok"] === false ? "error" : issues.some((i) => i["severity"] === "warning") ? "warn" : "ok",
        detail: () => <><Pair rows={[["Solids", num(metrics?.["bodies"]) === undefined ? undefined : String(metrics?.["bodies"])], ["Volume", num(metrics?.["volumeMm3"]) === undefined ? undefined : `${mm(num(metrics?.["volumeMm3"])! / 1000)} cm³`], ["Thinnest wall", num(metrics?.["minWallMm"]) === undefined ? undefined : `${mm(metrics?.["minWallMm"])} mm`]]} />{issues.length > 0 ? <Issues issues={issues} /> : <p class="text-gray-500">The part meets the rules for this process.</p>}</> }
    }
    if (action === "recipe") {
      const report = rec(d?.["report"])
      const issues = listed(report?.["issues"])
      const derived = Object.entries(rec(d?.["derived"]) ?? {}).map(([k, v]) => [k, String(v)] as const)
      return { icon: "◆", pending: "Generating the part...", title: `${str(input["create"] === true ? "Recipe created" : "Recipe") ?? "Recipe"} ${str(d?.["recipe"]) ?? str(input["recipe"]) ?? ""}: ${str(d?.["summary"]) ?? ""}`, tone: issues.some((i) => i["severity"] === "error") ? "error" : "ok",
        detail: () => <><Pair rows={derived} /><Lines lines={arr(d?.["rules"]).map(String)} />{issues.length > 0 ? <Issues issues={issues} /> : null}</> }
    }
    if (action === "fastener") {
      const thread = rec(d?.["thread"])
      return { icon: "⌗", pending: "Looking up the fastener...", title: thread !== undefined ? `Fastener ${str(thread["name"]) ?? ""}: tap drill ${mm(thread["tapDrill"])} mm` : str(input["shaftDiameter"]) !== undefined || num(input["shaftDiameter"]) !== undefined ? `Keyway for Ø${mm(input["shaftDiameter"])} mm` : "Fastener table",
        detail: thread !== undefined ? () => <Pair rows={[["Pitch", `${mm(thread["pitch"])} mm`], ["Clearance fine / medium / coarse", ["fine", "medium", "coarse"].map((k) => mm(rec(thread["clearance"])?.[k])).join(" / ")], ["Counterbore", `Ø${mm(thread["counterboreDiameter"])} x ${mm(thread["counterboreDepth"])} mm`], ["Countersink", `Ø${mm(thread["countersinkDiameter"])} mm`]]} /> : undefined }
    }
    const issues = listed(d?.["issues"])
    const titles: Readonly<Record<string, string>> = { inspect: "Parametric part read", validate: "Parametric history validated", create: "Parametric part created", update: "Parametric part updated", test: "Parametric variants tested" }
    return { icon: "◇", pending: "Working on the parametric part...", title: `${titles[action] ?? "Parametric"}${num(d?.["bodyCount"]) !== undefined ? ` · ${plural(num(d?.["bodyCount"])!, "solid")}` : ""}${num(d?.["volumeMm3"]) !== undefined ? ` · ${mm(num(d?.["volumeMm3"])! / 1000)} cm³` : ""}`,
      tone: issues.some((i) => i["severity"] === "error") ? "error" : issues.length > 0 ? "warn" : "ok",
      detail: issues.length > 0 ? () => <Issues issues={issues.map((i) => ({ ...i, code: str(i["feature"]) }))} /> : undefined }
  },
  "cad.check": ({ data }) => {
    const d = rec(data)
    const issues = arr(d?.["issues"]).flatMap((i) => (rec(i) ? [rec(i)!] : []))
    return { icon: "✓", pending: "Checking the design...", title: issues.length === 0 ? "Design check: nothing to report" : `Design check: ${issueCounts(issues) || plural(issues.length, "note")}`, tone: d?.["ok"] === false ? "error" : issues.some((i) => i["severity"] === "warning") ? "warn" : "ok",
      detail: issues.length > 0 ? () => <Issues issues={issues} /> : undefined }
  },
  "cam.machine": ({ data }) => {
    const d = rec(data)
    return { icon: "⚒", pending: "Reading the machine...", title: `Machine: ${str(d?.["title"]) ?? "?"}`,
      detail: () => <Pair rows={[["Process", str(d?.["process"])], ["Rotates", str(d?.["rotates"])], ["Plane", str(d?.["plane"])], ["Zero", str(d?.["zero"])], ["Axes", arr(d?.["axes"]).map((a) => str(rec(a)?.["name"]) ?? "").join(" ")], ["Operations", arr(d?.["operations"]).map(String).join(", ")]]} /> }
  },
  "cam_edit.create": ({ input, data }) => {
    const p = rec(input["params"]) ?? {}
    const d = rec(data)
    return { icon: "⌖", pending: "Creating the operation...", title: `Operation created: ${str(input["type"]) ?? "?"}`,
      detail: () => <Pair rows={[["Id", str(d?.["operationId"])], ["Tool", p["toolDiameter"] !== undefined ? `${str(p["toolType"]) ?? "endmill"} Ø${String(p["toolDiameter"])} mm` : undefined], ["Depth", p["depth"] !== undefined ? `${String(p["depth"])} mm` : undefined], ["Stepdown", p["stepdown"] !== undefined ? `${String(p["stepdown"])} mm` : undefined], ["Feed", p["feedrate"] !== undefined ? `${String(p["feedrate"])} mm/min` : undefined], ["Spindle", p["rpm"] !== undefined ? `${String(p["rpm"])} rpm` : undefined], ["Material", str(p["material"])], ["Machine", str(p["machineType"])]]} /> }
  },
  "cam_edit.update": ({ input }) => {
    const keys = Object.keys(rec(input["params"]) ?? {})
    return { icon: "⌖", pending: "Updating the operation...", title: `Operation updated${keys.length > 0 ? `: ${keys.join(", ")}` : ""}` }
  },
  "cam.operations": ({ data }) => {
    const list = arr(data).flatMap((o) => (rec(o) ? [rec(o)!] : []))
    return { icon: "☰", pending: "Listing operations...", title: `${plural(list.length, "operation")}`,
      detail: list.length > 0 ? () => <Lines lines={list.map((o) => `${str(o["name"]) ?? str(o["operationType"]) ?? "?"} · ${str(o["type"]) ?? ""} · Ø${String(rec(o["tool"])?.["diameter"] ?? "?")} · ${String(o["depth"] ?? "?")} mm${o["generated"] === true ? " · G-code ready" : ""}`)} /> : undefined }
  },
  "cam.compare_setups": ({ data }) => {
    const d = rec(data)
    const s = rec(d?.["statistics"])
    return { icon: "≈", pending: "Working out cutting parameters...", title: "Cutting parameters suggested", tone: arr(d?.["warnings"]).length > 0 ? "warn" : "ok",
      detail: () => <div class="space-y-1"><Pair rows={[["Cutting speed", num(s?.["cuttingSpeed"]) !== undefined ? `${mm(s?.["cuttingSpeed"])} m/min` : undefined], ["Chip load", num(s?.["chipLoad"]) !== undefined ? `${String(s?.["chipLoad"])} mm/tooth` : undefined], ["Removal rate", num(s?.["materialRemovalRate"]) !== undefined ? mm(s?.["materialRemovalRate"]) : undefined], ["Feedback", str(d?.["feedback"])]]} /><Lines lines={[...arr(d?.["suggestions"]), ...arr(d?.["warnings"])].map(String)} /></div> }
  },
  "cam_edit.generate": ({ data }) => {
    const d = rec(data)
    const stats = rec(d?.["stats"])
    const preview = Array.isArray(d?.["preview"]) ? arr(d?.["preview"]).map(String).join("\n") : str(d?.["preview"]) ?? str(d?.["gcode"]) ?? ""
    const error = str(stats?.["error"])
    return { icon: "⌘", pending: "Generating G-code...", title: error ? "G-code not generated" : `G-code: ${plural(num(stats?.["lines"]) ?? 0, "line")} · ${mm(stats?.["cutLength"])} mm of cut · ${Math.round((num(stats?.["estimatedSeconds"]) ?? 0) / 60 * 10) / 10} min`, tone: error ? "error" : "ok",
      detail: () => <div class="space-y-1"><Show when={error}><p class="text-red-600">{error}</p></Show><Pair rows={[["Rapid", num(stats?.["rapidLength"]) !== undefined ? `${mm(stats?.["rapidLength"])} mm` : undefined], ["Z", num(stats?.["minZ"]) !== undefined ? `${mm(stats?.["minZ"])} … ${mm(stats?.["maxZ"])} mm` : undefined]]} /><Show when={preview !== ""}><Code text={preview} numbered /></Show></div> }
  },
  "cam.analyze": ({ data }) => {
    const d = rec(data)
    const issues = arr(d?.["issues"]).flatMap((i) => (rec(i) ? [rec(i)!] : []))
    return { icon: "⌕", pending: "Analysing G-code...", title: issues.length === 0 ? "G-code analysis: no static findings" : `G-code analysis: ${issueCounts(issues) || plural(issues.length, "note")}`, tone: issues.some((i) => i["severity"] === "error") ? "error" : issues.some((i) => i["severity"] === "warning") ? "warn" : "ok",
      detail: issues.length > 0 ? () => <Issues issues={issues} /> : undefined }
  },
  "cam_edit.verify": ({ data }) => {
    const d = rec(data)
    const issues = arr(d?.["issues"]).flatMap((i) => (rec(i) ? [rec(i)!] : []))
    const stats = rec(d?.["stats"])
    const modelled = rec(d?.["modelled"])
    const errors = issues.filter((i) => i["severity"] === "error").length
    return { icon: "◉", pending: "Simulating the toolpath...", title: errors === 0 ? "Simulation: no errors in what was modelled" : `Simulation: ${plural(errors, "error")}`, tone: errors > 0 ? "error" : issues.some((i) => i["severity"] === "warning") ? "warn" : "ok",
      detail: () => <div class="space-y-1"><Show when={issues.length > 0}><Issues issues={issues} /></Show><Pair rows={[["Removed", num(stats?.["removedVolume"]) !== undefined ? `${mm(stats?.["removedVolume"])} mm³` : undefined], ["Air cut", num(stats?.["airCutLength"]) !== undefined ? `${mm(stats?.["airCutLength"])} mm` : undefined], ["Modelled", modelled ? Object.entries(modelled).filter(([, v]) => v === true).map(([k]) => k).join(", ") || "stock only" : undefined]]} /></div> }
  },
  "library.lookup_tool": ({ input, data }) => {
    const list = arr(data).flatMap((o) => (rec(o) ? [rec(o)!] : []))
    return { icon: "⚒", pending: "Looking up tools...", title: `Tool library "${str(input["query"]) ?? ""}": ${plural(list.length, "match", "matches")}`,
      detail: list.length > 0 ? () => <Lines lines={list.map((o) => `${str(o["name"]) ?? "?"} · Ø${String(o["diameter"] ?? "?")} mm · ${str(o["type"]) ?? ""}`)} /> : undefined }
  },
  "library.lookup_material": ({ input, data }) => {
    const list = arr(data).flatMap((o) => (rec(o) ? [rec(o)!] : []))
    return { icon: "▦", pending: "Looking up materials...", title: `Material library "${str(input["query"]) ?? ""}": ${plural(list.length, "match", "matches")}`,
      detail: list.length > 0 ? () => <Lines lines={list.map((o) => str(o["name"]) ?? "?")} /> : undefined }
  },
  "memory_edit.remember": ({ input }) => ({ icon: "✎", pending: "Saving a note...", title: `Noted: ${str(input["key"]) ?? ""}` }),
  "memory.recall": ({ data }) => ({ icon: "☰", pending: "Reading notes...", title: `${plural(arr(data).length, "note")} recalled` }),
  code_mode: ({ input, output, data }) => {
    const code = str(input["code"]) ?? ""
    return { icon: "{}", pending: "Running a program...", title: "Program run", tone: rec(data)?.["ok"] === false ? "error" : "ok",
      detail: () => <div class="space-y-1"><Show when={code !== ""}><Code text={code} lines={10} /></Show><Show when={output !== undefined && output !== ""}><p class="whitespace-pre-wrap break-words text-gray-500">{clip(output!).slice(0, 800)}</p></Show></div> }
  },
  "agent.start": ({ data, input }) => {
    const d = rec(data)
    const agent = str(d?.["agent"]) ?? str(input["agent"]) ?? "researcher"
    const status = str(d?.["status"]) ?? ""
    return { icon: "▶", pending: `Handing the job to the ${agentLabel(agent)}...`, title: `${agentLabel(agent)}: ${str(input["description"]) ?? str(d?.["description"]) ?? ""} · ${status}`, tone: status === "error" ? "error" : status === "cancelled" ? "warn" : "ok",
      detail: str(d?.["text"]) || str(d?.["error"]) ? () => <p class="whitespace-pre-wrap break-words">{clip(str(d?.["text"]) ?? str(d?.["error"]) ?? "").slice(0, 1200)}</p> : undefined }
  },
  "agent.list": ({ data }) => ({ icon: "☰", pending: "Listing agent tasks...", title: `${plural(arr(data).length, "agent task")}` }),
  "agent.read": ({ data }) => ({ icon: "☰", pending: "Reading the report...", title: `Report of ${str(rec(data)?.["description"]) ?? "the task"} · ${str(rec(data)?.["status"]) ?? ""}` }),
  "agent.cancel": () => ({ icon: "■", pending: "Cancelling...", title: "Agent task cancelled" }),
  "vcs.status": () => ({ icon: "⎇", pending: "Reading version control...", title: "Version-control status" }),
  "vcs_edit.start_change": ({ input }) => ({ icon: "⎇", pending: "Starting a change...", title: `Change started: ${str(input["topic"]) ?? ""}` }),
  "vcs_edit.commit": ({ input }) => ({ icon: "⎇", pending: "Committing...", title: `Committed: ${str(input["message"]) ?? ""}` }),
  "vcs.diff": () => ({ icon: "⎇", pending: "Comparing revisions...", title: "Diff read" }),
  "vcs_edit.open_pull_request": ({ input }) => ({ icon: "⎇", pending: "Opening a pull request...", title: `Pull request: ${str(input["title"]) ?? ""}` }),
  "vcs.list_pull_requests": () => ({ icon: "⎇", pending: "Listing pull requests...", title: "Pull requests read" }),
  "vcs_edit.run_workflows": () => ({ icon: "▷", pending: "Running workflows...", title: "Workflows run" }),
  skill: ({ input }) => ({ icon: "☆", pending: "Loading a skill...", title: `Skill: ${str(input["name"]) ?? ""}` }),
  create_goal: ({ input }) => ({ icon: "◎", pending: "Setting a goal...", title: `Goal: ${str(input["objective"]) ?? ""}` }),
  get_goal: () => ({ icon: "◎", pending: "Reading the goal...", title: "Goal read" }),
  update_goal: ({ input }) => ({ icon: "◎", pending: "Updating the goal...", title: `Goal ${str(input["status"]) ?? "updated"}` })
}

const genericView = (tool: string, input: Rec): View => {
  const shown = Object.entries(input).slice(0, 3).map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 30) : JSON.stringify(v)?.slice(0, 30)}`).join(" ")
  return { icon: "⚙", pending: `Running ${tool}...`, title: `${tool}${shown ? ` ${shown}` : ""}` }
}

export interface ToolRowProps {
  readonly tool: string
  readonly call: AiToolCall | undefined
  readonly projectId: string | undefined
}

export function ToolRow(props: ToolRowProps): JSX.Element {
  const navigate = useMaybeNavigate()
  const status = (): AiToolCall["status"] | undefined => props.call?.status
  const input = (): Rec => rec(props.call?.input) ?? {}
  const data = createMemo(() => parse(props.call?.output))
  const failure = createMemo(() => (status() === "ok" || status() === "error" ? failureOf(props.call, data()) : undefined))
  const view = createMemo<View>(() => {
    // One host tool, many actions: the row renders the capability and what it was asked to do (`cad_edit` `delete`).
    const action = str(input()["action"]) ?? ""
    const make = VIEWS[action === "" ? props.tool : `${props.tool}.${action}`]
    try {
      return make ? make({ input: input(), data: data(), output: props.call?.output }) : genericView(props.tool, input())
    } catch {
      // A shape this version does not know must never blank the row.
      return genericView(props.tool, input())
    }
  })
  const done = (): boolean => status() === "ok" || status() === "error"
  const tone = (): Tone => (failure() !== undefined ? "error" : view().tone ?? "ok")
  const agent = (): string | undefined => props.call?.agent
  const facts = (): ReadonlyArray<string> => toolFacts(props.tool, props.call?.input, props.call?.output)
  const block = (): boolean => done() && failure() === undefined && view().detail !== undefined
  const pendingText = (): string => (status() === "preparing" && props.call?.chars !== undefined ? `${view().pending} (${kb(props.call.chars)})` : view().pending)

  const Header = (): JSX.Element => (
    <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <Show when={agent()}>
        {(name) => <span class="rounded bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900/50 dark:text-blue-200" data-testid="tool-agent">{agentLabel(name())}</span>}
      </Show>
      <Show when={done()} fallback={<><LoaderCircle size={11} aria-hidden="true" class="animate-spin" /><span class="text-gray-500">~ {pendingText()}</span></>}>
        <span aria-hidden="true" classList={{ "text-green-600": tone() === "ok", "text-amber-600": tone() === "warn", "text-red-600": tone() === "error" }}>{tone() === "error" ? "✕" : view().icon}</span>
        <span class="font-medium" classList={{ "text-red-700 dark:text-red-300": tone() === "error" }}>{view().title}</span>
      </Show>
      <code class="text-[10px] font-mono text-gray-500" title={toolTitle(props.tool, actionOf(props.call?.input))}>{props.tool}</code>
      <Show when={status() === "ok" && failure() === undefined}><span class="sr-only">{t("ai.message.tool.ok", { tool: props.tool })}</span></Show>
      <Show when={status() === "error" || failure() !== undefined}><span class="text-red-600">{t("ai.message.tool.error", { tool: props.tool })}</span></Show>
    </span>
  )

  return (
    <li class="assistant-tool-call text-xs text-gray-700 dark:text-gray-300" data-testid="tool-call" data-tool={props.tool} data-action={str(input()["action"]) ?? ""} data-agent={agent() ?? ""} data-status={status() ?? ""} data-shape={block() ? "block" : "inline"}>
      <div class={block() ? "border-l-2 pl-2" : "pl-1"} classList={{ "border-green-500": block() && tone() === "ok", "border-amber-500": block() && tone() === "warn", "border-red-500": block() && tone() === "error" }}>
        <Header />
        <For each={props.call?.images ?? []}>{(url) => <figure class="mt-2"><a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`${toolTitle(props.tool, actionOf(props.call?.input))} captured viewport for review`} class="max-h-80 rounded border object-contain" loading="lazy" /></a><figcaption>Captured viewport · {agent() ?? "CAD/CAM assistant"}</figcaption></figure>}</For>
        <Show when={failure()}>
          {(message) => <p class="mt-0.5 break-words text-red-600 dark:text-red-400" data-testid="tool-error">{message().slice(0, 600)}</p>}
        </Show>
        <Show when={block()}>
          <div class="mt-1 space-y-1 text-[11px]" data-testid="tool-detail">{view().detail!()}</div>
        </Show>
        <Show when={facts().length > 0}>
          <ul class="mt-1 pl-4" data-testid="tool-facts"><For each={facts()}>{(line) => <li>{line}</li>}</For></ul>
        </Show>
        <Show when={isVcsTool(props.tool) && props.projectId !== undefined && navigate !== undefined}>
          <button type="button" class="mt-1 ml-4 text-blue-700 underline dark:text-blue-300" data-testid="tool-open-vcs" onClick={() => navigate!(`/projects/${props.projectId}/history`)}>{t("ai.tool.openVcs")}</button>
        </Show>
        <Show when={props.call !== undefined}>
          <details class="mt-1" data-testid="tool-raw">
            <summary class="cursor-pointer text-[10px] text-gray-500">{t("ai.tool.input")} / {t("ai.tool.output")}</summary>
            <div class="mt-1 space-y-1">
              <p class="text-[10px] uppercase text-gray-500">{t("ai.tool.input")}</p>
              <pre class="max-h-40 overflow-auto rounded bg-gray-100 p-1.5 text-[10px] dark:bg-gray-800">{clip(pretty(props.call!.input))}</pre>
              <Show when={props.call!.output !== undefined}>
                <p class="text-[10px] uppercase text-gray-500">{t("ai.tool.output")}</p>
                <pre class="max-h-56 overflow-auto rounded bg-gray-100 p-1.5 text-[10px] dark:bg-gray-800">{clip(pretty(props.call!.output))}</pre>
              </Show>
            </div>
          </details>
        </Show>
      </div>
    </li>
  )
}
