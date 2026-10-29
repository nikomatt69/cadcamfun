import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { Motion, Presence } from "solid-motionone"
import { Box, ChevronDown, ChevronRight, Circle, Copy, Eye, EyeOff, Folder, List, Lock, Square, Trash2, Unlock, X } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { createBrowser } from "./browser/browserState.ts"
import { BrowserSections, BrowserToolbar, OriginBlock, RenameName, RowActions } from "./browser/BrowserParts.tsx"

interface CADElementExplorerProps { readonly width?: number; onElementSelect?: (id: string) => void }

interface ElementNode {
  id: string
  name: string
  type: string
  children: ElementNode[]
  visible: boolean
  locked: boolean
  layerId: string
}

const ElementIcon = (props: { type: string }): JSX.Element => {
  const kind = () => props.type.toLowerCase()
  return (
    <Show when={["group", "assembly"].includes(kind())} fallback={
      <Show when={["cube", "box"].includes(kind())} fallback={
        <Show when={["circle", "sphere"].includes(kind())} fallback={
          <Show when={kind() === "rectangle"} fallback={<Box size={16} class="text-gray-400" />}><Square size={16} class="text-yellow-400" /></Show>
        }><Circle size={16} class="text-green-400" /></Show>
      }><Box size={16} class="text-orange-400" /></Show>
    }><Folder size={16} class="text-blue-400" /></Show>
  )
}

const ACTION = "p-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md text-gray-700 dark:text-gray-300 flex items-center justify-center text-xs border border-gray-200 dark:border-gray-600 transition-colors"
const STAT = "text-gray-900 dark:text-gray-100 font-mono"
const GROUP_TYPES = ["group", "component", "custom", "composite"]

