/**
 * STEP AP242 semantic PMI codec subset (spec 50 X2): `DIMENSIONAL_SIZE`, `DIMENSIONAL_LOCATION`,
 * `GEOMETRIC_TOLERANCE`, `DATUM`, `SHAPE_ASPECT` plus an `ANNOTATION_OCCURRENCE` fallback text per annotation.
 * Pure text in/out so it round-trips without the B-rep writer; wiring into the full STEP writer is separate.
 */
import type { PmiAnnotation, PmiSet } from "./pmi.ts"
import { emptyPmiSet } from "./pmi.ts"

const esc = (s: string): string => s.replace(/'/g, "''")
const unesc = (s: string): string => s.replace(/''/g, "'")
const num = (n: number): string => String(n)

/** Fallback presentation text of one annotation (what a reader without semantic PMI still shows). */
export const pmiAnnotationText = (a: PmiAnnotation): string => {
  switch (a.kind) {
    case "dimensional-size": return `${a.nominal} +${a.upper}/${a.lower}`
    case "dimensional-location": return `${a.nominal} +${a.upper}/${a.lower}`
    case "geometric-tolerance": return `${a.gdt.kind} ${a.gdt.value}${a.gdt.datums?.length ? ` | ${a.gdt.datums.join(" | ")}` : ""}`
    case "datum": return `DATUM ${a.letter}`
    case "datum-target": return `DATUM TARGET ${a.letter} ${a.target}`
    case "surface-texture": return [a.ra !== undefined ? `Ra ${a.ra}` : "", a.rz !== undefined ? `Rz ${a.rz}` : "", a.lay ?? "", a.process ?? ""].filter(Boolean).join(" ")
    case "note": return a.text
  }
}

/** Serialises a PMI set as AP242-style instances. Refs become `SHAPE_ASPECT` names `kind:body|key`. */
export const pmiToStep = (set: PmiSet): string => {
  const lines: string[] = []
  let id = 1
  const next = () => id++
  const emit = (a: PmiAnnotation): void => {
    for (const r of a.refs) lines.push(`#${next()} = SHAPE_ASPECT('${esc(`${r.kind}:${r.body}|${r.key}`)}','${esc(a.id)}');`)
    const refs = `(${a.refs.map((r) => `'${esc(`${r.kind}:${r.body}|${r.key}`)}'`).join(",")})`
    switch (a.kind) {
      case "dimensional-size": lines.push(`#${next()} = DIMENSIONAL_SIZE('${esc(a.id)}',${num(a.nominal)},${num(a.upper)},${num(a.lower)},${refs});`); break
      case "dimensional-location": lines.push(`#${next()} = DIMENSIONAL_LOCATION('${esc(a.id)}',${num(a.nominal)},${num(a.upper)},${num(a.lower)},${refs});`); break
      case "geometric-tolerance":
        lines.push(`#${next()} = GEOMETRIC_TOLERANCE('${esc(a.id)}','${esc(a.gdt.kind)}',${num(a.gdt.value)},${a.gdt.diameter === true ? ".T." : ".F."},'${esc(a.gdt.modifier ?? "")}',(${ (a.gdt.datums ?? []).map((d) => `'${esc(d)}'`).join(",")}),${refs});`)
        break
      case "datum": lines.push(`#${next()} = DATUM('${esc(a.id)}','${esc(a.letter)}',${refs});`); break
      case "datum-target": lines.push(`#${next()} = DATUM_TARGET('${esc(a.id)}','${esc(a.letter)}','${esc(a.target)}',${refs});`); break
      case "surface-texture": lines.push(`#${next()} = SURFACE_TEXTURE('${esc(a.id)}',${a.ra === undefined ? "$" : num(a.ra)},${a.rz === undefined ? "$" : num(a.rz)},'${esc(a.lay ?? "")}','${esc(a.process ?? "")}',${refs});`); break
      case "note": lines.push(`#${next()} = PMI_NOTE('${esc(a.id)}','${esc(a.text)}',${refs});`); break
    }
    lines.push(`#${next()} = ANNOTATION_OCCURRENCE('${esc(a.id)}','${esc(pmiAnnotationText(a))}');`)
  }
  for (const capture of set.captures) {
    lines.push(`#${next()} = PMI_CAPTURE('${esc(capture.id)}','${esc(capture.name)}');`)
    for (const a of set.annotations.filter((x) => x.captureId === capture.id)) emit(a)
  }
  for (const a of set.annotations.filter((x) => !set.captures.some((c) => c.id === x.captureId))) emit(a)
  return lines.join("\n") + (lines.length ? "\n" : "")
}

const strArgs = (body: string): string[] => [...body.matchAll(/'((?:[^']|'')*)'/g)].map((m) => unesc(m[1]!))
const refList = (body: string): PmiAnnotation["refs"] => {
  const m = /\(([^()]*)\)\s*\)?\s*$/.exec(body)
  if (!m) return []
  return strArgs(m[1]!).flatMap((s) => {
    const mm = /^(face|edge|vertex):([^|]*)\|(.+)$/.exec(s)
    return mm ? [{ body: mm[2]!, kind: mm[1] as "face" | "edge" | "vertex", key: mm[3]! }] : []
  })
}

