/** Fixed cycles of the selected controller: filterable list grouped by family, parameter form, NC preview and insert. Templates in core stay the only source of NC. */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Badge, Note, PanelCard } from "../../../shared/components/panel/ui.tsx"
import { t } from "../../../i18n/index.ts"
import { cycleIconFor } from "./MachineCycleIcons.tsx"
import { availableCycles, controllerName, cycleSupport, defaultCycleValues, generateCycleCode, type CycleController, type CycleValues } from "./cycles/cycleApi.ts"
import { groupByFamily, matchesFilter } from "./cycles/cycleFamilies.ts"
import { ParameterForm } from "./cycles/ParameterForm.tsx"

export type { CycleController } from "./cycles/cycleApi.ts"
export interface MachineCyclesProps {
  readonly controllerType: CycleController
  readonly onCycleCodeGenerated: (code: string) => void
  /** Text of the tab's filter box; empty shows every cycle. */
  readonly filter?: string
}

export default function MachineCycles(props: MachineCyclesProps): JSX.Element {
  const [selectedCycleId, setSelectedCycleId] = createSignal<string | null>(null)
  const [cycleParams, setCycleParams] = createSignal<CycleValues>({})
  const all = createMemo(() => cycleSupport(props.controllerType).cycles ? availableCycles(props.controllerType) : [])
  const groups = createMemo(() => groupByFamily(all().filter((cycle) => matchesFilter(cycle, props.filter ?? ""))))
  // A cycle of another controller drops out of the selection when the controller changes.
  const selected = createMemo(() => all().find((cycle) => cycle.id === selectedCycleId()))
  const previewCode = createMemo(() => {
    const cycle = selected()
    if (!cycle) return ""
    try { return generateCycleCode(cycle, cycleParams(), props.controllerType) } catch { return "" }
  })
  const selectCycle = (id: string): void => {
    setSelectedCycleId(id)
    const cycle = all().find((entry) => entry.id === id)
    if (cycle) setCycleParams(defaultCycleValues(cycle))
  }
  return <div class="panel machine-cycles" data-testid="machine-cycles">
    <PanelCard title={t("cam.cycles.fixed")} actions={<Badge testId="cycles-count">{all().length}</Badge>}>
      <Show when={all().length > 0} fallback={<Note testId="cycles-unsupported">{t("cam.cycles.noCycles", { controller: controllerName(props.controllerType) })}</Note>}>
        <For each={groups()} fallback={<Note>{t("cam.cycles.noMatch")}</Note>}>{(group) => <>
          <h4 class="panel-label" data-testid={`cycle-family-${group.family}`}>{t(`cam.cycles.family.${group.family}`)}</h4>
          <div class="machine-cycle-list">
            <For each={group.items}>{(cycle) => <button type="button" data-cycle-id={cycle.id}
              class="machine-cycle-choice" aria-pressed={selectedCycleId() === cycle.id} onClick={() => selectCycle(cycle.id)}>
              <span class="machine-cycle-choice__icon">{cycleIconFor(cycle.icon)}</span><span>{cycle.name}</span>
            </button>}</For>
          </div>
        </>}</For>
      </Show>
    </PanelCard>
    <Show when={all().length > 0}>
      <Show when={selected()} fallback={<Note>{t("cam.panel.selectCycle")}</Note>}>{(cycle) => <>
        <PanelCard title={cycle().name}>
          <ParameterForm parameters={cycle().parameters} values={cycleParams()} idPrefix="cycle" onChange={(name, value) => setCycleParams({ ...cycleParams(), [name]: value })} />
        </PanelCard>
        <PanelCard title={t("cam.panel.cyclePreview")} actions={<button type="button" class="panel-btn panel-btn--primary" onClick={() => { if (previewCode()) props.onCycleCodeGenerated(previewCode()) }}>{t("cam.panel.insertCycle")}</button>}>
          <pre data-testid="cycle-preview" class="panel-code">{previewCode()}</pre>
        </PanelCard>
      </>}</Show>
    </Show>
  </div>
}
