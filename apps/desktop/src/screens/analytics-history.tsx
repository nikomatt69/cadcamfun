/**
 * `/analytics/history` — visual parity with `.reference/src/pages/analytics/history.tsx`.
 *
 * Gradient hero, three stat cards, the filter pill row and the "Recent Activity Timeline"
 * card that hosts `UserHistory`. The stats come from `GET /api/analytics`; the legacy page
 * reads `totalActivities` / `thisWeekActivities` / `cadActivities` … off that reply even
 * though the route has never answered with them, so the cards keep showing 0 exactly as
 * the legacy app did.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { Motion } from "solid-motionone"
import { Activity, BarChart2, Calendar, Cpu, FileText, Filter, TrendingUp, Users } from "lucide-solid"
import { t } from "../i18n/index.ts"
import { useRead } from "../app/queries.ts"
import { UserHistory } from "../components/analytics/user-history.tsx"

type FilterKey = "all" | "cad" | "cam" | "ai" | "projects"

interface StatCard {
  readonly key: string
  readonly label: string
  readonly caption: string
  readonly value: string
  readonly accent: string
  readonly Icon: typeof Activity
}

/** The fields the legacy page reads from `GET /api/analytics` (never present in the reply). */
interface LegacyIndexFields {
  readonly totalActivities?: number
  readonly thisWeekActivities?: number
  readonly avgDailyActivities?: number
  readonly cadActivities?: number
  readonly camActivities?: number
  readonly aiActivities?: number
  readonly projectActivities?: number
}

