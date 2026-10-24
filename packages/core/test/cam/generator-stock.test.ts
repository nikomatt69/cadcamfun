import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import {
  DEFAULT_GEOMETRY,
  DEFAULT_PRINTER_EXTRAS,
  DEFAULT_SETTINGS,
  GenerateRequestSchema,
  ParseRequestSchema,
  adjustSettingsForElement,
  alignToStock,
  analyseGcode,
  calculateBoundingBox,
  calculateElementDimensions,
  elementBounds,
  elementOutline,
  flattenElements,
  generateToolpath,
  getDrillingPoints,
  getElementDepth,
  orderForMachining,
  outsideStock,
  stockFromElement,
  suggestFor,
  suggestMachiningParameters,
  type CadElement,
  type GeometryInput,
  type Stock,
  type ToolpathSettings
} from "../../src/cam/generator/index.ts"

const settings = (patch: Partial<ToolpathSettings> = {}): ToolpathSettings => ({ ...DEFAULT_SETTINGS, ...patch })
const stock = (patch: Partial<Stock> = {}): Stock => ({ width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 1, ...patch })
const selected = (elements: CadElement[], extra: Partial<GeometryInput> = {}): GeometryInput =>
  ({ ...DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: elements, ...extra })
const run = (s: ToolpathSettings, g: GeometryInput) => generateToolpath({ settings: s, geometry: g, printer: DEFAULT_PRINTER_EXTRAS }).response
const zs = (gcode: string): number[] => [...gcode.matchAll(/G1 Z(-?\d+\.\d+)/g)].map(m => Number(m[1]))

describe("request schema", () => {
  test("an empty request decodes to the legacy defaults", () => {
    const request = Schema.decodeUnknownSync(GenerateRequestSchema)({})
    expect(request.settings).toEqual(DEFAULT_SETTINGS)
    expect(request.geometry.geometryType).toBe("rectangle")
    expect(request.printer.infillDensity).toBe(20)
  })

  test("explicit zeros survive; invalid numbers are rejected", () => {
    const ok = Schema.decodeUnknownSync(GenerateRequestSchema)({ settings: { originX: 0, finishingAllowance: 0, bedTemperature: 0 } })
    expect(ok.settings.originX).toBe(0)
    expect(ok.settings.finishingAllowance).toBe(0)
    expect(ok.settings.bedTemperature).toBe(0)
    expect(() => Schema.decodeUnknownSync(GenerateRequestSchema)({ settings: { depth: 0 } })).toThrow()
    expect(() => Schema.decodeUnknownSync(GenerateRequestSchema)({ settings: { stepdown: -1 } })).toThrow()
    expect(() => Schema.decodeUnknownSync(GenerateRequestSchema)({ settings: { stepover: 150 } })).toThrow()
    expect(() => Schema.decodeUnknownSync(GenerateRequestSchema)({ settings: { operationType: "teleport" } })).toThrow()
    expect(() => Schema.decodeUnknownSync(ParseRequestSchema)({})).toThrow()
  })
})

