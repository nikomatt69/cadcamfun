/**
 * The CAM "Elements" explorer (legacy `CAMElementExplorer.tsx`).
 *
 * Lists what the CAD editor drew, as a tree, and is how CAM picks its input: the selection made here (or in the
 * CAD canvas, both write the same stores) is what the Generator machines, and "Use as workpiece" links an
 * element as the raw piece. Reads and writes the CAD stores directly, like the CAD explorer; the rules are
 * the pure functions in `cam/lib/explorer.ts`.
 */
import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { Motion, Presence } from "solid-motionone"
import { Box, ChevronDown, ChevronRight, Circle, Code, Database, Folder, Layers, List, RefreshCw, Square, Trash2, Wrench, X } from "lucide-solid"
import { toast } from "../../../components/ui/toast.tsx"
import { useApp } from "../../../state/context.ts"
import { useCADStore } from "../../../cad/store/cadStore.ts"
import { useElementsStore } from "../../../cad/store/elementsStore.ts"
import { useLayerStore } from "../../../cad/store/layerStore.ts"
import { useSelectionStore } from "../../../cad/store/selectorStore.ts"
import {
  EXPLORER_MATERIALS,
  EXPLORER_TOOLS,
  allNodeIds,
  ancestorsOf,
  buildTree,
  filterTree,
  isMachinable,
  nextSelection,
  selectionSummary,
  type ExplorerNode
} from "../../lib/explorer.ts"
import { createBrowser } from "../../../cad/components/browser/browserState.ts"
import { BrowserSections, BrowserToolbar, OriginBlock, RenameName, RowActions } from "../../../cad/components/browser/BrowserParts.tsx"
import { assignmentProblem } from "../../lib/elementJob.ts"
import { generateForElement } from "../../lib/elementGenerate.ts"
import { useJob } from "../../lib/useJob.ts"
import { useCamStore } from "../../store/camStore.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { assignMaterial, assignTool, assignmentOf, materialOf, paramsOf, storeToolpath, toolOf, toolpathOf, updateParam, type ElementParams, type ElementToolpathData } from "./assignments.ts"
import MultiToolpathGenerator from "./MultiToolpathGenerator.tsx"
import ToolAssignmentPanel from "./ToolAssignmentPanel.tsx"

export interface CamElementExplorerProps {
  readonly onElementSelect?: (id: string) => void
  /** Called with a toolpath generated from the explorer (legacy `onViewToolpath`). */
  readonly onViewToolpath?: (toolpath: ElementToolpathData) => void
  /** Receives the generated program text, so the page's editor shows it. */
  readonly onGCodeGenerated?: (gcode: string) => void
}

function ElementIcon(props: { readonly type: string }): JSX.Element {
  const kind = (): string => props.type.toLowerCase()
  return (
    <Show when={["group", "assembly", "component"].includes(kind())} fallback={
      <Show when={["cube", "box"].includes(kind())} fallback={
        <Show when={["circle", "sphere", "cylinder"].includes(kind())} fallback={
          <Show when={kind() === "rectangle"} fallback={<Box size={16} class="text-gray-400" />}><Square size={16} class="text-yellow-400" /></Show>
        }><Circle size={16} class="text-green-400" /></Show>
      }><Box size={16} class="text-orange-400" /></Show>
    }><Folder size={16} class="text-blue-400" /></Show>
  )
}

const BTN = "p-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md text-gray-700 dark:text-gray-300 flex items-center justify-center text-xs border border-gray-200 dark:border-gray-600 transition-colors"
const FIELD = "w-full text-xs p-1 border rounded dark:bg-gray-700 dark:border-gray-600"

const PARAM_FIELDS: ReadonlyArray<{ readonly key: keyof ElementParams; readonly label: string; readonly min: number; readonly step: number }> = [
  { key: "depth", label: "Depth (mm)", min: 0.1, step: 0.5 },
  { key: "stepover", label: "Stepover (%)", min: 10, step: 5 },
  { key: "feedrate", label: "Feedrate (mm/min)", min: 100, step: 100 },
  { key: "plungerate", label: "Plunge (mm/min)", min: 50, step: 50 }
]

