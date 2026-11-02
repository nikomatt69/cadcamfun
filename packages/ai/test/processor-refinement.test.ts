import { describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { AiEventSchema } from "../src/events.ts"
import { Schema } from "effect"
import { continuationFor, hostChatStream, queueHostMessage } from "../src/nikcli/chat.ts"
import { toolFailure } from "../src/nikcli/event-mapper.ts"
import type { ProjectHost } from "../src/nikcli/runtime.ts"
import { PRIMARY_STEP_LIMIT } from "../src/nikcli/config.ts"

test("a model that ignores the host step hint is aborted and the stream closes once", async () => {
  let started!: () => void
  const prompting = new Promise<void>((resolve) => { started = resolve })
  let aborted = 0
  const host = { client: {
    session: { messages: async () => [], abort: async () => { aborted++; return true } },
    events: { subscribe: async function* () {
      yield { type: "server.connected", properties: {} }
      await prompting
      for (let step = 1; step <= PRIMARY_STEP_LIMIT + 5; step++) yield { type: "message.part.updated", properties: { part: { type: "step-start", id: `step-${step}`, sessionID: "s", messageID: "answer" } } }
    } },
    "session-prompt": { prompt: async () => { started(); return new Promise(() => {}) } }
  } } as unknown as ProjectHost
  const events = await Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId: "s", message: "Check", model: { providerID: "fake", modelID: "fake" } })))
  expect(events.filter((event) => event.type === "step")).toHaveLength(PRIMARY_STEP_LIMIT)
  expect(events.filter((event) => event.type === "error")).toHaveLength(1)
  expect(events.at(-1)).toMatchObject({ type: "error", code: "internal", message: expect.stringContaining("model steps") })
  expect(aborted).toBe(1)
}, 10_000)

test("a spent step budget resumes the turn by itself while it keeps completing tool calls", async () => {
  let started!: () => void
  const prompting = new Promise<void>((resolve) => { started = resolve })
  const prompts: string[] = []
  let aborted = 0
  const host = { client: {
    session: { messages: async () => [], abort: async () => { aborted++; return true } },
    events: { subscribe: async function* () {
      yield { type: "server.connected", properties: {} }
      await prompting
      yield { type: "message.part.updated", properties: { part: { type: "tool", id: "t1", callID: "c1", tool: "cad_edit", sessionID: "s", messageID: "answer", state: { status: "completed", input: {}, output: '{"ok":true}' } } } }
      for (let step = 1; step <= PRIMARY_STEP_LIMIT + 1; step++) yield { type: "message.part.updated", properties: { part: { type: "step-start", id: `step-${step}`, sessionID: "s", messageID: "answer" } } }
      yield { type: "session.idle", properties: { sessionID: "s" } }
    } },
    "session-prompt": { prompt: async (request: { parts: Array<{ text?: string }> }) => {
      prompts.push(request.parts[0]?.text ?? "")
      if (prompts.length === 1) { started(); return new Promise(() => {}) }
      return { info: { finish: "stop" }, parts: [{ type: "text", text: "Finished." }] }
    } }
  } } as unknown as ProjectHost
  const events = await Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId: "s", message: "Build it", model: { providerID: "fake", modelID: "fake" } })))
  expect(prompts).toHaveLength(2)
  expect(prompts[1]).toContain("step budget")
  expect(aborted).toBe(1)
  expect(events.filter((event) => event.type === "error")).toHaveLength(0)
  expect(events.at(-1)).toMatchObject({ type: "done" })
}, 20_000)

const toolResult = (callID: string, tool: string, value: unknown) => ({
  type: "message.part.updated", properties: { part: { type: "tool", callID, tool, sessionID: "s", messageID: "answer",
    state: { status: "completed", input: {}, output: JSON.stringify(value) } } }
})

