/// <reference path="../text.d.ts" />
/**
 * One-shot AI workflows (legacy `promptTemplates.ts` ported to the new architecture).
 *
 * Each workflow is a (system, user) prompt pair, one `.txt` file each under `workflows/`, plus an Effect Schema describing
 * the structured output. The user prompt names exactly the fields of that schema (the tests hold them together). The
 * renderer (`prompts/system.ts`) substitutes placeholders safely (missing keys -> empty).
 *
 * Flow callers:
 * - `analyzeDesign`: legacy `promptTemplates.designAnalysis`
 * - `optimizeGcode`: legacy `promptTemplates.gcodeOptimization`
 * - `recommendMachiningParameters`: legacy `promptTemplates.machiningParameters`
 * - `summarizeDesignSuggestions`: legacy `promptTemplates.designSuggestions`
 * - `suggestTitle`: legacy `aiCore.generateTitle` (returned alongside the chat
 *   completion; nikcli's title agent is disabled by config, so we generate titles
 *   on demand through `DirectModel.generateObject`).
 *
 * The drawing a workflow reviews is whatever the caller describes: 3D solids, parametric parts, components and 2D sketch
 * entities alike. These workflows give advice only; nothing they return is rebuilt, simulated or stored.
 */
import { Schema } from "effect"
import { render } from "./system.ts"
import analyzeDesignSystem from "./workflows/analyze-design.system.txt" with { type: "text" }
import analyzeDesignUser from "./workflows/analyze-design.user.txt" with { type: "text" }
import optimizeGcodeSystem from "./workflows/optimize-gcode.system.txt" with { type: "text" }
import optimizeGcodeUser from "./workflows/optimize-gcode.user.txt" with { type: "text" }
import recommendSystem from "./workflows/recommend-machining-parameters.system.txt" with { type: "text" }
import recommendUser from "./workflows/recommend-machining-parameters.user.txt" with { type: "text" }
import suggestionsSystem from "./workflows/summarize-design-suggestions.system.txt" with { type: "text" }
import suggestionsUser from "./workflows/summarize-design-suggestions.user.txt" with { type: "text" }
import titleSystem from "./workflows/title.system.txt" with { type: "text" }
import titleUser from "./workflows/title.user.txt" with { type: "text" }

export interface PromptTemplate {
  readonly system: string
  readonly user: string
  /** Variables the renderer fills. Each is a hint to the UI for input fields. */
  readonly variables: ReadonlyArray<string>
}

const t = (system: string, user: string, variables: ReadonlyArray<string>): PromptTemplate =>
  ({ system: system.trim(), user: user.trim(), variables })

export const ANALYZE_DESIGN = t(analyzeDesignSystem, analyzeDesignUser, ["description", "layer", "machine"])

export const OPTIMIZE_GCODE = t(optimizeGcodeSystem, optimizeGcodeUser, ["machineType", "material", "gcode", "constraints"])

export const RECOMMEND_MACHINING_PARAMETERS = t(recommendSystem, recommendUser, ["material", "tool", "operation", "machine"])

export const SUMMARIZE_DESIGN_SUGGESTIONS = t(suggestionsSystem, suggestionsUser, ["elements", "currentOperation", "currentTool"])

export const TITLE_GENERATION = t(titleSystem, titleUser, ["excerpt"])

// ── Output Schemas ──────────────────────────────────────────────────────────

export const DesignSuggestion = Schema.Struct({
  title: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
  confidence: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  priority: Schema.Literals(["low", "medium", "high"]),
  kind: Schema.Literals(["optimization", "warning", "critical"])
})
export type DesignSuggestion = typeof DesignSuggestion.Type

export const AnalyzeDesignOutput = Schema.Struct({
  suggestions: Schema.Array(DesignSuggestion).check(Schema.isMinLength(1))
})
export type AnalyzeDesignOutput = typeof AnalyzeDesignOutput.Type

export const GcodeChange = Schema.Struct({
  line: Schema.Int,
  before: Schema.String,
  after: Schema.String,
  reason: Schema.String
})
export const GcodeSavings = Schema.Struct({
  timePct: Schema.Number,
  toolLifePct: Schema.Number,
  qualityNote: Schema.String
})
export const OptimizeGcodeOutput = Schema.Struct({
  gcode: Schema.NonEmptyString,
  changes: Schema.Array(GcodeChange),
  estimatedSavings: GcodeSavings,
  notes: Schema.String
})
export type OptimizeGcodeOutput = typeof OptimizeGcodeOutput.Type

export const MachiningParameters = Schema.Struct({
  cuttingSpeedMPerMin: Schema.Number.check(Schema.isGreaterThan(0)),
  feedRateMmPerMin: Schema.Number.check(Schema.isGreaterThan(0)),
  depthOfCutMm: Schema.Number.check(Schema.isGreaterThan(0)),
  stepoverPct: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  coolant: Schema.Literals(["flood", "mist", "none"]),
  engagement: Schema.Literals(["conventional", "climb"]),
  warnings: Schema.Array(Schema.String)
})
export type MachiningParameters = typeof MachiningParameters.Type

export const DesignSuggestionsSummary = Schema.Array(
  Schema.Struct({
    title: Schema.NonEmptyString,
    rationale: Schema.String,
    nextStep: Schema.String
  })
).check(Schema.isMinLength(1))
export type DesignSuggestionsSummary = typeof DesignSuggestionsSummary.Type

export const TitleOutput = Schema.Struct({
  title: Schema.NonEmptyString.check(Schema.isMaxLength(80))
})
export type TitleOutput = typeof TitleOutput.Type

// ── Render helpers ──────────────────────────────────────────────────────────

/** Render a `PromptTemplate` with `variables` into a `{system, user}` pair. */
export const renderPrompt = (
  template: PromptTemplate,
  variables: Readonly<Record<string, string>>
): { readonly system: string; readonly user: string } => ({
  system: render(template.system, variables),
  user: render(template.user, variables)
})

/** Truncate a string to fit a reasonable prompt budget, keeping word boundaries. */
export const clipForPrompt = (text: string, max = 2_000): string => {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const lastSpace = slice.lastIndexOf(" ")
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : max)}…`
}