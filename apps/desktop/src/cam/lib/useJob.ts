import { createMemo, type Accessor } from "solid-js"
import { useCADStore } from "../../cad/store/cadStore.ts"
import { useElementsStore } from "../../cad/store/elementsStore.ts"
import { useSelectionStore } from "../../cad/store/selectorStore.ts"
import { useCamStore } from "../store/camStore.ts"
import { selectedElements, stockOf, type JobSources } from "./job.ts"

/**
 * What the CAD editor and the CAM store currently say about the job, as reactive accessors.
 * Reading inside JSX / effects subscribes to the stores; nothing is copied.
 */
export interface JobView {
  readonly sources: Accessor<JobSources>
  /** Selected elements, multi-selection first. */
  readonly selection: Accessor<ReturnType<typeof selectedElements>>
  /** The element the panel describes: the first selected one. */
  readonly element: Accessor<ReturnType<typeof selectedElements>[number] | undefined>
  readonly stock: Accessor<ReturnType<typeof stockOf>>
  readonly elements: Accessor<JobSources["elements"]>
}

export const useJob = (): JobView => {
  const elements = useElementsStore()
  const selection = useSelectionStore()
  const cad = useCADStore()
  const cam = useCamStore()
  const sources = createMemo<JobSources>(() => ({
    elements: elements.elements,
    selectedElement: elements.selectedElement,
    selectedIds: selection.selectedElementIds,
    workpiece: cad.workpiece,
    workpieceElementId: cam.selectedWorkpieceElementId,
    stockAllowance: cam.stockAllowance
  }))
  const selected = createMemo(() => selectedElements(sources()))
  return {
    sources,
    selection: selected,
    element: () => selected()[0],
    stock: createMemo(() => stockOf(sources())),
    elements: () => sources().elements
  }
}
