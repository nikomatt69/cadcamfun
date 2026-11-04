/**
 * Tool data exchange (spec 72 P4-9).
 *
 *  - ISO 13399 property set: `toIso13399` writes each kernel `Cutter` as a tool item with the standard property codes
 *    (DC cutting diameter, DCONMS connection diameter machine side, LF functional length, OAL overall length, LU usable length,
 *    APMX maximum depth of cut, ZEFP effective cutting edge count, RE corner radius) as XML; `fromIso13399` reads it back. Only
 *    those properties carry the standard code; the rest (kind, coating, material) are written as `CAD_` prefixed extension
 *    properties so a reader that knows only ISO 13399 ignores them instead of misreading them. This is the property exchange, not
 *    the full EXPRESS dictionary with the ECLASS/ISO 13399 class hierarchy.
 *  - Presetter export: `presetterCsv` writes the nominal values a presetter (Zoller / Haimer / Speroni class) needs per tool
 *    (pocket, ident, nominal diameter, length and radius with tolerances) as semicolon CSV; `readPresetterCsv` reads the measured
 *    values back and `applyPresetting` reports which tools are out of tolerance and which compensation to enter. The column set is
 *    generic: a vendor's own import profile may need its columns mapped (not verified against any vendor software).
 */
import type { Cutter } from "../kernel/cutters.ts"

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const unesc = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
const n = (v: number): string => String(Math.round(v * 1e6) / 1e6)

/** Usable length: what reaches below the holder face that is free of the shank. */
const usableLength = (c: Cutter): number => c.stickout

export const toIso13399 = (cutters: ReadonlyArray<Cutter>): string => {
  const items = cutters.map((c) => {
    const props: Array<[string, string, string?]> = [
      ["DC", n(c.diameter), "mm"], ["DCONMS", n(c.shankDiameter), "mm"], ["LF", n(c.stickout), "mm"], ["OAL", n(c.stickout + (c.holder?.length ?? 0)), "mm"],
      ["LU", n(usableLength(c)), "mm"], ["APMX", n(c.fluteLength), "mm"], ["ZEFP", String(c.flutes)]
    ]
    if (c.cornerRadius !== undefined) props.push(["RE", n(c.cornerRadius), "mm"])
    props.push(["CAD_KIND", c.kind], ["CAD_MATERIAL", c.material], ["CAD_COATING", c.coating])
    if (c.angle !== undefined) props.push(["CAD_ANGLE", n(c.angle), "deg"])
    if (c.pitch !== undefined) props.push(["CAD_PITCH", n(c.pitch), "mm"])
    if (c.tipDiameter !== undefined) props.push(["CAD_TIP_DIAMETER", n(c.tipDiameter), "mm"])
    if (c.neckDiameter !== undefined) props.push(["CAD_NECK_DIAMETER", n(c.neckDiameter), "mm"])
    if (c.headHeight !== undefined) props.push(["CAD_HEAD_HEIGHT", n(c.headHeight), "mm"])
    if (c.maxRpm !== undefined) props.push(["CAD_MAX_RPM", n(c.maxRpm)])
    return `  <ToolItem id="${esc(c.id)}" name="${esc(c.name)}">\n${props.map(([code, v, unit]) => `    <Property code="${code}"${unit !== undefined ? ` unit="${unit}"` : ""}>${esc(v)}</Property>`).join("\n")}\n  </ToolItem>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Iso13399 version="1">\n${items.join("\n")}\n</Iso13399>\n`
}

const KINDS = ["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver", "tap", "reamer", "countersink", "boringbar", "tslot", "dovetail"]

/** Reads `toIso13399` output. Throws a RangeError naming the tool and the missing/invalid property. */
export const fromIso13399 = (xml: string): ReadonlyArray<Cutter> => {
  const out: Cutter[] = []
  for (const m of xml.matchAll(/<ToolItem id="([^"]*)" name="([^"]*)">([\s\S]*?)<\/ToolItem>/g)) {
    const id = unesc(m[1]!)
    const p = new Map<string, string>()
    for (const q of m[3]!.matchAll(/<Property code="([^"]+)"(?: unit="[^"]*")?>([^<]*)<\/Property>/g)) p.set(q[1]!, unesc(q[2]!))
    const need = (code: string): number => {
      const v = p.get(code)
      const x = v === undefined ? NaN : Number(v)
      if (!Number.isFinite(x)) throw new RangeError(`ISO 13399 tool ${id}: property ${code} is missing or not a number`)
      return x
    }
    const kind = p.get("CAD_KIND")
    if (kind === undefined || !KINDS.includes(kind)) throw new RangeError(`ISO 13399 tool ${id}: CAD_KIND '${kind ?? ""}' is not a known cutter kind`)
    const opt = (code: string): number | undefined => (p.has(code) ? need(code) : undefined)
    const c: Cutter = {
      id, name: unesc(m[2]!), kind: kind as Cutter["kind"], diameter: need("DC"), flutes: need("ZEFP"),
      material: (p.get("CAD_MATERIAL") ?? "carbide") as Cutter["material"], coating: (p.get("CAD_COATING") ?? "none") as Cutter["coating"],
      fluteLength: need("APMX"), shankDiameter: need("DCONMS"), stickout: need("LF"),
      ...(opt("RE") !== undefined ? { cornerRadius: opt("RE")! } : {}), ...(opt("CAD_ANGLE") !== undefined ? { angle: opt("CAD_ANGLE")! } : {}),
      ...(opt("CAD_PITCH") !== undefined ? { pitch: opt("CAD_PITCH")! } : {}), ...(opt("CAD_TIP_DIAMETER") !== undefined ? { tipDiameter: opt("CAD_TIP_DIAMETER")! } : {}),
      ...(opt("CAD_NECK_DIAMETER") !== undefined ? { neckDiameter: opt("CAD_NECK_DIAMETER")! } : {}), ...(opt("CAD_HEAD_HEIGHT") !== undefined ? { headHeight: opt("CAD_HEAD_HEIGHT")! } : {}),
      ...(opt("CAD_MAX_RPM") !== undefined ? { maxRpm: opt("CAD_MAX_RPM")! } : {})
    }
    out.push(c)
  }
  return out
}

