/**
 * The multi-toolpath store (legacy `multiToolpathStore.ts`, zustand + `persist`).
 *
 * State and actions are the reducers of `cam/lib/multiToolpath.ts`; `toolpaths` and `globalSettings` are persisted
 * to `localStorage` under the legacy key, the selection and the active toolpath reset with the session.
 */
import { create } from "../../state/zustand.ts"
import type { ToolpathSettings } from "../lib/elementJob.ts"
import * as model from "../lib/multiToolpath.ts"
import type { ElementToolpath, MultiToolpathState, ToolpathPoint } from "../lib/multiToolpath.ts"

export type { ElementToolpath, ToolpathPoint } from "../lib/multiToolpath.ts"
export { TOOLPATH_COLORS } from "../lib/multiToolpath.ts"

export const STORAGE_KEY = "multi-toolpath-storage"

interface MultiToolpathStore extends MultiToolpathState {
  addToolpath(elementId: string, elementType: string, elementName: string, settings: ToolpathSettings): string
  updateToolpath(id: string, updates: Partial<ElementToolpath>): void
  removeToolpath(id: string): void
  removeToolpathByElementId(elementId: string): void
  selectToolpath(id: string): void
  deselectToolpath(id: string): void
  selectAllToolpaths(): void
  deselectAllToolpaths(): void
  toggleToolpathVisibility(id: string): void
  showAllToolpaths(): void
  hideAllToolpaths(): void
  updateToolpathGCode(id: string, gcode: string, points: ReadonlyArray<ToolpathPoint>, measured?: { readonly distance: number; readonly time: number }): void
  reorderToolpaths(newOrder: ReadonlyArray<string>): void
  moveToolpathUp(id: string): void
  moveToolpathDown(id: string): void
  getToolpathByElementId(elementId: string): ElementToolpath | undefined
  getToolpathById(id: string): ElementToolpath | undefined
  getVisibleToolpaths(): ElementToolpath[]
  getSelectedToolpaths(): ElementToolpath[]
  generateCombinedGCode(): string
  clearAllToolpaths(): void
  updateGlobalSettings(settings: Partial<ToolpathSettings>): void
  applyGlobalSettingsToSelected(): void
}

const slice = (store: MultiToolpathState): MultiToolpathState => ({
  toolpaths: store.toolpaths,
  selectedToolpathIds: store.selectedToolpathIds,
  activeToolpathId: store.activeToolpathId,
  globalSettings: store.globalSettings
})

/** Persisted part of the state, tolerant of missing / corrupt storage. */
const restore = (): Partial<MultiToolpathState> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed = JSON.parse(raw) as { state?: { toolpaths?: unknown; globalSettings?: unknown } }
    const toolpaths = Array.isArray(parsed.state?.toolpaths) ? (parsed.state!.toolpaths as ElementToolpath[]).map(toolpath => ({ ...toolpath, selected: false })) : []
    const globalSettings = typeof parsed.state?.globalSettings === "object" && parsed.state.globalSettings !== null ? (parsed.state.globalSettings as Partial<ToolpathSettings>) : model.INITIAL_GLOBAL_SETTINGS
    return { toolpaths, globalSettings }
  } catch {
    return {}
  }
}

export const useMultiToolpathStore = create<MultiToolpathStore>((set, get) => {
  const apply = (reduce: (state: MultiToolpathState) => MultiToolpathState): void => { set(reduce(slice(get()))) }
  return {
    ...model.initialState(),
    ...restore(),

    addToolpath: (elementId, elementType, elementName, settings) => {
      const id = model.newToolpathId()
      apply(state => model.addToolpath(state, { id, elementId, elementType, elementName, settings }))
      return id
    },
    updateToolpath: (id, updates) => apply(state => model.updateToolpath(state, id, updates)),
    removeToolpath: id => apply(state => model.removeToolpath(state, id)),
    removeToolpathByElementId: elementId => apply(state => model.removeToolpathsByElementId(state, elementId)),

    selectToolpath: id => apply(state => model.selectToolpath(state, id)),
    deselectToolpath: id => apply(state => model.deselectToolpath(state, id)),
    selectAllToolpaths: () => apply(model.selectAllToolpaths),
    deselectAllToolpaths: () => apply(model.deselectAllToolpaths),

    toggleToolpathVisibility: id => apply(state => model.toggleToolpathVisibility(state, id)),
    showAllToolpaths: () => apply(state => model.setAllVisible(state, true)),
    hideAllToolpaths: () => apply(state => model.setAllVisible(state, false)),

    updateToolpathGCode: (id, gcode, points, measured) => apply(state => model.updateToolpathGCode(state, id, gcode, points, measured)),

    reorderToolpaths: newOrder => apply(state => model.reorderToolpaths(state, newOrder)),
    moveToolpathUp: id => apply(state => model.moveToolpathUp(state, id)),
    moveToolpathDown: id => apply(state => model.moveToolpathDown(state, id)),

    getToolpathByElementId: elementId => model.toolpathByElementId(get(), elementId),
    getToolpathById: id => get().toolpaths.find(toolpath => toolpath.id === id),
    getVisibleToolpaths: () => get().toolpaths.filter(toolpath => toolpath.visible),
    getSelectedToolpaths: () => get().toolpaths.filter(toolpath => toolpath.selected),
    generateCombinedGCode: () => model.combineGCode(get().toolpaths),

    clearAllToolpaths: () => apply(state => ({ ...state, toolpaths: [], selectedToolpathIds: [], activeToolpathId: null })),

    updateGlobalSettings: settings => apply(state => ({ ...state, globalSettings: { ...state.globalSettings, ...settings } })),
    applyGlobalSettingsToSelected: () => apply(model.applyGlobalSettingsToSelected)
  }
})

// Persist `toolpaths` and `globalSettings` (the legacy `partialize`), in zustand's `persist` envelope.
useMultiToolpathStore.subscribe(state => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { toolpaths: state.toolpaths, globalSettings: state.globalSettings }, version: 0 }))
  } catch { /* storage blocked or full: the toolpaths live for this session */ }
})
