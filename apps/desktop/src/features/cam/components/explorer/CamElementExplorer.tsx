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
import { toast } from "../../../../shared/ui/toast.tsx"
import { useApp } from "../../../../shared/state/context.ts"
import { useCADStore } from "../../../cad/store/cadStore.ts"
import { useElementsStore } from "../../../cad/store/elementsStore.ts"
import { useLayerStore } from "../../../cad/store/layerStore.ts"
import { useSelectionStore } from "../../../cad/store/selectorStore.ts"
import {
  EXPLORER_MATERIALS,
  EXPLORER_TOOLS,
  hardnessLabel,
  materialLabel,
  toolLabel,
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
import { NumberField } from "../../../../shared/components/panel/ui.tsx"
import { assignmentProblem } from "../../lib/elementJob.ts"
import { generateForElement } from "../../lib/elementGenerate.ts"
import { useJob } from "../../hooks/useJob.ts"
import { useCamStore } from "../../store/camStore.ts"
import { useSetupStore } from "../../store/setupStore.ts"
import { workpiecesFromElements } from "../../lib/setup.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { assignMaterial, assignTool, assignmentOf, materialOf, paramsOf, storeToolpath, toolOf, toolpathOf, updateParam, type ElementParams, type ElementToolpathData } from "./assignments.ts"
import { t, type Key } from "../../../../i18n/index.ts"
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
          <Show when={kind() === "rectangle"} fallback={<Box size={16} class="text-[color:var(--panel-text-muted)]" />}><Square size={16} class="text-[color:var(--panel-text-muted)]" /></Show>
        }><Circle size={16} class="text-[color:var(--panel-text-muted)]" /></Show>
      }><Box size={16} class="text-[color:var(--panel-text-muted)]" /></Show>
    }><Folder size={16} class="text-[color:var(--panel-text-muted)]" /></Show>
  )
}

const BTN = "panel-btn"
const FIELD = "panel-input"