describe("stock-relative machining", () => {
  const cube: CadElement = { id: "c1", type: "cube", x: 0, y: 0, z: 50, width: 40, height: 20, depth: 10 }

  test("the stock is described in the header", () => {
    const { gcode } = run(settings(), selected([cube], { stock: stock() }))
    expect(gcode).toContain("; Stock: 100.000 x 60.000 x 20.000 mm, top Z0.000, allowance 1.000mm")
    expect(gcode).toContain("; Machining starts at the stock top")
  })

  test("an element standing anywhere in Z is cut from the stock top", () => {
    const { gcode } = run(settings({ depth: 3, stepdown: 1 }), selected([cube], { stock: stock() }))
    expect(zs(gcode)).toEqual([-1, -2, -3])
    // Without a stock the legacy behaviour keeps the element's own Z.
    const free = run(settings({ depth: 3, stepdown: 1 }), selected([cube]))
    expect(zs(free.gcode)[0]).toBeCloseTo(54, 3)
  })

  test("depth is limited to the stock thickness and says so", () => {
    const { gcode } = run(settings({ depth: 50, stepdown: 5 }), selected([{ type: "circle", id: "c", x: 0, y: 0, radius: 10 }], { stock: stock({ depth: 12 }) }))
    expect(gcode).toContain("; Warning: Depth 50.000mm limited to the 12.000mm of stock")
    expect(Math.min(...zs(gcode))).toBeCloseTo(-12, 6)
  })

  test("an element lower in the stock only has the material under it", () => {
    const high: CadElement = { id: "a", type: "cylinder", x: 0, y: 0, z: 10, radius: 5, height: 20 } // top 20
    const low: CadElement = { id: "b", type: "cylinder", x: 20, y: 0, z: 0, radius: 5, height: 10 } // top 5, 15 below
    const { gcode } = run(settings({ depth: 20, stepdown: 5 }), selected([low, high], { stock: stock({ depth: 20 }) }))
    expect(gcode).toContain("; Element 1/2: cylinder (a)")
    expect(gcode).toContain("; Element 2/2: cylinder (b)")
    expect(gcode).toContain("limited to the 5.000mm of stock")
  })

  test("elements outside the stock rectangle are flagged", () => {
    const { gcode, warnings } = run(settings({ depth: 1 }), selected([{ type: "circle", id: "o", x: 80, y: 0, radius: 10 }], { stock: stock() }))
    expect(gcode).toContain("; Warning: element leaves the stock rectangle")
    expect(warnings).toContain("element leaves the stock rectangle")
  })

  test("the machine origin follows the origin section, relative to the stock", () => {
    const circle: CadElement = { type: "circle", x: 60, y: 40, radius: 5 }
    const startOf = (patch: Partial<ToolpathSettings>, st: Stock) => {
      const { gcode } = run(settings({ depth: 1, offset: "center", ...patch }), selected([circle], { stock: st }))
      return gcode.split("\n").find(l => l.includes("Move to start position"))
    }
    // stock centred at (50, 30): the circle is 10 right and 10 up of the stock centre
    expect(startOf({ originType: "workpiece-center" }, stock({ x: 50, y: 30 }))).toBe("G0 X15.000 Y10.000 ; Move to start position")
    // corner origin: stock spans (0..100, 0..60) in machine coordinates
    expect(startOf({ originType: "workpiece-corner" }, stock({ x: 50, y: 30 }))).toBe("G0 X65.000 Y40.000 ; Move to start position")
    expect(startOf({ originType: "custom", originX: 5, originY: -5 }, stock({ x: 50, y: 30 }))).toBe("G0 X20.000 Y5.000 ; Move to start position")
  })

  test("rectangle / circle / polygon also respect the stock thickness", () => {
    const { gcode } = run(settings({ depth: 30, stepdown: 10 }), { ...DEFAULT_GEOMETRY, stock: stock({ depth: 20 }) })
    expect(Math.min(...zs(gcode))).toBeCloseTo(-20, 6)
  })

  test("alignToStock puts the top face on the stock top", () => {
    expect(alignToStock({ type: "sphere", x: 0, y: 0, z: 30, radius: 10 }, stock({ topZ: 0 }))["z"]).toBe(-10)
    expect(alignToStock({ type: "sphere", x: 0, y: 0, z: 30, radius: 10 }, undefined)["z"]).toBe(30)
  })
})

