/**
 * Unified access to library items across sources (port of the legacy `useUnifiedLibrary` hook): the main
 * library (sidecar API), the local library (browser storage) and the standard (predefined) library.
 *
 * Everything is returned as accessors, so call them inside JSX / effects.
 */
import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js"
import { useApp } from "../../state/context.ts"
import { predefinedComponents, predefinedMaterials, predefinedTools } from "../../cad/lib/predefinedLibraries.ts"
import { useLocalComponentsLibraryStore } from "../../cad/store/localComponentsLibraryStore.ts"
import { useLocalMaterialsLibraryStore, useLocalToolsLibraryStore } from "./localLibraryStores.ts"

export type LibrarySource = "api" | "local" | "predefined"
export type LibraryEntityType = "components" | "materials" | "tools"

export interface LibraryItem {
  id: string
  name: string
  description?: string
  type?: string
  tags?: string[]
  metadata?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}

export interface ComponentLibraryItem extends LibraryItem {
  type: string
  data: any
  thumbnail?: string
  source: LibrarySource
}

export interface MaterialLibraryItem extends LibraryItem {
  color?: string
  density?: number
  hardness?: number
  properties: Record<string, any>
}

export interface ToolLibraryItem extends LibraryItem {
  type: string
  diameter: number
  material: string
  numberOfFlutes?: number
  maxRPM?: number
  coolantType?: string
  cuttingLength?: number
  totalLength?: number
  shankDiameter?: number
  notes?: string
}

export interface LibraryFilter {
  search?: string
  type?: string
  category?: string
  [key: string]: any
}

export interface UnifiedLibraryResult<T extends LibraryItem> {
  items: Accessor<T[]>
  isLoading: Accessor<boolean>
  error: Accessor<string | null>
  activeSource: Accessor<LibrarySource>
  setActiveSource: (source: LibrarySource) => void
  refreshLibrary: () => Promise<void>
  searchItems: (query: string) => T[]
  filterItems: (filter: LibraryFilter) => T[]
  getItem: (id: string) => T | null
  saveItem: (item: Partial<T>) => Promise<T | null>
  deleteItem: (id: string) => Promise<boolean>
  importToMain: (item: T) => Promise<T | null>
  sourceStats: Accessor<Record<LibrarySource, number>>
}

const message = (cause: unknown): string => (cause instanceof Error ? cause.message : "Unknown error")

/** Predefined items carry no id: give them a stable one so lists and selection keep working. */
const predefinedItems = <T extends LibraryItem>(entityType: LibraryEntityType): T[] => {
  const source: ReadonlyArray<object> = entityType === "components" ? predefinedComponents : entityType === "materials" ? predefinedMaterials : predefinedTools
  return source.map((item, index) => {
    const base = item as Record<string, any>
    const withId = { ...base, id: base["id"] ?? `predefined-${entityType}-${index}` }
    if (entityType === "materials" && base["properties"]) {
      return { ...withId, color: base["properties"].color, density: base["properties"].density, hardness: base["properties"].hardness } as unknown as T
    }
    return withId as unknown as T
  })
}

const normalizeApiItems = <T extends LibraryItem>(entityType: LibraryEntityType, apiItems: ReadonlyArray<any>): T[] =>
  apiItems.map((item) => {
    const normalized: Record<string, any> = {
      id: item.id,
      name: item.name,
      description: item.description || "",
      updatedAt: item.updatedAt,
      createdAt: item.createdAt
    }
    if (entityType === "components") {
      normalized["type"] = item.type || ""
      normalized["data"] = item.data || {}
      normalized["thumbnail"] = item.thumbnail
    } else if (entityType === "materials") {
      normalized["properties"] = item.properties || {}
      if (item.properties) {
        normalized["color"] = item.properties.color
        normalized["density"] = item.properties.density
        normalized["hardness"] = item.properties.hardness
      }
    } else {
      for (const key of ["type", "diameter", "material", "numberOfFlutes", "maxRPM", "coolantType", "cuttingLength", "totalLength", "shankDiameter", "notes"]) normalized[key] = item[key]
    }
    return normalized as T
  })

