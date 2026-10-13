/**
 * Programs the assistant generates add up on the CAM page: five operations generated give five programs in the editor and
 * every toolpath in the preview, one colour per tool. Re-generating an operation replaces only its own program; editing an
 * operation drops only its own (stale) program; a new stock clears them all.
 */
import { afterEach, describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { combineOperationResults, useCamStore, type OperationResult } from "../src/features/cam/store/camStore.ts"
import { TOOL_COLORS, buildPlayback, toolColors } from "../src/viewport/view3d/playback.ts"

const result = (id: string, tool: string, x: number): OperationResult => ({
  id, name: `Operation ${id}`, tool,
  gcode: `G21\nT1 M6\nG0 X${x} Y0 Z5\nG1 Z-1 F100\nG1 X${x + 10}\nM30`,
  program: cam.makeProgram(id, [{
    id: "tp-1", name: "path", toolId: "T1", spindleRpm: 10000, coolant: "flood",
    moves: [{ _tag: "Rapid", to: { x, y: 0, z: 5 } }, { _tag: "Linear", to: { x, y: 0, z: -1 }, feed: 100 }, { _tag: "Linear", to: { x: x + 10, y: 0, z: -1 }, feed: 100 }]
  }])
})

afterEach(() => useCamStore.getState().reset())

describe("operation results add up on the CAM page", () => {
  test("five generated operations keep five programs and every toolpath", () => {
    const store = useCamStore.getState()
    const tools = ["endmill Ø6", "endmill Ø6", "drill Ø5", "ballnose Ø4", "drill Ø5"]
    tools.forEach((tool, i) => store.upsertOperationResult(result(`op${i + 1}`, tool, i * 20)))
    const state = useCamStore.getState()
    expect(state.operationResults.map((r) => r.id)).toEqual(["op1", "op2", "op3", "op4", "op5"])
    expect(state.program.toolpaths).toHaveLength(5)
    expect(new Set(state.program.toolpaths.map((tp) => tp.id)).size).toBe(5)
    for (let i = 1; i <= 5; i++) expect(state.gcode).toContain(`Operation ${i}/5: Operation op${i}`)
    // One colour per tool: the same cutter in two operations keeps its colour.
    const colors = toolColors(state.program)
    expect([...colors.keys()]).toEqual(["endmill Ø6", "drill Ø5", "ballnose Ø4"])
    expect([...colors.values()]).toEqual(TOOL_COLORS.slice(0, 3))
    const segments = buildPlayback(state.program).segments.filter((s) => !s.rapid)
    expect(new Set(segments.map((s) => s.toolId))).toEqual(new Set(["endmill Ø6", "drill Ø5", "ballnose Ø4"]))
  })

  test("re-generating an operation replaces only its own program, in place", () => {
    const store = useCamStore.getState()
    store.upsertOperationResult(result("a", "endmill Ø6", 0))
    store.upsertOperationResult(result("b", "drill Ø5", 20))
    store.upsertOperationResult(result("a", "endmill Ø6", 100))
    const state = useCamStore.getState()
    expect(state.operationResults.map((r) => r.id)).toEqual(["a", "b"])
    expect(state.program.toolpaths).toHaveLength(2)
    expect(state.gcode).toContain("X100")
    expect(state.gcode).not.toContain("X0 Y0")
  })

  test("editing one operation drops only its stale program; a new stock clears all", () => {
    const store = useCamStore.getState()
    store.upsertOperationResult(result("a", "endmill Ø6", 0))
    store.upsertOperationResult(result("b", "drill Ø5", 20))
    store.removeOperationResult("a")
    expect(useCamStore.getState().operationResults.map((r) => r.id)).toEqual(["b"])
    expect(useCamStore.getState().program.toolpaths).toHaveLength(1)
    expect(useCamStore.getState().gcode).toBe(result("b", "drill Ø5", 20).gcode)
    store.clearOperationResults()
    expect(useCamStore.getState().program.toolpaths).toHaveLength(0)
    expect(useCamStore.getState().gcode).toBe("")
  })

  test("one operation keeps its program text unchanged", () => {
    const one = combineOperationResults([result("a", "endmill Ø6", 0)])
    expect(one.gcode).toBe(result("a", "endmill Ø6", 0).gcode)
    expect(one.program.toolpaths[0]!.toolId).toBe("endmill Ø6")
  })
})
