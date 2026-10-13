/**
 * What a tool result says in a line or two, for the chat: the branch a change started on, the commit, the pull request, the
 * status of each workflow, the specialist a job went to. The tool's own JSON stays available under the row.
 *
 * One host tool carries several actions, so every fact here is keyed by `tool.action` — the same pair the catalogue declares.
 */
import { actionOf } from "./tool-schemas.ts"
import type { ToolId } from "./tools.ts"

const rec = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const parse = (output: string): unknown => { try { return JSON.parse(output) } catch { return undefined } }

/** The `value` of a version-control tool answer (`{ok, value}`), or undefined when it failed. */
const valueOf = (output: string): unknown => {
  const answer = rec(parse(output))
  return answer?.["ok"] === true ? answer["value"] : undefined
}

/** What one tool call did, as `tool.action` — the identity the rest of the UI branches on. */
export const callKey = (tool: string, input: unknown): string => {
  const action = actionOf(input)
  return action === undefined ? tool : `${tool}.${action}`
}

export const isVcsTool = (tool: string): boolean => tool === "vcs" || tool === "vcs_edit"

export const toolFacts = (tool: string, input: unknown, output: string | undefined): ReadonlyArray<string> => {
  if (output === undefined || output === "") return []
  const key = callKey(tool, input)
  if (tool === "agent") {
    const task = rec(parse(output))
    if (task === undefined) return []
    if (key === "agent.list") return Array.isArray(parse(output)) ? [`${(parse(output) as unknown[]).length} agent tasks`] : []
    if (key === "agent.cancel") return ["Agent task cancelled"]
    const text = typeof task["text"] === "string" ? task["text"].trim().split("\n")[0]!.slice(0, 160) : undefined
    return [`${String(task["agent"] ?? "researcher")} · ${String(task["status"] ?? "")}`, ...(text ? [text] : [])]
  }
  if (!isVcsTool(tool)) return []
  const value = rec(valueOf(output))
  if (key === "vcs_edit.run_workflows") {
    const runs = valueOf(output)
    return Array.isArray(runs) ? runs.flatMap((run) => { const r = rec(run); return r ? [`${String(r["workflow"])}: ${String(r["status"])}`] : [] }) : []
  }
  if (value === undefined) return []
  if (key === "vcs_edit.start_change") return [`branch ${String(value["branch"])}`]
  if (key === "vcs_edit.commit") return [`commit ${String(value["commit"]).slice(0, 8)}`]
  if (key === "vcs_edit.open_pull_request") return [`pull request #${String(value["number"])} ${String(value["head"])} → ${String(value["base"])}`]
  if (key === "vcs_edit.restore") return [`restored ${(value["paths"] as unknown[] | undefined)?.length ?? 0} entities`]
  if (key === "vcs.status") {
    const dirty = Array.isArray(value["dirty"]) ? (value["dirty"] as unknown[]).length : 0
    const open = Array.isArray(value["openPullRequests"]) ? (value["openPullRequests"] as unknown[]).length : 0
    return [`branch ${String(value["branch"])} · ${dirty} changed · ${open} open PR`]
  }
  return []
}

export type { ToolId }