describe("operations decide what an element becomes", () => {
  const rect: CadElement = { id: "r", type: "rectangle", x: 0, y: 0, width: 40, height: 20 }
  const st = stock()

  test("contour follows the outline", () => {
    const { gcode } = run(settings({ operationType: "contour", depth: 1, offset: "center" }), selected([rect], { stock: st }))
    expect(gcode).toContain("; Rectangle: center (0, 0), width 40mm, height 20mm")
  })

  test("pocket clears the inside with the tool centre kept inside the shape", () => {
    const { gcode } = run(settings({ operationType: "pocket", depth: 2, stepdown: 1, toolDiameter: 4, stepover: 50 }), selected([rect], { stock: st }))
    expect(gcode).toContain("; Pocket: rectangle at (0.000, 0.000) - stepover 50% (2.00mm)")
    const result = interpretGcode(gcode)
    const xs = result.segments.flatMap(seg => (seg.kind === "linear" ? [seg.from.x, seg.to.x] : []))
    // tool radius 2: centre never closer than 2mm to the 40mm-wide edge
    expect(Math.max(...xs)).toBeLessThanOrEqual(18 + 1e-6)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-18 - 1e-6)
    expect(result.minZ).toBeCloseTo(-2, 6)
    expect(gcode).not.toContain("NaN")
  })

  test("pocket rings grow without gaps wider than the stepover", () => {
    const { gcode } = run(settings({ operationType: "pocket", depth: 1, toolDiameter: 4, stepover: 50 }), selected([{ type: "circle", id: "c", x: 0, y: 0, radius: 14 }], { stock: st }))
    const radii = interpretGcode(gcode).segments.flatMap(seg => (seg.kind === "arc" ? [seg.radiusStart] : []))
    expect(radii.length).toBeGreaterThan(2)
    for (let i = 1; i < radii.length; i++) expect(radii[i]! - radii[i - 1]!).toBeLessThanOrEqual(2 + 1e-6)
    expect(Math.max(...radii)).toBeCloseTo(12, 6) // 14 - tool radius 2
  })

  test("a shape smaller than the tool cannot be pocketed", () => {
    const { gcode } = run(settings({ operationType: "pocket", toolDiameter: 10 }), selected([{ type: "circle", x: 0, y: 0, radius: 3 }], { stock: st }))
    expect(gcode).toContain("Cannot pocket: shape is smaller than the tool")
  })

  test("pocket on a line falls back to the contour with a note", () => {
    const { gcode } = run(settings({ operationType: "pocket", depth: 1 }), selected([{ type: "line", x1: 0, y1: 0, x2: 10, y2: 0 }], { stock: st }))
    expect(gcode).toContain("Pocket is not available for 'line'")
    expect(gcode).toContain("; Line: from")
  })

  test("drill emits a canned cycle per point, nearest first, cancelled with G80", () => {
    const plate: CadElement = { id: "p", type: "component", x: 0, y: 0, z: 0, elements: [
      { type: "circle", x: 30, y: 0, z: 0, radius: 2 }, { type: "circle", x: 10, y: 0, z: 0, radius: 2 }, { type: "circle", x: 20, y: 0, z: 0, radius: 2 }
    ] }
    const { gcode, cycles } = run(settings({ operationType: "drill", depth: 8, stepdown: 4, toolDiameter: 3 }), selected([plate], { stock: st }))
    const holes = gcode.split("\n").filter(l => l.startsWith("G83"))
    expect(holes.map(l => l.match(/X(\S+)/)![1])).toEqual(["10.000", "20.000", "30.000"])
    expect(holes[0]).toContain("Z-8.000 R2.000 Q4.000 F300")
    expect(gcode).toContain("G80 ; Cancel fixed cycle")
    expect(cycles).toHaveLength(3)
    expect(interpretGcode(gcode).errors).toEqual([])
  })

  test("a through drill that fits in one peck uses G81", () => {
    const { gcode } = run(settings({ operationType: "drill", depth: 3, stepdown: 5 }), selected([{ type: "circle", x: 5, y: 5, radius: 3 }], { stock: st }))
    expect(gcode).toContain("G81 X5.000 Y5.000 Z-3.000 R2.000 F300")
  })

  test("a hole smaller than the tool is flagged", () => {
    const { gcode } = run(settings({ operationType: "drill", toolDiameter: 8 }), selected([{ type: "circle", x: 0, y: 0, radius: 2 }], { stock: st }))
    expect(gcode).toContain("tool Ø8mm is larger than the hole Ø4.000mm")
  })

  test("engrave follows the outline at one shallow depth", () => {
    const { gcode } = run(settings({ operationType: "engrave", depth: 5, stepdown: 0.5 }), selected([rect], { stock: st }))
    expect(zs(gcode)).toEqual([-0.5])
    expect(gcode).toContain("; Engrave: rectangle outline at constant depth -0.500mm")
  })

  test("an open path is engraved there and back", () => {
    const { gcode } = run(settings({ operationType: "engrave", stepdown: 0.5 }), selected([{ type: "line", x1: 0, y1: 0, x2: 10, y2: 0 }], { stock: st }))
    expect(gcode).toContain("; Return point 1")
  })

  test("threading an element that is not round is refused, with no contour cut in its place", () => {
    const { gcode } = run(settings({ operationType: "threading", depth: 1 }), selected([rect], { stock: st }))
    expect(gcode).toContain("thread milling needs a circle or a cylinder")
    expect(gcode).not.toContain("following the contour instead")
    expect(gcode).not.toMatch(/^G[123] /m)
  })

  test("several elements run top level first, inner before outer", () => {
    const base: CadElement = { id: "base", type: "cube", x: 0, y: 0, z: 5, width: 80, height: 40, depth: 10 } // top 10
    const boss: CadElement = { id: "boss", type: "cylinder", x: 0, y: 0, z: 15, radius: 5, height: 10 } // top 20
    const hole: CadElement = { id: "hole", type: "cylinder", x: 10, y: 0, z: 15, radius: 3, height: 10 } // top 20, off centre
    const order = orderForMachining([base, hole, boss]).map(e => e["id"])
    expect(order).toEqual(["boss", "hole", "base"])
  })

  test("same selection and settings give byte-identical output", () => {
    const a = run(settings({ operationType: "pocket" }), selected([rect], { stock: st })).gcode
    expect(run(settings({ operationType: "pocket" }), selected([rect], { stock: st })).gcode).toBe(a)
  })
})

