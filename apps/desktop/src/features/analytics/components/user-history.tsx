/**
 * `UserHistory` — the activity timeline inside `/analytics/history`
 * (`.reference/src/components/analytics/UserHistory.tsx`).
 *
 * The legacy hook keeps `limit`/`offset` inside the same filter object, so changing a
 * filter after paging keeps the offset; that is preserved here on purpose.
 */
import { For, Show, createEffect, createSignal, type JSX } from "solid-js"
import { Effect } from "effect"
import { Activity, Calendar, ChevronDown, Filter } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useKeyedRead } from "../../../app/queries.ts"

interface ActivityLogItem {
  readonly id: string
  readonly timestamp: string
  readonly userId: string
  readonly itemType: string
  readonly action: string
  readonly itemId: string
  readonly details?: Record<string, unknown>
}

/** `.reference/src/lib/activityTracking.ts`, in the order the legacy panel lists them. */
const ITEM_TYPE_OPTIONS = [
  "project", "drawing", "component", "material", "tool",
  "toolpath", "organization", "machine", "page_view"
] as const

const ACTION_OPTIONS = [
  "created", "updated", "deleted", "viewed", "exported", "imported",
  "shared", "login", "logout", "generate_gcode", "analyze_gcode", "run_simulation"
] as const

const BADGE: Readonly<Record<string, string>> = {
  created: "bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100",
  updated: "bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100",
  deleted: "bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-100",
  viewed: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100",
  exported: "bg-purple-100 text-purple-800 dark:bg-purple-700 dark:text-purple-100",
  imported: "bg-purple-100 text-purple-800 dark:bg-purple-700 dark:text-purple-100"
}

const badgeClass = (action: string): string => BADGE[action] ?? BADGE.viewed!

interface Filters {
  readonly startDate?: Date
  readonly endDate?: Date
  readonly itemTypes: readonly string[]
  readonly actions: readonly string[]
  readonly offset: number
}

const EMPTY: Filters = { itemTypes: [], actions: [], offset: 0 }
const LIMIT = 50

const pretty = (value: string): string => value.replace("_", " ")

export interface UserHistoryProps {
  readonly limit?: number
}

