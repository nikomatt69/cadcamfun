/**
 * State and actions of the model browser shared by the CAD and the CAM sidebars (Fusion 360 "Browser",
 * Creo "Model Tree"). Both explorers call `createBrowser()`, so every function exists in both places and
 * behaves the same; the rules live in `cad/lib/browser.ts`, the data in the CAD stores.
 */
import { createSignal } from "solid-js"
import { useElementsStore } from "../../store/elementsStore.ts"
import { useLayerStore } from "../../store/layerStore.ts"
import { useSelectionStore } from "../../store/selectorStore.ts"
import { bulkNext, isolate, renamed, showAll, type GroupMode } from "../../lib/browser.ts"
import { t } from "../../../../i18n/index.ts"

const MODE_KEY = "cad-browser-group-mode"

const loadMode = (): GroupMode => {
  try {
    const stored = localStorage.getItem(MODE_KEY)
    return stored === "layer" || stored === "flat" || stored === "kind" ? stored : "kind"
  } catch {
    return "kind"
  }
}

// Module level, so the CAD and the CAM sidebar show the same grouping and the same open sections.
const [mode, setModeSignal] = createSignal<GroupMode>(loadMode())
const [closed, setClosed] = createSignal<Readonly<Record<string, boolean>>>({})

export const setGroupMode = (next: GroupMode): void => {
  setModeSignal(next)
  try { localStorage.setItem(MODE_KEY, next) } catch { /* storage blocked: the choice lasts for the session */ }
}

export interface Browser {
  readonly mode: () => GroupMode
  readonly setMode: (mode: GroupMode) => void
  readonly isSectionOpen: (id: string) => boolean
  readonly toggleSection: (id: string) => void
  readonly renaming: () => string | null
  readonly startRename: (id: string | null) => void
  readonly rename: (id: string, typed: string) => void
  readonly toggleVisible: (id: string) => void
  readonly toggleLocked: (id: string) => void
  readonly duplicate: (id: string) => void
  readonly remove: (id: string) => void
  readonly isolateSelection: () => void
  readonly showEverything: () => void
  readonly lockSelection: () => void
  readonly groupSelection: () => void
  readonly ungroupSelection: () => void
  readonly moveSelectionToLayer: (layerId: string) => void
  readonly setSectionFlag: (flag: "visible" | "locked", section: { readonly id: string; readonly items: ReadonlyArray<{ readonly id: string }> }) => void
  readonly addLayer: () => void
  readonly deleteLayer: (id: string) => void
  readonly hasHidden: () => boolean
  readonly selectedGroups: () => ReadonlyArray<string>
}

export const createBrowser = (): Browser => {
  const elements = useElementsStore()
  const layers = useLayerStore()
  const selection = useSelectionStore()
  const [renaming, startRename] = createSignal<string | null>(null)
  const find = (id: string) => elements.elements.find((element) => element.id === id)

  const selected = (): ReadonlyArray<string> => selection.selectedElementIds
  const flagOf = (id: string, flag: "visible" | "locked"): boolean => flag === "visible" ? find(id)?.visible !== false : find(id)?.locked === true

  return {
    mode,
    setMode: setGroupMode,
    isSectionOpen: (id) => closed()[id] !== true,
    toggleSection: (id) => setClosed((previous) => ({ ...previous, [id]: !previous[id] })),
    renaming,
    startRename,
    rename: (id, typed) => {
      const current = find(id)
      if (current !== undefined) elements.updateElement(id, { name: renamed(String(current["name"] ?? current.type), typed) })
      startRename(null)
    },
    toggleVisible: (id) => elements.updateElement(id, { visible: !flagOf(id, "visible") }),
    toggleLocked: (id) => elements.updateElement(id, { locked: !flagOf(id, "locked") }),
    duplicate: (id) => {
      const copy = elements.duplicateElement(id)
      if (copy !== undefined) { selection.selectElement(copy); elements.selectElement(copy) }
    },
    remove: (id) => {
      const element = find(id)
      if (element === undefined || !window.confirm(t("browser.confirmDelete", { name: String(element["name"] ?? element.type) }))) return
      elements.deleteElement(id)
      selection.deselectElement(id)
    },
    isolateSelection: () => {
      for (const patch of isolate(elements.elements, selected())) elements.updateElement(patch.id, { visible: patch.visible })
    },
    showEverything: () => {
      for (const patch of showAll(elements.elements)) elements.updateElement(patch.id, { visible: true })
      for (const layer of layers.layers) if (!layer.visible) layers.updateLayer(layer.id, { visible: true })
    },
    lockSelection: () => {
      const next = bulkNext(selected().map((id) => flagOf(id, "locked")))
      for (const id of selected()) elements.updateElement(id, { locked: next })
    },
    groupSelection: () => {
      if (selected().length >= 2) selection.groupSelection()
    },
    ungroupSelection: () => {
      for (const id of selected()) if (find(id)?.type === "group") selection.ungroupElement(id)
    },
    moveSelectionToLayer: (layerId) => { if (selected().length > 0) selection.moveSelectionToLayer(layerId) },
    setSectionFlag: (flag, section) => {
      const isLayer = layers.layers.some((layer) => layer.id === section.id)
      if (isLayer) {
        const layer = layers.layers.find((candidate) => candidate.id === section.id)!
        layers.updateLayer(layer.id, flag === "visible" ? { visible: !layer.visible } : { locked: !layer.locked })
        return
      }
      const next = bulkNext(section.items.map((item) => flagOf(item.id, flag)))
      for (const item of section.items) elements.updateElement(item.id, flag === "visible" ? { visible: next } : { locked: next })
    },
    addLayer: () => {
      layers.addLayer({ name: t("browser.layerName", { n: layers.layers.length + 1 }), visible: true, locked: false, color: "#1e88e5" })
      const created = layers.layers[layers.layers.length - 1]
      if (created !== undefined) layers.setActiveLayer(created.id)
    },
    deleteLayer: (id) => {
      const layer = layers.layers.find((candidate) => candidate.id === id)
      if (layer === undefined || layers.layers.length <= 1) return
      if (elements.elements.some((element) => element.layerId === id) && !window.confirm(t("browser.confirmDeleteLayer", { name: layer.name }))) return
      layers.deleteLayer(id)
    },
    hasHidden: () => elements.elements.some((element) => element.visible === false) || layers.layers.some((layer) => !layer.visible),
    selectedGroups: () => selected().filter((id) => find(id)?.type === "group")
  }
}
