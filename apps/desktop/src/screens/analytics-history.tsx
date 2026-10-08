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
import { Activity, ArrowLeft, BarChart2, Calendar, Cpu, FileText, Filter, TrendingUp, Users } from "lucide-solid"
import { PANEL, TOOLBAR_BUTTON, WorkspacePage } from "../components/WorkspacePage.tsx"
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
    <WorkspacePage
      title={t("history.title")}
      actions={<A href="/analytics" class={TOOLBAR_BUTTON}><ArrowLeft size={16} aria-hidden="true" />{t("history.back")}</A>}
      rail={<>
        <p class="text-xs text-gray-500 dark:text-gray-400">{t("history.subtitle")}</p>
        <h2 class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"><Filter size={14} aria-hidden="true" />{t("history.filterTitle")}</h2>
        <div class="flex flex-col gap-1">
          <For each={filterOptions()}>
            {(option) => (
              <button
                type="button"
                aria-pressed={selectedFilter() === option.key}
                onClick={() => setSelectedFilter(option.key)}
                class={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm font-medium ${selectedFilter() === option.key ? "bg-blue-50 text-[#007ACC] dark:bg-blue-900/40 dark:text-blue-300" : "text-gray-700 hover:bg-white/60 dark:text-gray-300 dark:hover:bg-gray-700/60"}`}
              >
                <span class="flex items-center gap-2"><option.Icon size={16} aria-hidden="true" />{option.label}</span>
                <Show when={option.count > 0}><span class="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-700 dark:bg-gray-600 dark:text-gray-200">{option.count}</span></Show>
              </button>
            )}
          </For>
        </div>
      </>}
    >
      <div class="space-y-6">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <For each={statCards()}>
            {(card) => (
              <div class={PANEL}>
                <div class="mb-3 flex items-center justify-between">
                  <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">{card.label}</h3>
                  <card.Icon size={20} class={card.accent} aria-hidden="true" />
                </div>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">{loading() ? "..." : card.value}</p>
                <p class={`mt-1 text-xs ${card.accent}`}>{loading() ? t("history.loading") : card.caption}</p>
              </div>
            )}
          </For>
        </div>

        <div class={`${PANEL} !p-0 overflow-hidden`}>
          <div class="border-b border-gray-200/50 p-5 dark:border-gray-600/50">
            <h3 class="flex items-center gap-2 text-lg font-medium text-gray-800 dark:text-gray-200"><Activity size={18} class="text-indigo-500" aria-hidden="true" />{t("history.timeline")}</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {selectedFilter() === "all" ? t("history.allActivities") : t("history.filteredBy", { key: selectedFilter().toUpperCase() })}
            </p>
          </div>
          <Show when={selectedFilter()} keyed>
            {(filter) => <div data-filter={filter} class="p-5"><UserHistory limit={50} /></div>}
          </Show>
        </div>
      </div>
    </WorkspacePage>
  )
}