const PARAM_FIELDS: ReadonlyArray<{ readonly key: keyof ElementParams; readonly label: Key; readonly min: number; readonly step: number }> = [
  { key: "depth", label: "cam.explorer.param.depth", min: 0.1, step: 0.5 },
  { key: "stepover", label: "cam.explorer.param.stepover", min: 10, step: 5 },
  { key: "feedrate", label: "cam.explorer.param.feedrate", min: 100, step: 100 },
  { key: "plungerate", label: "cam.explorer.param.plungerate", min: 50, step: 50 }
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
      toast.success(t("cam.explorer.generated", { name: String(element["name"] ?? element["type"]) }))
    } catch (cause) {
      toast.error(t("cam.explorer.generateError", { reason: cause instanceof Error ? cause.message : String(cause) }))
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
    toast.success(t("cam.explorer.nowWorkpiece", { name: String(element["name"] ?? element["type"]) }))
  }

  /** Several selected parts (imported or drawn) become the fixture of the setup: one workpiece each, the first one is also the raw piece. */
  const useSelectionAsWorkpieces = (): void => {
    const picked = selection.selectedElementIds.map((id) => elements.elements.find(candidate => candidate.id === id)).filter((element): element is NonNullable<typeof element> => element !== undefined)
    const fixture = workpiecesFromElements(picked, (n) => t("cam.workpieces.defaultName", { n }))
    if (fixture.length < 2) return
    useSetupStore.getState().setChoices({ workpieces: [...fixture] })
    cad.setWorkpieceFromElement(picked[0]!.id)
    camStore.syncWorkpieceFromCAD()
    toast.success(t("cam.explorer.nowWorkpieces", { count: fixture.length, offsets: fixture.map((wp) => wp.workOffset).join(" ") }))
    if (picked.length > fixture.length) toast(t("cam.explorer.workpiecesLimit", { count: fixture.length }))
  }

  const deleteSelected = (): void => {
    const count = selection.selectedElementIds.length
    if (count === 0 || !window.confirm(t("cad.explorer.confirmDelete", { count }))) return
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
          class={`workstation-browser-row workstation-browser-row--cam flex items-center px-2 py-1.5 cursor-pointer text-xs group transition-colors duration-150 border-l-2 ${isSelected() ? "border-l-blue-500 text-[color:var(--panel-accent)]" : "hover:bg-[color:var(--panel-bg-subtle)] border-l-transparent text-[color:var(--panel-text)]"}`}
          style={{ "padding-left": `${nodeProps.depth * 16 + 8}px` }}
          onClick={event => selectNode(id(), event)}
          data-testid={`cam-element-${id()}`}
        >
          <button type="button"
            class="mr-2 p-0.5 rounded hover:bg-[color:var(--panel-bg-inset)] transition-colors"
            onClick={event => { event.stopPropagation(); if (hasChildren()) setExpanded(previous => ({ ...previous, [id()]: !previous[id()] })) }}
          >
            <Show when={hasChildren()} fallback={<div class="w-[14px]" />}>
              <Show when={isOpen()} fallback={<ChevronRight size={14} class="text-[color:var(--panel-text-muted)]" />}><ChevronDown size={14} class="text-[color:var(--panel-text-muted)]" /></Show>
            </Show>
          </button>
          <div class="mr-2 flex-shrink-0"><ElementIcon type={nodeProps.node.type} /></div>
          <RenameName id={id()} name={nodeProps.node.name} browser={browser} />
          <Show when={isStock()}>
            <span class="sidebar-cam-stock mr-2 panel-badge" title={t("cam.explorer.rawPiece")}>{t("cam.explorer.stock")}</span>
          </Show>
          <div class="sidebar-cam-status flex items-center space-x-1 mr-2">
            <span class={`h-2 w-2 rounded-full inline-block ${toolOf(id()) ? "bg-[color:var(--panel-text-muted)]" : "bg-[color:var(--panel-border-strong)]"}`} title={toolOf(id()) ? t("cam.explorer.toolAssigned") : t("cam.explorer.noTool")} />
            <span class={`h-2 w-2 rounded-full inline-block ${materialOf(id()) ? "bg-[color:var(--panel-text-muted)]" : "bg-[color:var(--panel-border-strong)]"}`} title={materialOf(id()) ? t("cam.explorer.materialAssigned") : t("cam.explorer.noMaterial")} />
            <span class={`h-2 w-2 rounded-full inline-block ${toolpathOf(id()) ? "bg-[color:var(--panel-text-muted)]" : "bg-[color:var(--panel-border-strong)]"}`} title={toolpathOf(id()) ? t("cam.explorer.gcodeGenerated") : t("cam.explorer.noGcode")} />
          </div>
          <RowActions id={id()} visible={isVisible()} locked={elements.elements.find(element => element.id === id())?.locked === true} browser={browser} />
        </div>

        <Show when={isSelected()}>
          <div class="ml-2 border-l-2 border-[color:var(--panel-border-strong)] bg-[color:var(--panel-bg-subtle)] px-2 py-2 text-xs">
            <div class="flex flex-wrap gap-2 mb-1">
              <button type="button" class={`flex items-center ${panel() === "tool" ? "text-[color:var(--panel-accent)]" : "text-[color:var(--panel-text-muted)]"}`} onClick={() => setPanel(panel() === "tool" ? null : "tool")}>
                <Wrench size={12} class="mr-1" /><span>{t("cam.explorer.tool")}</span>
              </button>
              <button type="button" class={`flex items-center ${panel() === "material" ? "text-[color:var(--panel-accent)]" : "text-[color:var(--panel-text-muted)]"}`} onClick={() => setPanel(panel() === "material" ? null : "material")}>
                <Database size={12} class="mr-1" /><span>{t("cam.explorer.material")}</span>
              </button>
              <Show when={isMachinable(elements.elements.find(element => element.id === id()) ?? { id: id(), type: nodeProps.node.type })}>
                <button type="button" class="flex items-center text-[color:var(--panel-text-muted)] hover:text-[color:var(--panel-text)]" onClick={() => useAsWorkpiece(id())} title={t("cam.explorer.useAsWorkpieceTitle")}>
                  <Box size={12} class="mr-1" /><span>{t("cam.explorer.useAsWorkpiece")}</span>
                </button>
              </Show>
            </div>
            <Presence>
              <Show when={panel() === "tool"}>
                <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} class="mt-2 p-2 bg-[color:var(--panel-bg)] rounded-[5px] border border-[color:var(--panel-border)]">
                  <span class="block text-[color:var(--panel-text-muted)] mb-1">{t("cam.explorer.selectTool")}</span>
                  <select class={FIELD} value={toolOf(id())} onChange={event => assignTool(id(), event.currentTarget.value)}>
                    <option value="">{t("cam.explorer.selectToolOption")}</option>
                    <For each={Object.entries(EXPLORER_TOOLS)}>{([toolId, tool]) => <option value={toolId}>{toolLabel(toolId)}</option>}</For>
                  </select>
                  <Show when={toolOf(id())}>
                    <div class="mt-3 border-t pt-2 border-[color:var(--panel-border)]">
                      <h4 class="font-medium mb-1">{t("cam.explorer.toolpathParams")}</h4>
                      <div class="grid grid-cols-2 gap-2">
                        <For each={PARAM_FIELDS}>{field => (
                          <div>
                            <label class="block text-[color:var(--panel-text-muted)]">{t(field.label)}</label>
                            <NumberField class={FIELD} value={params()[field.key]} min={String(field.min)} step={String(field.step)} accept={value => value > 0} onValue={value => updateParam(id(), field.key, value)} />
                          </div>
                        )}</For>
                      </div>
                    </div>
                  </Show>
                </Motion.div>
              </Show>
              <Show when={panel() === "material"}>
                <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} class="mt-2 p-2 bg-[color:var(--panel-bg)] rounded-[5px] border border-[color:var(--panel-border)]">
                  <span class="block text-[color:var(--panel-text-muted)] mb-1">{t("cam.explorer.selectMaterial")}</span>
                  <select class={FIELD} value={materialOf(id())} onChange={event => assignMaterial(id(), event.currentTarget.value)}>
                    <option value="">{t("cam.explorer.selectMaterialOption")}</option>
                    <For each={Object.entries(EXPLORER_MATERIALS)}>{([materialId, material]) => <option value={materialId}>{materialLabel(materialId)}</option>}</For>
                  </select>
                  <Show when={EXPLORER_MATERIALS[materialOf(id())]}>
                    {material => (
                      <div class="mt-3 border-t pt-2 border-[color:var(--panel-border)] space-y-1">
                        <h4 class="font-medium mb-1">{t("cam.explorer.materialProps")}</h4>
                        <div class="flex justify-between"><span class="text-[color:var(--panel-text-muted)]">{t("cam.explorer.matType")}</span><span class="font-medium">{materialLabel(materialOf(id()))}</span></div>
                        <div class="flex justify-between"><span class="text-[color:var(--panel-text-muted)]">{t("cam.explorer.hardness")}</span><span class="font-medium capitalize">{hardnessLabel(material().hardness)}</span></div>
                        <div class="flex justify-between"><span class="text-[color:var(--panel-text-muted)]">{t("cam.explorer.feedFactor")}</span><span class="font-medium">{material().feedrateFactor}</span></div>
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
    <div class="sidebar-browser flex flex-col w-full" data-testid="cam-element-explorer">
      <div class="p-3 flex items-center justify-between border-b border-[color:var(--panel-border)]">
        <div class="flex items-center">
          <List size={14} class="text-[color:var(--panel-text-muted)] mr-2" />
          <h3 class="text-xs font-semibold text-[color:var(--panel-text)]">{t("cad.explorer.title")}</h3>
          <span class="panel-badge ml-2">{elements.elements.length}</span>
        </div>
        <div class="flex items-center space-x-1">
          <button type="button"
            class="panel-icon-btn"
            title={t("cam.explorer.multiToolpath")}
            onClick={() => setMultiOpen(true)}
          >
            <Layers size={14} />
          </button>
          <button type="button"
            class="panel-icon-btn"
            title={t("cam.explorer.relink")}
            onClick={() => camStore.syncWorkpieceFromCAD()}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div class="p-3 border-b border-[color:var(--panel-border)]">
        <input
          type="text"
          placeholder={t("cad.explorer.search")}
          value={query()}
          onInput={event => setQuery(event.currentTarget.value)}
          class="panel-input"
        />
      </div>

      <div class="flex justify-center gap-2 border-b border-[color:var(--panel-border)] bg-[color:var(--panel-bg-subtle)] px-3 py-2">
        <button type="button" class="rounded px-2 py-1 text-[11px] text-[color:var(--panel-text-muted)] hover:bg-[color:var(--panel-bg-inset)] hover:text-[color:var(--panel-text)]" onClick={() => setExpanded(Object.fromEntries(allNodeIds(tree()).map(id => [id, true])))}>{t("cad.explorer.expandAll")}</button>
        <button type="button" class="rounded px-2 py-1 text-[11px] text-[color:var(--panel-text-muted)] hover:bg-[color:var(--panel-bg-inset)] hover:text-[color:var(--panel-text)]" onClick={() => setExpanded({})}>{t("cad.explorer.collapseAll")}</button>
      </div>

      <OriginBlock />
      <BrowserToolbar browser={browser} />

      <div class="border-b border-[color:var(--panel-border)] bg-[color:var(--panel-bg-subtle)] px-3 py-2 text-center text-[11px] font-medium text-[color:var(--panel-text-muted)]" data-testid="cam-selection-summary">
        {summary()}
      </div>

      <Show when={selection.selectedElementIds.length > 0}>
        <div class="border-b border-[color:var(--panel-border)] bg-[color:var(--panel-bg-subtle)] p-3">
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class={BTN} onClick={() => setMulti(!multi())} title={multi() ? t("cad.explorer.multiOff") : t("cad.explorer.multiOn")}>
              <span class="w-3 h-3 rounded-sm border mr-2 border-[color:var(--panel-border-strong)] flex items-center justify-center">
                <Show when={multi()}><span class="w-2 h-2 bg-[color:var(--panel-accent)] rounded-sm" /></Show>
              </span>
              {t("cad.explorer.multi")}
            </button>
            <button type="button" class={BTN} title={t("cam.explorer.assignTool")} onClick={() => setPanel("tool")}><Wrench size={14} class="mr-1" />{t("cam.explorer.tool")}</button>
            <button type="button" class={BTN} title={t("cam.explorer.assignMaterial")} onClick={() => setPanel("material")}><Database size={14} class="mr-1" />{t("cam.explorer.material")}</button>
            <button type="button"
              class="panel-btn panel-btn--primary"
              onClick={() => void generateSelected()}
              title={t("cam.explorer.generateToolpath")}
            >
              <Code size={14} class="mr-1" />{t("cam.explorer.generate")}
            </button>
            <Show when={selection.selectedElementIds.length > 1}>
              <button type="button" class={`${BTN} col-span-2`} data-testid="cam-use-selection-as-workpieces" title={t("cam.explorer.useAsWorkpiecesTitle")} onClick={useSelectionAsWorkpieces}>
                <Box size={14} class="mr-1" />{t("cam.explorer.useAsWorkpieces")}
              </button>
            </Show>
            <button type="button" class={`${BTN} col-span-2 text-[color:var(--panel-bad)]`} title={t("cam.explorer.deleteSelected")} onClick={deleteSelected}><Trash2 size={14} class="mr-1" />{t("browser.delete")}</button>
          </div>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto">
        <Show
          when={visibleTree().length > 0 || browser.mode() === "layer"}
          fallback={<p class="p-4 text-center text-[11px] text-[color:var(--panel-text-muted)]">{elements.elements.length === 0 ? t("cam.explorer.noneYet") : t("cam.explorer.noMatch")}</p>}
        >
          <BrowserSections roots={visibleTree()} browser={browser} renderNode={node => <Node node={node} depth={0} />} emptyText={t("cam.explorer.noneYet")} />
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
                <button type="button" onClick={() => setMultiOpen(false)} class="p-2 rounded-full text-gray-300 hover:bg-gray-700" title={t("cam.explorer.close")}><X size={20} /></button>
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
