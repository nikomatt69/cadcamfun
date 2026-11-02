/** Pure analytics logic for the phone: the same presets, metrics and counters as the desktop dashboard. */

export type AnalyticsPreset = "today" | "7days" | "30days" | "90days" | "year"
export type AnalyticsMetric =
  | "activityCount" | "aiRequests" | "cadDrawings" | "projects" | "components"
  | "toolpaths" | "storageUsage" | "toolpathsGenerated" | "connections" | "programRuns"

export const ANALYTICS_PRESETS: readonly { id: AnalyticsPreset; label: string }[] = [
  { id: "today", label: "Today" }, { id: "7days", label: "7 days" }, { id: "30days", label: "30 days" },
  { id: "90days", label: "90 days" }, { id: "year", label: "Year" },
]

/** Labels and order of the desktop's metric list. */
export const ANALYTICS_METRICS: readonly { id: AnalyticsMetric; label: string }[] = [
  { id: "activityCount", label: "Activity" }, { id: "aiRequests", label: "AI requests" }, { id: "cadDrawings", label: "CAD drawings" },
  { id: "projects", label: "Projects" }, { id: "components", label: "Components" }, { id: "toolpaths", label: "Toolpaths" },
  { id: "storageUsage", label: "Storage" }, { id: "toolpathsGenerated", label: "Toolpaths generated" },
  { id: "connections", label: "Connections" }, { id: "programRuns", label: "Program runs" },
]

export interface AnalyticsRange { readonly startDate: Date; readonly endDate: Date }

/** The range a preset covers, ending at `now`. "Today" starts at local midnight, "year" is one calendar year back. */
export function presetRange(preset: AnalyticsPreset, now: Date = new Date()): AnalyticsRange {
  const start = new Date(now)
  switch (preset) {
    case "today": start.setHours(0, 0, 0, 0); break
    case "7days": start.setDate(now.getDate() - 7); break
    case "30days": start.setDate(now.getDate() - 30); break
    case "90days": start.setDate(now.getDate() - 90); break
    case "year": start.setFullYear(now.getFullYear() - 1); break
  }
  return { startDate: start, endDate: new Date(now) }
}

export interface ChartPoint { readonly date: string; readonly value: number }

/** The requested metric's series out of the server's chart rows (every metric key is present, 0 on empty days). */
export function metricSeries(rows: readonly Record<string, string | number>[], metric: AnalyticsMetric): ChartPoint[] {
  return rows.flatMap((row) => {
    const date = row["date"]
    const value = row[metric]
    return typeof date === "string" && typeof value === "number" && Number.isFinite(value) ? [{ date, value }] : []
  })
}

/** Bar heights as 0..1 of the tallest bar; a flat zero series stays flat rather than dividing by zero. */
export function barHeights(points: readonly ChartPoint[]): number[] {
  const max = points.reduce((best, point) => Math.max(best, point.value), 0)
  return points.map((point) => (max > 0 ? point.value / max : 0))
}

/** At most `limit` points, keeping the first and last and evenly spaced ones between, so 365 days still fit a phone. */
export function downsample<T>(items: readonly T[], limit: number): T[] {
  if (limit < 2 || items.length <= limit) return [...items]
  const out: T[] = []
  for (let index = 0; index < limit; index++) out.push(items[Math.round((index * (items.length - 1)) / (limit - 1))] as T)
  return out
}

/** Storage arrives in megabytes from the desktop's counters; others are plain counts. */
export function metricValue(metric: AnalyticsMetric, value: number): string {
  if (metric === "storageUsage") return value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${Math.round(value)} MB`
  return new Intl.NumberFormat("en").format(Math.round(value))
}

/** A trend as a signed whole percentage ("+12%", "−4%", "0%"). */
export function trendLabel(trend: number): string {
  if (!Number.isFinite(trend) || Math.round(trend) === 0) return "0%"
  const rounded = Math.round(trend)
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`
}

export interface SummaryLike {
  readonly totalAiRequests: number
  readonly totalCadDrawings: number
  readonly totalStorageUsage: number
  readonly totalProjects: number
  readonly totalComponents: number
  readonly totalToolpaths: number
  readonly totalActivityCount?: number | undefined
}

export interface Counter { readonly id: string; readonly label: string; readonly value: string }

/** The overview tiles, in the desktop's order. */
export function summaryCounters(summary: SummaryLike): Counter[] {
  return [
    { id: "projects", label: "Projects", value: metricValue("projects", summary.totalProjects) },
    { id: "components", label: "Components", value: metricValue("components", summary.totalComponents) },
    { id: "toolpaths", label: "Toolpaths", value: metricValue("toolpaths", summary.totalToolpaths) },
    { id: "cadDrawings", label: "CAD drawings", value: metricValue("cadDrawings", summary.totalCadDrawings) },
    { id: "aiRequests", label: "AI requests", value: metricValue("aiRequests", summary.totalAiRequests) },
    { id: "storage", label: "Storage", value: metricValue("storageUsage", summary.totalStorageUsage) },
  ]
}

/** "created drawing" → a sentence-case phrase for one activity row. */
export function activityPhrase(action: string, type: string): string {
  const verb = action.replaceAll("_", " ")
  const noun = type.replaceAll("_", " ")
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} · ${noun}`
}