/* ------------------------------------------------------------------------------------------------------------ presetter */

export interface PresetterTolerance { readonly diameter: number; readonly length: number }

export const PRESETTER_HEADER = "pocket;ident;name;nominal_diameter;nominal_length;nominal_radius;tol_diameter;tol_length"

export const presetterCsv = (cutters: ReadonlyArray<Cutter>, tolerance: PresetterTolerance = { diameter: 0.02, length: 0.05 }): string => {
  const rows = cutters.map((c, i) => [c.number ?? i + 1, c.id, c.name.replace(/;/g, ","), n(c.diameter), n(c.stickout), n(c.diameter / 2), n(tolerance.diameter), n(tolerance.length)].join(";"))
  return `${PRESETTER_HEADER}\n${rows.join("\n")}\n`
}

export interface Measured { readonly ident: string; readonly diameter: number; readonly length: number }

export const readPresetterCsv = (csv: string): ReadonlyArray<Measured> => {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "")
  const head = lines[0]?.split(";") ?? []
  const col = (name: string): number => { const i = head.indexOf(name); if (i < 0) throw new RangeError(`presetter file: column '${name}' is missing`); return i }
  const [ci, cd, cl] = [col("ident"), col("measured_diameter"), col("measured_length")]
  return lines.slice(1).map((l, r) => {
    const f = l.split(";")
    const d = Number(f[cd]), len = Number(f[cl])
    if (!Number.isFinite(d) || !Number.isFinite(len)) throw new RangeError(`presetter file: row ${r + 2} has a measured value that is not a number`)
    return { ident: f[ci]!, diameter: d, length: len }
  })
}

export interface PresetResult {
  readonly ident: string
  readonly status: "ok" | "out-of-tolerance" | "unknown-tool"
  /** Measured minus nominal, mm. */
  readonly diameterError?: number
  readonly lengthError?: number
  /** What to enter: length offset (H) is the measured length, wear (D) is the radius difference. */
  readonly lengthOffset?: number
  readonly radiusWear?: number
}

/** Compares measured tools with the nominal ones and gives the offsets to enter; a tool outside tolerance is flagged, never silently accepted. */
export const applyPresetting = (cutters: ReadonlyArray<Cutter>, measured: ReadonlyArray<Measured>, tolerance: PresetterTolerance = { diameter: 0.02, length: 0.05 }): ReadonlyArray<PresetResult> =>
  measured.map((m) => {
    const c = cutters.find((x) => x.id === m.ident)
    if (c === undefined) return { ident: m.ident, status: "unknown-tool" as const }
    const diameterError = m.diameter - c.diameter
    const lengthError = m.length - c.stickout
    const ok = Math.abs(diameterError) <= tolerance.diameter + 1e-9 && Math.abs(lengthError) <= tolerance.length + 1e-9
    return { ident: m.ident, status: ok ? "ok" as const : "out-of-tolerance" as const, diameterError, lengthError, lengthOffset: m.length, radiusWear: diameterError / 2 }
  })
