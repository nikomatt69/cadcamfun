/**
 * Advanced panel for G-code post-processing (legacy `AdvancedPostProcessorPanel.tsx`).
 *
 * Optimises and converts G-code text for a controller dialect, with general options, Fanuc / Heidenhain specific
 * options, presets, statistics, validation ("Safety Checks"), the list of applied optimisations and a preview.
 * The processing itself lives in the core (`cam.advanced.processGCode`); this component only edits the options
 * and shows the result.
 */
import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { AlertTriangle, Check, Cpu, Eye, Info, Loader, Save, Settings, Sliders } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { t } from "../../../i18n/index.ts"
import { CheckRow, Field, Note, PanelSection, Stat } from "../../../shared/components/panel/ui.tsx"
import { gcodeSummary } from "../lib/gcode-summary.ts"
import "../../../styles/cam-panels.css"

const advanced = cam.advanced

type ControllerType = cam.advanced.ControllerType
type Options = cam.advanced.OptimizationOptions
type Result = cam.advanced.OptimizationResult

export interface AdvancedPostProcessorPanelProps {
  readonly onControllerChange?: ((controller: ControllerType) => void) | undefined
  readonly initialGcode: string
  readonly controllerType: ControllerType
  /** Receives the processed program and its statistics (legacy `onProcessedGcode(code, stats)`). */
  readonly onProcessedGcode: (gcode: string, stats?: Result["stats"]) => void
}

interface OptionCheckboxProps {
  readonly id: string
  readonly label: string
  readonly checked: boolean | undefined
  readonly onChange: (checked: boolean) => void
}

function OptionCheckbox(props: OptionCheckboxProps): JSX.Element {
  return <CheckRow id={props.id} checked={props.checked ?? false} onChange={props.onChange}>{props.label}</CheckRow>
}

