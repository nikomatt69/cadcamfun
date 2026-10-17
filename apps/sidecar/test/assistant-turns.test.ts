import { describe, expect, test } from "bun:test"
import type { AiEvent } from "@cadcamfun/ai"
import type { SessionStreamFrame } from "@cadcamfun/api"
import { Effect, Queue, Scope, Stream } from "effect"
import { AssistantTurns, SessionJournal, STOPPED_MESSAGE } from "../src/services/assistant-turns.ts"

const turn = (sessionId: string): AiEvent => ({ type: "turn", sessionId, phase: "start" })
const delta = (sessionId: string, text: string): AiEvent => ({ type: "delta", sessionId, text })
const done = (sessionId: string, text: string): AiEvent => ({ type: "done", sessionId, text })

describe("session journal", () => {
  test("sequence numbers increase, busy follows the turn, and `after` replays exactly what was missed", () => {
    const journal = new SessionJournal()
    journal.record("s", turn("s"))
    const second = journal.record("s", delta("s", "Hel"))
    journal.record("other", delta("other", "x"))
    expect(journal.since("s", undefined)).toMatchObject({ entries: [], busy: true, reset: false })
    journal.record("s", done("s", "Hello"))
    const resumed = journal.since("s", second.seq)
    expect(resumed.entries.map((entry) => entry.event.type)).toEqual(["done"])
    expect(resumed).toMatchObject({ busy: false, reset: false })
  })

  test("a reconnection the journal no longer covers is told to re-read state, not resumed blind", () => {
    const journal = new SessionJournal(2, 64, { base: 0 })
    for (const text of ["a", "b", "c", "d"]) journal.record("s", delta("s", text))
    // A reset replays nothing (the phone re-reads state) and carries the live edge to continue from.
    expect(journal.since("s", 1)).toMatchObject({ reset: true, entries: [], seq: 4 })
    expect(journal.since("s", 2).entries.map((entry) => (entry.event as { text: string }).text)).toEqual(["c", "d"])
    // After a sidecar restart the session is unknown: any cursor is a reset.
    expect(new SessionJournal().since("s", 5)).toMatchObject({ reset: true, entries: [] })
  })

  test("only the most recently active sessions are kept", () => {
    const journal = new SessionJournal(10, 2, { base: 0 })
    journal.record("a", delta("a", "1"))
    journal.record("b", delta("b", "1"))
    journal.record("a", delta("a", "2"))
    journal.record("c", delta("c", "1"))
    expect(journal.since("b", 1).reset).toBe(true)
    expect(journal.since("a", 0).entries).toHaveLength(2)
  })
})

describe("session journal bounds", () => {
  test("sequence numbers continue across a restart: an old cursor is a reset, and the new turn's events still flow", () => {
    const before = new SessionJournal(100, 64, { base: 1_000 })
    for (const text of ["a", "b", "c"]) before.record("s", delta("s", text))
    const cursor = before.last
    // The sidecar restarts later; the phone resumes with its cursor from the old process.
    const after = new SessionJournal(100, 64, { base: 5_000 })
    expect(after.since("s", cursor)).toMatchObject({ reset: true, entries: [], seq: 5_000 })
    after.record("s", delta("s", "new"))
    expect(after.since("s", cursor)).toMatchObject({ reset: true, entries: [] })
    // A cursor from the future (another process with a later clock) is a reset at the live edge, never a silent filter.
    expect(after.since("s", 9_999)).toMatchObject({ reset: true, seq: 5_001 })
  })

  test("a session's characters are bounded, the newest entry always stays, and the trimmed part resets", () => {
    const journal = new SessionJournal(1_000, 64, { base: 0, sessionChars: 400 })
    for (let i = 0; i < 10; i++) journal.record("s", delta("s", "x".repeat(100)))
    expect(journal.stats.chars).toBeLessThanOrEqual(400)
    expect(journal.since("s", 1).reset).toBe(true)
    expect(journal.since("s", 9).entries.map((entry) => entry.seq)).toEqual([10])
    const huge = new SessionJournal(1_000, 64, { base: 0, sessionChars: 10 })
    huge.record("s", done("s", "y".repeat(1_000)))
    expect(huge.since("s", 0).entries).toHaveLength(1)
  })

  test("the global budget drops idle sessions before trimming a running one", () => {
    const journal = new SessionJournal(1_000, 64, { base: 0, totalChars: 1_000 })
    journal.record("idle", delta("idle", "x".repeat(400)))
    journal.record("idle", done("idle", "ok"))
    journal.record("running", turn("running"))
    for (let i = 0; i < 4; i++) journal.record("running", delta("running", "x".repeat(150)))
    expect(journal.stats.chars).toBeLessThanOrEqual(1_000)
    expect(journal.since("idle", 1).reset).toBe(true)
    expect(journal.since("running", 0).entries.length).toBe(5)
    expect(journal.isBusy("running")).toBe(true)
  })

  test("an idle session expires; a busy one does not", () => {
    let now = 0
    const journal = new SessionJournal(100, 64, { base: 0, idleMs: 60_000, now: () => now })
    journal.record("done", turn("done"))
    journal.record("done", done("done", "ok"))
    journal.record("working", turn("working"))
    now = 120_000
    expect(journal.since("done", 1).reset).toBe(true)
    expect(journal.since("working", 0).entries).toHaveLength(1)
    expect(journal.stats.sessions).toBe(1)
  })

  test("the session cap evicts an idle session before a running one", () => {
    const journal = new SessionJournal(100, 2, { base: 0 })
    journal.record("running", turn("running"))
    journal.record("idle", delta("idle", "x"))
    journal.record("new", delta("new", "x"))
    expect(journal.isBusy("running")).toBe(true)
    expect(journal.since("idle", 1).reset).toBe(true)
  })
})