/** A real subscribed turn seam: a prompt completes only after the host bus consumed its scripted events. */
const scriptedTurn = (script: (round: number) => ReadonlyArray<object>, snapshot?: (round: number) => ReadonlyArray<object>, beforeResult?: () => Promise<void>) => {
  const batches: Array<{ events: ReadonlyArray<object>; acknowledged: () => void }> = []
  let wake: (() => void) | undefined
  let prompts = 0
  const host = { client: {
    session: { messages: async () => snapshot?.(prompts) ?? [], abort: async () => true },
    events: { subscribe: async function* ({ signal }: { signal: AbortSignal }) {
      const onAbort = () => wake?.()
      signal.addEventListener("abort", onAbort, { once: true })
      try {
        yield { type: "server.connected", properties: {} }
        while (!signal.aborted) {
          if (batches.length === 0) await new Promise<void>((resolve) => { wake = resolve })
          if (signal.aborted) return
          const batch = batches.shift()
          if (!batch) continue
          for (const event of batch.events) yield event
          yield { type: "session.idle", properties: { sessionID: "s" } }
          batch.acknowledged()
        }
      } finally { signal.removeEventListener("abort", onAbort) }
    } },
    "session-prompt": { prompt: async () => {
      const events = script(++prompts)
      await new Promise<void>((acknowledged) => { batches.push({ events, acknowledged }); wake?.() })
      await beforeResult?.()
      return { info: { finish: "stop" }, parts: [{ type: "text", text: "Continuing the requested work." }] }
    } }
  } } as unknown as ProjectHost
  return { host, prompts: () => prompts }
}

test("a spent budget does not reward failed tool calls with another run", async () => {
  const fixture = scriptedTurn((round) => round === 1 ? [
    toolResult("failed", "cad_edit", { ok: false, error: "radius invalid" }),
    ...Array.from({ length: PRIMARY_STEP_LIMIT + 1 }, (_, index) => ({ type: "message.part.updated", properties: { part: { type: "step-start", id: `failed-${index}`, sessionID: "s", messageID: "answer" } } }))
  ] : [])
  const events = await Effect.runPromise(Stream.runCollect(hostChatStream({ host: fixture.host, sessionId: "s", message: "Build", model: { providerID: "fake", modelID: "fake" } })))
  expect(fixture.prompts()).toBe(1)
  expect(events.at(-1)).toMatchObject({ type: "error", code: "internal" })
})

test("changing failures and unrelated successful reads do not reset stalled recovery", async () => {
  const fixture = scriptedTurn((round) => [
    toolResult(`failed-${round}`, "cad_edit", { ok: false, error: `feature ${round} invalid` }),
    toolResult(`read-${round}`, "cad", { ok: true })
  ])
  const events = await Effect.runPromise(Stream.runCollect(hostChatStream({ host: fixture.host, sessionId: "s", message: "Build", model: { providerID: "fake", modelID: "fake" } })))
  expect(fixture.prompts()).toBe(3)
  expect(events.at(-1)).toMatchObject({ type: "error", code: "internal", message: expect.stringContaining("no progress") })
})

test("confirmed edits keep a long task productive even when the remaining error text stays identical", async () => {
  const fixture = scriptedTurn((round) => [
    toolResult(`saved-${round}`, "cad_edit", { ok: true, ids: [`solid-${round}`] }),
    ...(round < 5 ? [toolResult(`remaining-${round}`, "cad_edit", { ok: false, error: "One remaining feature needs repair" })] : [])
  ])
  const events = await Effect.runPromise(Stream.runCollect(hostChatStream({ host: fixture.host, sessionId: "s", message: "Build", model: { providerID: "fake", modelID: "fake" } })))
  expect(fixture.prompts()).toBe(5)
  expect(events.at(-1)).toMatchObject({ type: "done" })
})

test("detached bounded snapshots recognize new completed calls even when every snapshot has the same count", async () => {
  let detach!: () => void
  const detached = new Promise<void>((resolve) => { detach = resolve })
  let finished!: () => void
  const completed = new Promise<void>((resolve) => { finished = resolve })
  const plan = (round: number) => ({ type: "tool", callID: `plan-${round}`, tool: "todowrite", sessionID: "s", messageID: "answer",
    state: { status: "completed", input: { todos: [{ content: "Build all bodies", status: round < 5 ? "pending" : "completed" }] }, output: "[]" } })
  const fixture = scriptedTurn((round) => [
    toolResult(`saved-${round}`, "cad_edit", { ok: true, ids: [`solid-${round}`] }),
    { type: "message.part.updated", properties: { part: plan(round) } }
  ], (round) => {
    if (round === 0) return []
    if (round === 5) finished()
    return [
      { info: { id: "user", role: "user" }, parts: [{ type: "text", text: "Build" }] },
      { info: { id: `answer-${round}`, role: "assistant", finish: "stop" }, parts: [
        toolResult(`saved-${round}`, "cad_edit", { ok: true, ids: [`solid-${round}`] }).properties.part,
        plan(round)
      ] }
    ]
  }, () => detached)
  await Effect.runPromise(Stream.runForEach(hostChatStream({ host: fixture.host, sessionId: "s", message: "Build", model: { providerID: "fake", modelID: "fake" } }),
    (event) => event.type === "tool_result" ? Effect.fail(new Error("UI disconnected")) : Effect.void)).catch(() => undefined)
  detach()
  await completed
  expect(fixture.prompts()).toBe(5)
})