export function UserHistory(props: UserHistoryProps): JSX.Element {
  const limit = props.limit ?? LIMIT
  const [showFilters, setShowFilters] = createSignal(false)
  const [filters, setFilters] = createSignal<Filters>(EMPTY)
  const [logs, setLogs] = createSignal<readonly ActivityLogItem[]>([])
  const [total, setTotal] = createSignal(0)

  /**
   * One Effect read keyed by the whole filter object; `offset` rides along in the key so a
   * paged load answers with its own offset and the reducer below knows to append.
   */
  const page = useKeyedRead(
    (): Filters & { readonly limit: number } => ({ ...filters(), limit }),
    (client, key) =>
      client.analytics.userHistory({
        query: {
          limit: String(key.limit),
          offset: String(key.offset),
          ...(key.itemTypes.length > 0 ? { itemType: [...key.itemTypes] } : {}),
          ...(key.actions.length > 0 ? { action: [...key.actions] } : {}),
          ...(key.startDate ? { startDate: key.startDate.toISOString() } : {}),
          ...(key.endDate ? { endDate: key.endDate.toISOString() } : {})
        }
      }).pipe(Effect.map((reply) => ({ reply, offset: key.offset })))
  )

  createEffect(() => {
    const loaded = page.data()
    if (loaded === undefined) return
    const rows = loaded.reply.logs as unknown as readonly ActivityLogItem[]
    setLogs((previous) => (loaded.offset > 0 && previous.length > 0 ? [...previous, ...rows] : rows))
    setTotal(loaded.reply.total)
  })

  const loading = page.loading
  const error = page.error

  const hasMore = (): boolean => logs().length < total()
  const toggle = (key: "itemTypes" | "actions", value: string): void => {
    setFilters((previous) => ({
      ...previous,
      [key]: previous[key].includes(value)
        ? previous[key].filter((entry) => entry !== value)
        : [...previous[key], value]
    }))
  }
  const setDate = (key: "startDate" | "endDate", value: string): void => {
    setFilters((previous) => ({ ...previous, [key]: value ? new Date(value) : undefined }))
  }
  const loadMore = (): void => {
    if (hasMore() && !loading()) setFilters((previous) => ({ ...previous, offset: previous.offset + limit }))
  }

  const dayInput = (value: Date | undefined): string =>
    value === undefined ? "" : value.toISOString().split("T")[0] ?? ""

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">{t("history.your")}</h2>
        <button
          type="button"
          class="flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          onClick={() => setShowFilters((open) => !open)}
        >
          <Filter class="mr-1 h-4 w-4" />
          {t("history.filters")}
          <ChevronDown class={`ml-1 h-4 w-4 transform transition-transform ${showFilters() ? "rotate-180" : ""}`} />
        </button>
      </div>

      <Show when={showFilters()}>
        <div class="mb-4 rounded-lg bg-[#F8FBFF] p-4 shadow dark:bg-gray-800 dark:text-white">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t("history.dateRange")}</h3>
              <div class="space-y-2">
                <div class="flex items-center">
                  <label class="mr-2 inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
                    <Calendar class="mr-1 h-4 w-4" />{t("history.from")}
                  </label>
                  <input
                    type="date"
                    class="form-input rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:border-blue-400"
                    value={dayInput(filters().startDate)}
                    onInput={(event) => setDate("startDate", event.currentTarget.value)}
                  />
                </div>
                <div class="flex items-center">
                  <label class="mr-2 inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
                    <Calendar class="mr-1 h-4 w-4" />{t("history.to")}
                  </label>
                  <input
                    type="date"
                    class="form-input rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:border-blue-400"
                    value={dayInput(filters().endDate)}
                    onInput={(event) => setDate("endDate", event.currentTarget.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t("history.itemTypes")}</h3>
              <div class="grid grid-cols-2 gap-2">
                <For each={[...ITEM_TYPE_OPTIONS]}>
                  {(type) => (
                    <label class="inline-flex items-center">
                      <input
                        type="checkbox"
                        class="rounded text-blue-600 focus:ring-blue-500"
                        checked={filters().itemTypes.includes(type)}
                        onChange={() => toggle("itemTypes", type)}
                      />
                      <span class="ml-2 text-sm capitalize text-gray-700 dark:text-gray-300">{pretty(type)}</span>
                    </label>
                  )}
                </For>
              </div>
            </div>

            <div>
              <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t("history.actions")}</h3>
              <div class="grid grid-cols-2 gap-2">
                <For each={[...ACTION_OPTIONS]}>
                  {(action) => (
                    <label class="inline-flex items-center">
                      <input
                        type="checkbox"
                        class="rounded text-blue-600 focus:ring-blue-500"
                        checked={filters().actions.includes(action)}
                        onChange={() => toggle("actions", action)}
                      />
                      <span class="ml-2 text-sm capitalize text-gray-700 dark:text-gray-300">{pretty(action)}</span>
                    </label>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      </Show>

      <Show when={error()}>
        <div class="rounded-md bg-red-50 p-4 text-red-800">
          <p>{t("history.loadFailed")}</p>
          <p class="text-sm">{error()}</p>
        </div>
      </Show>

      <div class="rounded-lg bg-[#F8FBFF] shadow dark:bg-gray-800 dark:text-white">
        <Show
          when={logs().length > 0}
          fallback={
            <Show when={loading() && logs().length === 0} fallback={
              <div class="p-6 text-center">
                <Activity class="mx-auto mb-2 h-12 w-12 text-gray-400" />
                <h3 class="text-lg font-medium text-gray-900 dark:text-white">{t("history.empty")}</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-300">
                  {filters().itemTypes.length > 0 || filters().actions.length > 0 || filters().startDate || filters().endDate
                    ? t("history.emptyFiltered")
                    : t("history.emptyHint")}
                </p>
              </div>
            }>
              <div class="p-6 text-center">
                <span class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              </div>
            </Show>
          }
        >
          <div class="overflow-hidden">
            <ul class="divide-y divide-gray-200 dark:divide-gray-600">
              <For each={logs()}>
                {(activity) => (
                  <li class="px-4 py-4 hover:bg-gray-50 sm:px-6 dark:hover:bg-gray-700">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="flex items-center space-x-2">
                        <span class={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${badgeClass(activity.action)}`}>
                          {pretty(activity.action)}
                        </span>
                        <p class="text-sm font-medium capitalize text-gray-900 dark:text-white">{pretty(activity.itemType)}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{t("history.id", { id: activity.itemId })}</p>
                      </div>
                      <div class="whitespace-nowrap text-xs text-gray-500 dark:text-gray-300">
                        {new Date(activity.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <Show when={activity.details !== undefined && Object.keys(activity.details).length > 0}>
                      <details class="mt-2 text-xs">
                        <summary class="cursor-pointer text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                          {t("history.details")}
                        </summary>
                        <pre class="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                          {JSON.stringify(activity.details, null, 2)}
                        </pre>
                      </details>
                    </Show>
                  </li>
                )}
              </For>
            </ul>

            <Show when={hasMore()}>
              <div class="p-4 text-center">
                <button
                  type="button"
                  class="btn btn-primary mx-auto flex items-center justify-center"
                  onClick={loadMore}
                  disabled={loading()}
                >
                  {loading() ? (
                    <>
                      <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      <span class="ml-2">{t("history.loading")}</span>
                    </>
                  ) : t("history.loadMore")}
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
