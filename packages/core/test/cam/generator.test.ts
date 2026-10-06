import { describe, expect, test } from "bun:test"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import {
  DEFAULT_GEOMETRY,
  DEFAULT_PRINTER_EXTRAS,
  DEFAULT_SETTINGS,
  aiSuggestionsFor,
  calculateCuttingStatistics,
  convertLinesToArcs,
  cutLevels,
  generateToolpath,
  getCuttingFeedback,
  optimizeToolpath,
  withMachineDefaults,
  withMaterialDefaults,
  type GeometryInput,
  type ToolpathSettings
} from "../../src/cam/generator/index.ts"

const cam = { testing: { interpretGcode } }
const settings = (patch: Partial<ToolpathSettings> = {}): ToolpathSettings => ({ ...DEFAULT_SETTINGS, ...patch })
const geometry = (patch: Partial<GeometryInput> = {}): GeometryInput => ({ ...DEFAULT_GEOMETRY, ...patch })
const run = (s: ToolpathSettings, g: GeometryInput, stamp?: string) => {
  const outcome = generateToolpath({ settings: s, geometry: g, printer: DEFAULT_PRINTER_EXTRAS, ...(stamp ? { stamp } : {}) })
  return { ...outcome.response, ...(outcome.error !== undefined ? { error: outcome.error } : {}) }
}
const gen = run

describe("defaults and presets", () => {
  test("legacy defaults", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ machineType: "mill", operationType: "contour", toolDiameter: 6, depth: 5, stepdown: 1, stepover: 40, feedrate: 800, plungerate: 300, rpm: 10000, offset: "outside", direction: "climb", coolant: true })
  })

  test("material presets set feed / plunge / rpm; unknown materials keep them", () => {
    expect(withMaterialDefaults(settings({ material: "steel" }))).toMatchObject({ feedrate: 400, plungerate: 150, rpm: 8000 })
    expect(withMaterialDefaults(settings({ material: "titanium" }))).toMatchObject({ feedrate: 200, plungerate: 100, rpm: 6000 })
    expect(withMaterialDefaults(settings({ material: "composite", feedrate: 123 })).feedrate).toBe(123)
  })

  test("machine change picks the first valid operation and tool", () => {
    expect(withMachineDefaults(settings({ machineType: "lathe" }))).toMatchObject({ operationType: "turning", toolType: "turning" })
    expect(withMachineDefaults(settings({ machineType: "3dprinter" }))).toMatchObject({ operationType: "standard", toolType: "standard" })
    expect(withMachineDefaults(settings({ machineType: "mill", operationType: "pocket" })).operationType).toBe("pocket")
  })

  test("cutting statistics and feedback", () => {
    const stats = calculateCuttingStatistics(settings())
    expect(stats.effectiveStepover).toBe(2.4)
    expect(stats.cuttingSpeed).toBeCloseTo(188.5, 1)
    expect(getCuttingFeedback(settings({ feedrate: 1 }))).toContain("troppo basso")
  })

  test("AI suggestions depend on the machine", () => {
    expect(aiSuggestionsFor(settings())[0]).toContain("800 mm/min")
    expect(aiSuggestionsFor(settings({ machineType: "lathe", material: "steel" }))[0]).toContain("0.15 mm/rev")
    expect(aiSuggestionsFor(settings({ machineType: "3dprinter" }))).toHaveLength(3)
  })
})

describe("cut levels", () => {
  test("end exactly at -depth and never start at Z0", () => {
    expect(cutLevels(5, 1)).toEqual([-1, -2, -3, -4, -5])
    expect(cutLevels(5, 2)).toEqual([-2, -4, -5])
    expect(cutLevels(0.5, 2)).toEqual([-0.5])
  })

  test("invalid input produces no levels", () => {
    expect(cutLevels(0, 1)).toEqual([])
    expect(cutLevels(5, 0)).toEqual([])
    expect(cutLevels(Number.NaN, 1)).toEqual([])
  })
})

