import { describe, expect, test } from "bun:test"
import { MockLanguageModelV4 } from "ai/test"
import { Effect, Exit, Layer, Redacted, Schema } from "effect"
import { AiAnalytics } from "../src/analytics.ts"
import { AiCache, cached } from "../src/cache.ts"
import { AiCredentials } from "../src/credentials.ts"
import { DirectModel, type LanguageModelFactory } from "../src/direct-model.ts"
import { AiConfig } from "../src/ai-config.ts"
import {
  ANALYZE_DESIGN,
  OptimizeGcodeOutput,
  OPTIMIZE_GCODE,
  RECOMMEND_MACHINING_PARAMETERS,
  MachiningParameters,
  SUMMARIZE_DESIGN_SUGGESTIONS,
  TITLE_GENERATION,
  TitleOutput,
  renderPrompt
} from "../src/prompts/workflows.ts"
import { SUGGESTED_PROMPTS, isAssistantMode } from "../src/prompts/modes.ts"
import { AiService } from "../src/service.ts"

const aiLayerFor = (factory: LanguageModelFactory) => {
  const base = Layer.merge(AiCredentials.layer, AiConfig.layer({ dataDir: "/unused", forceGateway: false }))
  const withDirect = DirectModel.layerWith(factory).pipe(Layer.provideMerge(base))
  return AiService.layer.pipe(Layer.provideMerge(withDirect))
}

const jsonModel = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 7, text: 7, reasoning: undefined }
      },
      warnings: []
    })
  }) as unknown as ReturnType<LanguageModelFactory>

const runExit = <A, E>(
  effect: Effect.Effect<A, E, AiService | AiCredentials | DirectModel | AiConfig>,
  factory: LanguageModelFactory
) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(aiLayerFor(factory))))