describe("native processor ownership", () => {
  test("a detached long task renews its step budget without replaying the original request", async () => {
    let start!: () => void
    const started = new Promise<void>((resolve) => { start = resolve })
    let detach!: () => void
    const detached = new Promise<void>((resolve) => { detach = resolve })
    let resume!: () => void
    const resumed = new Promise<void>((resolve) => { resume = resolve })
    const prompts: string[] = []
    const host = { client: {
      session: { messages: async () => [], abort: async () => true },
      events: { subscribe: async function* () {
        yield { type: "server.connected", properties: {} }
        await started
        yield { type: "message.part.updated", properties: { part: { type: "tool", callID: "c1", tool: "cad_edit", sessionID: "s", messageID: "answer", state: { status: "completed", input: {}, output: '{"ok":true}' } } } }
        await detached
        for (let step = 1; step <= PRIMARY_STEP_LIMIT + 1; step++) yield { type: "message.part.updated", properties: { part: { type: "step-start", id: `detached-${step}`, sessionID: "s", messageID: "answer" } } }
        yield { type: "session.idle", properties: { sessionID: "s" } }
      } },
      "session-prompt": { prompt: async (request: { parts: Array<{ text?: string }> }) => {
        prompts.push(request.parts[0]?.text ?? "")
        if (prompts.length === 1) { start(); return new Promise(() => {}) }
        resume()
        return { info: { finish: "stop" }, parts: [{ type: "text", text: "Finished." }] }
      } }
    } } as unknown as ProjectHost
    await Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId: "s", message: "Build the part", model: { providerID: "fake", modelID: "fake" } }),
      (event) => event.type === "tool_result" ? Effect.fail(new Error("UI disconnected")) : Effect.void)).catch(() => undefined)
    detach()
    await resumed
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain("do not repeat steps that completed")
    expect(prompts[1]).not.toBe("Build the part")
  }, 10_000)

  test("retry admission belongs to nikcli and usage covers every completed step", async () => {
    let aborts = 0
    let subscription: AbortSignal | undefined
    const host = { client: {
      session: { abort: async () => { aborts += 1 } },
      events: { subscribe: async function* (options: { signal: AbortSignal }) {
        subscription = options.signal
        yield { type: "server.connected", properties: {} }
        for (let attempt = 1; attempt <= 6; attempt++) yield { type: "session.status", properties: { sessionID: "s", status: { type: "retry", attempt, message: "Overloaded" } } }
        for (let step = 1; step <= 2; step++) {
          yield { type: "message.part.updated", properties: { part: { sessionID: "s", messageID: `m-${step}`, id: `start-${step}`, type: "step-start" } } }
          yield { type: "message.part.updated", properties: { part: { sessionID: "s", messageID: `m-${step}`, id: `finish-${step}`, type: "step-finish", tokens: { input: 10, output: 3 } } } }
        }
        yield { type: "session.idle", properties: { sessionID: "s" } }
      } },
      "session-prompt": { prompt: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { info: { id: "m", role: "assistant", finish: "stop", tokens: { input: 10, output: 3 } }, parts: [{ type: "text", id: "text", text: "Finished." }] }
      } }
    } } as unknown as ProjectHost
    const events = [...await Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId: "s", message: "Model the part", model: { providerID: "fake", modelID: "fake" }, continues: 0, autoContinues: 0 })))]
    expect(aborts).toBe(0)
    expect(subscription?.aborted).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: "done", usage: { inputTokens: 20, outputTokens: 6 } })
    for (const event of events) expect(() => Schema.decodeUnknownSync(AiEventSchema)(event)).not.toThrow()
  })

  test("queued messages keep the parent's role, provider/model and thinking variant", async () => {
    let admitted: unknown
    const host = { client: { session: { messages: async () => [{ info: { role: "user", agent: "cadcam-machinist-ask", model: { providerID: "vendor", modelID: "reasoner" }, variant: "high" }, parts: [] }] },
      "session-prompt": { promptAsync: async (input: unknown) => { admitted = input } }
    } } as unknown as ProjectHost
    await Effect.runPromise(queueHostMessage(host, "s", "Use a 6 mm cutter", "steer"))
    expect(admitted).toEqual({ sessionID: "s", agent: "cadcam-machinist-ask", model: { providerID: "vendor", modelID: "reasoner" }, variant: "high", delivery: "steer", parts: [{ type: "text", text: "Use a 6 mm cutter" }] })
  })
})

