import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { LLM, LLMError } from "../src"
import { TestLLM } from "../src/testing"
import { it } from "./lib/effect"

const request = () =>
  LLM.request({
    id: "req_test",
    model: TestLLM.model(),
    prompt: "Say hello.",
  })

const run = <A>(llm: TestLLM.Instance, effect: Effect.Effect<A, LLMError, TestLLM.Env>) =>
  effect.pipe(Effect.provide(llm.layer))

describe("TestLLM", () => {
  it.effect("serves scripted text in push order", () =>
    Effect.gen(function* () {
      const llm = TestLLM.of(TestLLM.text("first"), TestLLM.text("second"))

      const one = yield* run(llm, LLM.generate(request()))
      const two = yield* run(llm, LLM.generate(request()))

      expect(one.text).toBe("first")
      expect(two.text).toBe("second")
      expect(llm.exhausted()).toBe(true)
    }),
  )

  it.effect("emits tool calls with the declared name and input", () =>
    Effect.gen(function* () {
      const llm = TestLLM.of(TestLLM.toolCall("read", { filePath: "a.ts" }))

      const response = yield* run(llm, LLM.generate(request()))

      expect(response.toolCalls).toHaveLength(1)
      expect(response.toolCalls[0]?.name).toBe("read")
      expect(response.toolCalls[0]?.input).toEqual({ filePath: "a.ts" })
    }),
  )

  it.effect("fails an unscripted request instead of replaying the last response", () =>
    Effect.gen(function* () {
      // The point of strict mode: a test that drives one more turn than it scripted should fail
      // where it diverged, not quietly re-serve the previous turn and fail somewhere unrelated.
      const llm = TestLLM.of(TestLLM.text("only one"))

      yield* run(llm, LLM.generate(request()))
      const error = yield* run(llm, LLM.generate(request())).pipe(Effect.flip)

      expect(error).toBeInstanceOf(LLMError)
      expect(llm.requests()).toHaveLength(2)
    }),
  )

  it.effect("serves the fallback once the queue drains", () =>
    Effect.gen(function* () {
      const llm = TestLLM.make()
      llm.push(TestLLM.text("scripted"))
      llm.fallback(TestLLM.text("fallback"))

      yield* run(llm, LLM.generate(request()))
      const extra = yield* run(llm, LLM.generate(request()))

      expect(extra.text).toBe("fallback")
    }),
  )

  it.effect("always() ignores the queue entirely", () =>
    Effect.gen(function* () {
      const llm = TestLLM.make()
      llm.push(TestLLM.text("never served"))
      llm.always(TestLLM.text("always"))

      const response = yield* run(llm, LLM.generate(request()))

      expect(response.text).toBe("always")
      expect(llm.remaining()).toBe(1)
    }),
  )

  it.effect("records the request bodies the code under test sent", () =>
    Effect.gen(function* () {
      const llm = TestLLM.of(TestLLM.text("ok"))

      yield* run(llm, LLM.generate(request()))

      expect(llm.requests()).toHaveLength(1)
      expect(llm.requests()[0]?.body).toContain("Say hello.")
      expect(llm.requests()[0]?.url).toContain("llm.test")
    }),
  )

  it.effect("scripts a provider failure for error-path tests", () =>
    Effect.gen(function* () {
      const llm = TestLLM.make()
      llm.always(TestLLM.failure(401, "bad key"))

      const error = yield* run(llm, LLM.generate(request())).pipe(Effect.flip)

      expect(error.reason._tag).toBe("Authentication")
    }),
  )
})
