import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { machineEnvelope, machineSections } from "../src/features/library/lib/machine-details.ts"
import { machineObject } from "../src/features/library/lib/machine-object.ts"

const profileOf = (config: Record<string, unknown>, type = "mill") => cam.kernel.profileOfConfig(config, type)
const fact = (sections: ReturnType<typeof machineSections>, title: string, label: string) => sections.find((section) => section.title === title)?.facts.find((entry) => entry.label === label)?.value

describe("the details of a machine configuration", () => {
  test("every built-in machine of the catalogue reads into sections with its controller and spindle", () => {
    expect(cam.kernel.DEFAULT_MACHINE_CONFIGS.length).toBeGreaterThan(0)
    for (const row of cam.kernel.DEFAULT_MACHINE_CONFIGS) {
      const profile = profileOf(row.config as Record<string, unknown>, row.type)
      const sections = machineSections(profile)
      expect(sections.length).toBeGreaterThan(1)
      expect(sections[0]!.title).toBe("Machine")
      // A preset that states a spindle shows it; one that does not says nothing about it.
      if (profile.spindle !== undefined) expect(fact(sections, "Spindle", "Max speed")).toMatch(/rpm$/)
      else expect(fact(sections, "Spindle", "Max speed")).toBeUndefined()
    }
  })

  test("a configuration in the form's shape shows the same figures as the canonical one", () => {
    const legacy = profileOf({ workVolume: { x: 508, y: 406, z: 635 }, maxSpindleSpeed: 12000, maxFeedRate: 10000, controller: "fanuc" })
    const sections = machineSections(legacy)
    expect(fact(sections, "Machine", "Controller")).toBe("fanuc")
    expect(fact(sections, "Machine", "Post")).toBe("fanuc")
    expect(fact(sections, "Spindle", "Max speed")).toBe("12000 rpm")
    expect(fact(sections, "Feeds", "Max feed")).toBe("10000 mm/min")
    expect(fact(sections, "Work area", "Work volume")).toBe("508 × 406 × 635 mm")
  })

  test("what the machine does not state is left out, not invented", () => {
    const sections = machineSections(profileOf({ maxSpindleSpeed: 8000 }))
    expect(sections.map((section) => section.title)).not.toContain("Tool changer")
    expect(sections.map((section) => section.title)).not.toContain("Probing")
    expect(fact(sections, "Spindle", "Power")).toBeUndefined()
  })

  test("a printer lists its plate, nozzle and firmware", () => {
    const sections = machineSections(profileOf({ printer: { technology: "FDM", bed: { width: 220, depth: 220 }, buildHeight: 250, nozzleDiameter: 0.4, flavor: "klipper" } }, "printer"))
    expect(fact(sections, "Printer", "Bed")).toBe("220 × 220 mm")
    expect(fact(sections, "Printer", "Build height")).toBe("250 mm")
    expect(fact(sections, "Printer", "Firmware")).toBe("klipper")
  })
})

describe("the envelope the preview draws", () => {
  test("a milling machine draws its work volume over its table", () => {
    const envelope = machineEnvelope(profileOf({ workVolume: { x: 300, y: 200, z: 100 }, table: { length: 400, width: 250, gap: 0 }, maxSpindleSpeed: 12000 }))
    expect(envelope.volume).toEqual({ x: 300, y: 200, z: 100 })
    expect(envelope.table).toEqual({ length: 400, width: 250 })
  })

  test("a machine that only states its travel draws the travel", () => {
    const envelope = machineEnvelope(profileOf({ travel: { minX: -100, maxX: 200, minY: 0, maxY: 150, minZ: -50, maxZ: 50 }, maxSpindleSpeed: 12000 }))
    expect(envelope.volume).toEqual({ x: 300, y: 150, z: 100 })
  })

  test("a printer draws its plate and build height, and a machine without a volume draws nothing", () => {
    const printer = machineEnvelope(profileOf({ printer: { bed: { width: 200, depth: 180 }, buildHeight: 220 } }, "printer"))
    expect(printer.volume).toEqual({ x: 200, y: 180, z: 220 })
    expect(printer.table).toEqual({ length: 200, width: 180 })
    expect(machineEnvelope(profileOf({ maxSpindleSpeed: 8000 })).volume).toBeUndefined()
    expect(machineObject(machineEnvelope(profileOf({ maxSpindleSpeed: 8000 }))).children.length).toBe(0)
  })

  test("the scene holds the table, the space, the spindle and the triad of a mill, and a rotary table adds its disc", () => {
    const mill = machineObject(machineEnvelope(profileOf({ workVolume: { x: 300, y: 200, z: 100 }, maxSpindleSpeed: 12000 })))
    expect(mill.children.length).toBe(4)
    const fiveAxis = machineObject(machineEnvelope(profileOf({ workVolume: { x: 300, y: 200, z: 100 }, maxSpindleSpeed: 12000, rotary: { layout: "table-AC", tilt: { min: -120, max: 30 } } })))
    expect(fiveAxis.children.length).toBe(5)
  })
})
