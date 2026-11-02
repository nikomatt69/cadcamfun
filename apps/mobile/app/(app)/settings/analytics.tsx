import { useCallback, useMemo, useState } from "react"
import { Text, View } from "react-native"
import { BarChart3, RefreshCw } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme, hexToRgba } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { type, caps } from "@/lib/typography"
import { relativeTime } from "@/lib/format"
import {
  ANALYTICS_METRICS, ANALYTICS_PRESETS, activityPhrase, barHeights, downsample, metricSeries, metricValue, presetRange, summaryCounters, trendLabel,
  type AnalyticsMetric, type AnalyticsPreset,
} from "@/lib/analytics"
import { ScreenFrame } from "@/components/manage/ScreenFrame"
import { PageScroll } from "@/components/layout/page-scroll"
import { FilterChips } from "@/components/ui/FilterChips"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { ActionButton } from "@/components/ui/ActionButton"

const MAX_BARS = 40
const BAR_AREA = 120

/**
 * The desktop's analytics dashboard for the signed-in user: counters, a trend over the chosen range and the latest
 * activity. The numbers come from the desktop (read-only); the admin views stay there.
 */
export default function AnalyticsScreen() {
  const { client } = useServer()
  const { palette } = useTheme()
  const [preset, setPreset] = useState<AnalyticsPreset>("30days")
  const [metric, setMetric] = useState<AnalyticsMetric>("activityCount")
  const range = useMemo(() => presetRange(preset), [preset])

  const dashboard = useResource(useCallback(async (signal) => {
    if (!client) throw new Error("Not connected")
    return client.analyticsDashboard(signal)
  }, [client]), "analytics:dashboard", { cacheKey: "analytics:dashboard" })

  const trend = useResource(useCallback(async (signal) => {
    if (!client) throw new Error("Not connected")
    return client.analyticsMetrics(range, metric, preset === "year" ? "week" : "day", signal)
  }, [client, range, metric, preset]), `analytics:trend:${preset}:${metric}`, { cacheKey: `analytics:trend:${preset}:${metric}` })

  const recent = useResource(useCallback(async (signal) => {
    if (!client) throw new Error("Not connected")
    return client.recentActivity(15, signal)
  }, [client]), "analytics:recent", { cacheKey: "analytics:recent" })

  const reload = () => { haptic("selection"); void dashboard.reload(); void trend.reload(); void recent.reload() }
  const points = useMemo(() => downsample(metricSeries(trend.data?.chartData ?? [], metric), MAX_BARS), [trend.data, metric])
  const heights = useMemo(() => barHeights(points), [points])
  const total = points.reduce((sum, point) => sum + point.value, 0)
  const failure = dashboard.error ?? trend.error ?? recent.error
  const loading = dashboard.loading && !dashboard.data
  const dashboardTiles = dashboard.data
    ? [
      { id: "projects", label: "Projects", value: dashboard.data.projects.total, trend: dashboard.data.projects.trend, note: `${dashboard.data.projects.activeProjects} active` },
      { id: "components", label: "Components", value: dashboard.data.components.total, trend: dashboard.data.components.trend, note: `${dashboard.data.components.recentActivity} recent` },
      { id: "tools", label: "Tools", value: dashboard.data.tools.total, trend: dashboard.data.tools.trend, note: dashboard.data.tools.mostUsed ? `Most used: ${dashboard.data.tools.mostUsed}` : "" },
      { id: "materials", label: "Materials", value: dashboard.data.materials.total, trend: dashboard.data.materials.trend, note: dashboard.data.materials.lowStock > 0 ? `${dashboard.data.materials.lowStock} low stock` : "" },
    ]
    : []

  return <ScreenFrame title="Analytics" subtitle="Your activity, shared with the desktop" backLabel="Back"
    right={<ActionButton variant="secondary" small fullWidth={false} label="Refresh" icon={<RefreshCw size={15} color={palette.ink} />} onPress={reload} />}>
    <PageScroll>
      <FilterChips options={ANALYTICS_PRESETS} value={preset} onChange={setPreset} accessibilityLabel="Date range" />
      {failure ? <ErrorBanner message={failure} actionLabel="Try again" onAction={reload} /> : null}

      {loading ? <Skeleton style={{ height: 168 }} /> : dashboardTiles.length === 0 && !failure ? (
        <EmptyState title="No activity yet" description="Work on your desktop and the numbers appear here." icon={<BarChart3 size={25} color={palette.accent} />} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {dashboardTiles.map((tile) => (
            <SurfaceCard key={tile.id} style={{ flexBasis: "47%", flexGrow: 1 }} accessibilityLabel={`${tile.label}: ${tile.value}, ${trendLabel(tile.trend)}`}>
              <Text style={{ color: palette.muted, ...caps(11) }}>{tile.label.toUpperCase()}</Text>
              <Text style={{ marginTop: 6, color: palette.ink, fontVariant: ["tabular-nums"], ...type(28, { weight: "700" }) }}>{tile.value}</Text>
              <Text style={{ marginTop: 2, color: tile.trend < 0 ? palette.danger : tile.trend > 0 ? palette.success : palette.muted, fontVariant: ["tabular-nums"], ...type(13, { weight: "600" }) }}>{trendLabel(tile.trend)}</Text>
              {tile.note ? <Text numberOfLines={1} style={{ marginTop: 4, color: palette.soft, ...type(13) }}>{tile.note}</Text> : null}
            </SurfaceCard>
          ))}
        </View>
      )}

      <SectionHeader>Trend</SectionHeader>
      <FilterChips options={ANALYTICS_METRICS} value={metric} onChange={setMetric} accessibilityLabel="Metric" />
      <SurfaceCard>
        {trend.loading && !trend.data ? <Skeleton style={{ height: BAR_AREA }} /> : points.length === 0 ? (
          <Text style={{ color: palette.soft, ...type(14) }}>No data in this range.</Text>
        ) : (
          <View accessible accessibilityLabel={`${ANALYTICS_METRICS.find((m) => m.id === metric)?.label}: ${metricValue(metric, total)} in total`}>
            <Text style={{ color: palette.ink, fontVariant: ["tabular-nums"], ...type(22, { weight: "700" }) }}>{metricValue(metric, total)}</Text>
            <View style={{ marginTop: 12, height: BAR_AREA, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
              {heights.map((height, index) => (
                <View key={points[index]?.date ?? index} style={{
                  flex: 1, height: Math.max(2, Math.round(height * BAR_AREA)), borderRadius: 2,
                  backgroundColor: height > 0 ? palette.accent : hexToRgba(palette.ink, 0.12),
                }} />
              ))}
            </View>
            <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: palette.muted, ...type(12) }}>{points[0]?.date}</Text>
              <Text style={{ color: palette.muted, ...type(12) }}>{points.at(-1)?.date}</Text>
            </View>
          </View>
        )}
      </SurfaceCard>

      <SectionHeader>Latest activity</SectionHeader>
      {recent.data && recent.data.length > 0 ? (
        <SurfaceCard inset={false}>
          {recent.data.map((item, index) => (
            <View key={item.id} style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: palette.border }}>
              <Text numberOfLines={1} style={{ color: palette.ink, ...type(15, { weight: "600" }) }}>{item.itemName || activityPhrase(item.action, item.type)}</Text>
              <Text numberOfLines={1} style={{ marginTop: 2, color: palette.soft, ...type(13) }}>{activityPhrase(item.action, item.type)} · {relativeTime(item.timestamp)}</Text>
            </View>
          ))}
        </SurfaceCard>
      ) : recent.loading ? <Skeleton style={{ height: 96 }} /> : (
        <Text style={{ color: palette.soft, ...type(14) }}>Nothing recorded yet.</Text>
      )}
    </PageScroll>
  </ScreenFrame>
}
