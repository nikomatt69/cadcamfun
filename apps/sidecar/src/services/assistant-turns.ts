/**
 * Assistant turns that outlive the request that started them (spec 13 §5, the nikcli mobile architecture).
 *
 * `start` runs a chat turn on a detached fiber and answers as soon as the host session exists; `follow` is the
 * per-session SSE stream a phone keeps open. Every event goes into a bounded per-session journal with a strictly
 * increasing sequence number, so a client that reconnects with `after` gets exactly what it missed, and one the
 * journal no longer covers is told to re-read the session state instead of resuming blind. The turn itself never
 * depends on a connection: a suspended phone, a Wi-Fi hand-over or a killed app cannot stop or replay it.
 */
import type { AiEvent } from "@cadcamfun/ai"
import { BadRequest, type SessionStreamFrame } from "@cadcamfun/api"
import { Context, Deferred, Effect, Layer, Option, PubSub, Scope, Stream } from "effect"

/** Events kept per session: a long tool-heavy turn fits, a forgotten session does not grow forever. */
export const JOURNAL_LIMIT = 4_000
/** Sessions whose journal is kept; the least recently active one is dropped first. */
export const JOURNAL_SESSIONS = 64
export const SESSION_HEARTBEAT_MS = 15_000
/** How long `start` waits for the host to open the session before giving up on answering (the turn keeps running). */
export const START_TIMEOUT_MS = 60_000

export interface JournalEntry {
  readonly seq: number
  readonly sessionId: string
  readonly event: AiEvent
}

interface SessionLog {
  entries: JournalEntry[]
  /** Highest sequence number dropped from the front; `after` below it cannot be resumed. */
  dropped: number
  busy: boolean
}

/** Pure journal: sequence numbers, busy state and replay windows. */
export class SessionJournal {
  private seq = 0
  private readonly sessions = new Map<string, SessionLog>()

  constructor(private readonly limit = JOURNAL_LIMIT, private readonly maxSessions = JOURNAL_SESSIONS) {}

  get last(): number { return this.seq }

  record(sessionId: string, event: AiEvent): JournalEntry {
    const log = this.touch(sessionId)
    const entry: JournalEntry = { seq: ++this.seq, sessionId, event }
    log.entries.push(entry)
    if (log.entries.length > this.limit) log.dropped = log.entries.splice(0, log.entries.length - this.limit).at(-1)!.seq
    if (event.type === "turn" && event.phase === "start") log.busy = true
    if (event.type === "done" || event.type === "error") log.busy = false
    return entry
  }

  /**
   * A turn this sidecar started is running from its first event: the host announces context before `turn start`,
   * and a phone connecting in between must not be told the session is idle.
   */
  begin(sessionId: string): void {
    this.touch(sessionId).busy = true
  }

  /** The turn's fiber ended: whatever it last said, the session is no longer working. */
  settle(sessionId: string): void {
    const log = this.sessions.get(sessionId)
    if (log) log.busy = false
  }

  /** What a connection resuming after `after` must replay; `reset` when the journal cannot prove nothing is missing. */
  since(sessionId: string, after?: number): { entries: readonly JournalEntry[]; busy: boolean; seq: number; reset: boolean } {
    const log = this.sessions.get(sessionId)
    const seq = log?.entries.at(-1)?.seq ?? (after ?? 0)
    if (!log) return { entries: [], busy: false, seq, reset: after !== undefined && after > 0 }
    if (after === undefined) return { entries: [], busy: log.busy, seq, reset: false }
    return { entries: log.entries.filter((entry) => entry.seq > after), busy: log.busy, seq, reset: after < log.dropped }
  }

  private touch(sessionId: string): SessionLog {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      // Map order is insertion order: re-inserting keeps the most recently active session last.
      this.sessions.delete(sessionId)
      this.sessions.set(sessionId, existing)
      return existing
    }
    const created: SessionLog = { entries: [], dropped: 0, busy: false }
    this.sessions.set(sessionId, created)
    while (this.sessions.size > this.maxSessions) this.sessions.delete(this.sessions.keys().next().value!)
    return created
  }
}

