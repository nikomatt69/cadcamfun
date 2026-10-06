import { create } from "../../state/zustand.ts"

const STORAGE_KEY = "cadcam_local_components_library"

export interface LocalComponent {
  id: string
  name: string
  description?: string
  type: string
  data: any
  thumbnail?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
  meta?: { specifications?: Record<string, any>; [key: string]: any }
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
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as LocalComponent[] } catch { return [] }
}

/** Components saved from the editor, kept on this machine (same storage key as the legacy app). */
export const useLocalComponentsLibraryStore = create<ComponentsLibraryState>((set, get) => ({
  components: [],
  isLoading: false,
  error: null,

  loadLibrary: () => {
    set({ isLoading: true, error: null })
    try { set({ components: read(), isLoading: false }) }
    catch (error) { set({ error: `Failed to load components library: ${error instanceof Error ? error.message : "Unknown error"}`, isLoading: false }) }
  },

  saveLibrary: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().components))
      return true
    } catch (error) {
      set({ error: `Failed to save library: ${error instanceof Error ? error.message : "Storage limit may be exceeded"}` })
      return false
    }
  },

  addComponent: (component) => {
    const now = new Date().toISOString()
    const added: LocalComponent = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...component, meta: { ...component.meta } }
    set((state) => ({ components: [...state.components, added] }))
    get().saveLibrary()
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
    if (saved) window.dispatchEvent(new CustomEvent("component-library-updated"))
    return saved
  },

  deleteComponent: (id) => {
    const { components } = get()
    const remaining = components.filter((candidate) => candidate.id !== id)
    if (remaining.length === components.length) { set({ error: `Component with ID ${id} not found` }); return false }
    set({ components: remaining })
    const saved = get().saveLibrary()
    if (saved) window.dispatchEvent(new CustomEvent("component-library-updated"))
    return saved
  },

  clearLibrary: () => { set({ components: [] }); return get().saveLibrary() },

  exportComponent: (id) => {
    const found = get().components.find((candidate) => candidate.id === id)
    if (!found) { set({ error: `Component with ID ${id} not found` }); return null }
    return { ...found }
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
