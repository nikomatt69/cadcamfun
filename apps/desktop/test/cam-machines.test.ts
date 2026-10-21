/**
 * The machines of the Resources library, as the CAM sidebar reads them: the legacy list envelope,
 * the config shape the assistant writes, and the preview machine each resource type maps to.
 */
import { describe, expect, test } from "bun:test"
import {
  machineControllerOf,
  machineEnvelopeOf,
  machineFeedOf,
  machineResourceKind,
  machineRowsOf,
  machineSpindleOf,
  machineTypeLabel,
  machinesFromResponse,
  sortMachines
} from "../src/features/cam/lib/machines.ts"

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "m1", name: "Haas VF-2", type: "mill", description: "shop mill",
  config: { workVolume: { x: 508, y: 406, z: 635 }, maxSpindleSpeed: 8100, maxFeedRate: 16500, controller: "fanuc" },
  ...overrides
})

describe("machineRowsOf", () => {
  test("unwraps the legacy envelope, an older answer and the configs key", () => {
    expect(machineRowsOf({ success: true, data: { data: [row()], pagination: { total: 1 } } }).map((r) => r["id"])).toEqual(["m1"])
    expect(machineRowsOf({ data: [row()] }).map((r) => r["id"])).toEqual(["m1"])
    expect(machineRowsOf({ configs: [row()] }).map((r) => r["id"])).toEqual(["m1"])
    expect(machineRowsOf({ data: { configs: [row()] } }).map((r) => r["id"])).toEqual(["m1"])
  })

  test("answers nothing for a body without rows, and drops rows without an id", () => {
    expect(machineRowsOf(null)).toEqual([])
    expect(machineRowsOf({ success: true, data: { pagination: { total: 0 } } })).toEqual([])
    expect(machineRowsOf([row(), { name: "no id" }]).map((r) => r["name"])).toEqual(["Haas VF-2"])
  })
})

describe("machinesFromResponse", () => {
  test("normalises the rows and sorts them by name", () => {
    const machines = machinesFromResponse({ success: true, data: { data: [row({ id: "b", name: "beta" }), row({ id: "a", name: "Alpha" })], pagination: {} } })
    expect(machines.map((machine) => machine.id)).toEqual(["a", "b"])
    expect(machines.map((machine) => machine.name)).toEqual(["Alpha", "beta"])
  })

  test("keeps a machine whose config the assistant wrote, and one with no config at all", () => {
    const machines = machinesFromResponse({ data: { data: [
      { id: "assistant", name: "Assistant mill", type: "mill", config: { kinematics: { x: 300, y: 200, z: 100 }, maxRPM: 12000, maxFeed: 3000, postProcessor: "grbl" } },
      { id: "bare", name: "Bare", type: "lathe" }
    ] } })
    expect(machineSpindleOf(machines[0]!)).toBe(12000)
    expect(machineEnvelopeOf(machines[0]!)).toEqual({ x: 300, y: 200, z: 100 })
    expect(machineControllerOf(machines[0]!)).toBe("grbl")
    expect(machineEnvelopeOf(machines[1]!)).toBeUndefined()
    expect(machineSpindleOf(machines[1]!)).toBeUndefined()
  })
})

describe("machine facts", () => {
  test("reads the work volume, the spindle, the feed and the controller", () => {
    const machine = machinesFromResponse({ data: [row()] })[0]!
    expect(machineEnvelopeOf(machine)).toEqual({ x: 508, y: 406, z: 635 })
    expect(machineSpindleOf(machine)).toBe(8100)
    expect(machineFeedOf(machine)).toBe(16500)
    expect(machineControllerOf(machine)).toBe("fanuc")
  })

  test("a half-written envelope is not an envelope", () => {
    expect(machineEnvelopeOf({ id: "m", name: "m", config: { workVolume: { x: 300, y: 200 } } as never })).toBeUndefined()
  })

  test("the canonical machine profile is read like the other shapes", () => {
    const machine = machinesFromResponse({ data: [{
      id: "m1", name: "KERN Micro HD", type: "mill",
      config: {
        kind: "mill", controller: "Heidenhain TNC7", post: "heidenhain", axes: 5,
        spindle: { maxRpm: 50000 }, feed: { max: 60000 },
        axisTable: [
          { id: "X", kind: "linear", min: -175, max: 175, sense: 1 },
          { id: "Y", kind: "linear", min: -110, max: 110, sense: 1 },
          { id: "Z", kind: "linear", min: -250, max: 250, sense: 1 }
        ]
      }
    }] })[0]!
    expect(machineSpindleOf(machine)).toBe(50000)
    expect(machineFeedOf(machine)).toBe(60000)
    expect(machineControllerOf(machine)).toBe("Heidenhain TNC7")
    // The envelope of a machine that states its axes is the travel of the linear ones.
    expect(machineEnvelopeOf(machine)).toEqual({ x: 350, y: 220, z: 500 })
  })
})

describe("machine kinds", () => {
  test("maps the resources' types onto the preview's machines", () => {
    expect(machineResourceKind({ id: "1", name: "m", type: "mill", config: {} })).toBe("mill")
    expect(machineResourceKind({ id: "1", name: "m", type: "lathe", config: {} })).toBe("lathe")
    expect(machineResourceKind({ id: "1", name: "m", type: "printer", config: {} })).toBe("3dprinter")
    expect(machineResourceKind({ id: "1", name: "m", type: "3d-printer", config: {} })).toBe("3dprinter")
    // A laser runs like a mill; so does a row that names no type at all.
    expect(machineResourceKind({ id: "1", name: "m", type: "laser", config: {} })).toBe("mill")
    expect(machineResourceKind({ id: "1", name: "m", config: {} })).toBe("mill")
    // The assistant writes the type inside the config.
    expect(machineResourceKind({ id: "1", name: "m", config: { type: "lathe" } })).toBe("lathe")
  })

  test("labels the badge like the resources page does", () => {
    expect(machineTypeLabel({ id: "1", name: "m", type: "printer", config: {} })).toBe("3D Printer")
    expect(machineTypeLabel({ id: "1", name: "m", type: "laser", config: {} })).toBe("Laser")
    expect(machineTypeLabel({ id: "1", name: "m", type: "router", config: {} })).toBe("Router")
    expect(machineTypeLabel({ id: "1", name: "m", config: {} })).toBe("Machine")
  })
})

describe("sortMachines", () => {
  test("sorts case-insensitively and leaves the input alone", () => {
    const input = [{ id: "b", name: "beta", config: {} }, { id: "a", name: "Alpha", config: {} }]
    expect(sortMachines(input).map((machine) => machine.id)).toEqual(["a", "b"])
    expect(input.map((machine) => machine.id)).toEqual(["b", "a"])
  })
})
