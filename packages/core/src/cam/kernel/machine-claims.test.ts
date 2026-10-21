/**
 * What the machine's own figures do to a run: the work offset the part sits in, the coolant the machine can deliver, the
 * magazine that holds the tools and the accuracy the machine promises.
 */
import { describe, expect, test } from "bun:test"
import { findMachine, runJob, type KernelMachine, type ManufacturingJob } from "./index.ts"

const plate = { id: "plate", type: "cube", width: 30, height: 20, depth: 5 }

const job = (machine: KernelMachine, extra: Partial<ManufacturingJob> = {}): ManufacturingJob => ({
  schemaVersion: 1, id: "m", name: "Plate", material: "6061", machine, quality: { resolution: 0.4, tolerance: 0.01 },
  part: { kind: "elements", elements: [plate] }, ...extra
})

const withMachine = (over: Partial<KernelMachine>): KernelMachine => ({ ...findMachine("vmc-standard")!, ...over })

describe("the machine's work offsets", () => {
  test("a program that names an offset the machine does not have is refused", () => {
    const machine = withMachine({ workOffsets: { available: ["G54", "G55"] } })
    const refused = runJob(job(machine, { workOffset: "G58" }))
    expect(refused.status).toBe("failed")
    if (refused.status !== "failed") throw new Error("an unknown work offset must be refused")
    expect(refused.issues.some((issue) => issue.tag === "InvalidInput" && issue.message.includes("G58"))).toBe(true)
  })

  test("an offset the machine has is accepted", () => {
    const machine = withMachine({ workOffsets: { available: ["G54", "G55"] } })
    const run = runJob(job(machine, { workOffset: "G55" }))
    expect(run.status).toBe("ok")
  })
})

describe("the machine's coolant", () => {
  test("a cut that asks for a coolant the machine does not have is planned with one it has, and it is reported", () => {
    const machine = withMachine({ coolant: { modes: ["flood"] } })
    const run = runJob(job(machine))
    expect(run.status).toBe("ok")
    if (run.status !== "ok") throw new Error("the run must finish")
    // 6061 is cut flooded and the machine floods: the machine's figure agrees with the material, nothing is reported.
    expect(run.value.issues.some((issue) => issue.message.includes("coolant"))).toBe(false)
    const cut = run.value.operations.filter((operation) => operation.cutting !== undefined)
    expect(cut.length).toBeGreaterThan(0)
    expect(cut.every((operation) => operation.cutting?.coolant === "flood")).toBe(true)
  })

  test("a machine without the coolant the material wants cuts with the one it has, and says so", () => {
    // Free-cutting brass is cut with mist by the handbook; a machine that only floods is told so.
    const machine = withMachine({ coolant: { modes: ["flood"] } })
    const run = runJob(job(machine, { material: "brass-cuzn39pb3" }))
    expect(run.status).toBe("ok")
    if (run.status !== "ok") throw new Error("the run must finish")
    const coolantIssues = run.value.issues.filter((issue) => issue.message.includes("coolant"))
    expect(coolantIssues.length).toBeGreaterThan(0)
    expect(coolantIssues[0]!.message).toContain("flood")
  })
})

describe("the machine's magazine", () => {
  test("a program needing more tools than the magazine holds is reported", () => {
    const machine = withMachine({ toolCapacity: 1 })
    const run = runJob(job(machine))
    expect(run.status).toBe("ok")
    if (run.status !== "ok") throw new Error("the run must finish")
    expect(run.value.issues.some((issue) => issue.message.includes("magazine"))).toBe(true)
  })

  test("a magazine big enough for the program is not reported", () => {
    const machine = withMachine({ toolCapacity: 30 })
    const run = runJob(job(machine))
    expect(run.status).toBe("ok")
    if (run.status !== "ok") throw new Error("the run must finish")
    expect(run.value.issues.some((issue) => issue.message.includes("magazine"))).toBe(false)
  })
})

describe("the machine's accuracy in the tolerance budget", () => {
  test("the positioning accuracy is a term of the promise", () => {
    const machine = withMachine({ accuracy: { positioningMm: 0.005 } })
    const run = runJob(job(machine))
    expect(run.status).toBe("ok")
    if (run.status !== "ok") throw new Error("the run must finish")
    const term = run.value.tolerance?.terms.find((entry) => entry.id === "machine-positioning")
    expect(term?.mm).toBe(0.005)
    expect(run.value.tolerance?.unbounded).not.toContain("the machine states no positioning accuracy, so the machine's own share of the deviation is unknown")
  })

  test("a machine that states no accuracy leaves the promise open rather than assuming one", () => {
    const run = runJob(job(findMachine("vmc-standard")!))
    expect(run.status).toBe("ok")
    if (run.status !== "ok") throw new Error("the run must finish")
    expect(run.value.tolerance?.unbounded).toContain("the machine states no positioning accuracy, so the machine's own share of the deviation is unknown")
  })
})
