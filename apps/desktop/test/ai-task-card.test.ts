/**
 * The card a delegated task is shown as in its message: what it takes from the tool call, how it counts time, and which
 * calls become cards at all.
 */
import { describe, expect, test } from "bun:test"
import { formatElapsed, isTaskStart, taskOfCall } from "../src/features/ai/lib/task-card.ts"
import type { AiToolCall } from "../src/features/ai/lib/types.ts"

const call = (input: unknown, output?: unknown, status: AiToolCall["status"] = "ok"): AiToolCall =>
  ({ sessionId: "s", tool: "agent", input, status, ...(output === undefined ? {} : { output: typeof output === "string" ? output : JSON.stringify(output) }) })

describe("task card", () => {
  test("only the start of a delegation is a card", () => {
    expect(isTaskStart(call({ action: "start", description: "d", prompt: "p" }))).toBe(true)
    expect(isTaskStart(call({ action: "list" }))).toBe(false)
    expect(isTaskStart(call({ action: "read", taskId: "x" }))).toBe(false)
    expect(isTaskStart({ ...call({ action: "start" }), tool: "cad" })).toBe(false)
    expect(isTaskStart(undefined)).toBe(false)
  })

  test("the task comes from what the call returned, with the call's own input as the fallback", () => {
    const started = call({ action: "start", description: "Rough the pocket", agent: "cam" }, { id: "t1", status: "running", background: true, startedAt: 1_000, createdAt: 900 })
    expect(taskOfCall(started)).toEqual({ id: "t1", agent: "cam", description: "Rough the pocket", status: "running", background: true, createdAt: 900, startedAt: 1_000 })
    const waited = call({ action: "start", description: "d", agent: "cad" }, { id: "t2", agent: "cad", description: "d", status: "completed", background: false, text: "Done", finishedAt: 5 })
    expect(taskOfCall(waited)).toMatchObject({ id: "t2", status: "completed", background: false, text: "Done", finishedAt: 5 })
  })

  test("a refusal, a partial answer or a call still running is not a task", () => {
    expect(taskOfCall(call({ action: "start" }))).toBeUndefined()
    expect(taskOfCall(call({ action: "start" }, { ok: false, error: "Unknown agent" }))).toBeUndefined()
    expect(taskOfCall(call({ action: "start" }, "not json"))).toBeUndefined()
    expect(taskOfCall(call({ action: "start" }, { id: "t", status: "exploded" }))).toBeUndefined()
    expect(taskOfCall(undefined)).toBeUndefined()
  })

  test("elapsed time reads as seconds, minutes and hours and never goes negative", () => {
    expect(formatElapsed(-5)).toBe("0s")
    expect(formatElapsed(42_900)).toBe("42s")
    expect(formatElapsed(61_000)).toBe("1m 01s")
    expect(formatElapsed(3_725_000)).toBe("1h 02m")
  })
})
