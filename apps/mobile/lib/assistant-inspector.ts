import type { AssistantPermissionMode } from "./assistant-preferences"
import { formatTokens, type TurnActivity } from "./turn-activity"

/**
 * Pure logic behind the "Assistant controls" sheet (nikcli: SessionInspectorSheet and PermissionModeSheet):
 * the context meter, the turn's token line, the tone of each permission preset and the grouping of the
 * desktop's tools. Kept free of React so it is unit-testable under bun.
 */

export type MeterLevel = "ok" | "warn" | "high"

export interface ContextUsage {
  /** 0..1, clamped. */
  readonly fraction: number
  readonly percent: number
  /** `warn` from 70%, `high` from 85%: the point where the desktop starts to compact. */
  readonly level: MeterLevel
}

export const contextUsage = (tokens: number | undefined, window: number | undefined): ContextUsage | undefined => {
  if (tokens === undefined || window === undefined || !Number.isFinite(tokens) || !Number.isFinite(window) || window <= 0) return undefined
  const fraction = Math.min(1, Math.max(0, tokens / window))
  return { fraction, percent: Math.round(fraction * 100), level: fraction > 0.85 ? "high" : fraction >= 0.7 ? "warn" : "ok" }
}

export interface TurnTotals {
  readonly input: string
  readonly output: string
  readonly steps: number
  readonly total: number
}

/** The last turn's token spend; undefined before the first turn has reported usage. */
export const turnTotals = (activity: TurnActivity): TurnTotals | undefined => {
  const total = activity.inputTokens + activity.outputTokens
  return total > 0 ? { input: formatTokens(activity.inputTokens), output: formatTokens(activity.outputTokens), steps: activity.step, total } : undefined
}

/** The goal's token budget as a fraction, when the goal has one. */
export const goalBudget = (goal: TurnActivity["goal"]): ContextUsage | undefined =>
  goal?.tokenBudget ? contextUsage(goal.tokensUsed, goal.tokenBudget) : undefined

export type PermissionTone = "accent" | "warning" | "info"

/** nikcli tints each preset: the careful one warm, the automatic one cool, the default in the accent. */
export const permissionTone = (mode: AssistantPermissionMode): PermissionTone =>
  mode === "ask" ? "warning" : mode === "auto" ? "info" : "accent"

/** "general" to "General", "cad-editor" to "Cad editor". */
export const agentLabel = (id: string): string => {
  const words = id.trim().replace(/[_-]+/g, " ")
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "General"
}

const TOOL_GROUPS: ReadonlyArray<{ prefix: string; label: string }> = [
  { prefix: "cad_", label: "CAD" },
  { prefix: "cam_", label: "CAM" },
  { prefix: "vcs_", label: "Version control" },
  { prefix: "mcp_", label: "Extensions" },
]

export interface ToolGroup<T> {
  readonly label: string
  readonly tools: readonly T[]
}

/** Groups the desktop's tools by the family their id names; unknown ids land in "General". Order is stable. */
export const groupTools = <T extends { readonly id: string }>(tools: readonly T[]): readonly ToolGroup<T>[] => {
  const buckets = new Map<string, T[]>()
  for (const tool of tools) {
    const label = TOOL_GROUPS.find((group) => tool.id.startsWith(group.prefix))?.label ?? "General"
    buckets.set(label, [...(buckets.get(label) ?? []), tool])
  }
  const order = [...TOOL_GROUPS.map((group) => group.label), "General"]
  return order.flatMap((label) => buckets.has(label) ? [{ label, tools: [...buckets.get(label)!].sort((a, b) => a.id.localeCompare(b.id)) }] : [])
}

/** A tool id as a short readable name: `cad_edit_part` becomes "edit part". */
export const toolTitle = (id: string): string => id.replace(/^(vcs|cad|cam|mcp)_/, "").replaceAll("_", " ")

export type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger"

/** The tone of a task's status chip. */
export const taskTone = (status: string): StatusTone =>
  status === "running" ? "accent" : status === "completed" ? "success" : status === "error" ? "danger" : status === "queued" ? "warning" : "neutral"

/** The tone of a goal's status chip: working toward it, done, or stuck on a limit. */
export const goalTone = (status: string): StatusTone =>
  status === "active" ? "accent" : status === "complete" ? "success" : status === "paused" ? "neutral" : "warning"

/** "budget_limited" to "Budget limited". */
export const statusLabel = (status: string): string => {
  const words = status.replaceAll("_", " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** "12.4k of 128k tokens", or just the window when the count is unknown. */
export const contextLine = (tokens: number | undefined, window: number): string =>
  tokens === undefined ? `${formatTokens(window)} token window` : `${formatTokens(tokens)} of ${formatTokens(window)} tokens`
