import { describe, expect, test } from "bun:test"
import { decodeSettings, type Stock } from "../cam/generator/schema.ts"
import { withMachineDefaults } from "../cam/generator/settings.ts"
import { inferMachineKind } from "../cam/machine.ts"
import { toolModelFromSettings } from "../cam/tool-model.ts"
import { generateLatheGCode } from "../cam/generator/lathe.ts"
import {
  choosePreviewMachine,
  previewBodies,
  previewBodyBounds,
  previewMachineBlock,
  previewMachineInfo,
  previewSetupOf,
  previewStockBounds,
  previewToolGlyph,
} from "./machine.ts"

const settings = (patch: Record<string, unknown> = {}) => withMachineDefaults(decodeSettings(patch))
const stock: Stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
const latheGCode = () => generateLatheGCode(settings({ machineType: "lathe" }))

describe("which machine the phone preview shows (spec 31 §4.5)", () => {
  test("the pick wins, then the producer, then clear words, then the setting", () => {
    const lathe = inferMachineKind(latheGCode())
    expect(choosePreviewMachine({ override: "3dprinter", produced: { kind: "mill", source: "kernel" }, inferred: lathe, setting: "mill" }))
      .toMatchObject({ kind: "3dprinter", source: "override" })
    expect(choosePreviewMachine({ produced: { kind: "lathe", source: "generator" }, inferred: lathe, setting: "lathe" }))
      .toEqual({ kind: "lathe", source: "generator" })
    expect(choosePreviewMachine({ inferred: lathe, setting: "mill" })).toEqual({ kind: "lathe", source: "inferred" })
    expect(choosePreviewMachine({ inferred: { kind: "lathe", confidence: "weak", reasons: [] }, setting: "mill" })).toEqual({ kind: "mill", source: "settings" })
    expect(choosePreviewMachine({ setting: "3dprinter" })).toEqual({ kind: "3dprinter", source: "settings" })
  })

  test("a program whose words belong to another machine is flagged, never switched silently", () => {
    const lathe = inferMachineKind(latheGCode())
    const choice = choosePreviewMachine({ produced: { kind: "mill", source: "generator" }, inferred: lathe, setting: "mill" })
    expect(choice.kind).toBe("mill")
    expect(choice.mismatch?.inferred).toBe("lathe")
    expect(choice.mismatch?.reasons.length).toBeGreaterThan(0)
  })
})

describe("the set-up the phone draws (spec 31 §4.1)", () => {
  test("the set-up follows the machine: the kernel's stock and table for its program", () => {
    expect(previewSetupOf("lathe", settings({ machineType: "lathe" }), stock).kind).toBe("lathe")
    expect(previewSetupOf("3dprinter", settings({ machineType: "3dprinter" }), stock).kind).toBe("3dprinter")
    const mill = previewSetupOf("mill", settings(), stock, { table: { length: 762, width: 406 } })
    expect(mill.kind === "mill" && mill.table).toEqual({ length: 762, width: 406 })
    // The kernel preset's table is a fact of the machine; without one the assumed VMC table is an assumption.
    expect(mill.assumed).toEqual(["workholding"])
    expect(previewSetupOf("mill", settings(), stock).assumed).toEqual(["workholding", "table"])
  })

  test("a lathe set-up takes the lathe tool's insert, turret and grip from the settings", () => {
    const setup = previewSetupOf("lathe", settings({ machineType: "lathe", chuckType: "collet", gripLength: 30, tailstock: true }), stock)
    if (setup.kind !== "lathe") throw new Error("expected a lathe")
    expect(setup.turret).toBe("rear")
    expect(setup.zero).toBe("face")
    expect(setup.workholding).toMatchObject({ kind: "collet", gripLength: 30, tailstock: true })
    expect(setup.tool.insert).toBe("turning")
    expect(previewMachineInfo(setup).workholding).toContain("collet grip 30 mm (stickout 70 mm)")
  })

  test("the bodies are the machine's, and the camera does not frame the table or the vise base", () => {
    const setup = previewSetupOf("mill", settings({ workholdingConfigured: true }), stock)
    const bodies = previewBodies(setup)
    expect(bodies.map((body) => body.role)).toEqual(["stock", "jaw", "jaw", "parallel", "parallel", "vise-base", "table"])
    const framed = previewBodyBounds(setup)
    // The stock is 40 mm deep (100 x 60 x 20): the jaws grip it and the table is 50 mm below the vise bed.
    expect(framed.max[2]).toBeCloseTo(0, 6)
    expect(framed.min[2]).toBeGreaterThan(-60)
    expect(framed.min[0]).toBeLessThan(-50)
    expect(framed.max[0]).toBeGreaterThan(50)
  })

  test("the stock on the machine is the work box, the lathe bar or the build volume", () => {
    const mill = previewStockBounds(previewSetupOf("mill", settings(), stock))
    expect(mill.min).toEqual([-50, -30, -20])
    expect(mill.max).toEqual([50, 30, 0])
    const lathe = previewStockBounds(previewSetupOf("lathe", settings({ machineType: "lathe", stockDiameter: 50, stockLength: 100 }), stock))
    expect(lathe.min).toEqual([-100, -25, -25])
    expect(lathe.max).toEqual([0, 25, 25])
    const printer = previewStockBounds(previewSetupOf("3dprinter", settings({ machineType: "3dprinter", bedWidth: 220, bedDepth: 220, bedOrigin: "corner", buildHeight: 250 }), stock))
    expect(printer.min).toEqual([0, 0, 0])
    expect(printer.max).toEqual([220, 220, 250])
  })
})

