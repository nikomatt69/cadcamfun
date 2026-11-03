/**
 * `AIDashboard` — `.reference/src/components/ai/ai-new/AIDashboard.tsx` (the "AI Insights"
 * tab of `/analytics`).
 *
 * The legacy component reads `useAI()` state, `useDocumentAnalyzer()` and
 * `useEnhancedContext()`; v6 has no AI context store, so every figure renders the values
 * those hooks answer with on a fresh session (0 requests, "No data yet", no models, no
 * insights). The tab strip, cards and copy are ported verbatim.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Activity, BarChart2, Clock, Cpu, MessageCircle, RefreshCw, Target, TrendingUp, Zap } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { AnalyticsScene, TimelineScene } from "../../../shared/ui/stageshow/index.ts"

type TabKey = "context" | "stats" | "insights" | "performance"

interface Tab {
  readonly key: TabKey
  readonly labelKey: "aiDash.tab.statistics" | "aiDash.tab.performance" | "aiDash.tab.context" | "aiDash.tab.insights"
  readonly Icon: typeof Activity
}

const TABS: readonly Tab[] = [
  { key: "stats", labelKey: "aiDash.tab.statistics", Icon: BarChart2 },
  { key: "performance", labelKey: "aiDash.tab.performance", Icon: TrendingUp },
  { key: "context", labelKey: "aiDash.tab.context", Icon: Activity },
  { key: "insights", labelKey: "aiDash.tab.insights", Icon: Target }
]

/** The model breakdown legacy derives from `state.history`; empty on a fresh session. */
const MODEL_USAGE: Readonly<Record<string, { readonly name: string; readonly requests: number }>> = {
  "No models used yet": { name: t("aiDash.noModels"), requests: 0 }
}

const cardClass =
  "rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60"

const statCard = (
  titleKey: Parameters<typeof t>[0],
  value: string,
  caption: string,
  Icon: typeof Activity,
  iconClass: string,
  delay: number
): JSX.Element => (
  <Motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, delay }}
    class={cardClass}
  >
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">{t(titleKey)}</h3>
      <Icon size={16} aria-hidden="true" class={iconClass} />
    </div>
    <div class="mb-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{value}</div>
    <p class="text-xs text-slate-500 dark:text-slate-400">{caption}</p>
  </Motion.div>
)

