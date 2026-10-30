import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuildExact } from "../../cad/history-brep.ts"
import { model } from "../../cad/script.ts"
import { swarfWalls } from "../swarf-walls.ts"
import { DEFAULT_CUTTERS, findCutter, runJob, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(110_000)

// A conical boss: a 40 mm disc drafted 5 degrees over 30 mm, the part a flank cut is for.
const m = model()
m.extrude(m.sketch("XY").circle([0, 0], 20), { depth: 30, taper: 5 })
const history = m.build()
const element = { id: "cone", type: "parametric", name: "Cone", x: 0, y: 0, z: 0, history }
const exact = rebuildExact(history).bodies[0]!.brep!
const wall = swarfWalls(exact).walls.find((w) => exact.faces[w.face]!.surface.kind === "cone")!.wall
const flat = findCutter(DEFAULT_CUTTERS, "flat-10")!
const trunnion = findMachine("trunnion-5ax")!
// The table winds past a full turn on a continuous C axis: the range is declared, not assumed.
const machine = { ...trunnion, fiveAxis: { ...trunnion.fiveAxis!, rotation: [-720, 720] as const } }
const op = (over: Partial<Extract<OperationSpec, { strategy: "multiaxis" }>> = {}): Extract<OperationSpec, { strategy: "multiaxis" }> =>
  ({ id: "swarf-cone", strategy: "multiaxis", mode: "swarf", tool: flat.id, top: 30, stepover: 20, walls: [wall], ...over })
const job = (operations: ReadonlyArray<OperationSpec>): ManufacturingJob => ({
  schemaVersion: 1, id: "swarf", name: "Swarf cone", material: "6061", part: { kind: "elements", elements: [element] },
  stock: { min: { x: -24, y: -24, z: 0 }, max: { x: 24, y: 24, z: 31 } }, tools: [flat], operations, machine, quality: { resolution: 0.5 }
})

describe("a swarf operation in the kernel", () => {
  test("cuts the conical wall with the flank: simultaneous A/C words, one cut per band, none skipped", () => {
    const r = runJob(job([op()]))
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    const a = r.value
    expect(a.operations.map((o) => [o.strategy, o.parameters["mode"]])).toEqual([["multiaxis", "swarf"]])
    expect(a.operations[0]!.parameters["skippedSamples"] ?? 0).toBe(0)
    expect(a.nc).toMatch(/\bA-?\d/)
    expect(a.nc).toMatch(/\bC-?\d/)
    expect(a.claims.find((c) => c.id === "nc-replay")!.status).not.toBe("failed")
    // The flank cut is replayed on the tri-dexel against the exact part: it does not cut below the wall, within the declared error.
    const gouge = a.claims.find((c) => c.id === "no-gouge")!
    expect(gouge.status).toBe("passed")
    expect(gouge.detail).toMatch(/tri-dexel/)
  })

  test("a point on the wall is enough: the kernel reads the rulings from the exact solid and writes the same program", () => {
    const named = runJob(job([op({ walls: undefined, near: [{ x: 19, y: 0, z: 2 }] })]))
    const explicit = runJob(job([op()]))
    if (named.status !== "ok" || explicit.status !== "ok") throw new Error("expected two artifacts")
    expect(named.value.nc).toBe(explicit.value.nc)
    // A point that is nowhere near a ruled wall is refused with the reason.
    const flatTop = runJob(job([op({ walls: undefined, near: [{ x: 0, y: 0, z: 30 }] })]))
    const issues = flatTop.status === "ok" ? flatTop.value.issues : flatTop.issues
    expect(issues.map((i) => i.message).join(" ")).toMatch(/point 1/)
  })

  test("without walls the operation fails with the reason, not a silent empty program", () => {
    const r = runJob(job([op({ walls: undefined })]))
    const issues = r.status === "ok" ? r.value.issues : r.issues
    expect(issues.map((i) => i.message).join(" ")).toContain("needs the walls")
    expect(r.status === "ok" ? r.value.release : "blocked").toBe("blocked")
    expect(r.status === "ok" ? r.value.operations.every((o) => o.status !== "ok") : true).toBe(true)
  })

  test("on a machine without a rotary table the operation is refused", () => {
    const r = runJob({ ...job([op()]), machine: findMachine("vmc-standard")! })
    const issues = r.status === "ok" ? r.value.issues : r.issues
    expect(issues.map((i) => i.message).join(" ")).toContain("no rotary table")
    expect(r.status === "ok" ? r.value.release : "blocked").toBe("blocked")
  })
})
