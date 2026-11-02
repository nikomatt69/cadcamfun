/**
 * Semantic PMI / MBD (spec 49 P1, spec 50 X2): 3D annotations attached to B-rep entities by persistent
 * topological refs (spec 41), grouped into captures. Pure data + validation + fingerprint; rendering reuses
 * `drawing/gdt.ts` and `drawing/dimensions.ts`, STEP coding lives in `step-pmi.ts`.
 */
import type { Ref } from "../cad/brep/naming-keys.ts"
import { fmtTol, validateGdt, type GdtSpec } from "../drawing/gdt.ts"
import { toleranceText } from "../drawing/dimensions.ts"
import { digestOf } from "../cam/kernel/identity.ts"

export type PmiRef = Ref

export interface PmiPlane {
  readonly origin: readonly [number, number, number]
  readonly normal: readonly [number, number, number]
  readonly up: readonly [number, number, number]
}

export interface PmiAnnotationBase {
  readonly id: string
  readonly captureId: string
  readonly refs: readonly PmiRef[]
  readonly plane?: PmiPlane
  readonly note?: string
}

export type PmiAnnotation =
  | (PmiAnnotationBase & { readonly kind: "dimensional-size"; readonly nominal: number; readonly upper: number; readonly lower: number; readonly unit?: "mm" })
  | (PmiAnnotationBase & { readonly kind: "dimensional-location"; readonly nominal: number; readonly upper: number; readonly lower: number })
  | (PmiAnnotationBase & { readonly kind: "geometric-tolerance"; readonly gdt: GdtSpec })
  | (PmiAnnotationBase & { readonly kind: "datum"; readonly letter: string })
  | (PmiAnnotationBase & { readonly kind: "datum-target"; readonly letter: string; readonly target: string })
  | (PmiAnnotationBase & { readonly kind: "surface-texture"; readonly ra?: number; readonly rz?: number; readonly lay?: string; readonly process?: string })
  | (PmiAnnotationBase & { readonly kind: "note"; readonly text: string })

export interface PmiCapture {
  readonly id: string
  readonly name: string
  readonly annotationIds: readonly string[]
  readonly orientation?: string
}

export interface PmiSet {
  readonly version: 1
  readonly annotations: readonly PmiAnnotation[]
  readonly captures: readonly PmiCapture[]
}

export interface PmiIssue {
  readonly annotationId?: string
  readonly code: string
  readonly message: string
}

export const emptyPmiSet = (): PmiSet => ({ version: 1, annotations: [], captures: [] })

const KINDS = new Set(["dimensional-size", "dimensional-location", "geometric-tolerance", "datum", "datum-target", "surface-texture", "note"])
const REF_KINDS = new Set(["face", "edge", "vertex"])
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)
const vecOk = (v: readonly number[]): boolean => v.length === 3 && v.every(finite) && v.some((x) => x !== 0)

const refProblem = (r: PmiRef): string | undefined => {
  if (r === null || typeof r !== "object") return "a ref must be an object"
  if (typeof r.body !== "string" || r.body.trim() === "") return "a ref needs a non-empty body"
  if (!REF_KINDS.has(r.kind)) return "a ref kind must be face, edge or vertex"
  if (typeof r.key !== "string" || r.key.trim() === "") return "a ref needs a non-empty key"
  return undefined
}

/**
 * Every problem in a PMI set, never throwing on invalid user data. `knownDatumLetters` optionally names datum
 * letters defined outside this set (e.g. on the drawing) that GD&T / datum-target references may use.
 */
