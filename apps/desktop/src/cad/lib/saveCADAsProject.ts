import { useDocumentStore } from "../store/documentStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import type { AppState } from "../../state/context.ts"

export interface SaveOptions {
  readonly name: string
  readonly description?: string | undefined
  readonly organizationId?: string | undefined
  readonly isPublic?: boolean | undefined
}

/** Creates a project and its main drawing from the editor's current elements. */
export async function saveCADAsProject(app: Pick<AppState, "client" | "runtime">, options: SaveOptions): Promise<{ projectId: string; drawingId: string }> {
  if (!options.name) throw new Error("Project name is required")
  const { elements, selectedElement } = useElementsStore.getState()
  const project = await app.runtime.run(app.client.projects.create({
    payload: { name: options.name, description: options.description ?? null, organizationId: options.organizationId ?? null, isPublic: options.isPublic ?? false }
  }))
  const drawing = await app.runtime.run(app.client.drawings.createForProject({
    params: { id: project.id },
    payload: {
      name: `${options.name} Drawing`,
      description: `Main drawing for project ${options.name}`,
      data: { elements, selectedElement: selectedElement ? selectedElement.id : null, version: "1.0" }
    }
  }))
  useDocumentStore.getState().setDocument({ projectId: project.id, drawingId: drawing.id, name: drawing.name })
  return { projectId: project.id, drawingId: drawing.id }
}
