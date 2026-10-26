import { describe, expect, test } from "bun:test"
import { answerRequest, appendChatEvent, emptyLog, lastUserPrompt, queueLastUserRow, settleOfflineRows, transcriptText } from "../lib/chat-log"
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

test("a recovered turn says it was recovered, and a live one does not", () => {
  const recovered = appendChatEvent(appendChatEvent(emptyLog, { type: "user", text: "Build" }), { type: "done", sessionId: "s1", text: "Done", recovered: true })
  expect(recovered.some((row) => row.kind === "notice" && row.text.includes("Recovered"))).toBe(true)
  const live = appendChatEvent(appendChatEvent(emptyLog, { type: "user", text: "Build" }), { type: "done", sessionId: "s1", text: "Done" })
  expect(live.some((row) => row.kind === "notice")).toBe(false)
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

test("queued prompts settle when the desktop takes them, and desktop-typed messages appear once", () => {
  let log = appendChatEvent(emptyLog, { type: "user", text: "Build the plate" })
  log = appendChatEvent(log, { type: "user", text: "Use 6 mm stock", queued: true })
  expect(log[1]).toMatchObject({ kind: "user", queued: true })
  log = appendChatEvent(log, { type: "user_message", sessionId: "s", text: "Use 6 mm stock" })
  expect(log[1]).toEqual({ kind: "user", text: "Use 6 mm stock" })
  log = appendChatEvent(log, { type: "user_message", sessionId: "s", text: "Use 6 mm stock" })
  expect(log).toHaveLength(2)
  log = appendChatEvent(log, { type: "user_message", sessionId: "s", text: "From the desktop" })
  expect(log.at(-1)).toEqual({ kind: "user", text: "From the desktop" })
  expect(lastUserPrompt(log)).toBe("From the desktop")
})

test("the plan updates in place, retries collapse and clear when the turn ends", () => {
  let log = appendChatEvent(emptyLog, { type: "user", text: "Mill it" })
  log = appendChatEvent(log, { type: "todo", sessionId: "s", todos: [{ content: "Model", status: "in_progress" }, { content: "CAM", status: "pending" }] })
  log = appendChatEvent(log, { type: "retry", sessionId: "s", attempt: 1, message: "rate limited" })
  log = appendChatEvent(log, { type: "retry", sessionId: "s", attempt: 2, message: "rate limited" })
  log = appendChatEvent(log, { type: "todo", sessionId: "s", todos: [{ content: "Model", status: "completed" }, { content: "CAM", status: "in_progress" }] })
  expect(log.filter((row) => row.kind === "plan")).toHaveLength(1)
  expect(log.filter((row) => row.kind === "notice")).toEqual([{ kind: "notice", tone: "warning", retry: true, text: "Provider retry 2 — rate limited" }])
  expect(log.find((row) => row.kind === "plan")).toMatchObject({ items: [{ status: "completed" }, { status: "in_progress" }] })
  log = appendChatEvent(log, { type: "compacted", sessionId: "s" })
  log = appendChatEvent(log, { type: "permission_blocked", sessionId: "s", permission: "vcs_merge", patterns: [], reason: "a person merges" })
  log = appendChatEvent(log, { type: "done", sessionId: "s", text: "Done" })
  expect(log.some((row) => row.kind === "notice" && row.retry)).toBe(false)
  expect(log.filter((row) => row.kind === "notice").map((row) => row.kind === "notice" && row.tone)).toEqual(["info", "warning"])
  expect(log.at(-1)).toEqual({ kind: "assistant", sessionId: "s", text: "Done" })
  expect(transcriptText(log)).toBe("You: Mill it\n\nAssistant: Done")
})

test("a message keeps its photo previews when it is queued, taken in by the desktop or settled from the outbox", () => {
  const previews = [{ name: "part.jpg", uri: "data:image/jpeg;base64,AAAA" }]
  const sent = appendChatEvent(emptyLog, { type: "user", text: "Check this fixture", attachments: ["part.jpg"], previews })
  expect(sent[0]).toMatchObject({ kind: "user", attachments: ["part.jpg"], previews })
  const queued = queueLastUserRow(sent, "Check this fixture")
  expect(queued[0]).toMatchObject({ queued: true, previews })
  const taken = appendChatEvent(queued, { type: "user_message", text: "Check this fixture" } as ChatEvent)
  expect(taken[0]).toMatchObject({ kind: "user", previews })
  expect(taken[0]).not.toHaveProperty("queued")
  const offline = appendChatEvent(emptyLog, { type: "user", text: "Later", offline: true, previews })
  expect(settleOfflineRows(offline, [])[0]).toEqual({ kind: "user", text: "Later", previews })
})
