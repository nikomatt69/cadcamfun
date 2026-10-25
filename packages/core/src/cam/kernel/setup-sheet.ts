/**
 * The setup sheet (spec 54 H1): the shop document of a verified program, read from the program's own artifact and from nothing
 * else, so it cannot disagree with the NC it is handed out with. Part and stock, work offset and zero, the tool list in the
 * order of the tool numbers (with stick-out, the operations that use each tool and the time it cuts), the operation list in
 * program order (strategy, tool, cutting data, time, removal, warnings), the evidence claims with their status, the planner's
 * notes and the identity digests.
 *
 * `setupSheetData` is the structured form; `setupSheetHtml` renders it as one self-contained HTML page (inline CSS, one inline
 * SVG silhouette per tool, every value escaped) that prints on A4. Printer artifacts have a print report instead and are refused.
 */
import { titleBlockText, type CompleteTitleBlock, type TitleBlockKey } from "../../drawing/title-block.ts"
import type { CamArtifact, Claim, OperationOutcome } from "./contracts.ts"
import type { Cutter } from "./cutters.ts"

export interface SetupSheetTool {
  readonly number: number
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly diameter: number
  readonly flutes: number
  readonly fluteLength: number
  readonly shankDiameter: number
  readonly stickout: number
  readonly holder?: string
  /** The operations that run with this tool, in program order. */
  readonly operations: ReadonlyArray<string>
  /** Sum of the operation times with this tool, seconds. */
  readonly seconds: number
}

export interface SetupSheetOperation {
  readonly index: number
  readonly id: string
  readonly name: string
  readonly strategy: string
  readonly status: "ok" | "failed"
  readonly tool: number | undefined
  readonly seconds: number
  readonly cutLength: number
  readonly removedVolume: number
  readonly rpm?: number
  readonly feed?: number
  readonly ap?: number
  readonly ae?: number
  readonly warnings: ReadonlyArray<string>
}

export interface SetupSheetData {
  readonly title: string
  readonly jobId: string
  readonly release: CamArtifact["release"]
  readonly material: { readonly name: string; readonly iso: string }
  readonly machine: { readonly name: string; readonly post: string }
  readonly setup: {
    readonly orientation: string
    readonly workOffset: string
    /** Work zero in the oriented setup coordinates. */
    readonly origin: { readonly x: number; readonly y: number; readonly z: number }
    readonly stock: { readonly x: number; readonly y: number; readonly z: number }
  }
  readonly tools: ReadonlyArray<SetupSheetTool>
  readonly operations: ReadonlyArray<SetupSheetOperation>
  readonly totals: { readonly tools: number; readonly operations: number; readonly cycleSeconds: number; readonly cuttingSeconds: number; readonly removedVolume: number }
  readonly claims: ReadonlyArray<Claim>
  readonly notes: ReadonlyArray<string>
  readonly issues: ReadonlyArray<{ readonly severity: string; readonly message: string }>
  readonly identity: CamArtifact["identity"]
  /** The title block of the drawing the program belongs to: printed at the bottom right of the sheet, as on the drawing. */
  readonly titleBlock?: CompleteTitleBlock
}

export interface SetupSheetOptions {
  /** Heading of the sheet (default: the job id). */
  readonly title?: string
  /** The title block of the drawing the program belongs to. */
  readonly titleBlock?: CompleteTitleBlock
}

/** The sheet of a milling or turning program, or why the artifact has none. */
export const setupSheetData = (a: CamArtifact, options: SetupSheetOptions = {}): SetupSheetData | string => {
  if (a.print !== undefined) return "a printer program has a print report (layers, filament, time), not a setup sheet"
  const numberOf = new Map(a.tools.map((t) => [t.id, t.number] as const))
  const operations: SetupSheetOperation[] = a.operations.map((o: OperationOutcome, i) => ({
    index: i + 1, id: o.id, name: o.name, strategy: o.strategy, status: o.status, tool: numberOf.get(o.toolId),
    seconds: o.timeSeconds, cutLength: o.cutLength, removedVolume: o.removedVolume,
    ...(o.cutting !== undefined ? { rpm: o.cutting.rpm, feed: o.cutting.feed, ap: o.cutting.ap, ae: o.cutting.ae } : {}),
    warnings: o.warnings
  }))
  const tools: SetupSheetTool[] = [...a.tools].sort((x, y) => x.number - y.number).map((t: Cutter & { readonly number: number }) => {
    const mine = operations.filter((o) => o.tool === t.number)
    return {
      number: t.number, id: t.id, name: t.name, kind: t.kind, diameter: t.diameter, flutes: t.flutes, fluteLength: t.fluteLength,
      shankDiameter: t.shankDiameter, stickout: t.stickout, ...(t.holder !== undefined ? { holder: `holder Ø${t.holder.diameter} x ${t.holder.length}` } : {}),
      operations: mine.map((o) => o.id), seconds: mine.reduce((s, o) => s + o.seconds, 0)
    }
  })
  const size = { x: a.stockBounds.max.x - a.stockBounds.min.x, y: a.stockBounds.max.y - a.stockBounds.min.y, z: a.stockBounds.max.z - a.stockBounds.min.z }
  return {
    title: options.title ?? a.jobId, jobId: a.jobId, release: a.release,
    material: { name: a.material.name, iso: a.material.iso }, machine: { name: a.machine.name, post: a.machine.post },
    setup: { orientation: a.setupOrientation ?? "+Z", workOffset: a.program.workOffset, origin: a.origin, stock: size },
    tools, operations,
    totals: {
      tools: tools.length, operations: operations.length, cycleSeconds: a.cycleTimeSeconds,
      cuttingSeconds: operations.reduce((s, o) => s + o.seconds, 0), removedVolume: operations.reduce((s, o) => s + o.removedVolume, 0)
    },
    claims: a.claims, notes: a.notes, issues: a.issues.map((i) => ({ severity: i.severity, message: i.message })), identity: a.identity,
    ...(options.titleBlock !== undefined ? { titleBlock: options.titleBlock } : {})
  }
}

