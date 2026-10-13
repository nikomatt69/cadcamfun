import { expect, test } from "bun:test"
import { timelineOf } from "../src/features/ai/lib/timeline.ts"
import type { AiEvent } from "../src/features/ai/lib/types.ts"

test("recovered final text extends streamed text without losing tool order", () => {
  const events: AiEvent[] = [
    { type: "delta", sessionId: "s", text: "Checking. " },
    { type: "tool_call", sessionId: "s", callId: "c", tool: "cad", input: { action: "check",} },
    { type: "delta", sessionId: "s", text: "The plate" },
  ]
  expect(timelineOf({ events, text: "Checking. The plate is valid." })).toEqual([
    { kind: "text", text: "Checking. " },
    { kind: "tool", callId: "c", tool: "cad" },
    { kind: "text", text: "The plate is valid." },
  ])
})

test("a recovered replacement answer supersedes stale deltas", () => {
  expect(timelineOf({ text: "The corrected setup is safe.", events: [
    { type: "delta", sessionId: "s", text: "Incomplete analysis" },
    { type: "tool_call", sessionId: "s", callId: "c", tool: "cam", input: { action: "analyze",} },
  ] })).toEqual([
    { kind: "tool", callId: "c", tool: "cam" },
    { kind: "text", text: "The corrected setup is safe." },
  ])
})

test("host continuation and compaction explain work without rendering native idle/retry twice", () => {
  expect(timelineOf({ text: "", events: [
    { type: "turn", sessionId: "s", phase: "continuing", reason: "Repair the skipped radius" },
    { type: "session_status", sessionId: "s", status: "retry" },
    { type: "retry", sessionId: "s", attempt: 1, message: "Trying the provider again" },
    { type: "compaction", sessionId: "s", phase: "start" },
    { type: "compaction", sessionId: "s", phase: "finish" },
    { type: "session_status", sessionId: "s", status: "idle" },
  ] })).toEqual([
    { kind: "diagnostic", severity: "info", message: "Repair the skipped radius", tool: "Assistant" },
    { kind: "retry", attempt: 1, message: "Trying the provider again" },
    { kind: "diagnostic", severity: "info", message: "Summarizing earlier context", tool: "Context" },
    { kind: "diagnostic", severity: "info", message: "Earlier context summarized", tool: "Context" },
  ])
})

test("partial committed mutations keep a visible warning and a successful tool result", () => {
  const events: AiEvent[] = [
    { type: "tool_call", sessionId: "s", callId: "c", tool: "cad_edit", input: { action: "add",} },
    { type: "tool_result", sessionId: "s", callId: "c", tool: "cad_edit", ok: true, output: '{"elements":[{"id":"plate"}],"skipped":[{"reason":"Missing radius"}]}' },
    { type: "tool_diagnostic", sessionId: "s", callId: "c", tool: "cad_edit", kind: "partial", severity: "warning", message: "One element was skipped", mutationApplied: true, recovery: "Repair the missing radius" },
  ]
  expect(timelineOf({ text: "", events })).toEqual([
    { kind: "tool", callId: "c", tool: "cad_edit" },
    { kind: "diagnostic", severity: "warning", message: "One element was skipped", tool: "cad_edit", recovery: "Repair the missing radius" },
  ])
  expect(events[1]).toMatchObject({ type: "tool_result", ok: true })
})
