import type { LogEvent } from "./chat-log"

/**
 * What the desktop is doing right now, folded from the same stream frames as the transcript
 * (nikcli: the session status line above the composer). The transcript keeps what was said;
 * this keeps the live phase, the step count and what the turn has cost so far.
 */
export type TurnPhase = "idle" | "starting" | "thinking" | "writing" | "tool" | "retrying" | "compacting" | "recovering"

export interface TurnActivity {
  readonly phase: TurnPhase
  /** Tool the model is writing or running (raw id, e.g. `cad_edit`). */
  readonly tool?: string
  /** 1-based step of the agent loop. */
  readonly step: number
  readonly retry?: { readonly attempt: number; readonly message: string }
  readonly inputTokens: number
  readonly outputTokens: number
  readonly goal?: { readonly objective: string; readonly status: string; readonly tokensUsed: number; readonly tokenBudget?: number }
}

export const idleActivity: TurnActivity = { phase: "idle", step: 0, inputTokens: 0, outputTokens: 0 }

const usageOf = (value: unknown): { inputTokens: number; outputTokens: number } | undefined => {
  if (!value || typeof value !== "object") return undefined
  const usage = value as { inputTokens?: unknown; outputTokens?: unknown }
  const input = typeof usage.inputTokens === "number" && Number.isFinite(usage.inputTokens) ? Math.max(0, usage.inputTokens) : 0
  const output = typeof usage.outputTokens === "number" && Number.isFinite(usage.outputTokens) ? Math.max(0, usage.outputTokens) : 0
  return { inputTokens: input, outputTokens: output }
}

const without = (activity: TurnActivity, phase: TurnPhase, patch: Partial<TurnActivity> = {}): TurnActivity => {
  const { tool: _tool, retry: _retry, ...rest } = activity
  return { ...rest, phase, ...patch }
}

export const reduceTurnActivity = (activity: TurnActivity, event: LogEvent): TurnActivity => {
  const frame = event as { type: string; [key: string]: unknown }
  switch (frame.type) {
    case "user":
      // A new prompt starts a new meter; a steer while busy keeps the running one.
      return activity.phase === "idle" ? { ...idleActivity, phase: "starting", ...(activity.goal ? { goal: activity.goal } : {}) } : activity
    case "turn":
      if (frame.phase === "recovering") return without(activity, "recovering")
      if (frame.phase === "finish") return without(activity, "idle")
      return activity.phase === "idle" ? without(activity, "starting") : activity
    case "step": {
      if (frame.phase === "start") return without(activity, "thinking", { step: typeof frame.index === "number" ? frame.index : activity.step + 1 })
      // Step usage is per model call: the turn total is their sum.
      const usage = usageOf(frame.usage)
      return usage ? { ...activity, inputTokens: activity.inputTokens + usage.inputTokens, outputTokens: activity.outputTokens + usage.outputTokens } : activity
    }
    case "reasoning":
      return activity.phase === "thinking" ? activity : without(activity, "thinking")
    case "delta":
      return activity.phase === "writing" ? activity : without(activity, "writing")
    case "tool_progress":
    case "tool_call":
      return typeof frame.tool === "string" ? without(activity, "tool", { tool: frame.tool }) : activity
    case "tool_result":
      return without(activity, "thinking")
    case "retry":
      return without(activity, "retrying", { retry: { attempt: typeof frame.attempt === "number" ? frame.attempt : 1, message: typeof frame.message === "string" ? frame.message : "" } })
    case "compaction":
      return frame.phase === "start" ? without(activity, "compacting") : without(activity, "thinking")
    case "compacted":
      return activity.phase === "compacting" ? without(activity, "thinking") : activity
    case "session_status":
      if (frame.status === "idle") return without(activity, "idle")
      return activity.phase === "idle" ? without(activity, "starting") : activity
    case "goal": {
      const goal = frame.goal as TurnActivity["goal"] | null | undefined
      if (goal === null) { const { goal: _goal, ...rest } = activity; return rest }
      return goal && typeof goal.objective === "string" ? { ...activity, goal: { objective: goal.objective, status: String(goal.status), tokensUsed: Number(goal.tokensUsed) || 0, ...(typeof goal.tokenBudget === "number" ? { tokenBudget: goal.tokenBudget } : {}) } } : activity
    }
    case "done": {
      // The final usage, when the host sends it, is authoritative for the whole turn.
      const usage = usageOf(frame.usage)
      return without(activity, "idle", usage && usage.inputTokens + usage.outputTokens > 0 ? usage : {})
    }
    case "error":
      return without(activity, "idle")
    default:
      return activity
  }
}

const toolName = (tool: string): string => tool.replace(/^(vcs|cad|cam|mcp)_/, "").replaceAll("_", " ")

/** Compact token count: 950, 12.4k, 1.2M. */
export const formatTokens = (count: number): string => {
  if (!Number.isFinite(count) || count < 1000) return String(Math.max(0, Math.round(Number.isFinite(count) ? count : 0)))
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 100_000 ? 1 : 0).replace(/\.0$/, "")}k`
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}

/** One line for the status strip above the composer. */
export const activityLabel = (activity: TurnActivity): string => {
  const phase = (() => {
    switch (activity.phase) {
      case "idle": return "Ready"
      case "starting": return "Starting on the desktop…"
      case "thinking": return "Thinking…"
      case "writing": return "Writing the answer…"
      case "tool": return activity.tool ? `Running ${toolName(activity.tool)}…` : "Running a tool…"
      case "retrying": return `Provider retry ${activity.retry?.attempt ?? 1}…`
      case "compacting": return "Compacting the conversation…"
      case "recovering": return "Recovering the turn…"
    }
  })()
  const tokens = activity.inputTokens + activity.outputTokens
  return [phase, activity.step > 1 ? `step ${activity.step}` : undefined, tokens > 0 ? `${formatTokens(tokens)} tokens` : undefined].filter(Boolean).join(" · ")
}
