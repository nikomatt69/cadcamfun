import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { AlertCircle, Eye, EyeOff, Lock, Save, Unlock, X } from "lucide-solid"
import { Motion } from "solid-motionone"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"

interface ComponentCreationModalProps { readonly isOpen: boolean; onClose(): void }

/** Dialog that turns the selection into a reusable component (name, layer, tags, optionally keeping the originals). */
export default function ComponentCreationModal(props: ComponentCreationModalProps): JSX.Element {
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [targetLayer, setTargetLayer] = createSignal<string | null>(null)
  const [tags, setTags] = createSignal<string[]>([])
  const [tagInput, setTagInput] = createSignal("")
  const [advanced, setAdvanced] = createSignal(false)
  const [keepOriginals, setKeepOriginals] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const selection = useSelectionStore()
  const elements = useElementsStore()
  const layers = useLayerStore()
  const selected = createMemo(() => elements.elements.filter((el) => selection.selectedElementIds.includes(el.id)))
  const bounds = () => { selection.selectedElementIds; elements.elements; return useSelectionStore.getState().getSelectionBounds() }

  createEffect(on(() => props.isOpen, (open) => {
    if (!open) return
    const counts: Record<string, number> = {}
    for (const el of selected()) counts[el.type] = (counts[el.type] ?? 0) + 1
    setName(`Component-${Object.entries(counts).map(([type, n]) => `${n}×${type}`).join("-")}`)
    setDescription(""); setTargetLayer(layers.activeLayer); setTags([]); setTagInput(""); setAdvanced(false); setKeepOriginals(false); setError(null)
  }))

  const addTag = () => { const t = tagInput().trim(); if (t && !tags().includes(t)) { setTags([...tags(), t]); setTagInput("") } }
  const tagKey = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === "," || e.key === " ") { e.preventDefault(); addTag() } }

  const create = () => {
    if (!name().trim()) return setError("Component name is required")
    if (selected().length === 0) return setError("No elements selected")
    if (!targetLayer()) return setError("Target layer is required")
    try {
      let id: string
      if (keepOriginals()) {
        const b = bounds()
        if (!b) return setError("Could not calculate component bounds")
        id = useElementsStore.getState().addElement({
          type: "component", name: name(), description: description(), x: b.centerX, y: b.centerY, z: b.centerZ,
          width: b.width, height: b.height, depth: b.depth,
          elements: selected().map((e) => ({ ...e, x: e.x - b.centerX, y: e.y - b.centerY, z: (e.z || 0) - b.centerZ })),
          layerId: targetLayer(), tags: tags(),
          metadata: { createdAt: new Date().toISOString(), isComposite: true, elementCount: selected().length,
            elementTypes: Array.from(new Set(selected().map((e) => e.type))), originalElements: selected().map((e) => e.id) }
        })
      } else {
        id = useSelectionStore.getState().saveAsComponent()
        if (!id) return setError("Failed to create component")
        useElementsStore.getState().updateElement(id, { name: name(), description: description(), layerId: targetLayer()!, tags: tags() })
      }
      props.onClose()
    } catch (cause) {
      console.error("Error creating component:", cause)
      setError("An error occurred while creating the component")
    }
  }

  const FIELD = "w-full p-2 border dark:border-gray-600 dark:bg-gray-700 rounded"
  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <Motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} class="bg-white dark:bg-gray-800 dark:text-white rounded-lg shadow-xl w-full max-w-md">
          <div class="flex justify-between items-center border-b p-4">
            <h2 class="text-lg font-medium">Create Component</h2>
            <button class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" onClick={props.onClose}><X size={20} /></button>
          </div>
          <div class="p-4">
            <Show when={error()}>
              <div class="mb-4 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 p-3 rounded flex items-start">
                <AlertCircle size={18} class="mr-2 flex-shrink-0 mt-0.5" /><div>{error()}</div>
              </div>
            </Show>
            <div class="mb-4"><label class="block text-sm font-medium mb-1">Component Name <span class="text-red-500">*</span></label>
              <input type="text" class={FIELD} value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Enter component name" required /></div>
            <div class="mb-4"><label class="block text-sm font-medium mb-1">Description</label>
              <textarea class={FIELD} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} placeholder="Optional description" rows={3} /></div>
            <div class="mb-4"><label class="block text-sm font-medium mb-1">Target Layer <span class="text-red-500">*</span></label>
              <select class={FIELD} value={targetLayer() || layers.activeLayer} onChange={(e) => setTargetLayer(e.currentTarget.value)} required>
                <option value="">Select Layer</option>
                <For each={layers.layers}>{(layer) => <option value={layer.id}>{layer.name}</option>}</For>
              </select></div>
            <div class="mb-4"><label class="block text-sm font-medium mb-1">Tags</label>
              <div class="flex items-center">
                <input type="text" class="flex-1 p-2 border dark:border-gray-600 dark:bg-gray-700 rounded" value={tagInput()} onInput={(e) => setTagInput(e.currentTarget.value)} onKeyDown={tagKey} placeholder="Add tags (press Enter or comma)" />
                <button class="ml-2 px-3 py-2 bg-blue-500 text-white rounded" onClick={addTag}>Add</button>
              </div>
              <Show when={tags().length > 0}>
                <div class="flex flex-wrap mt-2">
                  <For each={tags()}>{(tag) =>
                    <div class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full text-sm mr-2 mb-2 flex items-center">
                      {tag}<button class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800" onClick={() => setTags(tags().filter((t) => t !== tag))}><X size={14} /></button>
                    </div>}</For>
                </div>
              </Show>
            </div>
            <div class="mb-4">
              <button class="text-sm text-blue-600 dark:text-blue-400 flex items-center" onClick={() => setAdvanced(!advanced())}>{advanced() ? "Hide" : "Show"} Advanced Settings</button>
              <Show when={advanced()}>
                <div class="mt-2 p-3 border rounded dark:border-gray-600 overflow-hidden">
                  <div class="flex items-center mb-2">
                    <input type="checkbox" id="keepOriginals" checked={keepOriginals()} onChange={(e) => setKeepOriginals(e.currentTarget.checked)} class="mr-2" />
                    <label for="keepOriginals" class="text-sm">Keep original elements</label>
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">When enabled, original elements will be preserved and the component will be created as a copy.</div>
                </div>
              </Show>
            </div>
            <div class="p-3 bg-gray-100 dark:bg-gray-700 rounded mb-4">
              <div class="text-sm font-medium mb-2 flex justify-between items-center">
                <span>Selected Elements ({selected().length})</span>
                <Show when={bounds()}>{(b) => <span class="text-xs text-gray-500 dark:text-gray-400">Size: {Math.round(b().width)}×{Math.round(b().height)}×{Math.round(b().depth)}</span>}</Show>
              </div>
              <div class="max-h-40 overflow-y-auto">
                <For each={selected()}>{(element) =>
                  <div class="text-sm py-1 border-b border-gray-200 dark:border-gray-600 last:border-b-0 flex justify-between items-center">
                    <div class="flex items-center"><span>{element.name || `${element.type}-${element.id.slice(0, 6)}`}</span></div>
                    <div class="flex items-center space-x-1">
                      <Show when={element.visible} fallback={<EyeOff size={12} />}><Eye size={12} /></Show>
                      <Show when={element.locked} fallback={<Unlock size={12} />}><Lock size={12} /></Show>
                    </div>
                  </div>}</For>
              </div>
            </div>
            <div class="flex justify-end space-x-3">
              <button class="px-4 py-2 border dark:border-gray-600 rounded" onClick={props.onClose}>Cancel</button>
              <button class="px-4 py-2 bg-blue-500 text-white rounded flex items-center disabled:opacity-50 disabled:cursor-not-allowed" onClick={create}
                disabled={!name().trim() || selected().length === 0 || !targetLayer()}>
                <Save size={16} class="mr-2" />Create Component
              </button>
            </div>
          </div>
        </Motion.div>
      </div>
    </Show>
  )
}
