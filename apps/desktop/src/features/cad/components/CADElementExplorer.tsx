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
          <Show when={kind() === "rectangle"} fallback={<Box size={14} class="text-[color:var(--ent-text-muted)]" />}><Square size={14} class="text-[color:var(--ent-text-muted)]" /></Show>
        }><Circle size={14} class="text-[color:var(--ent-text-muted)]" /></Show>
      }><Box size={14} class="text-[color:var(--ent-text-muted)]" /></Show>
    }><Folder size={14} class="text-[color:var(--ent-text-muted)]" /></Show>
  )
}

const ACTION = "p-2 bg-[color:var(--ent-surface)] hover:bg-[color:var(--ent-surface-subtle)] rounded-md text-[color:var(--ent-text)] flex items-center justify-center text-xs border border-[color:var(--ent-line)] transition-colors"
const STAT = "text-[color:var(--ent-text)] font-mono tabular-nums"
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

  const selectNode = (id: string, event?: MouseEvent | KeyboardEvent) => {
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
           class={`workstation-browser-row workstation-browser-row--cad flex items-center px-2 py-2 cursor-pointer text-sm group transition-colors duration-150 border-l-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--ent-accent)] ${isSelected() ? "border-l-[color:var(--ent-accent)] bg-[color:var(--ent-accent-soft)] text-[color:var(--ent-accent)]" : "hover:bg-[color:var(--ent-surface-subtle)] border-l-transparent text-[color:var(--ent-text)]"}`}
          style={{ "padding-left": `${nodeProps.depth * 16 + 8}px` }}
          role="button"
          tabIndex={0}
          aria-pressed={isSelected()}
          onClick={(event) => selectNode(nodeProps.node.id, event)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectNode(nodeProps.node.id, event) }
            else if (event.key === "F2") { event.preventDefault(); browser.startRename(nodeProps.node.id) }
          }}
        >
          <Show when={hasChildren()} fallback={<span class="mr-2 w-[18px] shrink-0" aria-hidden="true" />}>
            <button type="button" class="mr-2 p-0.5 rounded hover:bg-[color:var(--ent-surface-inset)] transition-colors" aria-label={t("browser.toggleSection", { name: nodeProps.node.name })} aria-expanded={isExpanded()} onClick={(event) => { event.stopPropagation(); setExpanded((previous) => ({ ...previous, [nodeProps.node.id]: !previous[nodeProps.node.id] })) }}>
              <Show when={isExpanded()} fallback={<ChevronRight size={14} class="text-[color:var(--ent-text-muted)]" />}><ChevronDown size={14} class="text-[color:var(--ent-text-muted)]" /></Show>
            </button>
          </Show>
          <div class="mr-2 flex-shrink-0"><ElementIcon type={nodeProps.node.type} /></div>
          <RenameName id={nodeProps.node.id} name={nodeProps.node.name} browser={browser} />
           <span class="workstation-browser-type text-[color:var(--ent-text-muted)]">{nodeProps.node.type}</span>
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
      opacity: (element.opacity as number | undefined) ?? 1
    }
  })

  const Row = (rowProps: { label: string; children: JSX.Element }): JSX.Element =>
    <div class="flex justify-between gap-3"><span class="text-[color:var(--ent-text-muted)]">{rowProps.label}</span><span class="text-[color:var(--ent-text)]">{rowProps.children}</span></div>

  return (
    <div class="sidebar-browser flex flex-col w-full">
      <div class="p-3 flex items-center justify-between border-b border-[color:var(--ent-line)]">
        <div class="flex items-center">
          <List size={16} class="text-[color:var(--ent-text-muted)] mr-2" />
          <h3 class="text-sm font-semibold text-[color:var(--ent-text)]">{t("cad.explorer.title")}</h3>
          <span class="ml-2 px-2 py-0.5 text-xs tabular-nums bg-[color:var(--ent-accent-soft)] text-[color:var(--ent-accent)] rounded-full">{elements.elements.length}</span>
        </div>
      </div>

      <div class="p-3 border-b border-[color:var(--ent-line)]">
        <div class="relative">
          <input
            type="text" placeholder={t("cad.explorer.search")} value={query()} onInput={(event) => setQuery(event.currentTarget.value)}
            class="w-full pl-3 pr-3 py-2 text-sm border border-[color:var(--ent-line-strong)] rounded-md bg-[color:var(--ent-surface)] text-[color:var(--ent-text)] placeholder-[color:var(--ent-text-faint)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ent-accent)] focus:border-[color:var(--ent-accent)]"
          />
        </div>
      </div>

      <div class="flex justify-center px-3 py-2 border-b border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)]">
        <button class="text-xs text-[color:var(--ent-text-muted)] hover:text-[color:var(--ent-text)] mr-4 px-2 py-1 rounded hover:bg-[color:var(--ent-surface-inset)]" onClick={expandAll}>{t("cad.explorer.expandAll")}</button>
        <button class="text-xs text-[color:var(--ent-text-muted)] hover:text-[color:var(--ent-text)] px-2 py-1 rounded hover:bg-[color:var(--ent-surface-inset)]" onClick={() => setExpanded({})}>{t("cad.explorer.collapseAll")}</button>
      </div>

      <OriginBlock />
      <BrowserToolbar browser={browser} />

      <Show when={selection.selectedElementIds.length > 0}>
        <div class="px-3 py-2 border-b border-[color:var(--ent-line)] bg-[color:var(--ent-accent-soft)] text-[color:var(--ent-accent)] text-sm text-center font-medium">
          {t(selection.selectedElementIds.length === 1 ? "cad.explorer.selectedOne" : "cad.explorer.selectedMany", { count: selection.selectedElementIds.length })}
        </div>
        <div class="p-3 border-b border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)]">
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class={ACTION} aria-pressed={multiSelect()} onClick={() => setMultiSelect(!multiSelect())} title={multiSelect() ? t("cad.explorer.multiOff") : t("cad.explorer.multiOn")}>
              <span class="w-3 h-3 rounded-sm border mr-2 border-[color:var(--ent-line-strong)] flex items-center justify-center">
                <Show when={multiSelect()}><span class="w-2 h-2 bg-[color:var(--ent-action)] rounded-sm" /></Show>
              </span>
              {t("cad.explorer.multi")}
            </button>
            <button class={ACTION} onClick={hideSelected} title={t("cad.explorer.hideSelected")}><EyeOff size={14} class="mr-1" />{t("browser.hide")}</button>
            <button class={ACTION} onClick={() => selection.duplicateSelection()} title={t("cad.explorer.copyTitle")}><Copy size={14} class="mr-1" />{t("cad.explorer.copy")}</button>
            <button class="p-2 bg-[color:var(--ent-bad-soft)] hover:opacity-80 rounded-md text-[color:var(--ent-bad)] flex items-center justify-center text-xs border border-[color:var(--ent-bad)] transition-colors" onClick={deleteSelected} title={t("cad.explorer.deleteSelected")}>
              <Trash2 size={14} class="mr-1" />{t("browser.delete")}
            </button>
          </div>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto">
        <Show when={filtered().length > 0 || browser.mode() === "layer"} fallback={
          <div class="p-4 text-center text-sm text-[color:var(--ent-text-muted)] ">{query() ? t("cad.explorer.noMatch") : t("cad.explorer.noneInProject")}</div>
        }>
          <div class="py-1">
            <BrowserSections roots={filtered()} browser={browser} renderNode={(node) => <Node node={node} depth={0} />} emptyText={t("cad.explorer.noneInProject")} />
          </div>
        </Show>
      </div>

      <Show when={showProperties() ? properties() : null}>{(info) =>
        <div class="border-t border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)]">
          <div class="flex items-center justify-between p-3 border-b border-[color:var(--ent-line)]">
            <h4 class="text-sm font-semibold text-[color:var(--ent-text)]">{t("cad.properties")}</h4>
            <button onClick={() => setShowProperties(false)} class="p-1 text-[color:var(--ent-text-muted)] hover:text-[color:var(--ent-text)] rounded hover:bg-[color:var(--ent-surface-inset)]" aria-label={t("cad.explorer.closeProperties")}><X size={14} /></button>
          </div>
          <div class="p-3 max-h-64 overflow-y-auto space-y-3">
            <div>
              <h5 class="text-xs font-medium text-[color:var(--ent-text-muted)] mb-2">{t("cad.explorer.basic")}</h5>
              <div class="space-y-2 text-xs">
                <Row label={t("cad.explorer.name")}><span class="font-medium">{info().name}</span></Row>
                <Row label={t("cad.explorer.type")}>{info().type}</Row>
                <Row label={t("cad.explorer.layer")}>{info().layer}</Row>
              </div>
            </div>
            <div>
              <h5 class="text-xs font-medium text-[color:var(--ent-text-muted)] mb-2">{t("cad.explorer.transform")}</h5>
              <div class="grid grid-cols-3 gap-2 text-xs">
                <div><span class="text-[color:var(--ent-text-muted)] block">X:</span><span class={STAT}>{info().position.x.toFixed(2)}</span></div>
                <div><span class="text-[color:var(--ent-text-muted)] block">Y:</span><span class={STAT}>{info().position.y.toFixed(2)}</span></div>
                <div><span class="text-[color:var(--ent-text-muted)] block">Z:</span><span class={STAT}>{info().position.z.toFixed(2)}</span></div>
              </div>
            </div>
            <Show when={info().width || info().height || info().radius}>
              <div>
                <h5 class="text-xs font-medium text-[color:var(--ent-text-muted)] mb-2">{t("cad.explorer.dimensions")}</h5>
                <div class="space-y-2 text-xs">
                  <Show when={info().width}><Row label={t("cad.explorer.width")}><span class={STAT}>{info().width!.toFixed(2)}</span></Row></Show>
                  <Show when={info().height}><Row label={t("cad.explorer.height")}><span class={STAT}>{info().height!.toFixed(2)}</span></Row></Show>
                  <Show when={info().radius}><Row label={t("cad.explorer.radius")}><span class={STAT}>{info().radius!.toFixed(2)}</span></Row></Show>
                </div>
              </div>
            </Show>
            <div>
              <h5 class="text-xs font-medium text-[color:var(--ent-text-muted)] mb-2">{t("cad.explorer.appearance")}</h5>
              <div class="space-y-2 text-xs">
                <Row label={t("cad.explorer.material")}>{info().material}</Row>
                <div class="flex justify-between items-center gap-3">
                  <span class="text-[color:var(--ent-text-muted)]">{t("cad.explorer.color")}</span>
                  <div class="flex items-center space-x-2">
                    <div class="w-4 h-4 rounded border border-[color:var(--ent-line-strong)]" style={{ "background-color": info().color }} />
                    <span class={STAT}>{info().color}</span>
                  </div>
                </div>
                <Row label={t("cad.explorer.opacity")}><span class={STAT}>{(info().opacity * 100).toFixed(0)}%</span></Row>
              </div>
            </div>
            <div>
              <h5 class="text-xs font-medium text-[color:var(--ent-text-muted)] mb-2">{t("cad.explorer.status")}</h5>
              <div class="flex space-x-4 text-xs">
                <div class="flex items-center space-x-1">
                  <Show when={info().visible} fallback={<EyeOff size={12} class="text-[color:var(--ent-text-faint)]" />}><Eye size={12} class="text-[color:var(--ent-ok)]" /></Show>
                  <span class={info().visible ? "text-[color:var(--ent-ok)]" : "text-[color:var(--ent-text-muted)]"}>{info().visible ? t("cad.explorer.visible") : t("cad.explorer.hidden")}</span>
                </div>
                <div class="flex items-center space-x-1">
                  <Show when={info().locked} fallback={<Unlock size={12} class="text-[color:var(--ent-text-faint)]" />}><Lock size={12} class="text-[color:var(--ent-warn)]" /></Show>
                  <span class={info().locked ? "text-[color:var(--ent-warn)]" : "text-[color:var(--ent-text-muted)]"}>{info().locked ? t("cad.explorer.locked") : t("cad.explorer.unlocked")}</span>
                </div>
              </div>
            </div>
            <div class="pt-2 border-t border-[color:var(--ent-line)]">
              <div class="flex justify-end">
                <button onClick={() => selection.duplicateSelection()} class="px-3 py-1.5 text-xs bg-[color:var(--ent-surface-subtle)] text-[color:var(--ent-text-muted)] rounded border border-[color:var(--ent-line)] hover:bg-[color:var(--ent-surface-inset)] transition-colors">{t("browser.duplicate")}</button>
              </div>
            </div>
          </div>
        </div>}
      </Show>
    </div>
  )
}