const ESC: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }
const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, (c) => ESC[c]!)
const f = (n: number, digits = 2): string => (Number.isFinite(n) ? n.toFixed(digits) : "-")
const time = (seconds: number): string => {
  const s = Math.round(seconds)
  return `${Math.floor(s / 3600) > 0 ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) > 0 ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`
}

/** The tool drawn to scale in a 70 x 110 box: cutting zone, shank above it, the stick-out as the height. */
const silhouette = (t: SetupSheetTool): string => {
  const height = Math.max(t.stickout, t.fluteLength, 1)
  const widest = Math.max(t.diameter, t.shankDiameter, 1)
  const k = Math.min(100 / height, 60 / widest)
  const cx = 35, bottom = 106
  const w = (d: number) => (d * k) / 2
  const flute = t.fluteLength * k, shank = Math.max(0, t.stickout - t.fluteLength) * k
  return `<svg viewBox="0 0 70 110" width="70" height="110" role="img" aria-label="${esc(t.name)}">` +
    `<rect x="${f(cx - w(t.diameter))}" y="${f(bottom - flute)}" width="${f(2 * w(t.diameter))}" height="${f(flute)}" class="cut"/>` +
    `<rect x="${f(cx - w(t.shankDiameter))}" y="${f(bottom - flute - shank)}" width="${f(2 * w(t.shankDiameter))}" height="${f(shank)}" class="shank"/></svg>`
}

const STYLE = `body{font:12px/1.4 system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:3px 6px;text-align:left;vertical-align:top}th{background:#eee}td.n,th.n{text-align:right}
.meta td{border:none;padding:1px 12px 1px 0}.cut{fill:#9bb}.shank{fill:#ccc}.passed{color:#060}.failed{color:#a00;font-weight:600}.unresolved,.unsupported{color:#870}
.titleblock{width:36em;margin:28px 0 0 auto;page-break-inside:avoid}.titleblock td{padding:1px 6px}.titleblock .l{display:block;font-size:8px;color:#666;text-transform:uppercase;letter-spacing:.04em}.titleblock .big{font-size:14px;font-weight:600}
.release{display:inline-block;padding:1px 8px;border:1px solid #333;border-radius:3px}code{font:11px ui-monospace,monospace;word-break:break-all}@media print{body{margin:10mm}}`

/** The drawing's title block as a table, the same rows the drawing office reads: identity, part, people, and the CAM fields when they hold something. */
const titleBlockHtml = (b: CompleteTitleBlock): string => {
  const cell = (label: string, key: TitleBlockKey, span = 1, big = false): string =>
    `<td colspan="${span}"><span class="l">${esc(label)}</span><span${big ? " class=\"big\"" : ""}>${esc(titleBlockText(b, key)) || "&nbsp;"}</span></td>`
  const cam = [b.machine, b.program, b.setup].some((v) => v !== "")
  return `<table class="titleblock" aria-label="Title block">` +
    `<tr>${cell("Owner", "owner", 2)}${cell("Type", "documentType")}${cell("Status", "status")}${cell("Mass", "mass")}${cell("Units", "units")}</tr>` +
    `<tr>${cell("Title", "title", 3, true)}${cell("Drawing no.", "number", 2, true)}${cell("Rev.", "revision", 1, true)}</tr>` +
    `<tr>${cell("Material", "material", 2)}${cell("Finish", "finish")}${cell("General tolerances", "standard", 2)}${cell("Sheet", "sheet")}</tr>` +
    `<tr>${cell("Created by", "createdBy", 2)}${cell("Checked by", "checkedBy", 2)}${cell("Approved by", "approvedBy", 1)}${cell("Date", "date")}</tr>` +
    (cam ? `<tr>${cell("Machine", "machine", 2)}${cell("Program", "program", 2)}${cell("Setup", "setup", 2)}</tr>` : "") + `</table>`
}

