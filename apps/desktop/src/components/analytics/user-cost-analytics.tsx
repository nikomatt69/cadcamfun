/**
 * `UserCostAnalytics` — `.reference/src/components/analytics/UserCostAnalytics.tsx`
 * (the "User Costs" tab of `/analytics`).
 *
 * Legacy draws with recharts, which the desktop build does not depend on, so the three plots
 * are hand-drawn SVG (line chart, pie, bars) with the same series, colours and axis treatment.
 *
 * Data is `GET /api/analytics/user-usage`: the personal read keys on the local profile id
 * (legacy passed `session.user.id`) and the system read only runs for an admin, exactly like
 * the legacy fetches. The sidecar answers the keyed request with `{ summary: null,
 * breakdown: null }` — the legacy empty structures — so the personal tab renders the
 * "No AI Usage Data" card, "Generate Test Data" button included (here it re-runs the read;
 * v6 has no `userAnalyticsService` to write test rows with).
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Effect } from "effect"
import { Motion } from "solid-motionone"
import { Activity, AlertCircle, BarChart2, Cpu, DollarSign, RefreshCw, TrendingDown, TrendingUp, Users } from "lucide-solid"
import { t } from "../../i18n/index.ts"
import { useKeyedRead, useRead } from "../../app/queries.ts"

export interface UserCostAnalyticsProps {
  readonly startDate?: Date
  readonly endDate?: Date
  readonly isAdmin?: boolean
}

interface DailyUsage {
  readonly date: string
  readonly tokens: number
  readonly cost: number
  readonly requests: number
}

interface ModelUsage {
  readonly tokens: number
  readonly cost: number
  readonly requests: number
}

interface UserSummary {
  readonly totalTokens: number
  readonly totalCost: number
  readonly totalRequests: number
  readonly averageTokensPerRequest: number
  readonly mostUsedModel: string
  readonly costEfficiencyScore: number
  readonly dailyUsage: readonly DailyUsage[]
  readonly modelUsage: Readonly<Record<string, ModelUsage>>
}

interface UserBreakdown {
  readonly trends: {
    readonly tokensGrowth: number
    readonly costGrowth: number
    readonly requestsGrowth: number
  }
}

interface SystemStats {
  readonly totalUsers: number
  readonly totalTokens: number
  readonly totalCost: number
  readonly totalRequests: number
  readonly averageCostPerUser: number
  readonly topSpendingUsers: ReadonlyArray<{ readonly userId: string; readonly cost: number }>
  readonly modelDistribution: Readonly<Record<string, number>>
}

interface PersonalReply {
  readonly summary: UserSummary | null
  readonly breakdown: UserBreakdown | null
}

interface SystemReply {
  readonly systemStats?: SystemStats | null
}

interface SystemKey {
  readonly startDate?: Date
  readonly endDate?: Date
}

type Tab = "personal" | "system"

/** `.reference/src/components/analytics/UserCostAnalytics.tsx` `COLORS`. */
const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"]

const cardClass =
  "rounded-2xl border border-white/30 bg-white/80 p-6 shadow-xl backdrop-blur-md dark:border-gray-600/30 dark:bg-gray-800/80"

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 }).format(amount)

const formatNumber = (value: number): string => new Intl.NumberFormat().format(value)

const trendColor = (growth: number): string =>
  growth > 0 ? "text-red-500" : growth < 0 ? "text-green-500" : "text-gray-500"

/** The trend indicator next to a personal stat: up = red, down = green, flat = grey. */
function TrendIcon(props: { readonly growth: number }): JSX.Element {
  return (
    <Show
      when={props.growth !== 0}
      fallback={<Activity class="h-4 w-4 text-gray-500" />}
    >
      <Show
        when={props.growth > 0}
        fallback={<TrendingDown class="h-4 w-4 text-green-500" />}
      >
        <TrendingUp class="h-4 w-4 text-red-500" />
      </Show>
    </Show>
  )
}

interface StatCardProps {
  readonly label: string
  readonly value: string
  readonly caption?: string
  readonly growth?: number
  readonly icon: JSX.Element
}

