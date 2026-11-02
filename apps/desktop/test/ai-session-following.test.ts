import { expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { Effect, Queue, Stream } from "effect"
import { createSessionFollower } from "../src/features/ai/store/following.ts"
import { followSessionEvents } from "../src/features/ai/lib/stream.ts"
import { useDocumentStore } from "../src/features/cad/store/documentStore.ts"
import type { EditorOwner } from "../src/features/ai/lib/editor-sync.ts"
import type { AiActivity } from "../src/features/ai/lib/types.ts"
import type { AppState } from "../src/shared/state/context.ts"
import type { Client } from "../src/shared/state/client.ts"

test("remote events retain the original editor owner after navigating to another drawing", async () => {
  const frames = Effect.runSync(Queue.unbounded<object>())
  const [status, setStatus] = createSignal<"idle" | "connecting" | "streaming" | "error">("idle")
  const [error, setError] = createSignal<string>()
  const [, setActivity] = createSignal<AiActivity>({ step: 0, compacted: false })
  const [activeAssistantId, setActiveAssistantId] = createSignal<string>()
  const owners: EditorOwner[] = []
  let complete!: () => void
  const completed = new Promise<void>((resolve) => { complete = resolve })
  const app = { client: { ai: { sessionStream: () => Effect.succeed(Stream.fromQueue(frames)) } } } as unknown as AppState
  useDocumentStore.getState().setDocument({ projectId: "project", drawingId: "original" })
  const follower = createSessionFollower({
    app, sessionId: () => "ses_remote", status, setStatus, error, setError, setActivity,
    activeAssistantId, setActiveAssistantId, nextMessageId: () => "answer", appendMessage: () => {},
    patchMessage: () => {}, resetTurn: () => {}, refreshHistory: async () => {},
    finish: setStatus, isDisposed: () => false,
    apply: (event, owner) => {
      owners.push(owner)
      if (event.type === "user_message") useDocumentStore.getState().setDocument({ projectId: "project", drawingId: "other" })
      if (event.type === "done") complete()
    }
  })
  try {
    follower.follow("ses_remote")
    for (const [index, event] of [
      { type: "user_message", sessionId: "ses_remote", text: "Build" },
      { type: "delta", sessionId: "ses_remote", text: "Building" },
      { type: "done", sessionId: "ses_remote", text: "Built" }
    ].entries()) Effect.runSync(Queue.offer(frames, { type: "event", seq: index + 1, event }))
    await completed
    expect(owners).toHaveLength(3)
    expect(owners.every((owner) => owner === owners[0] && owner.drawingId === "original")).toBe(true)
    expect(owners[0]?.current()).toBe(false)
  } finally {
    follower.stop()
    useDocumentStore.getState().clear()
  }
})

test("a previously healthy session gives up after five consecutive connections without a greeting", async () => {
  let attempts = 0
  const controller = new AbortController()
  const guard = setTimeout(() => controller.abort(), 38_000)
  const client = { ai: { sessionStream: () => {
    attempts++
    return attempts === 1
      ? Effect.succeed(Stream.make({ type: "server.connected", sessionId: "ses", seq: 1, busy: false }))
      : Effect.fail(new Error("Session no longer exists"))
  } } } as unknown as Client
  try {
    await followSessionEvents(client, { sessionId: "ses", signal: controller.signal, onConnected: () => {}, onEvent: () => {} })
    expect(controller.signal.aborted).toBe(false)
    expect(attempts).toBe(6)
  } finally {
    clearTimeout(guard)
    controller.abort()
  }
}, 40_000)

test("a new conversation follows immediately while an obsolete conversation's history read is pending", async () => {
  const oldFrames = Effect.runSync(Queue.unbounded<object>())
  const newFrames = Effect.runSync(Queue.unbounded<object>())
  const [sessionId, setSessionId] = createSignal("ses_old")
  const [status, setStatus] = createSignal<"idle" | "connecting" | "streaming" | "error">("idle")
  const [error, setError] = createSignal<string>()
  const [, setActivity] = createSignal<AiActivity>({ step: 0, compacted: false })
  const [activeAssistantId, setActiveAssistantId] = createSignal<string>()
  let release!: () => void
  const history = new Promise<void>((resolve) => { release = resolve })
  let reading!: () => void
  const historyStarted = new Promise<void>((resolve) => { reading = resolve })
  let received!: () => void
  const newActivity = new Promise<void>((resolve) => { received = resolve })
  const applied: string[] = []
  const app = { client: { ai: { sessionStream: ({ params }: { params: { sessionId: string } }) =>
    Effect.succeed(Stream.fromQueue(params.sessionId === "ses_old" ? oldFrames : newFrames))
  } } } as unknown as AppState
  const follower = createSessionFollower({
    app, sessionId, status, setStatus, error, setError, setActivity, activeAssistantId, setActiveAssistantId,
    nextMessageId: () => "answer", appendMessage: () => {}, patchMessage: () => {}, resetTurn: () => {},
    refreshHistory: async () => { reading(); await history }, finish: setStatus, isDisposed: () => false,
    apply: (event) => { applied.push(event.sessionId); if (event.type === "delta") received() }
  })
  try {
    follower.follow(sessionId())
    Effect.runSync(Queue.offer(oldFrames, { type: "event", seq: 1, event: { type: "turn", sessionId: "ses_old", phase: "start" } }))
    await historyStarted
    setSessionId("ses_new")
    follower.follow(sessionId())
    Effect.runSync(Queue.offer(newFrames, { type: "event", seq: 2, event: { type: "user_message", sessionId: "ses_new", text: "Build" } }))
    Effect.runSync(Queue.offer(newFrames, { type: "event", seq: 3, event: { type: "delta", sessionId: "ses_new", text: "Working" } }))
    await newActivity
    release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(applied).toEqual(["ses_new", "ses_new"])
    expect(follower.active()).toBe(true)
    expect(status()).toBe("streaming")
  } finally { release(); follower.stop() }
})

for (const transientFailure of [false, true]) test(`a journal reset repairs geometry and history before queued work (transient failure: ${transientFailure})`, async () => {
  const frames = Effect.runSync(Queue.unbounded<object>())
  const [status, setStatus] = createSignal<"idle" | "connecting" | "streaming" | "error">("idle")
  const [error, setError] = createSignal<string>()
  const [, setActivity] = createSignal<AiActivity>({ step: 0, compacted: false })
  const [activeAssistantId, setActiveAssistantId] = createSignal<string>()
  const order: string[] = []
  let reads = 0
  let repaired!: () => void
  const geometry = new Promise<void>((resolve) => { repaired = resolve })
  let finish!: () => void
  const finished = new Promise<void>((resolve) => { finish = resolve })
  const app = {
    client: {
      ai: { sessionStream: () => Effect.succeed(Stream.fromQueue(frames)) },
      drawings: { get: () => {
        reads++
        if (transientFailure && reads === 1) return Effect.fail(new Error("Temporary disconnect"))
        order.push("geometry"); repaired(); return Effect.succeed({ data: { elements: [] } })
      } }
    },
    runtime: { run: Effect.runPromise }
  } as unknown as AppState
  useDocumentStore.getState().setDocument({ projectId: "project", drawingId: "drawing" })
  const follower = createSessionFollower({
    app, sessionId: () => "ses_reset", status, setStatus, error, setError, setActivity,
    activeAssistantId, setActiveAssistantId, nextMessageId: () => "answer", appendMessage: () => {},
    patchMessage: () => {}, resetTurn: () => {}, apply: () => {}, isDisposed: () => false,
    refreshHistory: async () => { expect(status()).toBe("idle"); order.push("history") },
    finish: (next) => { order.push("finish"); setStatus(next); finish() }
  })
  try {
    follower.follow("ses_reset")
    Effect.runSync(Queue.offer(frames, { type: "event", seq: 1, event: { type: "user_message", sessionId: "ses_reset", text: "Build" } }))
    Effect.runSync(Queue.offer(frames, { type: "server.connected", seq: 100, busy: true, reset: true }))
    await geometry
    expect(status()).toBe("streaming")
    expect(order).toEqual(["geometry"])
    Effect.runSync(Queue.offer(frames, { type: "event", seq: 101, event: { type: "done", sessionId: "ses_reset", text: "Built" } }))
    await finished
    expect(order).toEqual(["geometry", "history", "finish"])
    expect(reads).toBe(transientFailure ? 2 : 1)
  } finally {
    follower.stop()
    useDocumentStore.getState().clear()
  }
})
