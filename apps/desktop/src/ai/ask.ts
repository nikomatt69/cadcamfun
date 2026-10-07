/**
 * "Ask the assistant" from anywhere in the app: opens the docked panel and sends the prompt, so a button on a browser row or on a verification report is one click from a conversation about exactly that.
 *
 * Prompts are validated before they go to the assistant: empty selection prompts
 * are routed through a sensible default, oversize briefs are truncated with a
 * continuation marker. The model is told up-front to call `cad_describe_drawing`
 * first so it has a canonical picture of the drawing, and to ask before any
 * irreversible change. This mirrors the CAD skill's "extract everything from the
 * input, then ask one focused question only when missing info makes the model
 * impossible" rule.
 */
import { useApp } from "../state/context.ts"
import { useAiStore } from "./context.tsx"

export const useAskAi = (): ((prompt: string) => void) => {
  const app = useApp()
  const ai = useAiStore()
  return (prompt) => {
    app.setPanelOpen(true)
    void ai.send(prompt)
  }
}

/** Header the assistant sees before the user prompt. Kept terse so the model
 *  does not over-spec; this is the only place we steer behaviour. */
export const SYSTEM_PREAMBLE =
  "You are cadcam, an assistant for CAD/CAM on a desktop editor. " +
  "Always start by calling cad_describe_drawing or cam_describe_machine so you have a canonical picture of the current state. " +
  "For CAD changes call cad_check_design first; for CAM changes call cam_suggest_parameters first. " +
  "Before any irreversible operation (delete, dimension change, post-processor swap), ask the user with a short reason. " +
  "Respond tersely. Use the active drawing's layer/tolerance/units from describe, do not assume."

/** Maximum entities inlined into a selection prompt before we just say "and N more". */
const MAX_SELECTION_ENTITIES = 24
/** Maximum characters in any prompt we hand to the AI; longer prompts lose focus. */
const MAX_PROMPT_CHARS = 4000

const trim = (text: string): string => {
  if (text.length <= MAX_PROMPT_CHARS) return text
  return text.slice(0, MAX_PROMPT_CHARS) + " …[truncated]"
}

const validEntity = (e: { readonly id: unknown; readonly type: unknown; readonly name?: unknown }): boolean =>
  typeof e.id === "string" && e.id.length > 0 && typeof e.type === "string" && e.type.length > 0

/** The prompt for a selection: what it is and what to do, with ids the tools can use.
 *  Returns a fallback when the selection is empty (instead of asking about nothing). */
export const selectionPrompt = (elements: ReadonlyArray<{ readonly id: string; readonly type: string; readonly name?: unknown }>): string => {
  const valid = elements.filter(validEntity)
  if (valid.length === 0) {
    return trim(
      `${SYSTEM_PREAMBLE}\n\n` +
      `The user has an empty selection. Run cad_describe_drawing to get a picture of the active drawing, ` +
      `then suggest a single, low-risk next step (draw a circle at origin, add a layer, etc). Do not delete anything.`
    )
  }
  const list = valid.slice(0, MAX_SELECTION_ENTITIES).map((e) =>
    `${typeof e.name === "string" && e.name !== "" ? e.name : e.type} (${e.type}, id ${e.id})`
  ).join("; ")
  const more = valid.length > MAX_SELECTION_ENTITIES ? ` and ${valid.length - MAX_SELECTION_ENTITIES} more` : ""
  return trim(
    `${SYSTEM_PREAMBLE}\n\n` +
    `The user selected ${valid.length} entities: ${list}${more}. ` +
    `Run cad_describe_drawing first to confirm their ids, then describe what they are, ` +
    `suggest what to improve or how to machine them, and ask before any change.`
  )
}

/** The prompt for a verification report with errors: read them, fix the operation, verify again.
 *  Falls back to a "no errors" message instead of an empty prompt. */
export const fixVerificationPrompt = (issues: ReadonlyArray<{ readonly code: string; readonly message: string; readonly severity: string }>): string => {
  const errors = issues.filter((issue) => issue.severity === "error").slice(0, 8)
  if (errors.length === 0) {
    return trim(
      `${SYSTEM_PREAMBLE}\n\n` +
      `Verification ran clean: no errors. Run cam_analyze_gcode on the latest G-code and tell me ` +
      `whether the feeds, rapids, and Z-limits are within machine envelope. Suggest one optimisation if any.`
    )
  }
  const formatted = errors.map((issue) => `- ${issue.code}: ${issue.message}`).join("\n")
  return trim(
    `${SYSTEM_PREAMBLE}\n\n` +
    `The toolpath verification found ${errors.length} error${errors.length === 1 ? "" : "s"}:\n${formatted}\n` +
    `For each, run cam_update_operation with the smallest change that fixes it, ` +
    `then cam_generate_gcode and cam_verify_toolpath again. ` +
    `Tell me what you changed and what the verification still does not model.`
  )
}