export function AnalyticsHistoryScreen(): JSX.Element {
  const [selectedFilter, setSelectedFilter] = createSignal<FilterKey>("all")
  const startDate = new Date(Date.now() - 30 * 86_400_000)
  const endDate = new Date()
  const analytics = useRead((client) =>
    client.analytics.index({ query: { startDate: startDate.toISOString(), endDate: endDate.toISOString() } }))

  const legacy = (): LegacyIndexFields => (analytics.data() as unknown as LegacyIndexFields | undefined) ?? {}
  const loading = analytics.loading

  const statCards = (): readonly StatCard[] => {
    const fields = legacy()
    return [
      { key: "total", label: t("history.total"), caption: t("history.allTime"), accent: "text-blue-500", Icon: Activity,
        value: (fields.totalActivities ?? 0).toLocaleString() },
      { key: "week", label: t("history.week"), caption: t("history.last7"), accent: "text-green-500", Icon: Calendar,
        value: (fields.thisWeekActivities ?? 0).toLocaleString() },
      { key: "daily", label: t("history.average"), caption: t("history.perDay"), accent: "text-purple-500", Icon: TrendingUp,
        value: String(Math.round(fields.avgDailyActivities ?? 0)) }
    ]
  }

  const filterOptions = (): readonly { readonly key: FilterKey; readonly label: string; readonly Icon: typeof Activity; readonly count: number }[] => {
    const fields = legacy()
    return [
      { key: "all", label: t("history.filter.all"), Icon: Activity, count: fields.totalActivities ?? 0 },
      { key: "cad", label: t("history.filter.cad"), Icon: FileText, count: fields.cadActivities ?? 0 },
      { key: "cam", label: t("history.filter.cam"), Icon: BarChart2, count: fields.camActivities ?? 0 },
      { key: "ai", label: t("history.filter.ai"), Icon: Cpu, count: fields.aiActivities ?? 0 },
      { key: "projects", label: t("history.filter.projects"), Icon: Users, count: fields.projectActivities ?? 0 }
    ]
  }

  return (
    <section class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900">
      <div class="mx-auto max-w-7xl space-y-8 p-6">
        <div class="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center md:gap-0">
          <Motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            <h1 class="flex items-center text-2xl font-semibold tracking-[-0.015em] text-gray-900 dark:text-gray-50">
              <span class="inline-flex">
                <BarChart2 size={28} class="mr-3 text-blue-500" />
              </span>
              {t("history.title")}
            </h1>
            <p class="mt-2 text-gray-600 dark:text-gray-400">{t("history.subtitle")}</p>
          </Motion.div>

          <Motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
            <A
              href="/analytics"
              class="inline-block rounded-2xl border border-white/30 bg-white/80 px-6 py-3 font-medium text-gray-700 shadow-xl backdrop-blur-md transition-[background-color,border-color,color,box-shadow,opacity] duration-200 hover:bg-white/90 dark:border-gray-600/30 dark:bg-gray-700/80 dark:text-gray-300 dark:hover:bg-gray-700/90"
            >
              {t("history.back")}
            </A>
          </Motion.div>
        </div>

        <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
          <For each={statCards()}>
            {(card, index) => (
              <Motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: index() * 0.1 }}
                hover={{ scale: 1.05, y: -3 }}
                class="rounded-2xl border border-white/30 bg-white/80 p-6 shadow-xl backdrop-blur-md dark:border-gray-600/30 dark:bg-gray-800/80"
              >
                <div class="mb-3 flex items-center justify-between">
                  <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">{card.label}</h3>
                  <span class="inline-flex">
                    <card.Icon size={20} class={card.accent} />
                  </span>
                </div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">{loading() ? "..." : card.value}</p>
                <p class={`mt-1 text-xs ${card.accent}`}>{loading() ? t("history.loading") : card.caption}</p>
              </Motion.div>
            )}
          </For>
        </div>

        <Motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5 }}
          class="rounded-2xl border border-white/30 bg-white/80 p-6 shadow-xl backdrop-blur-md dark:border-gray-600/30 dark:bg-gray-800/80"
        >
          <div class="mb-4 flex items-center">
            <span class="inline-flex">
              <Filter size={18} class="mr-2 text-gray-600 dark:text-gray-400" />
            </span>
            <h3 class="text-lg font-medium text-gray-700 dark:text-gray-300">{t("history.filterTitle")}</h3>
          </div>

          <div class="flex flex-wrap gap-3">
            <For each={filterOptions()}>
              {(option, index) => (
                <Motion.button
                  type="button"
                  onClick={() => setSelectedFilter(option.key)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index() * 0.05 }}
                  hover={{ scale: 1.03 }}
                  press={{ scale: 0.95 }}
                  class={`flex items-center rounded-xl border px-4 py-2 text-sm font-medium backdrop-blur-sm transition-[background-color,border-color,color,box-shadow,opacity] duration-200 ${
                    selectedFilter() === option.key
                      ? "border-blue-400 bg-blue-500 text-white shadow-lg"
                      : "border-white/30 bg-white/60 text-gray-700 hover:bg-white/80 dark:border-gray-600/30 dark:bg-gray-700/60 dark:text-gray-300 dark:hover:bg-gray-700/80"
                  }`}
                >
                  <option.Icon size={16} class="mr-2" />
                  <span>{option.label}</span>
                  <Show when={option.count > 0}>
                    <span class={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${selectedFilter() === option.key ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300"}`}>
                      {option.count}
                    </span>
                  </Show>
                </Motion.button>
              )}
            </For>
          </div>
        </Motion.div>

        <Motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          class="overflow-hidden rounded-2xl border border-white/30 bg-white/80 shadow-xl backdrop-blur-md dark:border-gray-600/30 dark:bg-gray-800/80"
        >
          <div class="border-b border-gray-200/50 p-6 dark:border-gray-600/50">
            <h3 class="flex items-center text-lg font-medium text-gray-700 dark:text-gray-300">
              <span class="inline-flex">
                <Activity size={18} class="mr-2 text-indigo-500" />
              </span>
              {t("history.timeline")}
            </h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {selectedFilter() === "all" ? t("history.allActivities") : t("history.filteredBy", { key: selectedFilter().toUpperCase() })}
            </p>
          </div>

          <Show when={selectedFilter()} keyed>
            {(filter) => (
              <Motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                data-filter={filter}
                class="p-6"
              >
                <UserHistory limit={50} />
              </Motion.div>
            )}
          </Show>
        </Motion.div>
      </div>
    </section>
  )
}
