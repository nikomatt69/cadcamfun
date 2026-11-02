/**
 * `/admin/analytics` — visual parity with `.reference/src/pages/admin/analytics.tsx`.
 *
 * Admin gate: the legacy page asks `GET /api/admin/check`, a route that has never existed in
 * `.reference/src/pages/api`, and redirects to `/analytics` on the 404. v6 answers the same
 * question from `GET /api/analytics` (`isAdmin`), which the sidecar derives from
 * `ADMIN_EMAIL` / the local profile. The user dropdown reads `GET /api/analytics/user-usage`
 * (`.users`) for the same reason — legacy's `/api/admin/users` does not exist either.
 */
import { ErrorState, LoadingState } from "../../../shared/components/screen-parts.tsx"
import { For, Show, createSignal, type JSX } from "solid-js"
import { BarChart2, Calendar, Users } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useRead } from "../../../app/queries.ts"
import { AnalyticsOverview } from "../components/analytics-overview.tsx"
import { ActivityChart } from "../components/activity-chart.tsx"

interface DateRange {
  readonly startDate?: Date
  readonly endDate?: Date
}

interface UserRow {
  readonly id?: string
  readonly name?: string
  readonly email?: string
}

const DAY = 86_400_000
const dayInput = (value: Date | undefined): string =>
  value === undefined ? "" : value.toISOString().split("T")[0] ?? ""

export function AdminAnalyticsScreen(): JSX.Element {
  const [selectedUser, setSelectedUser] = createSignal("")
  const [dateRange, setDateRange] = createSignal<DateRange>({
    startDate: new Date(Date.now() - 30 * DAY),
    endDate: new Date()
  })
  const [chartType, setChartType] = createSignal<"line" | "bar">("line")

  const index = useRead((client) => {
    const range = dateRange()
    return client.analytics.index({
      query: {
        ...(range.startDate ? { startDate: range.startDate.toISOString() } : {}),
        ...(range.endDate ? { endDate: range.endDate.toISOString() } : {}),
        ...(selectedUser() ? { userFilter: selectedUser() } : {}),
        groupBy: "day"
      }
    })
  })
  const usage = useRead((client) => client.analytics.userUsage({ query: {} }))

  const isAdmin = (): boolean =>
    (index.data() as unknown as { readonly isAdmin?: boolean } | undefined)?.isAdmin ?? false
  const users = (): readonly UserRow[] =>
    ((usage.data() as unknown as { readonly users?: readonly unknown[] } | undefined)?.users ?? []) as readonly UserRow[]
  const firstLoad = (): boolean => index.loading() && index.data() === undefined

  const handleDateChange = (type: "start" | "end", value: string): void => {
    if (!value) {
      setDateRange((previous) => ({
        ...previous,
        [type === "start" ? "startDate" : "endDate"]: undefined
      }))
      return
    }
    const date = new Date(value)
    setDateRange((previous) => ({ ...previous, [type === "start" ? "startDate" : "endDate"]: date }))
  }

  const setDateRangePreset = (preset: "7days" | "30days" | "90days"): void => {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - (preset === "7days" ? 7 : preset === "30days" ? 30 : 90))
    setDateRange({ startDate, endDate })
  }

  /** Remounts the overview + chart when the filters change, which is how the legacy children refetch. */
  const rangeKey = (): string =>
    `${dayInput(dateRange().startDate)}|${dayInput(dateRange().endDate)}|${selectedUser()}`

  return (
    <Show
      when={!firstLoad()}
      fallback={
        <LoadingState label={t("common.loading")} rows={4} />
      }
    >
      <Show when={!index.error()} fallback={<ErrorState label={t("common.error")} detail={index.error()} />}>
      <Show
        when={isAdmin()}
        fallback={
          <section class="flex h-96 flex-col items-center justify-center">
            <div class="mb-4 text-xl text-red-600">{t("admin.analytics.accessDenied")}</div>
            <p class="mb-4 text-gray-600">{t("admin.analytics.noPermission")}</p>
            <a class="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors duration-150 hover:bg-blue-700" href="/analytics">
              {t("admin.analytics.goAnalytics")}
            </a>
          </section>
        }
      >
        <section class="px-4 py-6">
          <div class="mb-6 flex flex-col justify-between md:flex-row md:items-center">
            <h1 class="mb-4 text-2xl font-semibold tracking-[-0.015em] text-gray-900 md:mb-0 dark:text-gray-50">{t("admin.analytics.heading")}</h1>

            <div class="flex flex-col items-center space-y-2 sm:flex-row sm:space-x-4 sm:space-y-0">
              <div class="relative flex w-full items-center sm:w-auto">
                <Users class="absolute left-3 h-4 w-4 text-gray-500" />
                <select
                  aria-label={t("admin.analytics.user")}
                  value={selectedUser()}
                  onChange={(event) => setSelectedUser(event.currentTarget.value)}
                  class="w-full rounded-md border border-gray-300 py-2 pl-10 pr-8 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-400 sm:w-auto"
                >
                  <option value="">{t("admin.analytics.allUsers")}</option>
                  <For each={users()}>
                    {(user) => <option value={user.id ?? ""}>{user.name ?? user.email}</option>}
                  </For>
                </select>
              </div>

              <div class="flex items-center space-x-2">
                <div class="flex items-center space-x-2">
                  <Calendar class="h-4 w-4 text-gray-500" />
                  <input
                    type="date"
                    aria-label={t("history.from")}
                    class="form-input rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    value={dayInput(dateRange().startDate)}
                    onInput={(event) => handleDateChange("start", event.currentTarget.value)}
                  />
                </div>
                <span class="text-sm text-gray-500">{t("admin.analytics.to")}</span>
                <div class="flex items-center space-x-2">
                  <Calendar class="h-4 w-4 text-gray-500" />
                  <input
                    type="date"
                    aria-label={t("history.to")}
                    class="form-input rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    value={dayInput(dateRange().endDate)}
                    onInput={(event) => handleDateChange("end", event.currentTarget.value)}
                  />
                </div>
              </div>

              <div class="flex items-center space-x-2">
                <button type="button" class="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                  onClick={() => setDateRangePreset("7days")}>7d</button>
                <button type="button" class="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                  onClick={() => setDateRangePreset("30days")}>30d</button>
                <button type="button" class="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                  onClick={() => setDateRangePreset("90days")}>90d</button>
              </div>
            </div>
          </div>
          <Show when={usage.error()}><ErrorState label={t("common.error")} detail={usage.error()} /></Show>

          <Show when={rangeKey()} keyed>
            {(key) => (
              <div data-analytics-range={key}>
                <AnalyticsOverview
                  startDate={dateRange().startDate}
                  endDate={dateRange().endDate}
                  userFilter={selectedUser()}
                  isAdmin={isAdmin()}
                />

                <div class="mt-6">
                  <div class="mb-2 flex items-center justify-between">
                    <h2 class="text-lg font-medium text-gray-900 dark:text-white">{t("admin.analytics.trends")}</h2>
                    <button
                      type="button"
                      class="flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                      onClick={() => setChartType((previous) => (previous === "line" ? "bar" : "line"))}
                    >
                      <BarChart2 class="mr-2 h-4 w-4" />
                      {chartType() === "line" ? t("admin.analytics.showBar") : t("admin.analytics.showLine")}
                    </button>
                  </div>
                  <ActivityChart
                    startDate={dateRange().startDate}
                    endDate={dateRange().endDate}
                    chartType={chartType()}
                    userFilter={selectedUser()}
                  />
                </div>
              </div>
            )}
          </Show>

        </section>
      </Show>
      </Show>
    </Show>
  )
}
