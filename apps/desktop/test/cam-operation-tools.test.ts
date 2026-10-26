/**
 * Spec 32 §4.2 in the desktop: picking an operation switches a tool that cannot do it, the assistant's operations each draw
 * their own tool, and a lathe program of several operations swaps the insert at each one.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { combineCamOperations } from "@cadcamfun/api"
import { withSettingsEffects } from "../src/features/cam/store/generatorStore.ts"
import { operationToolsOf } from "../src/features/cam/lib/machine-view.ts"
import { createMachineScene, DEFAULT_MACHINE_DISPLAY } from "../src/viewport/view3d/machine-scene.ts"

const g = cam.generator
const settings = (patch: Partial<cam.generator.ToolpathSettings> = {}): cam.generator.ToolpathSettings => g.withMachineDefaults({ ...g.DEFAULT_SETTINGS, ...patch })

describe("the generator panel follows the operation", () => {
  test("a new operation whose tool cannot do it takes the operation's tool", () => {
    const mill = settings({ operationType: "contour", toolType: "endmill" })
    expect(withSettingsEffects(mill, { ...mill, operationType: "drill" }).toolType).toBe("drill")
    expect(withSettingsEffects(mill, { ...mill, operationType: "pocket" }).toolType).toBe("endmill")
    const lathe = settings({ machineType: "lathe", operationType: "turning", toolType: "turning" })
    expect(withSettingsEffects(lathe, { ...lathe, operationType: "parting" }).toolType).toBe("parting")
    expect(withSettingsEffects(lathe, { ...lathe, operationType: "threading" }).toolType).toBe("threading")
    expect(withSettingsEffects(lathe, { ...lathe, turningOperation: "internal" }).toolType).toBe("boring")
    // A mill thread mill moved to a lathe threading operation becomes a threading insert.
    const threadMill = settings({ operationType: "threading", toolType: "threadmill" })
    expect(withSettingsEffects(threadMill, { ...threadMill, machineType: "lathe" })).toMatchObject({ operationType: "threading", toolType: "threading" })
  })

  test("the tool type itself is never overridden, even when it cannot do the operation", () => {
    const lathe = settings({ machineType: "lathe", operationType: "parting", toolType: "parting" })
    expect(withSettingsEffects(lathe, { ...lathe, toolType: "turning" }).toolType).toBe("turning")
    // Operation and tool set together (a saved config, the assistant) are kept as given.
    expect(withSettingsEffects(lathe, { ...lathe, operationType: "grooving", toolType: "turning" }).toolType).toBe("turning")
  })
})

const result = (id: string, name: string, s: cam.generator.ToolpathSettings, gcode: string) => {
  const a = g.analyseGcode(gcode, name)
  return { id, name, gcode, program: a.program, settings: s }
}

describe("operations of a combined program draw their own tools", () => {
  const drill = result("op1", "Drill", settings({ operationType: "drill", toolType: "drill", toolDiameter: 8.5 }), "G90 G21\nS2000 M3\nG0 X0 Y0 Z5\nG1 Z-10 F100\nG0 Z5\nM30")
  const tap = result("op2", "Tap", settings({ operationType: "threading", toolType: "endmill", toolDiameter: 10 }), "G90 G21\nS500 M3\nG0 X0 Y0 Z5\nG1 Z-8 F750\nG0 Z5\nM30")

  test("one tool per operation, keyed as the combined program keys its toolpaths, with the operation's issues", () => {
    const tools = operationToolsOf([drill, tap])
    const combined = combineCamOperations([drill, tap] as never)
    expect(tools.map((t) => t.toolId).sort()).toEqual([...new Set(combined.program.toolpaths.map((tp) => tp.toolId))].sort())
    expect(tools.map((t) => cam.toolKindOf(t.model))).toEqual(["drill", "flat"])
    expect(tools[0]!.issues).toEqual([])
    expect(tools[1]!.issues.map((i) => i.code)).toContain("TOOL_CANNOT_DO_OPERATION")
  })

  test("operations without settings keep an assumed tool independent of current generator settings", () => {
    const { settings: _, ...bare } = drill
    const tools = operationToolsOf([bare])
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({ toolId: "op1:tool", source: "assumed" })
    expect(tools[0]!.model.assumed).toContain("diameter")
  })
})

describe("a lathe program of several operations swaps the insert", () => {
  test("facing, threading and parting draw three inserts in turn", () => {
    const ops = [
      result("f", "Face", settings({ machineType: "lathe", operationType: "facing", toolType: "facing" }), "G18 G90 G21\nS800 M3\nG0 X52 Z0\nG1 X-1 F0.2\nG0 Z2\nM30"),
      result("t", "Thread", settings({ machineType: "lathe", operationType: "threading", toolType: "threading" }), "G18 G90 G21\nS600 M3\nG0 X22 Z5\nG32 Z-20 F1.5\nG0 X26\nZ5\nM30"),
      result("p", "Part", settings({ machineType: "lathe", operationType: "parting", toolType: "parting" }), "G18 G90 G21\nS600 M3\nG0 X52 Z-40\nG1 X0 F0.05\nG0 X55\nM30")
    ]
    const combined = combineCamOperations(ops as never)
    const models = new Map(operationToolsOf(ops).map((o) => [o.toolId, o.model]))
    const setup = cam.viewer.latheSetupOf(ops[0]!.settings)
    const scene = createMachineScene({ setup, program: combined.program, display: DEFAULT_MACHINE_DISPLAY, scale: 100, pathTools: combined.program.toolpaths.map((tp) => models.get(tp.toolId)) })
    const shown = (seconds: number): ReadonlyArray<string> => {
      scene.update(seconds)
      return scene.root.children.filter((o) => o.name === "lathe-tool" && o.visible).map((o) => String(o.userData.tool))
    }
    const mid = (path: number): number => {
      const moves = scene.timeline.moves.filter((m) => m.path === path)
      return (moves[0]!.start + moves[moves.length - 1]!.start + moves[moves.length - 1]!.duration) / 2
    }
    expect(shown(mid(0))).toEqual([expect.stringContaining("facing")])
    expect(shown(mid(1))).toEqual([expect.stringContaining("threading")])
    expect(shown(mid(2))).toEqual([expect.stringContaining("parting")])
    // Back to the start: the first insert again (scrubbing is deterministic).
    expect(shown(0)).toEqual([expect.stringContaining("facing")])
    scene.dispose()
  })
})

test("a printer swaps the actual nozzle object per operation and restores it on rewind", () => {
  const a = g.analyseGcode("G21 G90\nM104 S200\nT0\nG0 X0 Y0 Z0.2\nG1 X10 E1 F600\nT1\nG1 X20 E2\nM30")
  expect(a.program.toolpaths).toHaveLength(2)
  const brass = cam.toolModelOf({ type: "brass", diameter: 0.4 })
  const ruby = cam.toolModelOf({ type: "ruby", diameter: 0.8 })
  const scene = createMachineScene({ setup: cam.viewer.printerSetupOf(settings({ machineType: "3dprinter" })), program: a.program, motion: a.motion, pathTools: [brass, ruby], display: DEFAULT_MACHINE_DISPLAY, scale: 100 })
  try {
    const visible = () => scene.root.children.filter((o) => o.name === "nozzle" && o.visible).map((o) => o.userData.tool)
    scene.update(0)
    expect(visible()).toEqual([expect.stringContaining("brass nozzle Ø0.4")])
    const next = scene.timeline.moves.find((move) => move.path === 1)!
    scene.update(next.start + next.duration / 2)
    expect(visible()).toEqual([expect.stringContaining("ruby nozzle Ø0.8")])
    scene.update(0)
    expect(visible()).toEqual([expect.stringContaining("brass nozzle Ø0.4")])
  } finally { scene.dispose() }
})
