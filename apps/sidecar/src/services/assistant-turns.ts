/**
 * Assistant turns that outlive the request that started them (spec 13 §5, the nikcli mobile architecture).
 *
 * `start` runs a chat turn on a detached fiber and answers as soon as the host session exists; `follow` is the
 * per-session SSE stream a phone keeps open. Every event goes into a bounded per-session journal with a strictly
 * increasing sequence number, so a client that reconnects with `after` gets exactly what it missed, and one the
 * journal no longer covers is told to re-read the session state instead of resuming blind. The turn itself never
 * depends on a connection: a suspended phone, a Wi-Fi hand-over or a killed app cannot stop or replay it.
 *
 * Bounds: events and characters per session, characters overall, sessions kept, and idle sessions expire. Whatever
 * a bound drops is reported to a reconnecting phone as `reset`, never silently skipped. A follower that falls behind
 * the live bus (a phone on a slow link) heals from the journal on its own.
 */
import type { AiEvent } from "@cadcamfun/ai"
import { BadRequest, Conflict, type SessionStreamFrame } from "@cadcamfun/api"
import { Context, Deferred, Effect, Layer, Option, PubSub, Scope, Stream } from "effect"

/** Events kept per session: a long tool-heavy turn fits, a forgotten session does not grow forever. */
export const JOURNAL_LIMIT = 4_000
/** Sessions whose journal is kept; the least recently active idle one is dropped first. */
export const JOURNAL_SESSIONS = 64
/** Approximate characters (encoded JSON) kept per session: a few large tool results cannot hold megabytes each. */
export const JOURNAL_SESSION_CHARS = 2_000_000
/** Approximate characters kept across every session. */
export const JOURNAL_TOTAL_CHARS = 24_000_000
/** An idle session's journal is dropped after this long without activity; its phone re-reads state on return. */
export const JOURNAL_IDLE_MS = 30 * 60_000
/** Live events buffered for followers; one that falls further behind catches up from the journal. */
export const FOLLOWER_BUFFER = 2_048
export const SESSION_HEARTBEAT_MS = 15_000
/** How long `start` waits for the host to open the session before giving up on answering (the turn keeps running). */
export const START_TIMEOUT_MS = 60_000

export interface JournalEntry {
  readonly seq: number
  /** The previous entry's `seq` in the same session (0 for its first): a follower sees a gap without guessing. */
  readonly prev: number
  readonly sessionId: string
  readonly event: AiEvent
}

interface SessionLog {
  entries: JournalEntry[]
  /** Highest sequence number dropped from the front; `after` below it cannot be resumed. */
  dropped: number
  busy: boolean
  chars: number
  lastActive: number
  /** Sequence number of the session's latest entry, kept even when the entries themselves were trimmed. */
  last: number
}

export interface JournalOptions {
  readonly sessionChars?: number
  readonly totalChars?: number
  readonly idleMs?: number
  readonly now?: () => number
  /**
   * First sequence number minus one. It defaults to the clock, so numbers keep increasing across sidecar restarts:
   * a phone's cursor from an earlier process is always below this one's, and is answered with `reset`, never mistaken
   * for a position in the new journal.
   */
  readonly base?: number
}

const sizeOf = (event: AiEvent): number => {
  try {
    return JSON.stringify(event)?.length ?? 0
  } catch {
    return 0
  }
}

/** Pure journal: sequence numbers, busy state and replay windows. */
export class SessionJournal {
  private seq: number
  private readonly base: number
  private readonly sessions = new Map<string, SessionLog>()
  private total = 0
  private swept = 0
  private readonly sessionChars: number
  private readonly totalChars: number
  private readonly idleMs: number
  private readonly now: () => number

  constructor(private readonly limit = JOURNAL_LIMIT, private readonly maxSessions = JOURNAL_SESSIONS, options: JournalOptions = {}) {
    this.now = options.now ?? Date.now
    this.base = options.base ?? this.now()
    this.seq = this.base
    this.sessionChars = options.sessionChars ?? JOURNAL_SESSION_CHARS
    this.totalChars = options.totalChars ?? JOURNAL_TOTAL_CHARS
    this.idleMs = options.idleMs ?? JOURNAL_IDLE_MS
  }

  get last(): number { return this.seq }
  /** Sessions currently journaled and their approximate total size, for tests and diagnostics. */
  get stats(): { readonly sessions: number; readonly chars: number } { return { sessions: this.sessions.size, chars: this.total } }

  isBusy(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.busy === true
  }

  record(sessionId: string, event: AiEvent): JournalEntry {
    const log = this.touch(sessionId)
    const entry: JournalEntry = { seq: ++this.seq, prev: log.last, sessionId, event }
    const chars = sizeOf(event)
    log.entries.push(entry)
    log.last = entry.seq
    log.chars += chars
    this.total += chars
    this.trim(log, this.limit, this.sessionChars)
    if (event.type === "turn" && event.phase === "start") log.busy = true
    if (event.type === "done" || event.type === "error") log.busy = false
    this.enforceTotal(log)
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

