import { describe, expect, test } from "bun:test"
import { mapHostEvent, newMapperState } from "../src/nikcli/event-mapper.ts"

const part = (p: Record<string, unknown>, delta?: string) => ({ type: "message.part.updated", properties: { ...(delta !== undefined ? { delta } : {}), part: { sessionID: "s", messageID: "m", ...p } } })
const map = (state: ReturnType<typeof newMapperState>, e: object) => mapHostEvent("s", e as never, state)

describe("everything the agent does is visible", () => {
  test("reasoning, steps and their cost", () => {
    const state = newMapperState()
    expect(map(state, part({ type: "step-start" }))).toEqual([{ type: "step", sessionId: "s", phase: "start", index: 1 }])
    expect(map(state, part({ type: "reasoning" }, "Let me check the stock"))).toEqual([{ type: "reasoning", sessionId: "s", text: "Let me check the stock" }])
    expect(map(state, part({ type: "step-finish", reason: "tool-calls", tokens: { input: 1200, output: 80, reasoning: 0, cache: { read: 0, write: 0 } } })))
      .toEqual([{ type: "step", sessionId: "s", phase: "finish", index: 1, reason: "tool-calls", usage: { inputTokens: 1200, outputTokens: 80 } }])
    expect(map(state, part({ type: "step-start" }))).toEqual([{ type: "step", sessionId: "s", phase: "start", index: 2 }])
  })

  test("a tool call still being written reports its progress, throttled, then runs normally", () => {
    const state = newMapperState()
    const pending = (raw: string) => part({ type: "tool", callID: "c1", tool: "cad_add_elements", state: { status: "pending", input: {}, raw } })
    expect(map(state, pending("{\"elements\":["))).toEqual([{ type: "tool_progress", sessionId: "s", callId: "c1", tool: "cad_add_elements", chars: 13 }])
    expect(map(state, pending("{\"elements\":[" + "x".repeat(100)))).toEqual([])
    expect(map(state, pending("{\"elements\":[" + "x".repeat(900)))).toEqual([{ type: "tool_progress", sessionId: "s", callId: "c1", tool: "cad_add_elements", chars: 913 }])
    const run = map(state, part({ type: "tool", callID: "c1", tool: "cad_add_elements", state: { status: "running", input: { elements: [] } } }))
    expect(run.map((e) => e.type)).toEqual(["tool_call"])
  })

  test("the agent's plan arrives whole, every time it changes", () => {
    const state = newMapperState()
    const plan = (statuses: string[], status = "running") => part({ type: "tool", callID: "t1", tool: "todowrite", state: { status, input: { todos: statuses.map((s, i) => ({ id: String(i), content: `step ${i}`, status: s, priority: "high" })) } } })
    const first = map(state, plan(["in_progress", "pending"]))
    expect(first).toEqual([{ type: "todo", sessionId: "s", todos: [{ id: "0", content: "step 0", status: "in_progress", priority: "high" }, { id: "1", content: "step 1", status: "pending", priority: "high" }] }])
    // The same list again (running -> completed) is not repeated; a changed list is.
    expect(map(state, plan(["in_progress", "pending"], "completed"))).toEqual([])
    const next = map(state, part({ type: "tool", callID: "t2", tool: "todowrite", state: { status: "running", input: { todos: [{ content: "step 0", status: "completed" }, { content: "step 1", status: "in_progress" }] } } }))
    expect(next).toHaveLength(1)
    expect((next[0] as unknown as { todos: Array<{ status: string }> }).todos.map((t) => t.status)).toEqual(["completed", "in_progress"])
    // A todo call is never shown as an ordinary tool.
    expect(map(state, part({ type: "tool", callID: "t3", tool: "todoread", state: { status: "running", input: {} } }))).toEqual([])
  })

  test("a provider failure the host is retrying, and a compaction, are reported", () => {
    const state = newMapperState()
    const retry = (attempt: number) => map(state, { type: "session.status", properties: { sessionID: "s", status: { type: "retry", attempt, message: "Provider is overloaded" } } })
    expect(retry(1)).toEqual([{ type: "session_status", sessionId: "s", status: "retry" }, { type: "retry", sessionId: "s", attempt: 1, message: "Provider is overloaded" }])
    expect(retry(1)).toEqual([])
    expect(retry(2)).toHaveLength(2)
    expect(map(state, { type: "session.compacted", properties: { sessionID: "s" } })).toEqual([{ type: "compaction", sessionId: "s", phase: "finish" }, { type: "compacted", sessionId: "s" }])
  })

  test("the goal the agent works toward, its progress and its end", () => {
    const state = newMapperState()
    const goal = (g: object | null) => map(state, { type: "session.goal", properties: { sessionID: "s", goal: g } })
    expect(goal({ objective: "Model the bracket and verify its toolpath", status: "active", iterationCount: 2, tokensUsed: 5400, tokenBudget: 200000 }))
      .toEqual([{ type: "goal", sessionId: "s", goal: { objective: "Model the bracket and verify its toolpath", status: "active", iteration: 2, tokensUsed: 5400, tokenBudget: 200000 } }])
    expect(goal({ objective: "x", status: "complete", iterationCount: 3, tokensUsed: 9000 })[0]).toMatchObject({ goal: { status: "complete" } })
    expect(goal(null)).toEqual([{ type: "goal", sessionId: "s", goal: null }])
    expect(goal({ objective: "x", status: "weird" })).toEqual([])
    expect(mapHostEvent("other", { type: "session.goal", properties: { sessionID: "s", goal: null } } as never, state)).toEqual([])
  })

  test("plan text and priority changes are not lost when statuses are unchanged", () => {
    const state = newMapperState()
    const plan = (content: string, priority: string) => part({ type: "tool", callID: "plan", tool: "todowrite", state: { status: "running", input: { todos: [{ content, priority, status: "pending" }] } } })
    expect(map(state, plan("Read drawing", "low"))).toHaveLength(1)
    expect(map(state, plan("Read stock", "low"))).toHaveLength(1)
    expect(map(state, plan("Read stock", "high"))).toHaveLength(1)
    expect(map(state, plan("Read stock", "high"))).toEqual([])
  })

  test("internal compaction steps and tools stay out of the parent's activity", () => {
    const state = newMapperState()
    map(state, { type: "message.updated", properties: { info: { sessionID: "s", id: "m", role: "assistant", summary: true } } })
    expect(map(state, part({ type: "step-start" }))).toEqual([])
    expect(map(state, part({ type: "tool", callID: "internal", tool: "todowrite", state: { status: "running", input: { todos: [{ content: "Summarize", status: "pending" }] } } }))).toEqual([])
    expect(state.step).toBe(0)
  })
})

