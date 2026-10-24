/**
 * A project is more than its drawing: it holds the components the editor reuses, the toolpaths the
 * CAM workspace generates, the materials cut with and the drawings themselves (spec 03 §2).
 *
 * This module is the one place that turns the editor's stores into that complete set, so the "Save"
 * and "Save as Project" paths cannot drift apart and silently drop half the work. Layers and the
 * measuring settings travel with the drawing; the library components travel as project components.
 */
import { toJsonSafe } from "../../../shared/state/json-safe.ts"
import { documentSettings } from "../../../shared/state/document-settings.ts"
import type { AppState } from "../../../shared/state/context.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { setupPayload } from "./document-setup.ts"
import { cam } from "@cadcamfun/core"
import { useLocalComponentsLibraryStore } from "../store/localComponentsLibraryStore.ts"

/** How the screens run typed client calls without importing Effect types here. */
type Run = <A>(effect: unknown) => Promise<A>

/**
 * The part of the typed client this module uses, named so callers and tests can build one.
 * `AppState["client"]` satisfies it.
 */
export interface ComponentClient {
  readonly projects: {
    readonly create: (input: { readonly payload: { name: string; description: string | null; organizationId: string | null; isPublic: boolean } }) => Promise<{ readonly id: string }>
  }
  readonly drawings: {
    readonly createForProject: (input: { readonly params: { readonly id: string }; readonly payload: { readonly name: string; readonly description: string | null; readonly data: unknown } }) => Promise<{ readonly id: string; readonly name: string }>
    readonly update: (input: { readonly params: { readonly id: string }; readonly payload: { readonly data: unknown; readonly baseUpdatedAt?: string; readonly mergeData?: boolean } }) => Promise<unknown>
  }
  readonly components: {
    readonly listForProject: (input: { readonly params: { readonly id: string } }) => Promise<ReadonlyArray<{ readonly id: string; readonly name: string }>>
    readonly createForProject: (input: { readonly params: { readonly id: string }; readonly payload: { readonly name: string; readonly description: string | null; readonly type: string; readonly isPublic: boolean; readonly data: unknown } }) => Promise<{ readonly id: string }>
  }
}

/** The drawing a project stores: geometry, layers and the measuring settings, versioned. */
export const drawingPayload = (app: Pick<AppState, "settings">): Record<string, unknown> => {
  const { elements, selectedElement } = useElementsStore.getState()
  const { layers } = useLayerStore.getState()
  // The whole payload goes through the JSON filter, not just the geometry: a setting that holds `undefined` or a class instance
  // is refused by the typed client ("Expected JSON value at ..."), and the assistant's turn would end before it started.
  return toJsonSafe({
    elements,
    layers,
    selectedElement: selectedElement?.id ?? null,
    settings: documentSettings(app),
    setup: setupPayload(),
    version: "1.0"
  }) as Record<string, unknown>
}

/**
 * What identifies the stored content of a drawing payload: everything that is saved except the selection, so selecting a
 * part is not an unsaved change but moving it is.
 */
export const payloadRevision = (payload: Record<string, unknown>): string => {
  const { selectedElement: _selection, ...stored } = payload
  return cam.kernel.sha256(JSON.stringify(stored))
}

/** What a save actually put in the project, so the caller can report it instead of guessing. */
export interface ProjectContents {
  readonly drawingId: string
  readonly componentIds: ReadonlyArray<string>
  /** `updatedAt` the sidecar stored the drawing with; the base of the next save. Absent when nothing was written. */
  readonly updatedAt?: string
}

/** Creates the project's drawing; returns the new drawing id. */
async function createDrawing(
  app: Pick<AppState, "client" | "runtime" | "settings">,
  projectId: string,
  name: string,
  run: Run
): Promise<string> {
  const drawing = await run<{ readonly id: string; readonly name: string }>(app.client.drawings.createForProject({
    params: { id: projectId },
    payload: { name, description: `Main drawing for project ${name}`, data: drawingPayload(app) }
  }))
  return drawing.id
}

