/**
 * `AnalyticsOverview` — `.reference/src/components/analytics/AnalyticsOverview.tsx`.
 *
 * Two reads: `GET /api/analytics` (the `countByType` breakdown) and
 * `GET /api/analytics/user-metrics` (the summary counters). The legacy component asked for
 * `summary.totalAIRequests` / `cadOperations` / `storageUsedMB` … names the endpoint never
 * answered with, so those cards showed `N/A`; here they read the contract's own field names
 * (`totalAiRequests`, `totalCadDrawings`, `totalStorageUsage`, …).
 */
import { LoadingState } from "../../../shared/components/screen-parts.tsx"
import { For, Show, type JSX } from "solid-js"
import {
  Activity, AlertCircle, Database, Eye, FileText, Folder, GitMerge, Grid, HardDrive, Users, Wrench, Zap
} from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useRead } from "../../../app/queries.ts"
import { ActivityCard } from "./activity-card.tsx"
import { StatCard } from "./stat-card.tsx"

interface CountByType {
  readonly itemType: string
  readonly _count: number
}

interface IndexReply {
  readonly data?: { readonly countByType?: readonly CountByType[] }
}

interface MetricsReply {
  readonly summary?: {
    readonly totalAiRequests?: number
    readonly totalCadDrawings?: number
    readonly totalStorageUsage?: number
    readonly totalProjects?: number
    readonly totalComponents?: number
    readonly totalToolpaths?: number
    readonly totalActivityCount?: number
  }
}

export interface AnalyticsOverviewProps {
  readonly startDate?: Date
  readonly endDate?: Date
  readonly userFilter?: string
  readonly isAdmin?: boolean
}

const iconClass = "h-5 w-5"
const bigIcon = "h-5 w-5"

export function AnalyticsOverview(props: AnalyticsOverviewProps): JSX.Element {
  const general = useRead((client) => client.analytics.index({
    query: {
      ...(props.startDate ? { startDate: props.startDate.toISOString() } : {}),
      ...(props.endDate ? { endDate: props.endDate.toISOString() } : {}),
      ...(props.userFilter ? { userFilter: props.userFilter } : {}),
      groupBy: "day"
    }
  }))
  const metrics = useRead((client) => client.analytics.userMetrics({
    query: {
      ...(props.startDate ? { startDate: props.startDate.toISOString() } : {}),
      ...(props.endDate ? { endDate: props.endDate.toISOString() } : {}),
      groupBy: "day"
    }
  }))

  const loading = (): boolean => general.loading() || metrics.loading()
  const error = (): string | undefined => general.error() ?? metrics.error()

  const counts = (): readonly CountByType[] =>
    (general.data() as unknown as IndexReply | undefined)?.data?.countByType ?? []
  const byType = (): Map<string, number> =>
    new Map(counts().map((entry) => [entry.itemType, entry._count]))
  const summary = (): MetricsReply["summary"] =>
    (metrics.data() as unknown as MetricsReply | undefined)?.summary

  const totalActivityCount = (): number => {
    const fromSummary = summary()?.totalActivityCount
    if (fromSummary !== undefined) return fromSummary
    const values = [...byType().values()]
    return values.length > 0 ? values.reduce((sum, count) => sum + count, 0) : 0
  }

  const typeIcon = (type: string): JSX.Element => {
    switch (type) {
      case "project": return <FileText class={`${iconClass} `} />
      case "component": return <Database class={`${iconClass} `} />
      case "tool": return <Wrench class={`${iconClass} `} />
      case "page_view": return <Eye class={`${iconClass} `} />
      default: return <Activity class={`${iconClass} `} />
    }
  }

  return (
    <div class="space-y-4">
      <Show when={loading()} fallback={
        <>
          <Show when={error()}>
            <div class="space-y-2 rounded-md border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" role="alert">
              <div class="flex items-center gap-2">
                <AlertCircle size={16} aria-hidden="true" class="flex-none" />
                <p class="text-sm font-semibold">{t("admin.analytics.loadFailed")}</p>
              </div>
              <p class="pl-6 text-sm">{error()}</p>
            </div>
          </Show>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <StatCard title={t("admin.analytics.totalActivity")} value={totalActivityCount()}
              icon={<Activity class={`${bigIcon} `} />} />
            <StatCard title={t("admin.analytics.activeUsers")} value={0}
              icon={<Users class={`${bigIcon} `} />} />
            <Show when={props.isAdmin}>
              <StatCard title={t("admin.analytics.totalUsers")} value={0}
                icon={<Users class={`${bigIcon} `} />} />
            </Show>
            <StatCard title={t("admin.analytics.pageViews")} value={byType().get("page_view") ?? 0}
              icon={<Eye class={`${bigIcon} `} />} />
            <StatCard title={t("admin.analytics.aiRequests")} value={summary()?.totalAiRequests ?? "N/A"}
              icon={<Zap class={`${bigIcon} `} />} />
            <StatCard title={t("admin.analytics.cadDrawings")} value={summary()?.totalCadDrawings ?? "N/A"}
              icon={<FileText class={`${bigIcon} `} />} />
            <StatCard title={t("admin.analytics.storage")} value={summary()?.totalStorageUsage ?? "N/A"}
              icon={<HardDrive class={`${bigIcon} `} />} />
            <StatCard title={t("admin.analytics.projects")} value={summary()?.totalProjects ?? "N/A"}
              icon={<Folder class={`${bigIcon} `} />} />
            <StatCard title={t("admin.analytics.components")} value={summary()?.totalComponents ?? "N/A"}
              icon={<Grid class={`${bigIcon} `} />} />
            <StatCard title={t("admin.analytics.toolpaths")} value={summary()?.totalToolpaths ?? "N/A"}
              icon={<GitMerge class={`${bigIcon} `} />} />
          </div>

          <Show when={byType().size > 0}>
            <div class="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <h3 class="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t("admin.analytics.byType")}</h3>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                <For each={[...byType().entries()].sort((a, b) => b[1] - a[1])}>
                  {([type, count]) => (
                    <ActivityCard
                      title={type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ")}
                      count={count}
                      icon={typeIcon(type)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>
        </>
      }>
        <LoadingState label={t("common.loading")} rows={4} />
      </Show>
    </div>
  )
}
