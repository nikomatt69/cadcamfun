import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import {
  DEFAULT_GEOMETRY,
  DEFAULT_PRINTER_EXTRAS,
  DEFAULT_SETTINGS,
  GenerationBudgetError,
  MAX_LEVELS,
  MAX_MOVES,
  aiSuggestionsFor,
  calculateCuttingStatistics,
  adaptFeeds,
  convertLinesToArcs,
  cutLevels,
  generateToolpath,
  printRequirementOf,
  getCuttingFeedback,
  optimizeToolpath,
  withMachineDefaults,
  withMaterialDefaults,
  type GeometryInput,
  type ToolpathSettings
} from "../../src/cam/generator/index.ts"
import { verifyRequestFor, verifyToolpath } from "../../src/cam/verify/index.ts"

// The surface engine runs real machining simulations: on a busy machine (CI, a second suite) they need more than the default 5 s.
setDefaultTimeout(60_000)

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

  test("a finishing pass leaves the allowance on the wall first and then cuts the wall to size", () => {
    const g = geometry({ geometryType: "circle", circleRadius: 25 })
    const radii = (gcode: string) => [...gcode.matchAll(/^G[23] .*I(-?\d+\.\d+)/gm)].map((m) => Math.abs(Number(m[1])))
    const plain = gen(settings({ offset: "outside", depth: 1, stepdown: 1 }), g).gcode
    expect(new Set(radii(plain))).toEqual(new Set([28]))
    const finished = gen(settings({ offset: "outside", depth: 1, stepdown: 1, finishingPass: true, finishingAllowance: 0.2 }), g).gcode
    expect(finished).toContain("; Pass 1: 0.200mm of material left on the wall")
    expect(finished).toContain("; Pass 2: finishing the wall to size")
    expect([...new Set(radii(finished))].sort()).toEqual([28, 28.2])
    // The roughing pass comes first and stays further out; the last arc of the program is the finished wall.
    const all = radii(finished)
    expect(all[0]).toBeCloseTo(28.2, 6)
    expect(all[all.length - 1]).toBeCloseTo(28, 6)
  })

  test("a finishing pass without a side to leave material on says so instead of pretending", () => {
    const { gcode } = gen(settings({ offset: "center", finishingPass: true }), geometry({ geometryType: "circle", circleRadius: 25 }))
    expect(gcode).toContain("; Finishing pass skipped")
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
  const printer = (element?: Record<string, any>, over: Partial<ToolpathSettings> = {}) => run(settings({ machineType: "3dprinter", operationType: "standard", toolType: "standard", ...over }), geometry({ geometryType: "selected", selectedElements: element ? [element] : [] }))

  test("requires a selected element", () => {
    const result = printer()
    expect(result.error).toBe("Please select a CAD element for 3D printing.")
    expect(result.gcode).toBe("; Error: No element selected for 3D printing\n")
  })

  test("something without volume is refused with the reason", () => {
    const result = printer({ type: "line", x1: 0, y1: 0, x2: 10, y2: 0, z: 1 })
    expect(result.error).toContain("no volume")
    expect(result.gcode).toStartWith("; Error: Nothing to print")
  })

  test("prints a cube between start and end blocks with a growing E axis", () => {
    const { gcode } = printer({ type: "cube", x: 0, y: 0, z: 1, width: 10, height: 10, depth: 1 })
    expect(gcode).toContain("; Print Start G-code\nG21")
    expect(gcode.indexOf("G90")).toBeLessThan(gcode.indexOf("M82"))
    expect(gcode).toContain("M104 S200")
    // The part is set down on the plate: its bottom is Z0, so the first layer is printed at one layer height (CAD Z is not the plate's).
    expect(gcode).toContain("; Layer 1 / 5 at Z=0.200")
    expect(gcode).toContain("; Part placed on the bed")
    expect(gcode.trimEnd().endsWith("M84 ; Disable motors")).toBe(true)
    // E rises with every extruding move and falls only for a retraction.
    let last = 0
    for (const line of gcode.split("\n")) {
      if (line.startsWith("G92 E0")) { last = 0; continue }
      const m = line.match(/^G1 .*E(-?\d+\.\d+)/)
      if (!m) continue
      const e = Number(m[1])
      if (!line.includes("X")) { last = e; continue }
      expect(e).toBeGreaterThan(last)
      last = e
    }
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
      expect(gcode).toContain("; Layer 1 /")
      expect(gcode).not.toContain("NaN")
    }
  })

  test("a composite is one job: one start block, one end block, every member printed", () => {
    const { gcode } = printer({ type: "composite", elements: [{ type: "cube", x: 0, y: 0, z: 1, width: 4, height: 4, depth: 1 }, { type: "cylinder", x: 10, y: 0, z: 1, radius: 2, height: 1 }] })
    expect(gcode.match(/; Print Start G-code/g)).toHaveLength(1)
    expect(gcode.match(/; Print End G-code/g)).toHaveLength(1)
    const xs = [...gcode.matchAll(/^G1 X([\d.]+) Y[\d.]+ .*E/gm)].map((m) => Number(m[1]))
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10)
  })

  test("several selected solids print together", () => {
    const result = run(settings({ machineType: "3dprinter", operationType: "standard", toolType: "standard" }), geometry({ geometryType: "selected", selectedElements: [
      { id: "a", type: "cube", x: -10, y: 0, z: 1, width: 4, height: 4, depth: 2 },
      { id: "b", type: "cube", x: 10, y: 0, z: 1, width: 4, height: 4, depth: 2 }
    ] }))
    expect(result.gcode.match(/; Print Start G-code/g)).toHaveLength(1)
    const xs = [...result.gcode.matchAll(/^G1 X([\d.]+) Y[\d.]+ .*E/gm)].map((m) => Number(m[1]))
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(22)
  })

  test("the response carries what the slicer measured", () => {
    const outcome = generateToolpath({
      settings: settings({ machineType: "3dprinter", operationType: "standard", toolType: "standard" }),
      geometry: geometry({ geometryType: "selected", selectedElements: [{ type: "cube", x: 0, y: 0, z: 5, width: 20, height: 20, depth: 10 }] }),
      printer: DEFAULT_PRINTER_EXTRAS
    })
    const print = outcome.response.print!
    expect(print.layers).toBe(50)
    expect(print.timeSeconds).toBeGreaterThan(60)
    expect(print.filamentGrams).toBeGreaterThan(1)
    expect(print.size.z).toBeCloseTo(10, 6)
    expect(print.lengthByKind["wall-outer"]).toBeGreaterThan(1000)
  })

  test("support and solid operations do what their names say", () => {
    const run3 = (operationType: string, over: Record<string, unknown> = {}) => generateToolpath({
      settings: settings({ machineType: "3dprinter", operationType: operationType as never, toolType: "standard" }),
      geometry: geometry({ geometryType: "selected", selectedElements: [{ type: "sphere", x: 0, y: 0, z: 6, radius: 6 }] }),
      printer: { ...DEFAULT_PRINTER_EXTRAS, ...over }, evidence: false
    }).response
    const standard = run3("standard")
    expect(standard.print!.lengthByKind["support"] ?? 0).toBe(0)
    expect((run3("support").print!.lengthByKind["support"] ?? 0) + (run3("support").print!.lengthByKind["support-interface"] ?? 0)).toBeGreaterThan(20)
    const solid = run3("infill")
    expect(solid.print!.filamentGrams).toBeGreaterThan(standard.print!.filamentGrams * 1.3)
    expect(solid.print!.lengthByKind["infill"] ?? 0).toBeGreaterThan(standard.print!.lengthByKind["infill"] ?? 0)
  })

  test("the print requirement of the panel is what the kernel slices", () => {
    const req = printRequirementOf(settings({ machineType: "3dprinter", operationType: "raft", layerHeight: 0.15, printSpeed: 45 }), { ...DEFAULT_PRINTER_EXTRAS, infillPattern: "gyroid", shellCount: 3, supportType: "full", printOrientation: "auto-optimal", firstLayerHeight: 0.3 })
    expect(req).toMatchObject({ layerHeight: 0.15, firstLayerHeight: 0.3, walls: 3, infillPattern: "gyroid", supports: "everywhere", adhesion: "raft", printSpeed: 45, orientation: "auto", vase: false })
    expect(printRequirementOf(settings({ operationType: "vase" }), DEFAULT_PRINTER_EXTRAS).vase).toBe(true)
    expect(printRequirementOf(settings({ operationType: "infill" }), DEFAULT_PRINTER_EXTRAS)).toMatchObject({ infillDensity: 100, infillPattern: "lines" })
  })

  test("the filament weighs the print and limits its speed", () => {
    const run4 = (filament: "pla" | "tpu" | "abs") => generateToolpath({
      settings: settings({ machineType: "3dprinter", operationType: "standard", toolType: "standard", printSpeed: 100 }),
      geometry: geometry({ geometryType: "selected", selectedElements: [{ type: "cube", x: 0, y: 0, z: 3, width: 60, height: 60, depth: 6 }] }),
      printer: { ...DEFAULT_PRINTER_EXTRAS, filament }, evidence: false
    }).response.print!
    const pla = run4("pla"), abs = run4("abs"), tpu = run4("tpu")
    expect(abs.filamentGrams / pla.filamentGrams).toBeCloseTo(1.04 / 1.24, 2)
    // TPU melts 3.6 mm^3/s: a bead of 0.4 x 0.2 cannot go faster than 45 mm/s, however fast the profile asks.
    expect(tpu.timeSeconds).toBeGreaterThan(pla.timeSeconds * 1.2)
  })

  test("the panel's settings reach the program: supports, brim, vase and the dialect", () => {
    const settingsFor = (over: Partial<typeof DEFAULT_PRINTER_EXTRAS>, patch: Partial<ToolpathSettings> = {}) =>
      generateToolpath({
        settings: settings({ machineType: "3dprinter", operationType: "standard", toolType: "standard", ...patch }),
        geometry: geometry({ geometryType: "selected", selectedElements: [{ type: "cylinder", x: 0, y: 0, z: 5, radius: 8, height: 10 }] }),
        printer: { ...DEFAULT_PRINTER_EXTRAS, ...over },
        evidence: false
      }).response
    expect(settingsFor({ adhesion: "brim", brimWidth: 4 }).print!.lengthByKind["brim"]).toBeGreaterThan(100)
    expect(settingsFor({}, { operationType: "brim" }).print!.lengthByKind["brim"]).toBeGreaterThan(100)
    expect(settingsFor({}, { operationType: "raft" }).print!.layers).toBe(53)
    const vase = settingsFor({}, { operationType: "vase" })
    expect(vase.print!.lengthByKind["infill"] ?? 0).toBe(0)
    expect(settingsFor({ relativeExtrusion: true }).gcode).toContain("M83")
    expect(settingsFor({ flavor: "klipper", pressureAdvance: 0.04 }).gcode).toContain("SET_PRESSURE_ADVANCE ADVANCE=0.04")
    expect(settingsFor({ startGcode: "START_PRINT NOZZLE={nozzle}" }).gcode).toContain("START_PRINT NOZZLE=200")
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

describe("3d_surface runs the surface engine over the selected solids", () => {
  const sphere = { id: "s", type: "sphere", radius: 10, x: 0, y: 0, z: -10 }
  const stock = { width: 30, height: 30, depth: 12, radius: 0, x: 0, y: 0, topZ: 0, allowance: 1 }
  const surface = (patch: Partial<ToolpathSettings>) => gen(
    settings({ operationType: "3d_surface", toolType: "ballnose", toolDiameter: 4, depth: 9, stepdown: 3, stepover: 50, tolerance: 0.02, ...patch }),
    geometry({ geometryType: "selected", selectedElements: [sphere], stock })
  )
  const feedPoints = (gcode: string) => {
    const pts: Array<{ x: number; y: number; z: number }> = []
    let x = 0, y = 0, z = 0
    for (const line of gcode.split("\n")) {
      const m = /^(G0|G1)\b/.exec(line)
      if (!m) continue
      const word = (l: string) => { const w = new RegExp(`${l}(-?\\d+\\.\\d+)`).exec(line); return w ? Number(w[1]) : undefined }
      x = word("X") ?? x; y = word("Y") ?? y; z = word("Z") ?? z
      if (m[1] === "G1") pts.push({ x, y, z })
    }
    return pts
  }

  test("a raster finish follows the sphere and never goes below the ball's resting height", () => {
    const { gcode, warnings } = surface({ surfaceStrategy: "parallel" })
    expect(gcode).toContain("; 3D surface: 1 element(s) as one part model, parallel")
    const pts = feedPoints(gcode).filter((p) => Math.hypot(p.x, p.y) < 9)
    expect(pts.length).toBeGreaterThan(100)
    // Ball centre at distance R + r = 12 from the sphere's centre (0, 0, -10): tip z = sqrt(144 - rho^2) - 12.
    for (const p of pts) expect(p.z).toBeGreaterThanOrEqual(Math.sqrt(144 - Math.hypot(p.x, p.y) ** 2) - 12 - 0.03)
    expect(warnings.filter((w) => w.includes("cannot machine"))).toEqual([])
  })

  test("roughing with a finishing pass is a roughing program, then a waterline finish, both real moves", () => {
    const { gcode } = surface({ surfaceStrategy: "roughing", finishingPass: true, finishingAllowance: 0.3, finishingStrategy: "contour" })
    expect(gcode).toContain("; Finishing pass (waterline), 0.300 mm left by the roughing")
    const [rough, finish] = gcode.split("; Finishing pass (waterline)")
    // Roughing keeps 0.3 away from the sphere (plus the tool): no feed point inside the offset sphere of radius 10 + 2 + 0.3.
    for (const p of feedPoints(rough!)) {
      if (p.z > -12) expect(Math.hypot(p.x, p.y, p.z + 10)).toBeGreaterThanOrEqual(10.3 - 0.05)
    }
    expect(feedPoints(finish!).length).toBeGreaterThan(30)
  })

  test("a spiral or radial finishing pass is that pattern over the surface, not a raster fallback", () => {
    for (const pattern of ["spiral", "radial"] as const) {
      const { gcode, warnings } = surface({ surfaceStrategy: "roughing", finishingPass: true, finishingAllowance: 0.3, finishingStrategy: pattern })
      expect(gcode).toContain(`; Finishing pass (${pattern}), 0.300 mm left by the roughing`)
      expect(warnings.filter((w) => w.includes("not available"))).toEqual([])
      const finish = feedPoints(gcode.split(`; Finishing pass (${pattern})`)[1]!).filter((p) => Math.hypot(p.x, p.y) < 9)
      expect(finish.length).toBeGreaterThan(30)
      for (const p of finish) expect(p.z).toBeGreaterThanOrEqual(Math.sqrt(144 - Math.hypot(p.x, p.y) ** 2) - 12 - 0.03)
    }
  })

  test("constant scallop, spiral, radial and flat are surface strategies of their own", () => {
    for (const strategy of ["scallop", "spiral", "radial"] as const) {
      const { gcode } = surface({ surfaceStrategy: strategy, scallop: 0.02 })
      expect(gcode).toContain(`; 3D surface: 1 element(s) as one part model, ${strategy}`)
      const pts = feedPoints(gcode).filter((p) => Math.hypot(p.x, p.y) < 8)
      expect(pts.length).toBeGreaterThan(30)
      for (const p of pts) expect(p.z).toBeGreaterThanOrEqual(Math.sqrt(144 - Math.hypot(p.x, p.y) ** 2) - 12 - 0.03)
    }
    // A sphere has no flat face: the flat strategy says so instead of cutting.
    expect(surface({ surfaceStrategy: "flat", toolType: "endmill" }).gcode).toContain("no flat face")
  })

  test("the verifier finds no gouge, shank or below-stock collision in the program the generator wrote (roughing + waterline finish)", () => {
    const request = {
      settings: settings({ operationType: "3d_surface", toolType: "ballnose", toolDiameter: 4, depth: 9, stepdown: 3, stepover: 50, tolerance: 0.02, surfaceStrategy: "roughing", finishingPass: true, finishingAllowance: 0.3, finishingStrategy: "contour" }),
      geometry: geometry({ geometryType: "selected", selectedElements: [sphere], stock }),
      printer: DEFAULT_PRINTER_EXTRAS
    }
    const { gcode } = generateToolpath(request).response
    const built = verifyRequestFor(request, gcode, { target: { solids: [{ _tag: "Sphere", center: { x: 0, y: 0, z: -10 }, radius: 10, rings: 64 }] }, resolution: 0.25, tolerance: 0.1 })
    if (!built.ok) throw new Error(built.error)
    const report = verifyToolpath(built.request)
    expect(report.issues.filter((i) => ["Gouge", "ShankCollision", "BelowStock", "HolderCollision", "FixtureCollision"].includes(i.code))).toEqual([])
  })

  test("rest machining cuts only the inside corner a 6 mm tool left, never into the walls, and is a real program", () => {
    // Two walls meeting at (10, 10), 12 mm high, on a 50 x 50 stock: the free floor is x < 10, y < 10.
    const walls = [
      { id: "a", type: "cube", width: 50, height: 15, depth: 12, x: 0, y: 17.5, z: -6 },
      { id: "b", type: "cube", width: 15, height: 50, depth: 12, x: 17.5, y: 0, z: -6 }
    ]
    const cornerStock = { width: 50, height: 50, depth: 12, radius: 0, x: 0, y: 0, topZ: 0, allowance: 1 }
    const corner = (patch: Partial<ToolpathSettings>) => gen(
      settings({ operationType: "3d_surface", toolType: "endmill", toolDiameter: 2, depth: 6, stepdown: 3, stepover: 50, tolerance: 0.02, surfaceStrategy: "roughing", ...patch }),
      geometry({ geometryType: "selected", selectedElements: walls, stock: cornerStock })
    )
    const full = corner({})
    const rest = corner({ useRestMachining: true, restToolDiameter: 6 })
    expect(rest.gcode).toContain("; 3D surface: 2 element(s) as one part model, rest")
    expect(rest.gcode).toContain("; Rest machining: only what a 6.000 mm tool left behind")
    const cuts = feedPoints(rest.gcode).filter((p) => p.z < -0.5)
    expect(cuts.length).toBeGreaterThan(20)
    // A 2 mm cutter beside walls at x = 10 and y = 10: its centre stays 1 mm away from both, and the pass stays near the corner.
    for (const p of cuts) {
      expect(p.x).toBeLessThanOrEqual(9 + 0.06)
      expect(p.y).toBeLessThanOrEqual(9 + 0.06)
      expect(Math.hypot(p.x - 10, p.y - 10)).toBeLessThan(4.5)
    }
    // The plain roughing covers the whole floor, far from the corner; the rest pass never leaves its neighbourhood.
    const reach = (pts: Array<{ x: number; y: number }>) => Math.max(...pts.map((p) => Math.hypot(p.x - 10, p.y - 10)))
    expect(reach(feedPoints(full.gcode).filter((p) => p.z < -0.5))).toBeGreaterThan(20)
    expect(reach(cuts)).toBeLessThan(4.5)
  })

  test("adaptive clearing stays off the walls, covers the floor, and says what it is", () => {
    const walls = [
      { id: "a", type: "cube", width: 50, height: 15, depth: 12, x: 0, y: 17.5, z: -6 },
      { id: "b", type: "cube", width: 15, height: 50, depth: 12, x: 17.5, y: 0, z: -6 }
    ]
    const cornerStock = { width: 50, height: 50, depth: 12, radius: 0, x: 0, y: 0, topZ: 0, allowance: 1 }
    const run = (patch: Partial<ToolpathSettings>) => gen(
      settings({ operationType: "3d_surface", toolType: "endmill", toolDiameter: 6, depth: 6, stepdown: 3, stepover: 40, tolerance: 0.02, surfaceStrategy: "roughing", ...patch }),
      geometry({ geometryType: "selected", selectedElements: walls, stock: cornerStock })
    )
    const adaptive = run({ surfaceClearing: "adaptive", adaptiveEngagement: 12 })
    expect(adaptive.gcode).toContain("; Adaptive clearing: radial depth of cut held at 12.000 % of the tool diameter")
    const cuts = feedPoints(adaptive.gcode).filter((p) => p.z < -0.5)
    expect(cuts.length).toBeGreaterThan(200)
    // A 6 mm cutter beside walls at x = 10 and y = 10: its centre stays 3 mm away from both, wherever the walls are (over the stock;
    // past its edge there is nothing to hit).
    for (const p of cuts.filter((c) => c.x >= -25 && c.x <= 25 && c.y >= -25 && c.y <= 25)) {
      expect(p.x).toBeLessThanOrEqual(10 - 3 + 0.1)
      expect(p.y).toBeLessThanOrEqual(10 - 3 + 0.1)
    }
    // It reaches the far corners of the floor, like the contour-parallel clearing does.
    const far = (pts: Array<{ x: number; y: number }>) => Math.min(...pts.map((p) => p.x + p.y))
    expect(far(cuts)).toBeLessThan(far(feedPoints(run({}).gcode).filter((p) => p.z < -0.5)) + 6)
    expect(run({}).gcode).not.toContain("Adaptive clearing")
  })

  test("rest machining on a finishing strategy is rest finishing, said in the program, not a silent no-op", () => {
    const { gcode } = surface({ surfaceStrategy: "parallel", useRestMachining: true, restToolDiameter: 8 })
    expect(gcode).toContain("; Rest finishing: only where a 8.000 mm tool did not reach as low")
    expect(gcode).not.toContain("; Rest machining: only")
  })

  test("a tool that cannot cut a surface is said so and replaced by an end mill of the same diameter", () => {
    const { gcode } = surface({ surfaceStrategy: "parallel", toolType: "vbit" })
    expect(gcode).toContain("; Warning: A vbit tool cannot machine a surface")
  })
})

describe("adaptive feeds follow the path", () => {
  const feedOf = (line: string): number | undefined => { const m = /\bF(\d+(?:\.\d+)?)/.exec(line); return m ? Number(m[1]) : undefined }
  /** The feed in force at each G1/G2/G3 line, by reading the program the way a controller does (modal F). */
  const feedsOf = (gcode: string): Array<{ line: string; feed: number }> => {
    let feed = NaN
    const out: Array<{ line: string; feed: number }> = []
    for (const line of gcode.split("\n")) {
      const f = feedOf(line)
      if (f !== undefined) feed = f
      if (/^G0?[123]\b/.test(line)) out.push({ line, feed })
    }
    return out
  }

  test("slows into and out of a corner, in proportion to the turn, and back to the programmed feed on the straights", () => {
    const program = ["G90", "G0 X0 Y0 Z5", "G1 Z-1 F300", "G1 X0 Y0 F800", "G1 X50 Y0", "G1 X100 Y0", "G1 X100 Y50", "G1 X50 Y50", "G1 X0 Y50"].join("\n")
    const feeds = feedsOf(adaptFeeds(program, 6))
    const at = (x: string) => feeds.find((f) => f.line.includes(x))!.feed
    // Straight along +X, a 90 degree turn at (100, 0) and another at (100, 50): the moves into and out of a turn run at half the
    // feed, the straight before the first and after the second at the programmed one.
    expect(at("X50 Y0")).toBe(800)
    expect(at("X100 Y0")).toBe(400)
    expect(at("X100 Y50")).toBe(400)
    expect(at("X50 Y50")).toBe(400)
    expect(at("X0 Y50")).toBe(800)
  })

  test("a gentle turn is slowed less than a sharp one, and a nearly straight path not at all", () => {
    const turn = (deg: number) => {
      const r = (deg * Math.PI) / 180
      const program = ["G90", "G1 Z-1 F300", "G1 X0 Y0 F800", "G1 X50 Y0", `G1 X${(50 + 50 * Math.cos(r)).toFixed(3)} Y${(50 * Math.sin(r)).toFixed(3)}`].join("\n")
      return feedsOf(adaptFeeds(program, 6)).at(-1)!.feed
    }
    expect(turn(5)).toBe(800)
    expect(turn(45)).toBeLessThan(800)
    expect(turn(45)).toBeGreaterThan(turn(90))
    expect(turn(90)).toBe(400)
    expect(turn(170)).toBe(400)
  })

  test("a tight arc is slowed by its radius, a wide one is not, and a helical entry is left to its plunge feed", () => {
    const arc = (r: number, z = "") => {
      const program = ["G90", "G1 Z-1 F300", "G1 X0 Y0 F800", `G3 X${r} Y${r} ${z}I0 J${r}`].join("\n")
      return feedsOf(adaptFeeds(program, 6)).at(-1)!.feed
    }
    expect(arc(40)).toBe(800)
    expect(arc(6)).toBeCloseTo(800 * (6 / 9), 0) // radius 6 of 9 (1.5 diameters): two thirds
    expect(arc(3)).toBe(320) // a third would be 267, but the floor is 40 %
    expect(arc(3, "Z-2 ")).toBe(800)
  })

  test("vertical moves, rapids and a program without a feed come out as they went in", () => {
    const program = ["G90", "G0 X0 Y0 Z5", "G1 Z-1 F300", "G0 Z5", "G1 X10 Y0 F800", "G1 X10 Y10", "G0 Z10"].join("\n")
    const out = adaptFeeds(program, 6).split("\n")
    expect(out[0]).toBe("G90")
    expect(out[1]).toBe("G0 X0 Y0 Z5")
    expect(out[2]).toBe("G1 Z-1 F300")
    expect(out[3]).toBe("G0 Z5")
    expect(out[6]).toBe("G0 Z10")
    const noFeed = ["G90", "G1 X0 Y0", "G1 X10 Y0", "G1 X10 Y10"].join("\n")
    expect(adaptFeeds(noFeed, 6)).toBe(noFeed)
  })

  test("through the generator it is a mill setting: a square contour slows at its corners, with the flag off nothing changes", () => {
    const geom = geometry({ geometryType: "rectangle", width: 40, height: 30 } as Partial<GeometryInput>)
    const off = gen(settings({ operationType: "contour", offset: "outside" }), geom)
    const on = gen(settings({ operationType: "contour", offset: "outside", useAdaptiveFeeds: true }), geom)
    expect(off.gcode).not.toEqual(on.gcode)
    const slowed = feedsOf(on.gcode).filter((f) => f.feed < 800 && f.feed >= 0.4 * 800 - 1e-9 && /X|Y/.test(f.line))
    expect(slowed.length).toBeGreaterThan(0)
    expect(feedsOf(off.gcode).every((f) => f.feed === 800 || f.feed === 300 || Number.isNaN(f.feed))).toBe(true)
    // A printer has its own feed model: the flag does not touch it.
    const printer = (flag: boolean) => gen(settings({ machineType: "3dprinter", operationType: "standard", toolType: "standard", useAdaptiveFeeds: flag }), geometry({ geometryType: "selected", selectedElements: [{ id: "c", type: "cube", width: 10, height: 10, depth: 5, x: 0, y: 0, z: 2.5 }] })).gcode
    expect(printer(true)).toEqual(printer(false))
  })
})

describe("thread milling from the generator", () => {
  const hole = { id: "h", type: "circle", radius: 5, x: 3, y: -2, z: 0 }
  const thread = (patch: Partial<ToolpathSettings> = {}, element: Record<string, unknown> = hole) => gen(
    settings({ operationType: "threading", toolType: "endmill", toolDiameter: 6, depth: 9, feedrate: 300, plungerate: 100, threadPitch: 1.5, ...patch }),
    geometry({ geometryType: "selected", selectedElements: [element] })
  )

  test("a circle becomes a thread-milling helix instead of a contour with a note", () => {
    const { gcode } = thread({ threadPasses: 1 })
    expect(gcode).toContain("; Thread mill M10.000x1.500 internal right-hand")
    expect(gcode).not.toContain("following the contour instead")
    const helical = gcode.split("\n").filter((l) => /^G3 /.test(l) && /Z-?\d/.test(l))
    expect(helical.length).toBeGreaterThanOrEqual(6)
  })

  test("the settings reach the operation: external, left-hand, conventional and passes", () => {
    const external = thread({ threadType: "external", threadPasses: 2, threadSpringPasses: 1 })
    expect(external.gcode).toContain("external right-hand")
    expect(external.gcode).toContain("3 pass(es)")
    expect(thread({ threadHand: "left" }).gcode).toContain("left-hand")
    expect(thread({ direction: "conventional", threadPasses: 1 }).gcode).toMatch(/^G2 .*Z/m)
  })

  test("a cutter too large for the thread, and an element that is not round, are said so", () => {
    expect(thread({ toolDiameter: 8.6 }).gcode).toContain("does not fit the minor diameter")
    expect(thread({}, { id: "r", type: "rectangle", width: 10, height: 10, x: 0, y: 0, z: 0 }).gcode).toContain("needs a circle or a cylinder")
  })
})

describe("rest finishing from the generator", () => {
  test("with a finishing strategy, the previous tool restricts the path and the program says so", () => {
    const walls = [
      { id: "floor", type: "cube", width: 50, height: 50, depth: 6, x: 0, y: 0, z: -9 },
      { id: "wall", type: "cube", width: 15, height: 50, depth: 6, x: 17.5, y: 0, z: -3 }
    ]
    const stock = { width: 50, height: 50, depth: 12, radius: 0, x: 0, y: 0, topZ: 0, allowance: 1 }
    const finish = (patch: Partial<ToolpathSettings>) => gen(
      settings({ operationType: "3d_surface", toolType: "ballnose", toolDiameter: 2, depth: 6, stepdown: 3, stepover: 40, tolerance: 0.02, surfaceStrategy: "parallel", ...patch }),
      geometry({ geometryType: "selected", selectedElements: walls, stock })
    )
    const all = finish({})
    const pencil = finish({ useRestMachining: true, restToolDiameter: 6 })
    expect(pencil.gcode).toContain("; Rest finishing: only where a 6.000 mm tool did not reach as low")
    expect(all.gcode).not.toContain("Rest finishing")
    const pts = (g: string) => g.split("\n").filter((l) => /^G1 /.test(l)).length
    expect(pts(pencil.gcode)).toBeGreaterThan(0)
    expect(pts(pencil.gcode)).toBeLessThan(pts(all.gcode))
  })
})

describe("3D text is engraved", () => {
  const run = (element: Record<string, unknown>, patch: Partial<ToolpathSettings> = {}) =>
    gen(settings({ depth: 1, stepdown: 0.5, ...patch }), geometry({ geometryType: "selected", selectedElements: [element] })).gcode
  const moves = (gcode: string) => [...gcode.matchAll(/^G1 X(-?\d+\.\d+) Y(-?\d+\.\d+)/gm)].map((m) => [Number(m[1]), Number(m[2])] as const)

  test("each letter is cut along its strokes at every stepdown level, not as a bounding box", () => {
    const gcode = run({ type: "text3d", x: 0, y: 0, z: 0, text: "AB", height: 12, depth: 2 })
    expect(gcode).toContain("single-stroke font")
    expect(gcode.match(/; Z Level:/g)?.length).toBe(2)
    expect(gcode).not.toContain("approximated")
    const points = moves(gcode)
    expect(points.length).toBeGreaterThan(20)
    // Centred on the element, capitals 12 tall.
    expect(Math.min(...points.map((p) => p[1]))).toBeCloseTo(-6, 3)
    expect(Math.max(...points.map((p) => p[1]))).toBeCloseTo(6, 3)
    expect(Math.min(...points.map((p) => p[0]))).toBeCloseTo(-Math.max(...points.map((p) => p[0])), 3)
    // The tool starts at the top face (z + depth / 2) and never goes deeper than the text.
    expect(gcode).toMatch(/G1 Z0\.500 F/)
    expect(gcode).toMatch(/G1 Z0\.000 F/)
  })

  test("the engraving is as deep as the operation, never deeper than the text", () => {
    const gcode = run({ type: "text3d", x: 0, y: 0, z: 0, text: "I", height: 10, depth: 1 }, { depth: 5 })
    const depths = [...gcode.matchAll(/^G1 Z(-?\d+\.\d+) F/gm)].map((m) => Number(m[1]))
    expect(Math.min(...depths)).toBeCloseTo(-0.5, 6)
  })

  test("a character the font cannot draw is left out and named; empty text says so", () => {
    expect(run({ type: "text3d", x: 0, y: 0, z: 0, text: "A§", height: 10, depth: 2 })).toContain("no glyph in the engraving font: §")
    expect(run({ type: "text3d", x: 0, y: 0, z: 0, text: "", height: 10, depth: 2 })).toContain("No text content")
    expect(run({ type: "text3d", x: 0, y: 0, z: 0, text: "§", height: 10, depth: 2 })).toContain("no character the engraving font can draw")
  })
})

const timed = (s: ToolpathSettings, g: GeometryInput = geometry()) => {
  const started = performance.now()
  const outcome = generateToolpath({ settings: s, geometry: g, printer: DEFAULT_PRINTER_EXTRAS })
  return { ...outcome, ms: performance.now() - started }
}

describe("a request too large for the generator is answered with the reason, at once", () => {
  test("a depth over a stepdown that needs millions of levels", () => {
    expect(() => cutLevels(1000, 0.001)).toThrow(GenerationBudgetError)
    expect(() => cutLevels(1000, 0.001)).toThrow(/1,000,000 passes.*raise the stepdown/)
    expect(cutLevels(5, 1)).toEqual([-1, -2, -3, -4, -5])
    const r = timed(settings({ operationType: "contour", depth: 1000, stepdown: 0.001 }))
    expect(r.error).toMatch(/passes \(the most is 200,000\)/)
    expect(r.response.gcode).toStartWith("; Error:")
    expect(r.ms).toBeLessThan(1000)
  })

  test("a pocket whose stepover would write billions of moves", () => {
    const r = timed(settings({ operationType: "pocket", toolDiameter: 0.1, stepover: 1 }), geometry({ rectangleWidth: 500, rectangleHeight: 500 }))
    expect(r.error).toMatch(/rectangular pocket at this depth and stepover would take the program past 2,000,000 moves/)
    expect(r.ms).toBeLessThan(1000)
  })

  test("a polygon of a hundred thousand sides over many levels", () => {
    const r = timed(settings({ operationType: "profile", depth: 200, stepdown: 0.01 }), geometry({ geometryType: "polygon", polygonSides: 100_000, polygonRadius: 300 }))
    expect(r.error).toMatch(/polygon at this depth and stepover would take the program past/)
  })

  test("lathe passes, grooves and threads are bounded too", () => {
    const turning = timed(settings({ machineType: "lathe", operationType: "turning", depth: 1_000_000, stepdown: 0.001 }))
    expect(turning.error).toMatch(/needs 1,000,000,000 passes/)
    const grooving = timed(settings({ machineType: "lathe", operationType: "grooving", depth: 100_000_000 }))
    expect(grooving.error).toMatch(/groove depth needs 200,000,000 passes/)
    const threading = timed(settings({ machineType: "lathe", operationType: "threading", depth: 100_000_000 }))
    expect(threading.error).toMatch(/thread at this depth would take the program past/)
  })

  test("a print with hair-thin layers or a bead too fine for the part is refused before slicing", () => {
    const part = { id: "a", type: "cube", x: 0, y: 0, z: 50, width: 20, height: 20, depth: 100 }
    const thin = timed(settings({ machineType: "3dprinter", operationType: "standard", layerHeight: 0.001 }), geometry({ geometryType: "selected", selectedElements: [part] }))
    expect(thin.error).toMatch(/100,000 layers.*thicker layer/)
    const fine = timed(settings({ machineType: "3dprinter", operationType: "standard", nozzleDiameter: 0.01, extrusionWidth: 0.01 }), geometry({ geometryType: "selected", selectedElements: [{ ...part, width: 100, height: 100, depth: 10, z: 5 }] }))
    expect(fine.error).toMatch(/too large to slice in one job/)
  })

  test("the budget restarts with every run: a large request that fits is not charged for the one before", () => {
    const big = settings({ operationType: "contour", depth: 30, stepdown: 0.02 })
    for (let i = 0; i < 3; i++) expect(timed(big).error).toBeUndefined()
    expect(MAX_LEVELS).toBe(200_000)
    expect(MAX_MOVES).toBe(2_000_000)
  })

  test("an ordinary request is untouched", () => {
    const r = timed(settings({ operationType: "pocket" }), geometry({ rectangleWidth: 40, rectangleHeight: 30 }))
    expect(r.error).toBeUndefined()
    expect(r.response.gcode).toContain("Pocket operation")
  })
})
