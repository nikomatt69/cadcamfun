import { describe, expect, test } from "bun:test"
import { appendChatEvent, emptyLog, queueLastUserRow, settleOfflineRows, toolImages, transcriptText, type ChatRow, type LogEvent } from "../lib/chat-log"
import { buildTranscript, clipText, sameItem, toolRunSummary } from "../lib/transcript-rows"

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
    expect(group?.kind === "tools" ? toolRunSummary(group.rows) : undefined).toEqual({ title: "Ran 3 commands", count: 3, failed: 1, images: 0, domains: ["CAD"] })
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

describe("transcript identity and turns", () => {
  const user = (text: string): ChatRow => ({ kind: "user", text })
  const answer: ChatRow = { kind: "assistant", sessionId: "s", text: "ok" }

  test("a prompt that follows an answer or a tool run opens a turn; the first prompt and a second in a row do not", () => {
    const items = buildTranscript([user("a"), user("b"), answer, user("c"), tool("x", true), user("d")])
    expect(items.map((item) => item.kind === "row" && item.startsTurn === true)).toEqual([false, false, false, true, false, true])
  })

  test("items rebuilt from unchanged rows compare equal, so a streaming delta re-renders one row", () => {
    const rows: ChatRow[] = [user("a"), tool("a", true), tool("b", true), tool("c", true), answer]
    const first = buildTranscript(rows)
    const second = buildTranscript(rows)
    expect(first[0]).not.toBe(second[0])
    expect(first.every((item, index) => sameItem(item, second[index]!))).toBe(true)
    // The answer grows: only that item differs.
    const grown = buildTranscript([...rows.slice(0, -1), { ...answer, text: "ok, done" }])
    expect(first.map((item, index) => sameItem(item, grown[index]!))).toEqual([true, true, false])
    // A group that gains a call is a different group even though its id is unchanged.
    const longer = buildTranscript([...rows.slice(0, 4), tool("d", true), answer])
    expect(longer[1]?.id).toBe(first[1]?.id)
    expect(sameItem(first[1]!, longer[1]!)).toBe(false)
  })

  test("the folded run names its domains in order of first use, three at most", () => {
    const mixed: ChatRow[] = [
      { kind: "tool", tool: "extrude", rawTool: "cad_extrude", ok: true, callId: "1" },
      { kind: "tool", tool: "gcode", rawTool: "cam_gcode", ok: true, callId: "2" },
      { kind: "tool", tool: "commit", rawTool: "vcs_commit", ok: true, callId: "3" },
      { kind: "tool", tool: "fillet", rawTool: "cad_fillet", ok: true, callId: "4", images: [PNG, PNG] },
    ]
    const group = buildTranscript(mixed)[0]
    expect(group?.kind === "tools" ? toolRunSummary(group.rows) : undefined).toEqual({ title: "Ran 4 commands", count: 4, failed: 0, images: 2, domains: ["CAD", "CAM", "VCS"] })
  })
})

describe("clipped tool text", () => {
  test("short text is untouched; long text is cut and says how long it was", () => {
    expect(clipText("G0 X0")).toEqual({ text: "G0 X0", clipped: false, total: 5 })
    const long = "G1 X1\n".repeat(1000)
    const clip = clipText(long, 100)
    expect(clip.clipped).toBe(true)
    expect(clip.text.length).toBe(100)
    expect(clip.total).toBe(long.length)
  })

  test("never splits an emoji in half", () => {
    const text = "a".repeat(9) + "\u{1F600}" + "b"
    expect(clipText(text, 10).text).toBe("a".repeat(9))
  })
})

test("a prompt the desktop refused as busy turns into a steer of the running turn", () => {
  const log = fold([{ type: "user", text: "Add a chamfer" }, { type: "delta", sessionId: "s", text: "Working" }, { type: "user", text: "Add a chamfer" }])
  const steered = queueLastUserRow(log, "Add a chamfer")
  expect(steered.map((row) => row.kind === "user" ? Boolean(row.queued) : null)).toEqual([false, null, true])
  // When the desktop takes it into the conversation the row stops showing "queued".
  expect(appendChatEvent(steered, { type: "user_message", sessionId: "s", text: "Add a chamfer" })[2]).toEqual({ kind: "user", text: "Add a chamfer" })
  expect(queueLastUserRow(log, "missing")).toBe(log)
})