describe("the sentences and the tool glyph of the phone header", () => {
  test("what turns and how the part is held, per machine", () => {
    expect(previewMachineInfo(previewSetupOf("mill", settings({ workholdingConfigured: true }), stock)).turns).toBe("the tool turns, the part is clamped")
    const lathe = previewMachineInfo(previewSetupOf("lathe", settings({ machineType: "lathe" }), stock))
    expect(lathe.turns).toBe("the part turns in the chuck, the tool travels in X (diameter) and Z")
    expect(lathe.workholding).toContain("3-jaw chuck grip 20 mm")
    const printer = previewMachineInfo(previewSetupOf("3dprinter", settings({ machineType: "3dprinter" }), stock))
    expect(printer.turns).toBe("nothing turns, the nozzle deposits")
    expect(printer.workholding).toContain("cartesian")
  })

  test("the tool glyph carries the lathe insert, the mill diameter and the nozzle", () => {
    const lathe = previewToolGlyph(previewSetupOf("lathe", settings({ machineType: "lathe", operationType: "grooving", toolType: "grooving", toolDiameter: 3 }), stock))
    expect(lathe).toMatchObject({ family: "lathe", width: 3, turret: "rear", insert: "grooving" })
    const glyph = previewToolGlyph(previewSetupOf("mill", settings(), stock), toolModelFromSettings(settings({ toolDiameter: 12 }), "mill"))
    expect(glyph).toMatchObject({ family: "mill", diameter: 12 })
    const nozzle = previewToolGlyph(previewSetupOf("3dprinter", settings({ machineType: "3dprinter", nozzleDiameter: 0.6 }), stock))
    expect(nozzle).toMatchObject({ family: "nozzle", diameter: 0.6 })
  })

  test("the block ties the set-up, the spin runs and the collisions together", () => {
    const setup = previewSetupOf("lathe", settings({ machineType: "lathe" }), stock)
    const block = previewMachineBlock({
      setup,
      choice: { kind: "lathe", source: "generator" },
      spin: [{ segment: 0, rate: 1 }, { segment: 4, rate: 0 }],
      collisions: [2],
    })
    expect(block).toMatchObject({ kind: "lathe", source: "generator", axes: 2, xMode: "diameter", turret: "rear", collisions: [2] })
    expect(block.spin).toEqual([{ segment: 0, rate: 1 }, { segment: 4, rate: 0 }])
    expect(block.tool.family).toBe("lathe")
    expect(block.bodies.length).toBeGreaterThan(0)
    // Only a lathe carries the X mode and the turret; a mill does not.
    const mill = previewMachineBlock({ setup: previewSetupOf("mill", settings(), stock), choice: { kind: "mill", source: "settings" } })
    expect(mill.xMode).toBeUndefined()
    expect(mill.turret).toBeUndefined()
    expect(mill.axes).toBe(3)
    expect(mill.spin).toEqual([])
  })
})
