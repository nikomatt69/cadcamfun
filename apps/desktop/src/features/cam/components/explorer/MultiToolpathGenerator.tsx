import { saveFile } from "../../../../shared/lib/save-file.ts"
/**
 * Multi-toolpath generator (legacy `MultiToolpathGenerator.tsx`): one toolpath per CAD element, an execution order,
 * and one combined program.
 *
 * Left, the element selector (create / order / remove toolpaths). Right, the full generator panel to configure the
 * element being edited. "Genera Tutti" generates every toolpath that has no G-code yet through the sidecar,
 * "Visualizza" sends the combined program to the CAM viewport and "Scarica G-Code" downloads it.
 */
import { Show, createSignal, onMount, type JSX } from "solid-js"
import { Box, Download, Eye, EyeOff, Layers, Play, X, Zap } from "lucide-solid"
import { toast } from "../../../../shared/ui/toast.tsx"
import { useElementsStore } from "../../../cad/store/elementsStore.ts"
import { useSelectionStore } from "../../../cad/store/selectorStore.ts"
import { useApp } from "../../../../shared/state/context.ts"
import { makeToolpathGenerator } from "../../api/generator.ts"
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
    toast.success(`Toolpath generato per elemento ${nameOf(elementId)}`)
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
  const generateToolpathForElement = async (elementId: string, settings: ToolpathSettings): Promise<void> => {
    const element = elements.elements.find(candidate => candidate["id"] === elementId)
    if (element === undefined) { toast.error("Elemento non trovato"); return }
    const assignment = assignmentProblem(toolOf(elementId), materialOf(elementId)) === undefined ? assignmentOf(elementId) : undefined
    const input = { element, settings: store.getToolpathByElementId(elementId)?.toolpathSettings ?? settings, sources: job.sources(), ...(assignment ? { assignment } : {}) }
    try {
      const response = await generateForElement(app, input)
      storeGCode(elementId, response.gcode, effectiveSettings(input), { distance: response.stats.cutLength + response.stats.rapidLength, time: response.stats.estimatedSeconds })
      for (const warning of response.warnings) toast(warning)
    } catch (cause) {
      toast.error(`${nameOf(elementId)}: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  const generateAllToolpaths = async (): Promise<void> => {
    setIsGeneratingAll(true)
    try {
      for (const toolpath of [...store.toolpaths]) {
        if (!toolpath.gcode) await generateToolpathForElement(toolpath.elementId, toolpath.toolpathSettings)
      }
      toast.success("Tutti i toolpath sono stati generati")
    } catch (error) {
      toast.error("Failed to generate toolpaths")
      console.error(error)
    } finally {
      setIsGeneratingAll(false)
    }
  }

  const downloadCombinedGCode = (): void => {
    void saveFile({ name: `multi-toolpath-${new Date().toISOString().slice(0, 10)}.nc`, data: store.generateCombinedGCode(), mime: "text/plain" })
      .then((saved) => { if (saved) toast.success(t("cam.multi.downloaded")) })
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
    toast.success("G-code inviato al visualizzatore")
  }

  const stats = () => statistics(store.toolpaths)

  return (
    <div class="flex flex-col h-full" data-testid="multi-toolpath-generator">
      {/* Header */}
      <div class="bg-gray-900 border-b border-gray-700 p-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <Layers size={24} />
            Multi-Toolpath Generator
          </h2>

          <div class="flex items-center gap-2">
            <button onClick={() => setShowElementSelector(!showElementSelector())} class="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white transition-colors" title="Toggle selezione elementi">
              {showElementSelector() ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>

            <button
              onClick={() => void generateAllToolpaths()}
              disabled={isGeneratingAll() || stats().totalToolpaths === 0}
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Zap size={16} />
              {t("cam.multi.generateAll")}
            </button>

            <button
              onClick={() => void sendToVisualizer()}
              disabled={stats().generatedToolpaths === 0}
              class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Play size={16} />
              Visualizza
            </button>

            <button
              onClick={downloadCombinedGCode}
              disabled={stats().generatedToolpaths === 0}
              class="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Download size={16} />
              Scarica G-Code
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div class="grid grid-cols-4 gap-4 text-sm">
          <div class="bg-gray-800 rounded-lg p-3">
            <div class="text-gray-400">Toolpath Totali</div>
            <div class="text-2xl font-bold text-white">{stats().totalToolpaths}</div>
          </div>

          <div class="bg-gray-800 rounded-lg p-3">
            <div class="text-gray-400">Generati</div>
            <div class="text-2xl font-bold text-green-400">{stats().generatedToolpaths}</div>
          </div>

          <div class="bg-gray-800 rounded-lg p-3">
            <div class="text-gray-400">Distanza Totale</div>
            <div class="text-2xl font-bold text-blue-400">{(stats().totalDistance / 1000).toFixed(2)}m</div>
          </div>

          <div class="bg-gray-800 rounded-lg p-3">
            <div class="text-gray-400">Tempo Stimato</div>
            <div class="text-2xl font-bold text-yellow-400">{formatDuration(stats().totalTime)}</div>
          </div>
        </div>
      </div>

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
                  <Layers size={64} class="text-gray-600 mx-auto mb-4" />
                  <p class="text-gray-400 text-lg">{t("cam.multi.selectElement")}</p>
                  <p class="text-gray-500 text-sm mt-2">{t("cam.multi.useSidebar")}</p>
                </div>
              </div>
            }
          >
            {elementId => (
              <div class="p-4">
                <div class="mb-4 bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Box size={20} class="text-blue-400" />
                    <span class="text-white">Configurazione toolpath per: {elementId()}</span>
                  </div>

                  <button onClick={() => setConfiguringElementId(null)} class="text-gray-400 hover:text-white transition-colors" aria-label="Close"><X size={14} /></button>
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