describe("tool output diagnostics", () => {
  test("a later successful read does not erase a failed CAD mutation", () => {
    const state = newMapperState()
    const result = (callID: string, tool: string, output: unknown) => map(state, part({ type: "tool", callID, tool, state: { status: "completed", input: {}, output: JSON.stringify(output) } }))
    const failed = result("edit", "cad_add_elements", { ok: false, error: "Nothing was added.", problems: ["elements[0].radius: must be positive"], mutationApplied: false })
    expect(failed.at(-1)).toMatchObject({ type: "tool_diagnostic", kind: "argument", mutationApplied: false })
    expect(state.lastToolError).toContain("elements[0].radius")
    result("read", "cad_describe_drawing", { ok: true })
    expect(state.lastToolError).toContain("elements[0].radius")
    result("fixed", "cad_add_elements", { ok: true, ids: ["solid-1"] })
    expect(state.lastToolError).toBeUndefined()
  })

  test("partial and verification outputs stay distinct", () => {
    const state = newMapperState()
    const partial = map(state, part({ type: "tool", callID: "partial", tool: "cad_modify_entities", state: { status: "completed", input: {}, output: JSON.stringify({ ok: false, error: "One element is locked", skipped: ["locked"] }) } }))
    expect(partial.at(-1)).toMatchObject({ type: "tool_diagnostic", kind: "partial", severity: "error" })
    const checked = map(state, part({ type: "tool", callID: "verify", tool: "cam_verify_toolpath", state: { status: "completed", input: {}, output: JSON.stringify({ ok: false, issues: [{ severity: "error", code: "GOUGE", message: "Tool intersects the finished wall." }] }) } }))
    expect(checked.find((event) => event.type === "tool_result")).toMatchObject({ ok: true })
    expect(checked.at(-1)).toMatchObject({ type: "tool_diagnostic", kind: "verification", severity: "error", message: "GOUGE: Tool intersects the finished wall." })
  })

  test("duplicate native step updates account for usage only once", () => {
    const state = newMapperState()
    const start = part({ type: "step-start", id: "start-1" })
    const finish = part({ type: "step-finish", id: "finish-1", tokens: { input: 100, output: 20 } })
    expect(map(state, start)).toHaveLength(1)
    expect(map(state, start)).toHaveLength(0)
    expect(map(state, finish)).toHaveLength(1)
    expect(map(state, finish)).toHaveLength(0)
    expect(state.usage).toEqual({ inputTokens: 100, outputTokens: 20 })
  })
})

