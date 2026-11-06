/**
 * The desktop's description of a multi-operation setup (spec 14, RM-02): the panel's toolpaths in execution order become operations,
 * tools that are the same share a pocket, and the generated programs get file names a file system accepts.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { addToolpath, initialState, moveToolpathUp, toggleToolpathVisibility } from "../src/features/cam/lib/multiToolpath.ts"
import { addJobSetup, jobRelease, patchJobSetup, removeJobSetup } from "../src/features/cam/lib/job.ts"
import { DEFAULT_SETUP_CHOICES, choicesOfSetup, elementsOfSetup, MAX_WORKPIECES, REGISTER_CHOICES, extraStocks, nextWorkpiece, registerKey, withRegister, workpiecesFromElements, offsetsOf, placedProgram, arcPoints, evidenceOfProgram, fixtureBoxes, programFileName, toggleToolpathWorkpiece, toggleDependency, withoutWorkpiece, setupOfToolpaths, toolpathsOfSetup, blockOfStock, clampBoxes, travelBox, nextFixture, withFixtureCorner, DEFAULT_ENVELOPE, stepOfSettings, withStepSettings, toggleStepDependency, withoutStep, useOf, expandedOperations, defaultProbeCycle, probeFields, PROBE_KINDS } from "../src/features/cam/lib/setup.ts"
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
  test("the fixture grows on the first free register: G54-G59 first, then the extended ones", () => {
    let parts: cam.program.Workpiece[] = [{ id: "wp-1", name: "Part 1", workOffset: "G54" }]
    for (let i = 0; i < 5; i++) parts = [...parts, nextWorkpiece(parts, name)!]
    expect(parts.map((p) => p.workOffset)).toEqual(["G54", "G55", "G56", "G57", "G58", "G59"])
    expect(registerKey(nextWorkpiece(parts, name)!)).toBe("G54.1 P1")
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

  test("an operation can wait for several others: switching one on or off, none left is no dependency", () => {
    expect(toggleDependency(undefined, "a")).toEqual(["a"])
    expect(toggleDependency(["a"], "b")).toEqual(["a", "b"])
    expect(toggleDependency(["a", "b"], "a")).toEqual(["b"])
    expect(toggleDependency(["b"], "b")).toBeUndefined()
  })

  test("a part on an indexed face is drawn turned by its index from the first part's, blank included", () => {
    const parts = (index: { a?: number; b?: number; c?: number }): ReadonlyArray<cam.program.Workpiece> => [
      { id: "w1", name: "P1", workOffset: "G54" }, { id: "w2", name: "P2", workOffset: "G55", index }
    ]
    // C 90: x -> y, y -> -x, the arc keeps its plane and its centre turns with it; the first part stays.
    const turned = placedProgram(program, parts({ c: 90 }))
    expect(turned.toolpaths[0]!.moves).toEqual(moves)
    expect(turned.toolpaths[1]!.moves[1]).toMatchObject({ to: { x: -2, y: 3, z: -1 } })
    expect(turned.toolpaths[1]!.moves[2]).toMatchObject({ _tag: "Arc", to: { x: -4, y: 5 }, center: { x: -2, y: 4 } })
    // A tilt takes the arc out of its plane: the viewport draws it as short segments (the cycle as its motion); the program text is untouched.
    const tilted = placedProgram(program, parts({ a: 90 })).toolpaths[1]!.moves
    expect(tilted[1]).toMatchObject({ to: { x: 3, y: 1, z: 2 } })
    expect(tilted.some((m) => m._tag === "Arc" || m._tag === "Cycle" || m._tag === "Spline")).toBe(false)
    const arcEnd = tilted.findIndex((m) => m._tag === "Linear" && m.to.x === 5 && m.to.y === 1 && m.to.z === 4)
    expect(arcEnd).toBeGreaterThan(3)
    expect(tilted.at(-1)).toEqual(moves[4])
    // The index is measured from the first part: both on the same face is no turn at all.
    expect(placedProgram(program, [{ id: "w1", name: "P1", workOffset: "G54", index: { c: 90 } }, { id: "w2", name: "P2", workOffset: "G55", index: { c: 90 } }])).toBe(program)
    // The blank turns with its part: a quarter turn about Z swaps its sides.
    const box = { origin: { x: 0, y: 0, z: -5 }, size: { x: 20, y: 10, z: 5 } }
    expect(extraStocks(box, parts({ c: 90 }))).toEqual([{ origin: { x: -10, y: 0, z: -5 }, size: { x: 10, y: 20, z: 5 } }])
  })

  test("an arc of a tilted part is sampled within the tolerance: on its circle, helix included, ending exactly where it ends", () => {
    const half = arcPoints({ x: 1, y: 0, z: 0 }, { _tag: "Arc", to: { x: -1, y: 0, z: -2 }, center: { x: 0, y: 0 }, clockwise: false, feed: 100 })
    expect(half.length).toBeGreaterThanOrEqual(12)
    expect(half.at(-1)).toEqual({ x: -1, y: 0, z: -2 })
    for (const p of half) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 9)
    expect(half[0]!.y).toBeGreaterThan(0)
    expect(half[0]!.z).toBeLessThan(0)
    const clockwise = arcPoints({ x: 1, y: 0, z: 0 }, { _tag: "Arc", to: { x: -1, y: 0, z: 0 }, center: { x: 0, y: 0 }, clockwise: true, feed: 100 })
    expect(clockwise[0]!.y).toBeLessThan(0)
    const full = arcPoints({ x: 5, y: 0, z: 0 }, { _tag: "Arc", to: { x: 5, y: 0, z: 0 }, center: { x: 0, y: 0 }, clockwise: false, feed: 100 })
    expect(full.length).toBeGreaterThan(30)
    // Chord error stays under the tolerance: the midpoint of a chord is within 0.01 mm of the circle.
    for (let i = 1; i < full.length; i++) {
      const a = full[i - 1]!, b = full[i]!
      expect(5 - Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2)).toBeLessThanOrEqual(0.0101)
    }
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
    const parts: cam.program.Workpiece[] = [{ id: "wp-1", name: "P1", workOffset: "G54" }, { id: "wp-2", name: "P2", workOffset: "G55", placement: { x: 80, y: 0, z: 0 } }]
    expect(workpiecesOfSnapshot({ drawing: { workpieces: parts } })).toEqual(parts)
    expect(workpiecesOfSnapshot({ drawing: { workpieces: [parts[0]] } })).toEqual([])
    expect(workpiecesOfSnapshot({ drawing: { workpieces: "nonsense" } })).toEqual([])
    expect(workpiecesOfSnapshot({ drawing: {} })).toEqual([])
  })
})

describe("operations restricted to some workpieces", () => {
  const fixture: cam.program.Workpiece[] = [{ id: "w1", name: "P1", workOffset: "G54" }, { id: "w2", name: "P2", workOffset: "G55" }, { id: "w3", name: "P3", workOffset: "G56" }]
  test("switching a part off restricts the toolpath, switching it on again frees it, the last part stays", () => {
    const off = toggleToolpathWorkpiece(fixture, undefined, "w2")
    expect(off).toEqual(["w1", "w3"])
    expect(toggleToolpathWorkpiece(fixture, off, "w2")).toBeUndefined()
    expect(toggleToolpathWorkpiece(fixture, ["w1"], "w1")).toEqual(["w1"])
  })

  test("a removed part leaves the lists; one part left means unrestricted", () => {
    expect(withoutWorkpiece(["w1", "w3"], "w3", 2)).toEqual(["w1"])
    expect(withoutWorkpiece(["w3"], "w3", 2)).toBeUndefined()
    expect(withoutWorkpiece(["w1", "w3"], "w3", 1)).toBeUndefined()
    expect(withoutWorkpiece(undefined, "w3", 2)).toBeUndefined()
  })

  test("the restriction goes into the setup and back onto the panel; it is dropped for parts the fixture no longer has", () => {
    const toolpaths = panel().toolpaths.map((tp, i) => (i === 0 ? { ...tp, workpieceIds: ["w1", "w3", "w9"] } : tp))
    const setup = setupOfToolpaths(toolpaths, { ...DEFAULT_SETUP_CHOICES, workpieces: fixture })
    expect(setup.operations[0]!.workpieceIds).toEqual(["w1", "w3"])
    expect(setup.operations[1]!.workpieceIds).toBeUndefined()
    expect(toolpathsOfSetup(setup, [], TOOLPATH_COLORS).toolpaths[0]!.workpieceIds).toEqual(["w1", "w3"])
    // On a fixture of one part the list is not sent at all.
    expect(setupOfToolpaths(toolpaths, DEFAULT_SETUP_CHOICES).operations[0]!.workpieceIds).toBeUndefined()
    // The planner honours it: the restricted operation runs on two of three parts.
    expect(cam.program.runsOf(setup).filter((run) => run.operation.id === setup.operations[0]!.id)).toHaveLength(2)
  })
})

describe("a selection of parts becomes the fixture", () => {
  const part = (id: string, x: number, y: number, name?: string) => ({ id, type: "cube", x, y, z: 0, width: 20, height: 10, depth: 5, ...(name ? { name } : {}) })
  test("one workpiece per part on G54, G55 ..., placed by the distance of its box from the first's", () => {
    const fixture = workpiecesFromElements([part("a", 0, 0, "Blank A"), part("b", 60, 5), part("c", -40, 0)], (n) => `Part ${n}`)
    expect(fixture.map((wp) => [wp.name, wp.workOffset])).toEqual([["Blank A", "G54"], ["Part 2", "G55"], ["Part 3", "G56"]])
    expect(fixture[0]!.placement).toBeUndefined()
    expect(fixture[1]!.placement).toEqual({ x: 60, y: 5, z: 0 })
    expect(fixture[2]!.placement).toEqual({ x: -40, y: 0, z: 0 })
    expect(() => cam.program.decodeSetup({ ...setupOfToolpaths(panel().toolpaths), workpieces: JSON.parse(JSON.stringify(fixture)) })).not.toThrow()
  })
  test("more parts than G54-G59 go on the extended registers, up to 48", () => {
    const nine = workpiecesFromElements(Array.from({ length: 9 }, (_, i) => part(`p${i}`, i * 30, 0)), (n) => `Part ${n}`)
    expect(nine.map(registerKey).slice(5)).toEqual(["G59", "G54.1 P1", "G54.1 P2", "G54.1 P3"])
    expect(workpiecesFromElements(Array.from({ length: 60 }, (_, i) => part(`p${i}`, i * 30, 0)), (n) => `Part ${n}`)).toHaveLength(48)
  })
})

describe("extended registers, blanks of their own, dependencies and the magazine", () => {
  test("the fixture grows past G59 onto G54.1 Pn, to 48 parts, each part on its own register", () => {
    let parts: cam.program.Workpiece[] = []
    for (let i = 0; i < MAX_WORKPIECES; i++) parts = [...parts, nextWorkpiece(parts, (n) => `Part ${n}`)!]
    expect(parts).toHaveLength(48)
    expect(new Set(parts.map(registerKey)).size).toBe(48)
    expect(registerKey(parts[6]!)).toBe("G54.1 P1")
    expect(parts[6]).toMatchObject({ workOffset: "G54", workOffsetRef: { kind: "extended", p: 1 } })
    expect(nextWorkpiece(parts, (n) => `Part ${n}`)).toBeUndefined()
    expect(REGISTER_CHOICES).toHaveLength(48)
    expect(() => cam.program.decodeSetup({ ...setupOfToolpaths(panel().toolpaths), workpieces: JSON.parse(JSON.stringify(parts)) })).not.toThrow()
  })

  test("moving a part back to G56 drops the extended ref", () => {
    const part = withRegister({ id: "w", name: "P", workOffset: "G54" }, "G54.1 P4")
    expect(part.workOffsetRef).toEqual({ kind: "extended", p: 4 })
    expect(withRegister(part, "G56")).toEqual({ id: "w", name: "P", workOffset: "G56" })
  })

  test("a part on an extended register is drawn at its placement and listed under its register", () => {
    const parts = [withRegister({ id: "a", name: "A", workOffset: "G54" }, "G54"), { ...withRegister({ id: "b", name: "B", workOffset: "G54" }, "G54.1 P2"), placement: { x: 50, y: 0, z: 0 } }]
    const move: cam.Move = { _tag: "Rapid", to: { x: 1, y: 1, z: 5 } }
    const base = { name: "t", toolId: "t", spindleRpm: 1, coolant: "off" as const, moves: [move] }
    const program = cam.makeProgram("fix", [{ id: "a", ...base, workOffset: "G54" }, { id: "b", ...base, workOffset: "G54", workOffsetRef: { kind: "extended", p: 2 } }])
    expect(offsetsOf(program)).toEqual(["G54", "G54.1 P2"])
    expect(placedProgram(program, parts).toolpaths.map((tp) => (tp.moves[0] as { to: { x: number } }).to.x)).toEqual([1, 51])
  })

  test("a part with its own blank has its own box, the corner relative to its datum and the top face at the origin", () => {
    const main = { origin: { x: -10, y: -10, z: -5 }, size: { x: 20, y: 20, z: 5 } }
    const own = { x: 30, y: 12, z: 8, origin: { x: -15, y: -6, z: 0 }, material: "aluminum" }
    const boxes = extraStocks(main, [{ id: "a", name: "A", workOffset: "G54" }, { id: "b", name: "B", workOffset: "G55", placement: { x: 100, y: 0, z: 0 }, stock: own }, { id: "c", name: "C", workOffset: "G56", placement: { x: 200, y: 0, z: 0 } }])
    expect(boxes[0]).toEqual({ origin: { x: 85, y: -6, z: -8 }, size: { x: 30, y: 12, z: 8 } })
    expect(boxes[1]).toEqual({ origin: { x: 190, y: -10, z: -5 }, size: main.size })
  })

  test("dependencies and the magazine go into the setup, come back, and the setup's own issues name what is wrong", () => {
    const toolpaths = panel().toolpaths.map((tp, i) => (i === 0 ? { ...tp, dependsOn: ["tp-b"] } : tp))
    const setup = setupOfToolpaths(toolpaths, { ...DEFAULT_SETUP_CHOICES, magazineSize: 1 })
    expect(setup.operations[0]).toMatchObject({ id: "tp-a", dependsOn: ["tp-b"] })
    expect(setup.magazineSize).toBe(1)
    expect(toolpathsOfSetup(setup, [], TOOLPATH_COLORS).toolpaths[0]!.dependsOn).toEqual(["tp-b"])
    expect(choicesOfSetup(setup).magazineSize).toBe(1)
    const messages = cam.program.validateSetup(setup).map((issue) => issue.message).join(" | ")
    expect(messages).toMatch(/depends on tp-b, which runs after it/)
    expect(messages).toMatch(/the magazine holds 1/)
    expect(setupOfToolpaths(panel().toolpaths).magazineSize).toBeUndefined()
  })
})

describe("the setups of a kernel job", () => {
  test("the first add turns the panel's fixing into setup 1 and adds one on the next register; at six, no more", () => {
    const two = addJobSetup(undefined, "-Z")!
    expect(two).toEqual([{ id: "setup-1", orientation: "-Z", workOffset: "G54" }, { id: "setup-2", orientation: "+Z", workOffset: "G55" }])
    let list = two
    for (let i = 0; i < 4; i++) list = addJobSetup(list, undefined)!
    expect(list.map((s) => s.workOffset)).toEqual(["G54", "G55", "G56", "G57", "G58", "G59"])
    expect(addJobSetup(list, undefined)).toBeUndefined()
  })

  test("a register another setup holds is refused, one setup left is no job, the job's release is its lowest", () => {
    const list = addJobSetup(undefined, "+Z")!
    expect(patchJobSetup(list, "setup-2", { workOffset: "G54" })).toBe(list)
    expect(patchJobSetup(list, "setup-2", { workOffset: "G57", orientation: "-X" })[1]).toEqual({ id: "setup-2", orientation: "-X", workOffset: "G57" })
    expect(removeJobSetup(list, "setup-1")).toBeUndefined()
    expect(removeJobSetup(addJobSetup(list, undefined)!, "setup-2")!.map((s) => s.id)).toEqual(["setup-1", "setup-3"])
    expect(jobRelease(["verified-program", "preview"])).toBe("preview")
    expect(jobRelease(["verified-program", "blocked", "preview"])).toBe("blocked")
    expect(jobRelease([])).toBeUndefined()
  })
})

describe("the replay evidence of a generated program", () => {
  const gcode = "G21\nG54\nG0 X1"
  const part = (register: string, x: number) => ({ register, workpieceId: register, name: register, datum: { x, y: 0, z: 0 }, blank: { min: { x, y: 0, z: -5 }, max: { x: x + 20, y: 20, z: 0 } }, removedMm3: 1, remainingMm3: 9, ...(x > 0 ? { reach: { min: { x, y: 2, z: -1 }, max: { x: x + 10, y: 8, z: 5 } } } : {}) })
  const evidence = (crossings: ReadonlyArray<{ register: string; other: string }> = []) => ({
    release: "preview", programHash: cam.kernel.sha256(gcode), registers: [], notes: [], basis: "",
    fixture: { frame: "P1", parts: [part("G54", 0), part("G55", 80), part("G56", 160)], crossings: crossings.map((c) => ({ ...c, line: 3, message: "cut" })) }
  })

  test("it is taken only for the very text it was made for, and only when it looks like evidence", () => {
    expect(evidenceOfProgram(evidence(), gcode)?.release).toBe("preview")
    expect(evidenceOfProgram(evidence(), `${gcode}\nG0 Z9`)).toBeUndefined()
    expect(evidenceOfProgram({ ...evidence(), release: "great" }, gcode)).toBeUndefined()
    expect(evidenceOfProgram({ ...evidence(), registers: "no" }, gcode)).toBeUndefined()
    expect(evidenceOfProgram(undefined, gcode)).toBeUndefined()
    expect(evidenceOfProgram([], gcode)).toBeUndefined()
  })

  test("the parts seen together become boxes, the parts a cut crossed are marked, a single part has no combined view", () => {
    const boxes = fixtureBoxes(evidenceOfProgram(evidence([{ register: "G55", other: "G54" }]), gcode))
    expect(boxes.map((b) => [b.name, b.state])).toEqual([["G54", "crossed"], ["G55", "crossed"], ["G56", "part"]])
    expect(boxes[1]).toMatchObject({ origin: { x: 80, y: 0, z: -5 }, size: { x: 20, y: 20, z: 5 }, reach: { origin: { x: 80, y: 2, z: -1 }, size: { x: 10, y: 6, z: 6 } } })
    expect(boxes[0]!.reach).toBeUndefined()
    expect(fixtureBoxes(undefined)).toEqual([])
    const single = { ...evidence(), fixture: { ...evidence().fixture, parts: [part("G54", 0)] } }
    expect(fixtureBoxes(evidenceOfProgram(single, gcode))).toEqual([])
  })
})

describe("clamps, the machine travel, templates and the part probe", () => {
  const stock = { width: 60, height: 40, depth: 10, radius: 0, x: 5, y: 0, topZ: 0, allowance: 0, material: "aluminum" } as cam.generator.Stock
  const withChoices = (patch: Partial<typeof DEFAULT_SETUP_CHOICES>) => ({ ...DEFAULT_SETUP_CHOICES, ...patch })

  test("nothing of them is sent while none is described, so a stored setup stays what it was", () => {
    const setup = setupOfToolpaths(panel().toolpaths, DEFAULT_SETUP_CHOICES, stock)
    for (const key of ["fixtures", "envelope", "templates", "uses", "partProbe", "stock", "workpieces"]) expect(setup).not.toHaveProperty(key)
  })

  test("clamps or a travel put the first part at the datum, list a single part, and send the page's stock so the blanks can be checked", () => {
    const fixtures = [nextFixture([], (n) => `Jaw ${n}`)]
    const setup = setupOfToolpaths(panel().toolpaths, withChoices({ fixtures, envelope: DEFAULT_ENVELOPE }), stock)
    expect(setup.workpieces).toEqual([{ id: "wp-1", name: "Workpiece 1", workOffset: "G54", placement: { x: 0, y: 0, z: 0 } }])
    expect(setup.stock).toEqual({ x: 60, y: 40, z: 10, origin: { x: -25, y: -20, z: 0 }, material: "aluminum" })
    expect(setup.fixtures).toEqual(fixtures)
    expect(setup.envelope).toEqual(DEFAULT_ENVELOPE)
    expect(() => cam.program.decodeSetup(JSON.parse(JSON.stringify(setup)))).not.toThrow()
    // A round stock is its bounding square.
    expect(blockOfStock({ ...stock, radius: 15 })).toMatchObject({ x: 30, y: 30, origin: { x: -10, y: -15 } })
  })

  test("a blank inside a clamp, or outside the travel, is an issue of the setup the panel shows next to its row", () => {
    const jaw = { id: "fx-1", name: "Left jaw", min: { x: -10, y: -30, z: -20 }, max: { x: 10, y: 30, z: 0 } }
    const inside = setupOfToolpaths(panel().toolpaths, withChoices({ fixtures: [jaw] }), stock)
    expect(cam.program.validateSetup(inside).map((issue) => issue.message).join(" ")).toMatch(/blank overlaps Left jaw/)
    const moved = setupOfToolpaths(panel().toolpaths, withChoices({ fixtures: [{ ...jaw, min: { x: -90, y: -30, z: -20 }, max: { x: -60, y: 30, z: 0 } }] }), stock)
    expect(cam.program.validateSetup(moved).filter((issue) => /overlaps/.test(issue.message))).toEqual([])
    const tight = setupOfToolpaths(panel().toolpaths, withChoices({ envelope: { min: { x: -10, y: -10, z: -50 }, max: { x: 10, y: 10, z: 10 } } }), stock)
    expect(cam.program.validateSetup(tight).map((issue) => issue.message).join(" ")).toMatch(/outside the machine travel/)
  })

  test("the boxes of the viewport are the clamps that are boxes and the travel; a clamp that is not one is not drawn", () => {
    const good = nextFixture([], (n) => `Jaw ${n}`)
    const bad = withFixtureCorner({ ...good, id: "fx-2", name: "Bad" }, "max", "x", good.min.x - 5)
    expect(clampBoxes([good, bad])).toEqual([{ name: "Jaw 1", origin: good.min, size: { x: 20, y: 30, z: 20 } }])
    expect(travelBox(DEFAULT_ENVELOPE)).toEqual({ name: "travel", origin: DEFAULT_ENVELOPE.min, size: { x: 1000, y: 1000, z: 600 } })
    expect(travelBox(undefined)).toBeUndefined()
    expect(nextFixture([good], (n) => `Jaw ${n}`).id).toBe("fx-2")
  })

  const rough = stepOfSettings("rough", "Rough", { ...base, toolDiameter: 6, depth: 4, stepdown: 2, operationType: "pocket" })
  const finish = stepOfSettings("finish", "Finish", { ...base, toolDiameter: 3, depth: 4, stepdown: 4, operationType: "contour" })

  test("a template step follows its settings: the tool is the generic one of its diameter", () => {
    expect(rough.tool).toMatchObject({ kind: "endmill", diameter: 6 })
    const thinner = withStepSettings(rough, { toolDiameter: 4 })
    expect(thinner.params.toolDiameter).toBe(4)
    expect(thinner.tool.diameter).toBe(4)
    expect(thinner.tool.id).not.toBe(rough.tool.id)
  })

  test("a step waits for an earlier one by a switch; none left is no key; removing a step releases the ones that waited for it", () => {
    const template = { id: "tpl-1", name: "Pocket", steps: [rough, finish] }
    const waits = toggleStepDependency(template, "finish", "rough")
    expect(waits.steps[1]!.dependsOn).toEqual(["rough"])
    expect(toggleStepDependency(waits, "finish", "rough").steps[1]).not.toHaveProperty("dependsOn")
    expect(withoutStep(waits, "rough").steps).toHaveLength(1)
    expect(withoutStep(waits, "rough").steps[0]).not.toHaveProperty("dependsOn")
    expect(withoutStep({ ...template, steps: [rough] }, "rough").steps).toHaveLength(1)
  })

  test("a use of the template expands to its steps on every element, step by step; the plan lists them, the request names their elements", () => {
    const template = { id: "tpl-1", name: "Pocket", steps: [rough, toggleStepDependency({ id: "t", name: "t", steps: [rough, finish] }, "finish", "rough").steps[1]!] }
    const choices = withChoices({ templates: [template], uses: [useOf("use-1", template, ["el-a", "el-b"], { name: "Pockets" })] })
    const setup = setupOfToolpaths([], choices, stock)
    expect(setup.operations).toEqual([])
    const listed = expandedOperations(setup)
    expect(listed.map((op) => op.id)).toEqual(["use-1[1]:rough", "use-1[2]:rough", "use-1[1]:finish", "use-1[2]:finish"])
    expect(listed[2]).toMatchObject({ elementIds: ["el-a"], tool: expect.stringContaining("3") })
    expect(Object.keys(elementsOfSetup(setup, [{ id: "el-a", type: "rectangle" }, { id: "el-b", type: "circle" }, { id: "el-z", type: "circle" }]))).toEqual(["el-a", "el-b"])
    expect(cam.program.planPrograms(setup).toolChanges).toBe(1)
    expect(expandedOperations(setupOfToolpaths(panel().toolpaths, DEFAULT_SETUP_CHOICES, stock))).toEqual([])
  })

  test("the choices of a saved setup come back with templates, uses, clamps, the travel and the probe", () => {
    const template = { id: "tpl-1", name: "Pocket", steps: [rough, finish] }
    const probe = { cycles: [defaultProbeCycle("z-surface"), defaultProbeCycle("bore")] }
    const choices = withChoices({ templates: [template], uses: [useOf("use-1", template, ["el-a"])], fixtures: [nextFixture([], (n) => `Jaw ${n}`)], envelope: DEFAULT_ENVELOPE, partProbe: probe, probePart: true })
    const saved = setupOfToolpaths(panel().toolpaths, choices, stock)
    const back = choicesOfSetup(saved)
    expect(back).toMatchObject({ templates: [template], fixtures: choices.fixtures, envelope: DEFAULT_ENVELOPE, partProbe: probe, probePart: true })
    expect(back.uses).toEqual(choices.uses)
  })

  test("every probe cycle kind has a default the schema accepts, and its fields edit it without leaving the schema", () => {
    for (const kind of PROBE_KINDS) {
      const cycle = defaultProbeCycle(kind)
      const setup = { ...setupOfToolpaths(panel().toolpaths, withChoices({ partProbe: { cycles: [cycle] } }), stock) }
      expect(() => cam.program.decodeSetup(JSON.parse(JSON.stringify(setup))), kind).not.toThrow()
      const fields = probeFields(cycle)
      expect(fields.length).toBeGreaterThan(1)
      const moved = fields[0]!.set(7)
      expect(probeFields(moved)[0]!.value).toBe(7)
      expect(moved.kind).toBe(kind)
    }
    // A diameter or a depth of zero is not accepted: the cycle keeps its value.
    const bore = defaultProbeCycle("bore")
    expect(probeFields(bore).find((f) => f.key === "diameter")!.set(0)).toEqual(bore)
    // A normal stays a unit component.
    expect(probeFields(defaultProbeCycle("edge")).find((f) => f.key === "normalX")!.set(5)).toMatchObject({ normal: { x: 1 } })
  })
})
