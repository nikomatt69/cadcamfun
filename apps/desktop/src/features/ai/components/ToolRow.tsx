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
import Activity from "lucide-solid/icons/activity"
import ArrowLeftRight from "lucide-solid/icons/arrow-left-right"
import BookOpen from "lucide-solid/icons/book-open"
import Box from "lucide-solid/icons/box"
import Boxes from "lucide-solid/icons/boxes"
import Braces from "lucide-solid/icons/braces"
import Check from "lucide-solid/icons/check"
import Crosshair from "lucide-solid/icons/crosshair"
import Download from "lucide-solid/icons/download"
import FileCode from "lucide-solid/icons/file-code"
import Gauge from "lucide-solid/icons/gauge"
import GitBranch from "lucide-solid/icons/git-branch"
import Layers from "lucide-solid/icons/layers"
import List from "lucide-solid/icons/list"
import Nut from "lucide-solid/icons/nut"
import Pencil from "lucide-solid/icons/pencil"
import PencilRuler from "lucide-solid/icons/pencil-ruler"
import Play from "lucide-solid/icons/play"
import Ruler from "lucide-solid/icons/ruler"
import Search from "lucide-solid/icons/search"
import Settings from "lucide-solid/icons/settings"
import Square from "lucide-solid/icons/square"
import Target from "lucide-solid/icons/target"
import Wrench from "lucide-solid/icons/wrench"
import X from "lucide-solid/icons/x"
import { currentLocale, t } from "../../../i18n/index.ts"
import type { AiToolCall } from "../lib/types.ts"
import { isVcsTool, toolFacts } from "../lib/tool-facts.ts"
import { actionOf } from "../lib/tool-schemas.ts"
import { canonicalTool, toolTitle } from "../lib/tools.ts"