/** Reads the component names a project already holds, so a re-save does not duplicate them. */
async function existingNames(app: Pick<AppState, "client" | "runtime">, projectId: string, run: Run): Promise<ReadonlySet<string>> {
  try {
    const rows = await run<ReadonlyArray<{ readonly name: string }>>(app.client.components.listForProject({ params: { id: projectId } }))
    return new Set(rows.map((row) => row.name.trim().toLowerCase()))
  } catch {
    // A failed read must not block the save: the components are recreated and the server can reject duplicates.
    return new Set<string>()
  }
}

/** Creates the library components missing from the project; returns the ids of the ones it created. */
async function writeComponents(app: Pick<AppState, "client" | "runtime">, projectId: string, run: Run, known: Set<string>): Promise<ReadonlyArray<string>> {
  const ids: string[] = []
  // Newest first, so a name collision keeps the most recent definition.
  for (const component of [...useLocalComponentsLibraryStore.getState().components].reverse()) {
    const key = component.name.trim().toLowerCase()
    if (key === "" || known.has(key)) continue
    try {
      const row = await run<{ readonly id: string }>(app.client.components.createForProject({
        params: { id: projectId },
        payload: {
          name: component.name,
          description: component.description ?? null,
          type: component.type,
          isPublic: false,
          data: {
            version: "1.0",
            type: component.type,
            elements: toJsonSafe(typeof component.data === "object" && component.data !== null && "elements" in component.data && Array.isArray(component.data.elements) ? component.data.elements : [component.data]),
            metadata: { elementType: component.meta?.elementType ?? component.type, savedFrom: "cad-editor", tags: component.tags ?? [] }
          }
        }
      }))
      known.add(key)
      ids.push(row.id)
    } catch {
      // One component the server refuses must not lose the rest of the project.
    }
  }
  return ids
}

/**
 * "Save as Project": creates the project, its drawing and the components. Toolpaths and materials
 * are server-side per project, so there is nothing to copy for them here.
 */
export async function createProjectWithContents(
  app: Pick<AppState, "client" | "runtime" | "settings">,
  options: { readonly name: string; readonly description?: string | undefined; readonly organizationId?: string | undefined; readonly isPublic?: boolean },
  run: Run = app.runtime.run as Run
): Promise<ProjectContents & { readonly projectId: string }> {
  const project = await run<{ readonly id: string }>(app.client.projects.create({
    payload: { name: options.name, description: options.description ?? null, organizationId: options.organizationId ?? null, isPublic: options.isPublic ?? false }
  }))
  const drawingId = await createDrawing(app, project.id, options.name, run)
  const componentIds = await writeComponents(app, project.id, run, new Set<string>())
  return { projectId: project.id, drawingId, componentIds }
}

/** What a "Save" writes besides the drawing, and the stored copy it is based on. */
export interface SyncOptions {
  /** Add the library components the project still lacks (default true). Autosave skips it unless the library changed. */
  readonly components?: boolean
  /** `updatedAt` of the stored copy the editor holds; the write is refused (409) when the drawing has moved on. */
  readonly baseUpdatedAt?: string | undefined
  /** The payload to store, when the caller already built it (so the revision it computed is the revision written). */
  readonly payload?: Record<string, unknown>
}

/**
 * "Save": updates the drawing this project already has and adds the components it is still missing.
 */
export async function syncProjectContents(
  app: Pick<AppState, "client" | "runtime" | "settings">,
  projectId: string,
  drawingId: string,
  run: Run,
  options: SyncOptions = {}
): Promise<ProjectContents> {
  if (projectId === "") throw new Error("This document is not in a project yet; use Save as Project.")
  const componentIds = options.components === false ? [] : await writeComponents(app, projectId, run, new Set(await existingNames(app, projectId, run)))
  if (drawingId === "") return { drawingId, componentIds }
  const row = await run<{ readonly updatedAt?: string } | undefined>(app.client.drawings.update({
    params: { id: drawingId },
    // `mergeData`: the editor does not own everything in the stored document (the stock the assistant configured), so it must not replace it.
    payload: { data: options.payload ?? drawingPayload(app), mergeData: true, ...(options.baseUpdatedAt !== undefined ? { baseUpdatedAt: options.baseUpdatedAt } : {}) }
  }))
  return { drawingId, componentIds, ...(typeof row?.updatedAt === "string" ? { updatedAt: row.updatedAt } : {}) }
}
