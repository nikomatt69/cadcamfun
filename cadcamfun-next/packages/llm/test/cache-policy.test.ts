import { describe, expect, it } from "bun:test"
import { applyCachePolicy } from "../src/cache-policy"
import { CacheHint, LLM } from "../src"
import * as AnthropicMessages from "../src/protocols/anthropic-messages"
import * as OpenAIResponses from "../src/protocols/openai-responses"

const anthropic = AnthropicMessages.model({
  id: "claude-sonnet-4-5",
  baseURL: "https://api.anthropic.test/v1/",
  headers: { "x-api-key": "test" },
})

const openai = OpenAIResponses.model({
  id: "gpt-5.6",
  baseURL: "https://api.openai.test/v1/",
  headers: { authorization: "Bearer test" },
})

const systemParts = (texts: ReadonlyArray<string>) => texts.map((text) => LLM.system(text))

const hinted = (request: ReturnType<typeof LLM.request>) => ({
  system: request.system.map((part) => part.cache !== undefined),
  messages: request.messages.map((message) =>
    message.content.map((part) => "cache" in part && part.cache !== undefined),
  ),
})

describe("applyCachePolicy", () => {
  it("marks the first and last system block when several exist", () => {
    const result = applyCachePolicy(
      LLM.request({
        model: anthropic,
        system: systemParts(["environment", "command execution", "project instructions"]),
        prompt: "Say hello.",
      }),
    )

    expect(hinted(result).system).toEqual([true, false, true])
  })

  it("marks a single system block exactly once", () => {
    const result = applyCachePolicy(
      LLM.request({ model: anthropic, system: systemParts(["only"]), prompt: "Say hello." }),
    )

    expect(hinted(result).system).toEqual([true])
  })

  it("rolls the message breakpoints across the trailing two messages", () => {
    const result = applyCachePolicy(
      LLM.request({
        model: anthropic,
        system: systemParts(["one"]),
        messages: [LLM.user("first"), LLM.assistant("second"), LLM.user("third")],
      }),
    )

    expect(hinted(result).messages).toEqual([[false], [true], [true]])
  })

  it("never exceeds the four-breakpoint cap", () => {
    const result = applyCachePolicy(
      LLM.request({
        model: anthropic,
        system: systemParts(["a", "b", "c"]),
        messages: [LLM.user("first"), LLM.assistant("second"), LLM.user("third")],
      }),
    )

    const marks = hinted(result)
    const total = marks.system.filter(Boolean).length + marks.messages.flat().filter(Boolean).length
    expect(total).toBe(4)
  })

  it("preserves manual hints and budgets automatic placement around them", () => {
    const request = LLM.request({
      model: anthropic,
      system: [
        { type: "text", text: "a", cache: new CacheHint({ type: "ephemeral" }) },
        { type: "text", text: "b", cache: new CacheHint({ type: "ephemeral" }) },
        { type: "text", text: "c", cache: new CacheHint({ type: "ephemeral" }) },
      ],
      messages: [LLM.user("first"), LLM.assistant("second"), LLM.user("third")],
    })

    const marks = hinted(applyCachePolicy(request))
    // Three manual hints leave one slot, which goes to the final message —
    // the breakpoint that keeps rolling forward.
    expect(marks.system).toEqual([true, true, true])
    expect(marks.messages).toEqual([[false], [false], [true]])
  })

  it("is idempotent", () => {
    const once = applyCachePolicy(
      LLM.request({ model: anthropic, system: systemParts(["a", "b"]), prompt: "Say hello." }),
    )
    const twice = applyCachePolicy(once)

    expect(hinted(twice)).toEqual(hinted(once))
  })

  it("leaves the request untouched when the policy is disabled", () => {
    const request = LLM.request({
      model: anthropic,
      system: systemParts(["a", "b"]),
      prompt: "Say hello.",
      cache: "none",
    })

    expect(applyCachePolicy(request)).toBe(request)
  })

  it("is a no-op for protocols without breakpoints", () => {
    const request = LLM.request({ model: openai, system: systemParts(["a", "b"]), prompt: "Say hello." })

    expect(applyCachePolicy(request)).toBe(request)
  })
})
