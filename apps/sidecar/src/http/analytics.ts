import { Api, BadRequest, CurrentUser, InternalError, KeyedInternal } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { cpus, freemem, loadavg, totalmem } from "node:os"
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

export const AnalyticsHandlers = HttpApiBuilder.group(Api, "analytics", Effect.fn(function*(handlers) {
  const repo = yield* AnalyticsRepo
  return handlers
    .handle("systemMetrics", () =>
      Effect.try({ try: systemMetrics, catch: (e) => e }).pipe(
        Effect.catch((e) => Effect.logError("Error fetching system metrics", e).pipe(
          Effect.andThen(Effect.fail(new KeyedInternal({ error: "Internal server error" })))))))
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
