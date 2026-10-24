import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { cam } from "../../src/index.ts"
import { GenerateRequestSchema, generateToolpath, machineForProgramOf, fiveAxisProblem, decodeSettings } from "../../src/cam/generator/index.ts"

const umcConfig = {
  axes: 5,
  controller: "Haas",
  workVolume: { x: 610, y: 406, z: 406 },
  maxSpindleSpeed: 8100,
  maxFeedRate: 16500,
  rotary: { layout: "table-BC", tilt: { min: -35, max: 120 }, rotation: { min: 0, max: 360 }, tcp: "control" }
}

const request = (machineConfig: Record<string, unknown>, operation = "multiaxis") => Schema.decodeUnknownSync(GenerateRequestSchema)({
  settings: decodeSettings({
    machineType: "mill", operationType: operation, toolType: "endmill", toolDiameter: 6, flutes: 3,
    depth: 10, stepdown: 10, rpm: 8100, feedrate: 2000, plungerate: 500, fiveAxisToolAxis: "lead", fiveAxisLead: 15
  }),
  geometry: {
    geometryType: "selected",
    selectedElements: [{ id: "part", type: "cube", x: 0, y: 0, z: -5, width: 40, height: 40, depth: 10 }],
    stock: { width: 50, height: 50, depth: 12, x: 0, y: 0, topZ: 0 }
  },
  machine: machineForProgramOf({ id: "umc", name: "Haas UMC-500", config: machineConfig })
})

describe("machine library entry for the generator", () => {
  test("a 5-axis entry carries its rotary table and the controller in post form", () => {
    const m = machineForProgramOf({ id: "umc", name: "UMC", config: umcConfig })
    expect(m.axes).toBe(5)
    expect(m.controller).toBe("haas")
    expect(m.fiveAxis).toEqual({ layout: "table-BC", tilt: { min: -35, max: 120 }, rotation: { min: 0, max: 360 }, tcp: "control" })
  })

  test("a 5-axis entry without its rotary table is returned without one", () => {
    const m = machineForProgramOf({ id: "x", name: "x", config: { axes: 5, controller: "haas" } })
    expect(m.fiveAxis).toBeUndefined()
    expect(fiveAxisProblem({ axes: 5 })).toContain("rotary table")
  })

  test("a consistent 5-axis configuration reports no problem; a reversed tilt range does", () => {
    expect(fiveAxisProblem(umcConfig)).toBeUndefined()
    expect(fiveAxisProblem({ ...umcConfig, rotary: { layout: "table-BC", tilt: { min: 120, max: -35 } } })).toContain("min <= max")
  })
})

describe("5-axis program from the generator", () => {
  test("the Haas controller writes the TCP section and the rotary words", () => {
    const outcome = generateToolpath(request(umcConfig))
    expect(outcome.error).toBeUndefined()
    expect(outcome.response.gcode).toContain("G234 H1")
    expect(outcome.response.gcode).toMatch(/B-?\d+\.\d{3}/)
    expect(outcome.response.gcode.startsWith("%")).toBe(true)
    expect(outcome.response.gcode).toContain("M30")
    // The text is read back into the IR with the rotary angles, so the viewport and verification see them.
    const linear = outcome.response.program.toolpaths[0]!.moves.find((m) => m._tag === "Linear" && m.rotary !== undefined)
    expect(linear).toBeDefined()
  })

  test("each control writes its own tip-control words when the machine declares them, and none for machine coordinates", () => {
    const rotary = (tcp: "control" | "program") => ({ ...umcConfig.rotary, tcp })
    const word = (controller: string, tcp: "control" | "program") => request({ ...umcConfig, controller, rotary: rotary(tcp) })
    for (const [controller, on, off] of [["Fanuc", "G43.4 H1", "G43 H1"], ["Haas", "G234 H1", "G43 H1"], ["Siemens", "TRAORI", "TRAFOOF"]] as const) {
      const text = generateToolpath(word(controller, "control")).response.gcode
      expect(text, controller).toContain(on)
      expect(text.indexOf(off, text.indexOf(on)), controller).toBeGreaterThan(text.indexOf(on))
      // The control has no tip control: the angles are machine coordinates, and no word asks the control to apply it.
      expect(generateToolpath(word(controller, "program")).response.gcode, controller).not.toMatch(/G43\.4|G234|TRAORI|TRAFOOF/)
    }
  })

  test("a 5-axis operation on a 3-axis machine is refused with the reason", () => {
    const outcome = generateToolpath(request({ axes: 3, controller: "grbl", workVolume: { x: 300, y: 180, z: 60 }, maxSpindleSpeed: 18000, maxFeedRate: 2000 }))
    expect(outcome.error).toContain("5-axis machine")
  })

  test("a controller with no rotary-capable post is refused", () => {
    const outcome = generateToolpath(request({ ...umcConfig, controller: "grbl" }))
    expect(outcome.error).toContain("grbl")
  })

  test("the 3-axis operations are unchanged by the machine field", () => {
    const outcome = generateToolpath(request(umcConfig, "contour"))
    expect(outcome.error).toBeUndefined()
    expect(outcome.response.gcode).not.toContain("G234")
  })

  test("the cam namespace exposes the machine helpers", () => {
    expect(typeof cam.generator.machineForProgramOf).toBe("function")
  })
})
