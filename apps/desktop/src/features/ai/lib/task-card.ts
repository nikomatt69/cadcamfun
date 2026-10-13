/** What a delegated task's card reads from the tool call that started it (pure, so it is tested without a DOM). */
import type { AiTask, AiToolCall } from "./types.ts"
import { actionOf } from "./tool-schemas.ts"

const STATUSES = ["queued", "running", "completed", "error", "cancelled"] as const

export const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

/** The task a delegating call returned, when it returned one. */
export const taskOfCall = (call: AiToolCall | undefined): AiTask | undefined => {
  if (call?.output === undefined) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(call.output) } catch { return undefined }
  const value = record(parsed)
  if (value === undefined || typeof value["id"] !== "string") return undefined
  const status = value["status"]
  if (typeof status !== "string" || !(STATUSES as ReadonlyArray<string>).includes(status)) return undefined
  const input = record(call.input)
  return {
    id: value["id"],
    agent: typeof value["agent"] === "string" ? value["agent"] : typeof input?.["agent"] === "string" ? input["agent"] : "unico",
    description: typeof value["description"] === "string" ? value["description"] : typeof input?.["description"] === "string" ? input["description"] : "",
    status: status as AiTask["status"],
    background: value["background"] !== false,
    ...(typeof value["text"] === "string" ? { text: value["text"] } : {}),
    ...(typeof value["error"] === "string" ? { error: value["error"] } : {}),
    ...(typeof value["createdAt"] === "number" ? { createdAt: value["createdAt"] } : {}),
    ...(typeof value["startedAt"] === "number" ? { startedAt: value["startedAt"] } : {}),
    ...(typeof value["finishedAt"] === "number" ? { finishedAt: value["finishedAt"] } : {})
  }
}

/** Whether a tool call is the start of a delegated task (the one call the transcript renders as a card). */
export const isTaskStart = (call: AiToolCall | undefined): boolean => call?.tool === "agent" && actionOf(call.input) === "start"

export const formatElapsed = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
}
