import { describe, expect, test } from "bun:test"
import { mapHostEvent, newMapperState, REPEATED_FAILURE_LIMIT } from "../src/nikcli/event-mapper.ts"
import { continuationFor } from "../src/nikcli/chat.ts"

const part = (p: Record<string, unknown>) => ({ type: "message.part.updated", properties: { part: { sessionID: "s", messageID: "m", ...p } } })
const map = (state: ReturnType<typeof newMapperState>, e: object) => mapHostEvent("s", e as never, state)

const failCall = (state: ReturnType<typeof newMapperState>, callId: string, input: unknown, tool = "cad_edit") => {
  map(state, part({ type: "tool", callID: callId, tool, state: { status: "running", input } }))
  map(state, part({ type: "tool", callID: callId, tool, state: { status: "error", input, error: "Element x is not a solid" } }))
}
const okCall = (state: ReturnType<typeof newMapperState>, callId: string, input: unknown, tool = "cad_edit") => {
  map(state, part({ type: "tool", callID: callId, tool, state: { status: "running", input } }))
  map(state, part({ type: "tool", callID: callId, tool, state: { status: "completed", input, output: "{\"ok\":true}" } }))
}

describe("repeated identical failures", () => {
  test("the same tool call failing with the same arguments reaches the limit", () => {
    const state = newMapperState()
    const input = { action: "shell", id: "x", thickness: 2 }
    for (let i = 1; i < REPEATED_FAILURE_LIMIT; i++) {
      failCall(state, `c${i}`, input)
      expect(state.repeatedFailure).toBeUndefined()
    }
    failCall(state, `c${REPEATED_FAILURE_LIMIT}`, input)
    expect(state.repeatedFailure).toMatchObject({ tool: "cad_edit", count: REPEATED_FAILURE_LIMIT })
    expect(state.repeatedFailure?.error).toContain("not a solid")
  })

  test("key order does not make the same arguments a new call, different values do", () => {
    const state = newMapperState()
    failCall(state, "a", { action: "shell", id: "x", thickness: 2 })
    failCall(state, "b", { thickness: 2, id: "x", action: "shell" })
    failCall(state, "c", { action: "shell", id: "x", thickness: 3 })
    expect(state.repeatedFailure).toBeUndefined()
    failCall(state, "d", { id: "x", thickness: 2, action: "shell" })
    expect(state.repeatedFailure).toMatchObject({ count: REPEATED_FAILURE_LIMIT })
  })

  test("a success with those arguments resets their failure count", () => {
    const state = newMapperState()
    const input = { action: "describe" }
    failCall(state, "a", input, "cad")
    failCall(state, "b", input, "cad")
    okCall(state, "c", input, "cad")
    failCall(state, "d", input, "cad")
    failCall(state, "e", input, "cad")
    expect(state.repeatedFailure).toBeUndefined()
    failCall(state, "f", input, "cad")
    expect(state.repeatedFailure).toMatchObject({ tool: "cad", count: REPEATED_FAILURE_LIMIT })
  })

  test("a turn stopped by the breaker is not nudged onward", () => {
    const state = newMapperState()
    const input = { action: "shell", id: "x" }
    for (let i = 0; i < REPEATED_FAILURE_LIMIT; i++) failCall(state, `c${i}`, input)
    expect(continuationFor(state, "I will fix it.")).toBeUndefined()
    // Open todos do not override the breaker: the same call would only fail again.
    expect(continuationFor({ ...state, todos: [{ content: "Shell the part", status: "pending" }] }, "Working.")).toBeUndefined()
  })
})
