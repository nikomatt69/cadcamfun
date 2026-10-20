import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { Unauthorized, NotFound, InternalError } from "../errors.ts"

/**
 * Live cross-cutting event stream (vcs, pull requests, workflow runs, AI sessions). One channel
 * per project; the sidecar serves it as SSE and the companion gateway forwards it unchanged.
 *
 * The schema mirrors `apps/sidecar/src/services/live-events.ts` so a typed client and the
 * mobile SSE parser can both consume it.
 */
export const PrOpened = Schema.Struct({
  type: Schema.Literal("pr.opened"),
  at: Schema.String,
  projectId: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  authorKind: Schema.Literals(["user", "ai"]),
  head: Schema.String,
  base: Schema.String
})

export const PrMerged = Schema.Struct({
  type: Schema.Literal("pr.merged"),
  at: Schema.String,
  projectId: Schema.String,
  number: Schema.Number,
  title: Schema.String
})

export const PrClosed = Schema.Struct({
  type: Schema.Literal("pr.closed"),
  at: Schema.String,
  projectId: Schema.String,
  number: Schema.Number
})

export const PrReviewed = Schema.Struct({
  type: Schema.Literal("pr.reviewed"),
  at: Schema.String,
  projectId: Schema.String,
  number: Schema.Number,
  verdict: Schema.Literals(["comment", "approve", "request-changes"])
})

export const Commit = Schema.Struct({
  type: Schema.Literal("commit"),
  at: Schema.String,
  projectId: Schema.String,
  oid: Schema.String,
  branch: Schema.String,
  authorKind: Schema.Literals(["user", "ai"]),
  message: Schema.String
})

export const WorkflowStarted = Schema.Struct({
  type: Schema.Literal("workflow.started"),
  at: Schema.String,
  projectId: Schema.String,
  runId: Schema.String,
  workflow: Schema.String,
  event: Schema.Literals(["push", "pull-request", "manual"])
})

export const WorkflowFinished = Schema.Struct({
  type: Schema.Literal("workflow.finished"),
  at: Schema.String,
  projectId: Schema.String,
  runId: Schema.String,
  workflow: Schema.String,
  status: Schema.Literals(["success", "failure", "cancelled"])
})

export const AiSession = Schema.Struct({
  type: Schema.Literal("ai.session"),
  at: Schema.String,
  projectId: Schema.String,
  sessionId: Schema.String,
  phase: Schema.Literals(["started", "finished", "aborted"])
})

/** A saved working-copy change, including changes that have not been committed. */
export const WorkspaceChanged = Schema.Struct({
  type: Schema.Literal("workspace.changed"),
  at: Schema.String,
  projectId: Schema.String
})
export const ServerConnected = Schema.Struct({ type: Schema.Literal("server.connected"), at: Schema.String })
export const ResourcesChanged = Schema.Struct({ type: Schema.Literal("resources.changed"), userId: Schema.String, at: Schema.String })
export const CatalogueUpdated = Schema.Struct({ type: Schema.Literal("catalogue.updated"), at: Schema.String })

export const LiveEvent = Schema.Union([
  PrOpened, PrMerged, PrClosed, PrReviewed, Commit,
  WorkflowStarted, WorkflowFinished, AiSession, WorkspaceChanged, ServerConnected, ResourcesChanged, CatalogueUpdated
] as const)
export type LiveEvent = typeof LiveEvent.Type

const project = { id: Schema.String }

export class EventsGroup extends HttpApiGroup.make("events").add(
  HttpApiEndpoint.get("subscribe", "/api/projects/:id/events", {
    params: project,
    success: HttpApiSchema.StreamSse({ data: LiveEvent }),
    // The route is authenticated by the group middleware; these are the errors the handler itself
    // raises when the project is not visible to the caller or the bus cannot be read.
    error: [Unauthorized, NotFound, InternalError]
  })
).add(
  HttpApiEndpoint.get("subscribeAll", "/api/events", {
    success: HttpApiSchema.StreamSse({ data: LiveEvent }),
    error: [Unauthorized, InternalError]
  })
) {}
