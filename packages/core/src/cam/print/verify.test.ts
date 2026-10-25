import { describe, expect, test } from "bun:test"
import { resolveProfile } from "./profile.ts"
import { replayBeads, verifyPrint } from "./verify.ts"
import { PRINT_MAX_LAYERS, PRINT_WORK_LIMIT, printWorkIssue, slicePrint } from "./index.ts"
import { DEFAULT_PRINTER_EXTRAS, DEFAULT_SETTINGS, printerSettingsOf } from "../generator/index.ts"

const profile = resolveProfile({ layerHeight: 0.2, printSpeed: 60, printTemperature: 200, bedTemperature: 60, extrusionWidth: 0.4, filamentDiameter: 1.75, infillDensity: 20, infillPattern: "grid", shellCount: 1, supportType: "none" })
const head = "G21 G90\nM83\nG28\nM109 S200\nM190 S60\n"
const body = ";LAYER:0\n;HEIGHT:0.2\n;TYPE:WALL-OUTER\nG1 X10 Y10 Z0.2 F600\nG1 X20 E0.3326\n"
const checks = (code: string) => Object.fromEntries(verifyPrint({ gcode: code, profile, regions: [[{ outer: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }], holes: [] }]], firstModelLayer: 0, layers: [{ index: 0, z: 0.2, height: 0.2 }] }).map((c) => [c.id, c]))

describe("printer evidence follows controller state", () => {
  test("compact modal and relative motion uses actual coordinates and E deltas", () => {
    const result = replayBeads("G21G90\nM83\nG1X1Y2Z0.2E0.5F600\nX2E0.25\nG91\nX1Y1E0.1\nG90\nM83\nG92E0\nG1X5E0.2")
    expect(result.beads.map((b) => [b.x0, b.y0, b.x1, b.y1])).toEqual([[0, 0, 1, 2], [1, 2, 2, 2], [2, 2, 3, 3], [3, 3, 5, 3]])
    for (const [i, e] of [0.5, 0.25, 0.1, 0.2].entries()) expect(result.beads[i]!.e).toBeCloseTo(e, 12)
    expect(result.filamentMm).toBeCloseTo(1.05, 9)
  })

  test("inch extrusion and coordinate resets are converted to millimetres", () => {
    const result = replayBeads("G20 G90 M82\nG92 E1\nG1 X1 E1.5 F60")
    expect(result.beads).toHaveLength(1)
    expect(result.beads[0]!.x1).toBeCloseTo(25.4, 9)
    expect(result.filamentMm).toBeCloseTo(12.7, 9)
  })

  test("arc deposition conserves filament and includes exact travel extrema", () => {
    const result = replayBeads("G21 G90 M83\nG1 X10 Y0 Z0.2 F600\nG3 X10 Y0 I-10 J0 E2")
    expect(result.errors).toEqual([])
    expect(result.beads.length).toBeGreaterThan(16)
    expect(result.filamentMm).toBeCloseTo(2, 9)
    expect(Math.min(...result.beads.map((b) => b.x1))).toBeCloseTo(-10, 9)
    expect(Math.max(...result.beads.map((b) => b.y1))).toBeCloseTo(10, 9)
    expect(Math.min(...result.beads.map((b) => b.y1))).toBeCloseTo(-10, 9)
  })

  test("non-extruding travel off the bed or above build height fails", () => {
    expect(checks(head + body + "G1 X300 F600\n")["bed-fit"]!.status).toBe("failed")
    expect(checks(head + body + "G91\nG1 Z260 F600\n")["bed-fit"]!.status).toBe("failed")
    expect(checks(head + body + "G1 Z-1 F600\n")["bed-fit"]!.status).toBe("failed")
  })

  test("setting a heater is not waiting for it, and zero is not hot", () => {
    expect(checks(head.replace("M109 S200", "M104 S200") + body)["heated-start"]!.status).toBe("failed")
    expect(checks(head.replace("M109 S200", "M109 S0") + body)["heated-start"]!.status).toBe("failed")
    expect(checks(head.replace("M190 S60", "M140 S60") + body)["heated-start"]!.status).toBe("failed")
    expect(checks(head + "M104 S0\n" + body)["heated-start"]!.status).toBe("failed")
  })

  test("deposition before homing fails startup evidence", () => {
    expect(checks(head.replace("G28\n", "") + body)["heated-start"]!.status).toBe("failed")
    expect(checks(head.replace("G28", "G28 X") + body)["heated-start"]!.status).toBe("failed")
    expect(checks(head.replace("G28", "G28 X\nG28YZ") + body)["heated-start"]!.status).toBe("passed")
    expect(checks(head.replace("G28", "G28 X\nG28YZ") + body)["nc-interpretation"]!.status).toBe("passed")
  })

  test("layer comments cannot place a bead at another physical Z", () => {
    expect(checks(head + body.replace("Z0.2", "Z0.6"))["layers-rise"]!.status).toBe("failed")
  })

  test("HEIGHT annotations cannot change independently measured filament volume", () => {
    expect(checks(head + body)["filament"]!.status).toBe("passed")
    expect(checks(head + body.replace(";HEIGHT:0.2", ";HEIGHT:20"))["filament"]!.status).toBe("passed")
  })

  test("unsupported NC and opaque start macros cannot pass replay evidence", () => {
    expect(checks(head + "G123\n" + body)["nc-interpretation"]?.status).toBe("failed")
    expect(checks("START_PRINT\n" + head + body)["nc-interpretation"]?.status).not.toBe("passed")
    for (const command of ["M221 S150", "M302 S0", "G53 G0 X0"]) expect(checks(head + command + "\n" + body)["nc-interpretation"]!.status).toBe("failed")
    expect(checks(head + "SHOP_START\n" + body)["nc-interpretation"]!.status).toBe("failed")
    for (const command of ["G1 XNaN", "G1 XInfinity", "G1 X10 JUNK", "G1 A30", "T1", "SET_PRESSURE_ADVANCE ADVANCE=NaN"]) expect(checks(head + command + "\n" + body)["nc-interpretation"]!.status).toBe("failed")
  })

  test("a bead whose centre fits but whose width crosses the bed edge fails", () => {
    expect(checks(head + body.replace("Y10", "Y0.1"))["bed-fit"]!.status).toBe("failed")
  })

  test("missing model geometry is unresolved, never empty passing evidence", () => {
    const result = verifyPrint({ gcode: head + body, profile, regions: [], layers: [{ index: 0, z: 0.2, height: 0.2 }], firstModelLayer: 0 })
    for (const id of ["wall-coverage", "skin-coverage", "no-spill", "filament"]) expect(result.find((c) => c.id === id)!.status).toBe("unresolved")
  })
})

