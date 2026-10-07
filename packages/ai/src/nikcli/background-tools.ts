import { z } from "zod"
import type { BackgroundTaskManagerInterface } from "./background-tasks.ts"
import type { HostToolSpec } from "./runtime.ts"

const taskInput = z.object({
  description: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(20_000)
}).strict()
const taskId = z.object({ taskId: z.string().uuid() }).strict()
const empty = z.object({}).strict()

/** Build the four `agent_task*` tools. The runtime wires the host session via `ctx.sessionId`. */
export const backgroundTools = (manager: BackgroundTaskManagerInterface): ReadonlyArray<HostToolSpec> => [
  {
    id: "agent_task",
    description: "Start a read-only CAD/CAM background research task. Provide description and prompt. At most four workers run across all projects, with sixteen tasks waiting. Workers cannot change documents, verify stored operations, delegate or manage goals. Findings are delivered to this session; the parent applies and verifies any changes.",
    parameters: taskInput,
    execute: async (input, ctx) => JSON.stringify(manager.enqueue({
      ...taskInput.parse(input), projectId: ctx.projectId, parentSessionId: ctx.sessionId
    }))
  },
  {
    id: "agent_tasks",
    description: "List background tasks belonging to this project and parent session, with status and findings.",
    parameters: empty,
    execute: async (input, ctx) => {
      empty.parse(input)
      return JSON.stringify(manager.list({ projectId: ctx.projectId, parentSessionId: ctx.sessionId }))
    }
  },
  {
    id: "agent_task_read",
    description: "Read the status and full findings of a background task by taskId, only within this project and parent session.",
    parameters: taskId,
    execute: async (input, ctx) => JSON.stringify(manager.read(
      { projectId: ctx.projectId, parentSessionId: ctx.sessionId }, taskId.parse(input).taskId
    ))
  },
  {
    id: "agent_task_cancel",
    description: "Cancel a background task by taskId owned by this project and parent session. A running worker retains its slot until it actually stops. Cancelled tasks do not wake the parent.",
    parameters: taskId,
    execute: async (input, ctx) => JSON.stringify(manager.cancel(
      { projectId: ctx.projectId, parentSessionId: ctx.sessionId }, taskId.parse(input).taskId
    ))
  }
]

/**
 * Idempotent helper that asks the manager for the four tools and ensures each
 * is registered with the active host. Returns the resolved ids so the runtime
 * can include them in the parent agent's permission allow-list.
 */
export const BACKGROUND_TOOL_IDS = ["agent_task", "agent_tasks", "agent_task_read", "agent_task_cancel"] as const

export const backgroundToolIds = (): ReadonlyArray<string> => [...BACKGROUND_TOOL_IDS]
