/** `ActivityCard` — `.reference/src/components/analytics/ActivityCard.tsx`. */
import { Show, type JSX } from "solid-js"

export interface ActivityCardProps {
  readonly title: string
  readonly count: number
  readonly icon: JSX.Element
  readonly subtitle?: string
}

export function ActivityCard(props: ActivityCardProps): JSX.Element {
  return (
    <div class="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div class="flex items-center gap-3">
        <div class="flex-none text-slate-400 dark:text-slate-500">{props.icon}</div>
        <div class="min-w-0">
          <h4 class="truncate text-xs font-medium text-slate-900 dark:text-white">{props.title}</h4>
          <Show when={props.subtitle !== undefined}>
            <p class="truncate text-xs text-slate-500 dark:text-slate-400">{props.subtitle}</p>
          </Show>
        </div>
      </div>
      <div class="mt-2">
        <p class="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{props.count.toLocaleString()}</p>
      </div>
    </div>
  )
}
