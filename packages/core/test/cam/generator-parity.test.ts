/**
 * Parity with the legacy `ToolpathGenerator` for the parts the first port left out: the generic contour of element
 * types without their own generator and `G88`. Expected values are worked out by hand from the legacy code; where the
 * port deliberately differs the test says why. (The 3D printer is a real slicer now: `print.test.ts`.)
 */
import { describe, expect, test } from "bun:test"
import {
  DEFAULT_GEOMETRY,
  DEFAULT_PRINTER_EXTRAS,
  DEFAULT_SETTINGS,
  generateToolpath,
  isFixedCycle,
  parseFixedCycle,
  type GeometryInput,
  type ToolpathSettings
} from "../../src/cam/generator/index.ts"

const settings = (patch: Partial<ToolpathSettings> = {}): ToolpathSettings => ({ ...DEFAULT_SETTINGS, ...patch })
const geometry = (patch: Partial<GeometryInput> = {}): GeometryInput => ({ ...DEFAULT_GEOMETRY, ...patch })

const mill = (element: Record<string, any>, patch: Partial<ToolpathSettings> = {}): string =>
  generateToolpath({ settings: settings({ depth: 2, ...patch }), geometry: geometry({ geometryType: "selected", selectedElements: [element] }), printer: DEFAULT_PRINTER_EXTRAS }).response.gcode

describe("generic contour for element types without a generator (legacy generateDefaultToolpath)", () => {
  test("a type with no size becomes a 10 x 10 mm box, tool offset outside by default", () => {
    // width = height = depth = 10 (legacy extractGenericGeometry); outside offset adds the tool Ø (6) -> 16 mm,
    // so the start is at -8, and the rapid sits 5 mm above the level (legacy: above the *current* level).
    const text = mill({ type: "wormhole" })
    expect(text).toContain("; Generic rectangular contour: wormhole at (0, 0, 0), size 10x10mm")
    expect(text).toContain("; Z Level: -1.000\nG0 X-8.000 Y-8.000 Z4.000 ; Move above start position\nG1 Z-1.000 F300 ; Plunge to cutting depth\n")
    expect(text).toContain("G1 X8.000 Y-8.000 F800 ; Corner 1\nG1 X8.000 Y8.000 F800 ; Corner 2\nG1 X-8.000 Y8.000 F800 ; Corner 3\nG1 X-8.000 Y-8.000 F800 ; Corner 4\n")
    expect(text).toContain("; Z Level: -2.000")
    expect(text).not.toContain("; Z Level: -3.000")
  })

  test("width / height / depth, centred on the element, limited by the element's own depth", () => {
    const text = mill({ type: "spline", x: 5, y: 5, z: 0, width: 20, height: 10, depth: 1 }, { offset: "center", depth: 4 })
    expect(text).toContain("; Generic rectangular contour: spline at (5, 5, 0), size 20x10mm")
    expect(text).toContain("G0 X-5.000 Y0.000 Z4.000")
    expect(text.match(/; Z Level:/g)).toHaveLength(1)
  })

  test("`size` and `diameter` stand in for width and radius", () => {
    expect(mill({ type: "plate", size: 30 }, { offset: "center" })).toContain("size 30x30mm")
    expect(mill({ type: "washer", diameter: 10 }, { offset: "center" })).toContain("size 10x10mm")
  })

  test("only circles and sphere-like types are cut as a circle; other radii give a box of 2r", () => {
    expect(mill({ type: "spheroid", radius: 4 }, { offset: "center" })).toContain("; Generic rectangular contour: spheroid at (0, 0, 0), size 8x8mm")
    const text = mill({ type: "sphere-shell", radius: 4 }, { offset: "center", direction: "climb" })
    expect(text).toContain("; Generic circular contour: sphere-shell at (0, 0, 0), radius 4mm")
    expect(text).toContain("G3 X4.000 Y0.000 I-4.000 J0 F800")
  })

  test("an inside offset larger than the part is reported, not emitted as NaN", () => {
    const text = mill({ type: "wormhole", width: 2, height: 2 }, { offset: "inside", toolDiameter: 6 })
    expect(text).toContain("; Cannot generate toolpath: dimensions (2x2mm) too small for tool diameter (6mm) with inside offset")
    expect(text).not.toContain("NaN")
  })

  test("a zero side is an invalid bounding box", () => {
    expect(mill({ type: "wormhole", width: 5, height: 0, depth: 3 })).toContain("; Error: Invalid bounding box dimensions")
  })

  test("sweep-like members of a container keep the legacy 'not yet implemented' notes", () => {
    const text = mill({ type: "composite", elements: [{ type: "tube", path: [], radius: 2 }, { type: "grid", size: 10, divisions: 2, plane: "xy" }, { type: "circle", x: 0, y: 0, radius: 5 }] })
    expect(text).toContain("; Tube element: 0 path points, radius=2\n; Toolpath generation for tube is not yet implemented")
    expect(text).toContain("; Grid element: size=10, divisions=2, plane=xy\n; Toolpath generation for grid is not yet implemented")
    expect(text).toContain("; Circle: center (0, 0), radius 5mm")
  })

  test("a selected tube (not inside a container) is cut as a generic box like any other unknown type", () => {
    expect(mill({ type: "tube", path: [], radius: 2 })).toContain("; Generic rectangular contour: tube at (0, 0, 0), size 4x4mm")
  })
})

describe("fixed cycles", () => {
  test("G88 is recognised as a (custom) cycle like the legacy parser did", () => {
    expect(isFixedCycle("G88 X1 Y1 Z-5 R2 F100")).toBe(true)
    expect(parseFixedCycle("G88 X1 Y1 Z-5 R2 F100")?.type).toBe("custom")
  })
})
