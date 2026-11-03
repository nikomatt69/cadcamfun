import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import { panelCycles, type PanelCycle } from "../../lib/cyclePanel.ts"
import { useJob } from "../../hooks/useJob.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { t } from "../../../../i18n/index.ts"
import { NumberField } from "../../../cad/components/property-inputs/NumberField.tsx"

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
        <div class={`panel-group rounded-[5px] border border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] p-3 ${props.class ?? ""}`}>
          <div class="grid gap-0.5">
            <h3 class="m-0 text-xs font-semibold text-[color:var(--panel-text)]">{g.cycleTitle(cycle().type)}</h3>
            <div class="panel-mono">{cycle().gCode}</div>
          </div>
          <div class="panel-grid panel-grid--2">
            <For each={g.cycleParameterFields(cycle().type)}>
              {(field) => (
                <div class="panel-field">
                  <label for={`param-${field.name}`} class="panel-label">
                    <span>
                      {field.label}
                      <Show when={field.required}><span class="ml-1 text-[color:var(--panel-bad)]">*</span></Show>
                    </span>
                    <Show when={field.unit}><span class="panel-label__unit">{field.unit}</span></Show>
                  </label>
                  <NumberField
                    id={`param-${field.name}`}
                    deferred
                    min={field.min}
                    max={field.max}
                    step={field.step || 1}
                    value={params()[field.name] ?? field.defaultValue}
                    onChange={(value) => change(field.name, value)}
                    class="panel-input"
                  />
                  <p class="panel-hint">{field.description}</p>
                </div>
              )}
            </For>
          </div>
          <Show when={props.onApply}>
            <button
              type="button"
              class="panel-btn panel-btn--primary panel-btn--block"
              onClick={() => props.onApply?.(g.generateFixedCycleGCode(cycle().type, params()))}
            >
              {t("cam.gen.fc.apply")}
            </button>
          </Show>
        </div>
      )}
    </Show>
  )
}

/** "Detected Fixed Cycles (n)": one card per cycle with its position and depth (legacy `FixedCycleInfoPanel`). */
function FixedCycleInfoPanel(props: { readonly cycles: ReadonlyArray<PanelCycle>; readonly onSelect: (index: number) => void }): JSX.Element {
  return (
    <div class="panel-group">
      <h3 class="panel-group__title">Detected Fixed Cycles ({props.cycles.length})</h3>
      <div class="grid gap-1">
        <For each={props.cycles}>
          {(cycle, index) => (
            <button type="button" class="grid gap-0.5 rounded-[4px] border border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] px-2 py-1.5 text-left text-[11px] tabular-nums text-[color:var(--panel-text)] hover:bg-[color:var(--panel-bg-subtle)]" onClick={() => props.onSelect(index())}>
              <span>X: {cycle.x?.toFixed(2)}, Y: {cycle.y?.toFixed(2)}</span>
              <span class="text-[color:var(--panel-text-muted)]">Z: {cycle.z?.toFixed(2)} (R: {cycle.r?.toFixed(2)})</span>
              <Show when={cycle.q}>{(q) => <span class="text-[color:var(--panel-text-muted)]">Inc: {q().toFixed(2)}{t("cad.millimeters")}</span>}</Show>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}

/** "Fixed Cycles": cycles found in the program, the editor for the picked one, create / remove. */
export function FixedCyclesSection(props: { readonly onGCode: (gcode: string) => void; readonly gcode?: string }): JSX.Element {
  const gen = useGeneratorStore()
  const job = useJob()
  const [generated, setGenerated] = createSignal("")
  const source = (): string => props.gcode ?? gen.currentGCode
  const cycles = createMemo(() => panelCycles(source()))

  // Legacy `handleCycleSelect`: rebuilds a G81 line from the picked cycle and opens it in the editor.
  const selectCycle = (index: number): void => {
    const cycle = cycles()[index]
    if (!cycle) return
    setGenerated(`G81 X${cycle.x?.toFixed(3) || "0"} Y${cycle.y?.toFixed(3) || "0"} Z${cycle.z?.toFixed(3) || "0"} R${cycle.r?.toFixed(3) || "0"} F${cycle.f || "100"}`)
  }

  // Replaces the cycle lines of the current program by `cycle` and hands the program back (legacy `handleFixedCycleGCode`).
  const apply = (cycle: string): void => {
    const next = g.replaceFixedCycles(source(), cycle)
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
    <div class="grid gap-3" data-testid="fixed-cycles-section">
      <div class="panel-group">
        <div class="panel-row">
          <h3 class="panel-group__title">{t("cam.ribbon.cycles")}</h3>
          <button type="button" class="panel-btn" onClick={fromSelection} disabled={job.selection().length === 0}>{t("cam.gen.fc.generate")}</button>
        </div>
        <Show when={cycles().length > 0}>
          <FixedCycleInfoPanel cycles={cycles()} onSelect={selectCycle} />
        </Show>
        <Show when={generated()}>
          <FixedCycleEditor line={generated()} onApply={props.onGCode} class="cycle-editor" />
        </Show>
      </div>

      <Show when={gen.detectedCycles.length > 0}>
        <div class="panel-group">
          <h4 class="panel-group__title">Detected Fixed Cycles ({gen.detectedCycles.length})</h4>
          <div class="grid gap-1">
            <For each={gen.detectedCycles}>
              {(cycle) => (
                <button type="button" class="rounded-[4px] border border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] px-2 py-1.5 text-left font-mono text-[11px] text-[color:var(--panel-text)] hover:bg-[color:var(--panel-bg-subtle)]" onClick={() => gen.setSelectedCycle(cycle)}>{cycle.gcode}</button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={gen.selectedCycle}>
        {(cycle) => (
          <div class="panel-group">
            <h4 class="panel-group__title">{t("cam.gen.fc.modify")}</h4>
            <FixedCycleEditor line={cycle().gcode} onApply={apply} />
          </div>
        )}
      </Show>

      <div class="panel-row">
        <button
          type="button"
          class="panel-btn panel-btn--primary"
          onClick={() => {
            const element = job.element()
            if (!element) { gen.flashError(t("cam.cycles.selectFirst")); return }
            apply(g.drillingCycleAt(Number(element["x"]) || 0, Number(element["y"]) || 0, gen.settings.depth, gen.settings.feedrate))
          }}
        >
          {t("cam.gen.fc.create")}
        </button>
        <Show when={gen.detectedCycles.length > 0}>
          <button
            type="button"
            class="panel-btn"
            onClick={() => {
              const next = g.removeFixedCycles(source())
              gen.setResult(next, [])
              gen.setSelectedCycle(null)
              props.onGCode(next)
            }}
          >
            {t("cam.gen.fc.removeAll")}
          </button>
        </Show>
      </div>
    </div>
  )
}
