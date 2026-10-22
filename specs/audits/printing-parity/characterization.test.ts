import { describe, test, expect } from "bun:test"
import * as Schema from "../../../packages/core/node_modules/effect/dist/Schema.js"
import * as g from "../../../packages/core/src/cam/generator/index.ts"
import * as v from "../../../packages/core/src/cam/viewer/index.ts"
import { verifyRequestFor } from "../../../packages/core/src/cam/verify/request.ts"
import { kernelMachineOfConfig } from "../../../packages/core/src/cam/kernel/machine-config.ts"

const cube = { id: "cube", type: "cube", x: 0, y: 0, z: 0.5, width: 20, height: 20, depth: 1 }
const req = (elements: ReadonlyArray<Record<string, unknown>> = [cube], settings = {}, printer = {}) => Schema.decodeUnknownSync(g.GenerateRequestSchema)({
  settings: { machineType: "3dprinter", operationType: "standard", toolType: "standard", optimizePath: false, useArcFitting: false, ...settings },
  geometry: { geometryType: "selected", selectedElements: elements }, printer
})
const run = (elements: ReadonlyArray<Record<string, unknown>> = [cube], settings = {}, printer = {}) => g.generateToolpath(req(elements, settings, printer))
const motion = (code: string) => { const a = g.analyseGcode(code); return v.buildTimeline(a.program, a.motion) }

