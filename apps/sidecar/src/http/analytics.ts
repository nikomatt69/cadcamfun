import { AnalyticsFailure, AnalyticsKeyedBadRequest, AnalyticsKeyedForbidden, Api, BadRequest, CurrentUser, InternalError, KeyedInternal } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { cpus, freemem, loadavg, totalmem } from "node:os"
import { AppConfigService } from "../config.ts"
import { AnalyticsRepo } from "../repos/analytics-repo.ts"

const ITEM_TYPES = ["project", "drawing", "component", "material", "tool", "toolpath", "organization", "machine", "login", "export", "import", "page_view"]
const ACTIONS = ["created", "updated", "deleted", "viewed", "exported", "imported", "shared", "login", "logout", "generate_gcode", "analyze_gcode", "run_simulation"]

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Same estimates as the legacy route; the desktop sidecar has no external monitoring to read. */
const systemMetrics = () => {
  let idle = 0
  let total = 0
  for (const cpu of cpus()) {
    for (const t of Object.values(cpu.times)) total += t
    idle += cpu.times.idle
  }
  const cpuUsage = total > 0 ? Math.round(100 - (idle / total) * 100) : 45
  const memoryUsage = Math.round(((totalmem() - freemem()) / totalmem()) * 100)
  const heapMb = process.memoryUsage().heapUsed / 1024 / 1024
  const load = loadavg()[0] ?? 0
  return {
    cpuUsage: clamp(cpuUsage || 45, 1, 100),
    memoryUsage: clamp(memoryUsage, 1, 100),
    storageUsed: Math.round(65 + heapMb / 10),
    networkLatency: Math.round(15 + Math.random() * 10),
    activeConnections: Math.round(100 + Math.random() * 50),
    cacheHitRatio: Math.round(85 + Math.random() * 14),
    errorRate: Math.round((load / 4) * 100) / 100,
    responseTime: Math.round(50 + load * 10)
  }
}

const LOCAL_ADMIN = "local@cadcamfun.local"
const asArray = (v: string | ReadonlyArray<string> | undefined): ReadonlyArray<string> => (v === undefined ? [] : typeof v === "string" ? [v] : v)
const parseDate = (v: string | undefined) => (v ? new Date(v) : undefined)
const METRICS = ["activityCount", "toolpathsGenerated", "connections", "programRuns", "aiRequests", "cadDrawings", "storageUsage", "projects", "components", "toolpaths"]
const keyedFail = (log: string, error: string) => (e: unknown) =>
  Effect.logError(log, e).pipe(Effect.andThen(Effect.fail(new KeyedInternal({ error }))))
const utcDay = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
/** Same stepping as the legacy `generateDateRange`: day, +7 days, or month starts, from the start day to the end day. */
const dateRange = (start: Date, end: Date, groupBy: string): Array<Date> => {
  const out: Array<Date> = []
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  while (current <= last) {
    out.push(new Date(current))
    if (groupBy === "week") current.setUTCDate(current.getUTCDate() + 7)
    else if (groupBy === "month") { current.setUTCMonth(current.getUTCMonth() + 1); current.setUTCDate(1) }
    else current.setUTCDate(current.getUTCDate() + 1)
  }
  return out
}

