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