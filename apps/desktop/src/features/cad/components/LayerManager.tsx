import { For, Show, createSignal, type JSX } from "solid-js"
import { Motion, Presence } from "solid-motionone"
import { Edit, Eye, EyeOff, Lock, Plus, Save, Trash2, Unlock, X } from "lucide-solid"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore, type Layer } from "../store/layerStore.ts"

const randomColor = () => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")
const ICON_BUTTON = "panel-icon-btn"

/** Layer list: select, rename/recolour (double click), show/hide, lock, delete, add. Port of the legacy panel. */
export default function LayerManager(): JSX.Element {
  const store = useLayerStore()
  const elements = useElementsStore()
  const [newName, setNewName] = createSignal("")
  const [isAdding, setIsAdding] = createSignal(false)
  const [editing, setEditing] = createSignal<string | null>(null)
  const [editName, setEditName] = createSignal("")
  const [editColor, setEditColor] = createSignal("")

  const add = () => {
    if (!newName().trim()) return
    store.addLayer({ name: newName(), visible: true, locked: false, color: randomColor() })
    setNewName("")
    setIsAdding(false)
  }

  const remove = (id: string) => {
    if (store.layers.length <= 1) { alert("Cannot delete the last layer"); return }
    const count = elements.getElementsByLayerId(id).length
    if (count > 0 && !confirm(`This layer contains ${count} elements. Delete anyway?`)) return
    store.deleteLayer(id)
  }

  const startEdit = (layer: Layer) => { setEditing(layer.id); setEditName(layer.name); setEditColor(layer.color) }
  const saveEdit = () => {
    const id = editing()
    if (id && editName().trim()) { store.updateLayer(id, { name: editName(), color: editColor() }); setEditing(null) }
  }

  return (
    <Motion.div class="panel-section sidebar-layers">
      <div class="panel-section__head sidebar-static-head">
        <Motion.h3 class="panel-section__title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>Layers</Motion.h3>
        <Motion.button onClick={() => setIsAdding(true)} class="p-1 rounded-full text-blue-600 hover:bg-blue-100 focus:outline-none" disabled={isAdding()} aria-label="Add layer">
          <Plus size={18} />
        </Motion.button>
      </div>

      <Presence>
        <Show when={isAdding()}>
          <Motion.div class="mb-4 flex items-center flex-col  space-x-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <input
              type="text" placeholder="Layer name" value={newName()} onInput={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add() }}
              class="panel-input" autofocus
            />
            <Motion.button onClick={add} class="px-3 py-1 bg-blue-600 text-white my-1 flex rounded-md hover:bg-blue-700 focus:outline-none text-sm">Add</Motion.button>
            <Motion.button onClick={() => setIsAdding(false)} class="px-3 py-1 bg-gray-300 text-gray-700 my-1 flex rounded-md hover:bg-gray-400 focus:outline-none text-sm">Cancel</Motion.button>
          </Motion.div>
        </Show>
      </Presence>

      <div class="sidebar-layer-list">
        <For each={store.layers}>{(layer) =>
          <Motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
            class={`sidebar-layer ${store.activeLayer === layer.id ? "sidebar-layer--selected" : ""}`}
          >
            <Show when={editing() === layer.id} fallback={
              <div class="flex items-center justify-between p-2" onClick={() => store.setActiveLayer(layer.id)} onDblClick={() => startEdit(layer)} title="Click to select, double-click to edit">
                <div class="sidebar-layer__name">
                  <Motion.div class="w-4 h-4 rounded-full" style={{ "background-color": layer.color }} />
                  <span class="font-medium text-gray-800 dark:text-blue-400 text-sm">{layer.name}</span>
                  <Show when={layer.locked}><span class="text-xs text-gray-500">(locked)</span></Show>
                </div>
                <div class="sidebar-layer__actions">
                  <Motion.button class={ICON_BUTTON} title={layer.visible ? "Hide Layer" : "Show Layer"}
                    onClick={(e: MouseEvent) => { e.stopPropagation(); store.updateLayer(layer.id, { visible: !layer.visible }) }}>
                    <Show when={layer.visible} fallback={<EyeOff size={16} />}><Eye size={16} /></Show>
                  </Motion.button>
                  <Motion.button class={ICON_BUTTON} title={layer.locked ? "Unlock Layer" : "Lock Layer"}
                    onClick={(e: MouseEvent) => { e.stopPropagation(); store.updateLayer(layer.id, { locked: !layer.locked }) }}>
                    <Show when={layer.locked} fallback={<Unlock size={16} />}><Lock size={16} /></Show>
                  </Motion.button>
                  <Motion.button class={ICON_BUTTON} title="Edit Layer"
                    onClick={(e: MouseEvent) => { e.stopPropagation(); startEdit(layer) }}>
                    <Edit size={16} />
                  </Motion.button>
                  <Motion.button class={ICON_BUTTON} title="Delete Layer" disabled={store.layers.length <= 1}
                    onClick={(e: MouseEvent) => { e.stopPropagation(); remove(layer.id) }}>
                    <Trash2 size={16} class={store.layers.length <= 1 ? "text-gray-300" : "text-red-500"} />
                  </Motion.button>
                </div>
              </div>
            }>
              <div class="p-2">
                <div class="flex items-center mb-2">
                  <input type="color" value={editColor()} onInput={(e) => setEditColor(e.currentTarget.value)} class="w-6 h-6 mr-2 border-0" />
                  <input type="text" value={editName()} onInput={(e) => setEditName(e.currentTarget.value)} class="flex-1 block border-gray-300 rounded-md shadow-sm dark:text-blue-400 focus:ring-blue-500 focus:border-blue-500 sm:text-xs" autofocus />
                </div>
                <div class="flex justify-end space-x-2">
                  <Motion.button onClick={saveEdit} class="p-1 rounded-full text-green-600 hover:bg-green-100" aria-label="Save layer"><Save size={14} /></Motion.button>
                  <Motion.button onClick={() => setEditing(null)} class="p-1 rounded-full text-red-600 hover:bg-red-100" aria-label="Cancel edit"><X size={14} /></Motion.button>
                </div>
              </div>
            </Show>
          </Motion.div>}
        </For>
      </div>

      <div class="sidebar-layer-summary">
        <span>{store.layers.length} layer{store.layers.length !== 1 ? "s" : ""}</span>
        <span>Active: {store.layers.find((layer) => layer.id === store.activeLayer)?.name || "None"}</span>
      </div>
    </Motion.div>
  )
}