describe("what the agent waits out and what it reports", () => {
  test("overload, rate limits, outages and dropped connections are resumed; bad keys, credit and context errors are not", async () => {
    const { isTransientFailure } = await import("../src/nikcli/chat.ts")
    for (const m of ["Provider is overloaded", "Too Many Requests", "Rate Limited", "Provider request failed with HTTP 503", "The AI host answered with HTTP 502.", "fetch failed", "Provider Server Error", "terminated", "timed out"]) {
      expect(isTransientFailure(m), m).toBe(true)
    }
    for (const m of ["Authentication failed: invalid api key", "You exceeded your current quota, check your billing", "context length exceeded", "model not found", "invalid request", "content filter"]) {
      expect(isTransientFailure(m), m).toBe(false)
    }
  })
})

test("real CAD partial mutations preserve successful writes and keep skipped-item recovery open", () => {
  const state = newMapperState()
  const output = { elements: [{ id: "solid-kept", type: "cube" }], skipped: [{ index: 1, error: "radius must be positive" }], note: "1 of 2 elements were added. Send only the skipped ones again." }
  const events = map(state, part({ type: "tool", callID: "partial-add", tool: "cad_add_elements", state: { status: "completed", input: {}, output: JSON.stringify(output) } }))
  expect(events.find((event) => event.type === "tool_result")).toMatchObject({ ok: true, output: JSON.stringify(output) })
  expect(events.find((event) => event.type === "tool_diagnostic")).toMatchObject({ kind: "partial", severity: "warning", mutationApplied: true })
  expect(state.lastToolError).toContain("elements[1]: radius must be positive")
  expect(state.lastToolError).toContain("retry only skipped items")
  map(state, part({ type: "tool", callID: "read-back", tool: "cad_describe_drawing", state: { status: "completed", input: {}, output: "{}" } }))
  expect(state.lastToolError).toContain("skipped")
  map(state, part({ type: "tool", callID: "fixed-subset", tool: "cad_add_elements", state: { status: "completed", input: {}, output: JSON.stringify({ elements: [{ id: "solid-fixed" }] }) } }))
  expect(state.lastToolError).toBeUndefined()
})

test("partial read results do not invent mutation evidence", () => {
  const state = newMapperState()
  const events = map(state, part({ type: "tool", callID: "partial-read", tool: "cad_describe_drawing", state: { status: "completed", input: {}, output: JSON.stringify({ elements: [{ id: "existing" }], skipped: ["hidden"] }) } }))
  expect(events.find((event) => event.type === "tool_diagnostic")).not.toHaveProperty("mutationApplied")
})
