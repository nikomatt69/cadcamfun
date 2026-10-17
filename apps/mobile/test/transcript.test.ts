import { describe, expect, test } from "bun:test"
import { appendChatEvent, emptyLog, settleOfflineRows, toolImages, transcriptText, type ChatRow, type LogEvent } from "../lib/chat-log"
import { buildTranscript, toolRunSummary } from "../lib/transcript-rows"

const fold = (events: readonly LogEvent[], from: readonly ChatRow[] = emptyLog) => events.reduce(appendChatEvent, from)
const PNG = "data:image/png;base64,iVBORw0KGgo="
const tool = (callId: string, ok: boolean | null): ChatRow => ({ kind: "tool", tool: callId, rawTool: `cad_${callId}`, ok, callId })

describe("reasoning and tool renders in the transcript", () => {
  test("reasoning folds into one row per stretch and the answer follows as its own bubble", () => {
    const log = fold([
      { type: "user", text: "Fillet the edges" },
      { type: "reasoning", sessionId: "s", text: "The edges are " },
      { type: "reasoning", sessionId: "s", text: "convex." },
      { type: "delta", sessionId: "s", text: "Done." },
      { type: "done", sessionId: "s", text: "Done." },
    ])
    expect(log.map((row) => row.kind)).toEqual(["user", "reasoning", "assistant"])
    expect(log[1]).toEqual({ kind: "reasoning", sessionId: "s", text: "The edges are convex." })
    // Reasoning is working state, not part of the shared conversation.
    expect(transcriptText(log)).toBe("You: Fillet the edges\n\nAssistant: Done.")
  })

  test("a replaced final answer keeps the reasoning that led to it", () => {
    const log = fold([{ type: "user", text: "Hi" }, { type: "reasoning", sessionId: "s", text: "Think" }, { type: "delta", sessionId: "s", text: "partial" }, { type: "done", sessionId: "s", text: "Full answer" }])
    expect(log.map((row) => row.kind === "assistant" ? row.text : row.kind)).toEqual(["user", "reasoning", "Full answer"])
  })

  test("tool results carry inline images only, two at most", () => {
    expect(toolImages([PNG, "https://example.com/x.png", "data:image/svg+xml;base64,PHN2Zz4=", PNG, PNG])).toEqual([PNG, PNG])
    expect(toolImages(["javascript:alert(1)"])).toBeUndefined()
    expect(toolImages("nope")).toBeUndefined()
    const log = fold([
      { type: "tool_call", sessionId: "s", callId: "c", tool: "cad_snapshot", input: {} },
      { type: "tool_result", sessionId: "s", callId: "c", tool: "cad_snapshot", ok: true, output: "ok", images: [PNG] },
    ])
    expect(log[0]).toMatchObject({ kind: "tool", ok: true, images: [PNG] })
  })
})

describe("offline messages", () => {
  test("rows stop waiting once their text has left the outbox; repeated texts settle oldest first", () => {
    const log = fold([{ type: "user", text: "a", offline: true }, { type: "user", text: "a", offline: true }, { type: "user", text: "b", offline: true }])
    const settled = settleOfflineRows(log, ["a"])
    expect(settled.map((row) => row.kind === "user" ? `${row.text}${row.offline ? "*" : ""}` : "")).toEqual(["a", "a*", "b"])
    expect(settleOfflineRows(settled, ["a"])).toBe(settled)
  })
})

describe("transcript layout", () => {
  test("three or more settled tool calls collapse; a running one stays on its own", () => {
    const rows: ChatRow[] = [{ kind: "user", text: "go" }, tool("a", true), tool("b", false), tool("c", true), tool("d", null), { kind: "assistant", sessionId: "s", text: "ok" }]
    const items = buildTranscript(rows)
    expect(items.map((item) => item.kind === "tools" ? `tools(${item.rows.length})` : item.id)).toEqual(["user:0", "tools(3)", "tool:d", "assistant:5"])
    const group = items[1]
    expect(group?.kind === "tools" ? toolRunSummary(group.rows) : undefined).toEqual({ title: "3 tool calls", failed: 1, images: 0 })
  })

  test("short runs stay inline and ids survive the conversation growing", () => {
    const rows: ChatRow[] = [tool("a", true), tool("b", true)]
    const before = buildTranscript(rows).map((item) => item.id)
    expect(before).toEqual(["tool:a", "tool:b"])
    const after = buildTranscript([...rows, { kind: "assistant", sessionId: "s", text: "x" }]).map((item) => item.id)
    expect(after.slice(0, 2)).toEqual(before)
    // The group is named after its first call, so it keeps its id as more calls finish.
    expect(buildTranscript([...rows, tool("c", true)])[0]?.id).toBe(buildTranscript([...rows, tool("c", true), tool("d", true)])[0]?.id)
  })
})
