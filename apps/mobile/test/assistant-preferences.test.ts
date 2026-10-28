import { expect, test } from "bun:test"
import { assistantModels, filterAssistantModels, formatContextWindow, formatVariantLabel, groupAssistantModels, modelFacts, rememberedSelection, resolveAssistantPreferences, selectedAssistantModel, type AssistantProvider } from "../lib/assistant-preferences"

const provider = (id: string, configured = true): AssistantProvider => ({ id, name: id, source: "config", auth: ["api"], configured, models: [
  { id: "family/model", name: "Model Pro", provider: id, contextWindow: 100_000, maxOutput: 4096, tools: true, vision: true, variants: ["low", "high"], cost: { input: 1, output: 2 } },
] })

test("mobile lists connected providers and preserves provider-qualified model identities", () => {
  const models = assistantModels([provider("second"), provider("first"), provider("unconnected", false)])
  expect(models.map((model) => model.provider)).toEqual(["first", "second"])
  expect(new Set(models.map((model) => model.key)).size).toBe(2)
  expect(models[0]?.variants).toEqual(["low", "high"])
  expect(models[0]).toMatchObject({ model: "family/model", tools: true, vision: true })
})

test("provider and model searches compose and invalid thinking selections never silently fall back", () => {
  const models = assistantModels([provider("first"), provider("second")])
  expect(filterAssistantModels(models, "model pro", "second").map((model) => model.provider)).toEqual(["second"])
  expect(filterAssistantModels(models, "first family/model")).toHaveLength(1)
  expect(selectedAssistantModel(models, { provider: "first", model: "family/model", variant: "high" })?.provider).toBe("first")
  expect(selectedAssistantModel(models, { provider: "first", model: "family/model", variant: "unavailable" })).toBeUndefined()
  expect(selectedAssistantModel(models, { provider: "removed", model: "family/model" })).toBeUndefined()
})

test("thinking levels are ordered and labelled like nikcli, and the last level per model is remembered only while offered", () => {
  const models = assistantModels([{ ...provider("first"), models: [
    { id: "deep:thinking", name: "Deep", provider: "first", contextWindow: 1, maxOutput: 1, tools: true, vision: false, cost: { input: 0, output: 0 } },
    { id: "pro", name: "Pro", provider: "first", contextWindow: 1, maxOutput: 1, tools: true, vision: false, variants: ["max", "custom", "low", "xhigh", "low"], cost: { input: 0, output: 0 } },
    { id: "plain", name: "Plain", provider: "first", contextWindow: 1, maxOutput: 1, tools: true, vision: false, cost: { input: 0, output: 0 } },
  ] }])
  const [deep, plain, pro] = models
  expect(pro?.variants).toEqual(["low", "xhigh", "max", "custom"])
  expect([deep?.badge, plain?.badge, pro?.badge]).toEqual(["Thinking", undefined, "Reasoning"])
  expect(formatVariantLabel("xhigh")).toBe("Extra high")
  expect(formatVariantLabel("very_low")).toBe("Very Low")
  expect(rememberedSelection(pro!, { [pro!.key]: "max" })).toEqual({ provider: "first", model: "pro", variant: "max" })
  expect(rememberedSelection(pro!, { [pro!.key]: "removed" })).toEqual({ provider: "first", model: "pro" })
})

test("projects without their own settings follow the phone defaults; a project's choice wins", () => {
  expect(resolveAssistantPreferences(undefined, { permissionMode: "ask", includeContext: false })).toEqual({ agent: "build", permissionMode: "ask", includeContext: false })
  expect(resolveAssistantPreferences({ agent: "machinist", permissionMode: "auto", includeContext: true }, { permissionMode: "ask", includeContext: false })).toEqual({ agent: "machinist", permissionMode: "auto", includeContext: true })
  // A corrupt stored default never becomes a permission mode the desktop does not know.
  // A project that stored one of the removed agents lands on Build; Plan and unknown ids are kept.
  for (const legacy of ["general", "cad", "cam", "cadcam", "cadcam-cad"]) expect(resolveAssistantPreferences({ agent: legacy }, undefined).agent, legacy).toBe("build")
  expect(resolveAssistantPreferences({ agent: "plan" }, undefined).agent).toBe("plan")
  expect(resolveAssistantPreferences(undefined, { permissionMode: "everything" as never }).permissionMode).toBe("approve")
})

test("the model picker groups models under their provider and describes each one with quiet facts", () => {
  const models = assistantModels([provider("second"), provider("first")])
  const groups = groupAssistantModels(models)
  expect(groups.map((group) => [group.provider, group.models.length])).toEqual([["first", 1], ["second", 1]])
  expect(groupAssistantModels([])).toEqual([])
  expect(modelFacts(models[0]!)).toEqual(["Reasoning", "family/model", "100k context", "Tools", "Vision", "2 thinking levels"])
  const plain = { ...models[0]!, name: "same", model: "same", badge: undefined, variants: [], contextWindow: 0, tools: false, vision: false }
  expect(modelFacts(plain)).toEqual(["Chat only"])
  expect(modelFacts({ ...plain, variants: ["low"] })).toEqual(["Chat only", "1 thinking level"])
})

test("context windows read as short labels", () => {
  expect([0, 512, 8192, 128_000, 1_000_000, 1_048_576, 2_000_000, Number.NaN].map(formatContextWindow)).toEqual(["", "512", "8k", "128k", "1M", "1M", "2M", ""])
})
