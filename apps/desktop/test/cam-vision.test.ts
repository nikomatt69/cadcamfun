/**
 * The CAM's visual capture: the assistant's vision tool must see the CAM whatever tab the editor
 * shows. The CAM opens on the G-code, not on the 3D preview, so the program sheet is what stands
 * in for the viewport there; the preview's own capture (the rendered toolpath) wins while it is on
 * screen.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { bootLiveApp } from "./helpers/live-app.ts"
import { captureVisibleViewport } from "../src/features/ai/lib/viewport-capture.ts"
import { programSheetLayout, drawProgramSheet, programSheetPaths, SHEET_MAX_LINES, type SheetContext } from "../src/features/cam/lib/program-sheet.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
/** Every text the sheet drew; the recording double keeps it. */
const drawn: string[] = []
/** Every point the sheet stroked; the recording double keeps it. */
const stroked: number[] = []

beforeAll(async () => {
  app = await bootLiveApp()
  // happy-dom draws no canvas: the sheet is drawn on a recording double, and the WebGL
  // context stays absent so the preview keeps its "no WebGL" path.
  const proto = Object.getPrototypeOf(document.createElement("canvas")) as {
    getContext: (type: string) => unknown
    toDataURL: (type?: string) => string
  }
  proto.getContext = function (type: string): unknown {
    if (type !== "2d") return null
    return {
      fillStyle: "", strokeStyle: "", font: "", textAlign: "", textBaseline: "", lineWidth: 1,
      fillRect: () => undefined,
      fillText: (text: string) => { drawn.push(text) },
      measureText: (text: string) => ({ width: text.length * 8 }),
      drawImage: () => undefined,
      beginPath: () => undefined,
      moveTo: () => { stroked.push(0) },
      lineTo: () => { stroked.push(1) },
      stroke: () => undefined
    }
  }
  proto.toDataURL = () => "data:image/png;base64,iVBORw0KGgo="
})
afterAll(async () => { await app.dispose() })

const byText = (tag: string, text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text)

const type = async (value: string): Promise<void> => {
  const editor = await app.wait(() => document.querySelector<HTMLTextAreaElement>("textarea"), 30000)
  editor.value = value
  editor.dispatchEvent(new window.Event("input", { bubbles: true }))
  await app.wait(() => (document.querySelector<HTMLTextAreaElement>("textarea")?.value === value ? true : undefined), 30000)
}

describe("the CAM visual capture", () => {
  test("the program sheet is the capture while the editor shows the G-code", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await type("G21\nG90\nG0 X0 Y0\nG1 X10 Y0 F200\nG1 X10 Y10\nM30")
      drawn.length = 0
      const capture = captureVisibleViewport("cam")
      expect(capture.kind).toBe("sheet")
      expect(capture.data.length).toBeGreaterThan(0)
      expect(capture.width).toBeGreaterThan(0)
      expect(capture.height).toBeGreaterThan(0)
      // The sheet is a picture of the program: it carries the G-code the editor shows.
      expect(drawn.join("\n")).toContain("G1 X10 Y0 F200")
      expect(drawn.join("\n")).toContain("M30")
    } finally { dispose() }
  }, 60000)

  test("the sheet is still the capture on the toolpath tab", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await type("G21\nG0 X0 Y0\nM30")
      const toolpath = await app.wait(() => [...document.querySelectorAll<HTMLElement>(".workstation-workspace-tabs button")].find((el) => el.textContent?.trim() === "Toolpath"), 30000)
      toolpath.click()
      await new Promise((resolve) => setTimeout(resolve, 300))
      drawn.length = 0
      const capture = captureVisibleViewport("cam")
      expect(capture.kind).toBe("sheet")
      expect(drawn.join("\n")).toContain("G0 X0 Y0")
    } finally {
      // The CAM store is a module-level singleton: leave the tab where the page opens it.
      const { useCamStore } = await import("../src/features/cam/store/camStore.ts")
      useCamStore.getState().setActiveTab("editor")
      dispose()
    }
  }, 60000)

  test("a mode with nothing on screen has no capture", () => {
    expect(() => captureVisibleViewport("cad")).toThrow(/Open the CAD viewport/)
  })
})