/** Parses the subset written by `pmiToStep`. Unknown instances are ignored; captures are rebuilt from annotation capture ids lost in STEP (all go to the first capture, else a default). */
export const stepToPmi = (text: string): PmiSet => {
  const annotations: PmiAnnotation[] = []
  const captureNames = new Map<string, string>()
  let defaultCapture = "capture-1"
  for (const line of text.split(/\r?\n/)) {
    const m = /^#\d+\s*=\s*([A-Z_]+)\((.*)\);\s*$/.exec(line.trim())
    if (!m) continue
    const [, entity, body] = m as unknown as [string, string, string]
    const strs = strArgs(body)
    const nums = [...body.replace(/'((?:[^']|'')*)'/g, "''").matchAll(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)].map((x) => Number(x[0]))
    const refs = refList(body)
    const captureId = defaultCapture
    switch (entity) {
      case "PMI_CAPTURE": if (strs[0]) { captureNames.set(strs[0], strs[1] ?? strs[0]); defaultCapture = strs[0] } break
      case "DIMENSIONAL_SIZE": annotations.push({ id: strs[0] ?? "", captureId, refs, kind: "dimensional-size", nominal: nums[0] ?? 0, upper: nums[1] ?? 0, lower: nums[2] ?? 0, unit: "mm" }); break
      case "DIMENSIONAL_LOCATION": annotations.push({ id: strs[0] ?? "", captureId, refs, kind: "dimensional-location", nominal: nums[0] ?? 0, upper: nums[1] ?? 0, lower: nums[2] ?? 0 }); break
      case "GEOMETRIC_TOLERANCE": {
        const datums = strs.slice(3).filter((s) => /^[A-Z]$/.test(s))
        annotations.push({ id: strs[0] ?? "", captureId, refs, kind: "geometric-tolerance", gdt: { kind: (strs[1] ?? "flatness") as never, value: nums[0] ?? 0, ...(body.includes(".T.") ? { diameter: true } : {}), ...(strs[2] ? { modifier: strs[2] as "M" | "L" } : {}), ...(datums.length ? { datums } : {}) } })
        break
      }
      case "DATUM": annotations.push({ id: strs[0] ?? "", captureId, refs, kind: "datum", letter: strs[1] ?? "A" }); break
      case "DATUM_TARGET": annotations.push({ id: strs[0] ?? "", captureId, refs, kind: "datum-target", letter: strs[1] ?? "A", target: strs[2] ?? "" }); break
      case "SURFACE_TEXTURE": annotations.push({ id: strs[0] ?? "", captureId, refs, kind: "surface-texture", ...(nums[0] !== undefined ? { ra: nums[0] } : {}), ...(nums[1] !== undefined ? { rz: nums[1] } : {}), ...(strs[1] ? { lay: strs[1] } : {}), ...(strs[2] ? { process: strs[2] } : {}) }); break
      case "PMI_NOTE": annotations.push({ id: strs[0] ?? "", captureId, refs, kind: "note", text: strs[1] ?? "" }); break
      default: break
    }
  }
  if (annotations.length === 0 && captureNames.size === 0) return emptyPmiSet()
  const used = [...new Set(annotations.map((a) => a.captureId))]
  const captures = (used.length ? used : [...captureNames.keys()]).map((id) => ({
    id, name: captureNames.get(id) ?? id, annotationIds: annotations.filter((a) => a.captureId === id).map((a) => a.id)
  }))
  // Annotations parsed before their capture line still belong to the first declared capture.
  return { version: 1, annotations, captures }
}
