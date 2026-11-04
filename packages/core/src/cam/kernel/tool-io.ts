/**
 * Tool data in and out (spec 69 D3): CSV tool lists, an ISO 13399 property XML subset and the presetter list.
 *
 *  - CSV: one cutter per row, the columns below; quoted fields, `""` for a quote, comma or semicolon separated (detected from the
 *    header), `.` or `,` decimals in semicolon files. Every row goes through `cutterIssues`; a bad row is reported with its line and
 *    left out, the good rows are kept.
 *  - ISO 13399 XML subset: `<Tool>` elements holding `<Property code="DC" unit="mm">6</Property>`. Standard property codes carry the
 *    standard quantities (DC cutting diameter, DCONMS connection diameter, LF functional length, APMX maximum depth of cut, NOF number of
 *    effective cutting edges, RE corner radius); what ISO 13399 has no single code for travels under `X_` codes so a round trip keeps
 *    every field. The full GTC / part-21 EXPRESS binding is NOT implemented: a part-21 file (`ISO-10303-21;`) is refused with that
 *    reason rather than half read. Entities are decoded only for the five XML escapes; there is no DTD or external entity handling.
 *  - Presetter list: the tool numbers with the nominal diameter and length a tool presetter measures against.
 */
import { cutterIssues, type Coating, type Cutter, type CutterKind, type ToolMaterial } from "./cutters.ts"

export const CUTTER_KINDS: ReadonlyArray<CutterKind> = ["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver", "tap", "reamer", "countersink", "boringbar", "tslot", "dovetail", "tapered", "lollipop", "barrel", "lens"]
const MATERIALS: ReadonlyArray<ToolMaterial> = ["hss", "hss-co", "carbide", "pcd"]
const COATINGS: ReadonlyArray<Coating> = ["none", "tin", "ticn", "altin", "alcrn", "zrn", "dlc", "diamond"]

export interface ToolIoIssue { readonly where: string; readonly message: string }
export interface ToolImport { readonly cutters: ReadonlyArray<Cutter>; readonly issues: ReadonlyArray<ToolIoIssue> }

// ---------------------------------------------------------------- CSV

const COLUMNS = ["id", "name", "kind", "diameter", "flutes", "material", "coating", "cornerRadius", "angle", "tipDiameter", "pitch", "neckDiameter", "formRadius", "headHeight", "fluteLength", "shankDiameter", "stickout", "holderDiameter", "holderLength", "maxRpm", "number"] as const
export const CSV_COLUMNS: ReadonlyArray<string> = COLUMNS

const quote = (v: string): string => (/[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** The cutters as CSV (comma separated, `.` decimals, header row). Holder steps are not part of the CSV format. */
export const cuttersToCsv = (cutters: ReadonlyArray<Cutter>): string => {
  const row = (c: Cutter): string => COLUMNS.map((k) => {
    const v = k === "holderDiameter" ? c.holder?.diameter : k === "holderLength" ? c.holder?.length : (c as unknown as Record<string, unknown>)[k]
    return v === undefined ? "" : quote(String(v))
  }).join(",")
  return [COLUMNS.join(","), ...cutters.map(row)].join("\n") + "\n"
}

/** Splits CSV text into rows of fields (RFC 4180 quoting). */
const splitCsv = (text: string, sep: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = [], field = "", quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false } else field += ch
    } else if (ch === '"' && field === "") quoted = true
    else if (ch === sep) { row.push(field); field = "" }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(field); field = ""
      if (row.some((f) => f.trim() !== "")) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((f) => f.trim() !== "")) rows.push(row)
  return rows
}

const num = (v: string | undefined, sep: string): number | undefined => {
  if (v === undefined || v.trim() === "") return undefined
  const n = Number(sep === ";" ? v.trim().replace(",", ".") : v.trim())
  return Number.isFinite(n) ? n : NaN
}

