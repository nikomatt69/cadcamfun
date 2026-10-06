/**
 * Parity with the legacy `ToolpathGenerator` for the parts the first port left out: the generic contour of element
 * types without their own generator, layer-sliced composite printing (perimeters, infill, support notes), the
 * legacy TODO notes of the single-element printer and `G88`. Expected values are worked out by hand from the
 * legacy code; where the port deliberately differs the test says why.
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
import { elementZBounds, offsetPolygonSimple, outlinesAtLayer } from "../../src/cam/generator/printer-composite.ts"
import type { PrinterSettings } from "../../src/cam/generator/printer-base.ts"

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

// ---------------------------------------------------------------- 3D printer

const printerSettings = (patch: Partial<PrinterSettings> = {}): PrinterSettings => ({
  layerHeight: 0.2, printSpeed: 60, travelSpeed: 150, printTemperature: 200, bedTemperature: 60,
  extrusionWidth: 0.4, filamentDiameter: 1.75, infillDensity: 20, infillPattern: "grid", shellCount: 2, supportType: "minimal",
  ...patch
})

const print = (element: Record<string, any>, extras: Partial<typeof DEFAULT_PRINTER_EXTRAS> = {}, patch: Partial<ToolpathSettings> = {}) =>
  generateToolpath({
    settings: settings({ machineType: "3dprinter", operationType: "standard", toolType: "standard", ...patch }),
    geometry: geometry({ geometryType: "selected", selectedElements: [element] }),
    printer: { ...DEFAULT_PRINTER_EXTRAS, ...extras }
  }).response

const cubeComposite = { id: "box", type: "composite", elements: [{ type: "cube", x: 0, y: 0, z: 1, width: 4, height: 4, depth: 1 }] }

describe("composite printing: layers, perimeters, infill, support notes", () => {
  test("header, layer count and end marker", () => {
    // z 1 +- depth/2 -> 0.5..1.5, 5 layers of 0.2 mm; the layer top is `minZ + (n + 1) * layerHeight`.
    const { gcode } = print(cubeComposite)
    expect(gcode).toContain("; Start Composite Element: box\n; Estimated Layers: 5 (MinZ: 0.500, MaxZ: 1.500) X: -50.000..50.000 Y: -50.000..50.000\n")
    expect(gcode).toContain("\n; --- COMPOSITE LAYER 1 / 5 at Z=0.700 --- \n")
    expect(gcode).toContain("\n; --- COMPOSITE LAYER 5 / 5 at Z=1.500 --- \n")
    expect(gcode.trimEnd().endsWith("; End Composite Element: box")).toBe(true)
  })

  test("shells start from the second vertex and step inwards by the extrusion width", () => {
    const layer1 = print(cubeComposite).gcode.split("\n; --- COMPOSITE LAYER 2")[0]!
    // shell 0: vertex order is shifted by one (legacy), shell 1 is 0.4 mm inside.
    expect(layer1).toContain("; Layer Perimeters at Z=0.700\nG1 X2.000 Y-2.000 Z0.700 F9000\nG1 X2.000 Y2.000 Z0.700 E0.13304 F3600\n")
    expect(layer1).toContain("G1 X1.600 Y-1.600 Z0.700 F9000\nG1 X1.600 Y1.600 Z0.700 E")
  })

  test("only the 'lines' pattern fills; other patterns say so", () => {
    expect(print(cubeComposite).gcode).toContain("; Layer Infill at Z=0.700 (Pattern: grid)\n; WARNING: Infill pattern 'grid' not fully implemented for layer-wide infill.")
    const lines = print(cubeComposite, { infillPattern: "lines", infillDensity: 50 }).gcode
    expect(lines).toContain("; Layer Infill at Z=0.700 (Pattern: lines)\nG1 X-1.200 Y-1.200 Z0.700 F9000\nG1 X1.200 Y-1.200 Z0.700 E")
    // serpentine: the second line runs back, the spacing is width / density = 0.8 mm
    expect(lines).toContain("G1 X1.200 Y-0.400 Z0.700 F9000\nG1 X-1.200 Y-0.400 Z0.700 E")
  })

  test("infill stays inside the inner boundary and E never decreases", () => {
    const { gcode } = print({ ...cubeComposite, elements: [{ type: "cylinder", x: 3, y: -2, z: 1, radius: 5, height: 1 }] }, { infillPattern: "lines", infillDensity: 30 })
    const infill = gcode.split("; Layer Infill").slice(1).map(block => block.split("\n; ")[0]!)
    expect(infill.length).toBeGreaterThan(0)
    for (const block of infill) {
      for (const m of block.matchAll(/G1 X(-?[\d.]+) Y(-?[\d.]+)/g)) {
        expect(Math.hypot(Number(m[1]) - 3, Number(m[2]) + 2)).toBeLessThanOrEqual(5 - 0.8 + 0.05)
      }
    }
    const e = [...gcode.matchAll(/ E(\d+\.\d+) F/g)].map(m => Number(m[1]))
    for (let i = 1; i < e.length; i++) expect(e[i]!).toBeGreaterThanOrEqual(e[i - 1]!)
  })

  test("a torus keeps its hole free of infill", () => {
    const { gcode } = print({ type: "composite", elements: [{ type: "torus", x: 0, y: 0, z: 3, radius: 10, tubeRadius: 2 }] }, { infillPattern: "lines", infillDensity: 40 })
    const block = gcode.split("; Layer Infill at Z=3.000")[1]
    expect(block).toBeDefined()
    const infill = block!.split("\n; ")[0]!
    const radii = [...infill.matchAll(/G1 X(-?[\d.]+) Y(-?[\d.]+)/g)].map(m => Math.hypot(Number(m[1]), Number(m[2])))
    expect(radii.length).toBeGreaterThan(4)
    for (const r of radii) expect(r).toBeGreaterThan(8.5)
  })

  test("support notes appear from the second layer, unless supports are off", () => {
    const withSupport = print(cubeComposite).gcode
    expect(withSupport.split("; Layer Support (Type: minimal)").length - 1).toBe(4)
    expect(withSupport.split("COMPOSITE LAYER 1 /")[1]!.split("COMPOSITE LAYER 2 /")[0]).not.toContain("Layer Support")
    expect(print(cubeComposite, { supportType: "none" }).gcode).not.toContain("Layer Support")
  })

  test("ellipsoids only widen the Z range (legacy: no outline), lines print nothing and say so", () => {
    const ellipsoid = print({ type: "composite", elements: [{ type: "ellipsoid", x: 0, y: 0, z: 2, radiusX: 3, radiusY: 2, radiusZ: 1 }] })
    expect(ellipsoid.gcode).toContain("; Estimated Layers: 10 (MinZ: 1.000, MaxZ: 3.000)")
    expect(ellipsoid.gcode).not.toContain("; Layer Perimeters")
    const line = print({ type: "line", x1: 0, y1: 0, x2: 10, y2: 0, z: 1 })
    expect(line.gcode).toContain("; Start Composite Element: line-wrapper")
    expect(line.warnings).toContain("a line element has no printable area - nothing was extruded")
  })

  test("without usable Z bounds the root element gives a rough estimate", () => {
    const { gcode } = print({ type: "composite", height: 1, elements: [{ type: "wormhole" }] })
    expect(gcode).toContain("; Estimated Layers: 10 (MinZ: -1.000, MaxZ: 1.000) X: -1.000..1.000 Y: -1.000..1.000")
  })

  test("zero shells with infill uses the outline itself", () => {
    const { gcode } = print(cubeComposite, { infillPattern: "lines", infillDensity: 100, shellCount: 1 } as never)
    expect(gcode).toContain("; Layer Infill at Z=0.700 (Pattern: lines)")
  })
})

describe("composite helpers", () => {
  test("Z bounds follow the port's cube convention (depth is Z)", () => {
    expect(elementZBounds({ type: "cube", z: 1, width: 9, height: 9, depth: 2 })).toEqual({ minZ: 0, maxZ: 2 })
    expect(elementZBounds({ type: "cylinder", z: 1, radius: 1, height: 4 })).toEqual({ minZ: -1, maxZ: 3 })
    expect(elementZBounds({ type: "torus", z: 0, radius: 5, tubeRadius: 1 })).toEqual({ minZ: -1, maxZ: 1 })
    expect(elementZBounds({ type: "line", z: 2 })).toEqual({ minZ: 1.9, maxZ: 2.1 })
    expect(elementZBounds({ type: "wormhole", z: 1 })).toBeNull()
    expect(elementZBounds({ type: "composite", elements: [{ type: "sphere", z: 0, radius: 1 }, { type: "sphere", z: 5, radius: 1 }] })).toEqual({ minZ: -1, maxZ: 6 })
  })

  test("outlines are only produced where the primitive exists", () => {
    const s = printerSettings()
    const cube = { type: "cube", x: 0, y: 0, z: 1, width: 4, height: 2, depth: 1 }
    expect(outlinesAtLayer(cube, 0.4, s)).toHaveLength(0)
    expect(outlinesAtLayer(cube, 0.7, s)[0]).toEqual([{ x: -2, y: -1 }, { x: 2, y: -1 }, { x: 2, y: 1 }, { x: -2, y: 1 }])
    expect(outlinesAtLayer({ type: "sphere", x: 0, y: 0, z: 0, radius: 2 }, 2.5, s)).toHaveLength(0)
    // a torus slice through the tube centre has an outer ring and an (opposite-wound) hole
    expect(outlinesAtLayer({ type: "torus", x: 0, y: 0, z: 0, radius: 10, tubeRadius: 2 }, 0, s)).toHaveLength(2)
  })

  test("negative offsets move into the material, for rings and for holes", () => {
    const square = [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }]
    for (const p of offsetPolygonSimple(square, -0.4)!) expect(Math.max(Math.abs(p.x), Math.abs(p.y))).toBeCloseTo(1.6, 9)
    const hole = [{ x: 3, y: 0 }, { x: 0, y: -3 }, { x: -3, y: 0 }, { x: 0, y: 3 }] // clockwise
    for (const p of offsetPolygonSimple(hole, -0.4)!) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(3)
    expect(offsetPolygonSimple(square.slice(0, 2), -1)).toBeNull()
  })
})

describe("single-element printing keeps the legacy notes", () => {
  test("shells only, with a TODO note per layer for infill and supports", () => {
    const { gcode } = print({ type: "cube", x: 0, y: 0, z: 1, width: 4, height: 4, depth: 1 })
    expect(gcode).toContain("; TODO: Add infill for layer 1\n; TODO: Check and add support for layer 1\n")
    expect(print({ type: "torus", x: 0, y: 0, z: 5, radius: 10, tubeRadius: 2 }).gcode).toContain("; TODO: Add torus infill (ring shape) for layer 1\n")
    expect(print({ type: "sphere", x: 0, y: 0, z: 5, radius: 2 }).gcode).toContain("; TODO: Check and add support for layer")
  })

  test("unsupported types print their bounding box with the legacy warning", () => {
    const { gcode } = print({ type: "wormhole", x: 0, y: 0, z: 1, width: 4, height: 4, depth: 1 })
    expect(gcode).toContain("; WARNING: Unsupported element type 'wormhole' for direct 3D printing.\n; Approximating with bounding box.\n")
  })
})

describe("fixed cycles", () => {
  test("G88 is recognised as a (custom) cycle like the legacy parser did", () => {
    expect(isFixedCycle("G88 X1 Y1 Z-5 R2 F100")).toBe(true)
    expect(parseFixedCycle("G88 X1 Y1 Z-5 R2 F100")?.type).toBe("custom")
  })
})
