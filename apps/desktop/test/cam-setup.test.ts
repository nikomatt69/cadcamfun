/**
 * The desktop's description of a multi-operation setup (spec 14, RM-02): the panel's toolpaths in execution order become operations,
 * tools that are the same share a pocket, and the generated programs get file names a file system accepts.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { addToolpath, initialState, moveToolpathUp, toggleToolpathVisibility } from "../src/features/cam/lib/multiToolpath.ts"
import { DEFAULT_SETUP_CHOICES, choicesOfSetup, elementsOfSetup, extraStocks, nextWorkpiece, offsetsOf, placedProgram, programFileName, setupOfToolpaths, toolpathsOfSetup } from "../src/features/cam/lib/setup.ts"
import { TOOLPATH_COLORS } from "../src/features/cam/lib/multiToolpath.ts"
import { useSetupStore } from "../src/features/cam/store/setupStore.ts"

const base = cam.generator.DEFAULT_SETTINGS
const panel = () => {
  let state = initialState()
  state = addToolpath(state, { id: "tp-a", elementId: "el-a", elementType: "rectangle", elementName: "Plate", settings: { ...base, toolDiameter: 6 } })
  state = addToolpath(state, { id: "tp-b", elementId: "el-b", elementType: "circle", elementName: "Hole", settings: { ...base, toolDiameter: 3 } })
  state = addToolpath(state, { id: "tp-c", elementId: "el-c", elementType: "circle", elementName: "Hole 2", settings: { ...base, toolDiameter: 6 } })
  return state
}

describe("the panel's toolpaths as a setup", () => {
  test("operations follow the execution order and carry the toolpath's settings", () => {
    const setup = setupOfToolpaths(moveToolpathUp(panel(), "tp-b").toolpaths)
    expect(setup.operations.map((o) => o.id)).toEqual(["tp-b", "tp-a", "tp-c"])
    expect(setup.operations[0]!.params.toolDiameter).toBe(3)
    expect(setup.operations[0]!.elementIds).toEqual(["el-b"])
    expect(setup.grouping).toBe("single")
  })

  test("equal tools share one id, so they share one pocket", () => {
    const setup = setupOfToolpaths(panel().toolpaths)
    const pockets = cam.program.assignPockets(setup.operations)
    expect(setup.operations[0]!.tool.id).toBe(setup.operations[2]!.tool.id)
    expect([...pockets.values()]).toEqual([1, 2, 1])
  })

  test("a hidden toolpath is a disabled operation, not a deleted one", () => {
    const setup = setupOfToolpaths(toggleToolpathVisibility(panel(), "tp-b").toolpaths)
    expect(setup.operations.map((o) => o.enabled)).toEqual([true, false, true])
    expect(cam.program.planPrograms(setup).programs[0]!.operations).toEqual(["tp-a", "tp-c"])
  })

  test("the setup decodes against the core schema, so the sidecar will accept it", () => {
    expect(() => cam.program.decodeSetup(JSON.parse(JSON.stringify(setupOfToolpaths(panel().toolpaths))))).not.toThrow()
  })

  test("only the elements the operations name travel with the request", () => {
    const setup = setupOfToolpaths(panel().toolpaths.slice(0, 2))
    const elements = elementsOfSetup(setup, [{ id: "el-a", type: "rectangle" }, { id: "el-b", type: "circle" }, { id: "el-z", type: "cube" }])
    expect(Object.keys(elements)).toEqual(["el-a", "el-b"])
  })

  test("program files are named by number and name, with nothing a file system refuses", () => {
    expect(programFileName({ name: "Setup - Endmill Ø6 / 2F", programNumber: 1001 })).toBe("1001-Setup_-_Endmill_6_2F.nc")
  })
})

describe("a saved setup back on the panel", () => {
  const drawing = [{ id: "el-a", type: "rectangle" }, { id: "el-b", type: "circle" }, { id: "el-c", type: "circle" }]

  test("its operations become the toolpaths in the setup's order, with no G-code, and give back the same setup", () => {
    const saved = setupOfToolpaths(moveToolpathUp(panel(), "tp-b").toolpaths, { ...DEFAULT_SETUP_CHOICES, name: "Bracket", grouping: "perTool" })
    const restored = toolpathsOfSetup(saved, drawing, TOOLPATH_COLORS)
    expect(restored.toolpaths.map((tp) => [tp.id, tp.elementId, tp.order, tp.gcode])).toEqual([["tp-b", "el-b", 0, ""], ["tp-a", "el-a", 1, ""], ["tp-c", "el-c", 2, ""]])
    expect(restored.toolpaths[0]!.elementType).toBe("circle")
    expect(restored.missingElementIds).toEqual([])
    expect(choicesOfSetup(saved)).toMatchObject({ name: "Bracket", grouping: "perTool" })
    expect(setupOfToolpaths(restored.toolpaths, choicesOfSetup(saved))).toEqual(saved)
  })

  test("an element gone from the drawing keeps its operation, hidden and reported; a multi-element operation is reported, not guessed", () => {
    const saved = setupOfToolpaths(panel().toolpaths)
    const wide = { ...saved, operations: [...saved.operations, { ...saved.operations[0]!, id: "op-wide", elementIds: ["el-a", "el-b"] }] }
    const restored = toolpathsOfSetup(wide, drawing.filter((e) => e.id !== "el-b"), TOOLPATH_COLORS)
    expect(restored.toolpaths.map((tp) => [tp.id, tp.visible])).toEqual([["tp-a", true], ["tp-b", false], ["tp-c", true]])
    expect(restored.missingElementIds).toEqual(["el-b"])
    expect(restored.skippedOperationIds).toEqual(["op-wide"])
  })
})

describe("the setup store", () => {
  test("an edit of the panel's toolpaths drops the plan made for the old ones", async () => {
    const { useMultiToolpathStore } = await import("../src/features/cam/store/multiToolpathStore.ts")
    useSetupStore.getState().setPlan({ programs: [], toolTable: [], toolLoads: 0, toolChanges: 0, warnings: [] })
    useMultiToolpathStore.getState().replaceToolpaths(panel().toolpaths)
    expect(useSetupStore.getState().plan).toBeUndefined()
    useMultiToolpathStore.getState().clearAllToolpaths()
  })

  test("a change of choices drops the stale plan and result", () => {
    const store = useSetupStore.getState()
    store.setPlan({ programs: [], toolTable: [], toolLoads: 0, toolChanges: 0, warnings: [] })
    expect(useSetupStore.getState().plan).toBeDefined()
    store.setChoices({ grouping: "perTool" })
    expect(useSetupStore.getState().plan).toBeUndefined()
    expect(useSetupStore.getState().choices.grouping).toBe("perTool")
    store.setChoices({ grouping: DEFAULT_SETUP_CHOICES.grouping })
  })
})

describe("several workpieces on the fixture", () => {
  const name = (n: number) => `Part ${n}`
  test("the fixture grows on the first free register and stops at six", () => {
    let parts: cam.program.Workpiece[] = [{ id: "wp-1", name: "Part 1", workOffset: "G54" }]
    for (let i = 0; i < 5; i++) parts = [...parts, nextWorkpiece(parts, name)!]
    expect(parts.map((p) => p.workOffset)).toEqual(["G54", "G55", "G56", "G57", "G58", "G59"])
    expect(nextWorkpiece(parts, name)).toBeUndefined()
    // A register freed in the middle is the next one handed out.
    expect(nextWorkpiece(parts.filter((p) => p.workOffset !== "G56"), name)).toMatchObject({ workOffset: "G56" })
  })

  test("the setup carries the list only for two parts or more; one part runs under its own register", () => {
    const one = setupOfToolpaths(panel().toolpaths, { ...DEFAULT_SETUP_CHOICES, workpieces: [{ id: "wp-1", name: "Part 1", workOffset: "G57" }] })
    expect(one.workOffset).toBe("G57")
    expect(one.workpieces).toBeUndefined()
    const parts = [{ id: "wp-1", name: "Part 1", workOffset: "G54" as const }, { id: "wp-2", name: "Part 2", workOffset: "G55" as const }]
    const many = setupOfToolpaths(panel().toolpaths, { ...DEFAULT_SETUP_CHOICES, workpieces: parts, workpieceOrder: "partFirst" })
    expect(many.workpieces).toEqual(parts)
    expect(many.workpieceOrder).toBe("partFirst")
    expect(() => cam.program.decodeSetup(JSON.parse(JSON.stringify(many)))).not.toThrow()
    // The planner agrees with the panel: three tools' worth of operations on two parts, part first.
    expect(cam.program.planPrograms(many).toolChanges).toBeGreaterThan(cam.program.planPrograms({ ...many, workpieceOrder: "toolFirst" }).toolChanges)
  })

  test("a saved fixture comes back onto the panel as it was saved", () => {
    const parts = [{ id: "wp-1", name: "Part 1", workOffset: "G54" as const }, { id: "wp-2", name: "Part 2", workOffset: "G58" as const }]
    const saved = setupOfToolpaths(panel().toolpaths, { ...DEFAULT_SETUP_CHOICES, workpieces: parts, workpieceOrder: "partFirst" })
    expect(choicesOfSetup(saved)).toMatchObject({ workpieces: parts, workpieceOrder: "partFirst" })
    expect(choicesOfSetup(setupOfToolpaths(panel().toolpaths))).toMatchObject({ workpieces: [], workpieceOrder: "toolFirst" })
  })
})

describe("several workpieces in the viewport", () => {
  const two = (placement: { x: number; y: number; z: number } | undefined): ReadonlyArray<cam.program.Workpiece> => [
    { id: "w1", name: "P1", workOffset: "G54" }, { id: "w2", name: "P2", workOffset: "G55", ...(placement ? { placement } : {}) }
  ]
  const moves: cam.Move[] = [
    { _tag: "Rapid", to: { x: 1, y: 2, z: 10 } },
    { _tag: "Linear", to: { x: 3, y: 2, z: -1 }, feed: 100 },
    { _tag: "Arc", to: { x: 5, y: 4, z: -1 }, center: { x: 4, y: 2 }, clockwise: false, feed: 100 },
    { _tag: "Cycle", cycle: "drill", to: { x: 7, y: 7, z: -5 }, feed: 80, peckDepth: 0, dwellSeconds: 0, retractHeight: 2 },
    { _tag: "Rapid", to: { x: 0, y: 0, z: 0 }, machine: true }
  ]
  const program: cam.Program = cam.makeProgram("fix", [
    { id: "a@w1", name: "a", toolId: "t", spindleRpm: 1000, coolant: "off", moves, workOffset: "G54" },
    { id: "a@w2", name: "a", toolId: "t", spindleRpm: 1000, coolant: "off", moves, workOffset: "G55" }
  ])

  test("the part on the second register is drawn at its placement, the first stays; the NC is untouched", () => {
    const placed = placedProgram(program, two({ x: 100, y: -20, z: 0 }))
    expect(placed.toolpaths[0]!.moves).toEqual(moves)
    const shifted = placed.toolpaths[1]!.moves
    expect(shifted[0]).toMatchObject({ to: { x: 101, y: -18, z: 10 } })
    expect(shifted[2]).toMatchObject({ to: { x: 105, y: -16, z: -1 }, center: { x: 104, y: -18 } })
    expect(shifted[3]).toMatchObject({ to: { x: 107, y: -13, z: -5 }, retractHeight: 2 })
    // A move in machine coordinates does not follow the datum.
    expect(shifted[4]).toEqual(moves[4])
    expect(program.toolpaths[1]!.moves).toBe(moves)
  })

  test("no placement, one part or no register: the program is returned as it is", () => {
    expect(placedProgram(program, two(undefined))).toBe(program)
    expect(placedProgram(program, [two(undefined)[0]!])).toBe(program)
  })

  test("a toolpath without its own register follows the program's", () => {
    const plain = cam.makeProgram("fix", [{ id: "x", name: "x", toolId: "t", spindleRpm: 1, coolant: "off", moves }], { workOffset: "G55" })
    expect(placedProgram(plain, two({ x: 10, y: 0, z: 0 })).toolpaths[0]!.moves[0]).toMatchObject({ to: { x: 11 } })
  })

  test("the other parts' stock boxes sit at their placements, and the registers a program uses are listed in order", () => {
    const box = { origin: { x: -10, y: -10, z: -5 }, size: { x: 20, y: 20, z: 5 } }
    expect(extraStocks(box, two({ x: 50, y: 0, z: 0 }))).toEqual([{ origin: { x: 40, y: -10, z: -5 }, size: box.size }])
    expect(extraStocks(undefined, two({ x: 50, y: 0, z: 0 }))).toEqual([])
    expect(offsetsOf(program)).toEqual(["G54", "G55"])
  })
})

describe("a saved multi-part program keeps its fixture", () => {
  test("the fixture travels in the saved document's drawing and comes back only for two parts or more", async () => {
    const { workpiecesOfSnapshot } = await import("../src/features/cam/lib/saved-program.ts")
    const parts = [{ id: "wp-1", name: "P1", workOffset: "G54" }, { id: "wp-2", name: "P2", workOffset: "G55", placement: { x: 80, y: 0, z: 0 } }]
    expect(workpiecesOfSnapshot({ drawing: { workpieces: parts } })).toEqual(parts)
    expect(workpiecesOfSnapshot({ drawing: { workpieces: [parts[0]] } })).toEqual([])
    expect(workpiecesOfSnapshot({ drawing: { workpieces: "nonsense" } })).toEqual([])
    expect(workpiecesOfSnapshot({ drawing: {} })).toEqual([])
  })
})
