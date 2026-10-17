import { describe, expect, test } from "bun:test"
import { answerRequest, appendChatEvent, emptyLog } from "../lib/chat-log"
import type { ChatEvent } from "../lib/sse"

const ev = (e: ChatEvent | { type: "user"; text: string }) => e

describe("appendChatEvent", () => {
  test("folds consecutive deltas into one assistant bubble", () => {
    let log = emptyLog
    log = appendChatEvent(log, ev({ type: "delta", sessionId: "s1", text: "Hel" }))
    log = appendChatEvent(log, ev({ type: "delta", sessionId: "s1", text: "lo" }))
    expect(log).toHaveLength(1)
    expect(log[0]).toEqual({ kind: "assistant", text: "Hello", sessionId: "s1" })
  })

  test("starts a new bubble when the session changes", () => {
    const l1 = appendChatEvent(emptyLog, ev({ type: "delta", sessionId: "s1", text: "a" }))
    const l2 = appendChatEvent(l1, ev({ type: "delta", sessionId: "s2", text: "b" }))
    expect(l2).toHaveLength(2)
  })

  test("tool call then result marks the row done", () => {
    const l1 = appendChatEvent(emptyLog, ev({ type: "tool_call", sessionId: "s1", callId: "c1", tool: "vcs_commit", input: {} }))
    const l2 = appendChatEvent(l1, ev({ type: "tool_result", sessionId: "s1", callId: "c1", tool: "vcs_commit", ok: true, output: "ok" }))
    expect(l2).toHaveLength(1)
    expect(l2[0]).toMatchObject({ kind: "tool", tool: "commit", ok: true })
  })

  test("unknown frames are ignored", () => {
    expect(appendChatEvent(emptyLog, ev({ type: "whatever", sessionId: "s" }))).toEqual([])
  })

  test("permission requests become answerable rows", () => {
    const log = appendChatEvent(
      emptyLog,
      ev({ type: "permission_request", sessionId: "s1", requestId: "r1", permission: "edit", patterns: ["*.json"] }),
    )
    expect(log[0]).toMatchObject({ kind: "request", requestId: "r1", permission: "edit" })
    const answered = answerRequest(log, "r1", true)
    expect(answered[0]).toMatchObject({ answered: true })
  })
})

test("recovered done displays the final answer without duplicate deltas", () => {
  let log = appendChatEvent(emptyLog, { type: "user", text: "Build" })
  log = appendChatEvent(log, { type: "delta", sessionId: "s1", text: "Done" })
  log = appendChatEvent(log, { type: "done", sessionId: "s1", text: "Done", recovered: true })
  expect(log.filter((row) => row.kind === "assistant")).toHaveLength(1)
  log = appendChatEvent(log, { type: "done", sessionId: "s1", text: "Done and checked", recovered: true })
  expect(log.at(-1)).toMatchObject({ kind: "assistant", text: "Done and checked" })
})

test("questions and permissions resolve from server events", () => {
  let log = appendChatEvent(emptyLog, { type: "question_request", sessionId: "s", requestId: "q", questions: [{ header: "Stock", question: "Material?", options: [] }] })
  log = appendChatEvent(log, { type: "question_resolved", sessionId: "s", requestId: "q" })
  expect(log[0]).toMatchObject({ kind: "question", answered: true })
  log = appendChatEvent(log, { type: "permission_request", sessionId: "s", requestId: "p", permission: "edit", patterns: [] })
  log = appendChatEvent(log, { type: "permission_resolved", sessionId: "s", requestId: "p", reply: "once" })
  expect(log.at(-1)).toMatchObject({ kind: "request", answered: true })
})

test("tool diagnostics preserve actionable failure evidence", () => {
  let log = appendChatEvent(emptyLog, { type: "tool_call", sessionId: "s", callId: "c", tool: "cam_verify_toolpath", input: { operationId: "op" }, agent: "machinist" })
  log = appendChatEvent(log, { type: "tool_result", sessionId: "s", callId: "c", tool: "cam_verify_toolpath", ok: false, output: "collision" })
  log = appendChatEvent(log, { type: "tool_diagnostic", sessionId: "s", callId: "c", tool: "cam_verify_toolpath", kind: "verification", severity: "error", message: "Holder collision", recovery: "Inspect holder reach" })
  expect(log[0]).toMatchObject({ kind: "tool", ok: false, agent: "machinist", output: "collision", diagnostic: { message: "Holder collision", recovery: "Inspect holder reach" } })
})

test("polling recovery does not duplicate tools or reopen answered approvals", () => {
  const call = { type: "tool_call", sessionId: "s", callId: "c", tool: "cad_edit", input: {} } as const
  const permission = { type: "permission_request", sessionId: "s", requestId: "p", permission: "cad_edit", patterns: [] } as const
  let log = appendChatEvent(emptyLog, call)
  log = appendChatEvent(log, { type: "tool_result", sessionId: "s", callId: "c", tool: "cad_edit", ok: true, output: "Saved" })
  log = appendChatEvent(log, call)
  log = appendChatEvent(log, permission)
  log = answerRequest(log, "p", true)
  log = appendChatEvent(log, permission)
  expect(log).toHaveLength(2)
  expect(log[0]).toMatchObject({ kind: "tool", ok: true, output: "Saved" })
  expect(log[1]).toMatchObject({ kind: "request", answered: true })
})