export const validatePmiSet = (set: PmiSet, knownDatumLetters?: readonly string[]): readonly PmiIssue[] => {
  const issues: PmiIssue[] = []
  const push = (code: string, message: string, annotationId?: string) =>
    issues.push(annotationId === undefined ? { code, message } : { annotationId, code, message })
  if (set === null || typeof set !== "object") return [{ code: "pmi-not-object", message: "The PMI set must be an object" }]
  if (set.version !== 1) push("bad-version", "The PMI set version must be 1")
  const annotations = Array.isArray(set.annotations) ? set.annotations : []
  const captures = Array.isArray(set.captures) ? set.captures : []
  if (!Array.isArray(set.annotations)) push("bad-annotations", "annotations must be an array")
  if (!Array.isArray(set.captures)) push("bad-captures", "captures must be an array")

  const captureIds = new Set<string>()
  for (const c of captures) {
    if (c === null || typeof c !== "object" || typeof c.id !== "string" || c.id.trim() === "") { push("bad-capture-id", "Every capture needs a non-empty id"); continue }
    if (captureIds.has(c.id)) push("duplicate-capture", `Capture '${c.id}' is defined twice`)
    captureIds.add(c.id)
    if (typeof c.name !== "string" || c.name.trim() === "") push("bad-capture-name", `Capture '${c.id}' needs a name`)
  }

  const ids = new Set<string>()
  const datumLetters = new Set<string>(knownDatumLetters ?? [])
  for (const a of annotations) {
    if (a === null || typeof a !== "object" || typeof a.id !== "string" || a.id.trim() === "") { push("bad-annotation-id", "Every annotation needs a non-empty id"); continue }
    if (ids.has(a.id)) push("duplicate-annotation", `Annotation '${a.id}' is defined twice`, a.id)
    ids.add(a.id)
    if (a.kind === "datum") {
      if (typeof a.letter !== "string" || !/^[A-Z]$/.test(a.letter)) push("bad-datum-letter", "A datum letter is one capital letter", a.id)
      else if (datumLetters.has(a.letter) && !(knownDatumLetters ?? []).includes(a.letter)) push("duplicate-datum", `Datum '${a.letter}' is defined twice`, a.id)
      else datumLetters.add(a.letter)
    }
  }

  for (const a of annotations) {
    if (a === null || typeof a !== "object" || typeof a.id !== "string") continue
    if (!KINDS.has(a.kind)) { push("bad-kind", `Unknown annotation kind '${String(a.kind)}'`, a.id); continue }
    if (!captureIds.has(a.captureId)) push("unknown-capture", `Annotation '${a.id}' names unknown capture '${String(a.captureId)}'`, a.id)
    if (!Array.isArray(a.refs)) push("bad-refs", "refs must be an array", a.id)
    else {
      if (a.refs.length === 0 && a.kind !== "note") push("no-refs", "An annotation needs at least one topological ref", a.id)
      a.refs.forEach((r: PmiRef, i: number) => { const p = refProblem(r); if (p !== undefined) push("bad-ref", `refs[${i}]: ${p}`, a.id) })
    }
    if (a.plane !== undefined) {
      const p = a.plane
      if (p === null || typeof p !== "object" || !vecOk(p.origin ?? []) || !vecOk(p.normal ?? []) || !vecOk(p.up ?? []))
        push("bad-plane", "A plane needs finite origin, normal and up vectors", a.id)
      else {
        const dot = p.normal[0] * p.up[0] + p.normal[1] * p.up[1] + p.normal[2] * p.up[2]
        const nl = Math.hypot(...p.normal), ul = Math.hypot(...p.up)
        if (Math.abs(dot) > 1e-6 * nl * ul) push("bad-plane", "A plane normal and up must be perpendicular", a.id)
      }
    }
    switch (a.kind) {
      case "dimensional-size":
      case "dimensional-location": {
        if (!finite(a.nominal)) push("bad-nominal", "The nominal must be finite", a.id)
        if (a.kind === "dimensional-size" && finite(a.nominal) && a.nominal <= 0) push("bad-nominal", "A size nominal must be positive", a.id)
        if (!finite(a.upper) || !finite(a.lower)) push("bad-tolerance", "Tolerance bounds must be finite", a.id)
        else if (a.upper < a.lower) push("bad-tolerance", "The upper tolerance must not be below the lower tolerance", a.id)
        if (a.kind === "dimensional-size" && a.unit !== undefined && a.unit !== "mm") push("bad-unit", "Only mm is supported", a.id)
        break
      }
      case "geometric-tolerance": {
        if (a.gdt === null || typeof a.gdt !== "object") { push("bad-gdt", "A geometric tolerance needs a GdtSpec", a.id); break }
        const err = validateGdt(a.gdt)
        if (err !== undefined) push("bad-gdt", err, a.id)
        for (const d of a.gdt.datums ?? []) if (!datumLetters.has(d)) push("unknown-datum", `Datum '${d}' is not defined by a datum annotation`, a.id)
        break
      }
      case "datum": break
      case "datum-target": {
        if (typeof a.letter !== "string" || !/^[A-Z]$/.test(a.letter)) push("bad-datum-letter", "A datum-target letter is one capital letter", a.id)
        else if (!datumLetters.has(a.letter)) push("unknown-datum", `Datum '${a.letter}' is not defined by a datum annotation`, a.id)
        if (typeof a.target !== "string" || a.target.trim() === "") push("bad-datum-target", "A datum target needs a target name", a.id)
        break
      }
      case "surface-texture": {
        if (a.ra !== undefined && (!finite(a.ra) || a.ra < 0)) push("bad-texture", "Ra must be zero or more", a.id)
        if (a.rz !== undefined && (!finite(a.rz) || a.rz < 0)) push("bad-texture", "Rz must be zero or more", a.id)
        break
      }
      case "note":
        if (typeof a.text !== "string" || a.text.trim() === "") push("bad-note", "A note needs text", a.id)
        break
    }
  }

  for (const c of captures) {
    if (c === null || typeof c !== "object" || !Array.isArray(c.annotationIds)) { if (c !== null && typeof c === "object") push("bad-capture-annotations", `Capture '${c.id}' annotationIds must be an array`); continue }
    const seen = new Set<string>()
    for (const id of c.annotationIds) {
      if (seen.has(id)) push("duplicate-capture-annotation", `Capture '${c.id}' lists '${id}' twice`)
      seen.add(id)
      if (!ids.has(id)) push("unknown-annotation", `Capture '${c.id}' names unknown annotation '${id}'`)
    }
    for (const a of annotations) if (a !== null && typeof a === "object" && a.captureId === c.id && !seen.has(a.id))
      push("capture-mismatch", `Annotation '${a.id}' belongs to capture '${c.id}' but is not listed in it`, a.id)
  }
  return issues
}

