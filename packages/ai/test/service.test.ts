import { describe, expect, test } from "bun:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { Effect, Layer, Redacted, Stream } from "effect"
import { AiConfig } from "../src/ai-config.ts"
import { AiCredentials } from "../src/credentials.ts"
import { DirectModel, type LanguageModelFactory } from "../src/direct-model.ts"
import { analyzeGcode } from "../src/gcode-analysis.ts"
import { render, systemPrompt } from "../src/prompts/system.ts"
import { AiHost, AiService } from "../src/service.ts"
import type { NikCliRuntime } from "../src/nikcli/runtime.ts"
import { BackgroundTaskManager } from "../src/nikcli/background-tasks.ts"
import { buildTools, TOOL_IDS, type ToolHandlersShape } from "../src/tools/catalogue.ts"

const usage = {
  inputTokens: { total: 4, noCache: 4, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 6, text: 6, reasoning: undefined }
}
const streamModel = (parts: string[]) =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t" },
          ...parts.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
          { type: "text-end", id: "t" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }
        ]
      })
    })
  })

const objectModel = (title: string) => new MockLanguageModelV4({
  doGenerate: async () => ({
    content: [{ type: "text", text: JSON.stringify({ title }) }],
    finishReason: { unified: "stop", raw: undefined },
    usage,
    warnings: []
  })
})

const layer = (factory: LanguageModelFactory) => {
  const base = Layer.mergeAll(AiCredentials.layer, AiConfig.layer({ dataDir: "/unused", forceGateway: false }))
  return AiService.layer.pipe(Layer.provideMerge(DirectModel.layerWith(factory).pipe(Layer.provideMerge(base))))
}

describe("AiService without the embedded host", () => {
  test("models lists the catalogue and marks configured providers", async () => {
    const program = Effect.gen(function* () {
      const credentials = yield* AiCredentials
      const ai = yield* AiService
      const before = yield* ai.models
      yield* credentials.set("anthropic", Redacted.make("sk-test-1234"))
      const after = yield* ai.models
      return { before, after }
    })
    const { before, after } = await Effect.runPromise(program.pipe(Effect.provide(layer(() => streamModel(["x"])))))
    expect(before.every((m) => !m.configured)).toBe(true)
    expect(after.filter((m) => m.configured).every((m) => m.provider === "anthropic")).toBe(true)
    expect(after.some((m) => m.configured)).toBe(true)
  })

  test("providers lists the built-ins with their tier defaults and key state", async () => {
    const program = Effect.gen(function* () {
      const credentials = yield* AiCredentials
      const ai = yield* AiService
      const before = yield* ai.providers
      yield* credentials.set("minimax", Redacted.make("mm-key"))
      const after = yield* ai.providers
      return { before, after }
    })
    const { before, after } = await Effect.runPromise(program.pipe(Effect.provide(layer(() => streamModel(["x"])))))
    // Without the host the catalogue is the built-ins — never an empty list, because an
    // empty catalogue is what the settings screen used to show when the host had none.
    expect(before.length).toBeGreaterThanOrEqual(4)
    expect(before.every((p) => p.models.length > 0)).toBe(true)
    expect(before.every((p) => !p.configured)).toBe(true)
    const minimax = after.find((p) => p.id === "minimax")
    expect(minimax?.configured).toBe(true)
    expect(minimax?.models.map((m) => m.id)).toContain("MiniMax-M2")
    // The catalogue says "configured" without the status call ever being made.
    expect(after.find((p) => p.id === "anthropic")?.configured).toBe(false)
  })

  test("chat streams deltas then done with usage", async () => {
    const program = Effect.gen(function* () {
      yield* (yield* AiCredentials).set("anthropic", Redacted.make("sk-test-1234"))
      const events = yield* (yield* AiService).chat({ message: "hi", context: "Drawing: 3 lines" }).pipe(Stream.runCollect)
      return events
    })
    const events = await Effect.runPromise(program.pipe(Effect.provide(layer(() => streamModel(["Hel", "lo"])))))
    expect(events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text)).toEqual(["Hel", "lo"])
    const done = events.at(-1)
    expect(done).toMatchObject({ type: "done", text: "Hello", usage: { inputTokens: 4, outputTokens: 6 } })
  })

  test("chat without any key fails with a config error", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () { return yield* (yield* AiService).chat({ message: "hi" }).pipe(Stream.runCollect) }).pipe(Effect.provide(layer(() => streamModel([]))))
    )
    expect(exit._tag).toBe("Failure")
  })

  test("structured workflows cache successes and invalidate them when credentials change", async () => {
    let calls = 0
    const program = Effect.gen(function*() {
      const credentials = yield* AiCredentials
      const ai = yield* AiService
      yield* credentials.set("openai", Redacted.make("sk-first"))
      const first = yield* ai.suggestTitle({ excerpt: "A machined bracket" })
      const second = yield* ai.suggestTitle({ excerpt: "A machined bracket" })
      yield* credentials.set("openai", Redacted.make("sk-second"))
      const third = yield* ai.suggestTitle({ excerpt: "A machined bracket" })
      return { first, second, third }
    })
    const result = await Effect.runPromise(program.pipe(Effect.provide(layer(() => {
      calls++
      return objectModel(`Bracket ${calls}`)
    }))))
    expect(result.first).toEqual({ title: "Bracket 1" })
    expect(result.second).toEqual({ title: "Bracket 1" })
    expect(result.third).toEqual({ title: "Bracket 2" })
    expect(calls).toBe(2)
  })
})