function StatCard(props: StatCardProps): JSX.Element {
  return (
    <Motion.div
      class={cardClass}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4 }}
      hover={{ scale: 1.02, transition: { duration: 0.2 } }}
    >
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">{props.label}</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{props.value}</p>
          <Show when={props.growth !== undefined && props.growth !== 0}>
            <div class={`flex items-center text-sm ${trendColor(props.growth ?? 0)}`}>
              <TrendIcon growth={props.growth ?? 0} />
              <span class="ml-1">{Math.abs(props.growth ?? 0).toFixed(1)}%</span>
            </div>
          </Show>
          <Show when={props.caption !== undefined}>
            <p class="text-sm text-gray-500">{props.caption}</p>
          </Show>
        </div>
        {props.icon}
      </div>
    </Motion.div>
  )
}

const PLOT = { width: 720, height: 300, left: 56, right: 16, top: 16, bottom: 40 }

/** Legacy `<LineChart>` of `dailyUsage`: cost (#3B82F6) and tokens (#10B981) on one scale. */
function DailyUsageChart(props: { readonly rows: readonly DailyUsage[] }): JSX.Element {
  const plot = createMemo(() => {
    const rows = props.rows
    const values = rows.flatMap((row) => [row.cost, row.tokens])
    const max = Math.max(1, ...values)
    const width = PLOT.width - PLOT.left - PLOT.right
    const height = PLOT.height - PLOT.top - PLOT.bottom
    const step = rows.length > 1 ? width / (rows.length - 1) : 0
    const x = (index: number): number => PLOT.left + (rows.length > 1 ? index * step : width / 2)
    const y = (value: number): number => PLOT.top + height - (value / max) * height
    const ticks = [0, max / 4, max / 2, (max * 3) / 4, max]
    return { rows, max, height, x, y, ticks }
  })
  const points = (key: "cost" | "tokens"): string =>
    plot().rows.map((row, index) => `${plot().x(index)},${plot().y(row[key])}`).join(" ")

  return (
    <svg viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} width="100%" height={PLOT.height} role="img">
      <For each={plot().ticks}>
        {(tick) => (
          <>
            <line
              x1={PLOT.left} y1={plot().y(tick)} x2={PLOT.width - PLOT.right} y2={plot().y(tick)}
              stroke="#374151" stroke-opacity="0.3" stroke-dasharray="3 3"
            />
            <text x={PLOT.left - 6} y={plot().y(tick) + 4} text-anchor="end" font-size="12" fill="#6B7280">
              {tick >= 1000 ? `${Math.round(tick / 1000)}k` : String(Math.round(tick * 100) / 100)}
            </text>
          </>
        )}
      </For>
      <For each={plot().rows}>
        {(row, index) => (
          <text
            x={plot().x(index())} y={PLOT.height - PLOT.bottom + 18}
            text-anchor="middle" font-size="12" fill="#6B7280"
          >
            {row.date}
          </text>
        )}
      </For>
      <polyline fill="none" stroke="#3B82F6" stroke-width="2" points={points("cost")} />
      <polyline fill="none" stroke="#10B981" stroke-width="2" points={points("tokens")} />
      <For each={plot().rows}>
        {(row, index) => (
          <>
            <circle cx={plot().x(index())} cy={plot().y(row.cost)} r="4" fill="#3B82F6" stroke="#3B82F6" stroke-width="2" />
            <circle cx={plot().x(index())} cy={plot().y(row.tokens)} r="4" fill="#10B981" stroke="#10B981" stroke-width="2" />
          </>
        )}
      </For>
      <line
        x1={PLOT.left} y1={PLOT.top + plot().height} x2={PLOT.width - PLOT.right} y2={PLOT.top + plot().height}
        stroke="#6B7280"
      />
    </svg>
  )
}

const polar = (cx: number, cy: number, radius: number, angle: number): readonly [number, number] => [
  cx + radius * Math.cos(angle),
  cy + radius * Math.sin(angle)
]

