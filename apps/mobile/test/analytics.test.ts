import { describe, expect, test } from "bun:test"
import { barHeights, downsample, metricSeries, metricValue, presetRange, summaryCounters, trendLabel, activityPhrase } from "../lib/analytics"
import { CompanionClient, type Transport } from "../lib/client"

describe("mobile analytics", () => {
  test("presets end now; today starts at midnight, a year is one calendar year", () => {
    const now = new Date(2026, 10, 2, 15, 30)
    expect(presetRange("today", now).startDate.getHours()).toBe(0)
    expect(presetRange("7days", now).startDate.getDate()).toBe(26)
    expect(presetRange("year", now).startDate.getFullYear()).toBe(2025)
    expect(presetRange("30days", now).endDate.getTime()).toBe(now.getTime())
  })

  test("the chart reads only the requested metric and keeps zero days", () => {
    const rows: Record<string, string | number>[] = [{ date: "2026-11-01", aiRequests: 0, projects: 2 }, { date: "2026-11-02", aiRequests: 4, projects: 0 }, { date: "bad", aiRequests: "x" }]
    expect(metricSeries(rows, "aiRequests")).toEqual([{ date: "2026-11-01", value: 0 }, { date: "2026-11-02", value: 4 }])
    expect(barHeights(metricSeries(rows, "aiRequests"))).toEqual([0, 1])
    expect(barHeights([{ date: "a", value: 0 }])).toEqual([0])
  })

  test("downsample keeps the ends and never exceeds the limit", () => {
    const days = Array.from({ length: 365 }, (_, i) => i)
    const sampled = downsample(days, 30)
    expect(sampled).toHaveLength(30)
    expect(sampled[0]).toBe(0)
    expect(sampled.at(-1)).toBe(364)
    expect(downsample([1, 2, 3], 30)).toEqual([1, 2, 3])
  })

  test("values and trends read like the desktop", () => {
    expect(metricValue("storageUsage", 2048)).toBe("2.0 GB")
    expect(metricValue("storageUsage", 12.4)).toBe("12 MB")
    expect(metricValue("projects", 1234)).toBe("1,234")
    expect([trendLabel(12.4), trendLabel(-3.6), trendLabel(0.2), trendLabel(Number.NaN)]).toEqual(["+12%", "−4%", "0%", "0%"])
    expect(summaryCounters({ totalAiRequests: 3, totalCadDrawings: 2, totalStorageUsage: 5, totalProjects: 1, totalComponents: 4, totalToolpaths: 6 }).map((c) => c.value)).toEqual(["1", "4", "6", "2", "3", "5 MB"])
    expect(activityPhrase("generate_gcode", "toolpath")).toBe("Generate gcode · toolpath")
  })

  test("the client asks the user-scoped analytics routes with encoded dates", async () => {
    const calls: { path: string; method: string }[] = []
    const transport: Transport = { request: async (path, method) => { calls.push({ path, method }); return { status: 200, body: "{}" } }, async *stream() {} }
    const client = new CompanionClient(transport)
    const range = { startDate: new Date("2026-10-01T00:00:00Z"), endDate: new Date("2026-11-01T00:00:00Z") }
    await client.analyticsDashboard()
    await client.analyticsMetrics(range, "aiRequests", "day")
    await client.recentActivity(5)
    await client.analyticsHistory(10, 20)
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/analytics/dashboard-data",
      "GET /api/analytics/user-metrics?startDate=2026-10-01T00%3A00%3A00.000Z&endDate=2026-11-01T00%3A00%3A00.000Z&groupBy=day&metric=aiRequests",
      "GET /api/analytics/recent-activity?limit=5",
      "GET /api/analytics/user-history?limit=10&offset=20",
    ])
  })
})
