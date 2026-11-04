import { Api, CurrentUser } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { LiveEvents } from "../services/live-events.ts"
import { probeProgressReporter } from "../services/probe-progress.ts"
import { Probing } from "../services/probing.ts"

/** Probing, work offsets and inspection reports (spec 73 §3.1): the HTTP face of the `Probing` service. */
export const CamProbingHandlers = HttpApiBuilder.group(Api, "camProbing", Effect.fn(function*(handlers) {
  const probing = yield* Probing
  const events = yield* LiveEvents
  return handlers
    .handle("plan", Effect.fn("http.camProbing.plan")(function*({ payload }) {
      const user = yield* CurrentUser
      return yield* probing.plan.plan(user.id, payload)
    }))
    .handle("emit", Effect.fn("http.camProbing.emit")(function*({ payload }) {
      const user = yield* CurrentUser
      return yield* probing.plan.emit(user.id, payload)
    }))
    .handle("simulate", Effect.fn("http.camProbing.simulate")(function*({ payload }) {
      const user = yield* CurrentUser
      const target = payload.progress
      const report = target === undefined ? undefined : probeProgressReporter(events, target.projectId, target.runId)
      const out = yield* probing.plan.simulate(user.id, payload, report).pipe(
        Effect.onInterrupt(() => Effect.sync(() => report?.("cancelled")))
      )
      report?.("done")
      return out
    }))
    .handle("calibrateRotary", Effect.fn("http.camProbing.calibrateRotary")(function*({ payload }) {
      const user = yield* CurrentUser
      const target = payload.progress
      const report = target === undefined ? undefined : probeProgressReporter(events, target.projectId, target.runId)
      const out = yield* probing.plan.calibrateRotary(user.id, payload, report).pipe(
        Effect.onInterrupt(() => Effect.sync(() => report?.("cancelled")))
      )
      report?.("done")
      return out
    }))
    .handle("workOffsetsGet", Effect.fn("http.camProbing.workOffsetsGet")(function*({ params, query }) {
      const user = yield* CurrentUser
      return yield* probing.workOffsets.get(user.id, params.id, query.setupId)
    }))
    .handle("workOffsetsPut", Effect.fn("http.camProbing.workOffsetsPut")(function*({ params, query, payload }) {
      const user = yield* CurrentUser
      return yield* probing.workOffsets.put(user.id, params.id, { entries: payload.entries, setupId: query.setupId, baseUpdatedAt: payload.baseUpdatedAt })
    }))
    .handle("probeConfigGet", Effect.fn("http.camProbing.probeConfigGet")(function*({ params }) {
      const user = yield* CurrentUser
      return yield* probing.probeConfig.get(user.id, params.id)
    }))
    .handle("probeConfigPut", Effect.fn("http.camProbing.probeConfigPut")(function*({ params, payload }) {
      const user = yield* CurrentUser
      return yield* probing.probeConfig.put(user.id, params.id, payload)
    }))
    .handle("reportsList", Effect.fn("http.camProbing.reportsList")(function*({ params, query }) {
      const user = yield* CurrentUser
      return yield* probing.reports.list(user.id, params.id, query)
    }))
    .handle("reportsGet", Effect.fn("http.camProbing.reportsGet")(function*({ params }) {
      const user = yield* CurrentUser
      return yield* probing.reports.get(user.id, params.id, params.reportId)
    }))
    .handle("reportsRun", Effect.fn("http.camProbing.reportsRun")(function*({ params, payload }) {
      const user = yield* CurrentUser
      const runId = payload.runId
      const report = runId === undefined ? undefined : probeProgressReporter(events, params.id, runId)
      const doc = yield* probing.reports.run(user.id, params.id, payload, report).pipe(
        Effect.onInterrupt(() => Effect.sync(() => report?.("cancelled")))
      )
      report?.("done")
      if (runId !== undefined) {
        const data = doc.data !== null && typeof doc.data === "object" ? doc.data as { verdict?: unknown; checks?: unknown; failed?: unknown; maxDeviationMm?: unknown; updates?: unknown } : {}
        const checks = Array.isArray(data.checks) ? data.checks.length : 0
        yield* events.publish({
          type: "probe.result", projectId: params.id, runId, reportId: doc.id, operationId: payload.operationId, at: new Date().toISOString(),
          verdict: data.verdict === "warn" || data.verdict === "fail" || data.verdict === "missed" || data.verdict === "incomplete" ? data.verdict : "pass",
          checks, failed: typeof data.failed === "number" ? data.failed : 0,
          ...(typeof data.maxDeviationMm === "number" ? { maxDeviationMm: data.maxDeviationMm } : {}),
          offsetsUpdated: Array.isArray(data.updates) && data.updates.length > 0,
          kind: doc.kind === "rotary" ? "rotary" : "part"
        })
      }
      return doc
    }))
    .handle("reportsSave", Effect.fn("http.camProbing.reportsSave")(function*({ params, payload }) {
      const user = yield* CurrentUser
      return yield* probing.reports.save(user.id, params.id, payload)
    }))
    .handle("reportsRemove", Effect.fn("http.camProbing.reportsRemove")(function*({ params }) {
      const user = yield* CurrentUser
      yield* probing.reports.remove(user.id, params.id, params.reportId)
      return { message: "Probe report deleted successfully" }
    }))
}))