  /**
   * What a connection resuming after `after` must replay. `seq` is the live edge the follower continues from. `reset`
   * when the journal cannot prove nothing is missing (trimmed, expired, evicted, or a cursor from another process);
   * a reset replays nothing, because the client re-reads the session state and would otherwise apply events twice.
   */
  since(sessionId: string, after?: number): { entries: readonly JournalEntry[]; busy: boolean; seq: number; reset: boolean } {
    this.sweep()
    const log = this.sessions.get(sessionId)
    if (!log) return { entries: [], busy: false, seq: this.seq, reset: after !== undefined && after > 0 }
    if (after === undefined) return { entries: [], busy: log.busy, seq: log.last, reset: false }
    // `after` 0 asks for everything kept; a positive cursor below `base` was issued by an earlier process.
    const reset = after < log.dropped || (after > 0 && after < this.base) || after > this.seq
    if (reset) return { entries: [], busy: log.busy, seq: log.last, reset: true }
    const entries = log.entries.filter((entry) => entry.seq > after)
    return { entries, busy: log.busy, seq: entries.at(-1)?.seq ?? Math.max(after, log.last), reset: false }
  }

  /** Drops entries from the front until the session fits its bounds. */
  private trim(log: SessionLog, maxEntries: number, maxChars: number): void {
    let cut = 0
    let chars = 0
    // The newest entry always stays, so a follower still learns how a huge turn ended.
    while (log.entries.length - cut > 1 && (log.entries.length - cut > maxEntries || log.chars - chars > maxChars)) {
      chars += sizeOf(log.entries[cut]!.event)
      cut++
    }
    if (cut === 0) return
    log.dropped = log.entries[cut - 1]!.seq
    log.entries.splice(0, cut)
    log.chars -= chars
    this.total -= chars
  }

  /** Over the global budget: forget idle sessions, least recently active first, then trim the busy ones' history. */
  private enforceTotal(keep: SessionLog): void {
    if (this.total <= this.totalChars) return
    for (const [id, log] of this.sessions) {
      if (this.total <= this.totalChars) return
      if (log === keep || log.busy) continue
      this.drop(id, log)
    }
    for (const log of this.sessions.values()) {
      if (this.total <= this.totalChars) return
      this.trim(log, this.limit, Math.max(0, log.chars - (this.total - this.totalChars)))
    }
  }

  private drop(id: string, log: SessionLog): void {
    this.total -= log.chars
    this.sessions.delete(id)
  }

  /** Expires idle sessions; cheap enough to run on every access, done at most once per second. */
  private sweep(): void {
    const now = this.now()
    if (now - this.swept < 1_000) return
    this.swept = now
    for (const [id, log] of this.sessions) {
      if (!log.busy && now - log.lastActive > this.idleMs) this.drop(id, log)
    }
  }

