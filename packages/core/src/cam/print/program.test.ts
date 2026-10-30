import { describe, expect, test } from "bun:test"
import { printBodies } from "./bodies.ts"
import { slicePrint } from "./index.ts"
import { analyseProgram, checkProgram, estimateCost } from "./program.ts"

const AREA = Math.PI * 0.875 ** 2

const settings = { layerHeight: 0.2, printSpeed: 60, printTemperature: 200, bedTemperature: 60, extrusionWidth: 0.4, filamentDiameter: 1.75, infillDensity: 20, infillPattern: "grid", shellCount: 2, supportType: "none", nozzleDiameter: 0.4, bedWidth: 220, bedDepth: 220 }

describe("reading a program", () => {
  test("a hand-written square: filament, volume, bounds, travel and layers come out as the motions say", () => {
    const e1 = 10 * 0.4 * 0.2 / AREA // 10 mm of 0.4 x 0.2 bead
    const program = [
      "G21", "G90", "M82", "G92 E0", "G28", "M104 S200", "M140 S60",
      "G1 Z0.2 F600", "G1 X10 Y10 F6000",
      `G1 X20 Y10 E${e1.toFixed(6)}`, `G1 X20 Y20 E${(2 * e1).toFixed(6)}`, `G1 X10 Y20 E${(3 * e1).toFixed(6)}`, `G1 X10 Y10 E${(4 * e1).toFixed(6)}`,
      "G1 E0.3 F2400", "G1 X30 Y30 F9000"
    ].join("\n")
    const a = analyseProgram(program)
    expect(a.extrudingMoves).toBe(4)
    expect(a.printLength).toBeCloseTo(40, 9)
    expect(a.filamentMm).toBeCloseTo(4 * e1, 5)
    expect(a.volume).toBeCloseTo(40 * 0.4 * 0.2, 5)
    expect(a.printBounds).toEqual({ min: [10, 10, 0.2], max: [20, 20, 0.2] })
    expect(a.motionBounds!.max).toEqual([30, 30, 0.2])
    expect(a.retractions).toBe(1)
    expect(a.travelLength).toBeCloseTo(Math.hypot(10, 10) + Math.hypot(20, 20) + 0.2, 6)
    expect(a.layers).toHaveLength(1)
    expect(a.layers[0]!.volume).toBeCloseTo(a.volume, 12)
    expect(a.maxNozzleTemperature).toBe(200)
    expect(a.maxBedTemperature).toBe(60)
    expect(a.dialect).toBe("marlin")
  })

  test("relative extrusion and G92 resets give the same filament", () => {
    const abs = ["M82", "G92 E0", "G1 X10 E1", "G1 X20 E2", "G92 E0", "G1 X30 E1"].join("\n")
    const rel = ["M83", "G1 X10 E1", "G1 X20 E1", "G1 X30 E1"].join("\n")
    expect(analyseProgram(abs).filamentMm).toBeCloseTo(3, 12)
    expect(analyseProgram(rel).filamentMm).toBeCloseTo(3, 12)
  })

  test("a full circle by G2 is its circumference, with the filament spread along it", () => {
    const a = analyseProgram(["M83", "G1 X5 Y0 F6000", "G2 X5 Y0 I-5 J0 E10 F3000"].join("\n"))
    expect(a.printLength).toBeGreaterThan(2 * Math.PI * 5 * 0.9995)
    expect(a.printLength).toBeLessThan(2 * Math.PI * 5 * 1.0005)
    expect(a.filamentMm).toBeCloseTo(10, 9)
    // The bounds of the arc are the circle's.
    expect(a.printBounds!.min[0]).toBeGreaterThan(-5.01)
    expect(a.printBounds!.max[1]).toBeLessThan(5.01)
    expect(a.printBounds!.min[0]).toBeLessThan(-4.99)
  })

  test("time follows the planner: a trapezoid, a triangle for a short move, no stop at a straight junction", () => {
    const long = analyseProgram("G1 X100 F6000", { acceleration: 1000 })
    expect(long.timeSeconds).toBeCloseTo(1.1, 9)
    const short = analyseProgram("G1 X2 F6000", { acceleration: 1000 })
    expect(short.timeSeconds).toBeCloseTo(2 * Math.sqrt(1000 * 2) / 1000, 9)
    const split = analyseProgram("G1 X50 F6000\nG1 X100 F6000", { acceleration: 1000 })
    expect(split.timeSeconds).toBeCloseTo(1.1, 9)
    // A right-angle corner slows to the jerk limit, so the same length takes longer.
    const corner = analyseProgram("G1 X50 F6000\nG1 X50 Y50 F6000", { acceleration: 1000, jerk: 10 })
    // Each 50 mm leg runs 0 -> 100 -> junction speed 10 / |d1 - d2| = 7.07 mm/s: accelerate, cruise, brake.
    const vj = 10 / Math.SQRT2
    const leg = 0.1 + (100 - vj) / 1000 + (50 - 5 - (100 * 100 - vj * vj) / 2000) / 100
    expect(corner.timeSeconds).toBeCloseTo(2 * leg, 9)
    expect(corner.timeSeconds).toBeGreaterThan(split.timeSeconds)
    // Jerk large enough to ignore the corner gives the straight time.
    expect(analyseProgram("G1 X50 F6000\nG1 X50 Y50 F6000", { acceleration: 1000, jerk: 1000 }).timeSeconds).toBeCloseTo(1.1, 9)
    // A dwell adds its seconds.
    expect(analyseProgram("G4 S2.5\nG1 X100 F6000", { acceleration: 1000 }).timeSeconds).toBeCloseTo(3.6, 9)
  })

  test("the dialect is read from the words, and a wrong declaration is called out", () => {
    const klipper = analyseProgram(["START_PRINT BED=60 EXTRUDER=200", "SET_PRESSURE_ADVANCE ADVANCE=0.04", "G1 X10 E1"].join("\n"))
    expect(klipper.dialect).toBe("klipper")
    expect(klipper.opaque.map((o) => o.word)).toEqual(["START_PRINT", "SET_PRESSURE_ADVANCE"])
    expect(klipper.issues.some((i) => i.code === "OpaqueCommand")).toBe(true)
    const bambu = analyseProgram(["; BambuStudio 01.09", "M1002 gcode_claim_action : 2", "M620 S0A", "T0", "M621 S0A", "G1 X10 E1"].join("\n"))
    expect(bambu.dialect).toBe("bambu")
    const reprap = analyseProgram(["M116", "M572 D0 S0.05", "G10 P0 S210", "G1 X10 E1"].join("\n"))
    expect(reprap.dialect).toBe("reprap")
    expect(reprap.firmwareRetractions).toBe(1)
    expect(analyseProgram("M900 K0.05\nM83\nG1 X10 E1").dialect).toBe("marlin")
    const wrong = analyseProgram("M116\nG1 X1 E1", { dialect: "marlin" })
    expect(wrong.issues.some((i) => i.code === "DialectMismatch")).toBe(true)
    expect(analyseProgram("G1 X1\nM9999").issues.some((i) => i.code === "UnknownWord")).toBe(true)
  })

  test("tool changes split the filament by tool", () => {
    const a = analyseProgram(["M83", "T0", "G1 X10 E1", "T1", "G1 X20 E2", "T0", "G1 X30 E1"].join("\n"))
    expect(a.toolChanges).toBe(2)
    expect(a.tools).toEqual([{ tool: 0, filamentMm: 2, volume: 2 * AREA }, { tool: 1, filamentMm: 2, volume: 2 * AREA }])
  })

  test("a travel that drags the nozzle through a printed wall is a collision; with a hop it is not", () => {
    const wall = ["M83", "G1 X0 Y0 Z5 F6000", "G1 X20 Y0 Z5 E1", "G1 X20 Y1 Z5 E0.1"]
    const through = analyseProgram([...wall, "G1 X-5 Y0.5 Z1 F6000", "G1 X30 Y0.5 Z1"].join("\n"))
    expect(through.collisions.length).toBeGreaterThan(0)
    expect(through.issues.some((i) => i.code === "TravelCollision")).toBe(true)
    const hop = analyseProgram([...wall, "G1 X-5 Y0.5 Z5.5 F6000", "G1 X30 Y0.5 Z5.5"].join("\n"))
    expect(hop.collisions).toEqual([])
    // Travelling over the top of what was just printed at its own layer height is not a collision either.
    expect(analyseProgram([...wall, "G1 X-5 Y0.5 Z5", "G1 X30 Y0.5 Z5"].join("\n")).collisions).toEqual([])
  })
})