describe("element helpers", () => {
  test("bounds follow the CAD scene axes", () => {
    const b = elementBounds({ type: "cube", x: 10, y: 20, z: 30, width: 4, height: 6, depth: 8 })
    expect(b.min).toEqual({ x: 8, y: 17, z: 26 })
    expect(b.max).toEqual({ x: 12, y: 23, z: 34 })
    expect(elementBounds({ type: "hemisphere", x: 0, y: 0, z: 0, radius: 5, direction: "down" }).max.z).toBe(0)
    // A capsule lies along its `direction` (default y, as the editor draws it).
    expect(elementBounds({ type: "capsule", x: 0, y: 0, z: 0, radius: 2, height: 10, direction: "z" }).dimensions.depth).toBe(14)
    expect(elementBounds({ type: "capsule", x: 0, y: 0, z: 0, radius: 2, height: 10 }).dimensions.height).toBe(14)
    expect(elementBounds({ type: "capsule", x: 0, y: 0, z: 0, radius: 2, height: 10, direction: "x" }).dimensions.width).toBe(14)
    expect(elementBounds({ type: "torus", x: 0, y: 0, z: 0, radius: 10, tubeRadius: 2 }).dimensions.width).toBe(24)
  })

  test("component bounds are the union of the children", () => {
    const b = calculateBoundingBox({ type: "component", x: 100, y: 0, z: 0, elements: [{ type: "circle", x: 0, y: 0, radius: 5 }, { type: "circle", x: 20, y: 0, radius: 5 }] })
    expect(b.min.x).toBe(95)
    expect(b.max.x).toBe(125)
    expect(flattenElements([{ type: "group", x: 10, y: 0, z: 0, elements: [{ type: "circle", x: 1, y: 2, radius: 1 }] }])[0]).toMatchObject({ x: 11, y: 2 })
  })

  test("depth and suggestions", () => {
    expect(getElementDepth({ type: "cube", depth: 12 })).toBe(12)
    expect(getElementDepth({ type: "sphere", radius: 4 })).toBe(8)
    expect(getElementDepth({ type: "cylinder", radius: 4, height: 7 })).toBe(7)
    expect(getElementDepth({ type: "circle", radius: 4 })).toBe(5)
    expect(suggestMachiningParameters({ type: "rectangle", width: 150, height: 20 })).toMatchObject({ stepdown: 2, operationType: "pocket", depth: 5 })
    expect(suggestMachiningParameters({ type: "circle", radius: 10 })).toMatchObject({ stepdown: 0.5, operationType: "contour" })
    expect(suggestMachiningParameters({ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }).operationType).toBe("profile")
  })

  test("adjustSettingsForElement keeps a manually set depth and flags a tiny element", () => {
    const base = settings({ depth: 9 })
    const manual = adjustSettingsForElement({ type: "cube", width: 30, height: 30, depth: 12 }, base, { depthSetManually: true })
    expect(manual.settings.depth).toBe(9)
    const auto = adjustSettingsForElement({ type: "cube", width: 30, height: 30, depth: 12 }, base)
    expect(auto.settings.depth).toBe(12)
    expect(adjustSettingsForElement({ type: "circle", radius: 2 }, base).suggestSmallerTool).toBe(true)
    expect(adjustSettingsForElement(undefined, base).settings).toBe(base)
  })

  test("drilling points and outlines", () => {
    expect(getDrillingPoints({ type: "circle", x: 1, y: 2, z: 3 })).toEqual([{ x: 1, y: 2, z: 3 }])
    expect(getDrillingPoints({ type: "component", x: 10, y: 0, z: 0, elements: [{ type: "circle", x: 1, y: 1, z: 0 }] })).toEqual([{ x: 11, y: 1, z: 0 }])
    expect(getDrillingPoints({ type: "component", x: 10, y: 5, z: 0, elements: [] })).toEqual([{ x: 10, y: 5, z: 0 }])
    const outline = elementOutline({ type: "rectangle", x: 0, y: 0, z: 0, width: 4, height: 2 }, 1)
    expect(outline[0]).toEqual({ x: -3, y: -2, z: 0 })
    expect(outline).toHaveLength(5)
    expect(elementOutline({ type: "polygon", x: 0, y: 0, z: 0, radius: 5, sides: 5 })).toHaveLength(6)
  })

  test("stock derived from an element", () => {
    expect(calculateElementDimensions({ type: "cylinder", radius: 10, height: 30 })).toEqual({ width: 20, height: 20, depth: 30 })
    expect(calculateElementDimensions({ type: "cube", width: 10, height: 20, depth: 30 })).toEqual({ width: 10, height: 20, depth: 30 })
    expect(calculateElementDimensions({ type: "mystery" })).toEqual({ width: 100, height: 100, depth: 20 })
    const derived = stockFromElement({ id: "e1", type: "cube", x: 5, y: 6, z: 7, width: 10, height: 20, depth: 30, material: "steel" }, 2)
    expect(derived).toMatchObject({ width: 10, height: 20, depth: 30, x: 5, y: 6, topZ: 0, allowance: 2, material: "steel", elementId: "e1" })
  })

  test("outsideStock honours the stock centre", () => {
    expect(outsideStock({ type: "circle", x: 90, y: 0, radius: 5 }, stock())).toBe(true)
    expect(outsideStock({ type: "circle", x: 90, y: 0, radius: 5 }, stock({ x: 50 }))).toBe(false)
    expect(outsideStock({ type: "circle", x: 90, y: 0, radius: 5 }, undefined)).toBe(false)
  })
})

