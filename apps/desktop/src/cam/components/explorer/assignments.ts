import { createRoot, createSignal } from "solid-js"
import type { cam } from "@cadcamfun/core"
import type { ElementAssignment, ElementParams } from "../../lib/elementJob.ts"

/**
 * Per-element tool / material picks, toolpath parameters and generated toolpaths of the explorer's detail panels.
 * Module-level so they survive switching sidebar tabs (the explorer unmounts when hidden). The generation itself
 * lives in `cam/lib/elementGenerate.ts`, which reads these through `assignmentOf`.
 */
export type { ElementParams } from "../../lib/elementJob.ts"

export const DEFAULT_PARAMS: ElementParams = { depth: 5, stepover: 40, feedrate: 1000, plungerate: 300 }

/** What the explorer keeps of a generated toolpath (legacy `ToolpathData`). */
export interface ElementToolpathData {
  readonly id: string
  readonly elementId: string
  readonly gcode: string
  readonly program: cam.Program
  readonly isVisible: boolean
}

const store = createRoot(() => {
  const [tools, setTools] = createSignal<Readonly<Record<string, string>>>({})
  const [materials, setMaterials] = createSignal<Readonly<Record<string, string>>>({})
  const [params, setParams] = createSignal<Readonly<Record<string, ElementParams>>>({})
  const [toolpaths, setToolpaths] = createSignal<Readonly<Record<string, ElementToolpathData>>>({})
  return { tools, setTools, materials, setMaterials, params, setParams, toolpaths, setToolpaths }
})

export const toolOf = (id: string): string => store.tools()[id] ?? ""
export const materialOf = (id: string): string => store.materials()[id] ?? ""
export const paramsOf = (id: string): ElementParams => store.params()[id] ?? DEFAULT_PARAMS
export const assignmentOf = (id: string): ElementAssignment => ({ toolId: toolOf(id), materialId: materialOf(id), params: paramsOf(id) })
export const toolpathOf = (id: string): ElementToolpathData | undefined => store.toolpaths()[id]

export const assignTool = (id: string, toolId: string): void => { store.setTools(previous => ({ ...previous, [id]: toolId })) }
export const clearTool = (id: string): void => { store.setTools(({ [id]: _removed, ...rest }) => rest) }
export const assignMaterial = (id: string, materialId: string): void => { store.setMaterials(previous => ({ ...previous, [id]: materialId })) }
export const updateParam = (id: string, key: keyof ElementParams, value: number): void => {
  if (!Number.isFinite(value)) return
  store.setParams(previous => ({ ...previous, [id]: { ...(previous[id] ?? DEFAULT_PARAMS), [key]: value } }))
}
export const storeToolpath = (data: ElementToolpathData): void => { store.setToolpaths(previous => ({ ...previous, [data.elementId]: data })) }
