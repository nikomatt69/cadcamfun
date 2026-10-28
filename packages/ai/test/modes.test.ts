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
    expect(prompt).toContain("CAM operations")
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
  test("general mode states there is no user-selected mode and focus is at will", () => {
    const general = modePrefix("general")
    expect(general).toMatch(/no user-selected mode/i)
    expect(general).toMatch(/choose the focus|at will/i)
    expect(general).toMatch(/never limits the tools|does not limit the tools/i)
  })

  test("every mode is an agent-chosen focus that does not limit tools", () => {
    for (const mode of ASSISTANT_MODES.filter((candidate) => candidate !== "general")) {
      const text = modePrefix(mode)
      expect(text).toMatch(/chosen by you, not the user/i)
      expect(text).toMatch(/never limits your tools/i)
      expect(text).toMatch(/switch focus at will/i)
    }
  })

  test("the Build prompt carries the background-delegation pattern, like nikcli's awareness blocks", async () => {
    const { PRIMARIES } = await import("../src/nikcli/primaries.ts")
    const prompt = PRIMARIES.build.focus
    expect(prompt).toMatch(/background subagents/i)
    expect(prompt).toMatch(/background by default/i)
    expect(prompt).toMatch(/several background calls in one block/i)
    expect(prompt).toMatch(/keep doing non-overlapping work/i)
    expect(prompt).toMatch(/never delegate what blocks the next step/i)
    expect(prompt).toMatch(/one at a time per project/i)
    expect(prompt).toMatch(/only when it materially helps/i)
    expect(prompt).toMatch(/one active researcher per parent/i)
    // Plan cannot delegate or write: its prompt must not teach delegation or mods as its own actions.
    expect(PRIMARIES.plan.focus).not.toMatch(/background subagents/i)
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
    const { systemPrompt } = await import("../src/prompts/system.ts")
    const base = systemPrompt("ctx")
    expect(systemPrompt("ctx", undefined, "claude-sonnet-5-5")).toBe(base)
    const gpt4 = systemPrompt("ctx", undefined, "gpt-4o")
    expect(gpt4.startsWith(base)).toBe(true)
    expect(gpt4).toContain("Keep going until the request is completely resolved")
    expect(systemPrompt("ctx", undefined, "gpt-5").slice(base.length)).toContain("short sentence")
  })
})