const box = (w: number, d: number, h: number) => {
  const x = w / 2, y = d / 2
  return {
    positions: new Float64Array([-x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0, -x, -y, h, x, -y, h, x, y, h, -x, y, h]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7])
  }
}
const settings = (patch: Record<string, unknown> = {}) => printerSettingsOf({ ...DEFAULT_SETTINGS, machineType: "3dprinter", ...patch } as never, DEFAULT_PRINTER_EXTRAS)

describe("a print too large to slice is refused before any layer is cut", () => {
  test("the estimate names the layers and the way out", () => {
    expect(printWorkIssue(100, 400, 0.4, 0.2)).toBeUndefined()
    expect(printWorkIssue(PRINT_MAX_LAYERS + 1, 400, 0.4, 0.001)).toMatch(/use a thicker layer/)
    expect(printWorkIssue(10_000, 160_000, 0.4, 0.05)).toMatch(/too large to slice in one job.*thicker layer or a wider nozzle/)
    expect(PRINT_WORK_LIMIT).toBeGreaterThan(1e9)
  })

  test("a hair-thin layer on a tall part throws at once, not after minutes", () => {
    const started = performance.now()
    expect(() => slicePrint([box(20, 20, 100)], settings({ layerHeight: 0.001 }))).toThrow(/thicker layer/)
    expect(performance.now() - started).toBeLessThan(2000)
  })

  test("a normal part still slices", () => {
    const r = slicePrint([box(20, 20, 10)], settings())
    expect(r.stats.layers).toBeGreaterThan(10)
    expect(r.checks.every((c) => c.status === "passed")).toBe(true)
  })
})