/** Builds a cutter from named string fields (shared by the CSV and XML readers). Pushes a message per problem. */
const build = (where: string, f: (k: string) => string | undefined, parse: (v: string | undefined) => number | undefined, issues: ToolIoIssue[]): Cutter | undefined => {
  const bad = (m: string): undefined => { issues.push({ where, message: m }); return undefined }
  const id = f("id")?.trim()
  if (!id) return bad("missing id")
  const kind = f("kind")?.trim() as CutterKind | undefined
  if (kind === undefined || !CUTTER_KINDS.includes(kind)) return bad(`${id}: unknown kind '${kind ?? ""}' (one of ${CUTTER_KINDS.join(", ")})`)
  const material = (f("material")?.trim() || "carbide") as ToolMaterial
  if (!MATERIALS.includes(material)) return bad(`${id}: unknown material '${material}'`)
  const coating = (f("coating")?.trim() || "none") as Coating
  if (!COATINGS.includes(coating)) return bad(`${id}: unknown coating '${coating}'`)
  const n = (k: string): number | undefined => parse(f(k))
  for (const k of ["diameter", "flutes", "fluteLength", "shankDiameter", "stickout", "cornerRadius", "angle", "tipDiameter", "pitch", "neckDiameter", "formRadius", "headHeight", "holderDiameter", "holderLength", "maxRpm", "number"]) {
    if (Number.isNaN(n(k))) return bad(`${id}: '${k}' is not a number`)
  }
  const diameter = n("diameter"), flutes = n("flutes"), fluteLength = n("fluteLength"), shankDiameter = n("shankDiameter") ?? diameter, stickout = n("stickout")
  if (diameter === undefined || flutes === undefined || fluteLength === undefined || stickout === undefined || shankDiameter === undefined) return bad(`${id}: diameter, flutes, fluteLength and stickout are required`)
  const opt = <K extends string>(k: K): { [P in K]?: number } => { const v = n(k); return (v === undefined ? {} : { [k]: v }) as { [P in K]?: number } }
  const hd = n("holderDiameter"), hl = n("holderLength")
  const cutter: Cutter = {
    id, name: f("name")?.trim() || id, kind, diameter, flutes, material, coating, fluteLength, shankDiameter, stickout,
    ...opt("cornerRadius"), ...opt("angle"), ...opt("tipDiameter"), ...opt("pitch"), ...opt("neckDiameter"), ...opt("formRadius"), ...opt("headHeight"), ...opt("maxRpm"), ...opt("number"),
    ...(hd !== undefined && hl !== undefined ? { holder: { diameter: hd, length: hl } } : {})
  }
  const problems = cutterIssues(cutter)
  if (problems.length > 0) { for (const p of problems) issues.push({ where, message: p }); return undefined }
  return cutter
}

/** Reads a CSV tool list. The header row names the columns (any order, unknown columns ignored). */
export const cuttersFromCsv = (text: string): ToolImport => {
  const issues: ToolIoIssue[] = []
  const head = text.split(/\r?\n/, 1)[0] ?? ""
  const sep = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows = splitCsv(text.replace(/^﻿/, ""), sep)
  if (rows.length === 0) return { cutters: [], issues: [{ where: "csv", message: "the file is empty" }] }
  const header = rows[0]!.map((h) => h.trim())
  if (!header.includes("id") || !header.includes("kind")) return { cutters: [], issues: [{ where: "line 1", message: "the header needs at least the columns id and kind" }] }
  const cutters: Cutter[] = []
  const seen = new Set<string>()
  rows.slice(1).forEach((r, i) => {
    const where = `row ${i + 2}`
    const get = (k: string): string | undefined => { const at = header.indexOf(k); return at < 0 ? undefined : r[at] }
    const c = build(where, get, (v) => num(v, sep), issues)
    if (c === undefined) return
    if (seen.has(c.id)) { issues.push({ where, message: `${c.id}: duplicate id` }); return }
    seen.add(c.id)
    cutters.push(c)
  })
  return { cutters, issues }
}

// ---------------------------------------------------------------- ISO 13399 property XML subset

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
const unesc = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")

/** field -> (ISO 13399 property code, unit) */
const ISO: ReadonlyArray<readonly [keyof Cutter | "holderDiameter" | "holderLength", string, string]> = [
  ["diameter", "DC", "mm"], ["shankDiameter", "DCONMS", "mm"], ["stickout", "LF", "mm"], ["fluteLength", "APMX", "mm"], ["flutes", "NOF", ""], ["cornerRadius", "RE", "mm"],
  ["angle", "X_ANGLE", "deg"], ["tipDiameter", "X_TIPDIAMETER", "mm"], ["pitch", "X_PITCH", "mm"], ["neckDiameter", "X_NECKDIAMETER", "mm"], ["formRadius", "X_FORMRADIUS", "mm"], ["headHeight", "X_HEADHEIGHT", "mm"],
  ["holderDiameter", "X_HOLDERDIAMETER", "mm"], ["holderLength", "X_HOLDERLENGTH", "mm"], ["maxRpm", "X_MAXRPM", "rpm"], ["number", "X_NUMBER", ""]
]

