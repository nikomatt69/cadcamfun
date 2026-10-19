/**
 * Spec 31 §7: the assistant knows, and can compute, the kinematics the CAM preview shows — what turns and in which sense,
 * where the tool is at a time, the set-up findings, the turned part, the printed layers — and its context says what the
 * preview shows.
 */
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { cam } from "@cadcamfun/core"
import { CAM_ACTIONS } from "../src/actions/cam.ts"
import type { ActionContext } from "../src/actions/action.ts"
import { machineRun } from "../src/machine-run.ts"
import { renderWorkspaceContext } from "../src/workspace-context.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"

const action = (id: string) => CAM_ACTIONS.find((a) => a.id === id)!
const context = (handlers: Record<string, unknown> = {}): ActionContext => ({ projectId: "p", handlers } as unknown as ActionContext)
const run = (id: string, input: unknown, handlers: Record<string, unknown> = {}) =>
  Effect.runPromise(action(id).run(action(id).parameters.parse(input) as never, context(handlers))) as Promise<Record<string, any>>

const g = cam.generator
const latheProgram = "G18 G90 G21\nM3 S800\nG0 X52 Z2\nG0 X44\nG1 Z-40 F80\nG0 X52\nG0 Z2\nM30"

describe("machineRun: a program on its machine", () => {
  test("lathe: the part turns clockwise from the headstock, the tool at the lathe point, the turned diameters", () => {
    const r = machineRun({ kind: "lathe", gcode: latheProgram, at: 10 }) as Record<string, any>
    expect(r["ok"]).toBe(true)
    expect(r["turns"]).toBe("workpiece")
    expect(r["axes"].map((a: { name: string }) => a.name)).toEqual(["Z", "X"])
    expect(r["pose"]).toMatchObject({ spindle: "cw", rpm: 800, plane: "G18", xMode: "diameter" })
    expect(r["pose"]["rotation"]).toContain("the part turns with the chuck clockwise")
    expect(r["pose"]["preview"].z).toBeCloseTo(r["pose"]["program"].x / 2, 6)
    const end = machineRun({ kind: "lathe", gcode: latheProgram }) as Record<string, any>
    const sections = end["turnedPart"]["sections"] as Array<{ zFrom: number; zTo: number; diameter: number }>
    expect(sections.some((s) => s.diameter === 44 && s.zFrom <= -20 && s.zTo >= -20)).toBe(true)
    expect(sections.some((s) => s.diameter === 50)).toBe(true)
  })

  test("lathe: the chuck grip and turret come from params; a deep turn is into the jaws", () => {
    const r = machineRun({ kind: "lathe", gcode: "G18 M3 S500\nG0 X52 Z2\nG0 X44\nG1 Z-95 F80", params: { gripLength: 30, latheTurret: "front", workholdingConfigured: true } }) as Record<string, any>
    expect(r["setup"]).toMatchObject({ turret: "front", workholding: { gripLength: 30 } })
    expect(r["findings"][0]).toMatchObject({ code: "LATHE_INTO_CHUCK", severity: "error", assumed: false, line: 4 })
    expect(r["pose"]["preview"].z).toBeLessThan(0)
  })

  test("mill: the tool turns, the vise is checked against the given stock", () => {
    const stock = { width: 100, height: 60, depth: 20, x: 0, y: 0, topZ: 0 }
    const r = machineRun({ kind: "mill", gcode: "M3 S9000\nG0 X-55 Y-33 Z5\nG1 Z-18 F200\nG1 X55\nG0 Z5", params: { stock, workholdingConfigured: true, toolDiameter: 6 } }) as Record<string, any>
    expect(r["turns"]).toBe("tool")
    expect(r["findings"].map((f: { code: string }) => f.code)).toContain("MILL_INTO_VISE")
    expect(r["setupProblems"]).toEqual([])
    const above = machineRun({ kind: "mill", gcode: "M3 S9000\nG0 X-55 Y-33 Z5\nG1 Z-5 F200\nG1 X55\nG0 Z5", params: { stock, workholdingConfigured: true, toolDiameter: 6 } }) as Record<string, any>
    expect(above["findings"]).toEqual([])
    expect(machineRun({ kind: "mill", gcode: "G1 X1 F100", params: { stock: { width: -1 } } })["ok"]).toBe(false)
    expect(machineRun({ kind: "mill", gcode: "G1 X1 F100", params: { workholding: "glue" } })["ok"]).toBe(false)
  })

  test("printer: nothing turns; the layers, what is deposited by then, the filament", () => {
    const code = "M104 S200\nG28\nG92 E0\nG0 X10 Y10 Z0.2\nG1 X20 E1 F600\nG1 X20 Y20 E2\nG0 X10 Y10 Z0.4\nG1 X20 E3\nG1 X20 Y20 E4"
    const r = machineRun({ kind: "3dprinter", gcode: code }) as Record<string, any>
    expect(r["turns"]).toBe("nothing")
    expect(r["pose"]["rotation"]).toBe("nothing turns")
    expect(r["print"]).toMatchObject({ layers: 2, firstZ: 0.2, lastZ: 0.4, beads: 4, depositedBeads: 4, currentLayer: 2, filament: 4 })
    expect(machineRun({ kind: "3dprinter", gcode: code, at: 0 })["print"]).toMatchObject({ depositedBeads: 0 })
  })
})

