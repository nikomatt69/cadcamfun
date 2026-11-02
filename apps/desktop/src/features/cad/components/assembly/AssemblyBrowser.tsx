import { PanelCard } from "../../../../shared/components/panel/ui.tsx"
/**
 * The assembly tree (legacy `components/cad/assembly/AssemblyBrowser.tsx`).
 *
 * Nodes are grouped under the node they are parented to; selecting one makes it the parent of the
 * next node added and the subject of the joints and constraints panels. Adding is inline (a name and
 * a kind) rather than the legacy `prompt`, so the panel never blocks the editor.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { ChevronDown, ChevronRight, Trash2 } from "lucide-solid"
import { t, type Key } from "../../../../i18n/index.ts"
import { useAssemblyStore } from "../../store/assemblyStore.ts"
import type { AssemblyNode, NodeType } from "../../types/assembly.ts"

export interface AssemblyBrowserProps {
  /** Called after the user picked a node in the tree. */
  readonly onNodeSelect?: (nodeId: string) => void
}

const KIND_LABEL: Readonly<Record<NodeType, Key>> = {
  component: "cad.assembly.kindComponent",
  subassembly: "cad.assembly.kindSubassembly",
  group: "cad.assembly.kindGroup",
  elements: "cad.assembly.kindElements",
}

/** The node, and whether the tree has expanded it. */
function Row(props: {
  readonly node: AssemblyNode
  readonly depth: number
  readonly childrenOf: (id: string) => ReadonlyArray<AssemblyNode>
  readonly expanded: () => ReadonlySet<string>
  readonly toggle: (id: string) => void
  readonly onSelect: (id: string) => void
}): JSX.Element {
  const children = () => props.childrenOf(props.node.id)
  const open = () => props.expanded().has(props.node.id)
  const store = useAssemblyStore()

  return (
    <div>
      <div
        class={`py-1 px-2 flex items-center gap-1 text-sm ${store.activeNodeId === props.node.id ? "bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500" : "hover:bg-gray-50 dark:hover:bg-gray-700/40"}`}
        style={{ "padding-left": `${props.depth * 12 + 4}px` }}
      >
        <Show when={children().length > 0} fallback={<span class="h-7 w-7 shrink-0" aria-hidden="true" />}>
          <button type="button" class="panel-icon-btn shrink-0" aria-expanded={open()} aria-label={t("browser.toggleSection", { name: props.node.name })} onClick={() => props.toggle(props.node.id)}>
            <Show when={open()} fallback={<ChevronRight class="w-3 h-3 text-gray-500" />}><ChevronDown class="w-3 h-3 text-gray-500" /></Show>
          </button>
        </Show>
        <button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" aria-pressed={store.activeNodeId === props.node.id} onClick={() => props.onSelect(props.node.id)}>
          <span class="min-w-0 truncate text-gray-900 dark:text-gray-100">{props.node.name || `${props.node.type} ${props.node.id.slice(0, 4)}`}</span>
          <span class="shrink-0 text-xs text-gray-500 dark:text-gray-400">{t(KIND_LABEL[props.node.type])}</span>
        </button>
      </div>
      <Show when={children().length > 0 && open()}>
        <For each={children()}>{(child) => <Row node={child} depth={props.depth + 1} childrenOf={props.childrenOf} expanded={props.expanded} toggle={props.toggle} onSelect={props.onSelect} />}</For>
      </Show>
    </div>
  )
}

export default function AssemblyBrowser(props: AssemblyBrowserProps): JSX.Element {
  const store = useAssemblyStore()
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set<string>())
  const [adding, setAdding] = createSignal(false)
  const [name, setName] = createSignal("")
  const [kind, setKind] = createSignal<NodeType>("component")

  const nodes = (): Readonly<Record<string, AssemblyNode>> => store.assemblyState.nodes
  const childrenOf = (id: string): ReadonlyArray<AssemblyNode> => nodes()[id]?.children.map((child) => nodes()[child]).filter((node): node is AssemblyNode => node !== undefined) ?? []
  const roots = (): ReadonlyArray<AssemblyNode> => Object.values(nodes()).filter((node) => node.parent === null)
  const selected = (): AssemblyNode | undefined => (store.activeNodeId === null ? undefined : nodes()[store.activeNodeId])

  const toggle = (id: string): void => {
    const next = new Set(expanded())
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }

  const addNode = (): void => {
    const label = name().trim()
    if (!label) return
    const parentId = store.activeNodeId ?? null
    const position = { x: 0, y: 0, z: 0 }
    const rotation = { x: 0, y: 0, z: 0 }
    if (kind() === "subassembly") store.addSubassembly(label, position, rotation, parentId)
    else if (kind() === "group") store.addGroup(label, position, rotation, parentId)
    else store.addComponent(label, position, rotation, parentId, "", {})
    if (parentId !== null) setExpanded((previous) => new Set([...previous, parentId]))
    setName("")
    setAdding(false)
  }

  const removeSelected = (): void => {
    const node = selected()
    if (!node) return
    if (confirm(`${t("cad.assembly.confirmDelete")} "${node.name}"?`)) {
      store.removeNode(node.id)
      props.onNodeSelect?.("")
    }
  }

  return (
    <PanelCard title={t("cad.assembly.structure")} actions={<>
<div class="flex items-center gap-1">
          <button type="button" class="panel-btn" aria-expanded={adding()} onClick={() => setAdding(!adding())}>
            {adding() ? t("cad.assembly.cancel") : `+ ${t("cad.assembly.add")}`}
          </button>
          <Show when={selected()}>
            <button type="button" class="panel-icon-btn panel-icon-btn--danger" onClick={removeSelected} title={t("cad.assembly.deleteNode")} aria-label={t("cad.assembly.deleteNode")}>
              <Trash2 class="w-4 h-4" />
            </button>
          </Show>
        </div>
    </>}>


      <Show when={adding()}>
        <div class="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
          <input
            type="text"
            aria-label={t("cad.assembly.nodeName")}
            placeholder={t("cad.assembly.nodeName")}
            class="panel-input"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === "Enter") addNode(); else if (event.key === "Escape") setAdding(false) }}
          />
          <select class="panel-input" aria-label={t("library.field.type")} value={kind()} onChange={(event) => setKind(event.currentTarget.value as NodeType)}>
            <For each={Object.keys(KIND_LABEL) as ReadonlyArray<NodeType>}>{(option) => <option value={option}>{t(KIND_LABEL[option])}</option>}</For>
          </select>
          <button type="button" class="panel-btn panel-btn--primary" disabled={!name().trim()} onClick={addNode}>
            {t("cad.assembly.addNode")}
          </button>
        </div>
      </Show>

      <div class="overflow-y-auto max-h-80">
        <Show when={roots().length > 0} fallback={
          <div class="py-3 px-4 text-sm text-gray-500 dark:text-gray-400 italic">{t("cad.assembly.noNodes")}</div>
        }>
          <div class="py-1">
            <For each={roots()}>{(node) => <Row node={node} depth={0} childrenOf={childrenOf} expanded={expanded} toggle={toggle} onSelect={(id) => { store.setActiveNode(id); props.onNodeSelect?.(id) }} />}</For>
          </div>
        </Show>
      </div>
    </PanelCard>
  )
}