const run = <A, E>(effect: Effect.Effect<A, E, AssistantTurns | Scope.Scope>, layer = AssistantTurns.layer) => Effect.runPromise(Effect.scoped(effect).pipe(Effect.provide(layer)))

describe("detached assistant turns", () => {
  test("the prompt answers with the session as soon as the turn starts; the follower replays from that cursor", async () => {
    const frames = await run(Effect.gen(function*() {
      const turns = yield* AssistantTurns
      const gate = yield* Queue.unbounded<AiEvent>()
      const started = yield* turns.start(Stream.concat(Stream.make(turn("ses_1")), Stream.fromQueue(gate).pipe(Stream.takeUntil((event) => event.type === "done"))), "s-mobile")
      expect(started.sessionId).toBe("ses_1")
      // Events produced before the phone opened the stream are replayed from the prompt's cursor.
      yield* Queue.offer(gate, delta("ses_1", "Hello"))
      yield* Effect.sleep("20 millis")
      const stream = yield* turns.follow("ses_1", started.seq, 60_000)
      yield* Queue.offer(gate, done("ses_1", "Hello"))
      return yield* Stream.runCollect(stream.pipe(Stream.takeUntil((frame) => frame.type === "event" && frame.event.type === "done")))
    }))
    expect(frames.map((frame: SessionStreamFrame) => frame.type === "event" ? frame.event.type : frame.type)).toEqual(["server.connected", "turn", "delta", "done"])
    expect(frames[0]).toMatchObject({ type: "server.connected", sessionId: "ses_1", busy: true })
  })

  test("a phone connecting before the host's turn start is told the session is busy", async () => {
    const hello = await run(Effect.gen(function*() {
      const turns = yield* AssistantTurns
      const gate = yield* Queue.unbounded<AiEvent>()
      const snapshot: AiEvent = { type: "context_snapshot", sessionId: "ses_3", projectId: "p", source: "workspace", chars: 10 }
      const started = yield* turns.start(Stream.concat(Stream.make(snapshot), Stream.fromQueue(gate).pipe(Stream.takeUntil((event) => event.type === "done"))))
      const stream = yield* turns.follow("ses_3", started.seq, 60_000)
      const frames = yield* Stream.runCollect(stream.pipe(Stream.take(1)))
      yield* Queue.offer(gate, done("ses_3", "ok"))
      return frames[0]
    }))
    expect(hello).toMatchObject({ type: "server.connected", busy: true })
  })

  test("the turn finishes with nobody following it, and a later follower sees it settled", async () => {
    const hello = await run(Effect.gen(function*() {
      const turns = yield* AssistantTurns
      const started = yield* turns.start(Stream.make(turn("ses_2"), delta("ses_2", "Working"), done("ses_2", "Built")))
      yield* Effect.sleep("20 millis")
      const stream = yield* turns.follow("ses_2", started.seq, 60_000)
      return yield* Stream.runCollect(stream.pipe(Stream.take(4)))
    }))
    expect(hello[0]).toMatchObject({ type: "server.connected", busy: false })
    expect(hello.at(-1)).toMatchObject({ type: "event", event: { type: "done", text: "Built" } })
  })

  test("a turn refused before it starts fails the prompt with the host's reason", async () => {
    const outcome = await run(Effect.gen(function*() {
      const turns = yield* AssistantTurns
      return yield* turns.start(Stream.make<AiEvent[]>({ type: "error", sessionId: "", code: "config", message: "Choose a model for openrouter." })).pipe(Effect.flip)
    }))
    expect(outcome.message).toBe("Choose a model for openrouter.")
  })

  test("heartbeats keep an idle connection alive", async () => {
    const frames = await run(Effect.gen(function*() {
      const turns = yield* AssistantTurns
      const stream = yield* turns.follow("idle", undefined, 10)
      return yield* Stream.runCollect(stream.pipe(Stream.take(3)))
    }))
    expect(frames.map((frame: SessionStreamFrame) => frame.type)).toEqual(["server.connected", "server.heartbeat", "server.heartbeat"])
  })

  test("a prompt to a session with a running turn is a 409 and leaves that turn untouched", async () => {
    const result = await run(Effect.gen(function*() {
      const turns = yield* AssistantTurns
      const gate = yield* Queue.unbounded<AiEvent>()
      const started = yield* turns.start(Stream.concat(Stream.make(turn("ses_busy")), Stream.fromQueue(gate).pipe(Stream.takeUntil((event) => event.type === "done"))), "ses_busy")
      // The host would refuse the second turn; it must not even be asked, and its refusal must not reach followers.
      const refused = yield* turns.start(Stream.make<AiEvent[]>({ type: "error", sessionId: "ses_busy", code: "provider", message: "busy (409)" }), "ses_busy").pipe(Effect.flip)
      const stillBusy = yield* turns.busy("ses_busy")
      const stream = yield* turns.follow("ses_busy", started.seq, 60_000)
      yield* Queue.offer(gate, done("ses_busy", "first"))
      const frames = yield* Stream.runCollect(stream.pipe(Stream.takeUntil((frame) => frame.type === "event" && (frame.event.type === "done" || frame.event.type === "error"))))
      yield* Effect.sleep("10 millis")
      return { refused, stillBusy, frames, after: yield* turns.busy("ses_busy") }
    }))
    expect(result.refused._tag).toBe("Conflict")
    expect(result.stillBusy).toBe(true)
    expect(result.frames.map((frame: SessionStreamFrame) => frame.type === "event" ? frame.event.type : frame.type)).toEqual(["server.connected", "turn", "done"])
    expect(result.after).toBe(false)
  })

  test("two prompts racing for one idle session: exactly one starts", async () => {
    const outcomes = await run(Effect.gen(function*() {
      const turns = yield* AssistantTurns
      const gate = yield* Queue.unbounded<AiEvent>()
      const body = () => Stream.concat(Stream.make(turn("ses_race")), Stream.fromQueue(gate).pipe(Stream.takeUntil((event) => event.type === "done")))
      const both = yield* Effect.all([turns.start(body(), "ses_race"), turns.start(body(), "ses_race")].map((effect) => Effect.result(effect)), { concurrency: 2 })
      yield* Queue.offer(gate, done("ses_race", "ok"))
      return both.map((outcome) => outcome._tag === "Success" ? "started" : outcome.failure._tag)
    }))
    expect(outcomes.sort()).toEqual(["Conflict", "started"])
  })

  test("a turn whose stream ends without done/error tells its followers it stopped", async () => {
    const frames = await run(Effect.gen(function*() {
      const turns = yield* AssistantTurns
      const started = yield* turns.start(Stream.make(turn("ses_cut"), delta("ses_cut", "half")))
      yield* Effect.sleep("20 millis")
      const stream = yield* turns.follow("ses_cut", started.seq, 60_000)
      return yield* Stream.runCollect(stream.pipe(Stream.take(4)))
    }))
    expect(frames[0]).toMatchObject({ type: "server.connected", busy: false })
    expect(frames.at(-1)).toMatchObject({ type: "event", event: { type: "error", code: "internal", message: STOPPED_MESSAGE } })
  })

  test("a follower that stops reading catches up from the journal, in order and without gaps", async () => {
    const seen = await run(Effect.gen(function*() {
      const turns = yield* AssistantTurns
      const gate = yield* Queue.unbounded<AiEvent>()
      const started = yield* turns.start(Stream.concat(Stream.make(turn("ses_slow")), Stream.fromQueue(gate).pipe(Stream.takeUntil((event) => event.type === "done"))))
      const stream = yield* turns.follow("ses_slow", started.seq, 60_000)
      // The follower exists but reads nothing while far more events than the bus holds go by.
      for (let i = 0; i < 40; i++) yield* Queue.offer(gate, delta("ses_slow", String(i)))
      yield* Queue.offer(gate, done("ses_slow", "end"))
      yield* Effect.sleep("30 millis")
      return yield* Stream.runCollect(stream.pipe(Stream.takeUntil((frame) => frame.type === "event" && frame.event.type === "done")))
    }), AssistantTurns.layerWith({ followerBuffer: 4 }))
    const events = seen.filter((frame: SessionStreamFrame) => frame.type === "event") as Array<Extract<SessionStreamFrame, { type: "event" }>>
    expect(events.map((frame) => frame.event.type === "delta" ? frame.event.text : frame.event.type)).toEqual(["turn", ...Array.from({ length: 40 }, (_, i) => String(i)), "done"])
    const seqs = events.map((frame) => frame.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
  })

  test("a refused prompt never enters the session's journal", async () => {
    const hello = await run(Effect.gen(function*() {
      const turns = yield* AssistantTurns
      yield* turns.start(Stream.make<AiEvent[]>({ type: "error", sessionId: "ses_refused", code: "config", message: "No model" }), "ses_refused").pipe(Effect.flip)
      const stream = yield* turns.follow("ses_refused", undefined, 60_000)
      return yield* Stream.runCollect(stream.pipe(Stream.take(1)))
    }))
    expect(hello[0]).toMatchObject({ type: "server.connected", busy: false })
  })
})
