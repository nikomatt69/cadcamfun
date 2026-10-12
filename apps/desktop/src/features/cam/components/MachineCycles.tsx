/**
 * The "Cycles" panel (legacy `MachineCycles.tsx`): pick one of the predefined machining cycles for the controller
 * (Fanuc / Heidenhain), fill its parameters, preview the generated block and insert it into the program.
 *
 * The 17 templates and their code generation live in the core (`cam.cycles`); this file is the form around them,
 * with the legacy markup.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import { CycleIcon, cycleIcons } from "./MachineCycleIcons.tsx"

const c = cam.cycles

export type CycleController = cam.cycles.CycleController

export interface MachineCyclesProps {
  readonly controllerType: CycleController
  readonly onCycleCodeGenerated: (code: string) => void
}

export default function MachineCycles(props: MachineCyclesProps): JSX.Element {
  const [selectedCycleId, setSelectedCycleId] = createSignal<string | null>(null)
  const [cycleParams, setCycleParams] = createSignal<cam.cycles.CycleValues>({})
  const [previewCode, setPreviewCode] = createSignal("")

  const availableCycles = createMemo(() => c.availableCycles(props.controllerType))
  const selected = createMemo(() => {
    const id = selectedCycleId()
    return id === null ? undefined : c.findCycle(id)
  })
  const controllerName = (): string => (props.controllerType === "fanuc" ? "Fanuc" : "Heidenhain")

  // Initialize parameters when a new cycle is selected, and generate the preview.
  const handleCycleSelection = (cycleId: string): void => {
    setSelectedCycleId(cycleId)
    const cycle = c.findCycle(cycleId)
    if (cycle === undefined) return
    const initial = c.defaultCycleValues(cycle)
    setCycleParams(initial)
    setPreviewCode(c.generateCycleCode(cycle, initial, props.controllerType))
  }

  // Update parameters and regenerate code.
  const handleParamChange = (paramName: string, value: unknown): void => {
    const next = { ...cycleParams(), [paramName]: value }
    setCycleParams(next)
    const cycle = selected()
    if (cycle !== undefined) setPreviewCode(c.generateCycleCode(cycle, next, props.controllerType))
  }

  const handleInsertCycle = (): void => {
    if (previewCode()) props.onCycleCodeGenerated(previewCode())
  }

  return (
    <div class="machine-cycles bg-white dark:bg-gray-800 dark:text-white rounded-lg shadow-md overflow-hidden" data-testid="machine-cycles">
      <div class="bg-white border-b border-gray-200 dark:bg-gray-700 dark:border-gray-600 p-3">
        <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100">Machining Cycles</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">Select and configure predefined cycles for {controllerName()}</p>
      </div>

      <div class="machine-cycles-layout">
        {/* Cycle selection panel */}
        <div class="border rounded-md overflow-hidden dark:border-gray-600">
          <div class="bg-white px-3 py-2 border-b dark:bg-gray-700 dark:border-gray-600">
            <h3 class="text-md font-medium text-gray-900 dark:text-gray-100">Available Cycles</h3>
          </div>
          <div class="p-2 max-h-72 overflow-y-auto">
            <div class="machine-cycle-list">
              <For each={availableCycles()}>
                {(cycle) => (
                  <button
                    type="button"
                    data-cycle-id={cycle.id}
                    class={`machine-cycle-choice rounded-md text-xs hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex flex-col items-center ${
                      selectedCycleId() === cycle.id
                        ? "bg-blue-100 border border-blue-300 dark:bg-blue-900 dark:border-blue-700"
                        : "border border-gray-200 dark:border-gray-600"
                    }`}
                    onClick={() => handleCycleSelection(cycle.id)}
                  >
                    <div class="w-10 h-10 flex items-center justify-center mb-2 text-gray-600 dark:text-gray-400">
                      {cycleIcons[cycle.icon]()}
                    </div>
                    <span class="text-xs font-medium block text-gray-800 dark:text-gray-200">{cycle.name}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>

        {/* Configuration and preview panel */}
        <div class="border rounded-md overflow-hidden dark:border-gray-600">
          <Show
            when={selected()}
            fallback={
              <div class="p-4 text-center text-gray-500 dark:text-gray-400">
                <div class="my-4">
                  <CycleIcon class="mx-auto mb-2 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p>Select a cycle to configure it</p>
                </div>
              </div>
            }
          >
            {(cycle) => (
              <>
                <div class="bg-gray-50 px-4 py-2 border-b dark:bg-gray-700 dark:border-gray-600">
                  <h3 class="text-md font-medium text-gray-900 dark:text-gray-100">{cycle().name || "Cycle Configuration"}</h3>
                </div>
                <div class="p-4 max-h-72 overflow-y-auto">
                  <For each={cycle().parameters}>
                    {(param) => (
                      <div class="mb-3">
                        <label for={param.name} class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          {param.label}
                          <Show when={param.unit}><span class="text-gray-500 dark:text-gray-400 ml-1">({param.unit})</span></Show>
                        </label>

                        <Show when={param.type === "number"}>
                          <div class="mt-1 flex rounded-md shadow-sm">
                            <input
                              type="number"
                              id={param.name}
                              min={param.min}
                              max={param.max}
                              step={param.step}
                              value={cycleParams()[param.name]}
                              onInput={(event) => handleParamChange(param.name, parseFloat(event.currentTarget.value))}
                              class="flex-1 min-w-0 block w-full px-3 py-2 rounded-md sm:text-sm border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                            />
                          </div>
                        </Show>

                        <Show when={param.type === "select"}>
                          <select
                            id={param.name}
                            value={cycleParams()[param.name]}
                            onChange={(event) => handleParamChange(param.name, event.currentTarget.value)}
                            class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          >
                            <For each={param.options}>
                              {(option) => <option value={option.value} selected={cycleParams()[param.name] === option.value}>{option.label}</option>}
                            </For>
                          </select>
                        </Show>

                        <Show when={param.type === "checkbox"}>
                          <div class="mt-1 flex items-center">
                            <input
                              type="checkbox"
                              id={param.name}
                              checked={Boolean(cycleParams()[param.name])}
                              onChange={(event) => handleParamChange(param.name, event.currentTarget.checked)}
                              class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-600 dark:ring-offset-gray-800"
                            />
                            <label for={param.name} class="ml-2 block text-sm text-gray-500 dark:text-gray-400">{param.description}</label>
                          </div>
                        </Show>

                        <Show when={param.type !== "checkbox" && param.description}>
                          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{param.description}</p>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </>
            )}
          </Show>
        </div>
      </div>

      {/* Code preview */}
      <Show when={selectedCycleId()}>
        <div class="p-4 border-t border-gray-200 dark:border-gray-600">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-md font-medium text-gray-900 dark:text-gray-100">Code Preview</h3>
            <button
              type="button"
              onClick={handleInsertCycle}
              class="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-600"
            >
              Insert Cycle
            </button>
          </div>
          <pre data-testid="cycle-preview" class="bg-gray-100 p-3 rounded-md text-sm font-mono overflow-x-auto max-h-60 dark:bg-gray-900 dark:text-gray-300">{previewCode()}</pre>
        </div>
      </Show>
    </div>
  )
}