/** Legacy `<Pie>` of `modelUsage` by cost, `label` = `model.split("-")[0]` + share. */
function ModelPie(props: {
  readonly entries: readonly { readonly model: string; readonly usage: ModelUsage }[]
}): JSX.Element {
  const total = createMemo(() => props.entries.reduce((sum, entry) => sum + entry.usage.cost, 0))
  const slices = createMemo(() => {
    let angle = -Math.PI / 2
    const denominator = Math.max(total(), Number.EPSILON)
    return props.entries.map((entry, index) => {
      const share = entry.usage.cost / denominator
      const start = angle
      const end = angle + share * Math.PI * 2
      angle = end
      return { ...entry, share, start, end, color: COLORS[index % COLORS.length] ?? COLORS[0]! }
    })
  })
  const CX = 160
  const CY = 150
  const R = 100
  const path = (start: number, end: number): string => {
    const [x1, y1] = polar(CX, CY, R, start)
    const [x2, y2] = polar(CX, CY, R, end)
    const large = end - start > Math.PI ? 1 : 0
    return `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`
  }

  return (
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <svg viewBox="0 0 320 300" width="100%" height={300} role="img">
        <For each={slices()}>
          {(slice) => (
            <>
              <path d={path(slice.start, slice.end)} fill={slice.color} />
              <text
                x={polar(CX, CY, R * 0.65, (slice.start + slice.end) / 2)[0]}
                y={polar(CX, CY, R * 0.65, (slice.start + slice.end) / 2)[1]}
                text-anchor="middle"
                font-size="12"
                fill="#FFFFFF"
              >
                {`${slice.model.split("-")[0] ?? slice.model} ${(slice.share * 100).toFixed(0)}%`}
              </text>
            </>
          )}
        </For>
      </svg>

      <div class="space-y-3">
        <For each={props.entries}>
          {(entry, index) => (
            <div class="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
              <div class="flex items-center">
                <div
                  class="mr-3 h-4 w-4 rounded-full"
                  style={{ "background-color": COLORS[index() % COLORS.length] ?? COLORS[0] }}
                />
                <span class="font-medium text-gray-900 dark:text-white">{entry.model.split("-")[0] ?? entry.model}</span>
              </div>
              <div class="text-right">
                <div class="font-bold text-gray-900 dark:text-white">{formatCurrency(entry.usage.cost)}</div>
                <div class="text-sm text-gray-500">{t("cost.tokensCount", { tokens: formatNumber(entry.usage.tokens) })}</div>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

/** Legacy `<BarChart dataKey="cost">` of `topSpendingUsers`. */
function TopSpendingChart(props: {
  readonly rows: readonly { readonly userId: string; readonly cost: number }[]
}): JSX.Element {
  const width = PLOT.width - PLOT.left - PLOT.right
  const height = PLOT.height - PLOT.top - PLOT.bottom
  const max = Math.max(1, ...props.rows.map((row) => row.cost))
  const barWidth = props.rows.length > 0 ? (width / props.rows.length) * 0.6 : 0
  const step = props.rows.length > 0 ? width / props.rows.length : 0
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max]
  return (
    <svg viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} width="100%" height={PLOT.height} role="img">
      <For each={ticks}>
        {(tick) => (
          <>
            <line
              x1={PLOT.left} y1={PLOT.top + height - (tick / max) * height}
              x2={PLOT.width - PLOT.right} y2={PLOT.top + height - (tick / max) * height}
              stroke="#374151" stroke-opacity="0.3" stroke-dasharray="3 3"
            />
            <text x={PLOT.left - 6} y={PLOT.top + height - (tick / max) * height + 4} text-anchor="end" font-size="12" fill="#6B7280">
              {formatCurrency(tick)}
            </text>
          </>
        )}
      </For>
      <For each={props.rows}>
        {(row, index) => {
          const x = PLOT.left + index() * step + (step - barWidth) / 2
          const barHeight = (row.cost / max) * height
          return (
            <>
              <rect x={x} y={PLOT.top + height - barHeight} width={barWidth} height={barHeight} fill="#3B82F6" rx="4" />
              <text
                x={x + barWidth / 2} y={PLOT.height - PLOT.bottom + 18}
                text-anchor="middle" font-size="12" fill="#6B7280"
              >
                {row.userId}
              </text>
            </>
          )
        }}
      </For>
      <line x1={PLOT.left} y1={PLOT.top + height} x2={PLOT.width - PLOT.right} y2={PLOT.top + height} stroke="#6B7280" />
    </svg>
  )
}

export function UserCostAnalytics(props: UserCostAnalyticsProps): JSX.Element {
  const isAdmin = () => props.isAdmin === true
  const [activeTab, setActiveTab] = createSignal<Tab>(isAdmin() ? "system" : "personal")

  // Legacy: `GET /api/analytics/user-usage?userId=<session user>` (+ the date range).
  const personal = useRead((client) =>
    client.user.profile().pipe(
      Effect.flatMap((profile) =>
        client.analytics.userUsage({
          query: {
            userId: profile.id,
            ...(props.startDate ? { startDate: props.startDate.toISOString() } : {}),
            ...(props.endDate ? { endDate: props.endDate.toISOString() } : {})
          }
        }).pipe(Effect.map((reply) => reply as unknown as PersonalReply))
      )
    )
  )

  // Legacy: the system read only happens for an admin on the "system" tab.
  const system = useKeyedRead<SystemKey, SystemStats | null>(
    () => (isAdmin() && activeTab() === "system"
      ? { startDate: props.startDate, endDate: props.endDate }
      : false),
    (client, key) =>
      client.analytics.userUsage({
        query: {
          ...(key.startDate ? { startDate: key.startDate.toISOString() } : {}),
          ...(key.endDate ? { endDate: key.endDate.toISOString() } : {})
        }
      }).pipe(Effect.map((reply) => (reply as unknown as SystemReply).systemStats ?? null))
  )

  const summary = (): UserSummary | undefined => personal.data()?.summary ?? undefined
  const breakdown = (): UserBreakdown | null => personal.data()?.breakdown ?? null
  const systemStats = (): SystemStats | undefined => system.data() ?? undefined
  const modelEntries = createMemo(() =>
    Object.entries(summary()?.modelUsage ?? {}).map(([model, usage]) => ({ model, usage }))
  )

  const tabClass = (active: boolean): string =>
    `rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
      active
        ? "bg-blue-500 text-white shadow-md"
        : "text-gray-600 hover:bg-white/40 dark:text-gray-300 dark:hover:bg-gray-700/40"
    }`

  const loadingPersonal = (): boolean => personal.loading() && personal.data() === undefined
  const loadingSystem = (): boolean => isAdmin() && activeTab() === "system" && system.loading() && system.data() === undefined

  return (
    <div class="space-y-8">
      <Show when={isAdmin()}>
        <Motion.div
          class="inline-flex space-x-2 rounded-2xl border border-white/30 bg-white/60 p-2 shadow-lg backdrop-blur-sm dark:border-gray-600/30 dark:bg-gray-700/60"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button type="button" class={tabClass(activeTab() === "personal")} onClick={() => setActiveTab("personal")}>
            <span class="flex items-center">
              <DollarSign size={16} class="mr-2" />
              {t("cost.tab.personal")}
            </span>
          </button>
          <button type="button" class={tabClass(activeTab() === "system")} onClick={() => setActiveTab("system")}>
            <span class="flex items-center">
              <Users size={16} class="mr-2" />
              {t("cost.tab.system")}
            </span>
          </button>
        </Motion.div>
      </Show>

      <Show
        when={!loadingPersonal() && !loadingSystem()}
        fallback={
          <Motion.div class="flex h-64 items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <RefreshCw class="mr-2 h-6 w-6 animate-spin text-blue-500" />
            <span class="text-gray-600 dark:text-gray-400">{t("cost.loading")}</span>
          </Motion.div>
        }
      >
        <Show
          when={!personal.error() && !system.error()}
          fallback={
            <Motion.div class="flex h-64 items-center justify-center text-red-500" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <AlertCircle class="mr-2 h-6 w-6" />
              <span>{personal.error() ?? system.error()}</span>
            </Motion.div>
          }
        >
          <Show
            when={activeTab() === "personal"}
            fallback={
              <Show
                when={systemStats()}
                fallback={
                  <EmptyCard
                    icon={<Users class="h-12 w-12 text-gray-400" />}
                    title={t("cost.system.emptyTitle")}
                    body={t("cost.system.emptyBody")}
                  />
                }
              >
                {(stats) => (
                  <div class="space-y-6">
                    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                      <StatCard label={t("cost.system.users")} value={formatNumber(stats().totalUsers)}
                        icon={<Users class="h-8 w-8 text-blue-500" />} />
                      <StatCard label={t("cost.totalCost")} value={formatCurrency(stats().totalCost)}
                        icon={<DollarSign class="h-8 w-8 text-green-500" />} />
                      <StatCard label={t("cost.system.avgCost")} value={formatCurrency(stats().averageCostPerUser)}
                        icon={<Activity class="h-8 w-8 text-purple-500" />} />
                      <StatCard label={t("cost.totalTokens")} value={formatNumber(stats().totalTokens)}
                        icon={<Cpu class="h-8 w-8 text-orange-500" />} />
                    </div>

                    <Motion.div class={cardClass} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                      <h3 class="mb-6 text-xl font-bold text-gray-900 dark:text-white">{t("cost.topSpending")}</h3>
                      <Show
                        when={stats().topSpendingUsers.length > 0}
                        fallback={<div class="py-12 text-center text-gray-500">{t("cost.noUsers")}</div>}
                      >
                        <TopSpendingChart rows={stats().topSpendingUsers} />
                      </Show>
                    </Motion.div>
                  </div>
                )}
              </Show>
            }
          >
            <Show
              when={summary()}
              fallback={
                <EmptyCard
                  icon={<BarChart2 class="h-12 w-12 text-gray-400" />}
                  title={t("cost.emptyTitle")}
                  body={t("cost.emptyBody")}
                  action={t("cost.generate")}
                  onAction={() => void personal.refetch()}
                />
              }
            >
              {(data) => (
                <div class="space-y-6">
                  <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard label={t("cost.totalCost")} value={formatCurrency(data().totalCost)}
                      growth={breakdown()?.trends.costGrowth}
                      icon={<DollarSign class="h-8 w-8 text-blue-500" />} />
                    <StatCard label={t("cost.totalTokens")} value={formatNumber(data().totalTokens)}
                      growth={breakdown()?.trends.tokensGrowth}
                      icon={<Activity class="h-8 w-8 text-green-500" />} />
                    <StatCard label={t("cost.requests")} value={formatNumber(data().totalRequests)}
                      growth={breakdown()?.trends.requestsGrowth}
                      icon={<Cpu class="h-8 w-8 text-purple-500" />} />
                    <StatCard label={t("cost.efficiency")} value={data().costEfficiencyScore.toFixed(1)}
                      caption={t("cost.efficiencyCaption")}
                      icon={<TrendingUp class="h-8 w-8 text-orange-500" />} />
                  </div>

                  <Motion.div class={cardClass} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
                    <h3 class="mb-6 text-xl font-bold text-gray-900 dark:text-white">{t("cost.dailyTrends")}</h3>
                    <Show
                      when={data().dailyUsage.length > 0}
                      fallback={<div class="py-12 text-center text-gray-500">{t("cost.noDaily")}</div>}
                    >
                      <DailyUsageChart rows={data().dailyUsage} />
                    </Show>
                  </Motion.div>

                  <Motion.div class={cardClass} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
                    <h3 class="mb-6 text-xl font-bold text-gray-900 dark:text-white">{t("cost.modelDistribution")}</h3>
                    <Show
                      when={modelEntries().length > 0}
                      fallback={<div class="py-12 text-center text-gray-500">{t("cost.noModels")}</div>}
                    >
                      <ModelPie entries={modelEntries()} />
                    </Show>
                  </Motion.div>
                </div>
              )}
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  )
}

interface EmptyCardProps {
  readonly icon: JSX.Element
  readonly title: string
  readonly body: string
  readonly action?: string
  readonly onAction?: () => void
}

function EmptyCard(props: EmptyCardProps): JSX.Element {
  return (
    <Motion.div
      class={`${cardClass} p-12 text-center`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div class="flex flex-col items-center space-y-4">
        <div class="rounded-full bg-gray-100 p-4 dark:bg-gray-700">{props.icon}</div>
        <div>
          <h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-white">{props.title}</h3>
          <p class="max-w-md text-gray-500 dark:text-gray-400">{props.body}</p>
        </div>
        <Show when={props.action !== undefined}>
          <Motion.button
            type="button"
            class="rounded-lg bg-blue-500 px-6 py-3 text-white transition-colors duration-200 hover:bg-blue-600"
            hover={{ scale: 1.05 }}
            press={{ scale: 0.95 }}
            onClick={() => props.onAction?.()}
          >
            {props.action}
          </Motion.button>
        </Show>
      </div>
    </Motion.div>
  )
}
