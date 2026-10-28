/**
 * Model-family routing and style blocks (spec 64 G5). The ids are the ones the stored sessions actually ran
 * (MiniMax-M3.1-Flash, gpt-6-luna / gpt-6-astra, gemini-4-argon-contributor, deepseek-v4.1-flash) plus the neighbours a
 * user can pick. A block exists to fix an observed failure of that family, so each one is held to the same contract.
 */
import { describe, expect, test } from "bun:test"
import { PRIMARIES } from "../src/nikcli/primaries.ts"
import { actionExists, actionReferences, PROMPT_BUDGETS } from "../src/prompts/corpus.ts"
import { agentSystemPrompt, FAMILY_SAMPLE_MODELS, modelFamilyOf, modelFamilyPrompt, turnSystemPrompt, type ModelFamilyId } from "../src/prompts/system.ts"

const ROUTES: ReadonlyArray<readonly [string, ModelFamilyId]> = [
  ["MiniMax-M3.1-Flash", "minimax"],
  ["minimax-coding-plan/MiniMax-M2", "minimax"],
  ["opencode-go/minimax-m3", "minimax"],
  ["glm-4.6", "glm"],
  ["z-ai/glm-4.5-air", "glm"],
  ["zai-glm-4.6", "glm"],
  ["qwen3-coder-480b", "qwen"],
  ["Qwen/Qwen3-235B-A22B", "qwen"],
  ["kimi-k2-0905", "kimi"],
  ["moonshotai/kimi-k2-thinking", "kimi"],
  ["deepseek-v4.1-flash", "deepseek"],
  ["deepseek-r1-distill-qwen-32b", "deepseek"],
  ["gemini-4-argon-contributor", "gemini-4"],
  ["google/gemini-4.0-pro", "gemini-4"],
  ["gemini-3-pro", "gemini"],
  ["gemini-2.5-flash-lite-preview-06-17", "gemini"],
  ["gpt-6-astra", "gpt-6"],
  ["openai/gpt-6-luna", "gpt-6"],
  ["gpt-5.2", "codex"],
  ["gpt-5-mini", "codex"],
  ["gpt-reserve", "codex"],
  ["gpt-4o", "autonomous"],
  ["gpt-oss-120b", "autonomous"],
  ["o3-mini", "autonomous"],
  ["openai/o1-preview", "autonomous"],
  ["claude-sonnet-5-5", "claude"],
  ["anthropic/claude-opus-4-1", "claude"],
  ["local-model", "other"],
  ["llama-3.3-70b", "other"],
  ["mistral-large-pro1", "other"]
]

describe("model family routing", () => {
  for (const [model, family] of ROUTES) {
    test(`${model} -> ${family}`, () => {
      expect(modelFamilyOf(model)).toBe(family)
      expect(modelFamilyOf(model.toUpperCase())).toBe(family)
    })
  }

  test("every family has a sample model that routes back to it", () => {
    for (const [family, model] of Object.entries(FAMILY_SAMPLE_MODELS)) expect(modelFamilyOf(model), model).toBe(family as ModelFamilyId)
  })
})

describe("family blocks", () => {
  const families = Object.keys(FAMILY_SAMPLE_MODELS) as ReadonlyArray<Exclude<ModelFamilyId, "claude">>
  const added = ["minimax", "glm", "qwen", "kimi", "deepseek", "gemini-4", "gpt-6"] as const

  test("Claude keeps the empty block, every other family has one", () => {
    expect(modelFamilyPrompt("claude-sonnet-5-5")).toBe("")
    for (const family of families) expect(modelFamilyPrompt(FAMILY_SAMPLE_MODELS[family]), family).toStartWith("Working style for this model:")
  })

  test("the new blocks are 0.6 to 1.2 KB and inside the static budget", () => {
    for (const family of added) {
      const text = modelFamilyPrompt(FAMILY_SAMPLE_MODELS[family])
      expect(text.length, family).toBeGreaterThanOrEqual(600)
      expect(text.length, family).toBeLessThanOrEqual(1_200)
      expect(text.length, family).toBeLessThanOrEqual(PROMPT_BUDGETS.staticEntry)
    }
  })

  test("the new blocks are distinct texts", () => {
    const texts = added.map((family) => modelFamilyPrompt(FAMILY_SAMPLE_MODELS[family]))
    expect(new Set(texts).size).toBe(texts.length)
  })

  test("each new block covers the observed failures: announce-then-stop, repeated failing call, verification, background tasks", () => {
    for (const family of added) {
      const text = modelFamilyPrompt(FAMILY_SAMPLE_MODELS[family]).toLowerCase()
      expect(text, `${family}: announcement`).toMatch(/announce|next i will|state its purpose|comes next/)
      expect(text, `${family}: repeated call`).toMatch(/unchanged|identical|same call|same input|twice|resend|repeat/)
      expect(text, `${family}: verification`).toMatch(/`cad` action `check`/)
      expect(text, `${family}: verification`).toMatch(/`cam_edit` action `verify`/)
      expect(text, `${family}: background`).toContain("background")
    }
  })

  test("background work is conditional on holding the agent tool, so Plan is never told to call it", () => {
    expect(PRIMARIES.plan.without).toContain("agent")
    for (const family of added) expect(modelFamilyPrompt(FAMILY_SAMPLE_MODELS[family]), family).toMatch(/if your role holds the `agent` tool/i)
    expect(agentSystemPrompt()).toMatch(/If your role holds the `agent` tool/)
    // The Build/Plan split is the only place that grants the tool.
    expect(PRIMARIES.build.without).not.toContain("agent")
  })

  test("blocks name only real tool actions and carry no coding wording", () => {
    for (const family of families) {
      const text = modelFamilyPrompt(FAMILY_SAMPLE_MODELS[family])
      expect(actionReferences(text).filter((ref) => !actionExists(ref.tool, ref.action)), family).toEqual([])
      expect(text, family).not.toMatch(/\b(repository|codebase|source file|refactor|unit test|pull request|compile)\b/i)
    }
  })

  test("the block sits between the mode and the context in a turn", () => {
    const prompt = turnSystemPrompt("Drawing: 3 parts", "cad", "MiniMax-M3.1-Flash")
    const block = modelFamilyPrompt("MiniMax-M3.1-Flash")
    expect(prompt.indexOf("Your focus: 3D CAD")).toBeLessThan(prompt.indexOf(block))
    expect(prompt.indexOf(block)).toBeLessThan(prompt.indexOf("Current context:"))
  })
})
