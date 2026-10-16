import { describe, expect, test } from "bun:test"
import { DEFAULT_SETTINGS, decodeSettings, generateToolpath } from "../../src/cam/generator/index.ts"
import { KINEMATICS, cadToLathe, cadToMachine, checkAxes, kinematicsOf } from "../../src/cam/machine.ts"

const codes = (gcode: string, kind: "mill" | "lathe" | "3dprinter") => checkAxes(gcode, kind).map((i) => i.code)
const errors = (gcode: string, kind: "mill" | "lathe" | "3dprinter") => checkAxes(gcode, kind).filter((i) => i.severity === "error")

describe("kinematics", () => {
  test("who turns and who builds", () => {
    expect(kinematicsOf("mill")).toMatchObject({ rotates: "tool", process: "subtractive", plane: "G17", xIsDiameter: false })
    expect(kinematicsOf("lathe")).toMatchObject({ rotates: "workpiece", process: "subtractive", plane: "G18", xIsDiameter: true })
    expect(kinematicsOf("3dprinter")).toMatchObject({ rotates: "nothing", process: "additive" })
  })

  test("a lathe has two axes, a mill three, a printer three plus the filament", () => {
    expect(KINEMATICS.lathe.axes.map((a) => a.name)).toEqual(["X", "Z"])
    expect(KINEMATICS.mill.axes.map((a) => a.name)).toEqual(["X", "Y", "Z"])
    expect(KINEMATICS["3dprinter"].axes.map((a) => a.name)).toEqual(["X", "Y", "Z", "E"])
    expect(KINEMATICS.lathe.axes.every((a) => a.moves === "tool")).toBe(true)
  })

  test("the operations listed are the ones the generator accepts for that machine", () => {
    for (const kind of ["mill", "lathe", "3dprinter"] as const) {
      for (const operationType of KINEMATICS[kind].operations) {
        expect(() => decodeSettings({ machineType: kind, operationType }), `${kind}:${operationType}`).not.toThrow()
      }
    }
  })

  test("the drawing maps to machine axes: lathe by diameter and negative Z, others unchanged", () => {
    expect(cadToLathe({ x: 12.5, y: 80 }, 100)).toEqual({ X: 25, Z: -20 })
    expect(cadToLathe({ x: 0, y: 100 }, 100)).toEqual({ X: 0, Z: 0 })
    expect(cadToMachine("mill", { x: 1, y: 2, z: -3 })).toEqual({ X: 1, Y: 2, Z: -3 })
    expect(cadToMachine("3dprinter", { x: 1, y: 2 })).toEqual({ X: 1, Y: 2, Z: 0 })
  })
})

describe("checkAxes: what is illogical for the machine", () => {
  test("a lathe has no Y, never goes through the axis, needs its spindle and a thread pitch", () => {
    expect(codes("G18\nM3 S800\nG0 X40 Y5 Z2", "lathe")).toContain("LATHE_Y_AXIS")
    expect(codes("G18\nM3 S800\nG1 X-10 Z-5 F100", "lathe")).toContain("LATHE_X_NEGATIVE")
    expect(codes("G18\nG1 X20 Z-5 F100", "lathe")).toContain("LATHE_NO_SPINDLE")
    expect(codes("G18\nM3 S800\nG32 Z-20", "lathe")).toContain("THREAD_NO_PITCH")
    expect(codes("G0 X20 Z2\nM3 S500", "lathe")).toContain("PLANE_MISSING")
    expect(errors("G18\nM3 S800\nG0 X52 Z2\nG1 X-1 F80\nG1 Z-30 F100", "lathe")).toEqual([])
  })

  test("cutting away from the chuck is flagged on a lathe", () => {
    expect(codes("G18\nM3 S800\nG0 X30 Z2\nG1 Z30 F100", "lathe")).toContain("LATHE_Z_AWAY")
    expect(codes("G18\nM3 S800\nG0 X30 Z2\nG1 Z-30 F100", "lathe")).not.toContain("LATHE_Z_AWAY")
  })

  test("a mill needs its tool turning, has no extruder and no lathe plane", () => {
    expect(codes("G17\nG1 X10 F100", "mill")).toContain("MILL_NO_SPINDLE")
    expect(codes("G17\nM3 S8000\nG1 X10 E5 F100", "mill")).toContain("MILL_EXTRUDER")
    expect(codes("G18\nM3 S8000\nG0 X1", "mill")).toContain("PLANE_MISMATCH")
    expect(errors("G17\nM3 S8000\nG0 Z5\nG1 Z-1 F100\nG1 X10", "mill")).toEqual([])
  })

  test("a printer has no spindle, never extrudes cold and only builds upwards", () => {
    expect(codes("G28\nM3 S1000", "3dprinter")).toContain("PRINTER_SPINDLE")
    expect(codes("G28\nG1 X10 E1 F1000", "3dprinter")).toContain("PRINTER_COLD_EXTRUSION")
    const down = "G28\nM109 S200\nG92 E0\nG1 Z0.4 F1000\nG1 X10 E1\nG1 Z0.8\nG1 X20 E2\nG1 Z0.4\nG1 X30 E3"
    expect(codes(down, "3dprinter")).toContain("PRINTER_LAYER_DOWN")
    const up = "G28\nM109 S200\nG92 E0\nG1 Z0.2 F1000\nG1 X10 E1\nG1 Z0.4\nG1 X20 E2\nG1 Z0.6\nG1 X30 E3"
    expect(errors(up, "3dprinter")).toEqual([])
    expect(codes("G1 X1", "3dprinter")).toContain("PRINTER_NOT_HOMED")
  })

  test("relative extrusion is followed too", () => {
    expect(codes("G28\nG91\nG1 X10 E1 F1000", "3dprinter")).toContain("PRINTER_COLD_EXTRUSION")
  })
})

