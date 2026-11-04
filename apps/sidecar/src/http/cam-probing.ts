import { Api, CurrentUser } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Probing } from "../services/probing.ts"

/** Probing, work offsets and inspection reports (spec 73 §3.1): the HTTP face of the `Probing` service. */
export const CamProbingHandlers = HttpApiBuilder.group(Api, "camProbing", Effect.fn(function*(handlers) {
  const probing = yield* Probing
  return handlers
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