describe("analysis", () => {
  test("statistics and IR of a generated program", () => {
    const { gcode, stats, program } = run(settings({ depth: 2, stepdown: 1 }), { ...DEFAULT_GEOMETRY, stock: stock() })
    expect(stats.minZ).toBeCloseTo(-2, 6)
    expect(stats.cutLength).toBeGreaterThan(400)
    expect(stats.estimatedSeconds).toBeGreaterThan(0)
    expect(stats.lines).toBe(gcode.split("\n").filter(l => l.trim()).length)
    const ir = program
    expect(ir.toolpaths).toHaveLength(1)
    expect(ir.toolpaths[0]!.moves.length).toBeGreaterThan(10)
    expect(ir.toolpaths[0]!.spindleRpm).toBe(10000)
    expect(ir.toolpaths[0]!.coolant).toBe("flood")
  })

  test("pasted text with unknown words still previews and reports them", () => {
    const analysed = analyseGcode("G90\nG21\nG41 D1\nG0 X1 Y1\nG1 X10 Y0 F200\n", "Pasted")
    expect(analysed.program.toolpaths[0]!.moves).toHaveLength(2)
    expect(analysed.stats.bounds.max.x).toBe(10)
    expect(analysed.warnings.length).toBeGreaterThan(0)
  })

  test("empty text is an empty program, not an error", () => {
    const analysed = analyseGcode("")
    expect(analysed.program.toolpaths).toHaveLength(0)
    expect(analysed.stats.cutLength).toBe(0)
  })
})

