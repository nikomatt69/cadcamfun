/**
 * The step budget of one run against the real embedded host. nikcli's processor ends a run on its last step with a forced
 * text-only "MAXIMUM STEPS REACHED" summary (`session/prompt/max-steps.txt`). The application owns the budget instead: a
 * long job that keeps completing tool calls renews it and goes on, and the summary the host forces never reaches the answer.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import type { AiEvent } from "../src/events.ts"
import { createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { PRIMARY_STEP_LIMIT, defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { makeNikCliRuntime, type NikCliRuntime } from "../src/nikcli/runtime.ts"
import { buildTools, type ToolHandlersShape } from "../src/tools/catalogue.ts"
import { startFakeOpenAi, type ChatRequestBody, type Completion } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(120_000)

const handlers = new Proxy({} as ToolHandlersShape, { get: () => async () => ({ total: 1, counts: { cube: 1 }, drawingId: "d", projectId: "p" }) })
let script: (request: ChatRequestBody, index: number) => Completion = () => ({ text: "hi" })
const fake = startFakeOpenAi((request, index) => script(request, index))
const fakeProvider: HostProviderSpec = {
  id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl,
  models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }]
}
const scope = Effect.runSync(Scope.make())
const runtime: NikCliRuntime = await Effect.runPromise(
  makeNikCliRuntime({ dataDir: sharedDataDir, providers: [...defaultProviderSpecs(), fakeProvider], systemPrompt: "You are the main agent.", toolsFor: (projectId) => buildTools(handlers, projectId) }).pipe(Scope.provide(scope))
)
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))
const model = { providerID: "fake", modelID: "fake-model" } as const
afterAll(async () => { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)); fake.stop() })

const run = async (message: string, project: string, extra: Partial<Parameters<typeof hostChatStream>[0]> = {}): Promise<ReadonlyArray<AiEvent>> => {
  const host = await Effect.runPromise(runtime.host(project))
  const sessionId = await Effect.runPromise(createHostSession(host, "step budget"))
  return Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId, message, model, continues: 0, ...extra }))).then((c) => [...c])
}

/** What a real model does with nikcli's forced last step: it obeys and writes the summary instead of the next call. */
const forcedSummary = (request: ChatRequestBody): boolean => JSON.stringify(request.messages).includes("MAXIMUM STEPS REACHED")

describe("the step budget belongs to the application", () => {
  test("a long job without a plan goes past one run's budget instead of ending on the host's forced summary", async () => {
    const total = PRIMARY_STEP_LIMIT + 10
    let calls = 0
    let summaries = 0
    script = (request) => {
      if (forcedSummary(request) && request.messages.at(-1)?.role === "assistant") {
        summaries += 1
        return { text: "Maximum steps reached. Remaining: the other checks." }
      }
      if (calls >= total) return { text: `All ${total} checks are done.` }
      calls += 1
      return { toolCalls: [{ name: "cad", args: { action: "describe", index: calls } }] }
    }
    const events = await run("check every feature", "step-budget-long")
    const done = events.at(-1)
    expect(done).toMatchObject({ type: "done" })
    expect((done as Extract<AiEvent, { type: "done" }>).text).toBe(`All ${total} checks are done.`)
    expect(calls).toBe(total)
    expect(summaries).toBe(0)
    expect(events.some((event) => event.type === "turn" && event.phase === "continuing")).toBe(true)
  })
})

describe("a /goal turn keeps the same budget", () => {
  test("a long goal iteration renews its budget instead of being cut by the host's forced summary", async () => {
    const total = PRIMARY_STEP_LIMIT + 10
    let calls = 0
    let summaries = 0
    let completed = false
    script = (request) => {
      if (forcedSummary(request) && request.messages.at(-1)?.role === "assistant") {
        summaries += 1
        return { text: "Maximum steps reached. Remaining: the other checks." }
      }
      if (calls < total) {
        calls += 1
        return { toolCalls: [{ name: "cad", args: { action: "describe", index: calls } }] }
      }
      if (!completed) {
        completed = true
        return { toolCalls: [{ name: "update_goal", args: { status: "complete" } }] }
      }
      return { text: `All ${total} checks are done.` }
    }
    const events = await run("/goal Check every feature", "step-budget-goal", { goalArguments: "Check every feature" })
    expect(calls).toBe(total)
    expect(summaries).toBe(0)
    expect(events.filter((e): e is Extract<AiEvent, { type: "goal" }> => e.type === "goal").at(-1)?.goal).toMatchObject({ status: "complete" })
    expect(events.at(-1)).toMatchObject({ type: "done" })
  })
})

describe("a full context window is cured by a summary, not by an error", () => {
  test("the provider rejects the request as too long: the session is compacted once and the turn carries on", async () => {
    let overflowed = false
    script = () => {
      if (!overflowed) {
        overflowed = true
        return { status: 400, body: JSON.stringify({ error: { message: "This model's maximum context length is 100000 tokens. However, your messages resulted in 180000 tokens.", code: "context_length_exceeded" } }) }
      }
      return { text: "The bracket is finished and checked." }
    }
    const events = await run("finish the bracket", "step-budget-overflow")
    expect(events.at(-1)).toMatchObject({ type: "done", text: "The bracket is finished and checked." })
    expect(events.some((event) => event.type === "compacted")).toBe(true)
    expect(events.some((event) => event.type === "turn" && event.phase === "recovering")).toBe(true)
  })

  test("a second overflow in the same turn is reported, never compacted again in a loop", async () => {
    let requests = 0
    script = () => {
      requests += 1
      return { status: 400, body: JSON.stringify({ error: { message: "prompt is too long: 250000 tokens > 200000 maximum", code: "context_length_exceeded" } }) }
    }
    const events = await run("finish the bracket", "step-budget-overflow-twice")
    expect(events.at(-1)).toMatchObject({ type: "error", code: "provider" })
    expect(requests).toBeLessThan(6)
  })
})
