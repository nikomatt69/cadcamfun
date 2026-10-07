/** Puts the global editor stores back to empty, so a test never leaves state for the next file in the same process. */
import { useCADStore } from "../../src/cad/store/cadStore.ts"
import { useElementsStore } from "../../src/cad/store/elementsStore.ts"
import { useSelectionStore } from "../../src/cad/store/selectorStore.ts"
import { useVerifyStore } from "../../src/cam/store/verifyStore.ts"
import { useCamStore } from "../../src/cam/store/camStore.ts"
import { useDocumentStore } from "../../src/cad/store/documentStore.ts"
import { forgetPushed } from "../../src/ai/editor-sync.ts"

export const resetStores = (): void => {
  useSelectionStore.getState().clearSelection()
  useElementsStore.setState({ elements: [], selectedElement: null })
  useVerifyStore.getState().reset()
  useDocumentStore.getState().clear()
  forgetPushed()
  useCamStore.getState().reset()
  const cad = useCADStore.getState()
  if (cad.showDimensions) cad.toggleDimensions()
}