  private touch(sessionId: string): SessionLog {
    this.sweep()
    const existing = this.sessions.get(sessionId)
    if (existing) {
      // Map order is insertion order: re-inserting keeps the most recently active session last.
      this.sessions.delete(sessionId)
      this.sessions.set(sessionId, existing)
      existing.lastActive = this.now()
      return existing
    }
    const created: SessionLog = { entries: [], dropped: 0, busy: false, chars: 0, lastActive: this.now(), last: 0 }
    this.sessions.set(sessionId, created)
    while (this.sessions.size > this.maxSessions) {
      // A running turn's journal is the last thing to go: its phone is most likely still following it.
      let victim: [string, SessionLog] | undefined
      for (const candidate of this.sessions) {
        if (candidate[1] !== created && !candidate[1].busy) { victim = candidate; break }
      }
      victim ??= this.sessions.entries().next().value!
      this.drop(victim[0], victim[1])
    }
    return created
  }
}

export const frameOf = (entry: JournalEntry): SessionStreamFrame => ({ type: "event", seq: entry.seq, event: entry.event as never })

/** Set on a turn whose fiber ended without the host's `done`/`error`, so a follower is never left waiting on it. */
export const STOPPED_MESSAGE = "The assistant stopped before finishing this turn. Reopen the conversation to see what it completed."

export class AssistantTurns extends Context.Service<AssistantTurns, {
  /**
   * Runs `turn` detached; answers with the host session and the sequence number to follow it from. A session that
   * already has a turn running here is refused with `Conflict` (409): the phone steers it with `chat/queue` or stops it,
   * and a second turn never races the first on one host session.
   */
  start(turn: Stream.Stream<AiEvent>, requestedSessionId?: string): Effect.Effect<{ readonly sessionId: string; readonly seq: number }, BadRequest | Conflict>
  /** Whether a turn started here is still running on `sessionId`. */
  busy(sessionId: string): Effect.Effect<boolean>
  /** The session's SSE frames: greeting, the missed events after `after`, then live events and heartbeats. */
  follow(sessionId: string, after?: number, heartbeatMs?: number): Effect.Effect<Stream.Stream<SessionStreamFrame>, never, Scope.Scope>
}>()("cadcamfun/AssistantTurns") {
  /** `journal` and `followerBuffer` are injectable so tests can force trimming and a lagging follower. */
  static readonly layerWith = (options: { readonly journal?: SessionJournal; readonly followerBuffer?: number } = {}): Layer.Layer<AssistantTurns> => Layer.effect(
    AssistantTurns,
    Effect.gen(function*() {
      const journal = options.journal ?? new SessionJournal()
      // Sliding: a follower that stops reading cannot grow memory; it notices the gap and replays from the journal.
      const bus = yield* PubSub.sliding<JournalEntry>(options.followerBuffer ?? FOLLOWER_BUFFER)
      /** Sessions a prompt has claimed and whose turn fiber has not ended yet. */
      const claimed = new Set<string>()
      const isBusy = (sessionId: string) => claimed.has(sessionId) || journal.isBusy(sessionId)

      const start = (turn: Stream.Stream<AiEvent>, requestedSessionId?: string) => Effect.gen(function*() {
        // Checked and claimed in one synchronous step, so two prompts racing for one session cannot both pass.
        if (requestedSessionId) {
          if (isBusy(requestedSessionId)) {
            return yield* new Conflict({ message: "The assistant is still working on this conversation. Steer it with a follow-up message, or stop it first." })
          }
          claimed.add(requestedSessionId)
        }
        const ready = yield* Deferred.make<{ sessionId: string; seq: number }, string>()
        let sessionId = requestedSessionId
        let started = false
        let finished = false
        let refused = false
        const publish = (id: string, event: AiEvent) => PubSub.publish(bus, journal.record(id, event))
        const run = turn.pipe(
          Stream.runForEach((event) => Effect.gen(function*() {
            // Refused before the host took it (unknown model, wrong owner, busy host): the POST answers with the reason.
            // It never enters the session's journal, where it would end a turn that is not this one.
            if (refused) return
            if (!started && event.type === "error") {
              refused = true
              // Nothing started: the session is free again as soon as the prompt has its answer.
              if (requestedSessionId) claimed.delete(requestedSessionId)
              yield* Deferred.fail(ready, event.message)
              return
            }
            if (typeof event.sessionId === "string" && event.sessionId !== "") {
              if (sessionId !== event.sessionId && sessionId !== undefined) claimed.delete(sessionId)
              sessionId = event.sessionId
            }
            if (!sessionId) return
            if (!started) {
              claimed.add(sessionId)
              journal.begin(sessionId)
            }
            const entry = journal.record(sessionId, event)
            yield* PubSub.publish(bus, entry)
            if (event.type === "done" || event.type === "error") finished = true
            if (!started) {
              started = true
              yield* Deferred.succeed(ready, { sessionId, seq: entry.seq - 1 })
            }
          })),
          Effect.catchCause((cause) => Effect.logWarning("Assistant turn ended with a failure", cause)),
          Effect.ensuring(Effect.gen(function*() {
            if (sessionId) {
              if (started && !finished) yield* publish(sessionId, { type: "error", sessionId, code: "internal", message: STOPPED_MESSAGE })
              if (started) journal.settle(sessionId)
              claimed.delete(sessionId)
            }
            if (requestedSessionId) claimed.delete(requestedSessionId)
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
        let cursor = snapshot.seq
        const hello: SessionStreamFrame = { type: "server.connected", sessionId, busy: snapshot.busy || claimed.has(sessionId), seq: cursor, ...(snapshot.reset ? { reset: true } : {}) }
        /** The frames one live entry produces: itself, or, after a gap the bus dropped, the journal's replay of it. */
        const deliver = (entry: JournalEntry): ReadonlyArray<SessionStreamFrame> => {
          if (entry.prev <= cursor) {
            cursor = entry.seq
            return [frameOf(entry)]
          }
          const missed = journal.since(sessionId, cursor)
          if (missed.reset) {
            cursor = missed.seq
            return [{ type: "server.connected", sessionId, busy: missed.busy, seq: cursor, reset: true }]
          }
          if (missed.entries.length === 0) return []
          cursor = missed.entries.at(-1)!.seq
          return missed.entries.map(frameOf)
        }
        const live = Stream.fromSubscription(subscription).pipe(
          Stream.filter((entry) => entry.sessionId === sessionId && entry.seq > cursor),
          Stream.map(deliver),
          Stream.flattenIterable
        )
        const heartbeat = Stream.tick(`${heartbeatMs} millis`).pipe(Stream.drop(1), Stream.map((): SessionStreamFrame => ({ type: "server.heartbeat" })))
        const replay = snapshot.entries.map(frameOf)
        if (snapshot.entries.length > 0) cursor = snapshot.entries.at(-1)!.seq
        return Stream.merge(Stream.concat(Stream.fromIterable([hello, ...replay]), live), heartbeat, { haltStrategy: "left" })
      })

      return AssistantTurns.of({ start, follow, busy: (sessionId) => Effect.sync(() => isBusy(sessionId)) })
    })
  )

  static readonly layer: Layer.Layer<AssistantTurns> = AssistantTurns.layerWith()
}
