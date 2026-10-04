import { describe, expect, test } from "bun:test"
import { LLM } from "../src"
import type { ProviderOptions, ProviderOptionsOf, TypedModelRef } from "../src/schema"
import * as Anthropic from "../src/providers/anthropic"
import * as OpenAI from "../src/providers/openai"
import * as Cloudflare from "../src/providers/cloudflare"
import * as XAI from "../src/providers/xai"
import * as OpenAIChat from "../src/protocols/openai-chat"
import type { AnthropicProviderOptionsInput } from "../src/providers/anthropic-options"

type Expect<T extends true> = T
type Equals<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false
type Assignable<From, To> = From extends To ? true : false

describe("provider option typing", () => {
  test("a provider model carries its option shape", () => {
    const model = Anthropic.model("claude-opus-4")

    type Carried = ProviderOptionsOf<typeof model>
    type _carried = Expect<Equals<Carried, AnthropicProviderOptionsInput>>

    // The carrier is phantom: nothing is added to the value.
    expect(Object.keys(model)).not.toContain("ProviderOptionsCarrier")
    expect(String(model.provider)).toBe("anthropic")
  })

  test("a typed model is still an ordinary ModelRef", () => {
    const model = OpenAI.chat("gpt-4o-mini")
    type _assignable = Expect<Assignable<typeof model, import("../src/schema").ModelRef>>

    expect(model.route).toBe("openai-chat")
  })

  test("an untyped model falls back to the open ProviderOptions record", () => {
    const model = OpenAIChat.model({ id: "gpt-4o-mini", baseURL: "https://example.test/v1" })

    type Fallback = ProviderOptionsOf<typeof model>
    type _fallback = Expect<Equals<Fallback, ProviderOptions>>

    // Unknown provider keys must still be accepted — nikcli cannot know every provider's knobs.
    const request = LLM.request({
      model,
      prompt: "hi",
      providerOptions: { somethingNew: { experimental: true } },
    })
    expect(request.providerOptions).toEqual({ somethingNew: { experimental: true } })
  })

  test("known options survive the round trip onto the request", () => {
    const model = Anthropic.model("claude-opus-4")
    const request = LLM.request({
      model,
      prompt: "hi",
      providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: 4_000 } } },
    })

    expect(request.providerOptions?.anthropic).toMatchObject({
      thinking: { type: "enabled", budgetTokens: 4_000 },
    })
  })

  test("a misspelled option for a known provider is rejected at the type level", () => {
    const model = Anthropic.model("claude-opus-4")

    // `thinking` is the documented field; `thinkingBudget` is not. Before the option type was
    // carried on the model this compiled and the provider silently ignored the value.
    // @ts-expect-error unknown Anthropic option
    const bad: ProviderOptionsOf<typeof model>["anthropic"] = { thinking: { type: "enabled", budget: 4_000 } }
    expect(bad).toBeDefined()
  })

  test("every wired provider carries a non-generic option type", () => {
    // Guards against a provider quietly losing its annotation in a refactor: the fallback is the
    // open record, so a regression here is invisible at the call site.
    type NotGeneric<M> = Equals<ProviderOptionsOf<M>, ProviderOptions> extends true ? false : true

    type _anthropic = Expect<NotGeneric<ReturnType<typeof Anthropic.model>>>
    type _openai = Expect<NotGeneric<ReturnType<typeof OpenAI.chat>>>
    type _xai = Expect<NotGeneric<ReturnType<typeof XAI.chat>>>
    type _cloudflare = Expect<NotGeneric<ReturnType<typeof Cloudflare.aiGateway>>>

    expect(true).toBe(true)
  })

  test("TypedModelRef accepts an explicit option type", () => {
    type Custom = ProviderOptions & { readonly custom?: { readonly flag: boolean } }
    type Model = TypedModelRef<Custom>
    type _custom = Expect<Equals<ProviderOptionsOf<Model>, Custom>>
    expect(true).toBe(true)
  })
})
