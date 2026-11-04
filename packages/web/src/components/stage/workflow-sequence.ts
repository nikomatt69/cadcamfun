import type { Act } from "../../stageshow/kit/act"

export type WorkflowState = { completed: number }
export const WORKFLOW_STEPS = ["Validate project", "Check G-code", "Verify CAM"] as const
export const WORKFLOW_POSTER: WorkflowState = { completed: WORKFLOW_STEPS.length }

/** The demonstration runs once and leaves its completed state visible. */
export async function workflowScript(act: Pick<Act<WorkflowState>, "wait" | "set" | "mark">) {
  for (let completed = 1; completed <= WORKFLOW_STEPS.length; completed++) {
    await act.wait(1600)
    await act.set({ completed })
    act.mark(`step-${completed}`)
  }
}
