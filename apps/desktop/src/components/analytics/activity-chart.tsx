/**
 * `ActivityChart` — `.reference/src/components/analytics/ActivityChart.tsx`.
 *
 * The legacy component draws with recharts, which is not a dependency of the desktop build,
 * so the plot is hand-drawn SVG with the same axis treatment (dashed grid, −45° x labels,
 * integer y ticks, rounded bars) and the same colours/metric labels. Data is the same
 * `GET /api/analytics/user-metrics` → `chartData` series.
 */
import { For, Show, createMemo, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { AlertCircle, Loader } from "lucide-solid"
import { t } from "../../i18n/index.ts"
import { useRead } from "../../app/queries.ts"

export type ChartMetric =
  | "activityCount" | "toolpathsGenerated" | "connections" | "programRuns" | "aiRequests"
  | "cadDrawings" | "storageUsage" | "projects" | "components" | "toolpaths"

const METRIC_COLORS: Readonly<Record<string, string>> = {
  activityCount: "#4f46e5",
  aiRequests: "#8884d8",
  cadDrawings: "#82ca9d",
  storageUsage: "#ffc658",
  projects: "#ff7300",
  components: "#00C49F",
  toolpaths: "#0088FE",
  toolpathsGenerated: "#fbbf24",
  connections: "#a855f7",
  programRuns: "#ec4899"
}

const WIDTH = 720
const HEIGHT = 256
const LEFT = 44
const RIGHT = 12
const TOP = 8
const BOTTOM = 74

export interface ActivityChartProps {
  readonly startDate?: Date
  readonly endDate?: Date
  readonly groupBy?: "day" | "week" | "month"
  readonly userFilter?: string
  readonly chartType?: "line" | "bar"
  readonly metric?: ChartMetric
}

const formatDate = (date: string, groupBy: string): string => {
  try {
    const parsed = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return "Invalid date"
    if (groupBy === "week") return `Wk ${parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`
    if (groupBy === "month") return parsed.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" })
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
  } catch {
    return "Date Error"
  }
}

export function ActivityChart(props: ActivityChartProps): JSX.Element {
  const groupBy = props.groupBy ?? "day"
  const metric: ChartMetric = props.metric ?? "activityCount"
  const chartType = () => props.chartType ?? "line"

  const reply = useRead((client) => client.analytics.userMetrics({
    query: {
      ...(props.startDate ? { startDate: props.startDate.toISOString() } : {}),
      ...(props.endDate ? { endDate: props.endDate.toISOString() } : {}),
      groupBy,
      metric
    }
  }))

  const data = createMemo((): readonly Record<string, string | number>[] =>
    (reply.data() as { chartData?: readonly Record<string, string | number>[] } | undefined)?.chartData ?? [])
  const chartLabel = metric.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim()
  const color = METRIC_COLORS[metric] ?? "#4f46e5"

  const plot = createMemo(() => {
    const rows = data()
    const values = rows.map((row) => Number(row[metric] ?? 0))
    const max = Math.max(1, ...values)
    const plotWidth = WIDTH - LEFT - RIGHT
    const plotHeight = HEIGHT - TOP - BOTTOM
    const ticks = [0, Math.round(max / 3), Math.round((max * 2) / 3), max]
      .filter((value, index, all) => all.indexOf(value) === index)
    const step = rows.length > 1 ? plotWidth / (rows.length - 1) : 0
    const barWidth = rows.length > 0 ? (plotWidth / rows.length) * 0.7 : 0
    const y = (value: number): number => TOP + plotHeight - (value / max) * plotHeight
    const x = (index: number): number => LEFT + (rows.length > 1 ? index * step : plotWidth / 2)
    const labelEvery = Math.max(1, Math.ceil(rows.length / 8))
    return { rows, values, max, plotWidth, plotHeight, ticks, step, barWidth, y, x, labelEvery }
  })

  return (
    <Show
      when={!reply.loading()}
      fallback={
        <div class="flex h-64 items-center justify-center rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <Motion.div class="flex flex-col items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Motion.span animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, easing: "linear" }} class="inline-flex">
              <Loader class="h-8 w-8 text-blue-500" />
            </Motion.span>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{t("admin.chart.loading")}</p>
          </Motion.div>
        </div>
      }
    >
      <Show
        when={!reply.error()}
        fallback={
          <div class="flex h-64 items-center justify-center rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
            <div class="flex flex-col items-center text-center">
              <AlertCircle class="mb-2 h-8 w-8 text-red-500" />
              <h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-white">{t("admin.chart.unable")}</h3>
              <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">{reply.error()}</p>
              <button type="button" class="btn btn-primary" onClick={() => void reply.refetch()}>{t("admin.chart.retry")}</button>
            </div>
          </div>
        }
      >
        <Show
          when={data().length > 0}
          fallback={
            <div class="flex h-64 items-center justify-center rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
              <p class="text-sm text-gray-500 dark:text-gray-400">{t("admin.chart.empty")}</p>
            </div>
          }
        >
          <Motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            class="rounded-lg bg-white p-6 shadow-lg transition-shadow duration-300 hover:shadow-xl dark:bg-gray-800"
          >
            <h3 class="mb-4 text-center text-sm font-medium text-gray-600 sm:text-base dark:text-gray-400">
              {t("admin.chart.trend", { label: chartLabel, groupBy })}
            </h3>
            <div class="h-64">
              <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label={chartLabel}>
                <For each={plot().ticks}>
                  {(tick) => {
                    const y = plot().y(tick)
                    return (
                      <>
                        <line x1={LEFT} y1={y} x2={WIDTH - RIGHT} y2={y} stroke="currentColor" stroke-opacity="0.15" stroke-dasharray="3 3" />
                        <text x={LEFT - 6} y={y + 3} text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.7">{tick}</text>
                      </>
                    )
                  }}
                </For>

                <Show when={chartType() === "bar"} fallback={
                  <polyline
                    fill="none"
                    stroke={color}
                    stroke-width="2"
                    points={plot().rows.map((_, index) => `${plot().x(index)},${plot().y(plot().values[index] ?? 0)}`).join(" ")}
                  />
                }>
                  <For each={plot().rows}>
                    {(_, index) => (
                      <rect
                        x={plot().x(index()) - plot().barWidth / 2}
                        y={plot().y(plot().values[index()] ?? 0)}
                        width={plot().barWidth}
                        height={Math.max(0, (HEIGHT - BOTTOM) - plot().y(plot().values[index()] ?? 0))}
                        rx="4"
                        fill={color}
                      />
                    )}
                  </For>
                </Show>

                <Show when={chartType() === "line"}>
                  <For each={plot().rows}>
                    {(_, index) => (
                      <circle cx={plot().x(index())} cy={plot().y(plot().values[index()] ?? 0)} r="3" fill={color} />
                    )}
                  </For>
                </Show>

                <For each={plot().rows}>
                  {(row, index) => (
                    <Show when={index() % plot().labelEvery === 0 || index() === plot().rows.length - 1}>
                      <text
                        x={plot().x(index())}
                        y={HEIGHT - BOTTOM + 14}
                        text-anchor="end"
                        font-size="10"
                        fill="currentColor"
                        fill-opacity="0.7"
                        transform={`rotate(-45 ${plot().x(index())} ${HEIGHT - BOTTOM + 14})`}
                      >
                        {formatDate(String(row.date ?? ""), groupBy)}
                      </text>
                    </Show>
                  )}
                </For>

                <line x1={LEFT} y1={HEIGHT - BOTTOM} x2={WIDTH - RIGHT} y2={HEIGHT - BOTTOM} stroke="currentColor" stroke-opacity="0.4" />
              </svg>
            </div>
          </Motion.div>
        </Show>
      </Show>
    </Show>
  )
}
