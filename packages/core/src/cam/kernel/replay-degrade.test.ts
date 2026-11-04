/** Spec 69 A5: the stock replay degrades with a declared bound instead of halting four claims. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(100_000)
const claim = (a: CamArtifact, id: string) => a.claims.find((c) => c.id === id)!

// Explicit operations: the planner's default surface finish leaves corner slivers on a plain plate (spec 72 finding, lane 3), and a
// degraded replay cannot see a sliver narrower than its coarse cell, so the gate needs a fixture that is clean at the fine cell.
const plate: ManufacturingJob = {
  schemaVersion: 1, id: "p", name: "Plate", material: "6061", part: { kind: "elements", elements: [{ id: "block", type: "cube", x: 20, y: 20, z: 5, width: 40, height: 40, depth: 10 }] },
  stock: { min: { x: -2, y: -2, z: 0 }, max: { x: 42, y: 42, z: 11 } },
  operations: [
    { id: "face", strategy: "face", tool: "flat-16-n", bottom: 10 },
    { id: "contour", strategy: "profile", tool: "flat-6-n", loop: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], side: "outside", top: 10, bottom: 0 }
  ],
  machine: findMachine("vmc-standard")!, quality: { resolution: 0.2 }
}

describe("A5: the replay degrades with a declared bound", () => {
  test("a work budget the fine cell would pass is met with a coarser cell, the stock-replay term grows and the claims stay passed", () => {
    const base = runJob(plate)
    if (base.status !== "ok") throw new Error("the plate must run")
    const baseCell = base.value.stock.cellSize
    for (const id of ["no-rapid-in-stock", "holder-clearance", "no-gouge", "material-removed"]) expect(claim(base.value, id).status).toBe("passed")
    let coarse: CamArtifact | undefined
    for (let limit = 1e9; limit > 1e3 && coarse === undefined; limit /= 1.4) {
      const r = runJob(plate, { replayWorkLimit: limit })
      if (r.status === "ok" && r.value.stock.cellSize > baseCell * 1.5) coarse = r.value
    }
    expect(coarse).toBeDefined()
    const c = coarse!
    expect(c.stock.cellSize).toBeGreaterThanOrEqual(baseCell * 2 - 1e-3)
    expect(c.nc).toBe(base.value.nc)
    const term = (a: CamArtifact) => a.tolerance!.terms.find((t) => t.id === "stock-replay")!.mm
    expect(term(c)).toBeGreaterThan(term(base.value) * 1.9)
    expect(c.issues.some((i) => i.stage === "replay" && /ran at .* mm \(cell x \d\)/.test(i.message) && i.severity === "warning")).toBe(true)
    expect(c.issues.some((i) => /replay stopped/.test(i.message))).toBe(false)
    for (const id of ["no-rapid-in-stock", "holder-clearance", "no-gouge", "material-removed"]) {
      expect(claim(c, id).status).toBe(claim(base.value, id).status)
    }
  })

  test("a coarser cell never turns a real gouge into a pass: the overcut stays failed and blocks the release", () => {
    const gouge: ManufacturingJob = {
      ...plate,
      stock: { min: { x: -2, y: -2, z: 0 }, max: { x: 42, y: 42, z: 10 } },
      operations: [{ id: "wrong", strategy: "profile", tool: "flat-6-n", loop: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], side: "inside", top: 10, bottom: 5 }]
    }
    const fine = runJob(gouge)
    if (fine.status !== "ok") throw new Error("the gouge job must run")
    expect(claim(fine.value, "no-gouge").status).toBe("failed")
    let coarse: CamArtifact | undefined
    for (let limit = 1e9; limit > 1e3 && coarse === undefined; limit /= 1.4) {
      const r = runJob(gouge, { replayWorkLimit: limit })
      if (r.status === "ok" && r.value.stock.cellSize > fine.value.stock.cellSize * 1.5) coarse = r.value
    }
    expect(coarse).toBeDefined()
    expect(claim(coarse!, "no-gouge").status).toBe("failed")
    expect(coarse!.release).toBe("blocked")
  })

  test("cancellation still works while the replay degrades", () => {
    const signal = { aborted: false }
    const r = runJob(plate, { signal, replayWorkLimit: 1e5, onProgress: (p) => { if (p.stage === "post") signal.aborted = true } })
    expect(r.status).toBe("failed")
    if (r.status === "failed") expect(r.issues.map((i) => i.tag)).toEqual(["Cancelled"])
  })
})
