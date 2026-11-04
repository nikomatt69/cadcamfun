/**
 * The in-process inspection result (spec 73 §4): one row per characteristic, failures first, then warnings (more than the warning
 * share of the tolerance band used), then passes. Every status is text plus an icon. The list exports to CSV (3 decimals, mm) and
 * selecting a row highlights its contact in the 3D view.
 */
import { For, Show, createMemo, type JSX } from "solid-js"
import { Download, Save } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import type { InspectionVerdict } from "../../lib/probing/contract.ts"
import { displayValue, inspectionCsv, sortInspection, statusOf, summarizeInspection, WARN_SHARE } from "../../lib/probing/inspection.ts"
import { downloadText } from "../../lib/setupSheet.ts"
import { StatusPill } from "./StatusPill.tsx"

const fixed = (n: number): string => { const r = Math.round(n * 1000) / 1000; return (r === 0 ? 0 : r).toFixed(3) }
const signed = (n: number): string => { const f = fixed(n); return n > 0 && f !== "0.000" ? `+${f}` : f }

/** Where the deviation sits in its band, 0 (lower limit) to 1 (upper limit), for the little gauge. */
const position = (v: InspectionVerdict): number => {
  const span = v.upper - v.lower
  return span <= 0 ? 0.5 : Math.min(1, Math.max(0, (v.deviation - v.lower) / span))
}

export interface InspectionListProps {
  readonly verdicts: ReadonlyArray<InspectionVerdict>
  readonly warnShare?: number
  readonly selected?: string | undefined
  /** The name the export file carries. */
  readonly title?: string
  onSelect?(name: string | undefined): void
  /** Store the report with the project; absent: the button is not shown. */
  onSave?: (() => void) | undefined
  readonly saved?: boolean
  /** Hands the CSV out instead of downloading it (tests, the clipboard). */
  onExport?(csv: string, file: string): void
}

export function InspectionList(props: InspectionListProps): JSX.Element {
  const share = () => props.warnShare ?? WARN_SHARE
  const rows = createMemo(() => sortInspection(props.verdicts, share()))
  const summary = createMemo(() => summarizeInspection(props.verdicts, share()))
  const exportCsv = () => {
    const file = `${(props.title ?? "inspection").replace(/[^A-Za-z0-9._-]+/g, "-")}.csv`
    const csv = inspectionCsv(props.verdicts, share())
    if (props.onExport !== undefined) props.onExport(csv, file)
    else downloadText(file, csv, "text/csv")
  }
  return (
    <div class="probing-inspection" data-testid="inspection-list">
      <Show when={summary().total > 0} fallback={<p class="panel-empty" data-testid="inspection-empty">{t("cam.probing.inspection.empty")}</p>}>
        <p class="probing-summary" data-testid="inspection-summary" data-status={summary().status}>
          {t("cam.probing.inspection.summary", { total: summary().total, fail: summary().fail, warn: summary().warn, pass: summary().pass })}
        </p>
        <ul class="probing-verdicts">
          <For each={rows()}>{(v) => {
            const status = () => statusOf(v, share())
            return (
              <li data-testid={`inspection-row-${v.name}`} data-status={status()} data-selected={props.selected === v.name}>
                <button type="button" class="probing-verdict" aria-pressed={props.selected === v.name} onClick={() => props.onSelect?.(props.selected === v.name ? undefined : v.name)}>
                  <StatusPill status={status()} />
                  <span class="probing-verdict__name">{v.name}</span>
                  <span class="probing-verdict__figures">
                    <span>{fixed(displayValue(v, v.measured))}</span>
                    <span class="probing-verdict__dev">{signed(displayValue(v, v.deviation))}</span>
                  </span>
                  <span class="probing-gauge" aria-hidden="true">
                    <span class="probing-gauge__ok" style={{ left: `${(0.5 - share() / 2) * 100}%`, width: `${share() * 100}%` }} />
                    <span class="probing-gauge__mark" style={{ left: `${position(v) * 100}%` }} />
                  </span>
                  <span class="probing-verdict__band">{t("cam.probing.inspection.band", { nominal: fixed(displayValue(v, v.nominal)), lower: signed(displayValue(v, v.lower)), upper: signed(displayValue(v, v.upper)), unit: v.kind === "angle" ? "°" : "mm" })}</span>
                </button>
              </li>
            )
          }}</For>
        </ul>
        <div class="probing-row-actions">
          <button type="button" class="panel-btn panel-btn--fit" data-testid="inspection-csv" onClick={exportCsv}><Download size={14} />{t("cam.probing.inspection.csv")}</button>
          <Show when={props.onSave}>{(save) => (
            <button type="button" class="panel-btn panel-btn--fit" data-testid="inspection-save" disabled={props.saved === true} onClick={() => save()()}>
              <Save size={14} />{props.saved === true ? t("cam.probing.inspection.saved") : t("cam.probing.inspection.save")}
            </button>
          )}</Show>
        </div>
      </Show>
    </div>
  )
}

