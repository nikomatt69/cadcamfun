import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, KeyedInternal, MethodNotAllowed } from "../errors.ts"

export const SystemMetricsResponse = Schema.Struct({
  cpuUsage: Schema.Number, memoryUsage: Schema.Number, storageUsed: Schema.Number,
  networkLatency: Schema.Number, activeConnections: Schema.Number, cacheHitRatio: Schema.Number,
  errorRate: Schema.Number, responseTime: Schema.Number
})
export const ActivityItemType = Schema.Literals([
  "project", "drawing", "component", "material", "tool", "toolpath",
  "organization", "machine", "login", "export", "import", "page_view"
])
export const ActivityAction = Schema.Literals([
  "created", "updated", "deleted", "viewed", "exported", "imported", "shared",
  "login", "logout", "generate_gcode", "analyze_gcode", "run_simulation"
])
// Fields stay loose so the handler can answer with the legacy validation messages.
export const TrackActivityRequest = Schema.Struct({
  itemId: Schema.optional(Schema.String), itemType: Schema.optional(Schema.String), action: Schema.optional(Schema.String),
  // The tracking service stores arbitrary event-specific JSON details unchanged.
  details: Schema.optional(Schema.Unknown)
})
export const TrackActivityResponse = Schema.Struct({ success: Schema.Literal(true) })
const opt = Schema.optional
const counts = (key: string) => Schema.Array(Schema.Struct({ [key]: Schema.String, _count: Schema.Number }))
/** `{ success: false, message }` failure of `GET /api/analytics`. */
export class AnalyticsFailure extends Schema.TaggedError<AnalyticsFailure>()("AnalyticsFailure", {
  success: Schema.Literal(false), message: Schema.String
}, { httpApiStatus: 500 }) {}
/** `{ error }` bodies of the dashboard / recent-activity / metrics routes. */
export class AnalyticsKeyedBadRequest extends Schema.TaggedError<AnalyticsKeyedBadRequest>()("AnalyticsKeyedBadRequest", { error: Schema.String }, { httpApiStatus: 400 }) {}
export class AnalyticsKeyedForbidden extends Schema.TaggedError<AnalyticsKeyedForbidden>()("AnalyticsKeyedForbidden", { error: Schema.String }, { httpApiStatus: 403 }) {}
export const AnalyticsIndexQuery = {
  startDate: opt(Schema.String), endDate: opt(Schema.String), itemType: opt(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  action: opt(Schema.Union([Schema.String, Schema.Array(Schema.String)])), groupBy: opt(Schema.String), userFilter: opt(Schema.Union([Schema.String, Schema.Array(Schema.String)]))
}
export const AnalyticsIndexReply = Schema.Struct({
  success: Schema.Literal(true),
  data: Schema.Struct({ countByType: counts("itemType"), countByAction: counts("action") }),
  isAdmin: Schema.Boolean, filters: Schema.Unknown
})
export const DashboardData = Schema.Struct({
  components: Schema.Struct({ total: Schema.Number, trend: Schema.Number, recentActivity: Schema.Number }),
  projects: Schema.Struct({ total: Schema.Number, trend: Schema.Number, activeProjects: Schema.Number }),
  tools: Schema.Struct({ total: Schema.Number, trend: Schema.Number, mostUsed: Schema.String }),
  materials: Schema.Struct({ total: Schema.Number, trend: Schema.Number, lowStock: Schema.Number })
})
export const LogViewBody = Schema.Struct({ path: opt(Schema.String), query: opt(Schema.Unknown) })
export const RecentActivityItem = Schema.Struct({
  id: Schema.String, type: Schema.String, action: Schema.String, itemName: Schema.String,
  timestamp: Schema.String, userId: Schema.String, userName: Schema.String
})
export const UserHistoryReply = Schema.Struct({ logs: Schema.Array(Schema.Unknown), total: Schema.Number })
export const UserMetricsReply = Schema.Struct({
  summary: Schema.Struct({
    totalAiRequests: Schema.Number, totalCadDrawings: Schema.Number, totalStorageUsage: Schema.Number, totalProjects: Schema.Number,
    totalComponents: Schema.Number, totalToolpaths: Schema.Number, totalActivityCount: opt(Schema.Number)
  }),
  chartData: Schema.Array(Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number])))
})
export const UserUsageReply = Schema.Struct({
  summary: opt(Schema.Unknown), breakdown: opt(Schema.Unknown), users: opt(Schema.Array(Schema.Unknown)), systemStats: opt(Schema.Unknown)
})
export class AnalyticsGroup extends HttpApiGroup.make("analytics")
  .add(
    HttpApiEndpoint.get("systemMetrics", "/api/analytics/system-metrics", { success: SystemMetricsResponse, error: KeyedInternal }),
    HttpApiEndpoint.get("index", "/api/analytics", { query: AnalyticsIndexQuery, success: AnalyticsIndexReply, error: AnalyticsFailure }),
    HttpApiEndpoint.get("dashboardData", "/api/analytics/dashboard-data", { success: DashboardData, error: KeyedInternal }),
    HttpApiEndpoint.post("logView", "/api/analytics/log-view", { payload: LogViewBody, success: TrackActivityResponse, error: InternalError }),
    HttpApiEndpoint.get("recentActivity", "/api/analytics/recent-activity", { query: { limit: opt(Schema.String) }, success: Schema.Array(RecentActivityItem), error: KeyedInternal }),
    HttpApiEndpoint.get("userHistory", "/api/analytics/user-history", {
      query: { limit: opt(Schema.String), offset: opt(Schema.String), itemType: opt(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
        action: opt(Schema.Union([Schema.String, Schema.Array(Schema.String)])), startDate: opt(Schema.String), endDate: opt(Schema.String) },
      success: UserHistoryReply, error: InternalError
    }),
    HttpApiEndpoint.get("userMetrics", "/api/analytics/user-metrics", {
      query: { startDate: opt(Schema.String), endDate: opt(Schema.String), groupBy: opt(Schema.String), metric: opt(Schema.String) },
      success: UserMetricsReply, error: [AnalyticsKeyedBadRequest, KeyedInternal]
    }),
    HttpApiEndpoint.get("userUsage", "/api/analytics/user-usage", {
      query: { userId: opt(Schema.String), startDate: opt(Schema.String), endDate: opt(Schema.String), period: opt(Schema.String) },
      success: UserUsageReply, error: [AnalyticsKeyedForbidden, KeyedInternal]
    }),
    HttpApiEndpoint.delete("clearUserUsage", "/api/analytics/user-usage", { success: Schema.Struct({ message: Schema.String }), error: KeyedInternal }),
    HttpApiEndpoint.post("track", "/api/analytics/track", {
      payload: TrackActivityRequest, success: TrackActivityResponse, error: [BadRequest, InternalError]
    })
  )
{}