describe("what the generator writes agrees with its machine", () => {
  const run = (settings: Record<string, unknown>, selected: Array<Record<string, unknown>> = []) =>
    generateToolpath({
      settings: decodeSettings(settings),
      geometry: { geometryType: "selected", rectangleWidth: 100, rectangleHeight: 50, circleRadius: 25, polygonSides: 6, polygonRadius: 30, customPath: "", selectedElements: selected,
        stock: { width: 120, height: 80, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 1 } },
      printer: { infillDensity: 20, infillPattern: "grid", supportType: "minimal", shellCount: 2, printResolution: "standard", printOrientation: "original" }
    } as never).response.gcode

  test("every lathe operation turns the workpiece, uses X and Z only, and works towards the chuck", () => {
    for (const operationType of KINEMATICS.lathe.operations) {
      const gcode = run({ machineType: "lathe", toolType: "turning", operationType })
      expect(errors(gcode, "lathe"), operationType).toEqual([])
      expect(codes(gcode, "lathe"), operationType).not.toContain("LATHE_Z_AWAY")
      expect(gcode).not.toMatch(/\bY[-\d]/)
    }
  })

  test("a counter-clockwise spindle is M4, clockwise M3", () => {
    expect(run({ machineType: "lathe", toolType: "turning", operationType: "turning", spindleDirection: "ccw" })).toMatch(/M4 S\d+ ; Start spindle counter-clockwise/)
    expect(run({ machineType: "lathe", toolType: "turning", operationType: "turning" })).toMatch(/M3 S\d+ ; Start spindle clockwise/)
  })

  test("external turning feeds into the part, below the face (negative Z)", () => {
    const gcode = run({ machineType: "lathe", toolType: "turning", operationType: "turning", depth: 2, stepdown: 1, stockLength: 60 })
    expect(gcode).toContain("G1 Z-38.000")
    expect(gcode).not.toMatch(/G1 Z60/)
  })

  test("every lathe operation stays in front of the chuck jaws (spec 31)", () => {
    for (const operationType of ["facing", "turning", "boring", "threading", "grooving", "parting", "knurling"]) {
      for (const [stockLength, gripLength] of [[100, 20], [40, 25], [30, 20]] as const) {
        const gcode = run({ machineType: "lathe", operationType, depth: 2, stepdown: 1, stockLength, gripLength })
        const zs = [...gcode.matchAll(/^G(?:1|32) .*?\bZ(-?[\d.]+)/gm)].map((m) => Number(m[1]))
        expect(Math.min(...zs, 0), `${operationType} ${stockLength}/${gripLength}`).toBeGreaterThanOrEqual(-(stockLength - gripLength - 2) - 1e-9)
      }
    }
    // A short grip lets it go further.
    expect(run({ machineType: "lathe", toolType: "turning", operationType: "turning", depth: 2, stepdown: 1, stockLength: 60, gripLength: 5 })).toContain("G1 Z-53.000")
  })

  test("mill programs turn the tool and stay in the mill's plane", () => {
    const gcode = run({ operationType: "contour" }, [{ id: "r", type: "rectangle", x: 0, y: 0, z: 0, width: 40, height: 30, layerId: "l" }])
    expect(errors(gcode, "mill")).toEqual([])
    expect(codes(gcode, "mill")).not.toContain("PLANE_MISMATCH")
  })

  test("a printed part is built bottom-up, hot, with extruder and no spindle", () => {
    const gcode = run({ machineType: "3dprinter", operationType: "standard", toolType: "standard" }, [{ id: "c", type: "cube", x: 0, y: 0, z: 0, width: 20, height: 20, depth: 4, layerId: "l" }])
    expect(errors(gcode, "3dprinter")).toEqual([])
    expect(codes(gcode, "3dprinter")).not.toContain("PRINTER_SPINDLE")
    expect(codes(gcode, "3dprinter")).not.toContain("PRINTER_LAYER_DOWN")
    expect(gcode).toMatch(/M109 S\d+/)
  })

  test("defaults decode for every machine", () => {
    expect(DEFAULT_SETTINGS.machineType).toBe("mill")
  })
})