describe("suggestions", () => {
  test("element parameters, cutting feedback and stock warnings", () => {
    const geometry = selected([{ type: "circle", id: "c", x: 90, y: 0, radius: 2 }], { stock: stock() })
    const suggestion = suggestFor(settings({ depth: 40 }), geometry)
    expect(suggestion.parameters).toMatchObject({ operationType: "contour", depth: 5 })
    expect(suggestion.warnings).toContain("Depth 40mm exceeds the stock thickness 20mm: it will be limited")
    expect(suggestion.warnings).toContain("The element is small relative to the tool: consider a smaller tool")
    expect(suggestion.warnings).toContain("circle leaves the stock rectangle")
    expect(suggestion.operation.title).toBe("Contouring")
    expect(suggestion.statistics.effectiveStepover).toBe(2.4)
  })

  test("without a selection there are no element parameters", () => {
    expect(suggestFor(settings(), { ...DEFAULT_GEOMETRY }).parameters).toBeUndefined()
  })
})

describe("generate progress", () => {
  const seen = (s: ToolpathSettings, evidence = true) => {
    const steps: Array<{ stage: string; index: number; count: number }> = []
    generateToolpath({ settings: s, geometry: DEFAULT_GEOMETRY as never, printer: DEFAULT_PRINTER_EXTRAS, evidence }, { onProgress: (p) => steps.push({ stage: p.stage, ...p.step }) })
    return steps
  }

  test("each step is announced before it runs, numbered among the steps of this request", () => {
    const steps = seen(settings({ optimizePath: true, useArcFitting: true, useAdaptiveFeeds: true }))
    expect(steps.map((s) => s.stage)).toEqual(["toolpath", "optimize", "arcs", "feeds", "analysis", "cycles", "record"])
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(new Set(steps.map((s) => s.count))).toEqual(new Set([7]))
  })

  test("a step the request switches off is not announced and the count follows", () => {
    const steps = seen(settings({ optimizePath: false, useArcFitting: false, useAdaptiveFeeds: false }), false)
    expect(steps.map((s) => s.stage)).toEqual(["toolpath", "analysis", "cycles"])
    expect(steps.at(-1)).toMatchObject({ index: 2, count: 3 })
  })

  test("the program is the same with or without a listener", () => {
    const request = { settings: settings(), geometry: DEFAULT_GEOMETRY as never, printer: DEFAULT_PRINTER_EXTRAS }
    expect(generateToolpath(request, { onProgress: () => {} }).response.gcode).toBe(generateToolpath(request).response.gcode)
  })
})