export default function AdvancedPostProcessorPanel(props: AdvancedPostProcessorPanelProps): JSX.Element {
  const [preset, setPreset] = createSignal("custom")
  const [inputGcode, setInputGcode] = createSignal(props.initialGcode)
  const [outputGcode, setOutputGcode] = createSignal("")
  const [isProcessing, setIsProcessing] = createSignal(false)
  const [result, setResult] = createSignal<Result | null>(null)
  const [selectedController, setSelectedController] = createSignal<ControllerType>(props.controllerType)
  const [options, setOptions] = createSignal<Options>(advanced.DEFAULT_OPTIONS)
  const [expanded, setExpanded] = createSignal({ generalOptions: true, controllerOptions: true, results: true, preview: false })

  createEffect(on(() => props.initialGcode, (next) => {
    if (next !== inputGcode()) {
      setInputGcode(next)
      setOutputGcode("")
      setResult(null)
    }
  }, { defer: true }))
  createEffect(on(() => props.controllerType, (next) => setSelectedController(next), { defer: true }))

  const toggleSection = (section: keyof ReturnType<typeof expanded>): void => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const updateOption = <K extends keyof Options>(key: K, value: Options[K]): void => {
    setPreset("custom")
    setOptions((prev) => ({ ...prev, [key]: value }))
  }

  const updateFanuc = (key: keyof cam.advanced.FanucOptions, value: boolean): void => {
    setPreset("custom")
    setOptions((prev) => ({ ...prev, controllerSpecific: { ...prev.controllerSpecific, fanuc: { ...prev.controllerSpecific.fanuc, [key]: value } } }))
  }

  const updateHeidenhain = (key: keyof cam.advanced.HeidenhainOptions, value: boolean): void => {
    setPreset("custom")
    setOptions((prev) => ({ ...prev, controllerSpecific: { ...prev.controllerSpecific, heidenhain: { ...prev.controllerSpecific.heidenhain, [key]: value } } }))
  }

  const processGcode = async (): Promise<void> => {
    if (!inputGcode()) return
    setIsProcessing(true)
    setResult(null)
    try {
      await Promise.resolve()
      const processed = advanced.processGCode(selectedController(), inputGcode(), { options: options() })
      setOutputGcode(processed.code)
      setResult(processed)
      props.onProcessedGcode(processed.code, processed.stats)
    } finally {
      setIsProcessing(false)
      setExpanded((prev) => ({ ...prev, results: true }))
    }
  }

  const saveGcode = (): void => {
    if (!outputGcode()) return
    const blob = new Blob([outputGcode()], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const date = new Date().toISOString().slice(0, 10)
    const extension = selectedController() === "heidenhain" ? ".h" : ".nc"
    a.download = `optimized_${selectedController()}_${date}${extension}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const summary = createMemo(() => gcodeSummary(inputGcode()))
  const controllerName = (): string => advanced.capitalise(selectedController())
  const fanuc = (): cam.advanced.FanucOptions => options().controllerSpecific.fanuc
  const heidenhain = (): cam.advanced.HeidenhainOptions => options().controllerSpecific.heidenhain

  return (
    <div class="panel cam-post__panel" data-testid="advanced-post-processor">
      <div class="cam-post__setup">
        <h2 class="panel-header__title cam-panel-heading">
          <Cpu size={15} />
          Advanced Post-Processor
        </h2>

        <div class="cam-program-summary" data-testid="post-input-summary">
          <Stat label={t("cam.panel.blocks")} value={String(summary().blocks)} />
          <Stat label={t("cam.panel.tools")} value={summary().tools.map(n => `T${n}`).join(" · ") || t("cam.panel.notSpecified")} />
          <Stat label={t("cam.panel.offsets")} value={summary().offsets.join(" · ") || t("cam.panel.notSpecified")} />
        </div>
        <Show when={summary().blocks === 0}><Note>{t("cam.panel.noInput")}</Note></Show>
        <div class="cam-post__controls">
          <Field label={t("cam.panel.controller")} for="post-processor-type">
            <select id="post-processor-type"
              class="panel-input"
              value={selectedController()}
              onChange={(event) => { const value = event.currentTarget.value as ControllerType; setSelectedController(value); props.onControllerChange?.(value) }}
              data-testid="advanced-controller"
            >
              <option value="fanuc">Fanuc</option>
              <option value="heidenhain">Heidenhain</option>
              <option value="siemens">Siemens</option>
              <option value="haas">Haas</option>
              <option value="mazak">Mazak</option>
              <option value="okuma">Okuma</option>
              <option value="generic">Generic</option>
            </select>
          </Field>
            <button
              class="panel-btn panel-btn--primary"
              onClick={() => void processGcode()}
              disabled={isProcessing() || summary().blocks === 0}
              data-testid="process-gcode"
            >
              {isProcessing() ? <Loader size={18} class="mr-2 animate-spin" /> : <Settings size={18} class="mr-2" />}
              {isProcessing() ? "Processing..." : "Process G-code"}
            </button>
        </div>

        <div class="cam-post__presets"><span class="panel-label">{t("cam.panel.presets")}</span><div class="cam-post__result-actions" style={{ "justify-content": "flex-start" }}>
          <button
            type="button"
            class="panel-btn"
            aria-pressed={preset() === "basic"} onClick={() => { setPreset("basic"); setOptions(advanced.applyPreset("basic", options())) }}
          >
            Basic
          </button>
          <button
            type="button"
            class="panel-btn"
            aria-pressed={preset() === "speed"} onClick={() => { setPreset("speed"); setOptions(advanced.applyPreset("speed", options())) }}
          >
            Speed
          </button>
          <button
            type="button"
            class="panel-btn"
            aria-pressed={preset() === "quality"} onClick={() => { setPreset("quality"); setOptions(advanced.applyPreset("quality", options())) }}
          >
            Quality
          </button>
          <button
            type="button"
            class="panel-btn"
            aria-pressed={preset() === "advanced"} onClick={() => { setPreset("advanced"); setOptions(advanced.applyPreset("advanced", options())) }}
          >
            Advanced
          </button>
        </div>

        </div>
        <Note>{advanced.controllerDescription(selectedController())}</Note>
      </div>

      <PanelSection id="post-general" title={t("cam.panel.general")} icon={Sliders} open={expanded().generalOptions} onToggle={() => toggleSection("generalOptions")}>

        <Show when={expanded().generalOptions}>
          <div class="cam-post__grid">
            <div>
              <h4 class="font-medium text-gray-700 mb-2">Path Optimization</h4>
              <div class="space-y-2">
                <OptionCheckbox id="removeRedundantMoves" label="Remove redundant moves" checked={options().removeRedundantMoves} onChange={(v) => updateOption("removeRedundantMoves", v)} />
                <OptionCheckbox id="optimizeRapidMoves" label="Optimize rapid moves" checked={options().optimizeRapidMoves} onChange={(v) => updateOption("optimizeRapidMoves", v)} />
                <OptionCheckbox id="optimizeToolpaths" label="Optimize toolpaths" checked={options().optimizeToolpaths} onChange={(v) => updateOption("optimizeToolpaths", v)} />
                <OptionCheckbox id="minimizeAxisMovement" label="Minimize axis movement" checked={options().minimizeAxisMovement} onChange={(v) => updateOption("minimizeAxisMovement", v)} />
                <OptionCheckbox id="useArcOptimization" label="Optimize arcs and circles" checked={options().useArcOptimization} onChange={(v) => updateOption("useArcOptimization", v)} />
              </div>
            </div>

            <div>
              <h4 class="font-medium text-gray-700 mb-2">Code Optimization</h4>
              <div class="space-y-2">
                <OptionCheckbox id="removeRedundantCodes" label="Remove redundant codes" checked={options().removeRedundantCodes} onChange={(v) => updateOption("removeRedundantCodes", v)} />
                <OptionCheckbox id="optimizeFeedrates" label="Optimize feed rates" checked={options().optimizeFeedrates} onChange={(v) => updateOption("optimizeFeedrates", v)} />
                <OptionCheckbox id="consolidateGCodes" label="Consolidate modal G-codes" checked={options().consolidateGCodes} onChange={(v) => updateOption("consolidateGCodes", v)} />
                <OptionCheckbox id="removeEmptyLines" label="Remove excess empty lines" checked={options().removeEmptyLines} onChange={(v) => updateOption("removeEmptyLines", v)} />
                <OptionCheckbox id="removeComments" label="Remove comments" checked={options().removeComments} onChange={(v) => updateOption("removeComments", v)} />
              </div>
            </div>

            <div>
              <h4 class="font-medium text-gray-700 mb-2">Advanced Features</h4>
              <div class="space-y-2">
                <OptionCheckbox id="useHighSpeedMode" label="Enable high-speed mode" checked={options().useHighSpeedMode} onChange={(v) => updateOption("useHighSpeedMode", v)} />
                <OptionCheckbox id="useLookAhead" label="Enable look-ahead" checked={options().useLookAhead} onChange={(v) => updateOption("useLookAhead", v)} />
                <OptionCheckbox id="useTCPMode" label="Enable TCP/TCPM (5-axis)" checked={options().useTCPMode} onChange={(v) => updateOption("useTCPMode", v)} />
                <OptionCheckbox id="safetyChecks" label="Perform safety checks" checked={options().safetyChecks} onChange={(v) => updateOption("safetyChecks", v)} />
              </div>
            </div>
          </div>
        </Show>
      </PanelSection>

      <PanelSection id="post-controller" title={`${controllerName()} Specific Options`} icon={Settings} open={expanded().controllerOptions} onToggle={() => toggleSection("controllerOptions")}>

        <Show when={expanded().controllerOptions}>
          <div class="p-4 pt-0">
            <Show when={selectedController() === "fanuc"}>
              <div class="cam-post__grid">
                <div>
                  <h4 class="font-medium text-gray-700 mb-2">Format Optimization</h4>
                  <div class="space-y-2">
                    <OptionCheckbox id="fanucUseDecimalFormat" label="Use decimal format" checked={fanuc().useDecimalFormat} onChange={(v) => updateFanuc("useDecimalFormat", v)} />
                    <OptionCheckbox id="fanucUseModalGCodes" label="Use modal G-codes" checked={fanuc().useModalGCodes} onChange={(v) => updateFanuc("useModalGCodes", v)} />
                    <OptionCheckbox id="fanucUseCompactGCode" label="Generate compact G-code" checked={fanuc().useCompactGCode} onChange={(v) => updateFanuc("useCompactGCode", v)} />
                  </div>
                </div>

                <div>
                  <h4 class="font-medium text-gray-700 mb-2">Advanced Features</h4>
                  <div class="space-y-2">
                    <OptionCheckbox id="fanucUseAI" label="Enable AI Contour Control" checked={fanuc().useAI} onChange={(v) => updateFanuc("useAI", v)} />
                    <OptionCheckbox id="fanucUseNanoSmoothing" label="Enable Nano Smoothing" checked={fanuc().useNanoSmoothing} onChange={(v) => updateFanuc("useNanoSmoothing", v)} />
                    <OptionCheckbox id="fanucUseCornerRounding" label="Enable corner rounding" checked={fanuc().useCornerRounding} onChange={(v) => updateFanuc("useCornerRounding", v)} />
                    <OptionCheckbox id="fanucUseHighPrecisionMode" label="Enable high-precision mode" checked={fanuc().useHighPrecisionMode} onChange={(v) => updateFanuc("useHighPrecisionMode", v)} />
                  </div>
                </div>

                <div class="md:col-span-2">
                  <div class="p-3 bg-yellow-50 rounded-md mt-2">
                    <div class="flex items-start">
                      <Info size={16} class="mt-0.5 mr-2 flex-shrink-0 text-yellow-600" />
                      <p class="text-sm text-yellow-800">
                        Advanced Fanuc options like AI Contour Control and Nano Smoothing require the CNC controller to
                        support these features. Verify that your controller supports these functions before using them.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={selectedController() === "heidenhain"}>
              <div class="cam-post__grid">
                <div>
                  <h4 class="font-medium text-gray-700 mb-2">Program Format</h4>
                  <div class="space-y-2">
                    <OptionCheckbox id="heidenhainUseConversationalFormat" label="Use conversational format" checked={heidenhain().useConversationalFormat} onChange={(v) => updateHeidenhain("useConversationalFormat", v)} />
                    <OptionCheckbox id="heidenhainUseFunctionBlocks" label="Use function blocks (LBL)" checked={heidenhain().useFunctionBlocks} onChange={(v) => updateHeidenhain("useFunctionBlocks", v)} />
                    <OptionCheckbox id="heidenhainUseCycleDefine" label="Use defined cycles (CYCL DEF)" checked={heidenhain().useCycleDefine} onChange={(v) => updateHeidenhain("useCycleDefine", v)} />
                    <OptionCheckbox id="heidenhainUseParameterProgramming" label="Use parametric programming" checked={heidenhain().useParameterProgramming} onChange={(v) => updateHeidenhain("useParameterProgramming", v)} />
                  </div>
                </div>

                <div>
                  <h4 class="font-medium text-gray-700 mb-2">Advanced Features</h4>
                  <div class="space-y-2">
                    <OptionCheckbox id="heidenhainUseTCP" label="Enable TCPM (5-axis)" checked={heidenhain().useTCP} onChange={(v) => updateHeidenhain("useTCP", v)} />
                    <OptionCheckbox id="heidenhainUseRadiusCompensation3D" label="3D radius compensation" checked={heidenhain().useRadiusCompensation3D} onChange={(v) => updateHeidenhain("useRadiusCompensation3D", v)} />
                    <OptionCheckbox id="heidenhainUseSmartTurning" label="Enable Smart Turning" checked={heidenhain().useSmartTurning} onChange={(v) => updateHeidenhain("useSmartTurning", v)} />
                  </div>
                </div>

                <div class="md:col-span-2">
                  <div class="p-3 bg-yellow-50 rounded-md mt-2">
                    <div class="flex items-start">
                      <Info size={16} class="mt-0.5 mr-2 flex-shrink-0 text-yellow-600" />
                      <p class="text-sm text-yellow-800">
                        Converting standard G-code to Heidenhain conversational format may require additional manual
                        adjustments for complex operations. Always verify the result before using it on the machine.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={["siemens", "haas", "mazak", "okuma", "generic"].includes(selectedController())}>
              <div class="p-3 bg-blue-50 rounded-md">
                <div class="flex items-start">
                  <Info size={16} class="mt-0.5 mr-2 flex-shrink-0 text-blue-600" />
                  <p class="text-sm text-blue-800">
                    Optimizations for the {controllerName()}{" "}
                    controller use the general optimization options configured in the previous section. Extended options
                    are available only for Fanuc and Heidenhain controllers.
                  </p>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </PanelSection>

      <Show when={result()}>
        {(current) => (
          <PanelSection id="post-results-section" testId="post-results" title="Optimization Results" icon={Check} open={expanded().results} onToggle={() => toggleSection("results")}>

            <Show when={expanded().results}>
              <div class="p-4 pt-0">
                <div class="cam-post__grid mb-4">
                  <div>
                    <h4 class="font-medium text-gray-700 mb-2">Statistics</h4>
                    <div class="bg-gray-50 p-3 rounded-md">
                      <div class="grid grid-cols-2 gap-2 text-sm">
                        <div class="flex justify-between">
                          <span class="text-gray-600">Original lines:</span>
                          <span class="font-medium">{current().stats.originalLines}</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-600">Optimized lines:</span>
                          <span class="font-medium">{current().stats.optimizedLines}</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-600">Reduction:</span>
                          <span class="font-medium">{current().stats.reductionPercent.toFixed(2)}%</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-600">Estimated time:</span>
                          <span class="font-medium">-{current().stats.estimatedTimeReduction.toFixed(2)} min</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 class="font-medium text-gray-700 mb-2">Safety Checks</h4>

                    <Show
                      when={current().validation.isValid}
                      fallback={
                        <div class="bg-red-50 p-3 rounded-md flex items-start">
                          <AlertTriangle size={16} class="mt-0.5 mr-2 flex-shrink-0 text-red-600" />
                          <div>
                            <p class="text-sm font-medium text-red-800 mb-1">Warning: Issues detected in the G-code</p>
                            <ul class="text-sm text-red-800 list-disc list-inside">
                              <For each={current().validation.errors}>{(error) => <li>{error}</li>}</For>
                            </ul>
                          </div>
                        </div>
                      }
                    >
                      <div class="bg-green-50 p-3 rounded-md flex items-start">
                        <Check size={16} class="mt-0.5 mr-2 flex-shrink-0 text-green-600" />
                        <p class="text-sm text-green-800">The optimized G-code passed all safety checks.</p>
                      </div>
                    </Show>

                    <Show when={current().validation.warnings.length > 0}>
                      <div class="bg-yellow-50 p-3 rounded-md flex items-start mt-2">
                        <AlertTriangle size={16} class="mt-0.5 mr-2 flex-shrink-0 text-yellow-600" />
                        <div>
                          <p class="text-sm font-medium text-yellow-800 mb-1">Warnings:</p>
                          <ul class="text-sm text-yellow-800 list-disc list-inside">
                            <For each={current().validation.warnings}>{(warning) => <li>{warning}</li>}</For>
                          </ul>
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>

                <div class="mb-4">
                  <h4 class="font-medium text-gray-700 mb-2">Applied Optimizations</h4>
                  <div class="bg-blue-50 p-3 rounded-md">
                    <ul class="text-sm text-blue-800 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <For each={current().improvements}>
                        {(improvement) => (
                          <li class="flex items-start">
                            <Check size={14} class="mt-0.5 mr-2 flex-shrink-0 text-blue-600" />
                            <span>{improvement}</span>
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                </div>

                <div class="cam-post__result-actions">
                  <button
                    type="button"
                    class="panel-btn"
                    onClick={() => toggleSection("preview")}
                  >
                    <Eye size={16} class="mr-2" />
                    {expanded().preview ? "Hide Preview" : "Show Preview"}
                  </button>

                  <button
                    type="button"
                    class="panel-btn"
                    onClick={saveGcode}
                  >
                    <Save size={16} class="mr-2" />
                    Save G-code
                  </button>

                  <button
                    type="button"
                    class="panel-btn panel-btn--primary"
                    onClick={() => void processGcode()}
                    disabled={isProcessing()}
                  >
                    <Settings size={16} class="mr-2" />
                    Reprocess
                  </button>
                </div>
              </div>
            </Show>
          </PanelSection>
        )}
      </Show>

      <Show when={result() && expanded().preview}>
        <div class="p-4">
          <h3 class="text-lg font-medium text-gray-800 mb-2">Optimized G-code Preview</h3>
          <div class="panel-code">
            <pre class="text-sm font-mono whitespace-pre-wrap" data-testid="post-preview">{outputGcode()}</pre>
          </div>
        </div>
      </Show>
    </div>
  )
}
