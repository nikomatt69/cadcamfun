/**
 * A dropped connection must never end an assistant turn: the host keeps working and the client reads the result back.
 */
import { describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { sanitizeError } from "../src/features/ai/lib/errors.ts"
import { streamChatEffect } from "../src/features/ai/lib/stream.ts"
import type { AiEvent } from "../src/features/ai/lib/types.ts"

const sse = (...events: object[]) => Stream.fromIterable(events.map((e) => JSON.stringify(e)))

const run = async (client: unknown): Promise<AiEvent[]> => {
  const out = await Effect.runPromise(Stream.runCollect(streamChatEffect(client as never, { message: "build a car", sessionId: "s1", projectId: "p1" })))
  return [...out]
}

describe("stream recovery", () => {
  test("heartbeats are dropped, the rest of the answer is untouched", async () => {
    const events = await run({
      ai: {
        chatStream: () => Effect.succeed(sse({ type: "heartbeat" }, { type: "future_event", sessionId: "s1" }, { type: "delta", sessionId: "s1", text: "Hi" }, { type: "heartbeat" }, { type: "done", sessionId: "s1", text: "Hi" })),
        sessionState: () => Effect.die("must not be asked")
      }
    })
    expect(events.map((e) => e.type)).toEqual(["delta", "done"])
  })

  test("known malformed events recover rather than bypassing the wire schema", async () => {
    const events = await run({ ai: {
      chatStream: () => Effect.succeed(sse({ type: "delta", sessionId: "s1", text: 42 })),
      sessionState: () => Effect.succeed({ busy: false, text: "Valid stored answer" })
    } })
    expect(events.some((event) => event.type === "delta")).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: "done", recovered: true, text: "Valid stored answer" })
  })

  test("recovery restores tool-only answers once and retains diagnostics and usage", async () => {
    const call = { type: "tool_call", sessionId: "s1", callId: "c1", tool: "cad_describe_drawing", input: {} }
    const result = { type: "tool_result", sessionId: "s1", callId: "c1", tool: "cad_describe_drawing", ok: false, output: "Drawing not found" }
    const diagnostic = { type: "tool_diagnostic", sessionId: "s1", callId: "c1", tool: "cad_describe_drawing", kind: "execution", severity: "error", message: "Drawing not found" }
    let reads = 0
    const events = await run({ ai: {
      chatStream: () => Effect.succeed(sse(call, result)),
      sessionState: () => Effect.sync(() => ({ busy: ++reads < 2, text: "", events: [call, result, diagnostic], usage: { inputTokens: 10, outputTokens: 5 } }))
    } })
    expect(events.filter((event) => event.type === "tool_call")).toHaveLength(1)
    expect(events.filter((event) => event.type === "tool_result")).toHaveLength(1)
    expect(events.filter((event) => event.type === "tool_diagnostic")).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: "done", recovered: true, usage: { inputTokens: 10, outputTokens: 5 } })
  })

  test("a connection that drops mid-answer is recovered from the host once the turn is finished", async () => {
    let asked = 0
    const broken = Stream.concat(sse({ type: "delta", sessionId: "s1", text: "Procedo: " }), Stream.fail(new Error("Decode error (200 POST http://127.0.0.1:1/api/ai/chat/stream)")))
    const events = await run({
      ai: {
        chatStream: () => Effect.succeed(broken),
        sessionState: () => Effect.sync(() => (++asked < 3 ? { busy: true, text: "" } : { busy: false, text: "Procedo: built the body and the wheels." }))
      }
    })
    expect(asked).toBe(3)
    expect(events.at(-1)).toMatchObject({ type: "done", text: "Procedo: built the body and the wheels.", recovered: true })
    expect(events.some((e) => e.type === "error")).toBe(false)
  })

  test("a stream that just stops (no closing event) is treated as cut, not finished", async () => {
    const events = await run({
      ai: {
        chatStream: () => Effect.succeed(sse({ type: "delta", sessionId: "s1", text: "Working" })),
        sessionState: () => Effect.succeed({ busy: false, text: "Finished while you were away." })
      }
    })
    expect(events.at(-1)).toMatchObject({ type: "done", recovered: true, text: "Finished while you were away." })
  })

  test("if the host reports an error or has nothing, the user gets a clear message instead of silence", async () => {
    const cut = () => Stream.concat(sse({ type: "delta", sessionId: "s1", text: "x" }), Stream.fail(new Error("Decode error (200 POST http://127.0.0.1:1/x)")))
    const failed = await run({ ai: { chatStream: () => Effect.succeed(cut()), sessionState: () => Effect.succeed({ busy: false, text: "", error: "Provider request failed with HTTP 500" }) } })
    expect(failed.at(-1)).toMatchObject({ type: "error" })
    const nothing = await run({ ai: { chatStream: () => Effect.succeed(cut()), sessionState: () => Effect.succeed({ busy: false, text: "" }) } })
    expect(nothing.at(-1)).toMatchObject({ type: "error" })
    expect((nothing.at(-1) as { message: string }).message).toContain("connection to the assistant was interrupted")
  })

  test("the raw 'Decode error' never reaches the transcript", () => {
    expect(sanitizeError("Decode error (200 POST http://127.0.0.1:50000/api/ai/chat/stream)")).toContain("interrupted")
    expect(sanitizeError("TypeError: terminated")).toContain("interrupted")
  })
})
