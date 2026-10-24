/**
 * The kernel for a printer (spec 33 §9): a job whose machine is a printer is sliced and released on its evidence.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { KERNEL_SCHEMA_VERSION, type ManufacturingJob } from "./contracts.ts"
import { findPrinter, MACHINE_CATALOGUE, PRINTERS } from "./machines.ts"
import { kernelMachineOfConfig, machineConfigOf, machineRefusal } from "./machine-config.ts"
import { planOnly, runJob } from "./execute.ts"
import { printSettingsOf } from "./print.ts"
import { profileOfConfig } from "./machine-profile.ts"

setDefaultTimeout(60_000)

const cube = { id: "c", type: "cube", x: 0, y: 0, z: 5, width: 20, height: 20, depth: 10 }

const job = (over: Partial<ManufacturingJob> = {}): ManufacturingJob => ({
  schemaVersion: KERNEL_SCHEMA_VERSION, id: "j1", name: "Print", material: "PLA",
  part: { kind: "elements", elements: [cube] }, machine: findPrinter("printer-desktop-220")!, ...over
})

describe("the printer catalogue", () => {
  test("printers are machines of the catalogue, each with a plate and a nozzle", () => {
    expect(PRINTERS.length).toBeGreaterThanOrEqual(5)
    for (const p of PRINTERS) {
      expect(MACHINE_CATALOGUE).toContain(p)
      expect(p.kind).toBe("printer")
      expect(p.printer!.bed.width).toBeGreaterThan(0)
      expect(p.printer!.nozzle.diameter).toBeGreaterThan(0)
      expect(p.limits.maxFeed).toBe(p.printer!.maxSpeed * 60)
    }
    expect(findPrinter("printer-delta-240")!.printer!.bed.origin).toBe("center")
  })

  test("a library row and a printer preset read each other", () => {
    for (const p of PRINTERS) {
      const row = machineConfigOf(p)
      expect(row.type).toBe("printer")
      const back = kernelMachineOfConfig(row)!
      expect(back.kind).toBe("printer")
      expect(back.printer!.bed).toEqual(p.printer!.bed)
      expect(back.printer!.buildHeight).toBe(p.printer!.buildHeight)
      expect(back.printer!.nozzle.diameter).toBe(p.printer!.nozzle.diameter)
      expect(back.printer!.flavor).toBe(p.printer!.flavor)
    }
  })

  test("the library's own desktop printer becomes a machine", () => {
    const row = { id: "printer-fdm-small", name: "Desktop FDM 3D Printer", type: "printer", config: { maxFeedRate: 150, workVolume: { x: 220, y: 220, z: 250 }, controller: "Marlin", technology: "FDM", nozzleDiameter: 0.4, filamentDiameter: 1.75, maxTemperature: 250 } }
    const machine = kernelMachineOfConfig(row)!
    expect(machine.kind).toBe("printer")
    expect(machine.printer).toMatchObject({ bed: { width: 220, depth: 220, origin: "corner" }, buildHeight: 250, nozzle: { diameter: 0.4, maxTemperature: 250 }, maxSpeed: 150, flavor: "marlin" })
    expect(machineRefusal(row)).toBeUndefined()
  })

  test("a resin printer, a laser and a printer without a plate are refused with a reason", () => {
    const resin = { id: "r", name: "Resin", type: "printer", config: { workVolume: { x: 192, y: 120, z: 200 }, controller: "ChiTu", technology: "MSLA", pixelSize: 0.05 } }
    expect(kernelMachineOfConfig(resin)).toBeUndefined()
    expect(machineRefusal(resin)).toContain("MSLA")
    expect(machineRefusal({ id: "l", name: "Laser", type: "laser", config: {} })).toContain("laser")
    expect(machineRefusal({ id: "p", name: "No plate", type: "printer", config: { technology: "FDM", nozzleDiameter: 0.4 } })).toContain("plate")
    expect(profileOfConfig({ workVolume: { x: 1, y: 2, z: 3 } }, "printer").printer?.bed).toEqual({ width: 1, depth: 2 })
  })
})

describe("a print job", () => {
  const result = runJob(job())
  test("is sliced into a program with the evidence of a milled one", () => {
    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    const a = result.value
    expect(a.machine.id).toBe("printer-desktop-220")
    expect(a.nc).toContain("; Print Start G-code")
    expect(a.nc).toContain("M104 S205")
    expect(a.program.toolpaths.length).toBeGreaterThan(0)
    expect(a.operations).toHaveLength(1)
    expect(a.operations[0]).toMatchObject({ strategy: "print", cut: "print", status: "ok", removedVolume: 0 })
    expect(a.print!.layers).toBe(50)
    expect(a.print!.filamentGrams).toBeGreaterThan(1)
    expect(a.print!.size.z).toBeCloseTo(10, 6)
    expect(a.print!.dialect).toBe("marlin")
    expect(a.stock.partVolume).toBe(4000)
    expect(a.stock.finalVolume).toBeGreaterThan(500)
    expect(a.cycleTimeSeconds).toBe(a.print!.timeSeconds)
    expect(a.identity.nc).toMatch(/^[0-9a-f]{64}$/)
  })

  test("is released on its claims: every printer claim passes", () => {
    if (result.status !== "ok") throw new Error("failed")
    const byId = Object.fromEntries(result.value.claims.map((c) => [c.id, c.status]))
    for (const id of ["operations-complete", "machine-limits", "bed-fit", "heated-start", "layers-rise", "wall-coverage", "skin-coverage", "no-spill", "filament", "nc-replay"]) expect(byId[id], id).toBe("passed")
    expect(result.value.release).toBe("verified-program")
  })

  test("is deterministic: the same job gives the same bytes", () => {
    const again = runJob(job())
    expect(again.status === "ok" && result.status === "ok" && again.value.nc === result.value.nc && again.value.identity.job === result.value.identity.job).toBe(true)
  })

  test("takes the sliced settings from the job", () => {
    const sparse = runJob(job({ print: { infillDensity: 5, walls: 3, layerHeight: 0.3, supports: "none" } }))
    if (sparse.status !== "ok" || result.status !== "ok") throw new Error("failed")
    // The final 0.1 mm is a real layer, not a discarded part of the model.
    expect(sparse.value.print!.layers).toBe(34)
    expect(sparse.value.print!.size.z).toBeCloseTo(10, 6)
    expect(sparse.value.print!.layerHeight).toBe(0.3)
    expect(sparse.value.print!.filamentMm).toBeLessThan(result.value.print!.filamentMm)
    expect(sparse.value.operations[0]!.overridden).toEqual(["infillDensity", "walls", "layerHeight", "supports"])
  })

  test("the filament sets the temperatures, the printer's limits are enforced", () => {
    const petg = runJob(job({ material: "PETG" }))
    expect(petg.status === "ok" && petg.value.nc.includes("M104 S235") && petg.value.nc.includes("M140 S80")).toBe(true)
    const hot = runJob(job({ print: { nozzleTemperature: 320 } }))
    expect(hot.status).toBe("failed")
    if (hot.status === "failed") expect(hot.issues[0]).toMatchObject({ tag: "MachineLimit", severity: "error" })
    const thick = runJob(job({ print: { layerHeight: 0.4 } }))
    expect(thick.status === "failed" && thick.issues[0]!.message.includes("80 %")).toBe(true)
  })

  test("an unknown filament is a warning, not a refusal", () => {
    const odd = runJob(job({ material: "aluminium 6061" }))
    expect(odd.status).toBe("ok")
    if (odd.status === "ok") expect(odd.value.issues.some((i) => i.tag === "UnknownMaterial" && i.severity === "warning")).toBe(true)
  })

  test("a part that does not fit blocks the release", () => {
    const big = runJob(job({ part: { kind: "elements", elements: [{ ...cube, width: 300, height: 300 }] } }))
    expect(big.status).toBe("ok")
    if (big.status === "ok") {
      expect(big.value.release).toBe("blocked")
      expect(big.value.claims.find((c) => c.id === "bed-fit")!.status).toBe("failed")
    }
  })

  test("meshes print like elements", () => {
    const mesh = { positions: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 5, 10, 0, 5, 10, 10, 5, 0, 10, 5], indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7] }
    void mesh
    const fromMesh = runJob(job({ part: { kind: "meshes", meshes: [{ positions: [-5, -5, 0, 5, -5, 0, 5, 5, 0, -5, 5, 0, -5, -5, 4, 5, -5, 4, 5, 5, 4, -5, 5, 4], indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7] }] } }))
    expect(fromMesh.status).toBe("ok")
    if (fromMesh.status === "ok") expect(fromMesh.value.print!.size.z).toBeCloseTo(4, 6)
  })

  test("the setup orientation puts another face on the plate", () => {
    const tall = { ...cube, width: 10, height: 10, depth: 30, z: 15 }
    const upright = runJob(job({ part: { kind: "elements", elements: [tall] } }))
    const lying = runJob(job({ part: { kind: "elements", elements: [tall] }, setupOrientation: "+X" }))
    if (upright.status !== "ok" || lying.status !== "ok") throw new Error("failed")
    expect(upright.value.print!.size.z).toBeCloseTo(30, 6)
    expect(lying.value.print!.size.z).toBeLessThan(11)
  })

  test("progress is reported in the stages of the pipeline, and a cancelled job leaves no artifact", () => {
    const stages: string[] = []
    runJob(job(), { onProgress: (p) => { if (!stages.includes(p.stage)) stages.push(p.stage) } })
    expect(stages).toEqual(["operations", "post", "replay", "evidence"])
    const cancelled = runJob(job(), { signal: { aborted: true } })
    expect(cancelled.status).toBe("failed")
    if (cancelled.status === "failed") expect(cancelled.issues[0]!.tag).toBe("Cancelled")
  })

  test("the plan says what would be printed, without slicing", () => {
    const plan = planOnly(job())
    expect(plan.status).toBe("ok")
    if (plan.status === "ok") {
      expect(plan.value.operations).toEqual([])
      expect(plan.value.notes[0]).toContain("20.0 x 20.0 x 10.0 mm")
      expect(plan.value.notes[0]).toContain("50 layers")
    }
  })

  test("settings default from the machine: a 0.6 nozzle prints thicker layers; a bowden tube retracts further", () => {
    const large = printSettingsOf(findPrinter("printer-large-400")!, undefined, {}).settings
    const desktop = printSettingsOf(findPrinter("printer-desktop-220")!, undefined, {}).settings
    const direct = printSettingsOf(findPrinter("printer-prusa-mk4")!, undefined, {}).settings
    expect(large.layerHeight).toBe(0.3)
    expect(desktop.retractionDistance).toBeGreaterThan(direct.retractionDistance!)
  })
})
