import { saveFile } from "../../../../shared/lib/save-file.ts"
/**
 * Multi-toolpath generator (legacy `MultiToolpathGenerator.tsx`): one toolpath per CAD element, an execution order,
 * and one setup: the programs the sidecar's `camSetup` group writes from them, with the tool changes inside.
 *
 * Left, the element selector (create / order / remove toolpaths). Right, the full generator panel to configure the
 * element being edited. "Genera Tutti" generates every toolpath that has no G-code yet through the sidecar,
 * "View" sends the toolpaths to the CAM viewport and "Download G-code" downloads the setup's programs (the sidecar
 * generates every enabled operation, so a loaded setup needs no G-code on the panel first).
 */
import { Show, createSignal, onMount, type JSX } from "solid-js"
import { Box, Download, Eye, EyeOff, Layers, Play, X, Zap } from "lucide-solid"
import { toast } from "../../../../shared/ui/toast.tsx"
import { useElementsStore } from "../../../cad/store/elementsStore.ts"
import { useSelectionStore } from "../../../cad/store/selectorStore.ts"
import { useApp } from "../../../../shared/state/context.ts"
import { makeToolpathGenerator } from "../../api/generator.ts"
import { makeSetupService } from "../../api/setup.ts"
import { stockOf } from "../../lib/job.ts"
import { elementsOfSetup, programFileName, setupOfToolpaths } from "../../lib/setup.ts"
import { useSetupStore } from "../../store/setupStore.ts"
import { effectiveSettings, generateForElement } from "../../lib/elementGenerate.ts"
import { assignmentProblem, type ToolpathSettings } from "../../lib/elementJob.ts"
import { formatDuration, measurePoints, parseGCodeToPoints, statistics } from "../../lib/multiToolpath.ts"
import { useJob } from "../../hooks/useJob.ts"
import { useCamStore } from "../../store/camStore.ts"
import { useGeneratorStore, type LibraryTool } from "../../store/generatorStore.ts"
import { useMultiToolpathStore } from "../../store/multiToolpathStore.ts"
import ToolpathGenerator from "../ToolpathGenerator.tsx"
import { assignmentOf, materialOf, toolOf } from "./assignments.ts"
import ElementSelector from "./ElementSelector.tsx"
import SetupPanel from "./SetupPanel.tsx"
import { t } from "../../../../i18n/index.ts"

export interface MultiToolpathGeneratorProps {
  /** Receives the program text sent to the viewport (the combined program, or a configured element's). */
  readonly onGCodeGenerated: (gcode: string) => void
  readonly onToolSelected?: (tool: LibraryTool) => void
}