describe("the program sheet", () => {
  test("the listing is numbered, bounded and says what it leaves out", () => {
    const gcode = Array.from({ length: SHEET_MAX_LINES + 20 }, (_, index) => `G0 X${index}`).join("\n")
    const layout = programSheetLayout(gcode, { machine: "mill", name: "Bracket", toolpaths: [{ id: "t1", name: "Contour", toolId: "T1", moves: 12 }], moves: 12, durationSeconds: 42 })
    expect(layout.lines).toHaveLength(SHEET_MAX_LINES)
    expect(layout.lines[0]).toEqual({ number: 1, text: "G0 X0" })
    expect(layout.totalLines).toBe(SHEET_MAX_LINES + 20)
    expect(layout.omitted).toBe(20)
    expect(layout.header.join("\n")).toContain("Machine: mill")
    expect(layout.header.join("\n")).toContain("Contour [T1]")
    expect(layout.header.join("\n")).toContain("Moves: 12")
  })

  test("the sheet draws the program text", () => {
    const drawn: string[] = []
    const layout = programSheetLayout("G21\nG1 X1 Y1 F100", { machine: "lathe" })
    drawProgramSheet(layout, {
      fillStyle: "", strokeStyle: "", font: "", textAlign: "", textBaseline: "", lineWidth: 1,
      fillRect: () => undefined,
      fillText: (text: string) => { drawn.push(text) },
      measureText: (text: string) => ({ width: text.length * 8 }),
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined
    })
    expect(drawn.join("\n")).toContain("CADCAMFUN — CAM program")
    expect(drawn.join("\n")).toContain("Machine: lathe")
    expect(drawn.join("\n")).toContain("G1 X1 Y1 F100")
  })

  test("an empty program says so instead of drawing nothing", () => {
    const layout = programSheetLayout("")
    expect(layout.lines).toHaveLength(0)
    expect(layout.totalLines).toBe(0)
  })

  test("the toolpath is drawn in the machine's own cutting plane", () => {
    const program = cam.makeProgram("Bracket", [{
      id: "t1",
      name: "Contour",
      toolId: "T1",
      spindleRpm: 8000,
      coolant: "flood",
      moves: [
        { _tag: "Rapid", to: { x: -5, y: -5, z: 5 } },
        { _tag: "Linear", to: { x: 10, y: 0, z: -1 }, feed: 400 },
        { _tag: "Linear", to: { x: 10, y: 10, z: -1 }, feed: 400 }
      ]
    }])
    const paths = programSheetPaths(program, "mill")
    expect(paths).toHaveLength(1)
    // The rapid and the cut are two runs, so the sheet can draw them apart.
    expect(paths[0]!.segments.map((segment) => segment.rapid)).toEqual([true, false])
    expect(paths[0]!.segments[1]!.points).toEqual([
      { x: -5, y: -5 }, { x: 10, y: 0 }, { x: 10, y: 10 }
    ])

    const strokes: number[] = []
    const context: SheetContext = {
      fillStyle: "", strokeStyle: "", font: "", textAlign: "", textBaseline: "", lineWidth: 1,
      fillRect: () => undefined,
      fillText: () => undefined,
      measureText: (text: string) => ({ width: text.length * 8 }),
      beginPath: () => undefined,
      moveTo: () => { strokes.push(0) },
      lineTo: () => { strokes.push(1) },
      stroke: () => undefined
    }
    const layout = programSheetLayout("G0 X10 Y0\nG1 X10 Y10 F400", { machine: "mill", paths })
    expect(layout.view).toBeDefined()
    drawProgramSheet(layout, context)
    // Both runs are drawn: the rapid's two points and the cut's three.
    expect(strokes.filter((kind) => kind === 0)).toHaveLength(2)
    expect(strokes.filter((kind) => kind === 1)).toHaveLength(3)
  })

  test("a lathe program is drawn in the profile plane", () => {
    const program = cam.makeProgram("Shaft", [{
      id: "t1",
      name: "Turn",
      toolId: "T1",
      spindleRpm: 3000,
      coolant: "flood",
      moves: [{ _tag: "Linear", to: { x: 50, y: 0, z: -20 }, feed: 0.2 }]
    }])
    const paths = programSheetPaths(program, "lathe")
    // The lathe's X is the diameter and Z the axial direction: the profile plane, not XY.
    expect(paths[0]!.segments[0]!.points[1]).toEqual({ x: 50, y: -20 })
  })
})
