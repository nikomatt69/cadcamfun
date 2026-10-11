/**
 * The custom elements store (legacy `customElements/store.ts`).
 *
 * Definitions live in the browser (the same storage key the legacy app used) so a machine keeps
 * its authored elements across restarts; the editor's transient state — what is open, which
 * parameters the preview was built with, the validation errors — is deliberately not persisted.
 */
import { create } from "../../state/zustand.ts"
import type * as THREE from "three"
import {
  defaultParameterValues,
  type CustomElementDefinition,
  type ValidationResult,
} from "../types/customElements.ts"
import { compileGeometryCode } from "../lib/customElements/evaluate.ts"

const STORAGE_KEY = "custom-elements-storage"

export interface CustomElementsState {
  /** Saved definitions by id. */
  definitions: Record<string, CustomElementDefinition>
  /** The definition the editor is working on (a `temp` id while creating). */
  activeDefinition: CustomElementDefinition | null
  isEditorOpen: boolean
  editorMode: "create" | "edit"
  /** Parameter values the current preview was built with. */
  previewParameters: Record<string, unknown>
  previewObject: THREE.Object3D | null
  isGeneratingPreview: boolean
  previewError: string | null
  validationErrors: string[]

  createDefinition: (definition: Omit<CustomElementDefinition, "id" | "created" | "modified">) => string
  updateDefinition: (id: string, updates: Partial<CustomElementDefinition>) => void
  deleteDefinition: (id: string) => void
  duplicateDefinition: (id: string, newName: string) => string

  openEditor: (mode: "create" | "edit", definitionId?: string) => void
  /** The editor now follows the saved definition (after the first save, or after editing one). */
  followSavedDefinition: (id: string) => void
  closeEditor: () => void
  setActiveDefinition: (definition: CustomElementDefinition | null) => void

  updatePreviewParameters: (parameters: Record<string, unknown>) => void
  setPreviewObject: (object: THREE.Object3D | null) => void
  setGeneratingPreview: (isGenerating: boolean) => void
  setPreviewError: (error: string | null) => void

  validateDefinition: (definition: CustomElementDefinition) => ValidationResult
  setValidationErrors: (errors: string[]) => void

  exportDefinition: (id: string) => string | null
  importDefinition: (jsonString: string) => string | null
  exportAllDefinitions: () => string
  importDefinitions: (jsonString: string) => string[]

  getDefinitionsByCategory: (category?: string) => CustomElementDefinition[]
  searchDefinitions: (query: string) => CustomElementDefinition[]
}

const read = (): Record<string, CustomElementDefinition> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, CustomElementDefinition>) : {}
  } catch { return {} }
}

const write = (definitions: Record<string, CustomElementDefinition>): void => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(definitions)) } catch { /* storage unavailable */ }
}

const newId = (): string => `custom-${crypto.randomUUID()}`

/** The definition the editor opens on: the legacy default element. */
const createDefaultDefinition = (): Omit<CustomElementDefinition, "id" | "created" | "modified"> => ({
  name: "New Custom Element",
  description: "A custom Three.js element",
  category: "Custom",
  tags: [],
  version: "1.0.0",
  author: "User",

  parameters: {
    size: { type: "number", default: 1, min: 0.1, max: 10, step: 0.1, description: "Size of the element", label: "Size" },
    color: { type: "color", default: "#1e88e5", description: "Color of the element", label: "Color" },
  },

  geometryCode: `// Create your custom geometry here
// Available variables: THREE, parameters (user inputs)
// Must return a THREE.BufferGeometry or THREE.Object3D

const geometry = new THREE.BoxGeometry(
  parameters.size,
  parameters.size,
  parameters.size
);

return geometry;`,

  materialConfig: {
    type: "standard",
    properties: {
      color: "parameters.color", // Reference to parameter
      wireframe: false,
    },
  },

  previewConfig: {
    camera: { position: [3, 3, 3], target: [0, 0, 0] },
    background: "#f0f0f0",
    lighting: true,
  },
})

/** The checks a definition must pass before it is saved or previewed. */
const validate = (definition: CustomElementDefinition): ValidationResult => {
  const errors: string[] = []

  if (!definition.name.trim()) errors.push("Name is required")
  if (!definition.geometryCode.trim()) errors.push("Geometry code is required")

  for (const [key, parameter] of Object.entries(definition.parameters)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      errors.push(`Parameter "${key}" has invalid name. Use alphanumeric characters and underscores only.`)
    }
    if (parameter.type === "number" && parameter.min !== undefined && parameter.max !== undefined && parameter.min >= parameter.max) {
      errors.push(`Parameter "${key}": min value must be less than max value`)
    }
  }

  try {
    compileGeometryCode(definition.geometryCode)
  } catch (error) {
    errors.push(`Geometry code syntax error: ${error instanceof Error ? error.message : String(error)}`)
  }

  return { valid: errors.length === 0, errors }
}

