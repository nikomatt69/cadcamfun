import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  ASSISTANT_MODES,
  AssistantModeSchema,
  SUGGESTED_PROMPTS,
  isAssistantMode,
  modePrefix,
  systemPrompt
} from "../src/index.ts"

describe("assistant modes", () => {
  test("every mode in the public list is recognised", () => {
    for (const mode of ASSISTANT_MODES) expect(isAssistantMode(mode)).toBe(true)
    expect(isAssistantMode("nope")).toBe(false)
  })

  test("AssistantModeSchema accepts known modes and rejects unknown", () => {
    const decode = Schema.decodeUnknownSync(AssistantModeSchema)
    for (const mode of ASSISTANT_MODES) expect(decode(mode)).toBe(mode)
    expect(() => decode("nope")).toThrow()
  })

  test("every mode has at least one suggested prompt", () => {
    for (const mode of ASSISTANT_MODES) {
      expect(SUGGESTED_PROMPTS[mode].length).toBeGreaterThan(0)
    }
  })

  test("the mode prefix is mode-specific and English", () => {
    expect(modePrefix("cad")).toMatch(/cad/i)
    expect(modePrefix("cam")).toMatch(/cam/i)
    expect(modePrefix("gcode")).toMatch(/g[- ]?code/i)
    expect(modePrefix("toolpath")).toMatch(/toolpath/i)
    expect(modePrefix("general")).toMatch(/general/i)
  })

  test("unknown modes fall back to general without throwing", () => {
    expect(modePrefix(undefined)).toBe(modePrefix("general"))
    expect(modePrefix("totally-bogus")).toBe(modePrefix("general"))
  })
})

describe("systemPrompt with mode and context", () => {
  test("embeds the mode block when a mode is provided", () => {
    const prompt = systemPrompt(undefined, "cam")
    expect(prompt).toContain(modePrefix("cam"))
    expect(prompt).not.toContain("{{mode}}")
  })

  test("appends a context block only when non-empty", () => {
    const empty = systemPrompt(undefined, "cad")
    expect(empty).not.toContain("Current context:")
    expect(empty).not.toContain("{{context}}")
    const withCtx = systemPrompt("drawing has 3 lines", "cad")
    expect(withCtx).toContain("Current context:\ndrawing has 3 lines")
  })

  test("falls back to general for unknown modes", () => {
    const prompt = systemPrompt(undefined, "weird")
    expect(prompt).toContain("general CAD/CAM")
  })
})
describe("agent-chosen focus and background delegation", () => {
  test("general focus follows the task while preserving the Build/Plan role", () => {
    const general = modePrefix("general")
    expect(general).toMatch(/choose.*focus as the request requires/i)
    expect(general).toMatch(/focus never grants tools or overrides the Build\/Plan role/i)
  })

  test("every focus inherits task-driven tool access from the shared agent contract", () => {
    for (const mode of ASSISTANT_MODES) {
      const prompt = systemPrompt(undefined, mode)
      expect(prompt).toContain(modePrefix(mode))
      expect(prompt).toMatch(/focus.*guides attention, never grants access/i)
      expect(prompt).toMatch(/follow your role's actual permissions/i)
    }
  })

  test("Build delegation saves time without replacing the next prerequisite", async () => {
    const { PRIMARIES } = await import("../src/nikcli/primaries.ts")
    const prompt = PRIMARIES.build.focus
    expect(prompt).toMatch(/background specialists.*scoped tools/i)
    expect(prompt).toMatch(/independent.*materially saves time/i)
    expect(prompt).toMatch(/start independent jobs together.*non-overlapping work/i)
    expect(prompt).toMatch(/editing specialists queue one at a time per project/i)
    expect(prompt).toMatch(/do not delegate merely because it is long/i)
    expect(prompt).toMatch(/one active researcher per parent/i)
    expect(PRIMARIES.plan.delegates).toBe(false)
    expect(PRIMARIES.plan.without).toContain("agent")
    expect(PRIMARIES.plan.focus).not.toMatch(/delegate with the `agent` tool/i)
    expect(PRIMARIES.plan.canEdit).toBe(false)
  })
})

describe("model family working style (nikcli's per-family system prompts)", () => {
  test("families follow nikcli's mapping", async () => {
    const { modelFamilyOf } = await import("../src/prompts/system.ts")
    expect(["gpt-5.2", "gpt-reserve"].map(modelFamilyOf)).toEqual(["codex", "codex"])
    expect(["openai/gpt-6-astra", "gpt-6-luna"].map(modelFamilyOf)).toEqual(["gpt-6", "gpt-6"])
    expect(["gpt-4o", "o3-mini"].map(modelFamilyOf)).toEqual(["autonomous", "autonomous"])
    expect(modelFamilyOf("gemini-3-pro")).toBe("gemini")
    expect(modelFamilyOf("claude-sonnet-5-5")).toBe("claude")
    expect(modelFamilyOf("MiniMax-M2")).toBe("minimax")
    expect(modelFamilyOf("local-model")).toBe("other")
  })

  test("Claude gets the base prompt untouched; the others get their block after the mode", async () => {
    const { systemPrompt, modelFamilyPrompt } = await import("../src/prompts/system.ts")
    const base = systemPrompt("ctx")
    expect(systemPrompt("ctx", undefined, "claude-sonnet-5-5")).toBe(base)
    const gpt4 = systemPrompt("ctx", undefined, "gpt-4o")
    expect(gpt4.startsWith(base)).toBe(true)
    expect(gpt4.slice(base.length).trim()).toBe(modelFamilyPrompt("gpt-4o"))
    expect(systemPrompt("ctx", undefined, "gpt-5").slice(base.length).trim()).toBe(modelFamilyPrompt("gpt-5"))
  })
})
