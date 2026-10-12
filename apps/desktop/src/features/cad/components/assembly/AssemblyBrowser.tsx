/**
 * The assembly tree (legacy `components/cad/assembly/AssemblyBrowser.tsx`).
 *
 * Nodes are grouped under the node they are parented to; selecting one makes it the parent of the
 * next node added and the subject of the joints and constraints panels. Adding is inline (a name and
 * a kind) rather than the legacy `prompt`, so the panel never blocks the editor.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-solid"
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
        class={`py-1 px-2 flex items-center cursor-pointer text-sm ${store.activeNodeId === props.node.id ? "bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500" : "hover:bg-gray-50 dark:hover:bg-gray-700/40"}`}
        style={{ "padding-left": `${props.depth * 12 + 4}px` }}
        onClick={() => props.onSelect(props.node.id)}
      >
        <button type="button" class="mr-1 p-0.5 rounded-sm hover:bg-gray-200 dark:hover:bg-gray-600" onClick={(event) => { event.stopPropagation(); props.toggle(props.node.id) }}>
          <Show when={children().length > 0} fallback={<span class="inline-block w-3 h-3" />}>
            <Show when={open()} fallback={<ChevronRight class="w-3 h-3 text-gray-500" />}><ChevronDown class="w-3 h-3 text-gray-500" /></Show>
          </Show>
        </button>
        <span class="truncate text-gray-900 dark:text-gray-100">{props.node.name || `${props.node.type} ${props.node.id.slice(0, 4)}`}</span>
        <span class="ml-1.5 text-xs text-gray-500 dark:text-gray-400">({t(KIND_LABEL[props.node.type])})</span>
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
    <section class="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
      <header class="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 class="text-sm font-medium text-gray-900 dark:text-white">{t("cad.assembly.structure")}</h3>
        <div class="flex items-center gap-1">
          <button type="button" class="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-600" onClick={() => setAdding(!adding())}>
            {adding() ? t("cad.assembly.cancel") : `+ ${t("cad.assembly.add")}`}
          </button>
          <Show when={selected()}>
            <button type="button" class="p-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-red-600" onClick={removeSelected} title={t("cad.assembly.deleteNode")}>
              <Trash2 class="w-4 h-4" />
            </button>
          </Show>
        </div>
      </header>

      <Show when={adding()}>
        <div class="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
          <input
            type="text"
            placeholder={t("cad.assembly.nodeName")}
            class="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === "Enter") addNode() }}
          />
          <select class="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" value={kind()} onChange={(event) => setKind(event.currentTarget.value as NodeType)}>
            <For each={Object.keys(KIND_LABEL) as ReadonlyArray<NodeType>}>{(option) => <option value={option}>{t(KIND_LABEL[option])}</option>}</For>
          </select>
          <button type="button" class="w-full px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50" disabled={!name().trim()} onClick={addNode}>
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
    </section>
  )
}
