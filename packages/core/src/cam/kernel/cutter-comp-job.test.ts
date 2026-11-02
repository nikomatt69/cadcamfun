import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { findMachine } from "./machines.ts"
import { OperationSpecSchema } from "./schema.ts"

setDefaultTimeout(100_000)

// A plate cut through the full stock height with the control compensating the radius (spec 72 P2-3).
const block = {
  positions: [0, 0, 0, 60, 0, 0, 60, 40, 0, 0, 40, 0, 0, 0, 10, 60, 0, 10, 60, 40, 10, 0, 40, 10],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
}
const stock = { min: { x: -3, y: -3, z: 0 }, max: { x: 63, y: 43, z: 10 } }
const ring = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 }]

const job = (operations: ReadonlyArray<OperationSpec>, over: Partial<ManufacturingJob> = {}): ManufacturingJob => ({
  schemaVersion: 1, id: "comp", name: "Comp", material: "6061", part: { kind: "meshes", meshes: [block] }, stock, operations, ...over
})
const outline = (extra: Record<string, unknown> = {}): OperationSpec =>
  ({ id: "outline", strategy: "profile", tool: "flat-6", loop: ring, side: "outside", top: 10, bottom: 0, allowance: 0, finish: true, leadIn: "direct", ...extra }) as OperationSpec
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}
const status = (a: CamArtifact, id: string) => a.claims.find((c) => c.id === id)?.status

describe("controller cutter compensation in a kernel job", () => {
  const plain = ok(runJob(job([outline()])))
  const comp = ok(runJob(job([outline({ compensation: "controller" })])))

  test("the NC is the contour with G42 D1 and G40, and the path is not the tool-centre path", () => {
    expect(comp.nc).toMatch(/G42 D1/)
    expect(comp.nc).toContain("G40")
    expect(plain.nc).not.toMatch(/G4[12] /)
    // The programmed contour reaches the part's own edge, the tool-centre path stays a radius outside it.
    expect(comp.nc).toMatch(/X30\.000/)
    expect(comp.nc).not.toMatch(/X33\.000/)
    expect(plain.nc).toMatch(/X33\.000/)
  })

  test("the control's offset is replayed: the same material is removed as with the tool-centre path, no gouge, nothing left", () => {
    expect(comp.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(Math.abs(comp.stock.finalVolume - plain.stock.finalVolume)).toBeLessThan(plain.stock.finalVolume * 0.01)
    expect(status(comp, "no-gouge")).toBe("passed")
    expect(status(comp, "material-removed")).toBe("passed")
    expect(status(comp, "nc-replay")).toBe("passed")
    expect(comp.stock.maxRemaining).toBe(0)
  })

  test("the claim names the compensation instead of calling the extents equal", () => {
    const replay = comp.claims.find((c) => c.id === "nc-replay")!
    expect(replay.detail).toMatch(/compensat/i)
  })

  test("a compensated job on a post without the words is refused, never written as the contour", () => {
    const r = runJob(job([outline({ compensation: "controller" })], { machine: { ...findMachine("vmc-standard")!, post: "grbl" } }))
    const issues = r.status === "ok" ? r.value.issues : r.issues
    expect(issues.map((i) => i.message).join(" ")).toMatch(/compensation/)
    expect(r.status === "ok" ? r.value.release : "blocked").toBe("blocked")
    expect(r.status === "ok" ? r.value.nc : "").not.toMatch(/G4[12]/)
  })

  test("tabs with compensation are refused with the reason; the schema takes the field", () => {
    const r = runJob(job([outline({ compensation: "controller", tabs: [{ position: 0.25, width: 6, height: 3 }] })]))
    const issues = r.status === "ok" ? r.value.issues : r.issues
    expect(issues.map((i) => i.message).join(" ")).toMatch(/tabs/)
    expect(Schema.is(OperationSpecSchema)(outline({ compensation: "controller" }))).toBe(true)
    expect(Schema.is(OperationSpecSchema)(outline({ compensation: "sideways" }))).toBe(false)
  })
})
