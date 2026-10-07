import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  ANALYZE_DESIGN,
  AnalyzeDesignOutput,
  GcodeSavings,
  MachiningParameters,
  OPTIMIZE_GCODE,
  OptimizeGcodeOutput,
  RECOMMEND_MACHINING_PARAMETERS,
  SUMMARIZE_DESIGN_SUGGESTIONS,
  DesignSuggestionsSummary,
  TITLE_GENERATION,
  TitleOutput,
  clipForPrompt,
  renderPrompt
} from "../src/prompts/workflows.ts"

describe("workflow prompt templates", () => {
  test("every template declares its placeholders", () => {
    expect(ANALYZE_DESIGN.variables).toContain("description")
    expect(OPTIMIZE_GCODE.variables).toContain("gcode")
    expect(OPTIMIZE_GCODE.variables).toContain("material")
    expect(RECOMMEND_MACHINING_PARAMETERS.variables).toContain("material")
    expect(SUMMARIZE_DESIGN_SUGGESTIONS.variables).toContain("elements")
    expect(TITLE_GENERATION.variables).toContain("excerpt")
  })

  test("renderPrompt fills variables and drops missing ones", () => {
    const rendered = renderPrompt(OPTIMIZE_GCODE, {
      machineType: "3-axis CNC",
      material: "aluminium 6061",
      gcode: "G1 X10",
      constraints: "minimize cycle time"
    })
    expect(rendered.system).toContain("3-axis CNC")
    expect(rendered.user).toContain("aluminium 6061")
    expect(rendered.user).toContain("minimize cycle time")
    expect(rendered.user).not.toContain("{{")
  })
})

describe("workflow output Schemas", () => {
  const decode = <A, I = unknown>(schema: Schema.Codec<A, I>, value: unknown): A =>
    (Schema.decodeUnknownSync(schema as Schema.Codec<A, unknown>) as (v: unknown) => A)(value)

  test("AnalyzeDesignOutput accepts a well-formed payload", () => {
    const decoded = decode(AnalyzeDesignOutput, {
      suggestions: [
        {
          title: "Tighter fillet",
          description: "Use R2 instead of R1 to reduce stress concentration.",
          confidence: 0.8,
          priority: "high",
          kind: "warning"
        }
      ]
    })
    expect(decoded.suggestions).toHaveLength(1)
  })

  test("AnalyzeDesignOutput rejects an empty suggestion list", () => {
    expect(() => decode(AnalyzeDesignOutput, { suggestions: [] })).toThrow()
  })

  test("OptimizeGcodeOutput accepts a complete payload", () => {
    const decoded = decode(OptimizeGcodeOutput, {
      gcode: "G1 X10",
      changes: [{ line: 3, before: "G1 X10", after: "G1 X12", reason: "added clearance" }],
      estimatedSavings: { timePct: 12.5, toolLifePct: 8, qualityNote: "smoother pass" },
      notes: "short summary"
    })
    expect(decoded.estimatedSavings.timePct).toBe(12.5)
  })

  test("GcodeSavings is required and ordered", () => {
    expect(() => decode(GcodeSavings, { timePct: 1, toolLifePct: 1, qualityNote: "" })).not.toThrow()
  })

  test("MachiningParameters enforces numeric ranges", () => {
    const ok = {
      cuttingSpeedMPerMin: 120,
      feedRateMmPerMin: 600,
      depthOfCutMm: 2,
      stepoverPct: 40,
      coolant: "flood",
      engagement: "climb",
      warnings: []
    }
    expect(() => decode(MachiningParameters, ok)).not.toThrow()
    expect(() => decode(MachiningParameters, { ...ok, stepoverPct: 150 })).toThrow()
    expect(() => decode(MachiningParameters, { ...ok, cuttingSpeedMPerMin: 0 })).toThrow()
  })

  test("DesignSuggestionsSummary requires at least one entry", () => {
    const ok = [{ title: "X", rationale: "Y", nextStep: "Z" }]
    expect(() => decode(DesignSuggestionsSummary, ok)).not.toThrow()
    expect(() => decode(DesignSuggestionsSummary, [])).toThrow()
  })

  test("TitleOutput caps the title at 80 chars", () => {
    expect(() => decode(TitleOutput, { title: "ok" })).not.toThrow()
    expect(() => decode(TitleOutput, { title: "x".repeat(81) })).toThrow()
  })
})

describe("clipForPrompt", () => {
  test("returns short strings unchanged", () => {
    expect(clipForPrompt("hello", 100)).toBe("hello")
  })

  test("truncates with an ellipsis on a word boundary", () => {
    const long = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ")
    const clipped = clipForPrompt(long, 100)
    expect(clipped.length).toBeLessThanOrEqual(101)
    expect(clipped.endsWith("…")).toBe(true)
  })
})