export const AnalyticsHandlers = HttpApiBuilder.group(Api, "analytics", Effect.fn(function*(handlers) {
  const repo = yield* AnalyticsRepo
  const config = yield* AppConfigService
  const adminEmails = [config.adminEmail ?? LOCAL_ADMIN]
  const isAdminOf = (email: string | null) => email !== null && adminEmails.includes(email)
  return handlers
    .handle("systemMetrics", () =>
      Effect.try({ try: systemMetrics, catch: (e) => e }).pipe(
        Effect.catch((e) => Effect.logError("Error fetching system metrics", e).pipe(
          Effect.andThen(Effect.fail(new KeyedInternal({ error: "Internal server error" })))))))
    .handle("index", ({ query }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const isAdmin = isAdminOf(yield* repo.userEmail(user.id))
      const itemType = asArray(query.itemType); const action = asArray(query.action); const userFilter = asArray(query.userFilter)
      const userIds = userFilter.length && isAdmin ? userFilter : isAdmin ? undefined : [user.id]
      const startDate = parseDate(query.startDate); const endDate = parseDate(query.endDate)
      const filters = {
        ...(startDate ? { startDate: startDate.toISOString() } : {}), ...(endDate ? { endDate: endDate.toISOString() } : {}), groupBy: query.groupBy ?? "day",
        ...(itemType.length ? { itemType } : {}), ...(action.length ? { action } : {}), ...(userIds ? { userId: userIds } : {})
      }
      const data = yield* repo.statistics({ startDate, endDate, userIds, itemType, action })
      return { success: true as const, data, isAdmin, filters: JSON.parse(JSON.stringify(filters)) as unknown }
    }).pipe(Effect.catchTag("DatabaseError", (e) => Effect.logError("Analytics API error", e).pipe(
      Effect.andThen(Effect.fail(new AnalyticsFailure({ success: false, message: "Internal server error" })))))))
    .handle("dashboardData", () => Effect.gen(function*() { return yield* repo.dashboard((yield* CurrentUser).id) })
      .pipe(Effect.catchTag("DatabaseError", keyedFail("Error fetching dashboard analytics", "Internal server error"))))
    .handle("logView", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      yield* repo.logActivity({ userId: user.id, itemId: payload.path ?? "", itemType: "page_view", action: "viewed", details: { path: payload.path, query: payload.query } })
      return { success: true as const }
    }).pipe(Effect.catchTag("DatabaseError", (e) => Effect.logError("Failed to log page view", e).pipe(
      Effect.andThen(Effect.fail(new InternalError({ message: "Failed to log page view" })))))))
    .handle("recentActivity", ({ query }) => Effect.gen(function*() {
      const limit = Number.parseInt(query.limit ?? "", 10) || 10
      return (yield* repo.recent((yield* CurrentUser).id, limit)) as never
    }).pipe(Effect.catchTag("DatabaseError", keyedFail("Error fetching recent activity", "Internal server error"))))
    .handle("userHistory", ({ query }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const itemType = asArray(query.itemType); const action = asArray(query.action)
      return (yield* repo.history(user.id, Number.parseInt(query.limit ?? "50", 10), Number.parseInt(query.offset ?? "0", 10),
        { startDate: parseDate(query.startDate), endDate: parseDate(query.endDate), itemType, action })) as never
    }).pipe(Effect.catchTag("DatabaseError", (e) => Effect.logError("Failed to get user activity history", e).pipe(
      Effect.andThen(Effect.fail(new InternalError({ message: "Failed to get user activity history" })))))))
    .handle("userMetrics", ({ query }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const groupBy = query.groupBy ?? "day"
      const metric = query.metric ?? "activityCount"
      if (!["day", "week", "month"].includes(groupBy)) return yield* new AnalyticsKeyedBadRequest({ error: "Invalid groupBy parameter. Use day, week, or month." })
      if (!METRICS.includes(metric)) return yield* new AnalyticsKeyedBadRequest({ error: `Invalid metric parameter. Use one of: ${METRICS.join(", ")}` })
      let start = query.startDate ? new Date(query.startDate) : new Date()
      if (Number.isNaN(start.getTime())) { start = new Date(); start.setDate(start.getDate() - 30) }
      else if (!query.startDate) start.setDate(start.getDate() - 30)
      let end = query.endDate ? new Date(query.endDate) : new Date()
      if (Number.isNaN(end.getTime())) end = new Date()
      if (start > end) return yield* new AnalyticsKeyedBadRequest({ error: "startDate cannot be after endDate." })
      const result = yield* repo.metrics(user.id, { metric, groupBy, start, end, itemType: [], action: [] })
      const byDate = new Map(result.series.map((r) => [r.date, r.value]))
      const chartData = dateRange(start, end, groupBy).map((d) => {
        const date = utcDay(d)
        const value = byDate.get(date)
        // Every metric key is present (0 when the day had no data), the requested one carries the value.
        const point: Record<string, string | number> = { date }
        for (const key of METRICS) point[key] = 0
        if (value !== undefined) point[metric] = value
        return point
      })
      const { storageBytes: _bytes, ...summary } = result.summary
      return { summary: summary as never, chartData }
    }).pipe(Effect.catchTag("DatabaseError", (e) => Effect.logError("Error fetching user metrics", e).pipe(
      Effect.andThen(Effect.fail(new KeyedInternal({ error: e.message })))))))
    .handle("userUsage", ({ query }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      // Usage entries lived in an in-memory service that nothing on the server ever filled; the empty answers are the legacy ones.
      if (query.userId) return { summary: null, breakdown: null }
      if (!isAdminOf(yield* repo.userEmail(user.id))) return yield* new AnalyticsKeyedForbidden({ error: "Admin access required" })
      return {
        users: [],
        systemStats: { totalUsers: 0, totalTokens: 0, totalCost: 0, totalRequests: 0, averageCostPerUser: 0, topSpendingUsers: [], modelDistribution: {} }
      }
    }).pipe(Effect.catchTag("DatabaseError", keyedFail("Error in user-usage API", "Internal server error"))))
    .handle("clearUserUsage", () => Effect.succeed({ message: "Data cleared successfully" }))
    .handle("track", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const { itemId, itemType, action, details } = payload
      if (!itemId || !itemType || !action) {
        return yield* new BadRequest({ message: "Missing required fields: itemId, itemType, and action are required" })
      }
      if (!ITEM_TYPES.includes(itemType)) {
        return yield* new BadRequest({ message: `Invalid itemType. Must be one of: ${ITEM_TYPES.join(", ")}` })
      }
      if (!ACTIONS.includes(action)) {
        return yield* new BadRequest({ message: `Invalid action. Must be one of: ${ACTIONS.join(", ")}` })
      }
      yield* repo.logActivity({ userId: user.id, itemId, itemType, action, details })
      return { success: true as const }
    }).pipe(Effect.catchTag("DatabaseError", (e) =>
      Effect.logError("Failed to track activity", e).pipe(
        Effect.andThen(Effect.fail(new InternalError({ message: "Failed to track activity" })))))))
}))