describe("judging a sliced program", () => {
  const meshes = printBodies([{ id: "c", type: "cube", x: 0, y: 0, z: 5, width: 20, height: 20, depth: 10 }] as never).meshes
  const partVolume = 4000
  const bed = { width: 220, depth: 220, height: 250 }

  test("the slicer's own program passes every check, and the planner agrees with the claimed time", () => {
    const result = slicePrint(meshes, settings as never)
    const analysis = analyseProgram(result.gcode, { bed, filamentDiameter: 1.75, nozzle: 0.4 })
    const checks = checkProgram(analysis, { bed }, { partVolume, claimedTimeSeconds: result.stats.timeSeconds, timeTolerance: 0.3 })
    expect(checks.filter((c) => c.status === "failed")).toEqual([])
    expect(analysis.printBounds!.min[2]).toBeCloseTo(0.2, 6)
    expect(analysis.printBounds!.max[2]).toBeCloseTo(10, 6)
    // The prime line is the only unlabelled deposit: everything the slicer counted is labelled.
    const labelled = Object.entries(analysis.volumeByType).filter(([k]) => k !== "unlabelled").reduce((sum, [, v]) => sum + v, 0)
    expect(labelled / (Math.PI * 0.875 ** 2)).toBeCloseTo(result.stats.filamentMm, 1)
    expect(analysis.filamentMm).toBeGreaterThan(result.stats.filamentMm)
    expect(analysis.layers.length).toBeGreaterThanOrEqual(50)
    expect(Object.keys(analysis.volumeByType)).toContain("WALL-OUTER")
  })

  test("the time the slicer reports is the planner's reading of the program it wrote, header included", () => {
    const result = slicePrint(meshes, settings as never)
    const read = analyseProgram(result.gcode, { collisions: false })
    expect(result.stats.timeSeconds).toBeCloseTo(read.timeSeconds, 6)
    expect(result.stats.pathTimeSeconds).toBeLessThan(result.stats.timeSeconds)
    expect(result.gcode).toContain(`; Estimated time ${Math.round(read.timeSeconds)} s`)
  })

  test("over-extrusion breaks the volume bound; a program that leaves the bed breaks the build volume", () => {
    const fat = slicePrint(meshes, { ...settings, infillDensity: 100, flow: 160 } as never)
    const checks = checkProgram(analyseProgram(fat.gcode, { bed }), { bed }, { partVolume })
    expect(checks.find((c) => c.id === "volume-bound")!.status).toBe("failed")
    const ok = slicePrint(meshes, settings as never)
    expect(checkProgram(analyseProgram(slicePrint(meshes, { ...settings, infillDensity: 100 } as never).gcode, { bed }), { bed }, { partVolume }).find((c) => c.id === "volume-bound")!.status).toBe("passed")
    const small = checkProgram(analyseProgram(ok.gcode, { bed }), { bed: { width: 100, depth: 100, height: 250 } }, { partVolume })
    expect(small.find((c) => c.id === "build-volume")!.status).toBe("failed")
  })

  test("a wrong claimed time is caught", () => {
    const result = slicePrint(meshes, settings as never)
    const analysis = analyseProgram(result.gcode, { bed })
    const wrong = checkProgram(analysis, { bed }, { partVolume, claimedTimeSeconds: analysis.timeSeconds * 3 })
    expect(wrong.find((c) => c.id === "time-model")!.status).toBe("failed")
  })
})

describe("cost", () => {
  test("material, machine, energy and labour add up", () => {
    const c = estimateCost({ grams: 250, hours: 4, filamentPerKg: 20, machinePerHour: 2, powerKw: 0.12, energyPerKwh: 0.25, waste: 0.1, labour: 1.5 })
    expect(c.material).toBeCloseTo(0.25 * 20 * 1.1, 12)
    expect(c.machine).toBe(8)
    expect(c.energy).toBeCloseTo(0.12, 12)
    expect(c.total).toBeCloseTo(5.5 + 8 + 0.12 + 1.5, 12)
  })
})
