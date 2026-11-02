/**
 * The PMI set being edited for the open drawing, shared by the panel, the viewport overlay and the
 * drawing section. All validation/fingerprint work is delegated to `@cadcamfun/core`; this store only
 * holds the draft and keeps captures and annotations consistent (an annotation is always listed in
 * its capture, a removed annotation disappears from every capture).
 */
import { pmi } from "@cadcamfun/core"
import { create } from "../../shared/state/zustand.ts"
import { newPmiId } from "./pmi-format.ts"

export type PmiLoadState = "idle" | "loading" | "saving" | "ready" | "error" | "conflict"

interface PmiState {
  set: pmi.PmiSet
  drawingId: string | null
  /** `updatedAt` is not returned by the PMI group; the base revision is tracked by the caller via `stored-revision`. */
  activeCaptureId: string | undefined
  selectedAnnotationId: string | undefined
  status: PmiLoadState
  error: string | undefined
  setSet: (set: pmi.PmiSet, drawingId?: string | null) => void
  setStatus: (status: PmiLoadState, error?: string) => void
  setActiveCapture: (id: string | undefined) => void
  selectAnnotation: (id: string | undefined) => void
  addCapture: (name: string) => string
  renameCapture: (id: string, name: string) => void
  removeCapture: (id: string) => void
  addAnnotation: (annotation: pmi.PmiAnnotation) => void
  removeAnnotation: (id: string) => void
  clear: () => void
}

const firstCapture = (set: pmi.PmiSet): string | undefined => set.captures[0]?.id

export const usePmiStore = create<PmiState>((set, get) => ({
  set: pmi.emptyPmiSet(),
  drawingId: null,
  activeCaptureId: undefined,
  selectedAnnotationId: undefined,
  status: "idle",
  error: undefined,

  setSet: (next, drawingId) => set((s) => ({
    set: next,
    drawingId: drawingId === undefined ? s.drawingId : drawingId,
    activeCaptureId: next.captures.some((c) => c.id === s.activeCaptureId) ? s.activeCaptureId : firstCapture(next),
    selectedAnnotationId: next.annotations.some((a) => a.id === s.selectedAnnotationId) ? s.selectedAnnotationId : undefined,
    status: "ready", error: undefined
  })),
  setStatus: (status, error) => set({ status, error }),
  setActiveCapture: (id) => set({ activeCaptureId: id }),
  selectAnnotation: (id) => set({ selectedAnnotationId: id }),

  addCapture: (name) => {
    const id = newPmiId("capture")
    const capture: pmi.PmiCapture = { id, name: name.trim() === "" ? "Capture" : name.trim(), annotationIds: [] }
    set((s) => ({ set: { version: 1, annotations: s.set.annotations, captures: [...s.set.captures, capture] }, activeCaptureId: id }))
    return id
  },
  renameCapture: (id, name) => set((s) => ({
    set: { version: 1, annotations: s.set.annotations, captures: s.set.captures.map((c) => (c.id === id ? { ...c, name } : c)) }
  })),
  removeCapture: (id) => set((s) => {
    const captures = s.set.captures.filter((c) => c.id !== id)
    const annotations = s.set.annotations.filter((a) => a.captureId !== id)
    return {
      set: { version: 1, annotations, captures },
      activeCaptureId: s.activeCaptureId === id ? firstCapture({ version: 1, annotations, captures }) : s.activeCaptureId,
      selectedAnnotationId: annotations.some((a) => a.id === s.selectedAnnotationId) ? s.selectedAnnotationId : undefined
    }
  }),
  addAnnotation: (annotation) => set((s) => {
    const captures = s.set.captures.some((c) => c.id === annotation.captureId)
      ? s.set.captures.map((c) => (c.id === annotation.captureId && !c.annotationIds.includes(annotation.id) ? { ...c, annotationIds: [...c.annotationIds, annotation.id] } : c))
      : [...s.set.captures, { id: annotation.captureId, name: annotation.captureId, annotationIds: [annotation.id] }]
    return { set: { version: 1, annotations: [...s.set.annotations, annotation], captures }, selectedAnnotationId: annotation.id, activeCaptureId: annotation.captureId }
  }),
  removeAnnotation: (id) => set((s) => ({
    set: {
      version: 1,
      annotations: s.set.annotations.filter((a) => a.id !== id),
      captures: s.set.captures.map((c) => ({ ...c, annotationIds: c.annotationIds.filter((x) => x !== id) }))
    },
    selectedAnnotationId: s.selectedAnnotationId === id ? undefined : s.selectedAnnotationId
  })),
  clear: () => set({ set: pmi.emptyPmiSet(), drawingId: null, activeCaptureId: undefined, selectedAnnotationId: undefined, status: "idle", error: undefined })
}))

/** Current validation issues (never throws on a damaged draft). */
export const pmiIssues = (): readonly pmi.PmiIssue[] => pmi.validatePmiSet(usePmiStore.getState().set)
/** Manufacturing fingerprint of the current draft (CAM stale seam in core). */
export const pmiDraftFingerprint = (): string => pmi.pmiFingerprint(usePmiStore.getState().set)
