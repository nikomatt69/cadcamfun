/**
 * The multi-toolpath model (legacy `multiToolpathStore`): one toolpath per element, order, colours, combined program.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import {
  TOOLPATH_COLORS,
  addToolpath,
  applyGlobalSettingsToSelected,
  combineGCode,
  deselectAllToolpaths,
  formatDuration,
  initialState,
  measurePoints,
  moveToolpathDown,
  moveToolpathUp,
  parseGCodeToPoints,
  removeToolpath,
  removeToolpathsByElementId,
  reorderToolpaths,
  selectAllToolpaths,
  selectToolpath,
  statistics,
  toggleToolpathVisibility,
  toolpathByElementId,
  updateToolpathGCode,
  type MultiToolpathState
} from "../src/cam/lib/multiToolpath.ts"

const settings = cam.generator.DEFAULT_SETTINGS
const withThree = (): MultiToolpathState => {
  let state = initialState()
  for (const name of ["a", "b", "c"]) state = addToolpath(state, { id: `tp-${name}`, elementId: `el-${name}`, elementType: "rectangle", elementName: name, settings })
  return state
}
const ids = (state: MultiToolpathState): string[] => state.toolpaths.map(toolpath => toolpath.id)

describe("adding", () => {
  test("toolpaths start empty, ordered, with palette colours that cycle", () => {
    const state = withThree()
    expect(state.toolpaths.map(toolpath => toolpath.order)).toEqual([0, 1, 2])
    expect(state.toolpaths.map(toolpath => toolpath.color)).toEqual([TOOLPATH_COLORS[0], TOOLPATH_COLORS[1], TOOLPATH_COLORS[2]])
    expect(state.toolpaths[0]).toMatchObject({ gcode: "", visible: true, selected: false, distance: 0, estimatedTime: 0 })
    let many = initialState()
    for (let i = 0; i < 11; i++) many = addToolpath(many, { elementId: `e${i}`, elementType: "cube", elementName: `e${i}`, settings })
    expect(many.toolpaths[10]!.color).toBe(TOOLPATH_COLORS[0])
  })

  test("looks a toolpath up by its element", () => {
    expect(toolpathByElementId(withThree(), "el-b")?.id).toBe("tp-b")
    expect(toolpathByElementId(withThree(), "nope")).toBeUndefined()
  })
})

describe("ordering", () => {
  test("move up / down swap neighbours and renumber; the ends do nothing", () => {
    const up = moveToolpathUp(withThree(), "tp-c")
    expect(ids(up)).toEqual(["tp-a", "tp-c", "tp-b"])
    expect(up.toolpaths.map(toolpath => toolpath.order)).toEqual([0, 1, 2])
    expect(ids(moveToolpathDown(up, "tp-a"))).toEqual(["tp-c", "tp-a", "tp-b"])
    const state = withThree()
    expect(moveToolpathUp(state, "tp-a")).toBe(state)
    expect(moveToolpathDown(state, "tp-c")).toBe(state)
  })

  test("reorder follows the id list", () => {
    expect(ids(reorderToolpaths(withThree(), ["tp-c", "tp-a", "tp-b"]))).toEqual(["tp-c", "tp-a", "tp-b"])
  })

  test("does not mutate the previous state", () => {
    const state = withThree()
    moveToolpathUp(state, "tp-c")
    expect(ids(state)).toEqual(["tp-a", "tp-b", "tp-c"])
  })
})

describe("selection, visibility and removal", () => {
  test("select / deselect / all keep ids and the active toolpath in step", () => {
    let state = selectToolpath(withThree(), "tp-b")
    expect(state.selectedToolpathIds).toEqual(["tp-b"])
    expect(state.activeToolpathId).toBe("tp-b")
    state = selectAllToolpaths(state)
    expect(state.selectedToolpathIds).toEqual(["tp-a", "tp-b", "tp-c"])
    state = deselectAllToolpaths(state)
    expect(state.selectedToolpathIds).toEqual([])
    expect(state.activeToolpathId).toBeNull()
    expect(state.toolpaths.every(toolpath => !toolpath.selected)).toBe(true)
  })

  test("visibility toggles one toolpath", () => {
    expect(toggleToolpathVisibility(withThree(), "tp-a").toolpaths.map(toolpath => toolpath.visible)).toEqual([false, true, true])
  })

  test("removing clears selection and active, renumbers the rest; by element removes every toolpath of it", () => {
    const state = removeToolpath(selectToolpath(withThree(), "tp-b"), "tp-b")
    expect(ids(state)).toEqual(["tp-a", "tp-c"])
    expect(state.selectedToolpathIds).toEqual([])
    expect(state.activeToolpathId).toBeNull()
    expect(state.toolpaths.map(toolpath => toolpath.order)).toEqual([0, 1])
    expect(ids(removeToolpathsByElementId(withThree(), "el-a"))).toEqual(["tp-b", "tp-c"])
  })

  test("global settings apply to the selected toolpaths only", () => {
    let state = selectToolpath(withThree(), "tp-a")
    state = { ...state, globalSettings: { feedrate: 123, toolDiameter: 8 } }
    const applied = applyGlobalSettingsToSelected(state)
    expect(applied.toolpaths[0]!.toolpathSettings).toMatchObject({ feedrate: 123, toolDiameter: 8 })
    expect(applied.toolpaths[1]!.toolpathSettings.feedrate).toBe(settings.feedrate)
  })
})

describe("G-code points", () => {
  const gcode = ["; header", "G0 Z5", "G0 X10 Y0", "G01 Z-1 F300", "G1 X20 F800", "G2 X30 Y10 I0 J10", "(comment) M30"].join("\n")

  test("parses moves with modal coordinates and feed; G01 is a feed move, G2 / G3 are arcs", () => {
    const points = parseGCodeToPoints(gcode)
    expect(points.map(point => point.type)).toEqual(["G0", "G0", "G1", "G1", "G2"])
    expect(points[1]).toMatchObject({ x: 10, y: 0, z: 5, isRapid: true })
    expect(points[2]).toMatchObject({ x: 10, z: -1, feedrate: 300, isRapid: false })
    expect(points[3]).toMatchObject({ x: 20, feedrate: 800 })
    expect(points[4]).toMatchObject({ x: 30, y: 10, isArc: true })
  })

  test("distance sums segment lengths; time comes from the modal feed", () => {
    const { distance, time } = measurePoints([
      { x: 0, y: 0, z: 0, feedrate: 600 },
      { x: 30, y: 40, z: 0, feedrate: 600 }
    ])
    expect(distance).toBe(50)
    expect(time).toBeCloseTo(5, 6)
  })

  test("storing G-code fills points, distance and time; the generator's own measure wins when given", () => {
    const state = withThree()
    const points = parseGCodeToPoints("G1 X0 Y0 F600\nG1 X30 Y40 F600")
    const stored = updateToolpathGCode(state, "tp-a", "G1 X0 Y0 F600\nG1 X30 Y40 F600", points)
    expect(stored.toolpaths[0]).toMatchObject({ distance: 50, gcode: "G1 X0 Y0 F600\nG1 X30 Y40 F600" })
    expect(stored.toolpaths[0]!.toolpathPoints.every(point => point.elementId === "el-a")).toBe(true)
    const measured = updateToolpathGCode(state, "tp-a", "G1 X1", points, { distance: 7, time: 9 })
    expect(measured.toolpaths[0]).toMatchObject({ distance: 7, estimatedTime: 9 })
  })
})

describe("combined program", () => {
  test("lists generated toolpaths in execution order, skipping empty ones", () => {
    let state = withThree()
    state = updateToolpathGCode(state, "tp-a", "G1 X1", [])
    state = updateToolpathGCode(state, "tp-c", "G1 X3", [])
    state = reorderToolpaths(state, ["tp-c", "tp-b", "tp-a"])
    const text = combineGCode(state.toolpaths, "STAMP")
    expect(text.startsWith("; Combined G-Code from Multiple Toolpaths\n; Generated: STAMP\n; Total toolpaths: 3")).toBe(true)
    expect(text.indexOf("G1 X3")).toBeLessThan(text.indexOf("G1 X1"))
    expect(text).toContain("; ===== Toolpath 1: c =====")
    expect(text).toContain("; ===== Toolpath 3: a =====")
    expect(text).not.toContain("Toolpath 2: b")
    expect(text).toContain(`; Tool: Ø${settings.toolDiameter}mm`)
    expect(text.endsWith("; ===== End of Combined G-Code =====\n")).toBe(true)
  })

  test("statistics and duration formatting", () => {
    let state = withThree()
    state = updateToolpathGCode(state, "tp-a", "G1 X1", [], { distance: 1500, time: 125 })
    expect(statistics(state.toolpaths)).toEqual({ totalToolpaths: 3, generatedToolpaths: 1, totalDistance: 1500, totalTime: 125 })
    expect(formatDuration(125)).toBe("2:05")
    expect(formatDuration(59.6)).toBe("0:60")
  })
})

describe("the store", () => {
  const memory = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) }, removeItem: (key: string) => { memory.delete(key) } }
  })

  test("actions drive the reducers and persist toolpaths + global settings (not the selection) under the legacy key", async () => {
    const { useMultiToolpathStore, STORAGE_KEY } = await import("../src/cam/store/multiToolpathStore.ts")
    const store = useMultiToolpathStore
    const first = store.getState().addToolpath("el-1", "circle", "Hole", settings)
    const second = store.getState().addToolpath("el-2", "rectangle", "Plate", settings)
    store.getState().selectToolpath(second)
    store.getState().moveToolpathUp(second)
    expect(store.getState().toolpaths.map(toolpath => toolpath.id)).toEqual([second, first])
    store.getState().updateToolpathGCode(first, "G1 X1 F100", [{ x: 0, y: 0, z: 0, feedrate: 100 }, { x: 1, y: 0, z: 0, feedrate: 100 }])
    expect(store.getState().getToolpathByElementId("el-1")?.distance).toBe(1)
    expect(store.getState().generateCombinedGCode()).toContain("G1 X1 F100")

    const saved = JSON.parse(memory.get(STORAGE_KEY)!)
    expect(saved.state.toolpaths).toHaveLength(2)
    expect(saved.state.globalSettings).toBeDefined()
    expect(saved.state.selectedToolpathIds).toBeUndefined()

    store.getState().clearAllToolpaths()
    expect(store.getState().toolpaths).toEqual([])
  })
})
