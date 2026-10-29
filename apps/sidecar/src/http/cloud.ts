import { Api, BadRequest, Conflict, CurrentUser, InternalError, NotFound, Unauthorized } from "@cadcamfun/api"
import { DatabaseError } from "@cadcamfun/db"
import { Effect } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { CloudSync } from "../services/cloud-sync.ts"
import { CloudSyncError, safeId } from "../services/cloud-transfer.ts"
import { COMPANION_DEVICE_HEADER } from "../services/companion-gateway.ts"
import { LiveEvents } from "../services/live-events.ts"
import { AppConfigService } from "../config.ts"

const wire = <A, R>(effect: Effect.Effect<A, CloudSyncError | DatabaseError, R>) => effect.pipe(Effect.mapError((error) => {
  if (error instanceof DatabaseError) return new InternalError({ message: "Cloud synchronization storage failed" })
  switch (error.code) {
    case "not-found": return new NotFound({ message: error.message })
    case "unauthorized": return new Unauthorized({ message: error.message })
    case "conflict": case "dirty": case "missing-asset": return new Conflict({ message: error.message })
    case "remote": return new InternalError({ message: error.message })
    default: return new BadRequest({ message: error.message })
  }
}))

export const CloudHandlers = HttpApiBuilder.group(Api, "cloud", Effect.fn(function*(handlers) {
  const cloud = yield* CloudSync
  const events = yield* LiveEvents
  const config = yield* AppConfigService
  const context = Effect.gen(function*() {
    const user = yield* CurrentUser
    const request = yield* HttpServerRequest.HttpServerRequest
    return { user, identity: request.headers["x-identity-token"], device: request.headers[COMPANION_DEVICE_HEADER], actor: { userId: user.id, name: user.name ?? user.email ?? "User", email: user.email ?? "unknown@cadcamfun.local" } }
  })
  const validId = (id: string) => safeId(id) ? Effect.void : Effect.fail(new BadRequest({ message: "Invalid project identifier" }))
  const changed = Effect.fn("CloudHandlers.changed")(function*(id: string, userId: string) {
    yield* events.workspaceChanged(id)
    yield* events.resourcesChanged(userId, null)
  })
  return handlers
    .handle("connection", () => Effect.flatMap(CurrentUser, (user) => wire(cloud.connection(user.id))))
    .handle("setConnection", ({ payload }) => Effect.flatMap(CurrentUser, (user) => wire(cloud.setConnection(user.id, payload))))
    .handle("disconnect", () => Effect.flatMap(CurrentUser, (user) => wire(cloud.disconnect(user.id))))
    .handle("enroll", ({ payload }) => Effect.flatMap(context, ({ user, identity }) => wire(cloud.enroll(user.id, identity, payload))))
    .handle("pair", ({ payload }) => Effect.flatMap(context, ({ user, identity }) => wire(cloud.pair(user.id, identity, payload.name))))
    .handle("projects", () => Effect.flatMap(context, ({ user, identity }) => wire(cloud.projects(user.id, identity))))
    .handle("status", ({ params }) => Effect.gen(function*() {
      yield* validId(params.id)
      const { user } = yield* context
      return yield* wire(cloud.status(params.id, user.id))
    }))
    .handle("publish", ({ params }) => Effect.gen(function*() {
      yield* validId(params.id)
      const { actor, identity } = yield* context
      return yield* wire(cloud.publish(params.id, actor, identity))
    }))
    .handle("fetch", ({ params }) => Effect.gen(function*() {
      yield* validId(params.id)
      const { user, identity } = yield* context
      return yield* wire(cloud.fetch(params.id, user.id, identity))
    }))
    .handle("apply", ({ params, payload }) => Effect.gen(function*() {
      yield* validId(params.id)
      const { user, identity } = yield* context
      const result = yield* wire(cloud.apply(params.id, user.id, identity, payload.expectedHead))
      yield* changed(params.id, user.id)
      return result
    }))
    .handle("clone", ({ params }) => Effect.gen(function*() {
      yield* validId(params.id)
      const { user, identity } = yield* context
      const result = yield* wire(cloud.clone(params.id, user.id, identity))
      yield* changed(params.id, user.id)
      return result
    }))
    .handle("send", ({ params, payload }) => Effect.gen(function*() {
      yield* validId(params.id)
      if ((payload.message?.length ?? 0) > 1000) return yield* new BadRequest({ message: "The commit message must contain at most 1000 characters" })
      const { actor } = yield* context
      return yield* wire(cloud.send(params.id, actor, payload.message))
    }))
    .handle("remoteProjects", () => Effect.flatMap(CurrentUser, (user) => wire(cloud.remoteProjects(user.id))))
    .handle("remoteExport", ({ params }) => Effect.gen(function*() {
      yield* validId(params.id)
      const { user } = yield* context
      return yield* wire(cloud.remoteExport(params.id, user.id))
    }))
    .handle("remoteImport", ({ params, payload }) => Effect.gen(function*() {
      yield* validId(params.id)
      const { user } = yield* context
      const result = yield* wire(cloud.remoteImport(params.id, user.id, payload.transfer, payload.expectedHead))
      yield* changed(params.id, user.id)
      return result
    }))
    .handle("remoteReceipt", ({ params, payload }) => Effect.gen(function*() {
      yield* validId(params.id)
      const { user, device } = yield* context
      if (config.runtime === "server" && !device) return yield* new Unauthorized({ message: "A delivery receipt requires an authenticated device" })
      return yield* wire(cloud.receipt(params.id, user.id, device ?? payload.deviceId, payload.head, payload.state))
    }))
}))
