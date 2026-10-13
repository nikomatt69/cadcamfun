/**
 * The order in which an answer happened. The stream gives reasoning, text and tool calls as they come, and the transcript shows
 * them in that order (as nikcli's session view and Claude Code do): the agent thinks, says what it does, calls a tool, reads the
 * result, goes on. Consecutive pieces of the same kind are one block.
 */
import type { AiEvent, AiMessage } from "./types.ts"

export type TimelineSegment =
  | { readonly kind: "reasoning"; readonly text: string }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "tool"; readonly callId: string; readonly tool: string }
  | { readonly kind: "retry"; readonly attempt: number; readonly message: string }
  | { readonly kind: "diagnostic"; readonly severity: "error" | "warning" | "info"; readonly message: string; readonly tool: string; readonly recovery?: string }

export const timelineOf = (message: Pick<AiMessage, "events" | "text" | "thinking">): ReadonlyArray<TimelineSegment> => {
  const out: TimelineSegment[] = []
  const add = (event: AiEvent): void => {
    if (event.type === "reasoning" || event.type === "delta") {
      const kind = event.type === "reasoning" ? "reasoning" : "text"
      const last = out.at(-1)
      if (last !== undefined && last.kind === kind) out[out.length - 1] = { kind, text: last.text + event.text }
      else out.push({ kind, text: event.text })
    } else if (event.type === "tool_call") {
      out.push({ kind: "tool", callId: event.callId, tool: event.tool })
    } else if (event.type === "retry") {
      out.push({ kind: "retry", attempt: event.attempt, message: event.message })
    } else if (event.type === "tool_diagnostic") {
      out.push({ kind: "diagnostic", severity: event.severity, message: event.message, tool: event.tool, ...(event.recovery ? { recovery: event.recovery } : {}) })
    } else if (event.type === "permission_blocked") {
      out.push({ kind: "diagnostic", severity: "warning", message: event.reason, tool: event.permission })
    } else if (event.type === "turn" && (event.phase === "recovering" || event.phase === "continuing")) {
      out.push({ kind: "diagnostic", severity: "info", message: event.reason || (event.phase === "recovering" ? "Recovering the assistant turn" : "Continuing the assistant turn"), tool: "Assistant" })
    } else if (event.type === "compaction") {
      out.push({ kind: "diagnostic", severity: "info", message: event.phase === "start" ? "Summarizing earlier context" : "Earlier context summarized", tool: "Context" })
    }
  }
  for (const event of message.events) add(event)
  // Reconnection can recover a final answer after only its first deltas arrived. Preserve
  // the tool/reasoning order, but render the authoritative answer rather than stale tokens.
  const streamed = out.flatMap((segment) => segment.kind === "text" ? [segment.text] : []).join("")
  if (streamed !== "" && message.text !== "" && streamed !== message.text) {
    const lastText = out.findLastIndex((segment) => segment.kind === "text")
    if (message.text.startsWith(streamed)) {
      const segment = out[lastText]
      if (segment?.kind === "text") out[lastText] = { kind: "text", text: segment.text + message.text.slice(streamed.length) }
    } else {
      for (let index = out.length - 1; index >= 0; index--) if (out[index]?.kind === "text") out.splice(index, 1)
      out.push({ kind: "text", text: message.text })
    }
  }
  // A message that was restored or recovered has its text but not the events that made it: show the text.
  if (!out.some((s) => s.kind === "text") && message.text !== "") out.push({ kind: "text", text: message.text })
  if (!out.some((s) => s.kind === "reasoning") && message.thinking !== undefined && message.thinking !== "") out.unshift({ kind: "reasoning", text: message.thinking })
  return out
}

/** Tools that only look: a run of them, once it is over, is folded into one row (nikcli's exploration summary). */
export const READ_ONLY_TOOLS: ReadonlyArray<string> = [
  // The consolidated tools that cannot change anything (the catalogue's `read` kind); their write twins (`cad_edit`, `cam_edit`, ...) never fold.
  "cad", "cam", "library", "memory", "vcs", "research",
  // The per-verb ids they replaced, for conversations saved before the consolidation.
  "cad_describe_drawing", "cad_check_design", "cam_describe_machine", "cam_list_operations", "cam_suggest_parameters", "cam_analyze_gcode",
  "lib_lookup_tool", "lib_lookup_material", "memory_recall", "vcs_status", "vcs_diff", "vcs_list_pull_requests", "agent_tasks", "agent_task_read", "get_goal", "skill"
]

export type GroupedSegment = TimelineSegment | { readonly kind: "group"; readonly calls: ReadonlyArray<{ readonly callId: string; readonly tool: string }> }

/**
 * Folds runs of two or more finished read-only tool calls into one group. A run that is still going stays open (collapsing it
 * would hide work in progress), and a call that failed is never folded: it should be seen.
 */
export const groupExploration = (segments: ReadonlyArray<TimelineSegment>, finished: (callId: string) => boolean): ReadonlyArray<GroupedSegment> => {
  const out: GroupedSegment[] = []
  let run: Array<{ callId: string; tool: string }> = []
  const flush = (): void => {
    if (run.length >= 2) out.push({ kind: "group", calls: run })
    else for (const call of run) out.push({ kind: "tool", callId: call.callId, tool: call.tool })
    run = []
  }
  for (const segment of segments) {
    if (segment.kind === "tool" && READ_ONLY_TOOLS.includes(segment.tool) && finished(segment.callId)) run.push({ callId: segment.callId, tool: segment.tool })
    else { flush(); out.push(segment) }
  }
  flush()
  return out
}