export function useUnifiedLibrary<T extends LibraryItem>(entityType: LibraryEntityType, initialSource: LibrarySource = "api"): UnifiedLibraryResult<T> {
  const app = useApp()
  const [items, setItems] = createSignal<T[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [activeSource, setActiveSource] = createSignal<LibrarySource>(initialSource)
  const [sourceStats, setSourceStats] = createSignal<Record<LibrarySource, number>>({ api: 0, local: 0, predefined: 0 })

  const localStore = () => entityType === "components" ? useLocalComponentsLibraryStore : entityType === "materials" ? useLocalMaterialsLibraryStore : useLocalToolsLibraryStore
  const localItems = (): T[] => {
    const state = localStore().getState() as any
    state.loadLibrary()
    return (entityType === "components" ? state.components : entityType === "materials" ? state.materials : state.tools) as T[]
  }

  const fetchApiItems = async (): Promise<T[]> => {
    try {
      if (entityType === "components") {
        const rows = await app.runtime.run(app.client.library.list({ query: { category: "components" } }))
        return normalizeApiItems<T>(entityType, rows as ReadonlyArray<any>)
      }
      if (entityType === "materials") {
        const rows = await app.runtime.run(app.client.materials.list({ query: {} }))
        return normalizeApiItems<T>(entityType, rows as ReadonlyArray<any>)
      }
      const rows = await app.runtime.run(app.client.tools.list({ query: {} }))
      return normalizeApiItems<T>(entityType, rows as ReadonlyArray<any>)
    } catch (cause) {
      console.error(`Error fetching ${entityType} from API:`, cause)
      throw cause
    }
  }

  const fetchSourceStats = async (): Promise<void> => {
    const stats: Record<LibrarySource, number> = { api: 0, local: 0, predefined: 0 }
    try {
      try { stats.api = (await fetchApiItems()).length } catch (cause) { console.error("Error counting API items:", cause) }
      try { stats.local = localItems().length } catch (cause) { console.error("Error counting local items:", cause) }
      stats.predefined = predefinedItems<T>(entityType).length
      setSourceStats(stats)
    } catch (cause) {
      console.error("Error fetching source stats:", cause)
    }
  }

  const refreshLibrary = async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    const source = activeSource()
    try {
      const next = source === "api" ? await fetchApiItems() : source === "local" ? localItems() : predefinedItems<T>(entityType)
      setItems(() => next)
    } catch (cause) {
      setError(`Error loading ${entityType} from ${source} source: ${message(cause)}`)
      console.error(`Error loading ${entityType} from ${source} source:`, cause)
    } finally {
      setIsLoading(false)
    }
  }

  const searchItems = (query: string): T[] => {
    if (!query) return items()
    const needle = query.toLowerCase()
    return items().filter((item) =>
      item.name.toLowerCase().includes(needle) ||
      (item.description && item.description.toLowerCase().includes(needle)) ||
      (item.type && item.type.toLowerCase().includes(needle)) ||
      (Array.isArray(item.tags) && item.tags.some((tag) => tag.toLowerCase().includes(needle))))
  }

  const filterItems = (filter: LibraryFilter): T[] => {
    if (!filter || Object.keys(filter).length === 0) return items()
    return items().filter((item) => {
      for (const [key, value] of Object.entries(filter)) {
        if (!value) continue
        if (key === "search") {
          const needle = String(value).toLowerCase()
          const nameMatch = item.name.toLowerCase().includes(needle)
          const descMatch = item.description && item.description.toLowerCase().includes(needle)
          const tagMatch = Array.isArray(item.tags) && item.tags.some((tag) => tag.toLowerCase().includes(needle))
          if (!nameMatch && !descMatch && !tagMatch) return false
        } else if (key === "type" && item.type !== value) {
          return false
        } else if (key === "category") {
          if (entityType === "materials" && (item as unknown as MaterialLibraryItem).properties?.["category"] !== value) return false
        }
      }
      return true
    })
  }

  const getItem = (id: string): T | null => items().find((item) => item.id === id) || null

  const saveItem = async (item: Partial<T>): Promise<T | null> => {
    const source = activeSource()
    if (source === "predefined") { setError("Cannot save to predefined library"); return null }
    setIsLoading(true)
    try {
      if (source === "api") { setError("API save not implemented"); return null }
      const state = localStore().getState() as any
      const { id: _id, createdAt: _created, updatedAt: _updated, ...rest } = item as Record<string, any>
      const id: string = entityType === "components" ? state.addComponent(rest) : entityType === "materials" ? state.addMaterial(rest) : state.addTool(rest)
      await refreshLibrary()
      return getItem(id)
    } catch (cause) {
      setError(`Error saving ${entityType} to ${source} source: ${message(cause)}`)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const deleteItem = async (id: string): Promise<boolean> => {
    const source = activeSource()
    if (source === "predefined") { setError("Cannot delete from predefined library"); return false }
    setIsLoading(true)
    try {
      if (source === "api") { setError("API delete not implemented"); return false }
      const state = localStore().getState() as any
      const removed: boolean = entityType === "components" ? state.deleteComponent(id) : entityType === "materials" ? state.deleteMaterial(id) : state.deleteTool(id)
      await refreshLibrary()
      return removed
    } catch (cause) {
      setError(`Error deleting ${entityType} from ${source} source: ${message(cause)}`)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const importToMain = async (_item: T): Promise<T | null> => {
    setIsLoading(true)
    try { setError("API import not implemented"); return null }
    finally { setIsLoading(false) }
  }

  createEffect(on(activeSource, () => { void refreshLibrary() }))

  createEffect(on(activeSource, () => {
    void fetchSourceStats()
    // The legacy listeners watched `<entity>-library-updated`, while its stores announced the singular form: listen to both.
    const names = [`${entityType}-library-updated`, `${entityType.slice(0, -1)}-library-updated`]
    const onUpdated = (): void => { if (activeSource() === "local") void refreshLibrary(); else void fetchSourceStats() }
    for (const name of names) window.addEventListener(name, onUpdated)
    onCleanup(() => { for (const name of names) window.removeEventListener(name, onUpdated) })
  }))

  createEffect(on(items, (list) => { if (list.length > 0) void fetchSourceStats() }, { defer: true }))

  return { items, isLoading, error, activeSource, setActiveSource, refreshLibrary, searchItems, filterItems, getItem, saveItem, deleteItem, importToMain, sourceStats }
}
