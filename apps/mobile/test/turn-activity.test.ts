import { expect, test } from "bun:test"
import type { LogEvent } from "../lib/chat-log"
import { activityLabel, formatTokens, idleActivity, reduceTurnActivity } from "../lib/turn-activity"

const run = (events: LogEvent[]) => events.reduce(reduceTurnActivity, idleActivity)

test("the status strip follows the agent loop and sums step usage", () => {
  const working = run([
    { type: "user", text: "Pocket" },
    { type: "step", sessionId: "s", phase: "start", index: 1 },
    { type: "tool_call", sessionId: "s", callId: "c", tool: "cam_generate_toolpath", input: {} },
    { type: "step", sessionId: "s", phase: "finish", index: 1, usage: { inputTokens: 9_000, outputTokens: 400 } },
    { type: "step", sessionId: "s", phase: "start", index: 2 },
    { type: "tool_progress", sessionId: "s", callId: "d", tool: "cad_edit", chars: 20 },
    { type: "step", sessionId: "s", phase: "finish", index: 2, usage: { inputTokens: 3_000, outputTokens: 100 } },
  ])
  expect(working).toMatchObject({ phase: "tool", tool: "cad_edit", step: 2, inputTokens: 12_000, outputTokens: 500 })
  expect(activityLabel(working)).toBe("Running edit… · step 2 · 12.5k tokens")
  const retrying = reduceTurnActivity(working, { type: "retry", sessionId: "s", attempt: 3, message: "overloaded" })
  expect(activityLabel(retrying)).toBe("Provider retry 3… · step 2 · 12.5k tokens")
  const done = reduceTurnActivity(retrying, { type: "done", sessionId: "s", text: "ok", usage: { inputTokens: 20_000, outputTokens: 900 } })
  expect(done).toMatchObject({ phase: "idle", inputTokens: 20_000, outputTokens: 900 })
  expect(done.tool).toBeUndefined()
})

test("a steer keeps the running meter, a new prompt resets it, goals persist until cleared", () => {
  let activity = run([{ type: "user", text: "a" }, { type: "step", sessionId: "s", phase: "finish", index: 1, usage: { inputTokens: 10, outputTokens: 5 } }])
  activity = reduceTurnActivity(activity, { type: "goal", sessionId: "s", goal: { objective: "Gripper", status: "active", iteration: 1, tokensUsed: 50 } })
  expect(reduceTurnActivity(activity, { type: "user", text: "steer" }).inputTokens).toBe(10)
  const finished = reduceTurnActivity(activity, { type: "error", sessionId: "s", code: "provider", message: "x" })
  const next = reduceTurnActivity(finished, { type: "user", text: "again" })
  expect(next).toMatchObject({ phase: "starting", inputTokens: 0, goal: { objective: "Gripper" } })
  expect(reduceTurnActivity(next, { type: "goal", sessionId: "s", goal: null }).goal).toBeUndefined()
  expect(reduceTurnActivity(next, { type: "compaction", sessionId: "s", phase: "start" }).phase).toBe("compacting")
})

test("token counts are compact", () => {
  expect([formatTokens(950), formatTokens(1_000), formatTokens(12_400), formatTokens(1_250_000), formatTokens(Number.NaN)]).toEqual(["950", "1k", "12.4k", "1.3M", "0"])
})