/** Server check for `data.pmi` of a drawing, mirroring `titleBlockErrors`: messages only, `undefined` is fine. */
export const pmiErrors = (stored: unknown): readonly string[] => {
  if (stored === undefined) return []
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return ["The PMI set must be an object"]
  return validatePmiSet(stored as PmiSet).map((i) => i.message)
}

/** The stored `pmi` field of a drawing document, or an empty set when absent/damaged in shape. */
export const pmiSetOf = (data: unknown): PmiSet => {
  const raw = data !== null && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>)["pmi"] : undefined
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return emptyPmiSet()
  const s = raw as Partial<PmiSet>
  return { version: 1, annotations: Array.isArray(s.annotations) ? s.annotations : [], captures: Array.isArray(s.captures) ? s.captures : [] }
}

const refKey = (r: PmiRef): string => `${r.kind}:${r.body}|${r.key}`

/**
 * Geometry-independent manufacturing fingerprint: annotation kinds, values, tolerances, GD&T, datum letters,
 * surface texture, notes and referenced topological keys, sorted by id. Plane, capture names and order are excluded.
 */
export const pmiFingerprint = (set: PmiSet): string => {
  const rows = [...(set.annotations ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map((a) => {
    const base = { id: a.id, kind: a.kind, refs: [...(a.refs ?? [])].map(refKey).sort() }
    switch (a.kind) {
      case "dimensional-size": return { ...base, nominal: a.nominal, upper: a.upper, lower: a.lower }
      case "dimensional-location": return { ...base, nominal: a.nominal, upper: a.upper, lower: a.lower }
      case "geometric-tolerance": return { ...base, gdt: a.gdt }
      case "datum": return { ...base, letter: a.letter }
      case "datum-target": return { ...base, letter: a.letter, target: a.target }
      case "surface-texture": return { ...base, ra: a.ra ?? null, rz: a.rz ?? null, lay: a.lay ?? null, process: a.process ?? null }
      case "note": return { ...base, text: a.text }
      default: return base
    }
  })
  return digestOf("pmi/set@1", rows)
}

// ---------------------------------------------------------------- drawing derivation

export interface PmiDrawingDimension { readonly annotationId: string; readonly kind: "dimensional-size" | "dimensional-location"; readonly nominal: number; readonly text: string }
export interface PmiDrawingGdt { readonly annotationId: string; readonly spec: GdtSpec; readonly text: string }
export interface PmiDrawingData {
  readonly dimensions: readonly PmiDrawingDimension[]
  readonly gdt: readonly PmiDrawingGdt[]
  readonly datums: readonly { readonly annotationId: string; readonly letter: string }[]
  readonly datumTargets: readonly { readonly annotationId: string; readonly letter: string; readonly target: string }[]
  readonly surfaceTextures: readonly { readonly annotationId: string; readonly text: string }[]
  readonly notes: readonly { readonly annotationId: string; readonly text: string }[]
}

/** Dimension callout text for one dimensional annotation, reusing the drawing tolerance wording. */
export const pmiDimensionText = (a: Extract<PmiAnnotation, { kind: "dimensional-size" | "dimensional-location" }>): string =>
  `${a.nominal}${toleranceText({ upper: a.upper, lower: a.lower })}`

/** Maps PMI annotations to the data `drawing/sheet.ts` already renders (GdtSpec frames, dimension text): no forked GD&T. */
export const pmiDrawingData = (set: PmiSet): PmiDrawingData => {
  const dimensions: PmiDrawingDimension[] = [], gdt: PmiDrawingGdt[] = [], datums: PmiDrawingData["datums"][number][] = [],
    datumTargets: PmiDrawingData["datumTargets"][number][] = [], surfaceTextures: PmiDrawingData["surfaceTextures"][number][] = [],
    notes: PmiDrawingData["notes"][number][] = []
  for (const a of set.annotations) {
    switch (a.kind) {
      case "dimensional-size": case "dimensional-location": dimensions.push({ annotationId: a.id, kind: a.kind, nominal: a.nominal, text: pmiDimensionText(a) }); break
      case "geometric-tolerance": gdt.push({ annotationId: a.id, spec: a.gdt, text: fmtTol(a.gdt) }); break
      case "datum": datums.push({ annotationId: a.id, letter: a.letter }); break
      case "datum-target": datumTargets.push({ annotationId: a.id, letter: a.letter, target: a.target }); break
      case "surface-texture": surfaceTextures.push({ annotationId: a.id, text: [a.ra !== undefined ? `Ra ${a.ra}` : "", a.rz !== undefined ? `Rz ${a.rz}` : "", a.lay ?? "", a.process ?? ""].filter(Boolean).join(" ") }); break
      case "note": notes.push({ annotationId: a.id, text: a.text }); break
    }
  }
  return { dimensions, gdt, datums, datumTargets, surfaceTextures, notes }
}
