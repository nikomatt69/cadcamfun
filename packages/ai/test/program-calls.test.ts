import { describe, expect, test } from "bun:test"
import { adoptChildSession } from "../src/nikcli/agents.ts"
import { mapHostEvent, newMapperState } from "../src/nikcli/event-mapper.ts"
import { pendingProgramParts, recordProgramCall } from "../src/nikcli/program-calls.ts"

const part = (p: Record<string, unknown>) => ({ type: "message.part.updated", properties: { part: { sessionID: "s", messageID: "m", ...p } } })
const map = (state: ReturnType<typeof newMapperState>, e: object) => mapHostEvent("s", e as never, state)
const program = (status: string, extra: Record<string, unknown> = {}) => part({ type: "tool", callID: "p1", tool: "code_mode", state: { status, input: { code: "for (...) await tools.cad_edit({})" }, ...extra } })
const hole = (n: number) => JSON.stringify({ ok: true, elements: [{ id: `h${n}`, type: "circle" }] })

describe("the calls a code_mode program makes reach the stream as they finish", () => {
  test("each inner call becomes an ordinary tool_call / tool_result pair between the program's start and result", () => {
    const state = newMapperState()
    expect(map(state, program("running")).map((e) => e.type)).toEqual(["tool_call"])

    recordProgramCall("p1", { tool: "cad_edit", input: { action: "add", n: 1 }, output: hole(1), failed: false })
    recordProgramCall("p1", { tool: "cad_edit", input: { action: "add", n: 2 }, output: hole(2), failed: false })
    const live = map(state, program("running", { metadata: { toolCalls: [] } }))
    expect(live.map((e) => `${e.type}:${"tool" in e ? e.tool : ""}`)).toEqual(["tool_call:cad_edit", "tool_result:cad_edit", "tool_call:cad_edit", "tool_result:cad_edit"])
    const results = live.filter((e) => e.type === "tool_result")
    expect(results.map((e) => (e as { output: string }).output)).toEqual([hole(1), hole(2)])
    expect(results.every((e) => (e as { ok: boolean }).ok)).toBe(true)
    // Distinct call ids hanging off the program's, so the editor mirrors each one once.
    expect(new Set(live.map((e) => (e as { callId: string }).callId)).size).toBe(2)
    expect(live.every((e) => (e as { callId: string }).callId.startsWith("p1#"))).toBe(true)

    // The last call finishes in the same update as the program's result: it comes first.
    recordProgramCall("p1", { tool: "cad_edit", input: { action: "add", n: 3 }, output: hole(3), failed: false })
    const done = map(state, program("completed", { output: "{\"ok\":true}" }))
    expect(done.map((e) => `${e.type}:${"tool" in e ? e.tool : ""}`)).toEqual(["tool_call:cad_edit", "tool_result:cad_edit", "tool_result:code_mode"])
    expect(state.toolCalls).toBe(4)
  })

  test("a refused or thrown inner call is reported as failed, with a diagnostic", () => {
    const state = newMapperState()
    map(state, program("running"))
    recordProgramCall("p1", { tool: "cad_edit", input: {}, output: JSON.stringify({ ok: false, error: "no such layer" }), failed: false })
    recordProgramCall("p1", { tool: "cam_edit", input: {}, output: "boom", failed: true })
    const events = map(state, program("running", { metadata: {} }))
    const results = events.filter((e) => e.type === "tool_result") as Array<{ ok: boolean; tool: string }>
    expect(results.map((r) => [r.tool, r.ok])).toEqual([["cad_edit", false], ["cam_edit", false]])
    expect(events.filter((e) => e.type === "tool_diagnostic")).toHaveLength(2)
  })

  test("nothing is replayed, and a direct call's record is dropped when it finishes", () => {
    const state = newMapperState()
    map(state, program("running"))
    recordProgramCall("p1", { tool: "cad_edit", input: {}, output: hole(1), failed: false })
    expect(map(state, program("running", { metadata: {} }))).toHaveLength(2)
    expect(map(state, program("running", { metadata: {} }))).toEqual([])

    const before = pendingProgramParts()
    recordProgramCall("direct1", { tool: "cad_edit", input: {}, output: hole(9), failed: false })
    expect(pendingProgramParts()).toBe(before + 1)
    map(state, part({ type: "tool", callID: "direct1", tool: "cad_edit", state: { status: "completed", input: {}, output: hole(9) } }))
    expect(pendingProgramParts()).toBe(before)
  })

  test("a specialist's program is reported under the specialist, in the parent's stream", () => {
    const state = newMapperState()
    const release = adoptChildSession("s", "child-1", "modeler")
    try {
      const childPart = (status: string) => ({ type: "message.part.updated", properties: { part: { sessionID: "child-1", messageID: "m", type: "tool", callID: "q1", tool: "code_mode", state: { status, input: {} } } } })
      expect(map(state, childPart("running")).map((e) => e.type)).toEqual(["tool_call"])
      recordProgramCall("q1", { tool: "cad_edit", input: { n: 1 }, output: hole(1), failed: false })
      const events = map(state, childPart("running"))
      expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result"])
      expect(events.every((e) => (e as { agent?: string }).agent === "modeler")).toBe(true)
      expect((events[0] as { callId: string }).callId.startsWith("q1#")).toBe(true)
    } finally {
      release()
    }
  })
})
