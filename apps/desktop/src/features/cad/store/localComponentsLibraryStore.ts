import { create } from "../../../shared/state/zustand.ts"
import { t } from "../../../i18n/index.ts"

const STORAGE_KEY = "cadcam_local_components_library"

export interface LocalComponent {
  id: string
  name: string
  description?: string
  type: string
  data: unknown
  thumbnail?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
  meta?: { specifications?: Record<string, unknown>; [key: string]: unknown }
}

export interface ComponentsLibraryState {
  components: LocalComponent[]
  isLoading: boolean
  error: string | null
  loadLibrary: () => void
  saveLibrary: () => boolean
  addComponent: (component: Omit<LocalComponent, "id" | "createdAt" | "updatedAt">) => string
  updateComponent: (id: string, updates: Partial<Omit<LocalComponent, "id" | "createdAt" | "updatedAt">>) => boolean
  deleteComponent: (id: string) => boolean
  clearLibrary: () => boolean
  exportComponent: (id: string) => LocalComponent | null
  importComponent: (component: Omit<LocalComponent, "id" | "createdAt" | "updatedAt">) => string
  searchComponents: (query: string) => LocalComponent[]
}

const read = (): LocalComponent[] => {
  const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
  if (!Array.isArray(parsed)) throw new Error("Invalid component library")
  return parsed as LocalComponent[]
}

/** Components saved from the editor, kept on this machine (same storage key as the legacy app). */
export const useLocalComponentsLibraryStore = create<ComponentsLibraryState>((set, get) => ({
  components: [],
  isLoading: false,
  error: null,

  loadLibrary: () => {
    set({ isLoading: true, error: null })
    try { set({ components: read(), isLoading: false }) }
    catch (error) { set({ error: t("library.local.loadFailed", { error: error instanceof Error ? error.message : t("common.unknownError") }), isLoading: false }) }
  },

  saveLibrary: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().components))
      return true
    } catch (error) {
      set({ error: t("library.local.saveFailed", { error: error instanceof Error ? error.message : t("library.local.storageLimit") }) })
      return false
    }
  },

  addComponent: (component) => {
    const now = new Date().toISOString()
    const added: LocalComponent = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...component, meta: { ...component.meta } }
    const previous = get().components
    set({ components: [...previous, structuredClone(added)] })
    if (!get().saveLibrary()) { set({ components: previous }); return "" }
    set({ error: null })
    window.dispatchEvent(new CustomEvent("component-library-updated"))
    return added.id
  },

  updateComponent: (id, updates) => {
    const { components } = get()
    const index = components.findIndex((candidate) => candidate.id === id)
    if (index === -1) { set({ error: `Component with ID ${id} not found` }); return false }
    const next = [...components]
    next[index] = { ...next[index]!, ...updates, updatedAt: new Date().toISOString() }
    set({ components: next })
    const saved = get().saveLibrary()
    if (!saved) set({ components });
    if (saved) { set({ error: null }); window.dispatchEvent(new CustomEvent("component-library-updated")) }
    return saved
  },

  deleteComponent: (id) => {
    const { components } = get()
    const remaining = components.filter((candidate) => candidate.id !== id)
    if (remaining.length === components.length) { set({ error: `Component with ID ${id} not found` }); return false }
    set({ components: remaining })
    const saved = get().saveLibrary()
    if (!saved) set({ components });
    if (saved) { set({ error: null }); window.dispatchEvent(new CustomEvent("component-library-updated")) }
    return saved
  },

  clearLibrary: () => {
    const previous = get().components
    set({ components: [] })
    if (!get().saveLibrary()) { set({ components: previous }); return false }
    set({ error: null })
    window.dispatchEvent(new CustomEvent("component-library-updated"))
    return true
  },

  exportComponent: (id) => {
    const found = get().components.find((candidate) => candidate.id === id)
    if (!found) { set({ error: `Component with ID ${id} not found` }); return null }
    return structuredClone(found)
  },

  importComponent: (component) => get().addComponent(component),

  searchComponents: (query) => {
    const needle = query.toLowerCase()
    return get().components.filter((component) =>
      component.name.toLowerCase().includes(needle) ||
      (component.description?.toLowerCase().includes(needle) ?? false) ||
      component.type.toLowerCase().includes(needle) ||
      (component.tags?.some((tag) => tag.toLowerCase().includes(needle)) ?? false)
    )
  }
}))

if (typeof window !== "undefined") useLocalComponentsLibraryStore.getState().loadLibrary()