describe("mill program", () => {
  test("header, prologue and epilogue match the legacy text", () => {
    const { gcode } = gen(settings(), geometry())
    const head = gcode.split("\n").slice(0, 12)
    expect(head[0]).toBe("; CAD/CAM SYSTEM - Generated Mill G-code with AI assistance")
    expect(head[1]).toBe("; Operation: contour")
    expect(head[3]).toBe("; Tool: endmill Ø6mm")
    expect(gcode).toContain("G90 ; Absolute positioning\nG21 ; Metric units\nG17 ; XY plane selection\nM3 S10000 ; Start spindle\nM8 ; Coolant on\nG0 Z10 ; Move to safe height")
    expect(gcode.trimEnd().endsWith("G0 Z30 ; Move to safe height\nM9 ; Coolant off\nM5 ; Stop spindle\nM30 ; Program end")).toBe(true)
  })

  test("output is deterministic and only dated when a stamp is injected", () => {
    const a = gen(settings(), geometry()).gcode
    expect(run(settings(), geometry()).gcode).toBe(a)
    expect(a).not.toContain("; Date:")
    expect(run(settings(), geometry(), "2026-01-01").gcode).toContain("; Date: 2026-01-01")
  })

  test("no coolant lines when coolant is off", () => {
    const { gcode } = gen(settings({ coolant: false }), geometry())
    expect(gcode).not.toContain("M8")
    expect(gcode).not.toContain("M9")
  })

  test("high speed and exact stop modes", () => {
    expect(run(settings({ useHighSpeedMode: true }), geometry()).gcode).toContain("G64 P0.01")
    expect(run(settings({ useExactStop: true }), geometry()).gcode).toContain("G61 ; Exact stop mode")
    expect(run(settings({ useHighSpeedMode: true, useExactStop: true }), geometry()).gcode).not.toContain("G61")
  })

  test("rectangle contour reaches -depth and retracts between levels (no rapid through material)", () => {
    const { gcode } = gen(settings({ depth: 3, stepdown: 1 }), geometry())
    const result = cam.testing.interpretGcode(gcode)
    expect(result.errors).toEqual([])
    expect(result.minZ).toBeCloseTo(-3, 6)
    for (const seg of result.segments) {
      if (seg.kind === "rapid" && (seg.to.x !== seg.from.x || seg.to.y !== seg.from.y)) {
        expect(Math.min(seg.from.z, seg.to.z)).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test("outside grows and inside shrinks the rectangle by the tool radius", () => {
    const bounds = (offset: "inside" | "outside" | "center") => {
      const seg = cam.testing.interpretGcode(run(settings({ offset, depth: 1 }), geometry({ rectangleWidth: 100, rectangleHeight: 50 })).gcode).segments
      const xs = seg.flatMap(s => (s.kind === "linear" ? [s.from.x, s.to.x] : []))
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(bounds("outside")).toBeCloseTo(106, 6)
    expect(bounds("inside")).toBeCloseTo(94, 6)
    expect(bounds("center")).toBeCloseTo(100, 6)
  })

  test("conventional milling reverses the contour", () => {
    const climb = gen(settings({ depth: 1 }), geometry()).gcode.split("\n").filter(l => l.includes("; Corner 2"))[0]
    const conventional = gen(settings({ depth: 1, direction: "conventional" }), geometry()).gcode.split("\n").filter(l => l.includes("; Corner 2"))[0]
    expect(climb).not.toBe(conventional)
  })

  test("circle contour is an exact full circle with consistent radii", () => {
    const { gcode } = gen(settings({ depth: 2 }), geometry({ geometryType: "circle", circleRadius: 20 }))
    const result = cam.testing.interpretGcode(gcode)
    expect(result.errors).toEqual([])
    const arcs = result.segments.filter(s => s.kind === "arc")
    expect(arcs).toHaveLength(2)
    for (const arc of arcs) {
      if (arc.kind !== "arc") continue
      expect(arc.radiusStart).toBeCloseTo(23, 6)
      expect(arc.radiusEnd).toBeCloseTo(23, 6)
    }
  })

  test("circular pocket rings are valid full circles at growing radii", () => {
    const { gcode } = gen(settings({ operationType: "pocket", offset: "center", depth: 1, stepover: 50 }), geometry({ geometryType: "circle", circleRadius: 12 }))
    const result = cam.testing.interpretGcode(gcode)
    expect(result.errors).toEqual([])
    const radii = result.segments.flatMap(s => (s.kind === "arc" ? [s.radiusStart] : []))
    expect(radii.length).toBeGreaterThan(1)
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeGreaterThan(radii[i - 1]!)
    for (const seg of result.segments) if (seg.kind === "arc") expect(Math.abs(seg.radiusStart - seg.radiusEnd)).toBeLessThan(1e-6)
  })

  test("rectangle pocket spirals outwards", () => {
    const { gcode } = gen(settings({ operationType: "pocket", offset: "center", depth: 1 }), geometry({ rectangleWidth: 20, rectangleHeight: 10 }))
    expect(gcode).toContain("; Pocket operation - Stepover: 40% (2.40mm)")
    expect(gcode).toContain("; Step 1 corner 1")
    expect(gcode).toContain("; Close loop")
  })

  test("polygon toolpath closes the loop", () => {
    const { gcode } = gen(settings({ depth: 1 }), geometry({ geometryType: "polygon", polygonSides: 5 }))
    expect(gcode).toContain("; Polygon toolpath (5 sides)")
    expect(gcode.match(/; Point \d/g)?.length).toBe(5)
  })

  test("custom path is inserted verbatim", () => {
    const { gcode } = gen(settings(), geometry({ geometryType: "custom", customPath: "G1 X1 Y1" }))
    expect(gcode).toContain("; Custom path\nG1 X1 Y1\n")
  })

  test("origin offsets move the toolpath", () => {
    const first = (patch: Partial<ToolpathSettings>) => run(settings({ depth: 1, ...patch }), geometry()).gcode.split("\n").find(l => l.includes("Move to start position"))
    expect(first({ originType: "workpiece-center" })).toBe("G0 X-53.000 Y-28.000 ; Move to start position")
    expect(first({ originType: "workpiece-corner" })).toBe("G0 X-3.000 Y-3.000 ; Move to start position")
    expect(first({ originType: "custom", originX: 10, originY: 5 })).toBe("G0 X-43.000 Y-23.000 ; Move to start position")
  })

  test("tool compensation wraps the contour with G41/G42 and G40", () => {
    const outsideClimb = gen(settings({ useToolCompensation: true, toolNumber: 3 }), geometry()).gcode
    expect(outsideClimb).toContain("G42 D3 ; Tool compensation")
    expect(outsideClimb).toContain("; Approach point for compensation")
    expect(outsideClimb).toContain("G40 ; Cancel tool compensation")
    expect(run(settings({ useToolCompensation: true, offset: "inside" }), geometry()).gcode).toContain("G41 D1")
    expect(run(settings({ useToolCompensation: true, operationType: "pocket" }), geometry()).gcode).not.toContain("G40")
  })

  test("finishing pass block", () => {
    const { gcode } = gen(settings({ finishingPass: true, finishingStrategy: "spiral" }), geometry())
    expect(gcode).toContain("; Finishing pass\n; Finishing allowance: 0.2mm\n; Spiral finishing strategy")
  })
})

describe("selected elements", () => {
  const withElement = (element: Record<string, any>, patch: Partial<ToolpathSettings> = {}) =>
    run(settings({ depth: 2, ...patch }), geometry({ geometryType: "selected", selectedElements: element ? [element] : [] })).gcode

  test("no selection", () => {
    expect(run(settings(), geometry({ geometryType: "selected" })).gcode).toContain("; No element selected for toolpath generation")
  })

  test("each primitive produces a labelled toolpath", () => {
    const cases: Array<[Record<string, any>, string]> = [
      [{ type: "circle", x: 0, y: 0, radius: 10 }, "; Circle: center (0, 0), radius 10mm"],
      [{ type: "rectangle", x: 0, y: 0, width: 20, height: 10 }, "; Rectangle: center (0, 0), width 20mm, height 10mm"],
      [{ type: "line", x1: 0, y1: 0, x2: 10, y2: 0 }, "; Line: from (0, 0) to (10, 0)"],
      [{ type: "cube", x: 0, y: 0, z: 0, width: 20, height: 10, depth: 15 }, "; Cube:"],
      [{ type: "sphere", x: 0, y: 0, z: 0, radius: 10 }, "; Sphere:"],
      [{ type: "cylinder", x: 0, y: 0, z: 0, radius: 10, height: 10 }, "; Cylinder:"],
      [{ type: "cone", x: 0, y: 0, z: 0, radius: 10, height: 20 }, "; Cone:"],
      [{ type: "torus", x: 0, y: 0, z: 0, radius: 20, tubeRadius: 5 }, "; Torus:"],
      [{ type: "polygon", x: 0, y: 0, z: 0, sides: 6, radius: 10 }, "; Polygon:"],
      [{ type: "pyramid", x: 0, y: 0, z: 0, baseWidth: 20, baseDepth: 20, height: 10 }, "; Pyramid:"],
      [{ type: "hemisphere", x: 0, y: 0, z: 0, radius: 10 }, "; Hemisphere:"],
      [{ type: "prism", x: 0, y: 0, z: 0, radius: 10, height: 10 }, "; Prism:"],
      [{ type: "ellipsoid", x: 0, y: 0, z: 0, radiusX: 10, radiusY: 6, radiusZ: 8 }, "; Ellipsoid:"],
      [{ type: "capsule", x: 0, y: 0, z: 0, radius: 5, height: 20 }, "; Capsule:"],
      [{ type: "triangle", x1: 0, y1: 0, x2: 10, y2: 0, x3: 5, y3: 8, z: 0 }, "; Triangle:"],
      [{ type: "arc", x: 0, y: 0, z: 0, radius: 10, startAngle: 0, endAngle: 90 }, "; Arc:"],
      [{ type: "ellipse", x: 0, y: 0, z: 0, radiusX: 10, radiusY: 5 }, "; Ellipse:"],
      [{ type: "text3d", x: 0, y: 0, z: 0, text: "AB", height: 10, depth: 2 }, "; 3D Text:"],
      [{ type: "text", x: 0, y: 0, z: 0, text: "AB" }, "; Text:"]
    ]
    for (const [element, label] of cases) expect(withElement(element)).toContain(label)
  })

  test("full-depth cylinder slices stop at the element height", () => {
    const text = withElement({ type: "cylinder", x: 0, y: 0, z: 0, radius: 10, height: 3 }, { depth: 10 })
    expect(text.match(/; Z Level:/g)?.length).toBe(3)
  })

  test("too-small offset radii are skipped, not emitted as NaN", () => {
    const text = withElement({ type: "polygon", x: 0, y: 0, z: 0, sides: 6, radius: 2 }, { offset: "inside", toolDiameter: 10 })
    expect(text).toContain("radius after offset is too small")
    expect(text).not.toContain("NaN")
  })

  test("composite walks its sub-elements and nested groups", () => {
    const text = withElement({ type: "composite", elements: [{ type: "circle", x: 0, y: 0, radius: 5 }, { type: "group", elements: [{ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }] }, { type: "tube", path: [], radius: 2 }] })
    expect(text).toContain("; Composite element with sub-elements")
    expect(text).toContain("; Processing 3 sub-elements")
    expect(text).toContain("; Element 1/3")
    expect(text).toContain("; Circle: center (0, 0), radius 5mm")
    expect(text).toContain("; Line: from (0, 0) to (1, 1)")
  })

  test("unknown types get the legacy generic contour (see generator-parity.test.ts)", () => {
    expect(withElement({ type: "wormhole" })).toContain("; Generic rectangular contour: wormhole at (0, 0, 0), size 10x10mm")
  })
})

describe("lathe program", () => {
  const lathe = (patch: Partial<ToolpathSettings>) => run(settings({ machineType: "lathe", toolType: "turning", operationType: "turning", ...patch }), geometry()).gcode

  test("header and spindle", () => {
    const gcode = lathe({})
    expect(gcode).toContain("; CAD/CAM SYSTEM - Generated Lathe G-code with AI assistance")
    expect(gcode).toContain("; Stock: Ø50mm x 100mm")
    expect(gcode).toContain("G18 ; XZ plane selection (standard for lathes)")
    expect(gcode).toContain("M3 S10000 ; Start spindle clockwise")
    expect(lathe({ spindleDirection: "ccw" })).toContain("Start spindle counter-clockwise")
    expect(gcode.trimEnd().endsWith("M30 ; Program end")).toBe(true)
  })

  test("every operation emits its own block", () => {
    const labels: Record<string, string> = {
      facing: "; Facing operation", turning: "; Turning operation", boring: "; Boring operation", threading: "; Threading operation",
      grooving: "; Grooving operation", parting: "; Parting operation", knurling: "; Knurling operation"
    }
    for (const [operationType, label] of Object.entries(labels)) {
      expect(lathe({ operationType: operationType as ToolpathSettings["operationType"] })).toContain(label)
    }
  })

  test("external turning steps the diameter down by 2 x stepdown and stays finite", () => {
    const gcode = lathe({ depth: 2, stepdown: 1 })
    expect(gcode).toContain("G1 X48.000 F400 ; Plunge to depth")
    expect(gcode).toContain("G1 X46.000 F400 ; Plunge to depth")
    expect(gcode).not.toContain("NaN")
  })

  test("internal turning and threading", () => {
    expect(lathe({ turningOperation: "internal", depth: 1 })).toContain("G0 X24.000 Z2 ; Position tool")
    expect(lathe({ operationType: "threading", depth: 0.3 }).match(/G32/g)).toHaveLength(3)
  })
})

describe("3D printer program", () => {
  const printer = (element?: Record<string, any>) => run(settings({ machineType: "3dprinter", operationType: "standard", toolType: "standard" }), geometry({ geometryType: "selected", selectedElements: element ? [element] : [] }))

  test("requires a selected element", () => {
    const result = printer()
    expect(result.error).toBe("Please select a CAD element for 3D printing.")
    expect(result.gcode).toBe("; Error: No element selected for 3D printing\n")
  })

  test("prints a cube between start and end blocks with a growing E axis", () => {
    const { gcode } = printer({ type: "cube", x: 0, y: 0, z: 1, width: 10, height: 10, depth: 1 })
    expect(gcode.startsWith("; Print Start G-code\nM82")).toBe(true)
    expect(gcode).toContain("M104 S200")
    expect(gcode).toContain("; Layer 1 / 5 at Z=0.700")
    expect(gcode.trimEnd().endsWith("M84 ; Disable motors")).toBe(true)
    const e = [...gcode.matchAll(/ E(\d+\.\d+) F/g)].map(m => Number(m[1]))
    expect(e.length).toBeGreaterThan(10)
    for (let i = 1; i < e.length; i++) expect(e[i]!).toBeGreaterThanOrEqual(e[i - 1]!)
  })

  test("sphere, cylinder, cone and torus", () => {
    for (const element of [
      { type: "sphere", x: 0, y: 0, z: 5, radius: 5 },
      { type: "cylinder", x: 0, y: 0, z: 5, radius: 5, height: 4 },
      { type: "cone", x: 0, y: 0, z: 5, radius: 5, height: 4 },
      { type: "torus", x: 0, y: 0, z: 5, radius: 10, tubeRadius: 2 }
    ]) {
      const { gcode, error } = printer(element)
      expect(error).toBeUndefined()
      expect(gcode).toContain(`; 3D Print ${element.type[0]!.toUpperCase()}${element.type.slice(1)}`)
      expect(gcode).not.toContain("NaN")
    }
  })

  test("composites share one start and one end block", () => {
    const { gcode } = printer({ type: "composite", elements: [{ type: "cube", x: 0, y: 0, z: 1, width: 4, height: 4, depth: 1 }, { type: "cylinder", x: 10, y: 0, z: 1, radius: 2, height: 1 }] })
    expect(gcode.match(/; Print Start G-code/g)).toHaveLength(1)
    expect(gcode.match(/; Print End G-code/g)).toHaveLength(1)
    expect(gcode).toContain("; Start Composite Element: composite")
    expect(gcode).toContain("; End Composite Element: composite")
  })
})

describe("post passes", () => {
  test("optimizeToolpath drops duplicate moves and sub-tolerance cuts but keeps arcs", () => {
    const input = ["G0 X0 Y0 Z5", "G1 X1 Y1 Z0 F100", "G1 X1 Y1 Z0 F100", "G1 X1.001 Y1 Z0", "G3 X1 Y1 I-1 J0", "G1 X1 Y1 Z0 F100", "G1 X5 Y1"].join("\n")
    const out = optimizeToolpath(input, 0.01).split("\n")
    expect(out).toEqual(["G0 X0 Y0 Z5", "G1 X1 Y1 Z0 F100", "G3 X1 Y1 I-1 J0", "G1 X1 Y1 Z0 F100", "G1 X5 Y1"])
  })

  test("a G0 and a G1 to the same point are not the same move", () => {
    const out = optimizeToolpath(["G0 X1 Y1 Z0", "G1 X1 Y1 Z0 F100"].join("\n"), 0.01)
    expect(out.split("\n")).toHaveLength(2)
  })

  test("arc fitting uses the true circumcentre and only fits real arcs", () => {
    const radius = 10
    const points = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 8) * (Math.PI / 2)
      return `G1 X${(radius * Math.cos(a)).toFixed(4)} Y${(radius * Math.sin(a)).toFixed(4)} Z0`
    })
    const out = convertLinesToArcs(["F300", ...points].join("\n"), 0.05)
    const arc = out.split("\n").find(l => l.startsWith("G3") || l.startsWith("G2"))
    expect(arc).toBeDefined()
    expect(arc!.startsWith("G3")).toBe(true)
    const [, i, j] = arc!.match(/I(-?\d+\.\d+) J(-?\d+\.\d+)/)!.map(Number) as [number, number, number]
    expect(i).toBeCloseTo(-10, 2)
    expect(j).toBeCloseTo(0, 2)
    const result = cam.testing.interpretGcode(`G21 G90 G17\nG0 X10 Y0 Z0\n${out}`)
    for (const seg of result.segments) if (seg.kind === "arc") expect(Math.abs(seg.radiusStart - seg.radiusEnd)).toBeLessThan(0.01)
  })

  test("arc fitting leaves a polygon corner and a straight run alone", () => {
    const corner = ["G1 X0 Y0 Z0", "G1 X5 Y0 Z0", "G1 X10 Y0 Z0", "G1 X10 Y5 Z0", "G1 X10 Y10 Z0"].join("\n")
    expect(convertLinesToArcs(corner, 0.05)).toBe(corner)
    const straight = ["G1 X0 Y0 Z0", "G1 X1 Y0 Z0", "G1 X2 Y0 Z0", "G1 X3 Y0 Z0"].join("\n")
    expect(convertLinesToArcs(straight, 0.05)).toBe(straight)
  })

  test("generateGCode applies the enabled post passes and finds fixed cycles", () => {
    const withCycle = run(settings({ optimizePath: true, useArcFitting: true }), geometry({ geometryType: "custom", customPath: "G83 X1 Y1 Z-5 R2 Q1 F100" }))
    expect(withCycle.cycles).toEqual([{ gcode: "G83 X1 Y1 Z-5 R2 Q1 F100" }])
  })
})
