/** The probe cycles of the program in execution order (spec 73 §4): select, show or hide, reorder, duplicate, delete, with the verdict of the last run. */
import { For, Show, type JSX } from "solid-js"
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Trash2 } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import type { ProbeToolpath } from "../../lib/probing/cycles.ts"
import type { ProbeRunResult } from "../../lib/probing/result.ts"
import { ProbeIcon } from "./ProbeIcons.tsx"
import { StatusPill } from "./StatusPill.tsx"

export interface ProbeCycleListProps {
  readonly cycles: ReadonlyArray<ProbeToolpath>
  readonly selectedId: string | undefined
  /** The run of a cycle that still describes it. */
  readonly resultOf: (cycle: ProbeToolpath) => ProbeRunResult | undefined
  onSelect(id: string): void
  onToggleVisible(id: string): void
  onMove(id: string, direction: -1 | 1): void
  onDuplicate(id: string): void
  onRemove(id: string): void
}

export function ProbeCycleList(props: ProbeCycleListProps): JSX.Element {
  return (
    <Show when={props.cycles.length > 0} fallback={<p class="panel-empty" data-testid="probe-cycles-empty">{t("cam.probing.cycles.empty")}</p>}>
      <ul class="probing-list" data-testid="probe-cycles">
        <For each={props.cycles}>{(cycle, index) => {
          const result = () => props.resultOf(cycle)
          return (
            <li class="probing-row" data-selected={props.selectedId === cycle.id} data-testid={`probe-cycle-${cycle.id}`}>
              <button type="button" class="probing-row__main" aria-pressed={props.selectedId === cycle.id} onClick={() => props.onSelect(cycle.id)}>
                <ProbeIcon kind={cycle.probe.cycle.kind} />
                <span class="probing-row__name">{cycle.probe.name}</span>
                <Show when={result()}>{(run) => <StatusPill status={run().verdict} />}</Show>
              </button>
              <span class="probing-row__tools">
                <button type="button" class="panel-icon-btn" aria-label={cycle.visible ? t("cam.probing.cycle.hide") : t("cam.probing.cycle.show")} onClick={() => props.onToggleVisible(cycle.id)}>
                  {cycle.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button type="button" class="panel-icon-btn" aria-label={t("cam.probing.cycle.up")} disabled={index() === 0} onClick={() => props.onMove(cycle.id, -1)}><ChevronUp size={14} /></button>
                <button type="button" class="panel-icon-btn" aria-label={t("cam.probing.cycle.down")} disabled={index() === props.cycles.length - 1} onClick={() => props.onMove(cycle.id, 1)}><ChevronDown size={14} /></button>
                <button type="button" class="panel-icon-btn" aria-label={t("cam.probing.cycle.duplicate")} onClick={() => props.onDuplicate(cycle.id)}><Copy size={14} /></button>
                <button type="button" class="panel-icon-btn panel-icon-btn--danger" aria-label={t("cam.probing.cycle.remove")} onClick={() => props.onRemove(cycle.id)}><Trash2 size={14} /></button>
              </span>
            </li>
          )
        }}</For>
      </ul>
    </Show>
  )
}
