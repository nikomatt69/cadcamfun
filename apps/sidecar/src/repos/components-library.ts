/**
 * The predefined CAD part catalogue behind `GET /api/components/library` (legacy `cadComponentsLibrary.json`), a static snapshot
 * shipped with the sidecar. The filter mirrors the legacy handler: exact match on `type` and `category`, case-insensitive
 * substring on name, description and tags.
 */
import catalogue from "../data/components-library.json" with { type: "json" }

type Entry = { name?: string; description?: string; category?: string; type?: string; tags?: ReadonlyArray<string> }
const ITEMS = catalogue as unknown as ReadonlyArray<Entry>

export const filterComponentLibrary = (f: { type?: string | undefined; category?: string | undefined; search?: string | undefined }): ReadonlyArray<unknown> => {
  const needle = f.search?.toLowerCase()
  return ITEMS
    .filter((c) => f.type === undefined || c.type === f.type)
    .filter((c) => f.category === undefined || c.category === f.category)
    .filter((c) => needle === undefined
      || (c.name?.toLowerCase().includes(needle) ?? false)
      || (c.description?.toLowerCase().includes(needle) ?? false)
      || (c.tags?.some((t) => t.toLowerCase().includes(needle)) ?? false))
}
