import type { AiMessage } from "./types.ts"

/** What the person is asking the assistant to do when they approve a plan: the model reads this, so it stays in English. */
export const BUILD_PLAN_PROMPT = "Build mode is on. Execute the plan above step by step with your actual permissions: refresh ids and revisions first, verify each result, and report anything that blocks a step."

/**
 * Claude Code asks the person to approve a plan before it leaves plan mode. Here the plan is the last answer of a finished turn in the
 * Plan agent: when that is the case the transcript offers one action, "Build this plan". A turn that is still running, failed or was
 * stopped, an empty answer, or any other agent offers nothing.
 */
export const planAwaitingApproval = (agent: string, status: "idle" | "connecting" | "streaming" | "error", messages: ReadonlyArray<AiMessage>): boolean => {
  if (agent !== "plan" || status !== "idle") return false
  const last = messages.at(-1)
  return last !== undefined && last.role === "assistant" && last.status === "done" && last.interrupted !== true && last.text.trim() !== ""
}
