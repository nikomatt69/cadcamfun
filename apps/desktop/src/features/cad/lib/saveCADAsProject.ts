import { toJsonSafe } from "../../../shared/state/json-safe.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useDocumentStore } from "../store/documentStore.ts"
import { createProjectWithContents } from "./projectSnapshot.ts"
import type { AppState } from "../../../shared/state/context.ts"

export interface SaveOptions {
  readonly name: string
  readonly description?: string | undefined
  readonly organizationId?: string | undefined
  readonly isPublic?: boolean | undefined
}

/**
 * "Save as Project": one project that holds everything — the drawing with its layers and settings,
 * and the components saved in the library on this machine (spec 03 §2).
 */
export async function saveCADAsProject(app: Pick<AppState, "client" | "runtime" | "settings">, options: SaveOptions): Promise<{ projectId: string; drawingId: string; componentCount: number }> {
  if (!options.name) throw new Error("Project name is required")
  const { elements, selectedElement } = useElementsStore.getState()
  if (elements.length === 0 && selectedElement === null) throw new Error("Nothing to save: the drawing has no elements")
  const result = await createProjectWithContents(app, options)
  useDocumentStore.getState().setDocument({ projectId: result.projectId, drawingId: result.drawingId, name: `${options.name}` })
  return { projectId: result.projectId, drawingId: result.drawingId, componentCount: result.componentIds.length }
}

/** Re-exported so callers keep importing one symbol for the whole "save the project" surface. */
export { syncProjectContents, drawingPayload } from "./projectSnapshot.ts"
export { toJsonSafe }
