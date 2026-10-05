import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, InternalError, KeyedInternal } from "../errors.ts"

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
export class AnalyticsGroup extends HttpApiGroup.make("analytics")
  .add(
    HttpApiEndpoint.get("systemMetrics", "/api/analytics/system-metrics", { success: SystemMetricsResponse, error: KeyedInternal }),
    HttpApiEndpoint.post("track", "/api/analytics/track", {
      payload: TrackActivityRequest, success: TrackActivityResponse, error: [BadRequest, InternalError]
    })
  )
{}
