import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { bootLiveApp } from "./helpers/live-app.ts"
import type { AiStore } from "../src/features/ai/store/store.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const gate = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const mount = async () => {
  const { render } = await import("solid-js/web")
  const { AppProvider } = await import("../src/shared/state/context.ts")
  const { createAiStore } = await import("../src/features/ai/store/store.ts")
  let store!: AiStore
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => AppProvider({ state: app.state, get children() { store = createAiStore(); return null } }), root)
  return { store, dispose }
}
const client = () => (app.state.client as unknown as { ai: { chatStream: unknown; sessionControl: unknown; chatQueue: unknown } }).ai
const events = (values: object[]) => Stream.fromIterable(values.map((event) => JSON.stringify(event)))

describe("assistant lifecycle ownership", () => {
  test("partial tool diagnostics preserve confirmed success and committed mutation evidence", async () => {
    client().chatStream = () => Effect.succeed(events([
      { type: "tool_call", sessionId: "s", callId: "partial", tool: "cad_check_design", input: {} },
      { type: "tool_result", sessionId: "s", callId: "partial", tool: "cad_check_design", ok: true, output: "Checked the existing plate; one unsupported item was skipped." },
      { type: "tool_diagnostic", sessionId: "s", callId: "partial", tool: "cad_check_design", kind: "partial", severity: "warning", mutationApplied: true, message: "One item was skipped", recovery: "Repair the remaining item" },
      { type: "done", sessionId: "s", text: "The confirmed result remains valid." }
    ]))
    const { store, dispose } = await mount()
    try {
      await store.send("check this workpiece")
      await app.wait(() => store.status() === "idle")
      expect(store.toolCalls().partial?.status).toBe("ok")
      expect(store.messages().at(-1)?.events.find((event) => event.type === "tool_diagnostic")).toMatchObject({ severity: "warning", mutationApplied: true })
      expect(store.error()).toBeUndefined()
    } finally { dispose() }
  }, 30000)

  test("step totals and final turn totals count usage once", async () => {
    client().chatStream = () => Effect.succeed(events([
      { type: "step", sessionId: "s", phase: "finish", index: 1, usage: { inputTokens: 20, outputTokens: 8 } },
      { type: "step", sessionId: "s", phase: "finish", index: 2, usage: { inputTokens: 30, outputTokens: 12 } },
      { type: "done", sessionId: "s", text: "Checked the setup.", usage: { inputTokens: 50, outputTokens: 20 } }
    ]))
    const { store, dispose } = await mount()
    try {
      await store.send("check the setup")
      await app.wait(() => store.status() === "idle" && store.stats().exchanges === 1)
      expect(store.stats()).toMatchObject({ totalInputTokens: 50, totalOutputTokens: 20, exchanges: 1 })
    } finally { dispose() }
  }, 30000)

  test("native control and diagnostic events stay in the transcript without ending the turn", async () => {
    const finish = gate<string>()
    client().chatStream = () => Effect.succeed(Stream.concat(events([
      { type: "permission_request", sessionId: "s", requestId: "p1", permission: "edit", patterns: ["drawing"] },
      { type: "permission_resolved", sessionId: "s", requestId: "p1", reply: "once" },
      { type: "permission_blocked", sessionId: "s", permission: "shell", patterns: [], reason: "Unavailable in this workspace" },
      { type: "session_status", sessionId: "s", status: "idle" },
      { type: "turn", sessionId: "s", phase: "continuing", reason: "Repair the tool arguments" },
      { type: "tool_diagnostic", sessionId: "s", callId: "c1", tool: "cad_add_elements", kind: "argument", severity: "error", message: "Missing dimensions", recovery: "Specify dimensions in millimetres" }
    ]), Stream.fromEffect(Effect.promise(() => finish.promise))))
    const { store, dispose } = await mount()
    try {
      await store.send("model a plate")
      await app.wait(() => store.messages().at(-1)?.events.some((event) => event.type === "tool_diagnostic"))
      expect(store.permissions()).toEqual([])
      expect(store.status()).toBe("streaming")
      expect(store.messages().at(-1)?.events.map((event) => event.type)).toContain("permission_blocked")
      finish.resolve(JSON.stringify({ type: "done", sessionId: "s", text: "Dimensions repaired." }))
      await app.wait(() => store.status() === "idle")
    } finally { dispose() }
  }, 30000)

  test("late session controls cannot repopulate a cleared conversation", async () => {
    const response = gate<unknown>()
    const original = client().sessionControl
    let calls = 0
    client().chatStream = () => Effect.succeed(events([{ type: "done", sessionId: "s", text: "Ready." }]))
    const { store, dispose } = await mount()
    try {
      await store.send("ready")
      await app.wait(() => store.status() === "idle")
      client().sessionControl = () => { calls += 1; return Effect.promise(() => response.promise) }
      const control = store.compact()
      await app.wait(() => calls === 1)
      expect(store.controlBusy()).toBe(true)
      store.clear()
      response.resolve({ busy: false, text: "", tasks: [], questions: [{ requestId: "old", questions: [] }], context: { tokens: 99, compacted: true } })
      await control
      expect(store.questions()).toEqual([])
      expect(store.hostContext()).toBeUndefined()
      expect(store.controlBusy()).toBe(false)
      expect(store.contextTokens()).toBe(0)
    } finally { client().sessionControl = original; dispose() }
  }, 30000)

  test("a failed queue request cannot deliver text into a replacement session", async () => {
    const finish = gate<string>(), queued = gate<void>()
    const original = client().chatQueue
    let turns = 0, queueCalls = 0
    client().chatStream = () => {
      turns += 1
      return Effect.succeed(Stream.concat(events([{ type: "delta", sessionId: "s", text: "Working." }]), Stream.fromEffect(Effect.promise(() => finish.promise))))
    }
    client().chatQueue = () => { queueCalls += 1; return Effect.promise(() => queued.promise).pipe(Effect.flatMap(() => Effect.fail(new Error("The old turn ended")))) }
    const { store, dispose } = await mount()
    try {
      await store.send("start the job")
      await app.wait(() => store.messages().some((message) => message.text === "Working."))
      const delivery = store.send("make the plate thicker")
      await app.wait(() => queueCalls === 1)
      store.newSession()
      queued.resolve()
      await delivery
      expect(turns).toBe(1)
      expect(store.sessionId()).toBeUndefined()
      expect(store.messages()).toEqual([])
      expect(store.error()).toBeUndefined()
    } finally { client().chatQueue = original; dispose() }
  }, 30000)

  test("stopping workspace preparation never starts a late model turn", async () => {
    const prepared = gate<void>()
    const drawings = app.state.client.drawings as unknown as { update: (...args: unknown[]) => Effect.Effect<unknown, unknown> }
    const original = drawings.update
    let preparing = false, turns = 0
    drawings.update = (...args) => Effect.promise(() => { preparing = true; return prepared.promise }).pipe(Effect.flatMap(() => original(...args)))
    client().chatStream = () => { turns += 1; return Effect.succeed(events([{ type: "done", sessionId: "s", text: "Too late." }])) }
    const { store, dispose } = await mount()
    try {
      const sending = store.send("inspect the workpiece")
      await app.wait(() => preparing)
      expect(store.status()).toBe("connecting")
      store.abort()
      prepared.resolve()
      await sending
      expect(turns).toBe(0)
      expect(store.status()).toBe("idle")
      expect(store.messages().at(-1)?.interrupted).toBe(true)
    } finally { drawings.update = original; dispose() }
  }, 30000)

  test("unmount interrupts the owned stream and ignores delayed completion", async () => {
    const response = gate<string>()
    client().chatStream = () => Effect.succeed(Stream.concat(
      events([{ type: "delta", sessionId: "s", text: "Checking stock." }]),
      Stream.fromEffect(Effect.promise(() => response.promise))
    ))
    const { store, dispose } = await mount()
    await store.send("check stock")
    await app.wait(() => store.messages().some((message) => message.text === "Checking stock."))
    const before = store.messages()
    dispose()
    response.resolve(JSON.stringify({ type: "done", sessionId: "s", text: "Late answer." }))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(store.messages()).toEqual(before)
    expect(store.stats().exchanges).toBe(0)
  }, 30000)
})
