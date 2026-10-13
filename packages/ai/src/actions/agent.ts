/**
 * `agent` — delegation. Starting a specialist and cancelling one change the task scheduler's state, so the whole
 * tool is a write and no read-only role has it: a background job is not a read.
 *
 * The scheduler itself belongs to the host; the catalogue owns the four actions the model may call.
 */
import { z } from "zod"
import { contributedAction, type ActionSpec } from "./action.ts"

const flag = z.preprocess((value) => (value === "true" ? true : value === "false" ? false : value), z.boolean())
const taskId = z.object({ taskId: z.string().uuid() }).strict()

export const AGENT_ACTIONS: ReadonlyArray<ActionSpec> = [
  contributedAction({
    id: "agent.start", kind: "write", replaces: "agent_task", contribution: "agent.start",
    parameters: z.object({
      description: z.string().trim().min(1).max(200),
      prompt: z.string().trim().min(1).max(20_000),
      agent: z.string().trim().optional(),
      subagent_type: z.string().trim().optional(),
      background: flag.optional()
    })
  }),
  contributedAction({ id: "agent.list", kind: "write", replaces: "agent_tasks", contribution: "agent.list", parameters: z.object({}) }),
  contributedAction({ id: "agent.read", kind: "write", replaces: "agent_task_read", contribution: "agent.read", parameters: taskId }),
  contributedAction({ id: "agent.cancel", kind: "write", replaces: "agent_task_cancel", contribution: "agent.cancel", parameters: taskId })
]