export function AiDashboard(): JSX.Element {
  const [activeTab, setActiveTab] = createSignal<TabKey>("stats")

  // Legacy `historyStats`: 0 requests recorded for the local profile.
  const totalRequests = 0
  const successfulRequests = 0
  const todayRequests = 0
  const tokenUsage = 0
  const averageResponseTime = 0

  const percentage = (part: number): number =>
    totalRequests > 0 ? Math.round((part / totalRequests) * 100) : 0

  return (
    <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} class="space-y-4">
      {/* Header */}
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Motion.h2
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          class="flex items-center text-base font-semibold text-slate-900 dark:text-white"
        >
          <Cpu size={16} aria-hidden="true" class="mr-2 text-slate-400" />
          {t("aiDash.title")}
        </Motion.h2>

        <Motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          class="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800"
        >
          <For each={TABS}>
            {(tab, index) => (
              <Motion.button
                type="button"
                onClick={() => setActiveTab(tab.key)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 + index() * 0.05 }}
                                press={{ scale: 0.98 }}
                class={`h-7 rounded-[5px] px-3 text-xs font-medium transition-colors duration-150 ${
                  activeTab() === tab.key
                    ? "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/60"
                }`}
              >
                <span class="flex items-center">
                  <tab.Icon size={14} class="mr-2" />
                  {t(tab.labelKey)}
                </span>
              </Motion.button>
            )}
          </For>
        </Motion.div>
      </div>

      {/* Statistics */}
      <Show when={activeTab() === "stats"}>
        <Motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
        >
          {statCard("aiDash.responseTime", `${Math.round(averageResponseTime)}ms`,
            averageResponseTime > 0 ? t("aiDash.livePerformance") : t("aiDash.noDataYet"),
            Clock, "text-slate-400 dark:text-slate-500", 0.1)}
          {statCard("aiDash.successRate", `${percentage(successfulRequests)}%`,
            t("aiDash.successfulCount", { done: successfulRequests, total: totalRequests }), Target, "text-slate-400 dark:text-slate-500", 0.2)}
          {statCard("aiDash.tokensUsed", tokenUsage.toLocaleString(),
            t("aiDash.totalConsumed"), Zap, "text-slate-400 dark:text-slate-500", 0.3)}
          {statCard("aiDash.totalRequests", String(totalRequests),
            t("aiDash.todayCount", { count: todayRequests }), Activity, "text-slate-400 dark:text-slate-500", 0.4)}
        </Motion.div>
      </Show>

      {/* Performance */}
      <Show when={activeTab() === "performance"}>
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} class="space-y-4">
          <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} class={cardClass}>
            <h3 class="mb-4 flex items-center text-sm font-semibold text-slate-900 dark:text-white">
              <TrendingUp size={16} aria-hidden="true" class="mr-2 text-slate-400" />
              {t("aiDash.modelDistribution")}
            </h3>
            <div class="space-y-4">
              <For each={Object.entries(MODEL_USAGE)}>
                {([model, config], index) => {
                  const usageCount = config.requests
                  const pct = totalRequests > 0 ? (usageCount / totalRequests) * 100 : 0
                  return (
                    <Motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 + index() * 0.1 }}
                      class="space-y-2"
                    >
                      <div class="flex items-center justify-between">
                        <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{config.name}</span>
                        <div class="flex items-center space-x-2">
                          <span class="text-sm tabular-nums text-slate-500 dark:text-slate-400">{t("aiDash.requestsCount", { count: usageCount })}</span>
                          <span class="text-sm font-medium tabular-nums text-slate-900 dark:text-white">{Math.round(pct)}%</span>
                        </div>
                      </div>
                      <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <Motion.div
                          initial={{ width: "0%" }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1, easing: "ease-out" }}
                          class="h-full rounded-full bg-blue-600"
                        />
                      </div>
                      <span class="sr-only">{model}</span>
                    </Motion.div>
                  )
                }}
              </For>
            </div>
          </Motion.div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} class={cardClass}>
              <h3 class="mb-4 text-sm font-semibold text-slate-900 dark:text-white">{t("aiDash.performanceMetrics")}</h3>
              <div class="space-y-4">
                <div class="flex items-center justify-between rounded-md bg-white p-3 dark:bg-slate-900/60">
                  <span class="text-sm text-slate-600 dark:text-slate-300">{t("aiDash.avgResponseTime")}</span>
                  <span class="font-semibold tabular-nums text-slate-900 dark:text-white">{Math.round(averageResponseTime)}ms</span>
                </div>
                <div class="flex items-center justify-between rounded-md bg-white p-3 dark:bg-slate-900/60">
                  <span class="text-sm text-slate-600 dark:text-slate-300">{t("aiDash.successRate")}</span>
                  <span class="font-semibold tabular-nums text-slate-900 dark:text-white">{percentage(successfulRequests)}%</span>
                </div>
                <div class="flex items-center justify-between rounded-md bg-white p-3 dark:bg-slate-900/60">
                  <span class="text-sm text-slate-600 dark:text-slate-300">{t("aiDash.errorRate")}</span>
                  <span class="font-semibold tabular-nums text-slate-900 dark:text-white">
                    {totalRequests > 0 ? (100 - percentage(successfulRequests)).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </Motion.div>

            <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} class={cardClass}>
              <h3 class="mb-4 text-sm font-semibold text-slate-900 dark:text-white">{t("aiDash.usageStatistics")}</h3>
              <div class="space-y-4">
                <div class="flex items-center justify-between rounded-md bg-white p-3 dark:bg-slate-900/60">
                  <span class="text-sm text-slate-600 dark:text-slate-300">{t("aiDash.totalRequests")}</span>
                  <span class="font-semibold tabular-nums text-slate-900 dark:text-white">{totalRequests}</span>
                </div>
                <div class="flex items-center justify-between rounded-md bg-white p-3 dark:bg-slate-900/60">
                  <span class="text-sm text-slate-600 dark:text-slate-300">{t("aiDash.tokensProcessed")}</span>
                  <span class="font-semibold tabular-nums text-slate-900 dark:text-white">{tokenUsage.toLocaleString()}</span>
                </div>
                <div class="flex items-center justify-between rounded-md bg-white p-3 dark:bg-slate-900/60">
                  <span class="text-sm text-slate-600 dark:text-slate-300">{t("aiDash.activeModels")}</span>
                  <span class="font-semibold tabular-nums text-slate-900 dark:text-white">0</span>
                </div>
              </div>
            </Motion.div>
          </div>
        </Motion.div>
      </Show>

      {/* Context */}
      <Show when={activeTab() === "context"}>
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} class="space-y-4">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} class={cardClass}>
              <h3 class="mb-4 flex items-center text-sm font-semibold text-slate-900 dark:text-white">
                <Activity size={16} aria-hidden="true" class="mr-2 text-slate-400" />
                {t("aiDash.cadElements")}
              </h3>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600 dark:text-slate-300">{t("aiDash.totalElements")}</span>
                  <span class="font-semibold tabular-nums text-slate-900 dark:text-white">0</span>
                </div>
              </div>
            </Motion.div>

            <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} class={cardClass}>
              <h3 class="mb-4 flex items-center text-sm font-semibold text-slate-900 dark:text-white">
                <MessageCircle size={16} aria-hidden="true" class="mr-2 text-slate-400" />
                {t("aiDash.activeContext")}
              </h3>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600 dark:text-slate-300">{t("aiDash.documents")}</span>
                  <span class="font-semibold tabular-nums text-slate-900 dark:text-white">0</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600 dark:text-slate-300">{t("aiDash.contextSize")}</span>
                  <span class="font-semibold tabular-nums text-slate-900 dark:text-white">0KB</span>
                </div>
              </div>
            </Motion.div>
          </div>

          <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} class={cardClass}>
            <h3 class="mb-4 text-sm font-semibold text-slate-900 dark:text-white">{t("aiDash.environment")}</h3>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div class="rounded-md bg-white p-3 dark:bg-slate-900/60">
                <div class="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("aiDash.browser")}</div>
                <div class="font-medium text-slate-700 dark:text-slate-300">{t("aiDash.unknown")}</div>
              </div>
              <div class="rounded-md bg-white p-3 dark:bg-slate-900/60">
                <div class="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("aiDash.screen")}</div>
                <div class="font-medium text-slate-700 dark:text-slate-300">{t("aiDash.unknown")}</div>
              </div>
              <div class="rounded-md bg-white p-3 dark:bg-slate-900/60">
                <div class="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("aiDash.os")}</div>
                <div class="font-medium text-slate-700 dark:text-slate-300">{t("aiDash.unknown")}</div>
              </div>
            </div>
          </Motion.div>
        </Motion.div>
      </Show>

      {/* Insights */}
      <Show when={activeTab() === "insights"}>
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} class="space-y-4">
          <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} class={cardClass}>
            <div class="mb-4 flex items-center justify-between">
              <h3 class="flex items-center text-sm font-semibold text-slate-900 dark:text-white">
                <Target size={16} aria-hidden="true" class="mr-2 text-slate-400" />
                {t("aiDash.documentIntelligence")}
              </h3>
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-[5px] border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                aria-label={t("aiDash.refresh")}
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            </div>

            <div class="rounded-md bg-white p-4 text-center dark:bg-slate-900/60">
              <div class="mx-auto mb-3 max-w-md overflow-hidden rounded-md border border-slate-200 dark:border-slate-700" aria-hidden="true">
                <AnalyticsScene />
              </div>
              <p class="text-sm text-slate-500 dark:text-slate-400">{t("aiDash.noInsights")}</p>
            </div>
          </Motion.div>

          <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} class={cardClass}>
            <h3 class="mb-4 flex items-center text-sm font-semibold text-slate-900 dark:text-white">
              <MessageCircle size={16} aria-hidden="true" class="mr-2 text-slate-400" />
              {t("aiDash.recentHistory")}
            </h3>
            <div class="max-h-64 space-y-3 overflow-y-auto">
              <div class="mx-auto max-w-md overflow-hidden rounded-md border border-slate-200 dark:border-slate-700" aria-hidden="true">
                <TimelineScene />
              </div>
              <div class="p-4 text-center text-sm text-slate-500 dark:text-slate-400">{t("aiDash.noInteractions")}</div>
            </div>
          </Motion.div>
        </Motion.div>
      </Show>
    </Motion.div>
  )
}
