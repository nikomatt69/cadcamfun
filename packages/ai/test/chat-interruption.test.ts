import { expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { hostChatStream } from "../src/nikcli/chat.ts"
import type { ProjectHost } from "../src/nikcli/runtime.ts"

const interrupted = { name: "MessageAbortedError", data: { message: "Session interrupted" } }
const model = { providerID: "test", modelID: "test" }
const answer = (id: string, text: string) => ({ info: { id, role: "assistant", finish: "stop" }, parts: [{ type: "text", text }] })

test("an interrupted prompt result recovers an already saved answer without resending", async () => {
  let prompts = 0
  let messages: unknown[] = []
  const host = {
    client: {
      events: { async *subscribe() { yield { type: "server.connected" } } },
      session: { messages: async () => messages },
      "session-prompt": { prompt: async () => {
        prompts += 1
        messages = [{ info: { id: "user-1", role: "user" }, parts: [{ type: "text", text: "Hi" }] }, answer("answer-1", "Hello from the desktop.")]
        return interrupted
      } },
    },
  } as unknown as ProjectHost
  const events = await Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId: "s", message: "Hi", model })))
  expect(events.at(-1)).toMatchObject({ type: "done", text: "Hello from the desktop.", recovered: true })
  expect(prompts).toBe(1)
  expect(events.some((event) => event.type === "error")).toBe(false)
}, 10_000)

test("an interruption embedded in a result retries an unanswered message instead of returning the previous answer", async () => {
  let prompts = 0
  const previous = answer("old-answer", "Previous answer")
  const host = {
    client: {
      events: { async *subscribe() { yield { type: "server.connected" } } },
      session: { messages: async () => [previous] },
      "session-prompt": { prompt: async () => ++prompts === 1
        ? { info: { error: interrupted } }
        : answer("new-answer", "Your new answer") },
    },
  } as unknown as ProjectHost
  const events = await Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId: "s", message: "Hi", model })))
  expect(prompts).toBe(2)
  expect(events.some((event) => event.type === "retry")).toBe(true)
  expect(events.at(-1)).toMatchObject({ type: "done", text: "Your new answer" })
}, 10_000)

test("a prompt the host saved but never answered is not resent: one user message, the host's reason reported", async () => {
  let prompts = 0
  let messages: unknown[] = [answer("old-answer", "Previous answer")]
  const host = {
    client: {
      events: { async *subscribe() { yield { type: "server.connected" } } },
      session: { messages: async () => messages },
      "session-prompt": { prompt: async () => {
        prompts += 1
        // The host stored the user's message, then the turn died before any assistant message existed.
        messages = [...messages, { info: { id: `user-${prompts}`, role: "user" }, parts: [{ type: "text", text: "Hi" }] }]
        return interrupted
      } },
    },
  } as unknown as ProjectHost
  const events = await Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId: "s", message: "Hi", model })))
  expect(prompts).toBe(1)
  expect(events.some((event) => event.type === "retry")).toBe(false)
  expect(events.at(-1)).toMatchObject({ type: "error" })
}, 10_000)
