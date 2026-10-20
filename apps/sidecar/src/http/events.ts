/**
 * Live event channel (spec 13 §6): one host SSE stream shared by the screens, or a project-specific subscription.
 * The sidecar pushes saved workspace, resource, VCS, workflow and AI events as they happen. The
 * companion gateway forwards the response unchanged, so the phone sees the same activity the
 * desktop sees, frame by frame.
 *
 * Access follows the project, not just the token: `projectId` comes from the route and the
 * membership check is the same one the vcs group uses, so a paired phone cannot tail another
 * project's history by guessing an id.
 */
import { Api, CurrentUser, InternalError, NotFound } from "@cadcamfun/api"
import { Effect, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { LiveEvents } from "../services/live-events.ts"
import { ProjectRepo } from "../repos/project-repo.ts"

export const EventsHandlers = HttpApiBuilder.group(Api, "events", Effect.fn(function*(handlers) {
  const events = yield* LiveEvents
  const projects = yield* ProjectRepo

  return handlers
    .handle("subscribeAll", () => Effect.gen(function*() {
      const user = yield* CurrentUser
      const source = yield* events.subscribe({})
      // Recheck membership at delivery time: revoking project access also revokes future frames.
      const visible = source.pipe(
        Stream.filterEffect((event) => event.type === "catalogue.updated" ? Effect.succeed(true)
          : event.type === "resources.changed" ? Effect.succeed(event.userId === user.id)
          : projects.find(user.id, event.projectId).pipe(
          Effect.map((project) => project !== undefined),
          Effect.catchTag("DatabaseError", () => Effect.succeed(false)),
        )),
      )
      return Stream.concat(Stream.succeed({ type: "server.connected" as const, at: new Date().toISOString() }), visible)
    }))
    .handle("subscribe", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        // The subscription is filtered by project server-side, so this check only has to prove
        // membership; it is the same guard the read routes use.
        const found = yield* projects.find(user.id, params.id).pipe(
          Effect.catchTag("DatabaseError", () => Effect.fail(new InternalError({ message: "Failed to load project" }))),
        )
        if (!found) return yield* new NotFound({ message: "Project not found or access denied" })
        // The subscription is scoped to the request, so it lives exactly as long as the connection;
        // the bus is in-process and the gateway forwards the chunked response as is.
        const source = yield* events.subscribe({ projectId: params.id })
        return Stream.concat(Stream.succeed({ type: "server.connected" as const, at: new Date().toISOString() }), source)
      })
    )
}))
