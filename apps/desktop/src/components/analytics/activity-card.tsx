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
    <div class="rounded-lg border bg-white p-3 shadow-sm transition duration-150 hover:shadow-md dark:border-gray-600 dark:bg-gray-900">
      <div class="flex items-center">
        <div class="flex-shrink-0">{props.icon}</div>
        <div class="ml-2 sm:ml-3">
          <h4 class="truncate text-xs font-medium text-gray-900 sm:text-sm dark:text-white">{props.title}</h4>
          <Show when={props.subtitle !== undefined}>
            <p class="truncate text-xs text-gray-500 dark:text-gray-300">{props.subtitle}</p>
          </Show>
        </div>
      </div>
      <div class="mt-2">
        <p class="text-lg font-semibold text-gray-900 sm:text-2xl dark:text-white">{props.count.toLocaleString()}</p>
      </div>
    </div>
  )
}
