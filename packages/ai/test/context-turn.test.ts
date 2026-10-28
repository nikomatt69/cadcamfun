import { describe, expect, test } from "bun:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { Effect, Layer, Redacted, Stream } from "effect"
import { AiConfig } from "../src/ai-config.ts"
import { assembleContextParts, contextSections, type ObservationInput } from "../src/context-assembly.ts"
import { AiCredentials } from "../src/credentials.ts"
import { DirectModel } from "../src/direct-model.ts"
import { AiHost, AiService } from "../src/service.ts"
import { BackgroundTaskManager } from "../src/nikcli/background-tasks.ts"
import type { NikCliRuntime, ProjectHost } from "../src/nikcli/runtime.ts"

type StoredPart = { id: string; type: string; text?: string; synthetic?: boolean; metadata?: Record<string, unknown> }
type Prompt = { system?: string; parts: StoredPart[] }

/** A host that stores the user message of each prompt the way the pinned host does: parts keep `synthetic` and `metadata`. */
const fixture = () => {
  const prompts: Prompt[] = []
  const messages: Array<{ info: { id: string; role: string; finish?: string; summary?: boolean }; parts: StoredPart[] }> = []
  const idle = new Set<(sessionId: string) => void>()
  const host = { projectId: "p", directory: "/scratch/p", client: {
    session: {
      get: async () => ({ id: "ses_a", title: "Chat", directory: "/scratch/p" }),
      create: async () => ({ id: "ses_a", title: "Chat", directory: "/scratch/p" }),
      abort: async () => true,
      messages: async () => messages
    },
    events: { subscribe: async function* () {
      const done = Promise.withResolvers<string>()
      idle.add(done.resolve)
      try { yield { type: "server.connected", properties: {} }; yield { type: "session.idle", properties: { sessionID: await done.promise } } } finally { idle.delete(done.resolve) }
    } },
    "session-prompt": { prompt: async (input: { sessionID: string; system?: string; parts: StoredPart[] }) => {
      prompts.push({ ...(input.system !== undefined ? { system: input.system } : {}), parts: input.parts })
      messages.push({ info: { id: `u${messages.length}`, role: "user" }, parts: input.parts })
      messages.push({ info: { id: `a${messages.length}`, role: "assistant", finish: "stop" }, parts: [{ id: "t", type: "text", text: "Done." }] })
      for (const notify of idle) notify(input.sessionID)
      return { info: { id: "answer", role: "assistant", finish: "stop" }, parts: [{ id: "text", type: "text", text: "Done." }] }
    } }
  } } as unknown as ProjectHost
  const runtime = { host: () => Effect.succeed(host) } as unknown as NikCliRuntime
  const base = Layer.mergeAll(AiCredentials.layer, AiConfig.layer({ dataDir: "/unused", forceGateway: false }), Layer.succeed(AiHost, { runtime, scheduler: new BackgroundTaskManager({}) }))
  return { prompts, messages, layer: AiService.layer.pipe(Layer.provideMerge(DirectModel.layer.pipe(Layer.provideMerge(base)))) }
}

const rules = "Project rules: 0.02 mm tolerance."
const stateA: ObservationInput = { text: "Workspace: CAD editor.\nModel: 2 elements; 1 selected (e-1).", drawingId: "d-1" }
const stateB: ObservationInput = { ...stateA, text: `${stateA.text}\nModel: 3 elements.` }
const sections = contextSections(assembleContextParts([
  { id: "project-rules", kind: "requirement", label: "project rules", text: rules },
  { id: "client-observation", kind: "observation", label: "editor state", text: stateA.text }
]))

