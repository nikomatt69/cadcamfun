/**
 * The CAM-side local libraries: tools and materials kept on this machine (ports of the legacy
 * `localToolsLibraryStore` / `localMaterialsLibraryStore`, same storage keys so existing data carries over).
 * The components library already lives in `cad/store/localComponentsLibraryStore.ts`.
 */
import { create } from "../../../shared/state/zustand.ts"

const TOOLS_STORAGE_KEY = "cadcam_local_tools_library"
const MATERIALS_STORAGE_KEY = "cadcam_local_materials_library"
/** Same ceiling the legacy `storeData` helper enforced (bytes, 2 per character). */
const LOCAL_STORAGE_LIMIT = 5 * 1024 * 1024

const retrieve = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

const store = (key: string, data: unknown): boolean => {
  try {
    const serialized = JSON.stringify(data)
    if (serialized.length * 2 > LOCAL_STORAGE_LIMIT) return false
    localStorage.setItem(key, serialized)
    return true
  } catch { return false }
}

const message = (error: unknown): string => (error instanceof Error ? error.message : "Unknown error")

export interface LocalTool {
  id: string
  name: string
  type: string
  diameter: number
  material: string
  description?: string
  numberOfFlutes?: number
  maxRPM?: number
  coolantType?: string
  cuttingLength?: number
  totalLength?: number
  shankDiameter?: number
  notes?: string
  thumbnail?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
  meta?: { [key: string]: any }
}

export interface ToolsLibraryState {
  tools: LocalTool[]
  isLoading: boolean
  error: string | null
  loadLibrary: () => void
  saveLibrary: () => boolean
  addTool: (tool: Omit<LocalTool, "id" | "createdAt" | "updatedAt">) => string
  updateTool: (id: string, updates: Partial<Omit<LocalTool, "id" | "createdAt" | "updatedAt">>) => boolean
  deleteTool: (id: string) => boolean
  clearLibrary: () => boolean
  exportTool: (id: string) => LocalTool | null
  importTool: (tool: Omit<LocalTool, "id" | "createdAt" | "updatedAt">) => string
  searchTools: (query: string) => LocalTool[]
  filterTools: (filters: { type?: string; material?: string }) => LocalTool[]
}

export const useLocalToolsLibraryStore = create<ToolsLibraryState>((set, get) => ({
  tools: [],
  isLoading: false,
  error: null,

  loadLibrary: () => {
    set({ isLoading: true, error: null })
    try { set({ tools: retrieve<LocalTool[]>(TOOLS_STORAGE_KEY) || [], isLoading: false }) }
    catch (error) { set({ error: `Failed to load tools library: ${message(error)}`, isLoading: false }) }
  },

  saveLibrary: () => {
    try {
      if (!store(TOOLS_STORAGE_KEY, get().tools)) { set({ error: "Failed to save library: Storage limit may be exceeded" }); return false }
      return true
    } catch (error) { set({ error: `Failed to save tools library: ${message(error)}` }); return false }
  },

  addTool: (tool) => {
    const now = new Date().toISOString()
    const added: LocalTool = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...tool, meta: { ...tool.meta } }
    set((state) => ({ tools: [...state.tools, added] }))
    get().saveLibrary()
    // The legacy store reloaded and announced the change shortly after saving.
    setTimeout(() => {
      get().loadLibrary()
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tool-library-updated"))
    }, 100)
    return added.id
  },

  updateTool: (id, updates) => {
    const { tools } = get()
    const index = tools.findIndex((candidate) => candidate.id === id)
    if (index === -1) { set({ error: `Tool with ID ${id} not found` }); return false }
    const next = [...tools]
    next[index] = { ...next[index]!, ...updates, updatedAt: new Date().toISOString() }
    set({ tools: next })
    return get().saveLibrary()
  },

  deleteTool: (id) => {
    const { tools } = get()
    const remaining = tools.filter((candidate) => candidate.id !== id)
    if (remaining.length === tools.length) { set({ error: `Tool with ID ${id} not found` }); return false }
    set({ tools: remaining })
    return get().saveLibrary()
  },

  clearLibrary: () => { set({ tools: [] }); return get().saveLibrary() },

  exportTool: (id) => {
    const found = get().tools.find((candidate) => candidate.id === id)
    if (!found) { set({ error: `Tool with ID ${id} not found` }); return null }
    return { ...found }
  },

  importTool: (tool) => get().addTool(tool),

  searchTools: (query) => {
    const needle = query.toLowerCase()
    return get().tools.filter((tool) =>
      tool.name.toLowerCase().includes(needle) ||
      (tool.description?.toLowerCase().includes(needle) ?? false) ||
      tool.type.toLowerCase().includes(needle) ||
      tool.material.toLowerCase().includes(needle) ||
      (tool.notes?.toLowerCase().includes(needle) ?? false) ||
      (tool.tags?.some((tag) => tag.toLowerCase().includes(needle)) ?? false)
    )
  },

  filterTools: (filters) => get().tools.filter((tool) =>
    (!filters.type || tool.type === filters.type) && (!filters.material || tool.material === filters.material))
}))