/** The row's glyph, from the app's icon set: every view names its mark with a short code and one size and stroke draw them all. */
const GLYPHS: Record<string, (props: { size: number; "aria-hidden": "true" }) => JSX.Element> = {
  "{}": Braces, "↔": ArrowLeftRight, "⇩": Download, "≈": Gauge, "⌕": Search, "⌖": Crosshair, "⌗": Nut, "⌘": FileCode, "⎇": GitBranch,
  "■": Square, "▣": Boxes, "▤": Ruler, "▦": Layers, "▶": Play, "▷": Play, "◆": Box, "◇": PencilRuler, "◉": Activity, "◎": Target,
  "☆": BookOpen, "☰": List, "⚒": Wrench, "⚙": Settings, "✎": Pencil, "✓": Check, "✕": X
}
const Glyph = (props: { readonly code: string }): JSX.Element => {
  const Icon = GLYPHS[props.code]
  return Icon === undefined ? <span>{props.code}</span> : <Icon size={14} aria-hidden="true" />
}

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
/** The plural forms follow the CLDR order of the language (zero, one, two, few, many, other); a table with fewer forms repeats its last one. */
const PLURAL_ORDER = ["zero", "one", "two", "few", "many", "other"] as const
type Noun = "element" | "entity" | "solid" | "part" | "component" | "finding" | "note" | "operation" | "line" | "match" | "agentTask" | "error" | "warning"
/** `3 elements`, in the language of the interface; the table holds the forms of the noun, `|` apart. */
const plural = (n: number, noun: Noun): string => {
  const forms = t(`ai.toolView.n.${noun}` as never).split("|")
  const rules = new Intl.PluralRules(currentLocale())
  const categories = PLURAL_ORDER.filter((category) => rules.resolvedOptions().pluralCategories.includes(category))
  const index = Math.min(Math.max(categories.indexOf(rules.select(n)), 0), forms.length - 1)
  return `${n} ${forms[index]}`
}
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
  if (call?.status === "error") return call.output ?? t("ai.toolView.failed")
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
  <p class="assistant-tool-chips">
    <For each={props.items}>{(item) => <span class="assistant-tool-chip">{item}</span>}</For>
  </p>
)
const Lines = (props: { readonly lines: ReadonlyArray<string>; readonly max?: number }): JSX.Element => {
  const max = props.max ?? 12
  return (
    <ul class="assistant-tool-lines">
      <For each={props.lines.slice(0, max)}>{(line) => <li class="break-words">{line}</li>}</For>
      <Show when={props.lines.length > max}><li class="assistant-meta-text">{t("ai.toolView.more", { count: props.lines.length - max })}</li></Show>
    </ul>
  )
}
const Issues = (props: { readonly issues: ReadonlyArray<Rec> }): JSX.Element => (
  <ul class="assistant-tool-issues" data-testid="tool-issues">
    <For each={props.issues.slice(0, 20)}>{(issue) => {
      const severity = str(issue["severity"]) ?? "info"
      return (
        <li class="assistant-tool-issue">
          <span class="assistant-issue-badge" data-severity={severity}>{severity}</span>
          <span class="break-words"><Show when={str(issue["code"])}>{(code) => <code class="mr-1">{code()}</code>}</Show>{str(issue["message"])}<Show when={num(issue["line"])}>{(line) => <span class="assistant-meta-text"> · {t("ai.toolView.issueLine", { line: line() })}</span>}</Show></span>
        </li>
      )
    }}</For>
    <Show when={props.issues.length > 20}><li class="assistant-meta-text">{t("ai.toolView.more", { count: props.issues.length - 20 })}</li></Show>
  </ul>
)
const Pair = (props: { readonly rows: ReadonlyArray<readonly [string, string | undefined]> }): JSX.Element => (
  <dl class="assistant-tool-pair">
    <For each={props.rows.filter((row) => row[1] !== undefined && row[1] !== "")}>{(row) => <><dt class="assistant-meta-text">{row[0]}</dt><dd class="break-words">{row[1]}</dd></>}</For>
  </dl>
)
const Code = (props: { readonly text: string; readonly lines?: number; readonly numbered?: boolean }): JSX.Element => {
  const [all, setAll] = createSignal(false)
  const lines = createMemo(() => props.text.split("\n"))
  const limit = props.lines ?? 12
  const shown = createMemo(() => (all() ? lines() : lines().slice(0, limit)))
  return (
    <div>
      <pre class="assistant-code-block max-h-72" data-testid="tool-code">
        <For each={shown()}>{(line, index) => <div>{props.numbered ? <span class="assistant-code-lineno">{String(index() + 1).padStart(3, " ")}</span> : null}{line}</div>}</For>
      </pre>
      <Show when={lines().length > limit}>
        <button type="button" class="assistant-link-btn mt-1" onClick={() => setAll(!all())}>{all() ? t("ai.toolView.showLess") : t("ai.toolView.showMore", { count: lines().length - limit })}</button>
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
  return e === undefined ? [] : [`${str(e["id"]) ?? "?"}: ${keys.join(", ") || t("ai.toolView.noChange")}`]
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
      icon: "◆", pending: t("ai.toolView.add.pending", { what: plural(asked.length || 1, "element") }),
      title: d?.["ok"] === false ? t("ai.toolView.add.none") : skipped.length > 0 ? t("ai.toolView.add.builtSkipped", { what: plural(made.length || asked.length, "element"), skipped: skipped.length }) : t("ai.toolView.add.built", { what: plural(made.length || asked.length, "element") }),
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
    return { icon: "◇", pending: t("ai.toolView.draw.pending"), title: t("ai.toolView.draw.title", { what: plural(made.length || arr(input["entities"]).length, "entity") }), tone: d?.["ok"] === false ? "error" : "ok",
      detail: () => <Chips items={countBy(made, "type")} /> }
  },
  "cad_edit.import": ({ input, data }) => {
    const d = rec(data)
    const made = arr(d?.["elements"])
    return { icon: "⇩", pending: t("ai.toolView.import.pending"), title: t("ai.toolView.import.title", { name: str(input["attachment"]) ?? t("ai.toolView.import.defaultName"), what: plural(made.length, "solid") }), tone: d?.["ok"] === false ? "error" : arr(d?.["warnings"]).length > 0 ? "warn" : "ok",
      detail: () => <div class="space-y-1"><Chips items={countBy(made, "type")} /><Lines lines={arr(d?.["warnings"]).map(String)} /></div> }
  },
  "cad_edit.modify": ({ input, data }) => {
    const d = rec(data)
    return { icon: "✎", pending: t("ai.toolView.modify.pending"), title: t("ai.toolView.modify.title", { what: plural(num(d?.["modified"]) ?? arr(input["changes"]).length, "entity") }),
      detail: () => <Lines lines={changedKeys(input["changes"])} /> }
  },
  "cad_edit.transform": ({ input, data }) => {
    const d = rec(data)
    const ids = arr(d?.["ids"]).length
    const how = Object.keys(input).filter((k) => k !== "ids" && k !== "id" && input[k] !== undefined && input[k] !== null).join(", ")
    const what = plural(ids || arr(input["ids"]).length, "entity")
    const done = t(d?.["mode"] === "copied" ? "ai.toolView.transform.copied" : "ai.toolView.transform.done", { what })
    return { icon: "↔", pending: t("ai.toolView.transform.pending"), title: how ? t("ai.toolView.withDetail", { title: done, detail: how }) : done }
  },
  "cad_edit.group": ({ data }) => {
    const d = rec(data)
    return { icon: "▣", pending: t("ai.toolView.group.pending"), title: arr(d?.["removed"]).length > 0 ? t("ai.toolView.group.grouped", { what: plural(arr(d?.["removed"]).length, "part") }) : t("ai.toolView.group.opened", { what: plural(arr(d?.["ids"]).length, "component") }) }
  },
  "cad_edit.editor": ({ input, data }) => {
    const actions = arr(rec(data)?.["actions"]).length > 0 ? arr(rec(data)?.["actions"]) : arr(input["actions"])
    const cut = actions.map(rec).find((a) => str(a?.["action"]) === "section_on")
    const listed = t("ai.toolView.editor.title", { actions: actions.map((a) => str(rec(a)?.["action"]) ?? "?").join(", ") || t("ai.toolView.editor.actions") })
    const section = cut ? t("ai.toolView.editor.section", { axis: str(cut["axis"]) ?? "z", position: mm(cut["position"]) }) : ""
    return { icon: "⚙", pending: t("ai.toolView.editor.pending"), title: section ? t("ai.toolView.withDetail", { title: listed, detail: section }) : listed }
  },
  "cad_edit.delete": ({ data, input }) => {
    const d = rec(data)
    return { icon: "✕", pending: t("ai.toolView.delete.pending"), title: t("ai.toolView.delete.title", { what: plural(num(d?.["deleted"]) ?? arr(input["ids"]).length, "entity") }) }
  },
  "cad.describe": ({ data }) => {
    const d = rec(data)
    const counts = rec(d?.["counts"]) ?? {}
    const bounds = rec(d?.["bounds"])
    const lo = rec(bounds?.["min"]), hi = rec(bounds?.["max"])
    return { icon: "▤", pending: t("ai.toolView.describe.pending"), title: t("ai.toolView.describe.title", { what: plural(num(d?.["total"]) ?? 0, "element") }),
      detail: () => (
        <div class="space-y-1">
          <Chips items={Object.entries(counts).map(([k, v]) => `${k} ×${String(v)}`)} />
          <Show when={lo && hi}><p class="assistant-meta-text">x {mm(lo?.["x"])} … {mm(hi?.["x"])} · y {mm(lo?.["y"])} … {mm(hi?.["y"])} · z {mm(lo?.["z"])} … {mm(hi?.["z"])} {t("cad.millimeters")}</p></Show>
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
      return { icon: "✓", pending: t("ai.toolView.dfm.pending"), title: t("ai.toolView.dfm.title", { process: str(d?.["process"]) ?? str(input["process"]) ?? "mill", diameter: mm(d?.["toolDiameter"] ?? input["toolDiameter"] ?? 6), result: issues.length === 0 ? t("ai.toolView.dfm.noFindings") : issueCounts(issues) || plural(issues.length, "finding") }),
        tone: d?.["ok"] === false ? "error" : issues.some((i) => i["severity"] === "warning") ? "warn" : "ok",
        detail: () => <><Pair rows={[[t("ai.toolView.label.solids"), num(metrics?.["bodies"]) === undefined ? undefined : String(metrics?.["bodies"])], [t("ai.toolView.label.volume"), num(metrics?.["volumeMm3"]) === undefined ? undefined : `${mm(num(metrics?.["volumeMm3"])! / 1000)} cm³`], [t("ai.toolView.label.thinnestWall"), num(metrics?.["minWallMm"]) === undefined ? undefined : `${mm(metrics?.["minWallMm"])} mm`]]} />{issues.length > 0 ? <Issues issues={issues} /> : <p class="assistant-meta-text">{t("ai.toolView.dfm.ok")}</p>}</> }
    }
    if (action === "recipe") {
      const report = rec(d?.["report"])
      const issues = listed(report?.["issues"])
      const derived = Object.entries(rec(d?.["derived"]) ?? {}).map(([k, v]) => [k, String(v)] as const)
      return { icon: "◆", pending: t("ai.toolView.recipe.pending"), title: t(input["create"] === true ? "ai.toolView.recipe.created" : "ai.toolView.recipe.title", { name: str(d?.["recipe"]) ?? str(input["recipe"]) ?? "", summary: str(d?.["summary"]) ?? "" }), tone: issues.some((i) => i["severity"] === "error") ? "error" : "ok",
        detail: () => <><Pair rows={derived} /><Lines lines={arr(d?.["rules"]).map(String)} />{issues.length > 0 ? <Issues issues={issues} /> : null}</> }
    }
    if (action === "fastener") {
      const thread = rec(d?.["thread"])
      return { icon: "⌗", pending: t("ai.toolView.fastener.pending"), title: thread !== undefined ? t("ai.toolView.fastener.thread", { name: str(thread["name"]) ?? "", drill: mm(thread["tapDrill"]) }) : str(input["shaftDiameter"]) !== undefined || num(input["shaftDiameter"]) !== undefined ? t("ai.toolView.fastener.keyway", { diameter: mm(input["shaftDiameter"]) }) : t("ai.toolView.fastener.table"),
        detail: thread !== undefined ? () => <Pair rows={[[t("ai.toolView.label.pitch"), `${mm(thread["pitch"])} mm`], [t("ai.toolView.label.clearance"), ["fine", "medium", "coarse"].map((k) => mm(rec(thread["clearance"])?.[k])).join(" / ")], [t("ai.toolView.label.counterbore"), `Ø${mm(thread["counterboreDiameter"])} x ${mm(thread["counterboreDepth"])} mm`], [t("ai.toolView.label.countersink"), `Ø${mm(thread["countersinkDiameter"])} mm`]]} /> : undefined }
    }
    const issues = listed(d?.["issues"])
    const titles: Readonly<Record<string, string>> = { inspect: "ai.toolView.param.inspect", validate: "ai.toolView.param.validate", create: "ai.toolView.param.create", update: "ai.toolView.param.update", test: "ai.toolView.param.test" }
    return { icon: "◇", pending: t("ai.toolView.param.pending"), title: `${t((titles[action] ?? "ai.toolView.param.other") as never)}${num(d?.["bodyCount"]) !== undefined ? ` · ${plural(num(d?.["bodyCount"])!, "solid")}` : ""}${num(d?.["volumeMm3"]) !== undefined ? ` · ${mm(num(d?.["volumeMm3"])! / 1000)} cm³` : ""}`,
      tone: issues.some((i) => i["severity"] === "error") ? "error" : issues.length > 0 ? "warn" : "ok",
      detail: issues.length > 0 ? () => <Issues issues={issues.map((i) => ({ ...i, code: str(i["feature"]) }))} /> : undefined }
  },
  "cad.check": ({ data }) => {
    const d = rec(data)
    const issues = arr(d?.["issues"]).flatMap((i) => (rec(i) ? [rec(i)!] : []))
    return { icon: "✓", pending: t("ai.toolView.check.pending"), title: issues.length === 0 ? t("ai.toolView.check.none") : t("ai.toolView.check.title", { result: issueCounts(issues) || plural(issues.length, "note") }), tone: d?.["ok"] === false ? "error" : issues.some((i) => i["severity"] === "warning") ? "warn" : "ok",
      detail: issues.length > 0 ? () => <Issues issues={issues} /> : undefined }
  },
  "cam.machine": ({ data }) => {
    const d = rec(data)
    return { icon: "⚒", pending: t("ai.toolView.machine.pending"), title: t("ai.toolView.machine.title", { title: str(d?.["title"]) ?? "?" }),
      detail: () => <Pair rows={[[t("ai.toolView.label.process"), str(d?.["process"])], [t("ai.toolView.label.rotates"), str(d?.["rotates"])], [t("ai.toolView.label.plane"), str(d?.["plane"])], [t("ai.toolView.label.zero"), str(d?.["zero"])], [t("ai.toolView.label.axes"), arr(d?.["axes"]).map((a) => str(rec(a)?.["name"]) ?? "").join(" ")], [t("ai.toolView.label.operations"), arr(d?.["operations"]).map(String).join(", ")]]} /> }
  },
  "cam_edit.create": ({ input, data }) => {
    const p = rec(input["params"]) ?? {}
    const d = rec(data)
    return { icon: "⌖", pending: t("ai.toolView.opCreate.pending"), title: t("ai.toolView.opCreate.title", { type: str(input["type"]) ?? "?" }),
      detail: () => <Pair rows={[[t("ai.toolView.label.id"), str(d?.["operationId"])], [t("ai.toolView.label.tool"), p["toolDiameter"] !== undefined ? `${str(p["toolType"]) ?? "endmill"} Ø${String(p["toolDiameter"])} mm` : undefined], [t("ai.toolView.label.depth"), p["depth"] !== undefined ? `${String(p["depth"])} mm` : undefined], [t("ai.toolView.label.stepdown"), p["stepdown"] !== undefined ? `${String(p["stepdown"])} mm` : undefined], [t("ai.toolView.label.feed"), p["feedrate"] !== undefined ? `${String(p["feedrate"])} mm/min` : undefined], [t("ai.toolView.label.spindle"), p["rpm"] !== undefined ? `${String(p["rpm"])} rpm` : undefined], [t("ai.toolView.label.material"), str(p["material"])], [t("ai.toolView.label.machine"), str(p["machineType"])]]} /> }
  },
  "cam_edit.update": ({ input }) => {
    const keys = Object.keys(rec(input["params"]) ?? {})
    return { icon: "⌖", pending: t("ai.toolView.opUpdate.pending"), title: keys.length > 0 ? t("ai.toolView.opUpdate.titleKeys", { keys: keys.join(", ") }) : t("ai.toolView.opUpdate.title") }
  },
  "cam.operations": ({ data }) => {
    const list = arr(data).flatMap((o) => (rec(o) ? [rec(o)!] : []))
    return { icon: "☰", pending: t("ai.toolView.ops.pending"), title: plural(list.length, "operation"),
      detail: list.length > 0 ? () => <Lines lines={list.map((o) => `${str(o["name"]) ?? str(o["operationType"]) ?? "?"} · ${str(o["type"]) ?? ""} · Ø${String(rec(o["tool"])?.["diameter"] ?? "?")} · ${String(o["depth"] ?? "?")} mm${o["generated"] === true ? ` · ${t("ai.toolView.ops.ready")}` : ""}`)} /> : undefined }
  },
  "cam.compare_setups": ({ data }) => {
    const d = rec(data)
    const s = rec(d?.["statistics"])
    return { icon: "≈", pending: t("ai.toolView.cutting.pending"), title: t("ai.toolView.cutting.title"), tone: arr(d?.["warnings"]).length > 0 ? "warn" : "ok",
      detail: () => <div class="space-y-1"><Pair rows={[[t("ai.toolView.label.cuttingSpeed"), num(s?.["cuttingSpeed"]) !== undefined ? `${mm(s?.["cuttingSpeed"])} m/min` : undefined], [t("ai.toolView.label.chipLoad"), num(s?.["chipLoad"]) !== undefined ? `${String(s?.["chipLoad"])} mm/tooth` : undefined], [t("ai.toolView.label.removalRate"), num(s?.["materialRemovalRate"]) !== undefined ? mm(s?.["materialRemovalRate"]) : undefined], [t("ai.toolView.label.feedback"), str(d?.["feedback"])]]} /><Lines lines={[...arr(d?.["suggestions"]), ...arr(d?.["warnings"])].map(String)} /></div> }
  },
  "cam_edit.generate": ({ data }) => {
    const d = rec(data)
    const stats = rec(d?.["stats"])
    const preview = Array.isArray(d?.["preview"]) ? arr(d?.["preview"]).map(String).join("\n") : str(d?.["preview"]) ?? str(d?.["gcode"]) ?? ""
    const error = str(stats?.["error"]) ?? (d?.["ok"] === false ? str(d?.["error"]) ?? t("ai.toolView.gcode.failed") : undefined)
    return { icon: "⌘", pending: t("ai.toolView.gcode.pending"), title: error ? t("ai.toolView.gcode.notGenerated") : t("ai.toolView.gcode.title", { lines: plural(num(stats?.["lines"]) ?? 0, "line"), length: mm(stats?.["cutLength"]), minutes: Math.round((num(stats?.["estimatedSeconds"]) ?? 0) / 60 * 10) / 10 }), tone: error ? "error" : "ok",
      detail: () => <div class="space-y-1"><Show when={error}><p class="assistant-status-error">{error}</p></Show><Pair rows={[[t("ai.toolView.label.rapid"), num(stats?.["rapidLength"]) !== undefined ? `${mm(stats?.["rapidLength"])} mm` : undefined], ["Z", num(stats?.["minZ"]) !== undefined ? `${mm(stats?.["minZ"])} … ${mm(stats?.["maxZ"])} mm` : undefined]]} /><Show when={preview !== ""}><Code text={preview} numbered /></Show></div> }
  },
  "cam.analyze": ({ data }) => {
    const d = rec(data)
    const issues = arr(d?.["issues"]).flatMap((i) => (rec(i) ? [rec(i)!] : []))
    return { icon: "⌕", pending: t("ai.toolView.analyze.pending"), title: issues.length === 0 ? t("ai.toolView.analyze.none") : t("ai.toolView.analyze.title", { result: issueCounts(issues) || plural(issues.length, "note") }), tone: issues.some((i) => i["severity"] === "error") ? "error" : issues.some((i) => i["severity"] === "warning") ? "warn" : "ok",
      detail: issues.length > 0 ? () => <Issues issues={issues} /> : undefined }
  },
  "cam_edit.verify": ({ data }) => {
    const d = rec(data)
    const issues = arr(d?.["issues"]).flatMap((i) => (rec(i) ? [rec(i)!] : []))
    const stats = rec(d?.["stats"])
    const modelled = rec(d?.["modelled"])
    const errors = issues.filter((i) => i["severity"] === "error").length
    return { icon: "◉", pending: t("ai.toolView.simulate.pending"), title: errors === 0 ? t("ai.toolView.simulate.none") : t("ai.toolView.simulate.title", { what: plural(errors, "error") }), tone: errors > 0 ? "error" : issues.some((i) => i["severity"] === "warning") ? "warn" : "ok",
      detail: () => <div class="space-y-1"><Show when={issues.length > 0}><Issues issues={issues} /></Show><Pair rows={[[t("ai.toolView.label.removed"), num(stats?.["removedVolume"]) !== undefined ? `${mm(stats?.["removedVolume"])} mm³` : undefined], [t("ai.toolView.label.airCut"), num(stats?.["airCutLength"]) !== undefined ? `${mm(stats?.["airCutLength"])} mm` : undefined], [t("ai.toolView.label.modelled"), modelled ? Object.entries(modelled).filter(([, v]) => v === true).map(([k]) => k).join(", ") || t("ai.toolView.simulate.stockOnly") : undefined]]} /></div> }
  },
  "library.lookup_tool": ({ input, data }) => {
    const list = arr(data).flatMap((o) => (rec(o) ? [rec(o)!] : []))
    return { icon: "⚒", pending: t("ai.toolView.toolLib.pending"), title: t("ai.toolView.toolLib.title", { query: str(input["query"]) ?? "", what: plural(list.length, "match") }),
      detail: list.length > 0 ? () => <Lines lines={list.map((o) => `${str(o["name"]) ?? "?"} · Ø${String(o["diameter"] ?? "?")} mm · ${str(o["type"]) ?? ""}`)} /> : undefined }
  },
  "library.lookup_material": ({ input, data }) => {
    const list = arr(data).flatMap((o) => (rec(o) ? [rec(o)!] : []))
    return { icon: "▦", pending: t("ai.toolView.matLib.pending"), title: t("ai.toolView.matLib.title", { query: str(input["query"]) ?? "", what: plural(list.length, "match") }),
      detail: list.length > 0 ? () => <Lines lines={list.map((o) => str(o["name"]) ?? "?")} /> : undefined }
  },
  "memory_edit.remember": ({ input }) => ({ icon: "✎", pending: t("ai.toolView.note.pending"), title: t("ai.toolView.note.title", { key: str(input["key"]) ?? "" }) }),
  "memory.recall": ({ data }) => ({ icon: "☰", pending: t("ai.toolView.recall.pending"), title: t("ai.toolView.recall.title", { what: plural(arr(data).length, "note") }) }),
  code_mode: ({ input, output, data }) => {
    const code = str(input["code"]) ?? ""
    return { icon: "{}", pending: t("ai.toolView.program.pending"), title: t("ai.toolView.program.title"), tone: rec(data)?.["ok"] === false ? "error" : "ok",
      detail: () => <div class="space-y-1"><Show when={code !== ""}><Code text={code} lines={10} /></Show><Show when={output !== undefined && output !== ""}><p class="whitespace-pre-wrap break-words assistant-meta-text">{clip(output!).slice(0, 800)}</p></Show></div> }
  },
  "agent.start": ({ data, input }) => {
    const d = rec(data)
    const agent = str(d?.["agent"]) ?? str(input["agent"]) ?? "researcher"
    const status = str(d?.["status"]) ?? ""
    return { icon: "▶", pending: t("ai.toolView.agentStart.pending", { agent: agentLabel(agent) }), title: `${agentLabel(agent)}: ${str(input["description"]) ?? str(d?.["description"]) ?? ""} · ${status}`, tone: status === "error" ? "error" : status === "cancelled" ? "warn" : "ok",
      detail: str(d?.["text"]) || str(d?.["error"]) ? () => <p class="whitespace-pre-wrap break-words">{clip(str(d?.["text"]) ?? str(d?.["error"]) ?? "").slice(0, 1200)}</p> : undefined }
  },
  "agent.list": ({ data }) => ({ icon: "☰", pending: t("ai.toolView.agentList.pending"), title: plural(arr(data).length, "agentTask") }),
  "agent.read": ({ data }) => ({ icon: "☰", pending: t("ai.toolView.agentRead.pending"), title: t("ai.toolView.agentRead.title", { task: str(rec(data)?.["description"]) ?? t("ai.toolView.agentRead.task"), status: str(rec(data)?.["status"]) ?? "" }) }),
  "agent.cancel": () => ({ icon: "■", pending: t("ai.toolView.agentCancel.pending"), title: t("ai.toolView.agentCancel.title") }),
  "vcs.status": () => ({ icon: "⎇", pending: t("ai.toolView.vcsStatus.pending"), title: t("ai.toolView.vcsStatus.title") }),
  "vcs_edit.start_change": ({ input }) => ({ icon: "⎇", pending: t("ai.toolView.vcsStart.pending"), title: t("ai.toolView.vcsStart.title", { topic: str(input["topic"]) ?? "" }) }),
  "vcs_edit.commit": ({ input }) => ({ icon: "⎇", pending: t("ai.toolView.vcsCommit.pending"), title: t("ai.toolView.vcsCommit.title", { message: str(input["message"]) ?? "" }) }),
  "vcs.diff": () => ({ icon: "⎇", pending: t("ai.toolView.vcsDiff.pending"), title: t("ai.toolView.vcsDiff.title") }),
  "vcs_edit.open_pull_request": ({ input }) => ({ icon: "⎇", pending: t("ai.toolView.vcsPr.pending"), title: t("ai.toolView.vcsPr.title", { title: str(input["title"]) ?? "" }) }),
  "vcs.list_pull_requests": () => ({ icon: "⎇", pending: t("ai.toolView.vcsPrList.pending"), title: t("ai.toolView.vcsPrList.title") }),
  "vcs_edit.run_workflows": () => ({ icon: "▷", pending: t("ai.toolView.vcsRun.pending"), title: t("ai.toolView.vcsRun.title") }),
  skill: ({ input }) => ({ icon: "☆", pending: t("ai.toolView.skill.pending"), title: t("ai.toolView.skill.title", { name: str(input["name"]) ?? "" }) }),
  create_goal: ({ input }) => ({ icon: "◎", pending: t("ai.toolView.goalSet.pending"), title: t("ai.toolView.goalSet.title", { objective: str(input["objective"]) ?? "" }) }),
  get_goal: () => ({ icon: "◎", pending: t("ai.toolView.goalGet.pending"), title: t("ai.toolView.goalGet.title") }),
  update_goal: ({ input }) => ({ icon: "◎", pending: t("ai.toolView.goalUpdate.pending"), title: str(input["status"]) !== undefined ? t("ai.toolView.goalUpdate.title", { status: str(input["status"])! }) : t("ai.toolView.goalUpdate.default") })
}

const genericView = (tool: string, input: Rec): View => {
  const shown = Object.entries(input).slice(0, 3).map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 30) : JSON.stringify(v)?.slice(0, 30)}`).join(" ")
  return { icon: "⚙", pending: t("ai.toolView.generic.pending", { tool }), title: `${tool}${shown ? ` ${shown}` : ""}` }
}

export interface ToolRowProps {
  readonly tool: string
  readonly call: AiToolCall | undefined
  readonly projectId: string | undefined
}

export function ToolRow(props: ToolRowProps): JSX.Element {
  const navigate = useMaybeNavigate()
  const [rawOpen, setRawOpen] = createSignal(false)
  const status = (): AiToolCall["status"] | undefined => props.call?.status
  const input = (): Rec => rec(props.call?.input) ?? {}
  const data = createMemo(() => parse(props.call?.output))
  const failure = createMemo(() => (status() === "ok" || status() === "error" ? failureOf(props.call, data()) : undefined))
  const view = createMemo<View>(() => {
    // One host tool, many actions: the row renders the capability and what it was asked to do (`cad_edit` `delete`).
    const action = str(input()["action"]) ?? ""
    const tool = canonicalTool(props.tool)
    const make = VIEWS[action === "" ? tool : `${tool}.${action}`]
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
  const facts = createMemo(() => toolFacts(props.tool, props.call?.input, props.call?.output))
  const block = (): boolean => done() && failure() === undefined && view().detail !== undefined
  const pendingText = (): string => (status() === "preparing" && props.call?.chars !== undefined ? `${view().pending} (${kb(props.call.chars)})` : view().pending)

  const Header = (): JSX.Element => (
    <span class="assistant-tool-call-head">
      <Show when={agent()}>
        {(name) => <span class="assistant-agent-pill" data-testid="tool-agent">{agentLabel(name())}</span>}
      </Show>
      <Show when={done()} fallback={<><LoaderCircle size={14} aria-hidden="true" class="animate-spin assistant-status-active" /><span class="assistant-meta-text">~ {pendingText()}</span></>}>
        <span aria-hidden="true" class="assistant-tool-glyph" data-tone={tone()}><Glyph code={tone() === "error" ? "✕" : view().icon} /></span>
        <span class="assistant-tool-title" data-tone={tone()}>{view().title}</span>
      </Show>
      <code class="assistant-tool-id" title={toolTitle(props.tool, actionOf(props.call?.input))}>{props.tool}</code>
      <Show when={status() === "ok" && failure() === undefined}><span class="sr-only">{t("ai.message.tool.ok", { tool: props.tool })}</span></Show>
      <Show when={status() === "error" || failure() !== undefined}><span class="assistant-status-error">{t("ai.message.tool.error", { tool: props.tool })}</span></Show>
    </span>
  )

  return (
    <li
      class="assistant-tool-call"
      data-testid="tool-call"
      data-tool={props.tool}
      data-action={str(input()["action"]) ?? ""}
      data-agent={agent() ?? ""}
      data-status={status() ?? ""}
      data-shape={block() ? "block" : "inline"}
      data-tone={tone()}
    >
      <div class="assistant-tool-call-inner">
        <Header />
        <For each={props.call?.images ?? []}>{(url) => <figure class="assistant-tool-figure"><a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={t("ai.toolView.image.alt", { title: toolTitle(props.tool, actionOf(props.call?.input)) })} class="max-h-80 rounded border object-contain" loading="lazy" /></a><figcaption>{t("ai.toolView.image.caption", { agent: agent() ?? t("ai.toolView.image.agent") })}</figcaption></figure>}</For>
        <Show when={failure()}>
          {(message) => <p class="assistant-tool-error" data-testid="tool-error">{message().slice(0, 600)}</p>}
        </Show>
        <Show when={block()}>
          <div class="assistant-tool-detail" data-testid="tool-detail">{view().detail!()}</div>
        </Show>
        <Show when={facts().length > 0}>
          <ul class="assistant-tool-facts" data-testid="tool-facts"><For each={facts()}>{(line) => <li>{line}</li>}</For></ul>
        </Show>
        <Show when={isVcsTool(props.tool) && props.projectId !== undefined && navigate !== undefined}>
          <button type="button" class="assistant-link-btn mt-1" data-testid="tool-open-vcs" onClick={() => navigate!(`/projects/${props.projectId}/history`)}>{t("ai.tool.openVcs")}</button>
        </Show>
        <Show when={props.call !== undefined}>
          <details class="assistant-tool-raw" data-testid="tool-raw" onToggle={(event) => setRawOpen(event.currentTarget.open)}>
            <summary class="assistant-tool-raw-summary">{t("ai.tool.input")} / {t("ai.tool.output")}</summary>
            <Show when={rawOpen()}>
              <div class="assistant-tool-raw-body">
                <p class="assistant-raw-label">{t("ai.tool.input")}</p>
                <pre class="assistant-code-block max-h-40">{clip(pretty(props.call!.input))}</pre>
                <Show when={props.call!.output !== undefined}>
                  <p class="assistant-raw-label">{t("ai.tool.output")}</p>
                  <pre class="assistant-code-block max-h-56">{clip(pretty(props.call!.output))}</pre>
                </Show>
              </div>
            </Show>
          </details>
        </Show>
      </div>
    </li>
  )
}
