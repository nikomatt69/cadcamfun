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
import { Motion } from "solid-motionone"
import { BarChart2, Calendar, ChevronDown, Cpu, DollarSign, TrendingUp } from "lucide-solid"
import { t, type Key } from "../i18n/index.ts"
import { AnalyticsOverview } from "../components/analytics/analytics-overview.tsx"
import { ActivityChart, type ChartMetric } from "../components/analytics/activity-chart.tsx"
import { AiDashboard } from "../components/analytics/ai-dashboard.tsx"
import { UserCostAnalytics } from "../components/analytics/user-cost-analytics.tsx"

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

const cardClass =
  "rounded-2xl border border-white/30 bg-white/80 p-6 shadow-xl backdrop-blur-md dark:border-gray-600/30 dark:bg-gray-800/80"

const inputClass =
  "form-input rounded-xl border-white/30 bg-white/60 text-sm backdrop-blur-sm transition-[border-color,box-shadow,background-color] duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 dark:border-gray-600/30 dark:bg-gray-700/60 dark:focus:border-blue-400 dark:focus:ring-blue-400/50"

const inactiveTab =
  "text-gray-600 hover:bg-white/40 dark:text-gray-300 dark:hover:bg-gray-700/40"

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
    <Motion.section
      class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 px-4 py-6 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.6 }}
    >
      {/* Header Section */}
      <div class="mb-8 flex flex-col justify-between md:flex-row md:items-center">
        <Motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <h1 class="mb-2 text-2xl font-semibold tracking-[-0.015em] text-gray-900 dark:text-gray-50">
            {t("dash.title")}
          </h1>
          <p class="text-gray-600 dark:text-gray-400">{t("dash.subtitle")}</p>
        </Motion.div>

        {/* Navigation Tabs */}
        <Motion.nav
          class="mt-4 flex space-x-2 rounded-2xl border border-white/30 bg-white/60 p-2 shadow-lg backdrop-blur-sm md:mt-0 dark:border-gray-600/30 dark:bg-gray-700/60"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <For each={TABS}>
            {(tab) => (
              <Motion.button
                type="button"
                onClick={() => setActiveSection(tab.key)}
                hover={{ scale: 1.03, transition: { duration: 0.15 } }}
                press={{ scale: 0.98 }}
                class={`rounded-xl px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity] duration-200 ${
                  activeSection() === tab.key
                    ? "scale-105 bg-blue-500 text-white shadow-md"
                    : inactiveTab
                }`}
              >
                <span class="flex items-center">
                  <tab.Icon size={16} class="mr-2" />
                  {t(tab.labelKey)}
                </span>
              </Motion.button>
            )}
          </For>
        </Motion.nav>
      </div>

      {/* Date Range Controls */}
      <Motion.div class={`mb-8 ${cardClass}`} initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}>
        <div class="flex flex-col justify-between space-y-4 lg:flex-row lg:items-center lg:space-y-0">
          <div class="flex flex-wrap gap-2">
            <For each={PRESETS}>
              {([preset, labelKey]) => (
                <Motion.button
                  type="button"
                  onClick={() => setDateRangePreset(preset)}
                  hover={{ scale: 1.05, y: -2, transition: { duration: 0.2 } }}
                  press={{ scale: 0.98, transition: { duration: 0.1 } }}
                  class="rounded-xl border border-white/30 bg-white/60 px-4 py-2 text-sm font-medium backdrop-blur-sm transition-[background-color,border-color,color,box-shadow,opacity] duration-200 hover:bg-white/80 dark:border-gray-600/30 dark:bg-gray-700/60 dark:hover:bg-gray-700/80"
                >
                  {t(labelKey)}
                </Motion.button>
              )}
            </For>
          </div>

          <div class="flex flex-col items-center space-y-2 sm:flex-row sm:space-y-0 sm:space-x-4">
            <div class="flex items-center space-x-2">
              <Calendar class="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <input
                type="date"
                class={inputClass}
                value={dayInput(dateRange().startDate)}
                onInput={(event) => handleDateChange("start", event.currentTarget.value)}
              />
            </div>
            <span class="font-medium text-gray-500 dark:text-gray-400">{t("dash.to")}</span>
            <div class="flex items-center space-x-2">
              <Calendar class="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <input
                type="date"
                class={inputClass}
                value={dayInput(dateRange().endDate)}
                onInput={(event) => handleDateChange("end", event.currentTarget.value)}
              />
            </div>
          </div>
        </div>
      </Motion.div>

      {/* Content Sections */}
      <Show when={activeSection() === "overview"} keyed>
        <Motion.div class="space-y-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
            <Show when={rangeKey()} keyed>
              <AnalyticsOverview startDate={dateRange().startDate} endDate={dateRange().endDate} isAdmin={isAdmin} />
            </Show>
          </Motion.div>
        </Motion.div>
      </Show>

      <Show when={activeSection() === "charts"} keyed>
        <Motion.div class="space-y-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Motion.div class={cardClass} initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
            <div class="mb-6 flex flex-col justify-between space-y-4 lg:flex-row lg:items-center lg:space-y-0">
              <Motion.h2
                class="text-2xl font-bold text-gray-900 dark:text-white"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                {t("dash.trends")}
              </Motion.h2>
              <div class="flex w-full flex-col items-start space-y-3 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4 lg:w-auto">
                {/* Metric Selector */}
                <div class="relative w-full sm:w-64">
                  <select
                    value={selectedMetric()}
                    onChange={(event) => setSelectedMetric(event.currentTarget.value as ChartMetric)}
                    class="form-select block w-full appearance-none rounded-xl border-white/30 bg-white/60 py-3 pr-10 text-sm backdrop-blur-sm transition-[border-color,box-shadow,background-color] duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 dark:border-gray-600/30 dark:bg-gray-700/60 dark:focus:border-blue-400 dark:focus:ring-blue-400/50"
                  >
                    <For each={METRIC_OPTIONS}>
                      {([value, labelKey]) => <option value={value}>{t(labelKey)}</option>}
                    </For>
                  </select>
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 dark:text-gray-400">
                    <ChevronDown class="h-4 w-4" />
                  </div>
                </div>

                {/* Chart Type Toggle */}
                <Motion.button
                  type="button"
                  onClick={() => setChartType((previous) => (previous === "line" ? "bar" : "line"))}
                  hover={{ scale: 1.05, y: -2, transition: { duration: 0.2 } }}
                  press={{ scale: 0.98, transition: { duration: 0.1 } }}
                  class="flex items-center rounded-xl border border-white/30 bg-white/60 px-4 py-3 text-sm text-gray-600 backdrop-blur-sm transition-[background-color,border-color,color,box-shadow,opacity] duration-200 hover:bg-white/80 hover:text-gray-900 dark:border-gray-600/30 dark:bg-gray-700/60 dark:text-gray-300 dark:hover:bg-gray-700/80 dark:hover:text-white"
                >
                  <BarChart2 class="mr-2 h-4 w-4" />
                  {t(chartType() === "line" ? "dash.showBar" : "dash.showLine")}
                </Motion.button>
              </div>
            </div>

            <Show when={chartsKey()} keyed>
              <ActivityChart
                startDate={dateRange().startDate}
                endDate={dateRange().endDate}
                chartType={chartType()}
                metric={selectedMetric()}
              />
            </Show>
          </Motion.div>
        </Motion.div>
      </Show>

      <Show when={activeSection() === "ai"} keyed>
        <Motion.div class="space-y-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Motion.div class={cardClass} initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
            <AiDashboard />
          </Motion.div>
        </Motion.div>
      </Show>

      <Show when={activeSection() === "costs"} keyed>
        <Motion.div class="space-y-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
            <Show when={rangeKey()} keyed>
              <UserCostAnalytics startDate={dateRange().startDate} endDate={dateRange().endDate} isAdmin={isAdmin} />
            </Show>
          </Motion.div>
        </Motion.div>
      </Show>
    </Motion.section>
  )
}
