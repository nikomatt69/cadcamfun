import type { AppState } from "../../../shared/state/context.ts"
import { restoreDocumentSettings } from "../../../shared/state/document-settings.ts"
import { rememberPushed } from "../../ai/lib/editor-sync.ts"
import { useDocumentStore } from "../store/documentStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { restoreLayers, restoreSetup, restoreTitleBlock } from "./document-setup.ts"
import { noteStoredRevision } from "./stored-revision.ts"

/** A stored drawing as `drawings.get` returns it. */
export interface StoredDrawing {
  readonly id: string
  readonly name: string
  readonly data: unknown
  readonly updatedAt?: string
  readonly project: { readonly id: string; readonly name: string }
}

/**
 * Puts a stored drawing into the editor: the measuring settings, the layers, the machining setup and the elements, and makes
 * it the open document. The stored `updatedAt` becomes the base of the next save. Shared by opening a drawing and by restoring
 * a restore point, so both leave the editor in exactly the same state.
 */
export function applyStoredDrawing(app: AppState, row: StoredDrawing): void {
  const stored = row.data as { elements?: unknown; layers?: unknown; settings?: unknown; setup?: unknown; titleBlock?: unknown } | null
  restoreDocumentSettings(app, stored?.settings)
  restoreLayers(stored?.layers)
  restoreSetup(stored?.setup)
  restoreTitleBlock(stored?.titleBlock)
  const layers = useLayerStore.getState()
  const known = new Set(layers.layers.map((layer) => layer.id))
  const loaded = (Array.isArray(stored?.elements) ? stored.elements : []).map((element: Record<string, unknown>) =>
    known.has(String(element["layerId"])) ? element : { ...element, layerId: layers.activeLayer })
  useElementsStore.setState({ elements: loaded as never, selectedElement: null })
  useSelectionStore.getState().clearSelection()
  noteStoredRevision(row.id, row.updatedAt)
  useDocumentStore.getState().setDocument({ projectId: row.project.id, drawingId: row.id, name: row.name })
  rememberPushed(useElementsStore.getState().elements as unknown as ReadonlyArray<Record<string, unknown>>, row.id)
  app.rememberProject(row.project.id, row.project.name)
}
