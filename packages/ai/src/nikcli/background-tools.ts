/**
 * Delegation: the four actions behind the `agent` tool, implemented against the host's task scheduler. The catalogue
 * owns their ids, effects and validation (`actions/agent.ts`); this module contributes the implementations, which is
 * the only production caller of the catalogue's contribution seam.
 */
import type { ActionContribution } from "../actions/action.ts"
import type { BackgroundTaskManagerInterface, BackgroundTaskOwner } from "./background-tasks.ts"
import { SUBAGENT_IDS, SUBAGENTS, isSubagentId, subagentCatalogue } from "./agents.ts"
import type { ToolContext } from "../tools/define.ts"

/** A readable refusal instead of a thrown error when the model names a specialist that does not exist. */
const refuse = (message: string) => ({ ok: false, error: message })

/**
 * The `background` flag as a boolean. The action schema coerces `"true"` before an implementation sees it, but this
 * contribution is also called directly, and a strict `=== true` there would read the string `"true"` as false and
 * silently block the caller on a background job. A flag is never worth a wrong answer about whether to wait.
 */
const backgroundFlag = (value: unknown): boolean | undefined =>
  value === undefined ? undefined : value === true || value === "true"

/** The four contributions of the delegation tool, keyed by the catalogue's action id. */
export const backgroundToolContributions = (manager: BackgroundTaskManagerInterface): Readonly<Record<string, ActionContribution>> => {
  const call = (action: string) => async (input: never, context: ToolContext): Promise<unknown> => {
    if (context.signal?.aborted) return refuse("Tool execution cancelled.")
    // A task belongs to the session that started it: without one there is no owner to list or cancel under.
    if (context.sessionId === undefined) return refuse("Delegation needs a host session.")
    const owner: BackgroundTaskOwner = { projectId: context.projectId, parentSessionId: context.sessionId }
    const value = input as Record<string, unknown>
    if (action === "agent.start") {
      const name = typeof value["agent"] === "string" ? value["agent"] : typeof value["subagent_type"] === "string" ? value["subagent_type"] : undefined
      const normalized = (name ?? "researcher").trim().toLowerCase().replace(/^cadcam-/, "").replace(/^worker$/, "researcher")
      if (!isSubagentId(normalized)) return { ok: false, error: `Unknown agent "${String(name)}". Use one of: ${SUBAGENT_IDS.join(", ")}.` }
      const spec = SUBAGENTS[normalized]
      const background = backgroundFlag(value["background"]) ?? spec.background
      const task = manager.enqueue({
        description: String(value["description"]), prompt: String(value["prompt"]),
        ...owner, agent: spec.id, edits: spec.edits, background
      })
      // The specialist works inside this tool call: its result comes back as this call's result.
      if (background) return task
      return { ...(await manager.wait(owner, task.id, context.signal)), specialists: subagentCatalogue() }
    }
    if (action === "agent.list") return manager.list(owner)
    const taskId = String(value["taskId"])
    return action === "agent.read" ? manager.read(owner, taskId) : manager.cancel(owner, taskId)
  }
  return {
    "agent.start": call("agent.start"),
    "agent.list": call("agent.list"),
    "agent.read": call("agent.read"),
    "agent.cancel": call("agent.cancel")
  }
}

/** The delegation tool's id; the host registers it once, like every other tool of the catalogue. */
export const BACKGROUND_TOOL_IDS = ["agent"] as const

export const backgroundToolIds = (): ReadonlyArray<string> => [...BACKGROUND_TOOL_IDS]