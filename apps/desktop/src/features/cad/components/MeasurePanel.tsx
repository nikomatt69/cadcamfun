import { For, Show, createMemo, type JSX } from "solid-js"
import { Copy, Ruler, Trash2, X } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { formatLength, UNIT_TABLE, toDisplay, type DisplayUnits } from "../../../viewport/units.ts"
import { betweenRows, entityRows, rowsText, type MeasureFormat, type MeasureOutcome, type MeasureRow, type MeasureTarget } from "../lib/measure.ts"

interface Props {
  readonly outcome: MeasureOutcome | undefined
  readonly units: DisplayUnits
  readonly decimals?: number
  /** The display name of a part, for the pick chips. */
  readonly nameOf: (elementId: string) => string
  readonly onClear: () => void
  readonly onClose: () => void
}

/** The formatting of lengths, areas, volumes, angles and points in the drawing's display unit; model coordinates stay millimetres. */
export const measureFormat = (units: DisplayUnits, decimals?: number): MeasureFormat => {
  const places = decimals ?? UNIT_TABLE[units].decimals
  const label = UNIT_TABLE[units].label
  const n = (mm: number) => toDisplay(mm, units)
  const scalar = (value: number) => (Math.abs(value) < 0.5 * 10 ** -places ? 0 : value).toFixed(places)
  return {
    length: (mm) => formatLength(mm, units, places),
    area: (mm2) => `${(mm2 / UNIT_TABLE[units].mmPerUnit ** 2).toFixed(places)} ${label}²`,
    volume: (mm3) => `${(mm3 / UNIT_TABLE[units].mmPerUnit ** 3).toFixed(places)} ${label}³`,
    angle: (degrees) => `${degrees.toFixed(Math.min(places, 4))}°`,
    point: (p) => `X ${scalar(n(p.x))}  Y ${scalar(n(p.y))}  Z ${scalar(n(p.z))}`
  }
}

const targetLabel = (target: MeasureTarget, nameOf: (id: string) => string): string => {
  const part = nameOf(target.elementId)
  if (target.kind === "body") return t("cad.measure.body", { name: part })
  const head = target.kind === "face" ? t("cad.sub.face", { index: target.index }) : target.kind === "edge" ? t("cad.sub.edge", { index: target.index }) : t("cad.sub.vertex", { index: target.index })
  return `${head} · ${part}`
}

/**
 * The Measure inspector's panel: the picks, then what they measure (one pick describes itself, two give the distance, the axis
 * deltas, the angle and the parallel gap, then each pick on its own). Exact kernel numbers; the copy button puts them on the clipboard.
 */
export default function MeasurePanel(props: Props): JSX.Element {
  const format = createMemo(() => measureFormat(props.units, props.decimals))
  const sections = createMemo((): ReadonlyArray<{ readonly title: string; readonly rows: ReadonlyArray<MeasureRow> }> => {
    const outcome = props.outcome
    if (outcome === undefined || !outcome.ok) return []
    const f = format()
    if (outcome.single !== undefined) return [{ title: targetLabel(outcome.targets[0]!, props.nameOf), rows: entityRows(outcome.single, f) }]
    const out: { title: string; rows: MeasureRow[] }[] = []
    if (outcome.between !== undefined) out.push({ title: t("cad.measure.between"), rows: betweenRows(outcome.between, f) })
    if (outcome.first !== undefined) out.push({ title: targetLabel(outcome.targets[0]!, props.nameOf), rows: entityRows(outcome.first, f) })
    if (outcome.second !== undefined) out.push({ title: targetLabel(outcome.targets[1]!, props.nameOf), rows: entityRows(outcome.second, f) })
    return out
  })
  const copy = () => {
    const text = sections().map((section) => `${section.title}\n${rowsText(section.rows, t)}`).join("\n\n")
    void navigator.clipboard?.writeText(text).catch(() => undefined)
  }
  return <aside class="absolute right-3 top-16 z-40 w-[300px] max-h-[70%] overflow-auto rounded-md border border-[color:var(--ent-line)] bg-[color:var(--ent-surface)] text-xs text-[color:var(--ent-text)] shadow-lg"
    role="dialog" aria-label={t("cad.measure.title")} data-testid="measure-panel">
    <header class="flex items-center gap-2 border-b border-[color:var(--ent-line)] px-3 py-2">
      <Ruler size={14} />
      <span class="flex-1 font-semibold">{t("cad.measure.title")}</span>
      <button type="button" class="rounded p-1 hover:bg-[color:var(--ent-surface-2)]" title={t("cad.measure.copy")} aria-label={t("cad.measure.copy")} disabled={sections().length === 0} onClick={copy}><Copy size={13} /></button>
      <button type="button" class="rounded p-1 hover:bg-[color:var(--ent-surface-2)]" title={t("cad.measure.clear")} aria-label={t("cad.measure.clear")} disabled={(props.outcome?.targets.length ?? 0) === 0} onClick={() => props.onClear()} data-testid="measure-clear"><Trash2 size={13} /></button>
      <button type="button" class="rounded p-1 hover:bg-[color:var(--ent-surface-2)]" title={t("cad.measure.close")} aria-label={t("cad.measure.close")} onClick={() => props.onClose()}><X size={13} /></button>
    </header>
    <Show when={(props.outcome?.targets.length ?? 0) > 0} fallback={<p class="px-3 py-2 text-[color:var(--ent-text-muted)]">{t("cad.measure.hint")}</p>}>
      <Show when={props.outcome?.ok === false}>
        <p class="px-3 py-2 text-[color:var(--ent-bad)]" role="alert" data-testid="measure-error">{t("cad.measure.refused", { reason: props.outcome?.ok === false ? props.outcome.reason : "" })}</p>
      </Show>
      <For each={sections()}>{(section) => (
        <section class="border-b border-[color:var(--ent-line)] px-3 py-2 last:border-b-0">
          <h3 class="mb-1 font-semibold text-[color:var(--ent-text-muted)]">{section.title}</h3>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <For each={section.rows}>{(row) => <>
              <dt class="text-[color:var(--ent-text-muted)]">{t(row.label)}</dt>
              <dd class={`text-right tabular-nums ${row.emphasis ? "font-semibold" : ""}`} data-testid={`measure-${row.label.slice("cad.measure.".length)}`}>{row.value}</dd>
            </>}</For>
          </dl>
        </section>
      )}</For>
      <Show when={(props.outcome?.targets.length ?? 0) === 1}><p class="px-3 pb-2 text-[color:var(--ent-text-muted)]">{t("cad.measure.second")}</p></Show>
    </Show>
  </aside>
}