export const frameOf = (entry: JournalEntry): SessionStreamFrame => ({ type: "event", seq: entry.seq, event: entry.event as never })

export class AssistantTurns extends Context.Service<AssistantTurns, {
  /** Runs `turn` detached; answers with the host session and the sequence number to follow it from. */
  start(turn: Stream.Stream<AiEvent>, requestedSessionId?: string): Effect.Effect<{ readonly sessionId: string; readonly seq: number }, BadRequest>
  /** The session's SSE frames: greeting, the missed events after `after`, then live events and heartbeats. */
  follow(sessionId: string, after?: number, heartbeatMs?: number): Effect.Effect<Stream.Stream<SessionStreamFrame>, never, Scope.Scope>
}>()("cadcamfun/AssistantTurns") {
  static readonly layer: Layer.Layer<AssistantTurns> = Layer.effect(
    AssistantTurns,
    Effect.gen(function*() {
      const journal = new SessionJournal()
      const bus = yield* PubSub.unbounded<JournalEntry>()

      const start = (turn: Stream.Stream<AiEvent>, requestedSessionId?: string) => Effect.gen(function*() {
        const ready = yield* Deferred.make<{ sessionId: string; seq: number }, string>()
        let sessionId = requestedSessionId
        let started = false
        const run = turn.pipe(
          Stream.runForEach((event) => Effect.gen(function*() {
            if (typeof event.sessionId === "string" && event.sessionId !== "") sessionId = event.sessionId
            // Refused before the host took it (unknown model, wrong owner): the POST answers with the reason.
            if (!started && event.type === "error") {
              yield* Deferred.fail(ready, event.message)
              if (sessionId) yield* PubSub.publish(bus, journal.record(sessionId, event))
              return
            }
            if (!sessionId) return
            if (!started) journal.begin(sessionId)
            const entry = journal.record(sessionId, event)
            yield* PubSub.publish(bus, entry)
            if (!started) {
              started = true
              yield* Deferred.succeed(ready, { sessionId, seq: entry.seq - 1 })
            }
          })),
          Effect.catchCause(() => Effect.void),
          Effect.ensuring(Effect.gen(function*() {
            if (sessionId) journal.settle(sessionId)
            yield* Deferred.fail(ready, "The assistant stopped before the turn started.")
          }))
        )
        yield* Effect.forkDetach(run)
        const answer = yield* Deferred.await(ready).pipe(
          Effect.timeoutOption(`${START_TIMEOUT_MS} millis`),
          Effect.mapError((message) => new BadRequest({ message }))
        )
        if (Option.isNone(answer)) return yield* new BadRequest({ message: "The desktop did not start the assistant in time. Check the desktop, then reopen the conversation." })
        return answer.value
      })

      const follow = (sessionId: string, after?: number, heartbeatMs = SESSION_HEARTBEAT_MS) => Effect.gen(function*() {
        // Subscribe before reading the journal: an event recorded in between is in one of the two, never in neither.
        const subscription = yield* PubSub.subscribe(bus)
        const snapshot = journal.since(sessionId, after)
        const cursor = snapshot.entries.at(-1)?.seq ?? snapshot.seq
        const hello: SessionStreamFrame = { type: "server.connected", sessionId, busy: snapshot.busy, seq: cursor, ...(snapshot.reset ? { reset: true } : {}) }
        const live = Stream.fromSubscription(subscription).pipe(
          Stream.filter((entry) => entry.sessionId === sessionId && entry.seq > cursor),
          Stream.map(frameOf)
        )
        const heartbeat = Stream.tick(`${heartbeatMs} millis`).pipe(Stream.drop(1), Stream.map((): SessionStreamFrame => ({ type: "server.heartbeat" })))
        return Stream.merge(Stream.concat(Stream.fromIterable([hello, ...snapshot.entries.map(frameOf)]), live), heartbeat, { haltStrategy: "left" })
      })

      return AssistantTurns.of({ start, follow })
    })
  )
}
