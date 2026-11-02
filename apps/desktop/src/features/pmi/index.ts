/** Semantic PMI / MBD desktop feature (spec 49 P1): panel, authoring form and viewport overlay over `@cadcamfun/core` + the PMI API group. */
export { default as PmiPanel } from "./components/PmiPanel.tsx"
export { default as PmiAnnotationForm } from "./components/PmiAnnotationForm.tsx"
export { default as PmiViewportOverlay } from "./components/PmiViewportOverlay.tsx"
export { usePmiStore, pmiIssues, pmiDraftFingerprint } from "./pmi-store.ts"
export { loadPmi, savePmi, type PmiLoadResult, type PmiSaveResult } from "./pmi-api.ts"
export * from "./pmi-format.ts"
