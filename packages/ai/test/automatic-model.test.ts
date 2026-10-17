import { expect, test } from "bun:test"
import { automaticModel, type HostModelInfo, type HostProviderInfo } from "../src/nikcli/catalog.ts"

const model = (id: string, tools: boolean): HostModelInfo => ({ id, name: id, provider: "openrouter", contextWindow: 1, maxOutput: 1, reasoning: false, variants: [], tools, vision: false, cost: { input: 0, output: 0 } })
const provider = (models: HostModelInfo[], defaultModel?: string): HostProviderInfo => ({ id: "openrouter", name: "OpenRouter", source: "models.dev", auth: ["api"], models, ...(defaultModel ? { defaultModel } : {}) })

test("Automatic on a catalogue provider runs the host's default model when it can use tools", () => {
  expect(automaticModel(provider([model("a/chat", true), model("z/default", true)], "z/default"))?.id).toBe("z/default")
})

test("Automatic skips a default that cannot use tools, and never invents the provider id as a model", () => {
  expect(automaticModel(provider([model("a/chat-only", false), model("b/agent", true)], "a/chat-only"))?.id).toBe("b/agent")
  expect(automaticModel(provider([model("a/chat-only", false)]))).toBeUndefined()
  expect(automaticModel(provider([]))?.id).toBeUndefined()
})
