import { For, Show, createEffect, createSignal, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { AlertCircle, Save } from "lucide-solid"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLocalComponentsLibraryStore } from "../store/localComponentsLibraryStore.ts"
import { elementMetadataExtractors, generateSuggestedTags } from "../lib/elementMetadata.ts"

interface Props { onSaveComplete?: () => void }

const FIELD = "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
const LABEL = "block text-sm font-medium text-gray-700 mb-1"
const TYPES = ["mechanical", "geometric", "structural", "reference", "annotation", "manufacturing", "composite", "custom"]

const describe = (element: any): string => {
  const name = element.type.charAt(0).toUpperCase() + element.type.slice(1)
  switch (element.type) {
    case "cube": return `${name}: ${element.width}×${element.height}×${element.depth}`
    case "rectangle": return `${name}: ${element.width}×${element.height}`
    case "circle": case "sphere": return `${name}: R=${element.radius}`
    case "cylinder": case "cone": return `${name}: R=${element.radius}, H=${element.height}`
    default: return name
  }
}

/** The "save to library" button of the property panel and its dialog; stores the element in the local components library. */
export default function SaveElementToLibrary(props: Props): JSX.Element {
  const elements = useElementsStore()
  const library = useLocalComponentsLibraryStore()
  const [open, setOpen] = createSignal(false)
  const [form, setForm] = createSignal({ name: "", description: "", type: "mechanical", tags: "" })
  const [error, setError] = createSignal<string | null>(null)
  const [success, setSuccess] = createSignal<string | null>(null)
  const extractor = (type: string) => elementMetadataExtractors[type] ?? elementMetadataExtractors.default!

  createEffect(() => {
    const selected = elements.selectedElement
    if (!selected || !open()) return
    const { type, specifications } = extractor(selected.type)(selected)
    let description = `${selected.type.charAt(0).toUpperCase() + selected.type.slice(1)} element`
    if (selected.type === "cube" || selected.type === "rectangle") description += ` (${selected.width} × ${selected.height}${selected.depth ? ` × ${selected.depth}` : ""})`
    else if (selected.type === "circle" || selected.type === "sphere") description += ` (radius: ${selected.radius})`
    else if (selected.type === "cylinder" || selected.type === "cone") description += ` (radius: ${selected.radius}, height: ${selected.height})`
    setForm({
      name: selected.name || `${selected.type.charAt(0).toUpperCase() + selected.type.slice(1)}-${Date.now().toString().slice(-6)}`,
      description, type, tags: generateSuggestedTags(selected, selected.type, specifications).join(", ")
    })
  })

  const openDialog = () => {
    if (!elements.selectedElement) { setError("Please select an element first"); setTimeout(() => setError(null), 3000); return }
    setOpen(true)
  }

  const save = () => {
    const selected = elements.selectedElement
    if (!selected) return
    try {
      const tags = form().tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      const { specifications } = extractor(selected.type)(selected)
      library.addComponent({
        name: form().name, description: form().description, type: form().type, tags,
        data: { ...selected, id: undefined, selected: undefined },
        meta: { specifications, elementType: selected.type }
      })
      setSuccess("Component saved to library successfully")
      setTimeout(() => setSuccess(null), 3000)
      setOpen(false)
      props.onSaveComplete?.()
    } catch (cause) {
      setError("Failed to save component to library")
      console.error("Error saving component:", cause)
    }
  }

  const change = (name: string, value: string) => setForm((previous) => ({ ...previous, [name]: value }))

  return (
    <>
      <Motion.button hover={{ scale: 1.1 }} press={{ scale: 0.9 }} onClick={openDialog} class="p-1 rounded-full text-blue-600 hover:bg-blue-100 focus:outline-none" title="Save Element to Library" disabled={!elements.selectedElement}>
        <Save size={18} />
      </Motion.button>
      <Show when={error()}><div class="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 flex items-center" role="alert"><AlertCircle size={16} class="mr-2" />{error()}</div></Show>
      <Show when={success()}><div class="fixed bottom-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50" role="status">{success()}</div></Show>

      <Show when={open()}>
        <div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-xl max-w-md w-full">
            <div class="px-6 py-4 border-b flex justify-between items-center">
              <h3 class="text-lg font-medium text-gray-900">Save Element to Library</h3>
              <Show when={elements.selectedElement}>{(selected) => <span class="text-xs text-gray-500">{describe(selected())}</span>}</Show>
            </div>
            <div class="px-6 py-4">
              <div class="mb-4"><label for="name" class={LABEL}>Component Name</label><input type="text" id="name" name="name" class={FIELD} value={form().name} onInput={(e) => change("name", e.currentTarget.value)} required /></div>
              <div class="mb-4">
                <label for="type" class={LABEL}>Component Type</label>
                <select id="type" name="type" class={FIELD} value={form().type} onChange={(e) => change("type", e.currentTarget.value)}>
                  <For each={TYPES}>{(type) => <option value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>}</For>
                </select>
              </div>
              <div class="mb-4"><label for="description" class={LABEL}>Description (optional)</label><textarea id="description" name="description" rows={3} class={FIELD} value={form().description} onInput={(e) => change("description", e.currentTarget.value)} /></div>
              <div class="mb-4"><label for="tags" class={LABEL}>Tags (comma separated, optional)</label><input type="text" id="tags" name="tags" class={FIELD} value={form().tags} onInput={(e) => change("tags", e.currentTarget.value)} placeholder="e.g. bracket, 3d, custom" /></div>
              <Show when={elements.selectedElement}>{(selected) =>
                <div class="mb-4 bg-blue-50 p-3 rounded-md">
                  <h4 class="text-sm font-medium text-blue-900 mb-2">Element Properties</h4>
                  <div class="grid grid-cols-2 gap-2 text-sm text-gray-700">
                    <For each={Object.entries(selected()).filter(([key]) => !["id", "selected", "layerId"].includes(key)).slice(0, 6)}>{([key, value]) =>
                      <div class="flex flex-col"><span class="text-xs text-gray-500 capitalize">{key}:</span><span>{typeof value === "object" ? JSON.stringify(value).slice(0, 20) : String(value).slice(0, 20)}</span></div>}
                    </For>
                  </div>
                </div>}
              </Show>
            </div>
            <div class="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
              <button type="button" class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" class="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" onClick={save} disabled={!form().name}>Save to Library</button>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