export default function CamElementExplorer(props: CamElementExplorerProps): JSX.Element {
  const elements = useElementsStore()
  const layers = useLayerStore()
  const selection = useSelectionStore()
  const cad = useCADStore()
  const camStore = useCamStore()
  const app = useApp()
  const gen = useGeneratorStore()
  const job = useJob()
  const [expanded, setExpanded] = createSignal<Readonly<Record<string, boolean>>>({})
  const [query, setQuery] = createSignal("")
  const [multi, setMulti] = createSignal(false)
  const [panel, setPanel] = createSignal<"tool" | "material" | null>(null)
  const [showToolProperties, setShowToolProperties] = createSignal(false)
  const [multiOpen, setMultiOpen] = createSignal(false)
  const browser = createBrowser()

  const tree = createMemo(() => buildTree(elements.elements))
  const visibleTree = createMemo(() => filterTree(tree(), query()))
  const summary = createMemo(() => selectionSummary(elements.elements, selection.selectedElementIds))
  const stockId = (): string | null | undefined => cad.workpiece.elementId ?? camStore.selectedWorkpieceElementId

  // Reveal a selected element inside its collapsed groups (also when the selection came from the CAD canvas).
  createEffect(on(() => [selection.selectedElementIds, elements.elements] as const, ([ids, all]) => {
    const first = ids[0]
    if (first === undefined) return
    const open = ancestorsOf(all, first)
    if (open.length > 0) setExpanded(previous => ({ ...previous, ...Object.fromEntries(open.map(id => [id, true])) }))
  }))

  /** Writes the selection to both CAD stores: `useJob` reads the multi-selection and falls back to `selectedElement`. */
  const applySelection = (ids: ReadonlyArray<string>): void => {
    if (ids.length === 0) selection.clearSelection()
    else selection.selectMultiple([...ids])
    elements.selectElement(ids[0] ?? null)
  }

  const selectNode = (id: string, event?: MouseEvent): void => {
    if (!elements.elements.some(element => element.id === id)) return
    const additive = (event !== undefined && (event.ctrlKey || event.metaKey)) || multi()
    applySelection(nextSelection(selection.selectedElementIds, id, additive))
    if (!additive) setShowToolProperties(true)
    props.onElementSelect?.(id)
  }

  /**
   * "Generate" for one element (legacy `handleGenerateToolpath`): both picks are required, the element's tool,
   * material and parameters drive the job, and the result goes to the CAM store and the page's editor.
   */
  const generateToolpath = async (id: string): Promise<void> => {
    const element = elements.elements.find(candidate => candidate.id === id)
    if (element === undefined) return
    const problem = assignmentProblem(toolOf(id), materialOf(id))
    if (problem !== undefined) { toast.error(problem); return }
    try {
      const response = await generateForElement(app, { element, settings: gen.settings, sources: job.sources(), assignment: assignmentOf(id) })
      const data: ElementToolpathData = { id: `tp-${id}`, elementId: id, gcode: response.gcode, program: response.program as never, isVisible: true }
      storeToolpath(data)
      camStore.setGcode(response.gcode)
      camStore.setProgram(response.program as never)
      props.onGCodeGenerated?.(response.gcode)
      props.onViewToolpath?.(data)
      for (const warning of response.warnings) toast(warning)
      toast.success(`Toolpath generated for ${String(element["name"] ?? element["type"])}`)
    } catch (cause) {
      toast.error(`Error generating toolpath: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  const generateSelected = async (): Promise<void> => {
    for (const id of [...selection.selectedElementIds]) await generateToolpath(id)
  }

  const useAsWorkpiece = (id: string): void => {
    const element = elements.elements.find(candidate => candidate.id === id)
    if (element === undefined) return
    cad.setWorkpieceFromElement(id)
    camStore.syncWorkpieceFromCAD()
    toast.success(`"${String(element["name"] ?? element["type"])}" is now the workpiece`)
  }

  const deleteSelected = (): void => {
    const count = selection.selectedElementIds.length
    if (count === 0 || !window.confirm(`Delete ${count} selected element(s)?`)) return
    selection.deleteSelection()
    elements.selectElement(null)
  }

  const Node = (nodeProps: { readonly node: ExplorerNode; readonly depth: number }): JSX.Element => {
    const id = (): string => nodeProps.node.id
    const isOpen = (): boolean => expanded()[id()] ?? false
    const isSelected = (): boolean => selection.selectedElementIds.includes(id())
    const hasChildren = (): boolean => nodeProps.node.children.length > 0
    const isVisible = (): boolean => nodeProps.node.visible && layers.layers.find(layer => layer.id === nodeProps.node.layerId)?.visible !== false
    const isStock = (): boolean => stockId() === id()
    const params = (): ElementParams => paramsOf(id())
    return (
      <div class="select-none">
        <div
          class={`flex items-center px-2 py-2 cursor-pointer text-sm group transition-all duration-150 border-l-2 ${isSelected() ? "bg-blue-50 dark:bg-blue-900/30 border-l-blue-500 text-blue-700 dark:text-blue-300" : "hover:bg-gray-50 dark:hover:bg-gray-800/60 border-l-transparent text-gray-700 dark:text-gray-300"}`}
          style={{ "padding-left": `${nodeProps.depth * 16 + 8}px` }}
          onClick={event => selectNode(id(), event)}
          data-testid={`cam-element-${id()}`}
        >
          <button
            class="mr-2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            onClick={event => { event.stopPropagation(); if (hasChildren()) setExpanded(previous => ({ ...previous, [id()]: !previous[id()] })) }}
          >
            <Show when={hasChildren()} fallback={<div class="w-[14px]" />}>
              <Show when={isOpen()} fallback={<ChevronRight size={14} class="text-gray-500 dark:text-gray-400" />}><ChevronDown size={14} class="text-gray-500 dark:text-gray-400" /></Show>
            </Show>
          </button>
          <div class="mr-2 flex-shrink-0"><ElementIcon type={nodeProps.node.type} /></div>
          <RenameName id={id()} name={nodeProps.node.name} browser={browser} />
          <Show when={isStock()}>
            <span class="mr-2 px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Raw piece">Stock</span>
          </Show>
          <div class="flex items-center space-x-1 mr-2">
            <span class={`h-2 w-2 rounded-full inline-block ${toolOf(id()) ? "bg-green-500" : "bg-gray-300"}`} title={toolOf(id()) ? "Tool assigned" : "No tool"} />
            <span class={`h-2 w-2 rounded-full inline-block ${materialOf(id()) ? "bg-blue-500" : "bg-gray-300"}`} title={materialOf(id()) ? "Material assigned" : "No material"} />
            <span class={`h-2 w-2 rounded-full inline-block ${toolpathOf(id()) ? "bg-purple-500" : "bg-gray-300"}`} title={toolpathOf(id()) ? "GCode generated" : "No GCode"} />
          </div>
          <RowActions id={id()} visible={isVisible()} locked={elements.elements.find(element => element.id === id())?.locked === true} browser={browser} />
        </div>

        <Show when={isSelected()}>
          <div class="px-2 py-2 bg-gray-50 dark:bg-gray-700/30 border-l-2 border-blue-300 dark:border-blue-600/50 ml-2 text-xs">
            <div class="flex flex-wrap gap-2 mb-1">
              <button class={`flex items-center ${panel() === "tool" ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300"}`} onClick={() => setPanel(panel() === "tool" ? null : "tool")}>
                <Wrench size={12} class="mr-1" /><span>Tool</span>
              </button>
              <button class={`flex items-center ${panel() === "material" ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300"}`} onClick={() => setPanel(panel() === "material" ? null : "material")}>
                <Database size={12} class="mr-1" /><span>Material</span>
              </button>
              <Show when={isMachinable(elements.elements.find(element => element.id === id()) ?? { id: id(), type: nodeProps.node.type })}>
                <button class="flex items-center text-amber-600 dark:text-amber-400" onClick={() => useAsWorkpiece(id())} title="Use this element as the raw piece">
                  <Box size={12} class="mr-1" /><span>Use as workpiece</span>
                </button>
              </Show>
            </div>
            <Presence>
              <Show when={panel() === "tool"}>
                <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} class="mt-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                  <span class="block text-gray-600 dark:text-gray-300 mb-1">Select Tool:</span>
                  <select class={FIELD} value={toolOf(id())} onChange={event => assignTool(id(), event.currentTarget.value)}>
                    <option value="">-- Select Tool --</option>
                    <For each={Object.entries(EXPLORER_TOOLS)}>{([toolId, tool]) => <option value={toolId}>{tool.name}</option>}</For>
                  </select>
                  <Show when={toolOf(id())}>
                    <div class="mt-3 border-t pt-2 border-gray-200 dark:border-gray-700">
                      <h4 class="font-medium mb-1">Toolpath Parameters:</h4>
                      <div class="grid grid-cols-2 gap-2">
                        <For each={PARAM_FIELDS}>{field => (
                          <div>
                            <label class="block text-gray-600 dark:text-gray-400">{field.label}</label>
                            <input type="number" class={FIELD} value={params()[field.key]} min={field.min} step={field.step} onInput={event => updateParam(id(), field.key, parseFloat(event.currentTarget.value))} />
                          </div>
                        )}</For>
                      </div>
                    </div>
                  </Show>
                </Motion.div>
              </Show>
              <Show when={panel() === "material"}>
                <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} class="mt-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                  <span class="block text-gray-600 dark:text-gray-300 mb-1">Select Material:</span>
                  <select class={FIELD} value={materialOf(id())} onChange={event => assignMaterial(id(), event.currentTarget.value)}>
                    <option value="">-- Select Material --</option>
                    <For each={Object.entries(EXPLORER_MATERIALS)}>{([materialId, material]) => <option value={materialId}>{material.name}</option>}</For>
                  </select>
                  <Show when={EXPLORER_MATERIALS[materialOf(id())]}>
                    {material => (
                      <div class="mt-3 border-t pt-2 border-gray-200 dark:border-gray-700 space-y-1">
                        <h4 class="font-medium mb-1">Material Properties:</h4>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Type:</span><span class="font-medium">{material().name}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Hardness:</span><span class="font-medium capitalize">{material().hardness}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Feed Rate Factor:</span><span class="font-medium">{material().feedrateFactor}</span></div>
                      </div>
                    )}
                  </Show>
                </Motion.div>
              </Show>
            </Presence>
          </div>
        </Show>

        <Presence>
          <Show when={hasChildren() && isOpen()}>
            <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
              <For each={nodeProps.node.children}>{child => <Node node={child} depth={nodeProps.depth + 1} />}</For>
            </Motion.div>
          </Show>
        </Presence>
      </div>
    )
  }

  return (
    <div class="flex flex-col h-full w-full bg-white/90 dark:bg-gray-800/90 dark:text-white" data-testid="cam-element-explorer">
      <div class="p-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center">
          <List size={18} class="text-gray-600 dark:text-gray-400 mr-2" />
          <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Elements</h3>
          <span class="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">{elements.elements.length}</span>
        </div>
        <div class="flex items-center space-x-1">
          <button
            class="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Multi-Toolpath Generator"
            onClick={() => setMultiOpen(true)}
          >
            <Layers size={14} />
          </button>
          <button
            class="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Re-link the workpiece from the CAD"
            onClick={() => camStore.syncWorkpieceFromCAD()}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div class="p-3 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          placeholder="Search elements..."
          value={query()}
          onInput={event => setQuery(event.currentTarget.value)}
          class="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div class="flex justify-center px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button class="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mr-4 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setExpanded(Object.fromEntries(allNodeIds(tree()).map(id => [id, true])))}>Expand All</button>
        <button class="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setExpanded({})}>Collapse All</button>
      </div>

      <OriginBlock />
      <BrowserToolbar browser={browser} />

      <div class="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm text-center font-medium" data-testid="cam-selection-summary">
        {summary()}
      </div>

      <Show when={selection.selectedElementIds.length > 0}>
        <div class="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div class="grid grid-cols-2 gap-2">
            <button class={BTN} onClick={() => setMulti(!multi())} title={multi() ? "Disable Multi-select" : "Enable Multi-select"}>
              <span class="w-3 h-3 rounded-sm border mr-2 border-gray-400 dark:border-gray-500 flex items-center justify-center">
                <Show when={multi()}><span class="w-2 h-2 bg-blue-500 rounded-sm" /></Show>
              </span>
              Multi
            </button>
            <button class={BTN} title="Assign Tool" onClick={() => setPanel("tool")}><Wrench size={14} class="mr-1" />Tool</button>
            <button class={BTN} title="Assign Material" onClick={() => setPanel("material")}><Database size={14} class="mr-1" />Material</button>
            <button
              class="p-2 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md text-green-600 dark:text-green-400 flex items-center justify-center text-xs border border-green-200 dark:border-green-800 transition-colors"
              onClick={() => void generateSelected()}
              title="Generate Toolpath"
            >
              <Code size={14} class="mr-1" />Generate
            </button>
            <button class={`${BTN} text-red-600 dark:text-red-400 col-span-2`} title="Delete selected" onClick={deleteSelected}><Trash2 size={14} class="mr-1" />Delete</button>
          </div>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto">
        <Show
          when={visibleTree().length > 0 || browser.mode() === "layer"}
          fallback={<p class="p-4 text-xs text-center text-gray-500 dark:text-gray-400">{elements.elements.length === 0 ? "No elements yet. Draw something in the CAD editor." : "No elements match the search."}</p>}
        >
          <BrowserSections roots={visibleTree()} browser={browser} renderNode={node => <Node node={node} depth={0} />} emptyText="No elements yet. Draw something in the CAD editor." />
        </Show>
      </div>

      <Show when={selection.selectedElementIds.length === 1 && showToolProperties()}>
        {(() => {
          const selected = (): Record<string, any> | undefined => elements.elements.find(candidate => candidate.id === selection.selectedElementIds[0])
          return (
            <ToolAssignmentPanel
              elementId={selection.selectedElementIds[0]!}
              elementName={String(selected()?.["name"] ?? "")}
              elementType={String(selected()?.["type"] ?? "")}
              onClose={() => setShowToolProperties(false)}
              onGenerate={id => void generateToolpath(id)}
            />
          )
        })()}
      </Show>

      <Show when={multiOpen()}>
        <Portal>
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" data-testid="multi-toolpath-modal">
            <div class="w-full max-w-7xl h-[90vh] flex flex-col bg-gray-900 rounded-lg shadow-xl overflow-hidden">
              <div class="flex justify-end p-2 bg-gray-900">
                <button onClick={() => setMultiOpen(false)} class="p-2 rounded-full text-gray-300 hover:bg-gray-700" title="Close"><X size={20} /></button>
              </div>
              <div class="flex-1 min-h-0">
                <MultiToolpathGenerator onGCodeGenerated={gcode => props.onGCodeGenerated?.(gcode)} />
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  )
}