export const useCustomElementsStore = create<CustomElementsState>((set, get) => {
  /** Replaces the definitions and keeps storage in sync (the legacy `persist` middleware). */
  const saveDefinitions = (definitions: Record<string, CustomElementDefinition>): void => {
    set({ definitions })
    write(definitions)
  }

  return {
    definitions: typeof window === "undefined" ? {} : read(),
    activeDefinition: null,
    isEditorOpen: false,
    editorMode: "create",
    previewParameters: {},
    previewObject: null,
    isGeneratingPreview: false,
    previewError: null,
    validationErrors: [],

    createDefinition: (definition) => {
      const now = new Date().toISOString()
      const id = newId()
      const created: CustomElementDefinition = { ...definition, id, created: now, modified: now }
      saveDefinitions({ ...get().definitions, [id]: created })
      return id
    },

    updateDefinition: (id, updates) => {
      const existing = get().definitions[id]
      if (!existing) return
      const updated: CustomElementDefinition = { ...existing, ...updates, modified: new Date().toISOString() }
      saveDefinitions({ ...get().definitions, [id]: updated })
      set({ activeDefinition: get().activeDefinition?.id === id ? updated : get().activeDefinition })
    },

    deleteDefinition: (id) => {
      const { [id]: _removed, ...remaining } = get().definitions
      saveDefinitions(remaining)
      if (get().activeDefinition?.id === id) set({ activeDefinition: null })
    },

    duplicateDefinition: (id, newName) => {
      const definition = get().definitions[id]
      if (!definition) return ""
      const { id: _id, created: _created, modified: _modified, ...input } = definition
      return get().createDefinition({ ...input, name: newName })
    },

    openEditor: (mode, definitionId) => {
      const definition = definitionId === undefined ? undefined : get().definitions[definitionId]
      const fallback = createDefaultDefinition()
      set({
        isEditorOpen: true,
        editorMode: mode,
        // While creating, the editor works on a throwaway definition nothing references yet.
        activeDefinition: mode === "create"
          ? { ...fallback, id: "temp", created: "", modified: "" }
          : (definition ?? null),
        previewParameters: defaultParameterValues(definition ?? fallback),
        previewError: null,
      })
    },

    closeEditor: () => set({
      isEditorOpen: false,
      activeDefinition: null,
      previewObject: null,
      validationErrors: [],
      previewError: null,
    }),

    // After the first save the editor keeps working on the saved definition, so a second save
    // updates it instead of creating a copy. The preview values are deliberately left alone.
    followSavedDefinition: (id) => {
      const definition = get().definitions[id]
      if (!definition) return
      set({ editorMode: "edit", activeDefinition: definition })
    },
    setActiveDefinition: (definition) => set({ activeDefinition: definition }),

    updatePreviewParameters: (parameters) => set({ previewParameters: parameters }),
    setPreviewObject: (object) => set({ previewObject: object }),
    setGeneratingPreview: (isGenerating) => set({ isGeneratingPreview: isGenerating }),
    setPreviewError: (error) => set({ previewError: error }),

    validateDefinition: validate,
    setValidationErrors: (errors) => set({ validationErrors: errors }),

    exportDefinition: (id) => {
      const definition = get().definitions[id]
      return definition ? JSON.stringify(definition, null, 2) : null
    },

    importDefinition: (jsonString) => {
      try {
        const imported = JSON.parse(jsonString) as CustomElementDefinition
        const validation = validate(imported)
        if (!validation.valid) return null
        const { id: _id, created: _created, modified: _modified, ...input } = imported
        return get().createDefinition(input)
      } catch {
        return null
      }
    },

    exportAllDefinitions: () => JSON.stringify(Object.values(get().definitions), null, 2),

    importDefinitions: (jsonString) => {
      try {
        const imported = JSON.parse(jsonString) as CustomElementDefinition[]
        if (!Array.isArray(imported)) return []
        const created: string[] = []
        for (const definition of imported) {
          const validation = validate(definition)
          if (!validation.valid) continue
          const { id: _id, created: _created, modified: _modified, ...input } = definition
          const id = get().createDefinition(input)
          created.push(id)
        }
        return created
      } catch {
        return []
      }
    },

    getDefinitionsByCategory: (category) => {
      const definitions = Object.values(get().definitions)
      return category ? definitions.filter((definition) => definition.category === category) : definitions
    },

    searchDefinitions: (query) => {
      const needle = query.toLowerCase()
      return Object.values(get().definitions).filter((definition) =>
        definition.name.toLowerCase().includes(needle) ||
        (definition.description?.toLowerCase().includes(needle) ?? false) ||
        (definition.tags?.some((tag) => tag.toLowerCase().includes(needle)) ?? false))
    },
  }
})
