/**
 * The desktop's description of a multi-operation setup (spec 14, RM-02): the panel's toolpaths in execution order become operations,
 * tools that are the same share a pocket, and the generated programs get file names a file system accepts.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { addToolpath, initialState, moveToolpathUp, toggleToolpathVisibility } from "../src/features/cam/lib/multiToolpath.ts"
import { DEFAULT_SETUP_CHOICES, elementsOfSetup, programFileName, setupOfToolpaths } from "../src/features/cam/lib/setup.ts"
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

describe("the setup store", () => {
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