/** Hierarchical element list: search, expand/collapse, multi-select, hide/delete, and a read-only properties panel. */
export default function CADElementExplorer(props: CADElementExplorerProps): JSX.Element {
  const elements = useElementsStore()
  const layers = useLayerStore()
  const selection = useSelectionStore()
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})
  const [query, setQuery] = createSignal("")
  const [multiSelect, setMultiSelect] = createSignal(false)
  const browser = createBrowser()
  const [propertiesFor, setPropertiesFor] = createSignal<string | null>(null)
  const [showProperties, setShowProperties] = createSignal(false)

  const hierarchy = createMemo<ElementNode[]>(() => {
    const nodes: Record<string, ElementNode> = {}
    const roots: ElementNode[] = []
    for (const element of elements.elements) {
      nodes[element.id] = { id: element.id, name: element.name || `${element.type}-${element.id.slice(0, 6)}`, type: element.type, children: [], visible: element.visible !== false, locked: element.locked === true, layerId: element.layerId }
    }
    for (const element of elements.elements) {
      const node = nodes[element.id]!
      if (element.parentId) {
        const parent = nodes[element.parentId]
        if (parent) parent.children.push(node)
        else roots.push(node)
      } else if (GROUP_TYPES.includes(element.type)) {
        for (const childId of element.childrenIds ?? []) { const child = nodes[childId]; if (child) node.children.push(child) }
        roots.push(node)
      } else roots.push(node)
    }
    const childIds = new Set<string>()
    for (const node of Object.values(nodes)) for (const child of node.children) childIds.add(child.id)
    return roots.filter((node) => !childIds.has(node.id))
  })

  const filtered = createMemo(() => {
    const needle = query().toLowerCase()
    if (!needle) return hierarchy()
    const matches = (node: ElementNode): boolean => node.name.toLowerCase().includes(needle) || node.type.toLowerCase().includes(needle) || node.children.some(matches)
    return hierarchy().filter(matches)
  })

  // Reveal a selected element inside its collapsed parents.
  createEffect(on(() => [selection.selectedElementIds, elements.elements] as const, ([ids, all]) => {
    if (ids.length === 0) return
    const parents = (id: string): string[] => {
      const parentId = all.find((element) => element.id === id)?.parentId
      return parentId && all.some((element) => element.id === parentId) ? [parentId, ...parents(parentId)] : []
    }
    const open = parents(ids[0]!)
    if (open.length > 0) setExpanded((previous) => ({ ...previous, ...Object.fromEntries(open.map((id) => [id, true])) }))
  }))

  const selectNode = (id: string, event?: MouseEvent) => {
    if (!elements.elements.some((element) => element.id === id)) return
    const additive = !!event && (event.ctrlKey || event.metaKey || multiSelect())
    if (additive && selection.selectedElementIds.includes(id)) selection.deselectElement(id)
    else selection.selectElement(id, additive)
    setPropertiesFor(id)
    setShowProperties(true)
    props.onElementSelect?.(id)
  }

  const deleteSelected = () => {
    const count = selection.selectedElementIds.length
    if (count === 0 || !window.confirm(t("cad.explorer.confirmDelete", { count }))) return
    selection.deleteSelection()
  }

  const hideSelected = () => { for (const id of selection.selectedElementIds) elements.updateElement(id, { visible: false }) }
  const walk = (nodes: ElementNode[], visit: (node: ElementNode) => void) => { for (const node of nodes) { visit(node); walk(node.children, visit) } }
  const expandAll = () => { const all: Record<string, boolean> = {}; walk(hierarchy(), (node) => { all[node.id] = true }); setExpanded(all) }

  const Node = (nodeProps: { node: ElementNode; depth: number }): JSX.Element => {
    const isExpanded = () => expanded()[nodeProps.node.id] ?? false
    const isSelected = () => selection.selectedElementIds.includes(nodeProps.node.id)
    const hasChildren = () => nodeProps.node.children.length > 0
    const isVisible = () => nodeProps.node.visible && (layers.layers.find((layer) => layer.id === nodeProps.node.layerId)?.visible !== false)
    return (
      <div class="select-none">
        <div
           class={`workstation-browser-row workstation-browser-row--cad flex items-center px-2 py-2 cursor-pointer text-sm group transition-colors duration-150 border-l-2 ${isSelected() ? "border-l-blue-500 text-blue-700 dark:text-blue-300" : "hover:bg-gray-50 dark:hover:bg-gray-800/60 border-l-transparent text-gray-700 dark:text-gray-300"}`}
          style={{ "padding-left": `${nodeProps.depth * 16 + 8}px` }}
          onClick={(event) => selectNode(nodeProps.node.id, event)}
        >
          <button class="mr-2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" onClick={(event) => { event.stopPropagation(); if (hasChildren()) setExpanded((previous) => ({ ...previous, [nodeProps.node.id]: !previous[nodeProps.node.id] })) }}>
            <Show when={hasChildren()} fallback={<div class="w-[14px]" />}>
              <Show when={isExpanded()} fallback={<ChevronRight size={14} class="text-gray-500 dark:text-gray-400" />}><ChevronDown size={14} class="text-gray-500 dark:text-gray-400" /></Show>
            </Show>
          </button>
          <div class="mr-2 flex-shrink-0"><ElementIcon type={nodeProps.node.type} /></div>
          <RenameName id={nodeProps.node.id} name={nodeProps.node.name} browser={browser} />
           <span class="workstation-browser-type text-gray-500 dark:text-gray-400">{nodeProps.node.type}</span>
          <RowActions id={nodeProps.node.id} visible={isVisible()} locked={nodeProps.node.locked} browser={browser} />
        </div>
        <Presence>
          <Show when={hasChildren() && isExpanded()}>
            <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
              <For each={nodeProps.node.children}>{(child) => <Node node={child} depth={nodeProps.depth + 1} />}</For>
            </Motion.div>
          </Show>
        </Presence>
      </div>
    )
  }

  const properties = createMemo(() => {
    const id = propertiesFor()
    const element = id ? elements.elements.find((candidate) => candidate.id === id) : undefined
    if (!element) return null
    return {
      name: element.name || `${element.type}-${element.id.slice(0, 6)}`,
      type: element.type,
      layer: layers.layers.find((layer) => layer.id === element.layerId)?.name || t("cad.explorer.unknownLayer"),
      visible: element.visible !== false,
      locked: !!element.locked,
      position: { x: element.x || 0, y: element.y || 0, z: element.z || 0 },
      width: element.width as number | undefined, height: element.height as number | undefined, radius: element.radius as number | undefined,
      material: (element.material as string | undefined) || t("cad.explorer.defaultMaterial"),
      color: typeof element.color === "string" ? element.color : "#1e88e5",
      opacity: (element.opacity as number | undefined) || 1
    }
  })

  const Row = (rowProps: { label: string; children: JSX.Element }): JSX.Element =>
    <div class="flex justify-between"><span class="text-gray-500">{rowProps.label}</span><span class="text-gray-900 dark:text-gray-100">{rowProps.children}</span></div>

  return (
    <div class="sidebar-browser flex flex-col w-full">
      <div class="p-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center">
          <List size={18} class="text-gray-600 dark:text-gray-400 mr-2" />
          <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("cad.explorer.title")}</h3>
          <span class="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">{elements.elements.length}</span>
        </div>
      </div>

      <div class="p-3 border-b border-gray-200 dark:border-gray-700">
        <div class="relative">
          <input
            type="text" placeholder={t("cad.explorer.search")} value={query()} onInput={(event) => setQuery(event.currentTarget.value)}
            class="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div class="flex justify-center px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button class="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mr-4 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" onClick={expandAll}>{t("cad.explorer.expandAll")}</button>
        <button class="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setExpanded({})}>{t("cad.explorer.collapseAll")}</button>
      </div>

      <OriginBlock />
      <BrowserToolbar browser={browser} />

      <Show when={selection.selectedElementIds.length > 0}>
        <div class="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm text-center font-medium">
          {t(selection.selectedElementIds.length === 1 ? "cad.explorer.selectedOne" : "cad.explorer.selectedMany", { count: selection.selectedElementIds.length })}
        </div>
        <div class="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div class="grid grid-cols-2 gap-2">
            <button class={ACTION} onClick={() => setMultiSelect(!multiSelect())} title={multiSelect() ? t("cad.explorer.multiOff") : t("cad.explorer.multiOn")}>
              <span class="w-3 h-3 rounded-sm border mr-2 border-gray-400 dark:border-gray-500 flex items-center justify-center">
                <Show when={multiSelect()}><span class="w-2 h-2 bg-blue-500 rounded-sm" /></Show>
              </span>
              {t("cad.explorer.multi")}
            </button>
            <button class={ACTION} onClick={hideSelected} title={t("cad.explorer.hideSelected")}><EyeOff size={14} class="mr-1" />{t("browser.hide")}</button>
            <button class={ACTION} onClick={() => selection.duplicateSelection()} title={t("cad.explorer.copyTitle")}><Copy size={14} class="mr-1" />{t("cad.explorer.copy")}</button>
            <button class="p-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md text-red-600 dark:text-red-400 flex items-center justify-center text-xs border border-red-200 dark:border-red-800 transition-colors" onClick={deleteSelected} title={t("cad.explorer.deleteSelected")}>
              <Trash2 size={14} class="mr-1" />{t("browser.delete")}
            </button>
          </div>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto">
        <Show when={filtered().length > 0 || browser.mode() === "layer"} fallback={
          <div class="p-4 text-center text-sm text-gray-500 dark:text-gray-400 italic">{query() ? t("cad.explorer.noMatch") : t("cad.explorer.noneInProject")}</div>
        }>
          <div class="py-1">
            <BrowserSections roots={filtered()} browser={browser} renderNode={(node) => <Node node={node} depth={0} />} emptyText={t("cad.explorer.noneInProject")} />
          </div>
        </Show>
      </div>

      <Show when={showProperties() ? properties() : null}>{(info) =>
        <div class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div class="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("cad.properties")}</h4>
            <button onClick={() => setShowProperties(false)} class="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700" aria-label={t("cad.explorer.closeProperties")}><X size={14} /></button>
          </div>
          <div class="p-3 max-h-64 overflow-y-auto space-y-3">
            <div>
              <h5 class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t("cad.explorer.basic")}</h5>
              <div class="space-y-2 text-xs">
                <Row label={t("cad.explorer.name")}><span class="font-medium">{info().name}</span></Row>
                <Row label={t("cad.explorer.type")}>{info().type}</Row>
                <Row label={t("cad.explorer.layer")}>{info().layer}</Row>
              </div>
            </div>
            <div>
              <h5 class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t("cad.explorer.transform")}</h5>
              <div class="grid grid-cols-3 gap-2 text-xs">
                <div><span class="text-gray-500 block">X:</span><span class={STAT}>{info().position.x.toFixed(2)}</span></div>
                <div><span class="text-gray-500 block">Y:</span><span class={STAT}>{info().position.y.toFixed(2)}</span></div>
                <div><span class="text-gray-500 block">Z:</span><span class={STAT}>{info().position.z.toFixed(2)}</span></div>
              </div>
            </div>
            <Show when={info().width || info().height || info().radius}>
              <div>
                <h5 class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t("cad.explorer.dimensions")}</h5>
                <div class="space-y-2 text-xs">
                  <Show when={info().width}><Row label={t("cad.explorer.width")}><span class={STAT}>{info().width!.toFixed(2)}</span></Row></Show>
                  <Show when={info().height}><Row label={t("cad.explorer.height")}><span class={STAT}>{info().height!.toFixed(2)}</span></Row></Show>
                  <Show when={info().radius}><Row label={t("cad.explorer.radius")}><span class={STAT}>{info().radius!.toFixed(2)}</span></Row></Show>
                </div>
              </div>
            </Show>
            <div>
              <h5 class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t("cad.explorer.appearance")}</h5>
              <div class="space-y-2 text-xs">
                <Row label={t("cad.explorer.material")}>{info().material}</Row>
                <div class="flex justify-between items-center">
                  <span class="text-gray-500">{t("cad.explorer.color")}</span>
                  <div class="flex items-center space-x-2">
                    <div class="w-4 h-4 rounded border border-gray-300" style={{ "background-color": info().color }} />
                    <span class={STAT}>{info().color}</span>
                  </div>
                </div>
                <Row label={t("cad.explorer.opacity")}><span class={STAT}>{(info().opacity * 100).toFixed(0)}%</span></Row>
              </div>
            </div>
            <div>
              <h5 class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t("cad.explorer.status")}</h5>
              <div class="flex space-x-4 text-xs">
                <div class="flex items-center space-x-1">
                  <Show when={info().visible} fallback={<EyeOff size={12} class="text-gray-400" />}><Eye size={12} class="text-green-500" /></Show>
                  <span class={info().visible ? "text-green-700 dark:text-green-400" : "text-gray-500"}>{info().visible ? t("cad.explorer.visible") : t("cad.explorer.hidden")}</span>
                </div>
                <div class="flex items-center space-x-1">
                  <Show when={info().locked} fallback={<Unlock size={12} class="text-gray-400" />}><Lock size={12} class="text-orange-500" /></Show>
                  <span class={info().locked ? "text-orange-700 dark:text-orange-400" : "text-gray-500"}>{info().locked ? t("cad.explorer.locked") : t("cad.explorer.unlocked")}</span>
                </div>
              </div>
            </div>
            <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div class="grid grid-cols-2 gap-2">
                <button class="px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">{t("cad.explorer.edit")}</button>
                <button onClick={() => selection.duplicateSelection()} class="px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">{t("browser.duplicate")}</button>
              </div>
            </div>
          </div>
        </div>}
      </Show>
    </div>
  )
}
