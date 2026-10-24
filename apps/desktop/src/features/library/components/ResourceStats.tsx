import { For, Show, type JSX } from "solid-js"

export interface StatItem { readonly label: string; readonly value: string }

const TILE = "rounded-[5px] border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700/70 dark:bg-slate-800/40"

/** The figures of a resource as a grid of labelled tiles, the same on every details page. */
export function StatGrid(props: { readonly items: ReadonlyArray<StatItem>; readonly columns?: 2 | 3 | 4 }): JSX.Element {
  const columns = (): string => (props.columns === 4 ? "grid-cols-2 md:grid-cols-4" : props.columns === 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2")
  return <dl class={`grid gap-2 ${columns()}`}>
    <For each={props.items}>{(item) => (
      <div class={TILE}>
        <dt class="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">{item.label}</dt>
        <dd class="mt-0.5 break-words text-xs font-medium text-slate-900 dark:text-white">{item.value}</dd>
      </div>
    )}</For>
  </dl>
}

/** A value against a reference range, as a bar (a property compared with the strongest common stock). */
export function PropertyBar(props: { readonly label: string; readonly value: number; readonly max: number; readonly unit: string }): JSX.Element {
  const ratio = (): number => (props.max > 0 ? Math.min(1, Math.max(0, props.value / props.max)) : 0)
  return <div>
    <div class="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
      <span class="text-slate-600 dark:text-slate-300">{props.label}</span>
      <span class="font-medium text-slate-900 dark:text-white">{props.value > 0 ? `${props.value} ${props.unit}` : "-"}</span>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="meter" aria-label={props.label} aria-valuemin={0} aria-valuemax={props.max} aria-valuenow={Math.min(props.value, props.max)}>
      <Show when={props.value > 0}><div class="h-full rounded-full bg-blue-600 dark:bg-blue-400" style={{ width: `${(ratio() * 100).toFixed(1)}%` }} /></Show>
    </div>
  </div>
}

/** A colour swatch with its hex, for the material colour. */
export function Swatch(props: { readonly color: string }): JSX.Element {
  return <span class="inline-flex items-center gap-1.5"><span class="inline-block h-3 w-3 rounded-[3px] border border-slate-300 dark:border-slate-600" style={{ background: props.color }} aria-hidden="true" />{props.color}</span>
}
