import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { RotateCw } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { panelCycles, type PanelCycle } from "../../lib/cyclePanel.ts"
import { useJob } from "../../hooks/useJob.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { t } from "../../../../i18n/index.ts"
import { Section } from "./ui.tsx"

const g = cam.generator

/** Editor of one cycle line: a field per parameter of its cycle type, "Apply Changes" writes the line back. */
export function FixedCycleEditor(props: { readonly line: string; readonly onApply?: (gcode: string) => void; readonly onChange?: (params: cam.generator.FixedCycleParams) => void; readonly class?: string }): JSX.Element {
  const result = createMemo(() => (props.line ? g.parseFixedCycle(props.line) : null))
  const [params, setParams] = createSignal<cam.generator.FixedCycleParams>({})
  createEffect(on(result, (parsed) => { if (parsed?.isValid) setParams(parsed.params) }))
  const change = (name: string, value: number): void => {
    const next = { ...params(), [name]: value }
    setParams(next)
    props.onChange?.(next)
  }
  return (
    <Show when={result()?.isValid ? result() : undefined}>
      {(cycle) => (
        <div class={`fixed-cycle-editor bg-white dark:bg-gray-800 dark:text-gray-200 p-4 rounded-md shadow-md border dark:border-gray-700 ${props.class ?? ""}`}>
          <div class="fixed-cycle-header border-b pb-2 mb-3 dark:border-gray-600">
            <h3 class="text-lg font-semibold dark:text-gray-100">{g.cycleTitle(cycle().type)}</h3>
            <div class="fixed-cycle-gcode text-sm text-gray-500 dark:text-gray-400 font-mono mt-1">{cycle().gCode}</div>
          </div>
          <div class="fixed-cycle-params grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
            <For each={g.cycleParameterFields(cycle().type)}>
              {(field) => (
                <div class="param-field">
                  <label for={`param-${field.name}`} class="block text-sm font-medium mb-1 dark:text-gray-300">
                    {field.label}
                    <Show when={field.required}><span class="required text-red-500 ml-1">*</span></Show>
                  </label>
                  <div class="param-input-group flex items-center">
                    <input
                      id={`param-${field.name}`}
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step || 1}
                      value={params()[field.name] ?? field.defaultValue}
                      onChange={(event) => change(field.name, parseFloat(event.currentTarget.value))}
                      class="flex-grow px-2 py-1 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                    <Show when={field.unit}><span class="unit ml-2 text-sm text-gray-500 dark:text-gray-400">{field.unit}</span></Show>
                  </div>
                  <div class="param-description text-xs text-gray-500 mt-1 dark:text-gray-400">{field.description}</div>
                </div>
              )}
            </For>
          </div>
          <Show when={props.onApply}>
            <div class="fixed-cycle-actions mt-4 text-right">
              <button
                class="apply-button px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-offset-gray-800"
                onClick={() => props.onApply?.(g.generateFixedCycleGCode(cycle().type, params()))}
              >
                Apply Changes
              </button>
            </div>
          </Show>
        </div>
      )}
    </Show>
  )
}