describe("a chat turn carries stable context in the system block and the observation in the message", () => {
  test("new, unchanged, changed: one part per change, the system block never moves", async () => {
    const f = fixture()
    const turn = (message: string, observation: ObservationInput) => Effect.gen(function* () {
      yield* (yield* AiCredentials).set("openai", Redacted.make("offline-test"))
      return yield* (yield* AiService).chat({ projectId: "p", sessionId: "ses_a", message, context: rules, observation, contextSections: sections, admitSession: async () => true }).pipe(Stream.runCollect)
    }).pipe(Effect.provide(f.layer), Effect.runPromise)
    const snapshot = (events: ReadonlyArray<{ type: string }>) => events.find((event) => event.type === "context_snapshot") as { chars: number; sections?: unknown; observation?: string } | undefined

    const one = await turn("first", stateA)
    expect(f.prompts[0]!.parts.map((part) => [part.type, part.synthetic ?? false])).toEqual([["text", false], ["text", true]])
    expect(f.prompts[0]!.parts[1]!.text).toContain("<editor_state drawing=\"d-1\"")
    expect(f.prompts[0]!.system).toContain(rules)
    expect(f.prompts[0]!.system).not.toContain("editor_state")
    expect(f.prompts[0]!.system).not.toContain("1 selected")
    expect(snapshot(one)).toMatchObject({ chars: rules.length + stateA.text.length, sections, observation: "sent" })

    const two = await turn("second", stateA)
    expect(f.prompts[1]!.parts.map((part) => part.type)).toEqual(["text"])
    expect(f.prompts[1]!.system).toBe(f.prompts[0]!.system)
    expect(snapshot(two)?.observation).toBe("unchanged")

    const three = await turn("third", stateB)
    expect(f.prompts[2]!.parts.map((part) => [part.type, part.synthetic ?? false])).toEqual([["text", false], ["text", true]])
    expect(f.prompts[2]!.system).toBe(f.prompts[0]!.system)
    expect(snapshot(three)?.observation).toBe("sent")
    // The stored history is only ever appended to.
    expect(f.messages.filter((message) => message.info.role === "user").map((message) => message.parts.length)).toEqual([2, 1, 2])
  })

  test("a turn after a compaction summary sends the observation again", async () => {
    const f = fixture()
    const turn = Effect.gen(function* () {
      yield* (yield* AiCredentials).set("openai", Redacted.make("offline-test"))
      return yield* (yield* AiService).chat({ projectId: "p", sessionId: "ses_a", message: "go", context: rules, observation: stateA, admitSession: async () => true }).pipe(Stream.runCollect)
    }).pipe(Effect.provide(f.layer))
    await Effect.runPromise(turn)
    f.messages.push({ info: { id: "summary", role: "assistant", summary: true, finish: "stop" }, parts: [{ id: "s", type: "text", text: "Summary." }] })
    await Effect.runPromise(turn)
    expect(f.prompts.map((prompt) => prompt.parts.length)).toEqual([2, 2])
  })

  test("a /goal line runs the host's command: no part is built and the event says it was skipped", async () => {
    const f = fixture()
    const events = await Effect.runPromise(Effect.gen(function* () {
      yield* (yield* AiCredentials).set("openai", Redacted.make("offline-test"))
      return yield* (yield* AiService).chat({ projectId: "p", sessionId: "ses_a", message: "/goal status", context: rules, observation: stateA, admitSession: async () => true }).pipe(Stream.runCollect)
    }).pipe(Effect.provide(f.layer)))
    expect(f.prompts).toEqual([])
    expect(events.find((event) => event.type === "context_snapshot")).toMatchObject({ observation: "skipped" })
  })
})

describe("without the embedded host", () => {
  test("one stateless call has no session to hold an observation: it stays in the system prompt", async () => {
    let system = ""
    const usage = { inputTokens: { total: 4, noCache: 4, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 6, text: 6, reasoning: undefined } }
    const model = new MockLanguageModelV4({ doStream: async (options) => {
      system = (options.prompt ?? []).filter((message) => message.role === "system").map((message) => message.content).join("\n\n")
      return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "ok" }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }] }) }
    } })
    const base = Layer.mergeAll(AiCredentials.layer, AiConfig.layer({ dataDir: "/unused", forceGateway: false }))
    const layer = AiService.layer.pipe(Layer.provideMerge(DirectModel.layerWith(() => model).pipe(Layer.provideMerge(base))))
    await Effect.runPromise(Effect.gen(function* () {
      yield* (yield* AiCredentials).set("anthropic", Redacted.make("sk-test-1234"))
      yield* (yield* AiService).chat({ message: "hi", context: rules, observation: stateA }).pipe(Stream.runCollect)
    }).pipe(Effect.provide(layer)))
    expect(system).toContain(rules)
    expect(system).toContain("<editor_state drawing=\"d-1\"")
    expect(system).toContain("1 selected (e-1)")
  })
})