describe("output-based recovery", () => {
  test("structured errors include the root cause and invalid field paths", () => {
    expect(toolFailure("completed", ' {"ok":false,"error":"Nothing was added.","problems":["elements[0].radius: must be positive"]}')).toBe("Nothing was added.; elements[0].radius: must be positive")
    expect(toolFailure("completed", JSON.stringify({ success: false, error: { message: "Rebuild failed", path: "features[2]" } }))).toContain("features[2]: Rebuild failed")
    expect(toolFailure("completed", JSON.stringify({ ok: true, errors: ["One operation was skipped"], skipped: 1 }))).toContain("retry only skipped items")
    expect(toolFailure("completed", "null")).toBeUndefined()
  })

  test("questions, refused actions and terminal provider finishes are never nudged", () => {
    const open = { todos: [{ content: "Generate the operation", status: "pending" }], lastToolError: undefined }
    expect(continuationFor(open, "Which work offset should I use?", "stop")).toBeUndefined()
    expect(continuationFor(open, "Refused", "content-filter")).toBeUndefined()
    expect(continuationFor({ ...open, lastToolError: "Permission denied" }, "Stopped", "stop")).toBeUndefined()
    const recovery = continuationFor({ todos: [], lastToolError: "features[2].radius: invalid" }, "Could not rebuild", "stop")
    expect(recovery).toContain("features[2].radius")
    expect(recovery).toContain("retry only skipped items")
  })
})

for (const scenario of ["completed", "unavailable", "pending", "late-disconnect"] as const) {
  test(`detached continuation ${scenario}`, async () => {
    let prompts = 0
    let resolvePrompt!: () => void
    const promptGate = new Promise<void>((resolve) => { resolvePrompt = resolve })
    let inspected!: () => void
    const inspectedGate = new Promise<void>((resolve) => { inspected = resolve })
    const tool = (callID: string, name: string, input: unknown, output: unknown) => ({ type: "tool", callID, tool: name, state: { status: "completed", input, output: JSON.stringify(output) } })
    const host = { client: {
      session: { messages: async () => {
        inspected()
        if (scenario === "unavailable") throw new Error("Host temporarily unavailable")
        return [{ info: { id: "user", role: "user" }, parts: [{ type: "text", text: "Build the part" }] },
          { info: { id: "answer", role: "assistant", finish: "stop" }, parts: [
            tool("failed", "cad_edit", {}, { ok: false, error: "radius invalid" }),
            tool("fixed", "cad_edit", {}, { elements: [{ id: "solid-kept" }] }),
            tool("plan-done", "todowrite", { todos: [{ content: "Build", status: scenario === "pending" && prompts === 1 ? "pending" : "completed" }] }, [])
          ] }]
      } },
      events: { subscribe: async function* ({ signal }: { signal: AbortSignal }) {
        yield { type: "server.connected", properties: {} }
        yield { type: "message.part.updated", properties: { part: { ...tool("plan", "todowrite", { todos: [{ content: "Build", status: "pending" }] }, []), sessionID: "s", messageID: "answer" } } }
        if (scenario === "late-disconnect") await new Promise((resolve) => setTimeout(resolve, 30))
        yield { type: "message.part.updated", properties: { part: { ...tool("failed", "cad_edit", {}, { ok: false, error: "radius invalid" }), sessionID: "s", messageID: "answer" } } }
        if (!signal.aborted) await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
      } },
      "session-prompt": { prompt: async () => {
        prompts++
        await promptGate
        return { info: { id: "answer", role: "assistant", finish: "stop" }, parts: [{ type: "text", text: "Built and checked." }] }
      } }
    } } as unknown as ProjectHost
    const disconnected = Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId: "s", message: "Build the part", model: { providerID: "fake", modelID: "fake" }, continues: 0 }),
      (event) => event.type === "tool_result" ? Effect.fail(new Error("UI disconnected")) : Effect.void)).catch(() => undefined)
    if (scenario === "late-disconnect") resolvePrompt()
    await disconnected
    resolvePrompt()
    await inspectedGate
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(prompts).toBe(scenario === "pending" ? 2 : 1)
  })
}
