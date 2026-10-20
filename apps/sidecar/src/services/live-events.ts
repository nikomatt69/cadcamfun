/**
 * The cross-cutting live event bus. VCS handlers publish here; SSE clients (the desktop shell and
 * a paired phone) subscribe to a scoped stream. The bus is an in-process `PubSub` with a small
 * replay buffer, so a client that connects a moment late still sees the last few events instead
 * of starting blind.
 *
 * Why a bus and not a database poller: the phone cares about *fresh* activity (a PR that just
 * opened, a workflow run that just failed), and the desktop needs the same stream to update its
 * shell badge. Persisting the user-visible subset is a separate problem — that is what the
 * `Notification` table does; this bus is the delivery channel, not the source of truth.
 *
 * The schema of these events is mirrored in `packages/api/src/groups/events.ts`; the two must
 * stay in step or the SSE client loses its types.
 */
import { Context, Effect, Layer, PubSub, Scope, Stream } from "effect"

export type LiveEvent =
  | { readonly type: "pr.opened"; readonly projectId: string; readonly number: number; readonly title: string; readonly authorKind: "user" | "ai"; readonly head: string; readonly base: string; readonly at: string }
  | { readonly type: "pr.merged"; readonly projectId: string; readonly number: number; readonly title: string; readonly at: string }
  | { readonly type: "pr.closed"; readonly projectId: string; readonly number: number; readonly at: string }
  | { readonly type: "pr.reviewed"; readonly projectId: string; readonly number: number; readonly verdict: "comment" | "approve" | "request-changes"; readonly at: string }
  | { readonly type: "commit"; readonly projectId: string; readonly oid: string; readonly branch: string; readonly authorKind: "user" | "ai"; readonly message: string; readonly at: string }
  | { readonly type: "workflow.started"; readonly projectId: string; readonly runId: string; readonly workflow: string; readonly event: "push" | "pull-request" | "manual"; readonly at: string }
  | { readonly type: "workflow.finished"; readonly projectId: string; readonly runId: string; readonly workflow: string; readonly status: "success" | "failure" | "cancelled"; readonly at: string }
  | { readonly type: "ai.session"; readonly projectId: string; readonly sessionId: string; readonly phase: "started" | "finished" | "aborted"; readonly at: string }
  | { readonly type: "workspace.changed"; readonly projectId: string; readonly at: string }
  | { readonly type: "resources.changed"; readonly userId: string; readonly at: string }
  | { readonly type: "catalogue.updated"; readonly at: string }

/** How many past events a fresh subscriber is caught up with before it starts receiving live ones. */
export const LIVE_EVENT_REPLAY = 20

export interface LiveEventFilter {
  readonly projectId?: string
  readonly types?: ReadonlyArray<LiveEvent["type"]>
}

export const liveEventMatches = (event: LiveEvent, filter: LiveEventFilter): boolean =>
  (filter.projectId === undefined || "projectId" in event && event.projectId === filter.projectId) &&
  (filter.types === undefined || filter.types.includes(event.type))

export class LiveEvents extends Context.Service<LiveEvents, {
  publish(event: LiveEvent): Effect.Effect<void>
  workspaceChanged(projectId: string): Effect.Effect<void>
  resourcesChanged(userId: string): Effect.Effect<void>
  subscribe(filter: LiveEventFilter): Effect.Effect<Stream.Stream<LiveEvent>, never, Scope.Scope>
}>()("cadcamfun/LiveEvents") {
  static readonly layer: Layer.Layer<LiveEvents> = Layer.effect(
    LiveEvents,
    Effect.gen(function*() {
      // Unbounded delivery with a bounded replay buffer: a slow SSE client must not block a
      // commit, but a client that just connected should not miss the PR that triggered it.
      const bus = yield* PubSub.unbounded<LiveEvent>({ replay: LIVE_EVENT_REPLAY })
      const publish = (event: LiveEvent) => PubSub.publish(bus, event)
      // The subscription lives as long as the caller's scope, i.e. as long as the SSE connection.
      const subscribe = (filter: LiveEventFilter): Effect.Effect<Stream.Stream<LiveEvent>, never, Scope.Scope> =>
        Effect.map(
          PubSub.subscribe(bus),
          (subscription) => Stream.fromSubscription(subscription).pipe(Stream.filter((e) => liveEventMatches(e, filter))),
        )
      const workspaceChanged = (projectId: string) => publish({ type: "workspace.changed", projectId, at: new Date().toISOString() })
      const resourcesChanged = (userId: string) => publish({ type: "resources.changed", userId, at: new Date().toISOString() })
      return LiveEvents.of({ publish, workspaceChanged, resourcesChanged, subscribe })
    })
  )
}