describe("cam action machine", () => {
  test("the table alone, or a program's run; an operation's program is read from the host", async () => {
    const table = await run("cam.machine", { machineType: "lathe" })
    expect(table["rotates"]).toBe("workpiece")
    expect(table["preview"]["mapping"]).toContain("X/2")
    expect(table["preview"]["rotation"]["M3"]).toContain("headstock")
    expect(table["run"]).toBeUndefined()
    const withProgram = await run("cam.machine", { machineType: "lathe", gcode: latheProgram, at: 5 })
    expect(withProgram["run"]["pose"]["seconds"]).toBe(5)
    const stored = await run("cam.machine", { machineType: "lathe", operationId: "op1" }, { operationProgram: async () => ({ ok: true, gcode: latheProgram }) })
    expect(stored["run"]["ok"]).toBe(true)
    expect((await run("cam.machine", { machineType: "lathe", gcode: latheProgram, operationId: "op1" }))["ok"]).toBe(false)
  })

  test("cam action analyze without a machine says which machine the words point at", async () => {
    const r = await run("cam.analyze", { gcode: g.generateLatheGCode(g.withMachineDefaults(g.decodeSettings({ machineType: "lathe" }))) })
    expect(r["inferredMachine"]).toMatchObject({ kind: "lathe", confidence: "strong" })
  })
})

describe("the assistant's context and skills", () => {
  test("the workspace context says what the preview shows", () => {
    const text = renderWorkspaceContext({
      page: "cam", name: "part",
      cam: { settings: { machineType: "lathe" }, preview: { machine: "lathe", source: "inferred", turns: "the part turns in the chuck, the tool travels in X (diameter) and Z", workholding: "3-jaw chuck grip 20 mm (stickout 80 mm) on Ø50×100, rear turret, Z0 finished face", assumed: true, unsupportedLines: 2 } }
    })
    expect(text).toContain("Preview: lathe (inferred); the part turns in the chuck")
    expect(text).toContain("(assumed: set workholdingConfigured to check it)")
    expect(text).toContain("partial preview, 2 lines not replayed")
    expect(text).toContain("cam action machine with gcode or operationId")
  })

  test("the machines skill explains the preview, the workholding and how to run the kinematics", () => {
    const skill = CADCAM_SKILLS.find((s) => s.name === "machines-and-axes")!
    for (const part of ["## What the CAM preview shows", "## Running a program on its machine", "## Workholding", "workholdingConfigured", "LATHE_INTO_CHUCK", "clockwise seen from the headstock"]) expect(skill.body).toContain(part)
  })
})

describe("machineRun: the simulation player's view (spec 32 P3, P5, P7)", () => {
  test("operations, move classes, the machine's axes and the collisions of a mill program", () => {
    const gcode = "(T1 D=10. CR=0. - ZMIN=-5. - flat end mill)\n(T2 D=6. CR=0. - ZMIN=-10. - drill)\nG21 G90\nT1 M6\nS8000 M3\nG0 X-60 Y0 Z5\nG1 Z-5 F300\nG1 X60 F800\nG0 Z5\nT2 M6\nS2000 M3\nG0 X0 Y0 Z-6\nG81 X0 Y0 Z-10 R2 F100\nG80\nM30"
    const r = machineRun({ kind: "mill", gcode, params: { workholding: "plate", stock: { width: 100, height: 60, depth: 20 }, machinePreset: "vmc-3", machineTravel: { x: 600, y: 400, z: 500 } } }) as Record<string, any>
    expect(r["operations"].map((o: { toolId: string }) => o.toolId)).toEqual(["T1", "T2"])
    expect(r["moveClasses"].map((c: { kind: string }) => c.kind)).toEqual(expect.arrayContaining(["rapid", "plunge", "cut", "cycle"]))
    expect(r["machineModel"]).toMatchObject({ preset: "vmc-3", tableCarries: ["x", "y"], assumed: [] })
    expect(Object.keys(r["machineModel"].axesAt)).toEqual(["X", "Y", "Z"])
    expect(r["collisions"].map((c: { code: string; line: number }) => [c.code, c.line])).toEqual([["RAPID_INTO_STOCK", 12]])
  })
})