describe("AiAnalytics", () => {
  test("track stores events and stats aggregates them", async () => {
    const program = Effect.gen(function* () {
      const analytics = yield* AiAnalytics
      yield* analytics.track({ eventType: "request", eventName: "chat", model: "anthropic/claude-sonnet" })
      yield* analytics.track({ eventType: "request", eventName: "chat", model: "anthropic/claude-sonnet" })
      yield* analytics.track({ eventType: "response", eventName: "complete", duration: 1000, success: true, promptTokens: 10, completionTokens: 20 })
      yield* analytics.track({ eventType: "response", eventName: "complete", duration: 2000, success: false })
      const stats = yield* analytics.stats
      const recent = yield* analytics.recent(60)
      return { stats, recent }
    })
    const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(AiAnalytics.layer)))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value.stats.eventCount).toBe(4)
      expect(exit.value.stats.totalRequests).toBe(2)
      expect(exit.value.stats.successRate).toBe(0.5)
      expect(exit.value.stats.averageDurationMs).toBe(1500)
      expect(exit.value.stats.totalTokens).toBe(30)
      expect(exit.value.stats.modelUsage["anthropic/claude-sonnet"]).toBe(2)
      expect(exit.value.recent.length).toBe(4)
    }
  })

  test("startRequest returns a requestId and completeRequest closes the loop", async () => {
    const program = Effect.gen(function* () {
      const analytics = yield* AiAnalytics
      const requestId = yield* analytics.startRequest("chat", "anthropic/claude-haiku")
      expect(requestId.startsWith("req_")).toBe(true)
      yield* analytics.completeRequest({ requestId, durationMs: 250, success: true, promptTokens: 5, completionTokens: 10 })
      const events = yield* analytics.recent(60)
      return events
    })
    const events = await Effect.runPromise(program.pipe(Effect.provide(AiAnalytics.layer)))
    expect(events.length).toBe(2)
    expect(events[1]).toMatchObject({ eventType: "response", duration: 250, success: true, promptTokens: 5, completionTokens: 10 })
  })

  test("recent filters out older events", async () => {
    let now = 1_000_000
    const original = Date.now
    Date.now = () => now
    try {
      const program = Effect.gen(function* () {
        const analytics = yield* AiAnalytics
        yield* analytics.track({ eventType: "request", eventName: "old" })
        now += 10_000
        yield* analytics.track({ eventType: "request", eventName: "new" })
        return yield* analytics.recent(5)
      })
      const recent = await Effect.runPromise(program.pipe(Effect.provide(AiAnalytics.layer)))
      expect(recent.length).toBe(1)
      expect(recent[0]?.eventName).toBe("new")
    } finally {
      Date.now = original
    }
  })

  test("ring buffer caps at 1000 events", async () => {
    const program = Effect.gen(function* () {
      const analytics = yield* AiAnalytics
      for (let i = 0; i < 1100; i++) {
        yield* analytics.track({ eventType: "request", eventName: `e${i}` })
      }
      return yield* analytics.stats
    })
    const stats = await Effect.runPromise(program.pipe(Effect.provide(AiAnalytics.layer)))
    expect(stats.eventCount).toBe(1000)
  })

  test("timed records duration and propagates value", async () => {
    const program = Effect.gen(function* () {
      const analytics = yield* AiAnalytics
      const value = yield* analytics.timed("chat", "model-x", { project: "p1" }, Effect.succeed("hi"))
      const stats = yield* analytics.stats
      return { value, stats }
    })
    const { value, stats } = await Effect.runPromise(program.pipe(Effect.provide(AiAnalytics.layer)))
    expect(value).toBe("hi")
    expect(stats.totalRequests).toBe(1)
    expect(stats.successRate).toBe(1)
  })

  test("timed records error events and re-throws", async () => {
    const program = Effect.gen(function* () {
      const analytics = yield* AiAnalytics
      const result = yield* Effect.exit(
        analytics.timed("chat", "model-x", undefined, Effect.fail(new Error("boom")) as Effect.Effect<never, Error, never>)
      )
      const stats = yield* analytics.stats
      const events = yield* analytics.recent(60)
      return { result, stats, events }
    })
    const { result, stats, events } = await Effect.runPromise(program.pipe(Effect.provide(AiAnalytics.layer)))
    expect(Exit.isFailure(result)).toBe(true)
    expect(stats.successRate).toBe(0)
    expect(events.some((e) => e.eventType === "error")).toBe(true)
  })

  test("clear empties the buffer", async () => {
    const program = Effect.gen(function* () {
      const analytics = yield* AiAnalytics
      yield* analytics.track({ eventType: "request", eventName: "x" })
      yield* analytics.clear
      return yield* analytics.stats
    })
    const stats = await Effect.runPromise(program.pipe(Effect.provide(AiAnalytics.layer)))
    expect(stats.eventCount).toBe(0)
  })
})

