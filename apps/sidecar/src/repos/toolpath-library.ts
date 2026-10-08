/**
 * The predefined toolpath catalogue behind `GET /api/toolpaths/library` (legacy `toolpathsLibrary.json`).
 * The data is a static snapshot shipped with the sidecar; the filter mirrors the legacy handler: exact match on
 * type / operationType / category, case-insensitive substring on name, description and tags, and every entry
 * is stamped with the `projectId` it was requested for.
 */
import { Context, Effect, Layer } from "effect"
import catalogue from "../data/toolpaths-library.json" with { type: "json" }

export interface LibraryToolpath {
  readonly id: string; readonly name: string; readonly description: string; readonly type: string; readonly operationType: string
  readonly category: string; readonly tags: ReadonlyArray<string>; readonly data: unknown; readonly gcode: string; readonly projectId: string
}

export interface LibraryFilter {
  readonly projectId: string
  readonly type?: string | undefined
  readonly operationType?: string | undefined
  readonly category?: string | undefined
  readonly search?: string | undefined
}

const ITEMS: ReadonlyArray<Omit<LibraryToolpath, "projectId">> = (catalogue as unknown as ReadonlyArray<Omit<LibraryToolpath, "projectId">>)

export const filterToolpathLibrary = (f: LibraryFilter): LibraryToolpath[] => {
  const needle = f.search?.toLowerCase()
  return ITEMS
    .filter((tp) => f.type === undefined || tp.type === f.type)
    .filter((tp) => f.operationType === undefined || tp.operationType === f.operationType)
    .filter((tp) => f.category === undefined || tp.category === f.category)
    .filter((tp) => needle === undefined || needle === "" || [tp.name, tp.description, ...tp.tags].some((text) => !!text && text.toLowerCase().includes(needle)))
    .map((tp) => ({ ...tp, projectId: f.projectId }))
}

export class ToolpathLibrary extends Context.Service<ToolpathLibrary, {
  filter(f: LibraryFilter): LibraryToolpath[]
}>()("cadcamfun/ToolpathLibrary") {
  static readonly layer = Layer.succeed(ToolpathLibrary, ToolpathLibrary.of({ filter: filterToolpathLibrary }))
}
