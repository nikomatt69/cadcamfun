/**
 * One-shot AI workflows (legacy `promptTemplates.ts` ported to the new architecture).
 *
 * Each workflow is a (system, user) prompt pair plus an Effect Schema describing
 * the structured output. The renderer (`prompts/system.ts`) substitutes placeholders
 * safely (missing keys -> empty).
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
 * The full 3D element vocabulary is intentionally not ported here: CADCAMFUN v6
 * uses 2D entities (line, circle, arc, polyline, rectangle) and the legacy 3D
 * vocabulary (cube/sphere/cone/...) has no counterpart in `core`. The `cad_*`
 * tools cover what the model can actually draw.
 */
import { Schema } from "effect"
import { render } from "./system.ts"

export interface PromptTemplate {
  readonly system: string
  readonly user: string
  /** Variables the renderer fills. Each is a hint to the UI for input fields. */
  readonly variables: ReadonlyArray<string>
}

const t = (system: string, user: string, variables: ReadonlyArray<string>): PromptTemplate =>
  ({ system, user, variables })

export const ANALYZE_DESIGN = t(
  `You are a CAD/CAM design expert. Your task is to analyse a 2D drawing (lines, circles, arcs, polylines, rectangles) and surface suggestions for improvement.

Focus on:
- Manufacturability (wall thickness, feature sizes, tolerance feasibility)
- Design for Manufacturing and Assembly (DFM/DFA)
- Material efficiency
- Structural / geometric redundancy

Use technical terminology appropriate for mechanical engineering and manufacturing.
Output strict JSON only — no prose, no markdown fences.`,
  `Analyse the following 2D drawing:

{{description}}

Active layer: {{layer}}
Machine work volume: {{machine}}

Provide suggestions in these categories:
1. Structural improvements
2. Manufacturing optimisations
3. Material efficiency
4. Design simplification

For each suggestion include:
- title: a short headline
- description: a one-paragraph explanation
- confidence: 0–1
- priority: "low" | "medium" | "high"
- kind: "optimization" | "warning" | "critical"`,
  ["description", "layer", "machine"]
)

export const OPTIMIZE_GCODE = t(
  `You are a CNC programming expert. Your task is to analyse and improve G-code for {{machineType}} machines.

Focus on:
- Removing redundant operations
- Optimising tool paths
- Improving feed rates and speeds based on the material
- Enhancing safety and reliability
- Reducing machining time
- Extending tool life

Consider:
- The specified material properties
- Tool specifications
- Machine capabilities
- Manufacturing best practices

Output strict JSON only.`,
  `Analyse and optimise the following G-code for a {{machineType}} machine working with {{material}}:

{{gcode}}

Constraints and goals:
{{constraints}}

Provide:
- gcode: the rewritten G-code as a string
- changes: array of {line, before, after, reason} describing every edit
- estimated_savings: {time_pct, tool_life_pct, quality_note}
- notes: short prose summary`,
  ["machineType", "material", "gcode", "constraints"]
)

export const RECOMMEND_MACHINING_PARAMETERS = t(
  `You are a machining expert. Recommend cutting parameters for a CNC operation.

Consider:
- Material properties and machining characteristics
- Tool geometry, material and coating
- Operation type and requirements
- Surface finish needs
- Tool wear and life expectations
- Machine rigidity and power limitations

Output strict JSON only.`,
  `Recommend optimal machining parameters for:

Material: {{material}}
Tool: {{tool}}
Operation: {{operation}}
Machine: {{machine}}

Provide:
- cutting_speed_m_per_min: number
- feed_rate_mm_per_min: number
- depth_of_chi_mm: number
- stepover_pct: number (0–100)
- coolant: "flood" | "mist" | "none"
- engagement: "conventional" | "climb"
- warnings: array of short strings for any unusual combination`,
  ["material", "tool", "operation", "machine"]
)

export const SUMMARIZE_DESIGN_SUGGESTIONS = t(
  `You are an AI design assistant. Provide brief, specific, contextual design suggestions as the user works on their model.

Suggestions must be:
- Brief and specific
- Relevant to the current design context
- Actionable and practical
- Based on engineering best practices

Focus areas:
- Design for Manufacturing (DFM)
- Material efficiency
- Structural integrity
- Functional improvements

Output strict JSON only.`,
  `The user is working on a 2D drawing with:

{{elements}}

They are currently focusing on {{currentOperation}} with {{currentTool}}.

Provide 2–3 brief, helpful design suggestions relevant to their current work. Each suggestion:
- title
- rationale (one sentence)
- next_step (the single tool call they should make)`,
  ["elements", "currentOperation", "currentTool"]
)

export const TITLE_GENERATION = t(
  `You generate a short conversation title (3–6 words) for a CAD/CAM user. The title is shown in a sidebar; it must be specific, lowercase, and end without punctuation. Output strict JSON only.`,
  `Conversation excerpt:
{{excerpt}}`,
  ["excerpt"]
)

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