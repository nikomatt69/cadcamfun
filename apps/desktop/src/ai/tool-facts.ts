/**
 * What a tool result says in a line or two, for the chat: the branch a change started on, the commit, the pull request, the
 * status of each workflow, the specialist a job went to. The tool's own JSON stays available under the row.
 */
import { VCS_TOOL_IDS } from "./tools.ts"

export const isVcsTool = (tool: string): boolean => (VCS_TOOL_IDS as ReadonlyArray<string>).includes(tool)

const rec = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const parse = (output: string): unknown => { try { return JSON.parse(output) } catch { return undefined } }

/** The `value` of a version-control tool answer (`{ok, value}`), or undefined when it failed. */
const valueOf = (output: string): unknown => {
  const answer = rec(parse(output))
  return answer?.["ok"] === true ? answer["value"] : undefined
}

export const toolFacts = (tool: string, output: string | undefined): ReadonlyArray<string> => {
  if (output === undefined || output === "") return []
  if (tool === "agent_task") {
    const task = rec(parse(output))
    if (task === undefined) return []
    const text = typeof task["text"] === "string" ? task["text"].trim().split("\n")[0]!.slice(0, 160) : undefined
    return [`${String(task["agent"] ?? "researcher")} · ${String(task["status"] ?? "")}`, ...(text ? [text] : [])]
  }
  if (!isVcsTool(tool)) return []
  const value = rec(valueOf(output))
  if (tool === "actions_run") {
    const runs = valueOf(output)
    return Array.isArray(runs) ? runs.flatMap((run) => { const r = rec(run); return r ? [`${String(r["workflow"])}: ${String(r["status"])}`] : [] }) : []
  }
  if (value === undefined) return []
  if (tool === "vcs_start_change") return [`branch ${String(value["branch"])}`]
  if (tool === "vcs_commit") return [`commit ${String(value["commit"]).slice(0, 8)}`]
  if (tool === "vcs_open_pull_request") return [`pull request #${String(value["number"])} ${String(value["head"])} → ${String(value["base"])}`]
  if (tool === "vcs_status") {
    const dirty = Array.isArray(value["dirty"]) ? value["dirty"].length : 0
    const open = Array.isArray(value["openPullRequests"]) ? value["openPullRequests"].length : 0
    return [`branch ${String(value["branch"])} · ${dirty} changed · ${open} open PR`]
  }
  return []
}
