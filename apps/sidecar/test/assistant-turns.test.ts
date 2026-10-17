import { describe, expect, test } from "bun:test"
import type { AiEvent } from "@cadcamfun/ai"
import type { SessionStreamFrame } from "@cadcamfun/api"
import { Effect, Queue, Scope, Stream } from "effect"
import { AssistantTurns, SessionJournal } from "../src/services/assistant-turns.ts"

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
    const journal = new SessionJournal(2)
    for (const text of ["a", "b", "c", "d"]) journal.record("s", delta("s", text))
    expect(journal.since("s", 1).reset).toBe(true)
    expect(journal.since("s", 2).entries.map((entry) => (entry.event as { text: string }).text)).toEqual(["c", "d"])
    // After a sidecar restart the session is unknown: any cursor is a reset.
    expect(new SessionJournal().since("s", 5)).toMatchObject({ reset: true, entries: [] })
  })

  test("only the most recently active sessions are kept", () => {
    const journal = new SessionJournal(10, 2)
    journal.record("a", delta("a", "1"))
    journal.record("b", delta("b", "1"))
    journal.record("a", delta("a", "2"))
    journal.record("c", delta("c", "1"))
    expect(journal.since("b", 1).reset).toBe(true)
    expect(journal.since("a", 0).entries).toHaveLength(2)
  })
})

const run = <A, E>(effect: Effect.Effect<A, E, AssistantTurns | Scope.Scope>) => Effect.runPromise(Effect.scoped(effect).pipe(Effect.provide(AssistantTurns.layer)))

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
})
