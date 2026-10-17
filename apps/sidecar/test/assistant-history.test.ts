import { describe, expect, test } from "bun:test"
import {
  HISTORY_TEXT_LIMIT, HISTORY_TOOL_INPUT_LIMIT, HISTORY_TOOL_OUTPUT_LIMIT, historyMessage, historyPage, isVisibleMessage, sessionSummaries,
  type HostHistoryMessage,
} from "../src/services/assistant-history.ts"

const user = (id: string, text: string, extra: Partial<HostHistoryMessage["info"]> = {}): HostHistoryMessage => ({
  info: { id, role: "user", time: { created: 1_700_000_000_000 }, model: { providerID: "minimax", modelID: "m1" }, ...extra },
  parts: [{ type: "text", text }],
})
const assistant = (id: string, text: string, parts: HostHistoryMessage["parts"] = []): HostHistoryMessage => ({
  info: { id, role: "assistant", agent: "cadcam", providerID: "minimax", modelID: "m1", time: { created: 1_700_000_001_000 } },
  parts: [{ type: "reasoning", text: "thinking" }, ...parts, { type: "text", text }],
})

describe("history rows", () => {
  test("a message carries its text, model, agent, time and tool evidence; reasoning stays out", () => {
    const row = historyMessage(assistant("m2", "Done.", [
      { type: "tool", tool: "cad_edit", callID: "c1", state: { status: "completed", input: { action: "add" }, output: "ok" } },
      { type: "tool", tool: "vcs_edit", callID: "c2", state: { status: "error", input: {}, error: "dirty working copy" } },
    ]))
    expect(row).toEqual({
      id: "m2", role: "assistant", text: "Done.", createdAt: new Date(1_700_000_001_000).toISOString(), agent: "cadcam", model: "minimax/m1", error: null, truncated: false,
      tools: [
        { callId: "c1", tool: "cad_edit", status: "completed", input: { action: "add" }, output: "ok", truncated: false },
        { callId: "c2", tool: "vcs_edit", status: "error", input: {}, output: "dirty working copy", truncated: false },
      ],
    })
    expect(historyMessage(user("m1", "Widen the plate")).model).toBe("minimax/m1")
  })

  test("long text, large output and oversized arguments are bounded and flagged", () => {
    const row = historyMessage(assistant("m", "x".repeat(HISTORY_TEXT_LIMIT + 10), [
      { type: "tool", tool: "t", callID: "c", state: { status: "completed", input: { blob: "y".repeat(HISTORY_TOOL_INPUT_LIMIT) }, output: "z".repeat(HISTORY_TOOL_OUTPUT_LIMIT + 1) } },
    ]))
    expect(row.truncated).toBe(true)
    expect(row.text.length).toBe(HISTORY_TEXT_LIMIT + 1)
    expect(row.tools[0]!.input).toBeUndefined()
    expect(row.tools[0]!.truncated).toBe(true)
    expect(row.tools[0]!.output.length).toBe(HISTORY_TOOL_OUTPUT_LIMIT + 1)
  })

  test("summaries, compaction and synthetic continuation turns are not shown; an error is", () => {
    expect(isVisibleMessage({ info: { id: "s", role: "assistant", summary: true }, parts: [] })).toBe(false)
    expect(isVisibleMessage({ info: { id: "c", role: "assistant", agent: "compaction" }, parts: [] })).toBe(false)
    expect(isVisibleMessage({ info: { id: "u", role: "user" }, parts: [{ type: "text", text: "continue", synthetic: true }] })).toBe(false)
    expect(historyMessage({ info: { id: "e", role: "assistant", error: { name: "ProviderError", data: { message: "Rate limited" } } }, parts: [] }).error).toBe("Rate limited")
  })
})

describe("history pages", () => {
  const conversation = Array.from({ length: 10 }, (_, index) => index % 2 === 0 ? user(`m${index}`, `q${index}`) : assistant(`m${index}`, `a${index}`))

  test("the newest page first, then older pages through `before`, ending with null", () => {
    const first = historyPage(conversation, true, 4)
    expect(first.ok && first.messages.map((row) => row.id)).toEqual(["m6", "m7", "m8", "m9"])
    expect(first.ok && first.before).toBe("m6")
    const second = historyPage(conversation, true, 4, "m6")
    expect(second.ok && second.messages.map((row) => row.id)).toEqual(["m2", "m3", "m4", "m5"])
    const last = historyPage(conversation, true, 4, "m2")
    expect(last.ok && last.messages.map((row) => row.id)).toEqual(["m0", "m1"])
    expect(last.ok && last.before).toBeNull()
  })

  test("a window that may not hold the whole conversation always offers an older page", () => {
    const page = historyPage(conversation.slice(6), false, 4)
    expect(page.ok && page.before).toBe("m6")
  })

  test("an anchor outside the window is reported, and as final once the window is the whole conversation", () => {
    expect(historyPage(conversation, false, 4, "nope")).toEqual({ ok: false, exhausted: false })
    expect(historyPage(conversation, true, 4, "nope")).toEqual({ ok: false, exhausted: true })
  })
})

describe("session list", () => {
  test("owned sessions the host still has, newest first, with titles, times and busy; child sessions never listed", () => {
    const rows = sessionSummaries({
      projectId: "p",
      owned: [{ sessionId: "ses_a", createdAt: 1 }, { sessionId: "ses_b", createdAt: 2 }, { sessionId: "ses_gone", createdAt: 3 }, { sessionId: "ses_child", createdAt: 4 }],
      hosted: [
        { id: "ses_a", title: "Widen the plate", time: { created: 1_000, updated: 5_000 } },
        { id: "ses_b", title: "", time: { created: 2_000, updated: 3_000 } },
        { id: "ses_child", parentID: "ses_a", title: "worker" },
      ],
      busy: (id) => id === "ses_b",
      limit: 10,
    })
    expect(rows).toEqual([
      { id: "ses_a", projectId: "p", title: "Widen the plate", createdAt: new Date(1_000).toISOString(), updatedAt: new Date(5_000).toISOString(), busy: false },
      { id: "ses_b", projectId: "p", title: "Conversation", createdAt: new Date(2_000).toISOString(), updatedAt: new Date(3_000).toISOString(), busy: true },
    ])
  })

  test("without a host (direct mode) every owned session is listed under its owner record's time", () => {
    const rows = sessionSummaries({ projectId: "p", owned: [{ sessionId: "s1", createdAt: 9_000 }], hosted: undefined, busy: () => false, limit: 10 })
    expect(rows).toEqual([{ id: "s1", projectId: "p", title: "Conversation", createdAt: new Date(9_000).toISOString(), updatedAt: new Date(9_000).toISOString(), busy: false }])
  })
})
