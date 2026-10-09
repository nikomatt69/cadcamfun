import { z } from "zod"
import type { BackgroundTaskManagerInterface } from "./background-tasks.ts"
import { SUBAGENT_IDS, SUBAGENTS, isSubagentId, subagentCatalogue, type SubagentSpec } from "./agents.ts"
import type { HostToolSpec } from "./runtime.ts"

const flag = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean())

/** Models write the agent the way nikcli's task tool does (`subagent_type`) or with the host's name; both resolve to a specialist. */
const specialist = (name: string | undefined): SubagentSpec => {
  const id = (name ?? "researcher").trim().toLowerCase().replace(/^cadcam-/, "").replace(/^worker$/, "researcher")
  if (!isSubagentId(id)) throw new Error(`Unknown agent "${name}". Use one of: ${SUBAGENT_IDS.join(", ")}.`)
  return SUBAGENTS[id]
}

// Unknown keys are dropped, not refused: a call that is right in substance must not cost the turn.
const taskInput = z.object({
  description: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(20_000),
  agent: z.string().trim().optional(),
  subagent_type: z.string().trim().optional(),
  background: flag.optional()
})
const taskId = z.object({ taskId: z.string().uuid() }).strict()
const empty = z.object({}).strict()

/** Build the four `agent_task*` tools (a specialist per call, foreground or background). The runtime wires the host session via `ctx.sessionId`. */
export const backgroundTools = (manager: BackgroundTaskManagerInterface): ReadonlyArray<HostToolSpec> => [
  {
    id: "agent_task",
    description: `Hand a job to a specialist agent that has only the tools that job needs (nikcli's task tool). Give a short description and a prompt that states the job, the entity ids or values it needs and what to report back; the specialist does not see this conversation.

Specialists (parameter agent, default researcher):
${subagentCatalogue()}

Read-only specialists run in the background by default: the call returns a taskId at once, and the findings are delivered to this session when they are ready. A specialist that edits runs in this turn by default: the call waits and returns its report, and its changes appear in the editor as they happen. Set background to true or false to choose the other mode; editing specialists run one at a time per project and the application allows at most four active specialists across all projects, with sixteen waiting. Verify what an editing specialist reports (cad_describe_drawing, cad_check_design) before telling the user it is done.`,
    parameters: taskInput,
    execute: async (input, ctx) => {
      const parsed = taskInput.parse(input)
      const spec = specialist(parsed.agent ?? parsed.subagent_type)
      const owner = { projectId: ctx.projectId, parentSessionId: ctx.sessionId }
      const background = parsed.background ?? spec.background
      const task = manager.enqueue({
        description: parsed.description, prompt: parsed.prompt, ...owner,
        agent: spec.id, edits: spec.edits, background
      })
      if (background) return JSON.stringify(task)
      // The specialist works inside this tool call: its result comes back as this call's result.
      const done = await manager.wait(owner, task.id, ctx.signal)
      return JSON.stringify(done)
    }
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
