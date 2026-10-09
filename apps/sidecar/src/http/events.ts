/**
 * Live event channel (spec 13 §6 — the only push channel the phone has). A client opens one SSE
 * stream per project; the sidecar pushes vcs / workflow / AI events as they happen. The
 * companion gateway forwards the response unchanged, so the phone sees the same activity the
 * desktop sees, frame by frame.
 *
 * Access follows the project, not just the token: `projectId` comes from the route and the
 * membership check is the same one the vcs group uses, so a paired phone cannot tail another
 * project's history by guessing an id.
 */
import { Api, CurrentUser, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { LiveEvents } from "../services/live-events.ts"
import { ProjectRepo } from "../repos/project-repo.ts"

export const EventsHandlers = HttpApiBuilder.group(Api, "events", Effect.fn(function*(handlers) {
  const events = yield* LiveEvents
  const projects = yield* ProjectRepo

  return handlers
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
        return yield* events.subscribe({ projectId: params.id })
      })
    )
}))
