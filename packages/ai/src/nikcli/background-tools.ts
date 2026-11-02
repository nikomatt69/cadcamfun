/**
 * Delegation: the four actions behind the `agent` tool, implemented against the host's task scheduler. The catalogue
 * owns their ids, effects and validation (`actions/agent.ts`); this module contributes the implementations, which is
 * the only production caller of the catalogue's contribution seam.
 */
import type { ActionContribution } from "../actions/action.ts"
import { BackgroundTaskManagerError, type BackgroundTask, type BackgroundTaskManagerInterface, type BackgroundTaskOwner } from "./background-tasks.ts"
import { SUBAGENT_IDS, SUBAGENTS, isSubagentId, subagentCatalogue } from "./agents.ts"
import type { ToolContext } from "../tools/define.ts"
import { AgentBriefReport } from "@cadcamfun/api"
import { Schema } from "effect"

/** A readable refusal instead of a thrown error when the model names a specialist that does not exist. */
const refuse = (message: string) => ({ ok: false, error: message })

/**
 * The `background` flag as a boolean. The action schema coerces `"true"` before an implementation sees it, but this
 * contribution is also called directly, and a strict `=== true` there would read the string `"true"` as false and
 * silently block the caller on a background job. A flag is never worth a wrong answer about whether to wait. It is
 * `undefined` only when the call said nothing, so the caller can apply nikcli's default (`true`): the job returns at
 * once and the completion wakes this conversation.
 */
const backgroundFlag = (value: unknown): boolean | undefined =>
  value === undefined ? undefined : value === true || value === "true"

/** What `agent.start` hands the specialist: the prompt it will receive, or why the call cannot be built into one. */
export type AgentJob = { readonly ok: true; readonly prompt: string } | { readonly ok: false; readonly error: string }

const failJob = (error: string): AgentJob => ({ ok: false, error })

const BRIEF_SHAPE = `brief takes { objective, ids?: string[], values?: [{ name, value, unit? }], limits?: string[], report?: string | string[] }.`
const decodeReport = Schema.decodeUnknownOption(AgentBriefReport)

/**
 * The one place a delegation becomes the specialist's prompt. A free `prompt` alone is passed on as written; a structured
 * `brief` is rendered as labelled sections (Objective, Ids, Values, Limits, Expected report) and the free prompt, when
 * given too, follows as Details. The objective is the one required part of a brief, so a brief that does not say what
 * the job is for is refused. Pure: nothing here reads project or session state, so an id is passed on as written and
 * the specialist reads it back with its own tools (the specialist prompts say so).
 */
export const agentJobPrompt = (input: Record<string, unknown>): AgentJob => {
  const trimmedText = (value: unknown): string => (typeof value === "string" ? value.trim() : "")
  const prompt = trimmedText(input["prompt"])
  const brief = input["brief"]
  if (brief === undefined || brief === null) {
    return prompt === "" ? failJob(`agent.start needs a job: give a brief with an objective, or a prompt. ${BRIEF_SHAPE}`) : { ok: true, prompt }
  }
  if (typeof brief !== "object" || Array.isArray(brief)) return failJob(`The brief must be an object. ${BRIEF_SHAPE}`)
  const fields = brief as Record<string, unknown>
  const objective = trimmedText(fields["objective"])
  if (objective === "") return failJob(`A brief needs an objective: one or two sentences saying what the specialist must achieve. ${BRIEF_SHAPE}`)
  const strings = (name: string): ReadonlyArray<string> | string => {
    const value = fields[name]
    if (value === undefined) return []
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return `brief.${name} must be a list of strings. ${BRIEF_SHAPE}`
    return value.map(trimmedText).filter((item) => item !== "")
  }
  const ids = strings("ids")
  const limits = strings("limits")
  if (typeof ids === "string") return failJob(ids)
  if (typeof limits === "string") return failJob(limits)
  const values: string[] = []
  if (fields["values"] !== undefined) {
    if (!Array.isArray(fields["values"])) return failJob(`brief.values must be a list of { name, value, unit? }. ${BRIEF_SHAPE}`)
    for (const entry of fields["values"] as ReadonlyArray<unknown>) {
      const item = entry !== null && typeof entry === "object" ? (entry as Record<string, unknown>) : {}
      const name = trimmedText(item["name"])
      const raw = item["value"]
      const value = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : trimmedText(raw)
      const unit = item["unit"] === undefined ? "" : trimmedText(item["unit"])
      if (name === "" || value === "") return failJob(`Every brief value needs a name and a value (a number or text), with its unit. ${BRIEF_SHAPE}`)
      values.push(unit === "" ? `${name}: ${value}` : `${name}: ${value} ${unit}`)
    }
  }
  const reportValue = fields["report"] === undefined ? undefined : decodeReport(fields["report"])
  if (reportValue?._tag === "None") return failJob(`brief.report must be text or a nonempty list of strings, at most 1000 characters total. ${BRIEF_SHAPE}`)
  const report = reportValue?._tag === "Some" ? reportValue.value : ""
  const section = (title: string, items: ReadonlyArray<string>): string[] => (items.length === 0 ? [] : [`${title}:`, ...items.map((item) => `- ${item}`), ""])
  const lines = [
    `Objective: ${objective}`, "",
    ...section("Ids", ids),
    ...section("Values", values),
    ...section("Limits", limits),
    ...(report === "" ? [] : [`Expected report, in addition to your usual final message: ${report}`, ""]),
    ...(prompt === "" ? [] : ["Details:", prompt, ""])
  ]
  return { ok: true, prompt: lines.join("\n").trimEnd() }
}