describe("gcode analysis", () => {
  test("flags cutting without spindle or feed, rapids below zero, and out-of-travel moves", () => {
    const report = analyzeGcode(["G21", "G90", "G1 X10 Y10", "G0 Z-2", "M3 S5000", "G1 X500 F300", "M30"].join("\n"), {
      workVolume: { x: 100, y: 100, z: 50 }, maxSpindleSpeed: 4000
    })
    const codes = report.issues.map((i) => i.code)
    expect(codes).toContain("CUT_WITHOUT_SPINDLE")
    expect(codes).toContain("CUT_WITHOUT_FEED")
    expect(codes).toContain("RAPID_BELOW_ZERO")
    expect(codes).toContain("SPINDLE_OVER_LIMIT")
    expect(codes).toContain("OUT_OF_TRAVEL")
    expect(report.stats.cutMoves).toBe(2)
  })

  test("a clean program has no issues", () => {
    const report = analyzeGcode(["G21", "G90", "M3 S1000", "G0 X0 Y0", "G1 Z-1 F100", "G1 X10", "G0 Z5", "M30"].join("\n"))
    expect(report.issues).toEqual([])
    expect(report.stats.bounds?.max.x).toBe(10)
  })
})

describe("prompts and tools", () => {
  test("the renderer fills variables and drops missing ones", () => {
    expect(render("a {{x}} b {{y}}", { x: "1" })).toBe("a 1 b ")
    expect(systemPrompt("hello")).toContain("Current context:\nhello")
    expect(systemPrompt()).not.toContain("{{")
  })

  test("every catalogued tool exists and delete demands confirmation", async () => {
    const calls: string[] = []
    const handlers = new Proxy({} as ToolHandlersShape, {
      get: (_t, name: string) => async () => { calls.push(name); return { ok: true } }
    })
    const tools = buildTools(handlers, "p1")
    expect(tools.map((t) => t.id).sort()).toEqual([...TOOL_IDS].sort())
    const del = tools.find((t) => t.id === "cad_edit")!
    const ctx = { sessionId: "s", projectId: "p1", signal: new AbortController().signal }
    expect(JSON.parse(await del.execute({ action: "delete", ids: ["a"], confirm: false }, ctx))).toMatchObject({ ok: false })
    expect(calls).toEqual([])
    await del.execute({ action: "delete", ids: ["a"], confirm: true }, ctx)
    expect(calls).toEqual(["deleteEntities"])
    // One tool, two capabilities: the action says which, and a refused delete never reaches a handler.
    const rejected = JSON.parse(await del.execute({ action: "add_entities", entities: [{ type: "circle", center: { x: 0, y: 0 }, radius: -1 }] }, ctx)) as { ok: boolean }
    expect(rejected.ok).toBe(false)
  })
})


test("catalogue reads share one acquisition and connected-only reads skip host startup without credentials", async () => {
  let acquisitions = 0
  const runtime = {
    catalogueReady: Promise.resolve("present"),
    host: () => Effect.succeed({ client: { provider: {
      list: async () => {
        acquisitions++
        await new Promise((resolve) => setTimeout(resolve, 20))
        return { all: [{ id: "openai", name: "OpenAI", models: { "test-model": { name: "Test", limit: { context: 100, output: 10 }, capabilities: { toolcall: true } } } }] }
      },
      auth: async () => ({ openai: [{ type: "api" }] })
    } } })
  } as unknown as NikCliRuntime
  const base = Layer.mergeAll(AiCredentials.layer, AiConfig.layer({ dataDir: "/unused", forceGateway: false }), Layer.succeed(AiHost, { runtime, scheduler: new BackgroundTaskManager({}) }))
  const live = AiService.layer.pipe(Layer.provideMerge(DirectModel.layerWith(() => streamModel(["x"])).pipe(Layer.provideMerge(base))))
  await Effect.runPromise(Effect.gen(function*() {
    const ai = yield* AiService
    expect(yield* ai.availableModels).toEqual([])
    expect(acquisitions).toBe(0)
    const [providers, models] = yield* Effect.all([ai.providers, ai.models], { concurrency: "unbounded" })
    expect(providers).toHaveLength(1)
    expect(models).toHaveLength(1)
    expect(acquisitions).toBe(1)
    yield* ai.invalidateCatalogue
    yield* ai.providers
    expect(acquisitions).toBe(2)
  }).pipe(Effect.provide(live)))
})

test("a gateway credential does not advertise unrelated providers as connected", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const credentials = yield* AiCredentials
    const ai = yield* AiService
    yield* credentials.set("gateway", Redacted.make("test-gateway-key"))
    expect((yield* ai.providers).filter((provider) => provider.configured).map((provider) => provider.id)).toEqual(["gateway"])
    expect((yield* ai.availableModels).every((model) => model.provider === "gateway")).toBe(true)
    expect((yield* ai.availableModels).length).toBeGreaterThan(0)
  }).pipe(Effect.provide(layer(() => streamModel(["x"])))))
})
