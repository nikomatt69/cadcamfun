/**
 * `/analytics` — visual parity with `.reference/src/pages/analytics/index.tsx`.
 *
 * The legacy page is a four-tab dashboard (Overview / Charts / AI Insights / User Costs)
 * over a shared date-range card. Everything below is ported in that order with the legacy
 * classes and copy; the children (`AnalyticsOverview`, `ActivityChart`, `AiDashboard`,
 * `UserCostAnalytics`) are the component ports of the same names.
 *
 * The legacy `isAdmin` check is hard-coded to `false` (its comment: "implement your own
 * admin check"), so the User Costs tab renders the personal branch only — preserved here.
 *
 * Each section is remounted through a keyed `Show`, because the legacy children refetch in
 * `useEffect` on every date-range / metric / chart-type change while a Solid `useRead` runs
 * its Effect once per mount.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { BarChart2, Cpu, DollarSign, TrendingUp } from "lucide-solid"
import { FIELD, PANEL, RAIL_LABEL, TOOLBAR_BUTTON, WorkspacePage } from "../components/WorkspacePage.tsx"
import { t, type Key } from "../i18n/index.ts"
import { AnalyticsOverview } from "../components/analytics/analytics-overview.tsx"
import { ActivityChart, type ChartMetric } from "../components/analytics/activity-chart.tsx"
import { AiDashboard } from "../components/analytics/ai-dashboard.tsx"
import { UserCostAnalytics } from "../components/analytics/user-cost-analytics.tsx"

const TOOLBAR_ACTIVE = "inline-flex items-center gap-1.5 rounded-lg border border-[#007ACC]/60 bg-blue-50/80 px-3 py-1.5 text-sm font-medium text-[#007ACC] shadow-sm dark:bg-blue-900/40 dark:text-blue-300"

type Section = "overview" | "charts" | "ai" | "costs"
type Preset = "today" | "7days" | "30days" | "90days" | "year"

interface DateRange {
  readonly startDate?: Date
  readonly endDate?: Date
}

interface Tab {
  readonly key: Section
  readonly labelKey: Key
  readonly Icon: typeof BarChart2
}

const TABS: readonly Tab[] = [
  { key: "overview", labelKey: "dash.tab.overview", Icon: BarChart2 },
  { key: "charts", labelKey: "dash.tab.charts", Icon: TrendingUp },
  { key: "ai", labelKey: "dash.tab.ai", Icon: Cpu },
  { key: "costs", labelKey: "dash.tab.costs", Icon: DollarSign }
]

/** The legacy `metricOptions` list, verbatim labels and order. */
const METRIC_OPTIONS: ReadonlyArray<readonly [ChartMetric, Key]> = [
  ["activityCount", "dash.metric.activityCount"],
  ["aiRequests", "dash.metric.aiRequests"],
  ["cadDrawings", "dash.metric.cadDrawings"],
  ["projects", "dash.metric.projects"],
  ["components", "dash.metric.components"],
  ["toolpaths", "dash.metric.toolpaths"],
  ["storageUsage", "dash.metric.storageUsage"],
  ["toolpathsGenerated", "dash.metric.toolpathsGenerated"],
  ["connections", "dash.metric.connections"],
  ["programRuns", "dash.metric.programRuns"]
]

const PRESETS: ReadonlyArray<readonly [Preset, Key]> = [
  ["today", "dash.preset.today"],
  ["7days", "dash.preset.7days"],
  ["30days", "dash.preset.30days"],
  ["90days", "dash.preset.90days"],
  ["year", "dash.preset.year"]
]

const DAY = 86_400_000

const dayInput = (value: Date | undefined): string =>
  value === undefined ? "" : value.toISOString().split("T")[0] ?? ""