export const cuttersToIso13399Xml = (cutters: ReadonlyArray<Cutter>): string => {
  const tool = (c: Cutter): string => {
    const props: string[] = [`    <Property code="X_KIND">${esc(c.kind)}</Property>`, `    <Property code="X_MATERIAL">${esc(c.material)}</Property>`, `    <Property code="X_COATING">${esc(c.coating)}</Property>`]
    for (const [field, code, unit] of ISO) {
      const v = field === "holderDiameter" ? c.holder?.diameter : field === "holderLength" ? c.holder?.length : (c as unknown as Record<string, unknown>)[field]
      if (v !== undefined) props.push(`    <Property code="${code}"${unit ? ` unit="${unit}"` : ""}>${v}</Property>`)
    }
    return `  <Tool id="${esc(c.id)}" name="${esc(c.name)}">\n${props.join("\n")}\n  </Tool>`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Iso13399Tools version="subset-1">\n${cutters.map(tool).join("\n")}\n</Iso13399Tools>\n`
}

export const cuttersFromIso13399Xml = (text: string): ToolImport => {
  if (/^\s*ISO-10303-21\s*;/.test(text)) {
    return { cutters: [], issues: [{ where: "file", message: "ISO 10303-21 (part 21 / GTC EXPRESS) files are not supported: export the tool data as the ISO 13399 property XML or CSV" }] }
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { cutters: [], issues: [{ where: "file", message: "DTDs and entity declarations are refused" }] }
  const issues: ToolIoIssue[] = []
  const cutters: Cutter[] = []
  const seen = new Set<string>()
  const tools = [...text.matchAll(/<Tool\b([^>]*)>([\s\S]*?)<\/Tool>/g)]
  if (tools.length === 0) return { cutters: [], issues: [{ where: "file", message: "no <Tool> element found" }] }
  tools.forEach((m, i) => {
    const attrs = (name: string): string | undefined => { const a = new RegExp(`\\b${name}="([^"]*)"`).exec(m[1]!); return a === null ? undefined : unesc(a[1]!) }
    const props = new Map<string, string>()
    for (const p of m[2]!.matchAll(/<Property\b([^>]*)>([^<]*)<\/Property>/g)) {
      const code = /\bcode="([^"]*)"/.exec(p[1]!)?.[1]
      if (code !== undefined) props.set(code, unesc(p[2]!.trim()))
    }
    const get = (k: string): string | undefined => {
      if (k === "id") return attrs("id")
      if (k === "name") return attrs("name")
      if (k === "kind") return props.get("X_KIND")
      if (k === "material") return props.get("X_MATERIAL")
      if (k === "coating") return props.get("X_COATING")
      const code = ISO.find(([f]) => f === k)?.[1]
      return code === undefined ? undefined : props.get(code)
    }
    const where = `tool ${i + 1}`
    // A file from a CAM system without our kind code: a tool with a corner radius is read as a bull nose, without as a flat end mill.
    const patched = (k: string): string | undefined => (k === "kind" && get("kind") === undefined ? (props.has("RE") ? "bull" : "flat") : get(k))
    const c = build(where, patched, (v) => (v === undefined || v === "" ? undefined : Number(v)), issues)
    if (c === undefined) return
    if (seen.has(c.id)) { issues.push({ where, message: `${c.id}: duplicate id` }); return }
    seen.add(c.id)
    cutters.push(c)
  })
  return { cutters, issues }
}

// ---------------------------------------------------------------- presetter list

/**
 * The presetter list: one row per tool number with the nominal values the presetter measures against (cutting diameter, the length from
 * the gauge line to the tip as the holder is set up, flute length) and the holder. Tools without a pocket number are listed last without one.
 * Semicolon separated with `.` decimals, the layout most presetter software imports.
 */
export const presetterList = (cutters: ReadonlyArray<Cutter>): string => {
  const sorted = [...cutters].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.id.localeCompare(b.id))
  const head = ["T", "ID", "Name", "Kind", "DC", "LF", "APMX", "NOF", "Holder"].join(";")
  const rows = sorted.map((c) => [c.number ?? "", c.id, c.name, c.kind, c.diameter, c.stickout, c.fluteLength, c.flutes, c.holder === undefined ? "" : `D${c.holder.diameter}xL${c.holder.length}`].map((v) => quote(String(v))).join(";"))
  return [head, ...rows].join("\n") + "\n"
}
