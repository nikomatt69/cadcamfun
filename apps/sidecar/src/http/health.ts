import { kernelJobStats } from "@cadcamfun/ai"
import { Api } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AppConfigService } from "../config.ts"

const check = () => Effect.sync(() => {
  const jobs = kernelJobStats()
  return { status: "ok", timestamp: new Date().toISOString(), jobs: { workers: jobs.workers, running: jobs.running, waiting: jobs.waiting, cached: jobs.cached, closing: jobs.closing } }
})

/** Legacy public probe: `GET /api/health`. */
export const HealthHandlers = HttpApiBuilder.group(Api, "health", (handlers) =>
  Effect.succeed(handlers.handle("check", check)))

/** Native boot contract behind the launch token: `GET /health` and `GET /version`. */
export const SystemHandlers = HttpApiBuilder.group(Api, "system", Effect.fn("system.handlers")(function*(handlers) {
  const config = yield* AppConfigService
  return handlers.handle("ready", check).handle("version", () => Effect.succeed({ version: config.version }))
}))