describe("Current-source printing parity gaps (characterization, not acceptance)", () => {
  test("primitive infill density and pattern do not change NC", () => {
    expect(run([cube], {}, { infillDensity: 0 }).response.gcode).toBe(run([cube], {}, { infillDensity: 100, infillPattern: "lines" }).response.gcode)
  })
  test("primitive supports do not change NC", () => {
    expect(run([cube], {}, { supportType: "none" }).response.gcode).toBe(run([cube], {}, { supportType: "full" }).response.gcode)
  })
  test("all six printer operations produce identical NC", () => {
    const codes = g.PRINTER_OPERATIONS.map(operationType => run([cube], { operationType }).response.gcode)
    expect(new Set(codes).size).toBe(1)
  })
  test("auto orientation and print resolution do not change NC", () => {
    expect(run().response.gcode).toBe(run([cube], {}, { printResolution: "high", printOrientation: "auto-optimal" }).response.gcode)
  })
  test("nozzle diameter alone does not change NC", () => {
    expect(run([cube], { nozzleDiameter: 0.2 }).response.gcode).toBe(run([cube], { nozzleDiameter: 0.8 }).response.gcode)
  })
  test("second selected element is ignored", () => {
    expect(run([cube]).response.gcode).toBe(run([cube, { ...cube, id: "second", x: 50 }]).response.gcode)
  })
  test("primitive CAD rotation and scale fields do not change NC", () => {
    expect(run([{ ...cube, rotationY: 90, scaleX: 2, scaleY: 3, scaleZ: 4 }]).response.gcode).toBe(run().response.gcode)
  })
  test("composite placement note does not move children onto the bed", () => {
    const out = run([{ type: "composite", elements: [{ ...cube, z: 5.5 }] }])
    expect(out.response.gcode).toContain("bottom at Z0")
    expect(out.response.gcode).toContain("COMPOSITE LAYER 1 / 5 at Z=5.200")
    const r = req()
    const findings = v.checkSetup(v.printerSetupOf(r.settings), motion(out.response.gcode))
    expect(findings.map(f => f.code)).toContain("PRINTER_OFF_BED")
    expect(findings.map(f => f.code)).toContain("PRINTER_FIRST_LAYER_HIGH")
    console.log("AUDIT composite placement: says bottom at Z0; first layer=5.200; preview reports PRINTER_OFF_BED + PRINTER_FIRST_LAYER_HIGH")
  })
  test("default composite grid infill warning is absent from response warnings", () => {
    const out = run([{ type: "composite", elements: [cube] }])
    expect(out.response.gcode).toContain("Infill pattern 'grid' not fully implemented")
    expect(out.response.warnings).toEqual([])
    expect(out.response.evidence?.result).toBe("passed")
    console.log("AUDIT composite-default: missing grid infill; warnings=[]; evidence=passed")
  })
  test("unsupported geometry becomes a box while generation reports success", () => {
    const out = run([{ ...cube, type: "ellipsoid", radiusX: 10, radiusY: 5, radiusZ: 0.5 }])
    expect(out.error).toBeUndefined()
    expect(out.response.gcode).toContain("Approximating with bounding box")
    expect(out.response.warnings).toEqual([])
  })
  test("oversized print gets passed evidence, without structured warnings", () => {
    const out = run([cube], { bedWidth: 10, bedDepth: 10, buildHeight: 0.5 })
    expect(out.error).toBeUndefined()
    expect(out.response.warnings).toEqual([])
    expect(out.response.evidence?.result).toBe("passed")
    const findings = v.checkSetup(v.printerSetupOf(req([cube], { bedWidth: 10, bedDepth: 10, buildHeight: 0.5 }).settings), motion(out.response.gcode))
    expect(findings.map(f => f.code)).toContain("PRINTER_OFF_BED")
    expect(findings.map(f => f.code)).toContain("PRINTER_ABOVE_VOLUME")
    console.log("AUDIT oversized: generation success; warnings=[]; evidence=passed; preview reports PRINTER_OFF_BED + PRINTER_ABOVE_VOLUME")
  })
  test("final retract uses absolute E-2 rather than retracting 2 mm", () => {
    const code = run().response.gcode
    const body = code.split("; Part placed on the bed")[1]!.split("; Print End G-code")[0]!
    const previous = Number([...body.matchAll(/\bE([\d.]+)/g)].at(-1)![1])
    expect(code).toContain("M82 ; Set extruder to absolute mode")
    expect(code).toContain("G1 E-2 F3600 ; Retract filament")
    expect(-2 - previous).toBeLessThan(-20)
    console.log(`AUDIT final-retraction: deltaE=${(-2 - previous).toFixed(5)} mm; requested=2 mm`)
  })
  test("E-only retract has no timed move in preview", () => {
    const tl = motion("M82\nG92 E20\nG1 E18 F60")
    expect(tl.moves).toHaveLength(0)
    expect(tl.duration).toBe(0)
  })
  test("program IR alone loses extrusion; the parallel motion track is required", () => {
    const a = g.analyseGcode(run().response.gcode)
    expect(v.printerDeposits(v.buildTimeline(a.program, a.motion)).beads.length).toBeGreaterThan(0)
    expect(v.printerDeposits(v.buildTimeline(a.program)).beads).toHaveLength(0)
  })
  test("composite outlines duplicate overlapping member shells", () => {
    const one = motion(run([{ type: "composite", elements: [cube] }], {}, { infillDensity: 0 }).response.gcode)
    const two = motion(run([{ type: "composite", elements: [cube, { ...cube, id: "same-place" }] }], {}, { infillDensity: 0 }).response.gcode)
    const e = (tl: typeof one) => tl.moves.reduce((sum, m) => sum + Math.max(0, m.state.extrude), 0)
    expect(e(two)).toBeCloseTo(2 * e(one), 4)
  })
  test("small bed end move parks at Y200; preview checks do not report travel out of bed", () => {
    const r = req([cube], { bedWidth: 100, bedDepth: 100 })
    const out = g.generateToolpath(r)
    expect(out.response.gcode).toContain("G1 X0 Y200 F3000")
    expect(v.checkSetup(v.printerSetupOf(r.settings), motion(out.response.gcode)).some(f => f.code === "PRINTER_OFF_BED")).toBe(false)
  })
  test("printer accepts mill operation and cutter at shared schema", () => {
    const out = run([cube], { operationType: "pocket", toolType: "endmill", layerHeight: 2, nozzleDiameter: 0.2 })
    expect(out.error).toBeUndefined()
    expect(out.response.gcode).toContain("Print Start G-code")
  })
  test("printer has no milling verification adapter or native machine", () => {
    const r = req()
    expect(verifyRequestFor(r, run().response.gcode)).toEqual({ ok: false, error: "Verification supports milling operations only" })
    expect(kernelMachineOfConfig({ id: "p", name: "Printer", type: "printer", config: { workVolume: { x: 220, y: 220, z: 250 }, maxSpindleSpeed: 1000, maxFeedRate: 5000 } })).toBeUndefined()
  })
  test("text optimizer drops same-position extrusion without tracking E", () => {
    expect(g.optimizeToolpath("G1 X10 Y10 Z0.2 F1200\nG1 X10 Y10 Z0.2 E5 F1200", 0.01)).toBe("G1 X10 Y10 Z0.2 F1200")
  })
  test("arc fitting loses E on a fitted extruding run", () => {
    const points = Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 28; return `G1 X${(10 * Math.cos(a)).toFixed(5)} Y${(10 * Math.sin(a)).toFixed(5)} Z0.2 E${i + 1} F1200` }).join("\n")
    const fitted = g.convertLinesToArcs(points, 0.1)
    expect(fitted).toContain("Arc converted")
    expect(fitted).not.toMatch(/\bE\d/)
  })
})
