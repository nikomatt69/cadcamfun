import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Box, Copy, Eye, EyeOff, Layers, Lock, Move, ToggleLeft, ToggleRight, Trash2, Unlock, Wrench } from "lucide-solid"
import { Motion } from "solid-motionone"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore, type SelectionBounds } from "../store/selectorStore.ts"

interface SelectionControlsProps {
  readonly isSelectionMode: boolean
  readonly isMultiSelectMode: boolean
  onSelectionModeChange(active: boolean): void
  onMultiSelectModeToggle(): void
  onDeleteSelected(): void
  onDuplicateSelected(): void
  onMoveToLayer(layerId: string): void
  onCreateComponent(): void
  readonly bounds?: SelectionBounds | null | undefined
}

const ACTION = "flex-1 flex items-center justify-center px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-xs"

/** The selection panel on the canvas: selection tool, multi-select, visibility/lock, duplicate, layer move, component, delete. */
export default function SelectionControls(props: SelectionControlsProps): JSX.Element {
  const selection = useSelectionStore()
  const elements = useElementsStore()
  const layers = useLayerStore()
  const [showLayerDropdown, setShowLayerDropdown] = createSignal(false)

  const count = () => selection.selectedElementIds.length
  const hasSelection = () => count() > 0
  const selected = createMemo(() => elements.elements.filter((el) => selection.selectedElementIds.includes(el.id)))
  const allVisible = () => selected().every((el) => el.visible !== false)
  const allLocked = () => selected().every((el) => el.locked === true)

  const toggleVisibility = () => { const next = !allVisible(); for (const id of selection.selectedElementIds) elements.updateElement(id, { visible: next }) }
  const toggleLocked = () => { const next = !allLocked(); for (const id of selection.selectedElementIds) elements.updateElement(id, { locked: next }) }
  const moveToLayer = (layerId: string) => { props.onMoveToLayer(layerId); setShowLayerDropdown(false) }

  return (
    <Motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 flex flex-col">
      <div class="mb-2 pb-2 border-b dark:border-gray-700">
        <button class={`flex items-center px-3 py-1.5 rounded text-sm w-full ${props.isSelectionMode ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"}`}
          onClick={() => props.onSelectionModeChange(!props.isSelectionMode)}>
          <Wrench size={16} class="mr-2" />
          Selection Tool
        </button>
      </div>

      <Show when={hasSelection()}>
        <div class="mb-2 text-sm text-gray-700 dark:text-gray-300">
          <div class="flex justify-between items-center">
            <span>{count()} selected</span>
            <Show when={props.bounds}>{(b) => <span class="text-xs text-gray-500">{Math.round(b().width)}×{Math.round(b().height)}</span>}</Show>
          </div>
        </div>
      </Show>

      <div class="mb-2 flex items-center">
        <button class={`flex items-center px-2 py-1 rounded text-xs ${props.isMultiSelectMode ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200" : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"}`}
          onClick={props.onMultiSelectModeToggle}>
          <Show when={props.isMultiSelectMode} fallback={<><ToggleLeft size={14} class="mr-1" />Multi-select Off</>}>
            <ToggleRight size={14} class="mr-1" />Multi-select On
          </Show>
        </button>
      </div>

      <Show when={hasSelection()}>
        <div class="space-y-1">
          <div class="flex space-x-1">
            <button class={ACTION} onClick={toggleVisibility} title={allVisible() ? "Hide selected" : "Show selected"}>
              <Show when={allVisible()} fallback={<><Eye size={12} class="mr-1" />Show</>}><EyeOff size={12} class="mr-1" />Hide</Show>
            </button>
            <button class={ACTION} onClick={toggleLocked} title={allLocked() ? "Unlock selected" : "Lock selected"}>
              <Show when={allLocked()} fallback={<><Lock size={12} class="mr-1" />Lock</>}><Unlock size={12} class="mr-1" />Unlock</Show>
            </button>
          </div>
          <div class="flex space-x-1">
            <button class={ACTION} onClick={props.onDuplicateSelected} title="Duplicate selected elements"><Copy size={12} class="mr-1" />Duplicate</button>
            <button class={ACTION} onClick={() => useCADStore.getState().setActiveTool("move")} title="Move selected elements"><Move size={12} class="mr-1" />Move</button>
          </div>
          <div class="relative">
            <button class="w-full flex items-center justify-center px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-xs"
              onClick={() => setShowLayerDropdown(!showLayerDropdown())} title="Move to layer">
              <Layers size={12} class="mr-1" />Move to Layer
            </button>
            <Show when={showLayerDropdown()}>
              <div class="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded shadow-lg z-10 max-h-40 overflow-y-auto">
                <For each={layers.layers}>{(layer) =>
                  <button class="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center" onClick={() => moveToLayer(layer.id)}>
                    <div class="w-2 h-2 rounded-full mr-2" style={{ "background-color": layer.color }} />
                    {layer.name}
                  </button>}</For>
              </div>
            </Show>
          </div>
          <Show when={count() > 1}>
            <button class="w-full flex items-center justify-center px-2 py-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded text-xs" onClick={props.onCreateComponent} title="Create component from selection">
              <Box size={12} class="mr-1" />Create Component
            </button>
          </Show>
          <button class="w-full flex items-center justify-center px-2 py-1.5 bg-red-500 text-white hover:bg-red-600 rounded text-xs" onClick={props.onDeleteSelected} title="Delete selected elements">
            <Trash2 size={12} class="mr-1" />Delete
          </button>
        </div>
      </Show>
    </Motion.div>
  )
}