/** The legacy dashboard (`/analytics`). */
export function AnalyticsScreen(): JSX.Element {
  const [activeSection, setActiveSection] = createSignal<Section>("overview")
  const [dateRange, setDateRange] = createSignal<DateRange>({
    startDate: new Date(Date.now() - 30 * DAY),
    endDate: new Date()
  })
  const [chartType, setChartType] = createSignal<"line" | "bar">("line")
  const [selectedMetric, setSelectedMetric] = createSignal<ChartMetric>("activityCount")

  // `isAdmin` stays false, exactly as the legacy page hard-codes it.
  const isAdmin = false

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

  const setDateRangePreset = (preset: Preset): void => {
    const endDate = new Date()
    const startDate = new Date(endDate)
    switch (preset) {
      case "today":
        startDate.setHours(0, 0, 0, 0)
        break
      case "7days":
        startDate.setDate(endDate.getDate() - 7)
        break
      case "30days":
        startDate.setDate(endDate.getDate() - 30)
        break
      case "90days":
        startDate.setDate(endDate.getDate() - 90)
        break
      case "year":
        startDate.setFullYear(endDate.getFullYear() - 1)
        break
    }
    setDateRange({ startDate, endDate })
  }

  const rangeKey = (): string => `${dayInput(dateRange().startDate)}|${dayInput(dateRange().endDate)}`
  const chartsKey = (): string => `${rangeKey()}|${selectedMetric()}|${chartType()}`

  return (
    <WorkspacePage
      title={t("dash.title")}
      actions={
        <nav class="flex flex-wrap items-center gap-2" aria-label={t("dash.title")}>
          <For each={TABS}>
            {(tab) => (
              <button
                type="button"
                aria-pressed={activeSection() === tab.key}
                onClick={() => setActiveSection(tab.key)}
                class={activeSection() === tab.key ? TOOLBAR_ACTIVE : TOOLBAR_BUTTON}
              >
                <tab.Icon size={16} aria-hidden="true" />
                {t(tab.labelKey)}
              </button>
            )}
          </For>
        </nav>
      }
      rail={<>
        <p class="text-xs text-gray-500 dark:text-gray-400">{t("dash.subtitle")}</p>
        <div class="flex flex-wrap gap-2">
          <For each={PRESETS}>
            {([preset, labelKey]) => (
              <button type="button" onClick={() => setDateRangePreset(preset)} class="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-[#007ACC] dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-blue-900/30">
                {t(labelKey)}
              </button>
            )}
          </For>
        </div>
        <label class="block">
          <span class={RAIL_LABEL}>From</span>
          <input type="date" class={FIELD} value={dayInput(dateRange().startDate)} onInput={(event) => handleDateChange("start", event.currentTarget.value)} />
        </label>
        <label class="block">
          <span class={RAIL_LABEL}>{t("dash.to")}</span>
          <input type="date" class={FIELD} value={dayInput(dateRange().endDate)} onInput={(event) => handleDateChange("end", event.currentTarget.value)} />
        </label>
        <Show when={activeSection() === "charts"}>
          <label class="block">
            <span class={RAIL_LABEL}>{t("dash.trends")}</span>
            <select class={FIELD} value={selectedMetric()} onChange={(event) => setSelectedMetric(event.currentTarget.value as ChartMetric)}>
              <For each={METRIC_OPTIONS}>{([value, labelKey]) => <option value={value}>{t(labelKey)}</option>}</For>
            </select>
          </label>
          <button type="button" class={TOOLBAR_BUTTON} onClick={() => setChartType((previous) => (previous === "line" ? "bar" : "line"))}>
            <BarChart2 size={16} aria-hidden="true" />
            {t(chartType() === "line" ? "dash.showBar" : "dash.showLine")}
          </button>
        </Show>
      </>}
    >
      <Show when={activeSection() === "overview"} keyed>
        <Show when={rangeKey()} keyed>
          <AnalyticsOverview startDate={dateRange().startDate} endDate={dateRange().endDate} isAdmin={isAdmin} />
        </Show>
      </Show>

      <Show when={activeSection() === "charts"} keyed>
        <div class={PANEL}>
          <h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">{t("dash.trends")}</h2>
          <Show when={chartsKey()} keyed>
            <ActivityChart
              startDate={dateRange().startDate}
              endDate={dateRange().endDate}
              chartType={chartType()}
              metric={selectedMetric()}
            />
          </Show>
        </div>
      </Show>

      <Show when={activeSection() === "ai"} keyed>
        <div class={PANEL}><AiDashboard /></div>
      </Show>

      <Show when={activeSection() === "costs"} keyed>
        <Show when={rangeKey()} keyed>
          <UserCostAnalytics startDate={dateRange().startDate} endDate={dateRange().endDate} isAdmin={isAdmin} />
        </Show>
      </Show>
    </WorkspacePage>
  )
}
