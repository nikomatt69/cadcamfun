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
    <div class="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-900">
      <div class="p-3 sm:p-5">
        <div class="flex items-center">
          <div class="flex-shrink-0">{props.icon}</div>
          <div class="ml-3 w-0 flex-1 sm:ml-5">
            <dl>
              <dt class="truncate text-xs font-medium text-gray-500 sm:text-sm dark:text-gray-300">{props.title}</dt>
              <dd>
                <div class="text-base font-medium text-gray-900 sm:text-lg dark:text-white">
                  {typeof props.value === "number" ? props.value.toLocaleString() : props.value}
                </div>
                <Show when={props.subValue !== undefined && props.subValue !== ""}>
                  <div class="mt-0.5 text-xs text-gray-500 sm:text-sm dark:text-gray-400">{props.subValue}</div>
                </Show>
              </dd>
            </dl>
          </div>
        </div>
      </div>

      <Show when={props.change !== undefined}>
        <div class="bg-gray-50 px-3 py-2 sm:px-5 sm:py-3 dark:bg-gray-800">
          <div class="flex items-center">
            <div class={`flex-shrink-0 ${isPositive() ? "text-green-500" : "text-red-500"}`}>
              <Show when={isPositive()} fallback={<ArrowDown class="h-4 w-4" />}><ArrowUp class="h-4 w-4" /></Show>
            </div>
            <div class="ml-2 text-xs sm:text-sm">
              <span class={`font-medium ${isPositive() ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {isPositive() ? "+" : ""}{props.change}%
              </span>
              <Show when={props.changeLabel !== undefined}>
                <span class="text-gray-500 dark:text-gray-400"> {props.changeLabel}</span>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