/**
 * The document state the brief was written against. The specialist does not see this conversation, and the target is bound to its
 * tools out of its sight, so without this it cannot tell that the drawing moved on while it was queued. Nothing is added when
 * the call carries no target (a host without a drawing).
 */
export const baselineSection = (target: { readonly drawingId?: string; readonly revision?: string } | undefined): string => {
  if (target === undefined || (target.drawingId === undefined && target.revision === undefined)) return ""
  return [
    "", "", "Document baseline (when this job was delegated):",
    ...(target.drawingId !== undefined ? [`- Drawing: ${target.drawingId}`] : []),
    ...(target.revision !== undefined ? [`- Revision: ${target.revision}`] : []),
    "If a tool shows a newer revision or an id from Ids is gone, re-read the targets before changing anything and say so in your report."
  ].join("\n")
}

/**
 * A task as the model reads it back with `list` and `read`. The brief it wrote, the trusted target and the host's own bookkeeping stay
 * out: the model has the brief (`start` echoes it once, as the proof of what the specialist was given), and repeating it, and the whole
 * report of every task in a list, on every later call is context spent on nothing. A list gives the
 * size of each report; `read` gives the report itself.
 */
export const presentTask = (task: BackgroundTask, withReport = true): Record<string, unknown> => {
  const { prompt: _prompt, target: _target, deliveryAgent: _deliveryAgent, childSessionId: _childSessionId, text, ...rest } = task
  return withReport ? { ...rest, ...(text !== undefined ? { text } : {}) } : { ...rest, ...(text !== undefined ? { reportChars: text.length } : {}) }
}

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
      const job = agentJobPrompt(value)
      if (!job.ok) return refuse(job.error)
      const brief = value["brief"]
      const ids = brief !== null && typeof brief === "object" && "ids" in brief && Array.isArray(brief.ids)
        ? brief.ids.filter((id): id is string => typeof id === "string") : []
      if (ids.length > 0 && context.validateDelegation !== undefined) {
        const checked = await context.validateDelegation(ids)
        if (!checked.ok) return refuse(checked.error ?? "The delegation names unavailable or stale references. Inspect them before delegating.")
      }
      // nikcli's `background` is optional and defaults to true: start returns at once and the completion wakes this
      // conversation. Only an explicit false makes the call wait for the report.
      const background = backgroundFlag(value["background"]) ?? true
      let task: BackgroundTask
      try {
        task = manager.enqueue({
          description: String(value["description"]), prompt: job.prompt + baselineSection(context.taskTarget),
          ...owner, agent: spec.id, edits: spec.edits, background,
          ...(context.taskTarget !== undefined ? { target: context.taskTarget } : {})
        })
      } catch (error) {
        if (error instanceof BackgroundTaskManagerError && error.code === "queue_full") {
          return refuse("Too many specialist jobs are already waiting. Read the reports that have finished, cancel the jobs you no longer need (agent action cancel), or start this one with background false so it runs in this call.")
        }
        throw error
      }
      const admitted = manager.accepted !== undefined ? await manager.accepted(owner, task.id) : task
      // The caller asked to wait: the specialist works inside this tool call and its report is the call's result.
      if (background) return admitted
      return { ...(await manager.wait(owner, task.id, context.signal)), specialists: subagentCatalogue() }
    }
    if (action === "agent.list") return manager.list(owner).map((task) => presentTask(task, false))
    const taskId = String(value["taskId"])
    return presentTask(action === "agent.read" ? manager.read(owner, taskId) : manager.cancel(owner, taskId))
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
