import { For, Match, Show, Switch, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js"
import { ChevronDown, ChevronRight, Eye, EyeOff, Layers, Lock, RefreshCw, Search, Settings, Trash2, Unlock, X } from "lucide-solid"
import { Motion } from "solid-motionone"
import { useElementsStore, type Element } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { t } from "../../../i18n/index.ts"

interface ElementsListPanelProps { onClose?: () => void; width?: number }

const ElementIcon = (props: { type: string }): JSX.Element => (
  <Switch fallback={<div class="w-4 h-4 border border-current rounded-sm" />}>
    <Match when={props.type === "rectangle"}><div class="w-4 h-3 border border-current" /></Match>
    <Match when={props.type === "circle"}><div class="w-4 h-4 rounded-full border border-current" /></Match>
    <Match when={props.type === "line"}><div class="w-4 h-0.5 bg-current" /></Match>
    <Match when={props.type === "cube"}><div class="w-4 h-4 bg-current opacity-30" /></Match>
    <Match when={props.type === "sphere"}><div class="w-4 h-4 rounded-full bg-current opacity-30" /></Match>
    <Match when={props.type === "cylinder"}><div class="w-3 h-4 bg-current opacity-30 rounded-sm" /></Match>
    <Match when={props.type === "cone"}><div class="w-0 h-0 border-left-4 border-right-4 border-bottom-8 border-solid border-current opacity-50" /></Match>
    <Match when={props.type === "component"}><div class="w-4 h-4 border border-current border-dashed" /></Match>
  </Switch>
)

/** The searchable, groupable list of every element with visibility, lock and delete actions. */
export default function ElementsListPanel(props: ElementsListPanelProps): JSX.Element {
  const elements = useElementsStore()
  const layers = useLayerStore()
  const selection = useSelectionStore()
  const [filter, setFilter] = createSignal("")
  const [selectedLayer, setSelectedLayer] = createSignal<string | null>(null)
  const [sortBy, setSortBy] = createSignal<"name" | "type" | "layer">("name")
  const [sortDirection, setSortDirection] = createSignal<"asc" | "desc">("asc")
  const [expandedLayers, setExpandedLayers] = createSignal<Record<string, boolean>>({})
  const [groupByLayer, setGroupByLayer] = createSignal(true)
  const [showSettings, setShowSettings] = createSignal(false)
  const [focused, setFocused] = createSignal(0)
  let scroller: HTMLDivElement | undefined
  let panel: HTMLDivElement | undefined
  let search: HTMLInputElement | undefined
  void showSettings

  createEffect(() => { setExpandedLayers(Object.fromEntries(layers.layers.map((l) => [l.id, true]))) })
  const toggleLayer = (id: string) => setExpandedLayers({ ...expandedLayers(), [id]: !expandedLayers()[id] })

  const processed = createMemo<ReadonlyArray<Element>>(() => {
    let list = elements.elements
    const term = filter().toLowerCase()
    if (term) list = list.filter((e) => e.name?.toLowerCase().includes(term) || e.type.toLowerCase().includes(term) || e.id.toLowerCase().includes(term))
    if (selectedLayer()) list = list.filter((e) => e.layerId === selectedLayer())
    const key = (e: Element) => sortBy() === "type" ? e.type : sortBy() === "layer" ? e.layerId : (e.name || `${e.type}-${e.id.slice(0, 6)}`)
    return [...list].sort((a, b) => (sortDirection() === "asc" ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))))
  })
  const groups = createMemo(() => {
    if (!groupByLayer()) return [] as Array<[string, Element[]]>
    const by: Record<string, Element[]> = {}
    for (const e of processed()) (by[e.layerId] ??= []).push(e)
    return Object.entries(by)
  })

  // The list's own keys live on the panel (the search box included, as its hint says): arrows move, Enter selects. They used
  // to be read from the whole window, so Enter (apply a transform) and Esc (cancel) reached the list wherever the focus was.
  // Esc is the editor's `edit.cancel`.
  onMount(() => {
    const list = panel
    if (list === undefined) return
    const down = (e: KeyboardEvent) => {
      const items = processed()
      switch (e.key) {
        case "ArrowDown": e.preventDefault(); setFocused((p) => Math.min(p + 1, items.length - 1)); break
        case "ArrowUp": e.preventDefault(); setFocused((p) => Math.max(p - 1, 0)); break
        case "Enter": { const item = items[focused()]; if (item) { selection.selectElement(item.id); e.preventDefault() } break }
        case "Escape": setFocused(0); break
      }
    }
    list.addEventListener("keydown", down)
    onCleanup(() => list.removeEventListener("keydown", down))
  })
  createEffect(on([focused, processed], () => {
    if (scroller && processed()[focused()]) scroller.scrollTo({ top: focused() * 60, behavior: "smooth" })
  }))

  const select = (id: string, event: MouseEvent) => {
    const ids = selection.selectedElementIds
    if (event.ctrlKey || event.metaKey) {
      selection.selectMultiple(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
    } else if (event.shiftKey && ids.length > 0) {
      const all = processed().map((e) => e.id)
      const last = all.indexOf(ids[ids.length - 1]!), current = all.indexOf(id)
      if (last >= 0 && current >= 0) {
        const range = all.slice(Math.min(last, current), Math.max(last, current) + 1)
        selection.selectMultiple([...ids.filter((x) => !range.includes(x)), ...range])
      }
    } else selection.selectElement(id)
  }
  const reset = () => { setSortBy("name"); setSortDirection("asc"); setFilter(""); setSelectedLayer(null) }

  const item = (element: Element, index: number): JSX.Element => {
    const isSelected = () => selection.selectedElementIds.includes(element.id)
    const isFocused = () => index === focused()
    const layer = () => layers.layers.find((l) => l.id === element.layerId)
    return (
      <Motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
        class={`rounded ${isSelected() ? "bg-blue-100 dark:bg-blue-800" : isFocused() ? "bg-gray-100 dark:bg-gray-600" : "bg-white dark:bg-gray-700"} border ${isSelected() ? "border-blue-500" : isFocused() ? "border-blue-300 dark:border-blue-500" : "border-gray-200"} shadow-sm hover:shadow transition-all duration-150 will-change-transform`}>
        <div class="flex items-center p-2 cursor-pointer" onClick={(e) => select(element.id, e)}>
          <div class="flex-shrink-0 mr-2 text-gray-500"><ElementIcon type={element.type} /></div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{element.name || `${element.type}-${element.id.slice(0, 6)}`}</div>
            <div class="text-xs text-gray-500 flex items-center">
              <span class="truncate flex items-center">
                <div class="w-2 h-2 rounded-full mr-1" style={{ "background-color": layer()?.color || "#ccc" }} />
                <span class="mr-2">{layer()?.name || "No Layer"}</span>
                <span class="italic opacity-60">{element.type}</span>
              </span>
            </div>
          </div>
          <div class="flex-shrink-0 flex items-center space-x-1">
            <button class={`p-1 rounded ${element.visible ? "hover:bg-gray-200" : "bg-gray-200 text-gray-500"}`} title={element.visible ? t("cad.createComponent.hide") : t("cad.createComponent.show")}
              onClick={(e) => { e.stopPropagation(); elements.updateElement(element.id, { visible: !element.visible }) }}>
              <Show when={element.visible} fallback={<EyeOff size={14} />}><Eye size={14} /></Show>
            </button>
            <button class={`p-1 rounded ${!element.locked ? "hover:bg-gray-200" : "bg-gray-200 text-gray-500"}`} title={element.locked ? t("browser.unlock") : t("cad.lock")}
              onClick={(e) => { e.stopPropagation(); elements.updateElement(element.id, { locked: !element.locked }) }}>
              <Show when={element.locked} fallback={<Unlock size={14} />}><Lock size={14} /></Show>
            </button>
            <button class="p-1 hover:bg-gray-200 rounded text-red-500" title={t("cad.customElements.delete")}
              onClick={(e) => {
                e.stopPropagation()
                elements.deleteElement(element.id)
                const ids = selection.selectedElementIds
                if (ids.includes(element.id)) selection.selectMultiple(ids.filter((x) => x !== element.id))
              }}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </Motion.div>
    )
  }

  return (
    <div ref={panel} class="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-lg rounded-lg flex flex-col h-full max-h-[80vh]" style={{ width: `${props.width ?? 300}px` }}>
      <div class="flex justify-between items-center p-3 border-b">
        <h3 class="font-medium text-md">Elements List ({elements.elements.length})</h3>
        <div class="flex items-center space-x-1">
          <button class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" onClick={() => setShowSettings(!showSettings())} title={t("cad.list.settings")}><Settings size={18} /></button>
          <Show when={props.onClose}><button class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" onClick={props.onClose} title={t("cad.list.close")}><X size={18} /></button></Show>
        </div>
      </div>
      <div class="p-2 border-b border-gray-200 dark:border-gray-600">
        <div class="relative">
          <input ref={search} type="text" placeholder={t("cad.list.search")} value={filter()} onInput={(e) => setFilter(e.currentTarget.value)}
            class="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-black dark:text-white" />
          <Search size={16} class="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
      </div>
      <div class="p-2 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between text-xs">
        <div>
          <label class="mr-2">{t("cad.list.groupBy")}</label>
          <button class={`px-2 py-1 rounded ${groupByLayer() ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-600"}`} onClick={() => setGroupByLayer(!groupByLayer())}>{t("cad.layer")}</button>
        </div>
        <button class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded" onClick={reset} title={t("cad.list.reset")}><RefreshCw size={14} /></button>
      </div>
      <div ref={scroller} tabindex={0}
        class="flex-grow overflow-y-auto p-2 min-h-0 scrollbar scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-800 hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500 scroll-smooth">
        <Show when={groupByLayer()} fallback={<div class="space-y-1"><For each={processed()}>{(element, index) => item(element, index())}</For></div>}>
          <For each={groups()}>{([layerId, list]) => {
            const layer = () => layers.layers.find((l) => l.id === layerId)
            return (
              <Show when={layer() && list.length > 0}>
                <div class="mb-2">
                  <div class="flex items-center justify-between p-1.5 bg-gray-100 dark:bg-gray-700 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 sticky top-0 z-10" onClick={() => toggleLayer(layerId)}>
                    <div class="flex items-center">
                      <div class="w-3 h-3 rounded-full mr-2" style={{ "background-color": layer()?.color || "#ccc" }} />
                      <span class="font-semibold text-sm">{layer()?.name} ({list.length})</span>
                    </div>
                    <Show when={expandedLayers()[layerId]} fallback={<ChevronRight size={16} />}><ChevronDown size={16} /></Show>
                  </div>
                  <Show when={expandedLayers()[layerId]}>
                    <div class="pl-3 pt-1 space-y-1"><For each={list}>{(element, index) => item(element, index())}</For></div>
                  </Show>
                </div>
              </Show>)
          }}</For>
        </Show>
        <Show when={processed().length > 0}>
          <div class="text-center py-2 text-xs text-gray-400 sticky bottom-0 bg-gradient-to-t from-[#F8FBFF] dark:from-gray-800 to-transparent">
            Total: {processed().length} {t("ai.header.elements")}
            <Show when={focused() >= 0}><span class="ml-2">| Selected: {focused() + 1}/{processed().length}</span></Show>
          </div>
        </Show>
      </div>
      <Show when={selection.selectedElementIds.length > 1}>
        <div class="p-3 border-t bg-blue-50 dark:bg-blue-900">
          <div class="text-sm mb-2">{selection.selectedElementIds.length} elements selected</div>
          <div class="flex space-x-2">
            <button class="flex items-center px-3 py-1.5 bg-blue-500 text-white rounded text-sm" onClick={() => { useSelectionStore.getState().saveAsComponent() }}>
              <Layers size={14} class="mr-1" />{t("cad.createComponent.title")}
            </button>
            <button class="flex items-center px-3 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-sm"
              onClick={() => {
                const target = window.prompt("Move to layer (enter layer ID):")
                if (!target) return
                if (layers.layers.some((l) => l.id === target)) useSelectionStore.getState().moveSelectionToLayer(target)
                else window.alert(t("cad.list.layerMissing"))
              }}>
              <Layers size={14} class="mr-1" />Move to Layer
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}
