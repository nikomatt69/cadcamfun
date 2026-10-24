/** Controller cycles use the shared generator-style fields and keep the core templates as their only source of NC. */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import { Badge, CheckRow, Field, INPUT, Note, PanelCard } from "../../../shared/components/panel/ui.tsx"
import { NumberField } from "../../cad/components/property-inputs/NumberField.tsx"
import { t } from "../../../i18n/index.ts"
import { cycleIcons } from "./MachineCycleIcons.tsx"

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
  const selected = createMemo(() => selectedCycleId() === null ? undefined : c.findCycle(selectedCycleId()!))
  const controllerName = () => props.controllerType === "fanuc" ? "Fanuc" : "Heidenhain"
  const selectCycle = (id: string): void => {
    setSelectedCycleId(id)
    const cycle = c.findCycle(id)
    if (!cycle) return
    const initial = c.defaultCycleValues(cycle)
    setCycleParams(initial)
    setPreviewCode(c.generateCycleCode(cycle, initial, props.controllerType))
  }
  const change = (name: string, value: unknown): void => {
    const next = { ...cycleParams(), [name]: value }
    setCycleParams(next)
    const cycle = selected()
    if (cycle) setPreviewCode(c.generateCycleCode(cycle, next, props.controllerType))
  }
  return <div class="panel machine-cycles" data-testid="machine-cycles">
    <PanelCard title={t("cam.panel.cycles")} actions={<Badge>{controllerName()}</Badge>}>
      <div class="machine-cycle-list">
        <For each={availableCycles()}>{cycle => <button type="button" data-cycle-id={cycle.id}
          class="machine-cycle-choice" aria-pressed={selectedCycleId() === cycle.id} onClick={() => selectCycle(cycle.id)}>
          <span class="machine-cycle-choice__icon">{cycleIcons[cycle.icon]()}</span><span>{cycle.name}</span>
        </button>}</For>
      </div>
    </PanelCard>
    <Show when={selected()} fallback={<Note>{t("cam.panel.selectCycle")}</Note>}>{cycle => <>
      <PanelCard title={cycle().name}>
        <For each={cycle().parameters}>{param => <Show when={param.type !== "checkbox"} fallback={
          <CheckRow id={`cycle-${param.name}`} checked={Boolean(cycleParams()[param.name])} onChange={value => change(param.name, value)}>{param.label}</CheckRow>
        }>
          <Field label={param.label} unit={param.unit} hint={param.description} for={`cycle-${param.name}`}>
            <Show when={param.type === "number"} fallback={
              <select id={`cycle-${param.name}`} class={INPUT} value={String(cycleParams()[param.name] ?? "")} onChange={event => change(param.name, event.currentTarget.value)}>
                <For each={param.options}>{option => <option value={option.value}>{option.label}</option>}</For>
              </select>
            }>
              <NumberField id={`cycle-${param.name}`} class={INPUT} value={Number(cycleParams()[param.name] ?? 0)} min={param.min} max={param.max} step={param.step}
                onChange={value => change(param.name, value)} />
            </Show>
          </Field>
        </Show>}</For>
      </PanelCard>
      <PanelCard title={t("cam.panel.cyclePreview")} actions={<button type="button" class="panel-btn panel-btn--primary" onClick={() => { if (previewCode()) props.onCycleCodeGenerated(previewCode()) }}>{t("cam.panel.insertCycle")}</button>}>
        <pre data-testid="cycle-preview" class="panel-code">{previewCode()}</pre>
      </PanelCard>
    </>}</Show>
  </div>
}
