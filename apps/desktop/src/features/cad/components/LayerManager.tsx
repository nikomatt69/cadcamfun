import { SidebarSection } from "../../../shared/components/panel/sidebar.tsx"
import { t } from "../../../i18n/index.ts"
import { For, Show, createSignal, type JSX } from "solid-js"
import { Edit, Eye, EyeOff, Layers, Lock, Plus, Save, Trash2, Unlock, X } from "lucide-solid"
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
    if (store.layers.length <= 1) { alert(t("cad.layers.cannotDeleteLast")); return }
    const count = elements.getElementsByLayerId(id).length
    if (count > 0 && !confirm(t("cad.layers.confirmDelete", { count }))) return
    store.deleteLayer(id)
  }

  const startEdit = (layer: Layer) => { setEditing(layer.id); setEditName(layer.name); setEditColor(layer.color) }
  const saveEdit = () => {
    const id = editing()
    if (id && editName().trim()) { store.updateLayer(id, { name: editName(), color: editColor() }); setEditing(null) }
  }

  return (
    <SidebarSection id="cad-layers" title={t("cad.layers")} icon={Layers} summary={String(store.layers.length)}>
      <div class="sidebar-layers">
        <div class="flex justify-end">
          <button type="button" onClick={() => setIsAdding(true)} class="panel-btn" disabled={isAdding()} aria-label={t("cad.layers.addAria")}>
            <Plus size={14} />{t("cad.addLayer")}
          </button>
        </div>

        <Show when={isAdding()}>
          <div class="sidebar-layer-add">
              <input
                type="text" placeholder={t("cad.layerName")} value={newName()} onInput={(e) => setNewName(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add() }}
                class="panel-input" autofocus
              />
              <button type="button" onClick={add} class="panel-btn panel-btn--primary">{t("cad.add")}</button>
              <button type="button" onClick={() => setIsAdding(false)} class="panel-btn">{t("common.cancel")}</button>
          </div>
        </Show>

        <div class="sidebar-layer-list">
          <For each={store.layers}>{(layer) =>
            <div
              class={`sidebar-layer ${store.activeLayer === layer.id ? "sidebar-layer--selected" : ""}`}
            >
              <Show when={editing() === layer.id} fallback={
                <div class="flex items-center justify-between p-2">
                  <button type="button" class="sidebar-layer__name" aria-pressed={store.activeLayer === layer.id} onClick={() => store.setActiveLayer(layer.id)} onDblClick={() => startEdit(layer)} title={t("cad.layers.selectHint")}>
                    <div class="w-4 h-4 rounded-full" style={{ "background-color": layer.color }} />
                    <span class="font-medium">{layer.name}</span>
                    <Show when={layer.locked}><span class="text-xs text-gray-500">{t("cad.layers.lockedTag")}</span></Show>
                  </button>
                  <div class="sidebar-layer__actions">
                    <button type="button" class={ICON_BUTTON} title={layer.visible ? t("cad.layers.hide") : t("cad.layers.show")}
                      onClick={(e: MouseEvent) => { e.stopPropagation(); store.updateLayer(layer.id, { visible: !layer.visible }) }}>
                      <Show when={layer.visible} fallback={<EyeOff size={16} />}><Eye size={16} /></Show>
                    </button>
                    <button type="button" class={ICON_BUTTON} title={layer.locked ? t("cad.layers.unlock") : t("cad.layers.lock")}
                      onClick={(e: MouseEvent) => { e.stopPropagation(); store.updateLayer(layer.id, { locked: !layer.locked }) }}>
                      <Show when={layer.locked} fallback={<Unlock size={16} />}><Lock size={16} /></Show>
                    </button>
                    <button type="button" class={ICON_BUTTON} title={t("cad.editLayer")}
                      onClick={(e: MouseEvent) => { e.stopPropagation(); startEdit(layer) }}>
                      <Edit size={16} />
                    </button>
                    <button type="button" class={ICON_BUTTON} title={t("cad.deleteLayer")} disabled={store.layers.length <= 1}
                      onClick={(e: MouseEvent) => { e.stopPropagation(); remove(layer.id) }}>
                      <Trash2 size={16} class={store.layers.length <= 1 ? "text-gray-300" : "text-red-500"} />
                    </button>
                  </div>
                </div>
              }>
                <div class="p-2">
                  <div class="flex items-center mb-2">
                    <input type="color" value={editColor()} onInput={(e) => setEditColor(e.currentTarget.value)} class="w-6 h-6 mr-2 border-0" />
                    <input type="text" value={editName()} onInput={(e) => setEditName(e.currentTarget.value)} class="flex-1 block border-gray-300 rounded-md shadow-sm dark:text-blue-400 focus:ring-blue-500 focus:border-blue-500 sm:text-xs" autofocus />
                  </div>
                  <div class="flex justify-end space-x-2">
                    <button type="button" onClick={saveEdit} class="panel-icon-btn text-green-700" aria-label={t("cad.layers.save")}><Save size={14} /></button>
                    <button type="button" onClick={() => setEditing(null)} class="panel-icon-btn text-red-600" aria-label={t("cad.layers.cancelEdit")}><X size={14} /></button>
                  </div>
                </div>
              </Show>
            </div>}
          </For>
        </div>

        <div class="sidebar-layer-summary">
          <span>{store.layers.length} layer{store.layers.length !== 1 ? "s" : ""}</span>
          <span>Active: {store.layers.find((layer) => layer.id === store.activeLayer)?.name || t("cad.transformNone")}</span>
        </div>
      </div>
    </SidebarSection>
  )
}