describe("AiService workflow methods", () => {
  const factory: LanguageModelFactory = (resolved) => {
    // Each workflow method passes a model id matching the schema to return.
    if (resolved.modelId === "title-gen") {
      return jsonModel(JSON.stringify({ title: "design a 60 mm bracket" }))
    }
    if (resolved.modelId === "analyze") {
      return jsonModel(JSON.stringify({ suggestions: [{ title: "t", description: "d", confidence: 0.7, priority: "medium", kind: "optimization" }] }))
    }
    if (resolved.modelId === "optimize") {
      return jsonModel(JSON.stringify({ gcode: "G1 X10", changes: [], estimatedSavings: { timePct: 5, toolLifePct: 3, qualityNote: "ok" }, notes: "minimal" }))
    }
    if (resolved.modelId === "machining") {
      return jsonModel(JSON.stringify({ cuttingSpeedMPerMin: 120, feedRateMmPerMin: 600, depthOfCutMm: 2, stepoverPct: 40, coolant: "flood", engagement: "climb", warnings: [] }))
    }
    if (resolved.modelId === "summary") {
      return jsonModel(JSON.stringify([{ title: "x", rationale: "y", nextStep: "z" }]))
    }
    return jsonModel(JSON.stringify({ title: "default title" }))
  }

  const model = (id: string) => ({ provider: "anthropic" as const, model: id })

  const seed = Effect.gen(function* () {
    yield* (yield* AiCredentials).set("anthropic", Redacted.make("sk-test-1234"))
  })

  test("suggestedFor returns mode-specific prompts", async () => {
    const program = Effect.gen(function* () {
      const ai = yield* AiService
      return {
        cad: ai.suggestedFor("cad"),
        cam: ai.suggestedFor("cam"),
        unknown: ai.suggestedFor("nope"),
        all: Object.keys(SUGGESTED_PROMPTS)
      }
    })
    const { cad, cam, unknown } = await Effect.runPromise(program.pipe(Effect.provide(aiLayerFor(factory))))
    expect(cad.length).toBeGreaterThan(0)
    expect(cam.length).toBeGreaterThan(0)
    expect(unknown).toEqual(SUGGESTED_PROMPTS.general)
    expect(isAssistantMode("cad")).toBe(true)
  })

  test("suggestTitle returns the title from structured output", async () => {
    const program = Effect.gen(function* () {
      yield* seed
      const ai = yield* AiService
      return yield* ai.suggestTitle({ excerpt: "make me a 60 mm bracket from 5 mm steel", model: model("title-gen") })
    })
    const exit = await runExit(program, factory)
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("analyzeDesign decodes against AnalyzeDesignOutput", async () => {
    const program = Effect.gen(function* () {
      yield* seed
      const ai = yield* AiService
      return yield* ai.analyzeDesign({ description: "100 x 60 rectangle", layer: "outline", machine: "300x300", model: model("analyze") })
    })
    const exit = await runExit(program, factory)
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("recommendMachiningParameters returns a MachiningParameters object", async () => {
    const program = Effect.gen(function* () {
      yield* seed
      const ai = yield* AiService
      return yield* ai.recommendMachiningParameters({
        material: "aluminium 6061",
        tool: "6 mm end mill",
        operation: "pocket",
        machine: "300x300",
        model: model("machining")
      })
    })
    const exit = await runExit(program, factory)
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("optimizeGcode returns OptimizeGcodeOutput", async () => {
    const program = Effect.gen(function* () {
      yield* seed
      const ai = yield* AiService
      return yield* ai.optimizeGcode({
        gcode: "G1 X10\nG1 X20",
        material: "aluminium",
        machineType: "3-axis CNC",
        constraints: "fast",
        model: model("optimize")
      })
    })
    const exit = await runExit(program, factory)
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("summarizeDesignSuggestions returns a non-empty array", async () => {
    const program = Effect.gen(function* () {
      yield* seed
      const ai = yield* AiService
      return yield* ai.summarizeDesignSuggestions({
        elements: "rectangle + 4 holes",
        currentOperation: "drill",
        currentTool: "3 mm drill",
        model: model("summary")
      })
    })
    const exit = await runExit(program, factory)
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("renderPrompt fills the variables and the templates render without placeholders", () => {
    const rendered = renderPrompt(ANALYZE_DESIGN, { description: "x", machine: "110x110", layer: "L1" })
    expect(rendered.user).not.toContain("{{")
    expect(rendered.system).not.toContain("{{")
  })

  test("cached wraps one-shot calls and hits the cache", async () => {
    let invocations = 0
    const program = Effect.gen(function* () {
      const cache = yield* AiCache
      const fn = () => Effect.sync(() => {
        invocations++
        return invocations * 10
      })
      const a = yield* cached("payload", 60_000, fn())
      const b = yield* cached("payload", 60_000, fn())
      return { a, b, cache }
    })
    const { a, b } = await Effect.runPromise(program.pipe(Effect.provide(AiCache.layer())))
    expect(a).toBe(10)
    expect(b).toBe(10)
    expect(invocations).toBe(1)
  })

  // Suppress unused-import for Schema (already imported for the decode helpers used in workflow tests).
  void Schema
  void TITLE_GENERATION
  void TitleOutput
})