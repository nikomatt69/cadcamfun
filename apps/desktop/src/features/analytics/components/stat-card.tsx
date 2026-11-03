/** `StatCard` — `.reference/src/components/analytics/StatCard.tsx` (mobile-updated variant). */
import { Show, type JSX } from "solid-js"
import { ArrowDown, ArrowUp } from "lucide-solid"

export interface StatCardProps {
  readonly title: string
  readonly value: number | string
  readonly subValue?: string | number
  readonly icon: JSX.Element
  readonly change?: number
  readonly changeLabel?: string
}

export function StatCard(props: StatCardProps): JSX.Element {
  const isPositive = (): boolean | undefined => (props.change === undefined ? undefined : props.change >= 0)
  return (
    <div class="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div class="p-4">
        <div class="flex items-center gap-3">
          <div class="flex-none text-slate-400 dark:text-slate-500">{props.icon}</div>
          <div class="w-0 flex-1">
            <dl>
              <dt class="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{props.title}</dt>
              <dd>
                <div class="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
                  {typeof props.value === "number" ? props.value.toLocaleString() : props.value}
                </div>
                <Show when={props.subValue !== undefined && props.subValue !== ""}>
                  <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">{props.subValue}</div>
                </Show>
              </dd>
            </dl>
          </div>
        </div>
      </div>

      <Show when={props.change !== undefined}>
        <div class="border-t border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
          <div class="flex items-center gap-2">
            <div class={`flex-none ${isPositive() ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              <Show when={isPositive()} fallback={<ArrowDown class="h-4 w-4" />}><ArrowUp class="h-4 w-4" /></Show>
            </div>
            <div class="text-xs">
              <span class={`font-medium ${isPositive() ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {isPositive() ? "+" : ""}{props.change}%
              </span>
              <Show when={props.changeLabel !== undefined}>
                <span class="text-slate-500 dark:text-slate-400"> {props.changeLabel}</span>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