export interface LocalMaterial {
  id: string
  name: string
  description?: string
  properties: { density: number; hardness: number; color: string; [key: string]: any }
  thumbnail?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
  meta?: { [key: string]: any }
}

export interface MaterialsLibraryState {
  materials: LocalMaterial[]
  isLoading: boolean
  error: string | null
  loadLibrary: () => void
  saveLibrary: () => boolean
  addMaterial: (material: Omit<LocalMaterial, "id" | "createdAt" | "updatedAt">) => string
  updateMaterial: (id: string, updates: Partial<Omit<LocalMaterial, "id" | "createdAt" | "updatedAt">>) => boolean
  deleteMaterial: (id: string) => boolean
  clearLibrary: () => boolean
  exportMaterial: (id: string) => LocalMaterial | null
  importMaterial: (material: Omit<LocalMaterial, "id" | "createdAt" | "updatedAt">) => string
  searchMaterials: (query: string) => LocalMaterial[]
}

export const useLocalMaterialsLibraryStore = create<MaterialsLibraryState>((set, get) => ({
  materials: [],
  isLoading: false,
  error: null,

  loadLibrary: () => {
    set({ isLoading: true, error: null })
    try { set({ materials: retrieve<LocalMaterial[]>(MATERIALS_STORAGE_KEY) || [], isLoading: false }) }
    catch (error) { set({ error: `Failed to load materials library: ${message(error)}`, isLoading: false }) }
  },

  saveLibrary: () => {
    try {
      if (!store(MATERIALS_STORAGE_KEY, get().materials)) { set({ error: "Failed to save library: Storage limit may be exceeded" }); return false }
      return true
    } catch (error) { set({ error: `Failed to save materials library: ${message(error)}` }); return false }
  },

  addMaterial: (material) => {
    const now = new Date().toISOString()
    const added: LocalMaterial = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...material, meta: { ...material.meta } }
    set((state) => ({ materials: [...state.materials, added] }))
    get().saveLibrary()
    setTimeout(() => {
      get().loadLibrary()
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("material-library-updated"))
    }, 100)
    return added.id
  },

  updateMaterial: (id, updates) => {
    const { materials } = get()
    const index = materials.findIndex((candidate) => candidate.id === id)
    if (index === -1) { set({ error: `Material with ID ${id} not found` }); return false }
    const next = [...materials]
    next[index] = { ...next[index]!, ...updates, updatedAt: new Date().toISOString() }
    set({ materials: next })
    return get().saveLibrary()
  },

  deleteMaterial: (id) => {
    const { materials } = get()
    const remaining = materials.filter((candidate) => candidate.id !== id)
    if (remaining.length === materials.length) { set({ error: `Material with ID ${id} not found` }); return false }
    set({ materials: remaining })
    return get().saveLibrary()
  },

  clearLibrary: () => { set({ materials: [] }); return get().saveLibrary() },

  exportMaterial: (id) => {
    const found = get().materials.find((candidate) => candidate.id === id)
    if (!found) { set({ error: `Material with ID ${id} not found` }); return null }
    return { ...found }
  },

  importMaterial: (material) => get().addMaterial(material),

  searchMaterials: (query) => {
    const needle = query.toLowerCase()
    return get().materials.filter((material) =>
      material.name.toLowerCase().includes(needle) ||
      (material.description?.toLowerCase().includes(needle) ?? false) ||
      (material.tags?.some((tag) => tag.toLowerCase().includes(needle)) ?? false))
  }
}))

if (typeof window !== "undefined") {
  useLocalToolsLibraryStore.getState().loadLibrary()
  useLocalMaterialsLibraryStore.getState().loadLibrary()
}
