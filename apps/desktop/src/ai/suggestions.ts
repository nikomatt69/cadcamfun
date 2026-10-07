/**
 * Proactive suggestions the panel surfaces above the messages (spec 06-desktop-ui.md
 * §1; mirrors the reference `EnhancedCADAssistant`'s `ProactiveSuggestions`).
 *
 * The suggestions are derived from the current CAD context the bridge reports
 * (entity count, selected count, active tool, layer count). They stay simple —
 * nothing tries to talk to the model — so the panel is useful even before the
 * user has supplied an API key.
 */
import type { EditorTool } from "../state/editor.ts"

export interface SuggestionInput {
  readonly entityCount: number
  readonly selectedCount: number
  readonly activeTool: EditorTool
  readonly layers: number
  /** There is G-code in the CAM page. */
  readonly hasGcode?: boolean
  /** The last verification: never run, out of date, clean, or with errors. */
  readonly verification?: "not-run" | "stale" | "ok" | "errors"
}

export interface Suggestion {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly prompt: string
  readonly category: "design" | "cam" | "library" | "gcode"
}

const DRAFT_TEMPLATE_PROMPTS: ReadonlyArray<Suggestion> = [
  { id: "s.profile-round", description: "Process the active geometry as a CAM profile.", prompt: "Create a CAM profile operation around the selected entities using the end mill in the library.", title: "Profile the outline", category: "cam" },
  { id: "s.pocket", description: "Suggest a pocket operation with safe stepdown.", prompt: "Suggest a pocket operation for the active drawing, with safe stepdown for the chosen material.", title: "Pocket the inside", category: "cam" },
  { id: "s.drill", description: "Add a drill cycle for every circle the model thinks is a hole.", prompt: "Find every circle in the drawing that looks like a hole and add a drill operation for it.", title: "Drill the holes", category: "cam" }
]

const REVIEW_PROMPTS: ReadonlyArray<Suggestion> = [
  { id: "s.review-gcode", description: "Run the deterministic G-code analyzer on the latest operation.", prompt: "Generate the G-code for the latest operation and analyse it for safety issues.", title: "Review the G-code", category: "gcode" },
  { id: "s.estimate", description: "Calculate the production cost estimate for the current toolpath.", prompt: "Estimate the production cost of the current toolpath and explain the breakdown.", title: "Estimate the cost", category: "gcode" }
]

const MEMORY_PROMPTS: ReadonlyArray<Suggestion> = [
  { id: "s.remember-units", description: "Have the assistant remember your preferred unit.", prompt: "Remember that I work in millimetres.", title: "Remember my units", category: "design" },
  { id: "s.remember-stock", description: "Save the stock size for this project.", prompt: "Remember that the stock size for this project is 200 × 100 × 12 mm aluminium.", title: "Remember the stock", category: "design" }
]

const LIBRARY_PROMPTS: ReadonlyArray<Suggestion> = [
  { id: "s.lookup-tool", description: "Pick a tool from the library for the material.", prompt: "Recommend an end mill from the library for cutting 6 mm aluminium.", title: "Pick a tool", category: "library" },
  { id: "s.lookup-material", description: "List the materials in the library.", prompt: "List the materials in the library and their key properties.", title: "Browse materials", category: "library" }
]

export const buildSuggestions = (input: SuggestionInput): ReadonlyArray<Suggestion> => {
  const out: Suggestion[] = []
  if (input.entityCount === 0) {
    out.push({
      id: "s.start-rect",
      title: "Draw a starting rectangle",
      description: "Bootstrap the drawing with a simple rectangle so the CAM pipeline has geometry to work with.",
      prompt: "Draw a 100 × 60 mm rectangle centred on the origin.",
      category: "design"
    })
    out.push({
      id: "s.start-circle",
      title: "Draw a starting circle",
      description: "Begin with a circle that the model can later pocket.",
      prompt: "Draw a 30 mm diameter circle at the origin.",
      category: "design"
    })
  } else {
    out.push(...DRAFT_TEMPLATE_PROMPTS)
  }
  if (input.hasGcode === true && input.verification === "errors") {
    out.unshift({ id: "s.fix-verification", title: "Fix the verification errors", description: "The last verification found errors: have the assistant change the operation and verify again.", prompt: "The last toolpath verification found errors. Read them, change the operation to fix them (cam_update_operation), generate the G-code and verify it again.", category: "gcode" })
  } else if (input.hasGcode === true && input.verification !== "ok") {
    out.unshift({ id: "s.verify", title: "Verify the toolpath", description: input.verification === "stale" ? "The G-code changed since the last verification." : "Simulate the G-code on the stock before cutting.", prompt: "Verify the current toolpath on the stock and tell me what the simulation did and did not model.", category: "gcode" })
  }
  if (input.entityCount > 0) out.push(...REVIEW_PROMPTS)
  if (input.layers <= 1) out.push(...LIBRARY_PROMPTS)
  out.push(...MEMORY_PROMPTS)
  return out
}