export default function MultiToolpathGenerator(props: MultiToolpathGeneratorProps): JSX.Element {
  const app = useApp()
  const elements = useElementsStore()
  const selection = useSelectionStore()
  const camStore = useCamStore()
  const gen = useGeneratorStore()
  const job = useJob()
  const store = useMultiToolpathStore()

  const [configuringElementId, setConfiguringElementId] = createSignal<string | null>(null)
  const [showElementSelector, setShowElementSelector] = createSignal(true)
  const [isGeneratingAll, setIsGeneratingAll] = createSignal(false)
  // The settings new toolpaths start from: the generator panel's current ones.
  const [defaultSettings, setDefaultSettings] = createSignal<ToolpathSettings>({ ...gen.settings })

  onMount(() => store.updateGlobalSettings(defaultSettings()))

  const nameOf = (elementId: string): string => {
    const element = elements.elements.find(candidate => candidate["id"] === elementId)
    return String(element?.["name"] ?? element?.["type"] ?? elementId)
  }

  /** Writes the selection to both CAD stores, so the embedded generator machines this element. */
  const selectElement = (elementId: string): void => {
    selection.selectMultiple([elementId])
    elements.selectElement(elementId)
  }

  /** Stores generated text on the element's toolpath (adding the toolpath when the panel generated first). */
  const storeGCode = (elementId: string, gcode: string, settings: ToolpathSettings, measured?: { readonly distance: number; readonly time: number }): void => {
    const element = elements.elements.find(candidate => candidate["id"] === elementId)
    const existing = store.getToolpathByElementId(elementId)
    const id = existing?.id ?? store.addToolpath(elementId, String(element?.["type"] ?? ""), nameOf(elementId), settings)
    const points = parseGCodeToPoints(gcode)
    store.updateToolpath(id, { toolpathSettings: settings })
    store.updateToolpathGCode(id, gcode, points, measured ?? measurePoints(points))
    toast.success(t("cam.multi.elementGenerated", { name: nameOf(elementId) }))
  }

  // Embedded generator panel finished for the element being configured.
  const handleGCodeGenerated = (elementId: string, gcode: string): void => storeGCode(elementId, gcode, { ...gen.settings })

  const handleSelectElementForConfig = (elementId: string): void => {
    setConfiguringElementId(elementId)
    selectElement(elementId)
    const toolpath = store.getToolpathByElementId(elementId)
    if (toolpath !== undefined) {
      // Load the toolpath's settings into the panel (and the defaults new toolpaths start from).
      setDefaultSettings(toolpath.toolpathSettings)
      gen.replaceSettings(toolpath.toolpathSettings)
    }
  }

  /** Generates one element's toolpath through the sidecar: its own tool / material win when both are assigned. */
  const generateToolpathForElement = async (elementId: string, settings: ToolpathSettings): Promise<boolean> => {
    const element = elements.elements.find(candidate => candidate["id"] === elementId)
    if (element === undefined) { toast.error(t("cam.multi.elementMissing")); return false }
    const assignment = assignmentProblem(toolOf(elementId), materialOf(elementId)) === undefined ? assignmentOf(elementId) : undefined
    const input = { element, settings: store.getToolpathByElementId(elementId)?.toolpathSettings ?? settings, sources: job.sources(), ...(assignment ? { assignment } : {}) }
    try {
      const response = await generateForElement(app, input)
      storeGCode(elementId, response.gcode, effectiveSettings(input), { distance: response.stats.cutLength + response.stats.rapidLength, time: response.stats.estimatedSeconds })
      for (const warning of response.warnings) toast(warning)
      return true
    } catch (cause) {
      toast.error(`${nameOf(elementId)}: ${cause instanceof Error ? cause.message : String(cause)}`)
      return false
    }
  }

  const generateAllToolpaths = async (): Promise<void> => {
    setIsGeneratingAll(true)
    try {
      // A toolpath that fails is reported by its own toast and does not stop the next ones; the summary only claims success when none failed.
      let failed = 0
      for (const toolpath of [...store.toolpaths]) {
        if (!toolpath.gcode && !(await generateToolpathForElement(toolpath.elementId, toolpath.toolpathSettings))) failed++
      }
      if (failed === 0) toast.success(t("cam.multi.allGenerated"))
      else toast.error(t("cam.multi.failed"))
    } catch (error) {
      toast.error(t("cam.multi.failed"))
      console.error(error)
    } finally {
      setIsGeneratingAll(false)
    }
  }

  // The multi-operation setup (spec 14): the toolpaths become one program with tool changes (or one file per tool / operation, by the
  // setup store's grouping), written by the post of the sidecar's `camSetup` group, not by joining the toolpaths' texts.
  const downloadCombinedGCode = (): void => {
    const setup = setupOfToolpaths(store.toolpaths, useSetupStore.getState().choices)
    const request = { setup, elements: elementsOfSetup(setup, elements.elements) as never, stock: stockOf(job.sources()) }
    void app.runtime.run(makeSetupService(app.client).generate(request))
      .then(async (result) => {
        useSetupStore.getState().setResult(result)
        for (const issue of result.issues) toast(issue.message)
        for (const warning of result.warnings) toast(warning)
        if (result.programs.length === 0) { toast.error(t("cam.multi.failed")); return }
        let saved = false
        for (const program of result.programs) saved = (await saveFile({ name: programFileName(program), data: program.gcode, mime: "text/plain" })) || saved
        if (saved) toast.success(t("cam.multi.downloaded"))
      })
      .catch(() => toast.error(t("shell.export.failed", { name: "G-code", reason: t("common.error") })))
  }

  // The combined program replaces the viewport's: G-code text for the editor, the parsed IR for the simulation.
  const sendToVisualizer = async (): Promise<void> => {
    const generated = [...store.toolpaths].sort((a, b) => a.order - b.order).filter((path) => path.gcode.trim())
    try {
      const results = await Promise.all(generated.map(async (path) => ({
        id: path.id, name: path.elementName, gcode: path.gcode,
        program: (await app.runtime.run(makeToolpathGenerator(app.client).parse(path.gcode, path.elementName))).program,
        settings: path.toolpathSettings, elementIds: [path.elementId], tool: `${path.toolpathSettings.toolType} Ø${path.toolpathSettings.toolDiameter}`
      })))
      camStore.clearOperationResults()
      camStore.setKernelArtifact(undefined); camStore.setKernelRequest(undefined)
      for (const result of results) camStore.upsertOperationResult(result)
      props.onGCodeGenerated(useCamStore.getState().gcode)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : String(cause)); return }
    toast.success(t("cam.multi.sent"))
  }

  const stats = () => statistics(store.toolpaths)

  return (
    <div class="flex flex-col h-full" data-testid="multi-toolpath-generator">
      {/* Header */}
      <div class="bg-gray-900 border-b border-gray-700 p-4">
        <div class="flex items-center justify-between gap-3 mb-4">
          <h2 class="text-base font-semibold text-white flex items-center gap-2">
            <Layers size={16} />
            {t("cam.explorer.multiToolpath")}
          </h2>

          <div class="flex items-center gap-2">
            <button type="button" onClick={() => setShowElementSelector(!showElementSelector())} class="flex-none p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white transition-colors" aria-pressed={showElementSelector()} aria-label={t("cam.multi.toggleElements")} title={t("cam.multi.toggleElements")}>
              {showElementSelector() ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>

            <button type="button"
              onClick={() => void generateAllToolpaths()}
              disabled={isGeneratingAll() || stats().totalToolpaths === 0}
              class="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              <Zap size={16} />
              {t("cam.multi.generateAll")}
            </button>

            <button type="button"
              onClick={() => void sendToVisualizer()}
              disabled={stats().generatedToolpaths === 0}
              class="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              <Play size={16} />
              {t("cam.multi.view")}
            </button>

            <button type="button"
              onClick={downloadCombinedGCode}
              data-testid="cam-setup-download"
              disabled={stats().totalToolpaths === 0}
              class="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              <Download size={16} />
              {t("cam.multi.downloadGcode")}
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div class="grid grid-cols-4 gap-4 text-sm">
          <div class="bg-gray-800 rounded-lg p-3">
            <div class="text-gray-400">{t("cam.multi.statTotal")}</div>
            <div class="text-xl font-semibold text-white tabular-nums">{stats().totalToolpaths}</div>
          </div>

          <div class="bg-gray-800 rounded-lg p-3">
            <div class="text-gray-400">{t("cam.multi.statGenerated")}</div>
            <div class="text-xl font-semibold text-white tabular-nums">{stats().generatedToolpaths}</div>
          </div>

          <div class="bg-gray-800 rounded-lg p-3">
            <div class="text-gray-400">{t("cam.multi.statDistance")}</div>
            <div class="text-xl font-semibold text-white tabular-nums">{(stats().totalDistance / 1000).toFixed(2)}m</div>
          </div>

          <div class="bg-gray-800 rounded-lg p-3">
            <div class="text-gray-400">{t("cam.multi.statTime")}</div>
            <div class="text-xl font-semibold text-white tabular-nums">{formatDuration(stats().totalTime)}</div>
          </div>
        </div>
      </div>

      <SetupPanel />

      {/* Main content */}
      <div class="flex-1 flex overflow-hidden">
        {/* Element selector panel */}
        <Show when={showElementSelector()}>
          <div class="w-96 bg-gray-800 border-r border-gray-700 overflow-y-auto">
            <ElementSelector
              globalSettings={defaultSettings()}
              onGenerateToolpath={(elementId, settings) => void generateToolpathForElement(elementId, settings)}
              onSelectElement={handleSelectElementForConfig}
            />
          </div>
        </Show>

        {/* Toolpath generator panel */}
        <div class="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
          <Show
            when={configuringElementId()}
            fallback={
              <div class="flex items-center justify-center h-full">
                <div class="text-center">
                  <Layers size={32} class="text-gray-600 mx-auto mb-3" />
                  <p class="text-gray-400 text-base">{t("cam.multi.selectElement")}</p>
                  <p class="text-gray-500 text-sm mt-2">{t("cam.multi.useSidebar")}</p>
                </div>
              </div>
            }
          >
            {elementId => (
              <div class="p-4">
                <div class="mb-4 bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Box size={16} class="text-gray-400" />
                    <span class="text-white">{t("cam.explorer.selectedElement")}: {nameOf(elementId())}</span>
                  </div>

                  <button type="button" onClick={() => setConfiguringElementId(null)} class="flex-none p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors" aria-label={t("cam.explorer.close")}><X size={14} /></button>
                </div>

                <ToolpathGenerator
                  onGCodeGenerated={gcode => {
                    handleGCodeGenerated(elementId(), gcode)
                    props.onGCodeGenerated(gcode)
                  }}
                  {...(props.onToolSelected ? { onToolSelected: props.onToolSelected } : {})}
                />
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  )
}
