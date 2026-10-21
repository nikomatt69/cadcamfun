/** Puts the global editor stores back to empty, so a test never leaves state for the next file in the same process. */
import { useCADStore } from "../../src/features/cad/store/cadStore.ts"
import { useElementsStore } from "../../src/features/cad/store/elementsStore.ts"
import { useSelectionStore } from "../../src/features/cad/store/selectorStore.ts"
import { useVerifyStore } from "../../src/features/cam/store/verifyStore.ts"
import { useCamStore } from "../../src/features/cam/store/camStore.ts"
import { useGeneratorStore } from "../../src/features/cam/store/generatorStore.ts"
import { useDocumentStore } from "../../src/features/cad/store/documentStore.ts"
import { DEFAULT_SECTION } from "../../src/features/cad/lib/section.ts"
import { forgetPushed } from "../../src/features/ai/lib/editor-sync.ts"

/** The stock as the store starts with it, taken when this helper is first loaded (before any test changes it). */
const INITIAL_WORKPIECE = structuredClone(useCADStore.getState().workpiece)

export const resetStores = (): void => {
  useSelectionStore.getState().clearSelection()
  useElementsStore.setState({ elements: [], selectedElement: null })
  useVerifyStore.getState().reset()
  useDocumentStore.getState().clear()
  forgetPushed()
  useCamStore.getState().reset()
  // The kernel panel's own settings (side setup, edited plan, cutter library) must not carry into the next file either.
  useGeneratorStore.getState().reset()
  useCADStore.setState({ tolerance: 0.01, section: DEFAULT_SECTION, workpiece: structuredClone(INITIAL_WORKPIECE) })
  const cad = useCADStore.getState()
  if (cad.showDimensions) cad.toggleDimensions()
}
