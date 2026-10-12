/**
 * `/admin/analytics` — visual parity with `.reference/src/pages/admin/analytics.tsx`.
 *
 * Admin gate: the legacy page asks `GET /api/admin/check`, a route that has never existed in
 * `.reference/src/pages/api`, and redirects to `/analytics` on the 404. v6 answers the same
 * question from `GET /api/analytics` (`isAdmin`), which the sidecar derives from
 * `ADMIN_EMAIL` / the local profile. The user dropdown reads `GET /api/analytics/user-usage`
 * (`.users`) for the same reason — legacy's `/api/admin/users` does not exist either.
 *
 * The "Most Active Users" table still renders the five hard-coded sample rows the legacy page
 * shipped with, random numbers included.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { BarChart2, Calendar, Users } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useRead } from "../../../app/queries.ts"
import { AnalyticsOverview } from "../components/analytics-overview.tsx"
import { ActivityChart } from "../components/activity-chart.tsx"
import { UserHistory } from "../components/user-history.tsx"

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
const ACTIONS = ["viewed", "created", "updated", "exported"] as const

/** Legacy `<th>` labels, verbatim and in order. */
const TABLE_HEADERS = [
  "admin.analytics.user",
  "admin.analytics.totalActivity",
  "admin.analytics.lastActive",
  "admin.analytics.commonAction",
  "admin.analytics.actions"
] as const

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
        <div class="flex h-60 items-center justify-center">
          <span class="inline-block h-12 w-12 animate-spin rounded-full border-2 border-b-2 border-blue-500" />
        </div>
      }
    >
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
                <div class="flex items-center space-x-1">
                  <Calendar class="h-4 w-4 text-gray-500" />
                  <input
                    type="date"
                    class="form-input rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    value={dayInput(dateRange().startDate)}
                    onInput={(event) => handleDateChange("start", event.currentTarget.value)}
                  />
                </div>
                <span class="text-sm text-gray-500">{t("admin.analytics.to")}</span>
                <div class="flex items-center space-x-1">
                  <Calendar class="h-4 w-4 text-gray-500" />
                  <input
                    type="date"
                    class="form-input rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    value={dayInput(dateRange().endDate)}
                    onInput={(event) => handleDateChange("end", event.currentTarget.value)}
                  />
                </div>
              </div>

              <div class="flex items-center space-x-2">
                <button type="button" class="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                  onClick={() => setDateRangePreset("7days")}>7d</button>
                <button type="button" class="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                  onClick={() => setDateRangePreset("30days")}>30d</button>
                <button type="button" class="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                  onClick={() => setDateRangePreset("90days")}>90d</button>
              </div>
            </div>
          </div>

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
                      <BarChart2 class="mr-1 h-4 w-4" />
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

          <div class="mt-6 rounded-lg bg-[#F8FBFF] p-4 shadow dark:bg-gray-800 dark:text-white">
            <h2 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">{t("admin.analytics.mostActive")}</h2>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead class="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <For each={TABLE_HEADERS}>
                      {(label) => (
                        <th class="whitespace-nowrap px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">
                          {t(label)}
                        </th>
                      )}
                    </For>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 bg-[#F8FBFF] dark:divide-gray-600 dark:bg-gray-800 dark:text-white">
                  {[1, 2, 3, 4, 5].map((_, index) => (
                    <tr>
                      <td class="whitespace-nowrap px-6 py-4">
                        <div class="flex items-center">
                          <div class="h-10 w-10 flex-shrink-0">
                            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-500">
                              {String.fromCharCode(65 + index)}
                            </div>
                          </div>
                          <div class="ml-4">
                            <div class="text-sm font-medium text-gray-900 dark:text-white">User {index + 1}</div>
                            <div class="text-sm text-gray-500 dark:text-gray-300">user{index + 1}@example.com</div>
                          </div>
                        </div>
                      </td>
                      <td class="whitespace-nowrap px-6 py-4">
                        <div class="text-sm text-gray-900 dark:text-white">{Math.floor(Math.random() * 200) + 50}</div>
                      </td>
                      <td class="whitespace-nowrap px-6 py-4">
                        <div class="text-sm text-gray-500 dark:text-gray-300">
                          {new Date(Date.now() - Math.random() * DAY * 10).toLocaleString()}
                        </div>
                      </td>
                      <td class="whitespace-nowrap px-6 py-4">
                        <span class="inline-flex whitespace-nowrap rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800 dark:bg-green-700 dark:text-green-100">
                          {ACTIONS[Math.floor(Math.random() * ACTIONS.length)]}
                        </span>
                      </td>
                      <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                        <button
                          type="button"
                          class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          onClick={() => setSelectedUser(`user${index + 1}`)}
                        >
                          {t("admin.analytics.viewDetails")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Show when={selectedUser()}>
            <div class="mt-6">
              <h2 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">{t("admin.analytics.userHistory")}</h2>
              <UserHistory limit={20} />
            </div>
          </Show>
        </section>
      </Show>
    </Show>
  )
}
