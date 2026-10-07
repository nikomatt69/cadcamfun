/**
 * "Ask the assistant" from anywhere in the app: opens the docked panel and sends the prompt, so a button on a
 * browser row or on a verification report is one click from a conversation about exactly that.
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

/** The prompt for a selection: what it is and what to do, with ids the tools can use. */
export const selectionPrompt = (elements: ReadonlyArray<{ readonly id: string; readonly type: string; readonly name?: unknown }>): string => {
  const list = elements.slice(0, 20).map((e) => `${typeof e.name === "string" && e.name !== "" ? e.name : e.type} (${e.type}, id ${e.id})`).join("; ")
  const more = elements.length > 20 ? ` and ${elements.length - 20} more` : ""
  return `Look at these elements of the drawing: ${list}${more}. Describe them with cad_describe_drawing, then tell me what you would improve or machine, and ask before changing anything.`
}

/** The prompt for a verification report with errors: read them, fix the operation, verify again. */
export const fixVerificationPrompt = (issues: ReadonlyArray<{ readonly code: string; readonly message: string; readonly severity: string }>): string => {
  const errors = issues.filter((issue) => issue.severity === "error").slice(0, 8).map((issue) => `${issue.code}: ${issue.message}`).join("\n")
  return `The toolpath verification found these errors:\n${errors}\nChange the operation to fix them (cam_update_operation), generate the G-code again and verify it. Tell me what you changed and what the verification still does not model.`
}