/** One self-contained HTML page for the sheet. */
export const setupSheetHtml = (d: SetupSheetData): string => {
  const rows = (cells: ReadonlyArray<string>, tag = "td") => `<tr>${cells.map((c) => `<${tag}${/^[-0-9:.]+$/.test(c) ? " class=\"n\"" : ""}>${c}</${tag}>`).join("")}</tr>`
  const tools = d.tools.map((t) => `<tr><td class="n">T${t.number}</td><td>${silhouette(t)}</td><td>${esc(t.name)}<br>${esc(t.kind)}${t.holder !== undefined ? `, ${esc(t.holder)}` : ""}</td>` +
    `<td class="n">${f(t.diameter)}</td><td class="n">${t.flutes}</td><td class="n">${f(t.fluteLength)}</td><td class="n">${f(t.stickout)}</td><td>${esc(t.operations.join(", "))}</td><td class="n">${time(t.seconds)}</td></tr>`).join("")
  const ops = d.operations.map((o) => rows([
    String(o.index), esc(o.name), esc(o.strategy), o.tool === undefined ? "-" : `T${o.tool}`,
    o.rpm === undefined ? "-" : f(o.rpm, 0), o.feed === undefined ? "-" : f(o.feed, 0), o.ap === undefined ? "-" : f(o.ap), o.ae === undefined ? "-" : f(o.ae),
    time(o.seconds), f(o.cutLength, 0), f(o.removedVolume, 0), o.status === "failed" ? "<span class=\"failed\">failed</span>" : "ok", esc(o.warnings.join("; "))
  ])).join("")
  const claims = d.claims.map((c) => `<tr><td>${esc(c.id)}</td><td class="${esc(c.status)}">${esc(c.status)}</td><td>${esc(c.detail)}</td></tr>`).join("")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)} - setup sheet</title><style>${STYLE}</style></head><body>` +
    `<h1>${esc(d.title)}</h1><p><span class="release">${esc(d.release)}</span></p>` +
    `<table class="meta"><tr><td>Material</td><td>${esc(d.material.name)} (ISO ${esc(d.material.iso)})</td><td>Machine</td><td>${esc(d.machine.name)}, post ${esc(d.machine.post)}</td></tr>` +
    `<tr><td>Setup</td><td>${esc(d.setup.orientation)} side up, ${esc(d.setup.workOffset)}</td><td>Work zero</td><td>X ${f(d.setup.origin.x)} Y ${f(d.setup.origin.y)} Z ${f(d.setup.origin.z)} (setup coordinates)</td></tr>` +
    `<tr><td>Stock</td><td>${f(d.setup.stock.x)} x ${f(d.setup.stock.y)} x ${f(d.setup.stock.z)} mm</td><td>Cycle time</td><td>${time(d.totals.cycleSeconds)} (cutting ${time(d.totals.cuttingSeconds)})</td></tr>` +
    `<tr><td>Tools</td><td>${d.totals.tools}</td><td>Operations</td><td>${d.totals.operations}, removal ${f(d.totals.removedVolume, 0)} mm³</td></tr></table>` +
    `<h2>Tools</h2><table><tr><th>Tool</th><th></th><th>Cutter</th><th class="n">Ø mm</th><th class="n">Flutes</th><th class="n">Flute mm</th><th class="n">Stick-out mm</th><th>Operations</th><th class="n">Cutting</th></tr>${tools}</table>` +
    `<h2>Operations</h2><table><tr><th class="n">#</th><th>Operation</th><th>Strategy</th><th>Tool</th><th class="n">rpm</th><th class="n">Feed</th><th class="n">ap</th><th class="n">ae</th><th class="n">Time</th><th class="n">Cut mm</th><th class="n">Removed mm³</th><th>Status</th><th>Warnings</th></tr>${ops}</table>` +
    `<h2>Evidence</h2><table><tr><th>Claim</th><th>Status</th><th>Detail</th></tr>${claims}</table>` +
    (d.notes.length > 0 ? `<h2>Notes</h2><ul>${d.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "") +
    (d.issues.length > 0 ? `<h2>Issues</h2><ul>${d.issues.map((i) => `<li>${esc(i.severity)}: ${esc(i.message)}</li>`).join("")}</ul>` : "") +
    `<h2>Identity</h2><p>Job <code>${esc(d.identity.job)}</code><br>Part <code>${esc(d.identity.part)}</code><br>NC <code>${esc(d.identity.nc)}</code><br>${esc(d.identity.algorithm)}</p>${d.titleBlock !== undefined ? titleBlockHtml(d.titleBlock) : ""}</body></html>`
}
