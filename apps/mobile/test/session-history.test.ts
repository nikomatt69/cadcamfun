import { expect, test } from "bun:test"
import type { AiSessionMessage, AiSessionSummary } from "@cadcamfun/api"
import { relativeTime } from "../lib/format"
import { rowsFromMessage, rowsFromMessages, sessionTitle, toolRow } from "../lib/session-history"

const message = (patch: Partial<AiSessionMessage> = {}): AiSessionMessage => ({
  id: "m1",
  role: "assistant",
  text: "The plate is now 20 mm wider.",
  createdAt: "2026-10-17T10:00:00.000Z",
  agent: "cad",
  model: "minimax",
  error: null,
  truncated: false,
  tools: [],
  ...patch,
})

const summary = (patch: Partial<AiSessionSummary> = {}): AiSessionSummary => ({
  id: "s1",
  projectId: "p1",
  title: "",
  createdAt: "2026-10-17T10:00:00.000Z",
  updatedAt: "2026-10-17T10:00:00.000Z",
  busy: false,
  ...patch,
})

test("a stored answer becomes the same row a live turn produces", () => {
  const rows = rowsFromMessage(message(), "s1")
  expect(rows).toEqual([{ kind: "assistant", text: "The plate is now 20 mm wider.", sessionId: "s1" }])
})

test("a user's message becomes a user row", () => {
  expect(rowsFromMessage(message({ role: "user", text: "widen the plate", agent: null }), "s1"))
    .toEqual([{ kind: "user", text: "widen the plate" }])
})

test("the tools of a message come before its answer, like in a live turn", () => {
  const rows = rowsFromMessage(message({
    tools: [
      { callId: "c1", tool: "vcs_start_change", status: "completed", output: "ai/widen", truncated: false },
      { callId: "c2", tool: "cad_add_entities", status: "error", output: "no room", truncated: false },
    ],
  }), "s1")
  expect(rows.map((row) => row.kind)).toEqual(["tool", "tool", "assistant"])
  expect(rows[0]).toMatchObject({ tool: "start change", rawTool: "vcs_start_change", ok: true, callId: "c1", output: "ai/widen", agent: "cad" })
  expect(rows[1]).toMatchObject({ tool: "add entities", ok: false, output: "no room" })
})

test("a call that is still running has no answer yet", () => {
  expect(toolRow({ callId: "c", tool: "cam_regenerate", status: "running", output: "", truncated: false })).toMatchObject({ ok: null })
  expect(toolRow({ callId: "c", tool: "cam_regenerate", status: "pending", output: "", truncated: false })).toMatchObject({ ok: null })
})

test("a message the host could not finish keeps its error visible", () => {
  const rows = rowsFromMessage(message({ error: "the model stopped", text: "" }), "s1")
  expect(rows).toEqual([{ kind: "error", message: "the model stopped" }])
})

test("a cut message says so instead of pretending to be complete", () => {
  const rows = rowsFromMessage(message({ truncated: true }), "s1")
  expect(rows[1]).toMatchObject({ kind: "notice", tone: "info" })
})

test("a page of messages folds in the order the desktop sent them", () => {
  const rows = rowsFromMessages([
    message({ id: "m1", role: "user", text: "widen the plate", agent: null }),
    message({ id: "m2", text: "done" }),
  ], "s1")
  expect(rows.map((row) => row.kind)).toEqual(["user", "assistant"])
})

test("a conversation without a title falls back to what was said", () => {
  expect(sessionTitle(summary({ title: "Widen the plate" }))).toBe("Widen the plate")
  expect(sessionTitle(summary(), "widen the plate")).toBe("widen the plate")
  expect(sessionTitle(summary(), "x".repeat(80)).length).toBe(58)
  expect(sessionTitle(summary())).toBe("Conversation")
})

test("the list shows how long ago a conversation was", () => {
  const now = new Date(2026, 9, 17, 15, 0).getTime()
  expect(relativeTime("2026-10-17T14:59:30.000Z", now)).toBe("just now")
  expect(relativeTime("2026-10-17T14:30:00.000Z", now)).toBe("30m ago")
  expect(relativeTime("2026-10-17T09:00:00.000Z", now)).toBe("6h ago")
  expect(relativeTime("2026-10-15T10:00:00.000Z", now)).toBe("2d ago")
  expect(relativeTime("2026-09-17T10:00:00.000Z", now)).toBe("Sep 17")
})
