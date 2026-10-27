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
 * The events are defined once, as the `PublishedLiveEvent` schema of `packages/api/src/groups/events.ts`: the bus carries
 * exactly the type the SSE contract decodes, so a publisher cannot send a frame a client has no schema for.
 */
import type { PublishedLiveEvent } from "@cadcamfun/api"
import { Context, Effect, Layer, PubSub, Scope, Stream } from "effect"

/** An event on the bus: the type of the API's `PublishedLiveEvent` schema. */
export type LiveEvent = PublishedLiveEvent

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
  /** `organizationId` fans the frame out to every member of that organization, not just the actor. */
  resourcesChanged(userId: string, organizationId?: string | null): Effect.Effect<void>
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
      const resourcesChanged = (userId: string, organizationId?: string | null) =>
        publish({ type: "resources.changed", userId, ...(organizationId ? { organizationId } : {}), at: new Date().toISOString() })
      return LiveEvents.of({ publish, workspaceChanged, resourcesChanged, subscribe })
    })
  )
}

/**
 * Wraps a repo's mutators (first argument = the acting user id) so each success announces
 * `resources.changed` to that user's devices after the commit. For repos with many writers, so
 * no mutation can be added later without syncing: list it here or it stays silent on purpose.
 */
export const announcingWrites = <S extends object>(
  events: { readonly resourcesChanged: (userId: string, organizationId?: string | null) => Effect.Effect<void> },
  service: S,
  mutators: ReadonlyArray<keyof S>
): S => {
  const wrapped = { ...service } as Record<PropertyKey, unknown>
  for (const name of mutators) {
    const original = service[name] as unknown as (userId: string, ...rest: ReadonlyArray<unknown>) => Effect.Effect<unknown, unknown, unknown>
    wrapped[name] = (userId: string, ...rest: ReadonlyArray<unknown>) =>
      Effect.tap(original(userId, ...rest), (result) => {
        // A returned row that names an organization fans the frame out to its members.
        const organizationId = typeof result === "object" && result !== null ? (result as { organizationId?: unknown }).organizationId : undefined
        return events.resourcesChanged(userId, typeof organizationId === "string" ? organizationId : undefined)
      })
  }
  return wrapped as S
}
