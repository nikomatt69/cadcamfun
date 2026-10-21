import { describe, expect, test } from "bun:test"
import { DEFAULT_MACHINE_CONFIGS, kernelMachineOfConfig, machineConfigOf, postOfController } from "./machine-config.ts"
import { findLathe, findMachine, LATHES, MACHINES, MACHINE_CATALOGUE } from "./machines.ts"
import { runJob, type ManufacturingJob } from "./index.ts"

const config = (over: Partial<Parameters<typeof kernelMachineOfConfig>[0]["config"]> = {}, row: Partial<Parameters<typeof kernelMachineOfConfig>[0]> = {}) => ({
  id: "row-1", name: "Shop VMC", type: "mill",
  config: { workVolume: { x: 800, y: 500, z: 500 }, maxSpindleSpeed: 12000, maxFeedRate: 10000, controller: "fanuc", ...over },
  ...row
})

describe("the machine library and the kernel are the same machines in two shapes", () => {
  test("a saved configuration becomes a machine the kernel can plan against", () => {
    const machine = kernelMachineOfConfig(config())
    expect(machine).toBeDefined()
    expect(machine!.id).toBe("config:row-1")
    expect(machine!.name).toBe("Shop VMC")
    expect(machine!.kind).toBe("mill")
    expect(machine!.post).toBe("fanuc")
    expect(machine!.limits.maxRpm).toBe(12000)
    expect(machine!.limits.maxFeed).toBe(10000)
    // The work volume is the space the part takes, not the axis travel: the travel check stays off.
    expect(machine!.travel).toBeUndefined()
    expect(machine!.reference?.stroke).toEqual({ x: 800, y: 500, z: 500 })
  })

  test("the controller of the configuration chooses the post, and an unknown one gets the plain ISO post", () => {
    expect(postOfController("MAZATROL SmoothAi")).toBe("fanuc")
    expect(postOfController("Sinumerik 840D sl")).toBe("siemens")
    expect(postOfController("Heidenhain TNC7")).toBe("heidenhain")
    expect(postOfController("Haas")).toBe("haas")
    expect(postOfController("something else")).toBe("generic")
    expect(kernelMachineOfConfig(config({ controller: "Sinumerik 840D sl" }))!.post).toBe("siemens")
  })

  test("a rotary table in the configuration is the kernel's five-axis table", () => {
    const machine = kernelMachineOfConfig(config({
      axes: 5,
      rotary: { layout: "table-BC", tilt: { min: -110, max: 110 }, rotation: { min: -180, max: 180 }, pivot: { x: 0, y: 0, z: -120 } }
    }))
    expect(machine!.fiveAxis).toEqual({ layout: "table-BC", tilt: [-110, 110], rotation: [-180, 180], pivot: { x: 0, y: 0, z: -120 } })
  })

  test("a configuration the kernel cannot machine is refused, never guessed", () => {
    expect(kernelMachineOfConfig(config({}, { type: "printer" }))).toBeUndefined()
    expect(kernelMachineOfConfig(config({}, { type: "laser" }))).toBeUndefined()
    expect(kernelMachineOfConfig(config({ maxSpindleSpeed: undefined }))).toBeUndefined()
    expect(kernelMachineOfConfig(config({ maxFeedRate: 0 }))).toBeUndefined()
  })

  test("a lathe configuration keeps what it holds and turns", () => {
    const machine = kernelMachineOfConfig(config({
      additionalSettings: { maxBarDiameter: 65, maxBarLength: 590, chuckDiameter: 200, b: { min: -30, max: 210 }, c: { min: -180, max: 180 }, continuousC: true, yTravel: 210 }
    }, { id: "lathe-1", name: "Shop turn-mill", type: "lathe" }))
    expect(machine!.kind).toBe("lathe")
    expect(machine!.turning).toMatchObject({ maxBarDiameter: 65, maxBarLength: 590, b: [-30, 210], c: [-180, 180], continuousC: true, yTravel: 210 })
    expect(machine!.fiveAxis).toBeUndefined()
  })

  test("the built-in catalogue is shown in the library as machine configurations", () => {
    expect(DEFAULT_MACHINE_CONFIGS.length).toBe(MACHINE_CATALOGUE.length)
    const kern = DEFAULT_MACHINE_CONFIGS.find((row) => row.id === "kern-micro-hd-hsk25")!
    expect(kern.type).toBe("mill")
    // The controller is named as the shop names it; the post follows from it.
    expect(kern.config["controller"]).toBe("Heidenhain TNC7")
    expect(kernelMachineOfConfig(kern)!.post).toBe("heidenhain")
    expect(kern.config["axes"]).toBe(5)
    expect((kern.config["rotary"] as { layout: string }).layout).toBe("table-BC")
    const mazak = DEFAULT_MACHINE_CONFIGS.find((row) => row.id === "mazak-integrex-i200")!
    expect(mazak.type).toBe("lathe")
    expect((mazak.config["turning"] as { maxBarDiameter: number }).maxBarDiameter).toBe(65)
    // The round trip keeps the machine a machine.
    const back = kernelMachineOfConfig(mazak)!
    expect(back.kind).toBe("lathe")
    expect(back.turning?.b).toEqual([-30, 210])
    expect((machineConfigOf(findMachine("trunnion-5ax")!).config["rotary"] as { layout: string }).layout).toBe("table-AC")
  })
})

describe("the machine catalogue", () => {
  test("milling centres and turning centres are separate lists", () => {
    expect(MACHINES.every((machine) => machine.kind === "mill")).toBe(true)
    expect(LATHES.every((machine) => machine.kind === "lathe")).toBe(true)
    expect(findMachine("mazak-integrex-i200")?.kind).toBe("lathe")
    expect(findLathe("mazak-integrex-i200")?.name).toContain("INTEGREX")
    expect(findLathe("vmc-standard")).toBeUndefined()
  })

  test("the published mill-turn figures are the ones the catalogue carries", () => {
    const mazak = findLathe("mazak-integrex-i200")!
    expect(mazak.turning?.b).toEqual([-30, 210])
    expect(mazak.turning?.continuousC).toBe(true)
    expect(mazak.turning?.yTravel).toBe(210)
    expect(mazak.reference?.stroke).toEqual({ x: 535, y: 210, z: 1020 })
    expect(mazak.reference?.source).toContain("Mazak")
    const okuma = findLathe("okuma-multus-b300ii")!
    expect(okuma.turning?.b).toEqual([-30, 195])
    expect(okuma.turning?.yTravel).toBe(160)
    expect(okuma.reference?.stroke).toEqual({ x: 580, y: 160, z: 935 })
    const kern = findMachine("kern-micro-hd-hsk40")!
    expect(kern.fiveAxis?.tilt).toEqual([-110, 110])
    expect(kern.limits.maxRpm).toBe(42000)
  })

  test("the milling kernel refuses a turning centre with its reason", () => {
    const job: ManufacturingJob = {
      schemaVersion: 1, id: "lathe-job", name: "On a lathe", material: "6061",
      part: { kind: "elements", elements: [{ id: "plate", type: "cube", x: 0, y: 0, z: 0, width: 20, height: 20, depth: 5 }] },
      machine: findLathe("mazak-integrex-i200")!
    }
    const result = runJob(job)
    expect(result.status).toBe("failed")
    if (result.status !== "failed") throw new Error("a lathe must not run in the milling kernel")
    expect(result.issues.some((issue) => issue.tag === "UnsupportedCapability" && /turning centre/.test(issue.message))).toBe(true)
  })
})
