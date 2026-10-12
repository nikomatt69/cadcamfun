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
  "rounded-2xl border border-white/30 bg-white/80 p-6 shadow-xl backdrop-blur-md dark:border-gray-600/30 dark:bg-gray-800/80"

const statCard = (
  titleKey: Parameters<typeof t>[0],
  value: string,
  caption: string,
  Icon: typeof Activity,
  iconClass: string,
  delay: number
): JSX.Element => (
  <Motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.3, delay }}
    hover={{ y: -5, scale: 1.02, transition: { duration: 0.2 } }}
    class={cardClass}
  >
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">{t(titleKey)}</h3>
      <Icon size={16} class={iconClass} />
    </div>
    <div class="mb-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    <p class={`text-xs ${iconClass}`}>{caption}</p>
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
    <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} class="space-y-6">
      {/* Header */}
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Motion.h2
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          class="flex items-center bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-2xl font-bold text-transparent"
        >
          <Cpu size={24} class="mr-3 text-blue-500" />
          {t("aiDash.title")}
        </Motion.h2>

        <Motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          class="flex rounded-xl border border-white/30 bg-white/60 p-1 shadow-md backdrop-blur-sm dark:border-gray-600/30 dark:bg-gray-700/60"
        >
          <For each={TABS}>
            {(tab, index) => (
              <Motion.button
                type="button"
                onClick={() => setActiveTab(tab.key)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 + index() * 0.05 }}
                hover={{ scale: 1.03, backgroundColor: "rgba(59, 130, 246, 0.05)", transition: { duration: 0.15 } }}
                press={{ scale: 0.98 }}
                class={`px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  activeTab() === tab.key
                    ? "scale-105 bg-blue-500 text-white shadow-md"
                    : "text-gray-600 hover:bg-white/40 dark:text-gray-300 dark:hover:bg-gray-700/40"
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
          class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
        >
          {statCard("aiDash.responseTime", `${Math.round(averageResponseTime)}ms`,
            averageResponseTime > 0 ? t("aiDash.livePerformance") : t("aiDash.noDataYet"),
            Clock, "text-green-500", 0.1)}
          {statCard("aiDash.successRate", `${percentage(successfulRequests)}%`,
            t("aiDash.successfulCount", { done: successfulRequests, total: totalRequests }), Target, "text-blue-500", 0.2)}
          {statCard("aiDash.tokensUsed", tokenUsage.toLocaleString(),
            t("aiDash.totalConsumed"), Zap, "text-purple-500", 0.3)}
          {statCard("aiDash.totalRequests", String(totalRequests),
            t("aiDash.todayCount", { count: todayRequests }), Activity, "text-orange-500", 0.4)}
        </Motion.div>
      </Show>

      {/* Performance */}
      <Show when={activeTab() === "performance"}>
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} class="space-y-6">
          <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} class={cardClass}>
            <h3 class="mb-4 flex items-center text-lg font-medium text-gray-700 dark:text-gray-300">
              <TrendingUp size={18} class="mr-2 text-blue-500" />
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
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{config.name}</span>
                        <div class="flex items-center space-x-2">
                          <span class="text-sm text-gray-500 dark:text-gray-400">{t("aiDash.requestsCount", { count: usageCount })}</span>
                          <span class="text-sm font-medium text-blue-600 dark:text-blue-400">{Math.round(pct)}%</span>
                        </div>
                      </div>
                      <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <Motion.div
                          initial={{ width: "0%" }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1, easing: "ease-out" }}
                          class="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                        />
                      </div>
                      <span class="sr-only">{model}</span>
                    </Motion.div>
                  )
                }}
              </For>
            </div>
          </Motion.div>

          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} class={cardClass}>
              <h3 class="mb-4 text-lg font-medium text-gray-700 dark:text-gray-300">{t("aiDash.performanceMetrics")}</h3>
              <div class="space-y-4">
                <div class="flex items-center justify-between rounded-xl bg-green-50 p-3 dark:bg-green-900/20">
                  <span class="text-sm text-gray-600 dark:text-gray-300">{t("aiDash.avgResponseTime")}</span>
                  <span class="font-bold text-green-600 dark:text-green-400">{Math.round(averageResponseTime)}ms</span>
                </div>
                <div class="flex items-center justify-between rounded-xl bg-blue-50 p-3 dark:bg-blue-900/20">
                  <span class="text-sm text-gray-600 dark:text-gray-300">{t("aiDash.successRate")}</span>
                  <span class="font-bold text-blue-600 dark:text-blue-400">{percentage(successfulRequests)}%</span>
                </div>
                <div class="flex items-center justify-between rounded-xl bg-purple-50 p-3 dark:bg-purple-900/20">
                  <span class="text-sm text-gray-600 dark:text-gray-300">{t("aiDash.errorRate")}</span>
                  <span class="font-bold text-purple-600 dark:text-purple-400">
                    {totalRequests > 0 ? (100 - percentage(successfulRequests)).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </Motion.div>

            <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} class={cardClass}>
              <h3 class="mb-4 text-lg font-medium text-gray-700 dark:text-gray-300">{t("aiDash.usageStatistics")}</h3>
              <div class="space-y-4">
                <div class="flex items-center justify-between rounded-xl bg-orange-50 p-3 dark:bg-orange-900/20">
                  <span class="text-sm text-gray-600 dark:text-gray-300">{t("aiDash.totalRequests")}</span>
                  <span class="font-bold text-orange-600 dark:text-orange-400">{totalRequests}</span>
                </div>
                <div class="flex items-center justify-between rounded-xl bg-indigo-50 p-3 dark:bg-indigo-900/20">
                  <span class="text-sm text-gray-600 dark:text-gray-300">{t("aiDash.tokensProcessed")}</span>
                  <span class="font-bold text-indigo-600 dark:text-indigo-400">{tokenUsage.toLocaleString()}</span>
                </div>
                <div class="flex items-center justify-between rounded-xl bg-pink-50 p-3 dark:bg-pink-900/20">
                  <span class="text-sm text-gray-600 dark:text-gray-300">{t("aiDash.activeModels")}</span>
                  <span class="font-bold text-pink-600 dark:text-pink-400">0</span>
                </div>
              </div>
            </Motion.div>
          </div>
        </Motion.div>
      </Show>

      {/* Context */}
      <Show when={activeTab() === "context"}>
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} class="space-y-6">
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} class={cardClass}>
              <h3 class="mb-4 flex items-center text-lg font-medium text-blue-800 dark:text-blue-200">
                <Activity size={18} class="mr-2" />
                {t("aiDash.cadElements")}
              </h3>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-300">{t("aiDash.totalElements")}</span>
                  <span class="font-bold text-blue-600 dark:text-blue-400">0</span>
                </div>
              </div>
            </Motion.div>

            <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} class={cardClass}>
              <h3 class="mb-4 flex items-center text-lg font-medium text-purple-800 dark:text-purple-200">
                <MessageCircle size={18} class="mr-2" />
                {t("aiDash.activeContext")}
              </h3>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-300">{t("aiDash.documents")}</span>
                  <span class="font-bold text-purple-600 dark:text-purple-400">0</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-300">{t("aiDash.contextSize")}</span>
                  <span class="font-bold text-purple-600 dark:text-purple-400">0KB</span>
                </div>
              </div>
            </Motion.div>
          </div>

          <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} class={cardClass}>
            <h3 class="mb-4 text-lg font-medium text-gray-700 dark:text-gray-300">{t("aiDash.environment")}</h3>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-700/50">
                <div class="mb-1 text-xs text-gray-500 dark:text-gray-400">{t("aiDash.browser")}</div>
                <div class="font-medium text-gray-700 dark:text-gray-300">{t("aiDash.unknown")}</div>
              </div>
              <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-700/50">
                <div class="mb-1 text-xs text-gray-500 dark:text-gray-400">{t("aiDash.screen")}</div>
                <div class="font-medium text-gray-700 dark:text-gray-300">{t("aiDash.unknown")}</div>
              </div>
              <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-700/50">
                <div class="mb-1 text-xs text-gray-500 dark:text-gray-400">{t("aiDash.os")}</div>
                <div class="font-medium text-gray-700 dark:text-gray-300">{t("aiDash.unknown")}</div>
              </div>
            </div>
          </Motion.div>
        </Motion.div>
      </Show>

      {/* Insights */}
      <Show when={activeTab() === "insights"}>
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} class="space-y-6">
          <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} class={cardClass}>
            <div class="mb-6 flex items-center justify-between">
              <h3 class="flex items-center text-lg font-medium text-gray-700 dark:text-gray-300">
                <Target size={18} class="mr-2 text-green-500" />
                {t("aiDash.documentIntelligence")}
              </h3>
              <button
                type="button"
                class="rounded-xl border border-white/30 bg-white/60 p-2 text-gray-500 transition-all duration-200 hover:bg-white/80 dark:border-gray-600/30 dark:bg-gray-700/60 dark:text-gray-400 dark:hover:bg-gray-700/80"
                aria-label={t("aiDash.refresh")}
              >
                <RefreshCw size={16} />
              </button>
            </div>

            <div class="rounded-xl border border-gray-200/30 bg-gray-50/60 p-8 text-center dark:border-gray-600/30 dark:bg-gray-700/60">
              <Target size={32} class="mx-auto mb-3 text-gray-400 dark:text-gray-500" />
              <p class="text-sm text-gray-500 dark:text-gray-400">{t("aiDash.noInsights")}</p>
            </div>
          </Motion.div>

          <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} class={cardClass}>
            <h3 class="mb-4 flex items-center text-lg font-medium text-gray-700 dark:text-gray-300">
              <MessageCircle size={18} class="mr-2 text-blue-500" />
              {t("aiDash.recentHistory")}
            </h3>
            <div class="max-h-64 space-y-3 overflow-y-auto">
              <div class="p-4 text-center text-gray-500 dark:text-gray-400">{t("aiDash.noInteractions")}</div>
            </div>
          </Motion.div>
        </Motion.div>
      </Show>
    </Motion.div>
  )
}
