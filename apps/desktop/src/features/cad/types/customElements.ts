// Custom Elements type definitions (legacy `components/cad/customElements/types.ts`).
//
// A custom element is a user-authored parametric part: a table of parameters (numbers, strings,
// booleans, colours, choices) plus a JavaScript function body that builds Three.js geometry from
// them. The script is stored as text, so a definition is plain JSON: portable, reviewable and
// re-editable by hand. Nothing here knows about the store or the editor.

/** One user-editable parameter of a custom element. */
export interface CustomElementParameter {
  type: "number" | "string" | "boolean" | "color" | "vector3" | "select"
  default: unknown
  min?: number
  max?: number
  step?: number
  /** Options for `type: "select"`. */
  options?: ReadonlyArray<string>
  required?: boolean
  description?: string
  label?: string
}

/** A saved custom element: parameters, the geometry script and how it previews. */
export interface CustomElementDefinition {
  id: string
  name: string
  description?: string
  category?: string
  tags?: ReadonlyArray<string>
  version?: string
  author?: string
  created: string
  modified: string

  /** Parameters the user can change, keyed by name (valid JS identifier). */
  parameters: Record<string, CustomElementParameter>

  /** Function body that must return a `THREE.BufferGeometry` or a `THREE.Object3D`. */
  geometryCode: string

  materialConfig?: {
    type: "standard" | "basic" | "physical" | "custom"
    properties: Record<string, unknown>
    /** Function body returning a `THREE.Material`; only used when `type` is `custom`. */
    customCode?: string
  }

  previewConfig?: {
    camera?: {
      position: readonly [number, number, number]
      target: readonly [number, number, number]
    }
    background?: string
    lighting?: boolean
  }
}

/** A placed custom element: the definition it came from, with which values, where. */
export interface CustomElementInstance {
  id: string
  definitionId: string
  parameters: Record<string, unknown>
  position: { x: number; y: number; z: number }
  rotation?: { x: number; y: number; z: number }
  scale?: { x: number; y: number; z: number }
}

/** The fields a CAD element carries when it holds a placed custom element. */
export interface CustomElementFields {
  definitionId: string
  parameters: Record<string, unknown>
  x: number
  y: number
  z: number
  rotation?: { x: number; y: number; z: number }
  scale?: { x: number; y: number; z: number }
}

/** The instance an element holds, or `null` when the element is not a placed custom element. */
export const customElementOf = (element: { readonly [key: string]: unknown }): CustomElementInstance | null => {
  const definitionId = element["definitionId"]
  if (typeof definitionId !== "string" || definitionId === "") return null
  return {
    id: String(element["id"] ?? ""),
    definitionId,
    parameters: (element["parameters"] as Record<string, unknown> | undefined) ?? {},
    position: { x: Number(element["x"] ?? 0), y: Number(element["y"] ?? 0), z: Number(element["z"] ?? 0) },
    rotation: element["rotation"] as CustomElementInstance["rotation"],
    scale: element["scale"] as CustomElementInstance["scale"],
  }
}

/** Outcome of checking a definition before it is saved or previewed. */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings?: string[]
}

/** A starting point offered in the editor's template list. */
export interface CustomElementTemplate {
  name: string
  description: string
  category: string
  tags: ReadonlyArray<string>
  parameters: Record<string, CustomElementParameter>
  geometryCode: string
  materialConfig?: CustomElementDefinition["materialConfig"]
  previewConfig?: CustomElementDefinition["previewConfig"]
}

/** The parameter values a definition starts from: every parameter's own default. */
export const defaultParameterValues = (definition: Pick<CustomElementDefinition, "parameters">): Record<string, unknown> =>
  Object.fromEntries(Object.entries(definition.parameters).map(([name, parameter]) => [name, parameter.default]))
