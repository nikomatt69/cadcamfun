/**
 * Pure PMI presentation helpers (spec 49 P1): every string shown for an annotation comes from
 * `@cadcamfun/core` (`pmi.pmiDrawingData`, `drawing.fmtTol`, `pmi.validatePmiSet`) so the panel,
 * the viewport overlay and the drawing sheet can never disagree. No rendering is forked here.
 */
import * as THREE from "three"
import { drawing, pmi } from "@cadcamfun/core"

export type PmiAnnotation = pmi.PmiAnnotation
export type PmiSet = pmi.PmiSet
export type PmiIssue = pmi.PmiIssue

/** Short kind label key suffix (`cad.pmi.kind.<suffix>`). */
export const kindKey = (kind: PmiAnnotation["kind"]): string => kind

/** One-line value/datum summary of an annotation, reusing the core drawing wording. */
export const annotationSummary = (a: PmiAnnotation): string => {
  switch (a.kind) {
    case "dimensional-size":
    case "dimensional-location":
      return pmi.pmiDimensionText(a)
    case "geometric-tolerance":
      return `${a.gdt.kind} ${drawing.fmtTol(a.gdt)}${(a.gdt.datums ?? []).length > 0 ? ` | ${(a.gdt.datums ?? []).join(" | ")}` : ""}`
    case "datum":
      return a.letter
    case "datum-target":
      return `${a.letter} · ${a.target}`
    case "surface-texture":
      return [a.ra !== undefined ? `Ra ${a.ra}` : "", a.rz !== undefined ? `Rz ${a.rz}` : "", a.lay ?? "", a.process ?? ""].filter(Boolean).join(" ") || "—"
    case "note":
      return a.text
  }
}

/** Full callout text for the viewport leader label (GD&T frame text, datum letter, dimension…). */
export const annotationCallout = (a: PmiAnnotation): string => {
  if (a.kind === "geometric-tolerance") return `${a.gdt.kind} ${drawing.fmtTol(a.gdt)}${(a.gdt.datums ?? []).length > 0 ? ` | ${(a.gdt.datums ?? []).join(" | ")}` : ""}`
  if (a.kind === "datum") return `[${a.letter}]`
  return annotationSummary(a)
}

export const refLabel = (r: pmi.PmiRef): string => `${r.kind}:${r.body}|${r.key}`

/** Issues belonging to one annotation (orphan/broken state in the panel). */
export const issuesFor = (issues: readonly PmiIssue[], annotationId: string): readonly PmiIssue[] =>
  issues.filter((i) => i.annotationId === annotationId)

export const isBroken = (issues: readonly PmiIssue[], annotationId: string): boolean => issuesFor(issues, annotationId).length > 0

export interface PmiCaptureGroup {
  readonly capture: pmi.PmiCapture
  readonly annotations: readonly PmiAnnotation[]
}

/** Annotations grouped by capture, in capture order; unlisted annotations form no group (validation flags them). */
export const groupByCapture = (set: PmiSet): readonly PmiCaptureGroup[] =>
  set.captures.map((capture) => ({
    capture,
    annotations: capture.annotationIds.map((id) => set.annotations.find((a) => a.id === id)).filter((a): a is PmiAnnotation => a !== undefined)
  }))

/** Annotations of the active capture (all annotations when the capture is unknown). */
export const activeAnnotations = (set: PmiSet, captureId: string | undefined): readonly PmiAnnotation[] => {
  if (captureId === undefined) return set.annotations
  const capture = set.captures.find((c) => c.id === captureId)
  if (capture === undefined) return set.annotations.filter((a) => a.captureId === captureId)
  const byId = new Map(set.annotations.map((a) => [a.id, a]))
  return capture.annotationIds.map((id) => byId.get(id)).filter((a): a is PmiAnnotation => a !== undefined)
}

/**
 * Anchor point of an annotation in model space: the first ref's `hint` (the point picked in the
 * viewport), else the annotation plane origin. `undefined` when neither exists — the overlay then
 * lists the annotation without a leader instead of inventing a position.
 */
export const anchorPoint = (a: PmiAnnotation): readonly [number, number, number] | undefined => {
  for (const r of a.refs) if (r.hint !== undefined) return [r.hint.x, r.hint.y, r.hint.z]
  return a.plane?.origin
}

/** Drawing-sheet rows derived by the backend (`pmiDrawingData`): the sheet view consumes these, never a fork. */
export const drawingRows = (set: PmiSet): pmi.PmiDrawingData => pmi.pmiDrawingData(set)

export const GDT_KINDS: readonly drawing.GdtKind[] = [
  "straightness", "flatness", "circularity", "cylindricity", "profile-line", "profile-surface",
  "parallelism", "perpendicularity", "angularity", "position", "concentricity", "symmetry", "runout", "total-runout"
]

/**
 * Builds a topological ref from the desktop's existing element selection. The desktop has no B-rep
 * face picker, so the selected element is the body and its id the key, with the element position as
 * the pick hint (see `unresolved` in the delivery notes).
 */
export const refFromElement = (element: { readonly id: string; readonly name?: string; readonly type?: string; readonly x?: number; readonly y?: number; readonly z?: number }): pmi.PmiRef => ({
  body: element.id,
  kind: "face",
  key: typeof element.name === "string" && element.name !== "" ? element.name : element.id,
  hint: { x: element.x ?? 0, y: element.y ?? 0, z: element.z ?? 0 }
})

let seq = 0
/** Stable unique id for a new annotation/capture (crypto when available, counter otherwise). */
export const newPmiId = (prefix: string): string => {
  seq += 1
  try { return `${prefix}-${crypto.randomUUID().slice(0, 8)}` } catch { return `${prefix}-${Date.now().toString(36)}-${seq}` }
}

export interface PmiOverlayLabel {
  readonly id: string
  readonly text: string
  readonly kind: string
  readonly x: number
  readonly y: number
  readonly anchorX: number
  readonly anchorY: number
  readonly broken: boolean
}

/** Projects annotations to screen labels at their anchor (ref hint / plane origin); the rest are returned unanchored. */
export const projectPmiLabels = (
  annotations: readonly PmiAnnotation[],
  camera: THREE.Camera,
  width: number,
  height: number,
  brokenIds: ReadonlySet<string> = new Set()
): { readonly labels: readonly PmiOverlayLabel[]; readonly unanchored: readonly PmiAnnotation[] } => {
  const labels: PmiOverlayLabel[] = []
  const unanchored: PmiAnnotation[] = []
  for (const a of annotations) {
    const anchor = anchorPoint(a)
    if (anchor === undefined) { unanchored.push(a); continue }
    const v = new THREE.Vector3(anchor[0], anchor[1], anchor[2]).project(camera)
    if (v.z > 1) { unanchored.push(a); continue }
    const anchorX = (v.x * 0.5 + 0.5) * width, anchorY = (-v.y * 0.5 + 0.5) * height
    labels.push({ id: a.id, text: annotationCallout(a), kind: a.kind, x: anchorX + 28, y: Math.max(14, anchorY - 22), anchorX, anchorY, broken: brokenIds.has(a.id) })
  }
  return { labels, unanchored }
}
