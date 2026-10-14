/**
 * `agent` — delegation. Starting a specialist and cancelling one change the task scheduler's state, so the whole
 * tool is a write and no read-only role has it: a background job is not a read.
 *
 * The scheduler itself belongs to the host; the catalogue owns the four actions the model may call.
 */
import { VCS_ACTION_INPUTS as INPUTS } from "@cadcamfun/api"
import { contributedAction, type ActionSpec } from "./action.ts"

export const AGENT_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({
    id: "agent.start", kind: "write", replaces: "agent_task", contribution: "agent.start",
    parameters: INPUTS["agent.start"]
  }),
  contributedAction({ id: "agent.list", kind: "write", replaces: "agent_tasks", contribution: "agent.list", parameters: INPUTS["agent.list"] }),
  contributedAction({ id: "agent.read", kind: "write", replaces: "agent_task_read", contribution: "agent.read", parameters: INPUTS["agent.read"] }),
  contributedAction({ id: "agent.cancel", kind: "write", replaces: "agent_task_cancel", contribution: "agent.cancel", parameters: INPUTS["agent.cancel"] })
]