/** "Detected Fixed Cycles (n)": one card per cycle with its position and depth (legacy `FixedCycleInfoPanel`). */
function FixedCycleInfoPanel(props: { readonly cycles: ReadonlyArray<PanelCycle>; readonly onSelect: (index: number) => void }): JSX.Element {
  return (
    <div class="fixed-cycles-info-panel">
      <h3>Detected Fixed Cycles ({props.cycles.length})</h3>
      <div class="cycles-list">
        <For each={props.cycles}>
          {(cycle, index) => (
            <div class="cycle-item" onClick={() => props.onSelect(index())}>
              <div class="cycle-position">X: {cycle.x?.toFixed(2)}, Y: {cycle.y?.toFixed(2)}</div>
              <div class="cycle-depth">Z: {cycle.z?.toFixed(2)} (R: {cycle.r?.toFixed(2)})</div>
              <Show when={cycle.q}>{(q) => <div class="cycle-increment">Inc: {q().toFixed(2)}mm</div>}</Show>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

/** "Fixed Cycles": cycles found in the program, the editor for the picked one, create / remove. */
export function FixedCyclesSection(props: { readonly onGCode: (gcode: string) => void }): JSX.Element {
  const gen = useGeneratorStore()
  const job = useJob()
  const [generated, setGenerated] = createSignal("")
  const cycles = createMemo(() => panelCycles(gen.currentGCode))

  // Legacy `handleCycleSelect`: rebuilds a G81 line from the picked cycle and opens it in the editor.
  const selectCycle = (index: number): void => {
    const cycle = cycles()[index]
    if (!cycle) return
    setGenerated(`G81 X${cycle.x?.toFixed(3) || "0"} Y${cycle.y?.toFixed(3) || "0"} Z${cycle.z?.toFixed(3) || "0"} R${cycle.r?.toFixed(3) || "0"} F${cycle.f || "100"}`)
  }

  // Replaces the cycle lines of the current program by `cycle` and hands the program back (legacy `handleFixedCycleGCode`).
  const apply = (cycle: string): void => {
    const next = g.replaceFixedCycles(gen.currentGCode, cycle)
    gen.setCurrentGCode(next)
    gen.setResult(next, g.detectFixedCycles(next))
    props.onGCode(next)
  }

  // "Generate Fixed Cycle from Selected Elements": one G81 per drilling point of the selection.
  const fromSelection = (): void => {
    const selection = job.selection()
    if (selection.length === 0) { gen.flashError(t("cam.cycles.selectElement")); return }
    const points = selection.flatMap((element) => g.getDrillingPoints(element))
    if (points.length === 0) { gen.flashError(t("cam.cycles.noDrillingPoints")); return }
    const lines = points.map((p) => g.generateFixedCycleGCode(g.FixedCycleType.DRILLING, { x: p.x, y: p.y, z: -10, r: 2, f: 100 }))
    setGenerated(lines[0] ?? "")
    props.onGCode(lines.join("\n"))
  }

  return (
    <Section id="fixedCycles" delay={0.42} tone="cyan" icon={RotateCw} title="Fixed Cycles" testId="fixed-cycles-section">
      <div class="toolpath-generator-integration">
        <div class="fixed-cycles-actions">
          <h3>Fixed Cycles</h3>
          <div class="cycle-buttons">
            <button onClick={fromSelection} disabled={job.selection().length === 0}>Generate Fixed Cycle from Selected Elements</button>
          </div>
        </div>
        <Show when={cycles().length > 0}>
          <FixedCycleInfoPanel cycles={cycles()} onSelect={selectCycle} />
        </Show>
        <Show when={generated()}>
          <FixedCycleEditor line={generated()} onApply={props.onGCode} class="cycle-editor" />
        </Show>
      </div>

      <Show when={gen.detectedCycles.length > 0}>
        <div class="mt-4 p-3 bg-blue-50 rounded-md">
          <h4 class="text-sm font-medium text-blue-800 mb-2">Detected Fixed Cycles ({gen.detectedCycles.length})</h4>
          <div class="space-y-2">
            <For each={gen.detectedCycles}>
              {(cycle) => (
                <div class="p-2 bg-white rounded border border-blue-200 cursor-pointer hover:bg-blue-50" onClick={() => gen.setSelectedCycle(cycle)}>
                  <div class="text-xs font-mono">{cycle.gcode}</div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={gen.selectedCycle}>
        {(cycle) => (
          <div class="mt-4">
            <h4 class="text-sm font-medium text-gray-800 mb-2">Modify Fixed Cycle</h4>
            <FixedCycleEditor line={cycle().gcode} onApply={apply} />
          </div>
        )}
      </Show>

      <div class="mb-4 flex justify-between">
        <button
          type="button"
          class="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onClick={() => {
            const element = job.element()
            if (!element) { gen.flashError(t("cam.cycles.selectFirst")); return }
            apply(g.drillingCycleAt(Number(element["x"]) || 0, Number(element["y"]) || 0, gen.settings.depth, gen.settings.feedrate))
          }}
        >
          Create Fixed Cycle
        </button>
        <Show when={gen.detectedCycles.length > 0}>
          <button
            type="button"
            class="px-3 py-1 bg-gray-200 text-gray-800 text-sm rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
            onClick={() => {
              const next = g.removeFixedCycles(gen.currentGCode)
              gen.setResult(next, [])
              gen.setSelectedCycle(null)
              props.onGCode(next)
            }}
          >
            Remove All Fixed Cycles
          </button>
        </Show>
      </div>
    </Section>
  )
}
