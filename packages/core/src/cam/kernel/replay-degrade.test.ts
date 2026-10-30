/** Spec 69 A5: the stock replay degrades with a declared bound instead of halting four claims. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(100_000)
const claim = (a: CamArtifact, id: string) => a.claims.find((c) => c.id === id)!

const plate: ManufacturingJob = {
  schemaVersion: 1, id: "p", name: "Plate", material: "6061", part: { kind: "elements", elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5 }] },
  machine: findMachine("vmc-standard")!, quality: { resolution: 0.2 }
}

describe("A5: the replay degrades with a declared bound", () => {
  test("a work budget the fine cell would pass is met with a coarser cell, the stock-replay term grows and the claims stay passed", () => {
    const base = runJob(plate)
    if (base.status !== "ok") throw new Error("the plate must run")
    const baseCell = base.value.stock.cellSize
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

  test("cancellation still works while the replay degrades", () => {
    const signal = { aborted: false }
    const r = runJob(plate, { signal, replayWorkLimit: 1e5, onProgress: (p) => { if (p.stage === "post") signal.aborted = true } })
    expect(r.status).toBe("failed")
    if (r.status === "failed") expect(r.issues.map((i) => i.tag)).toEqual(["Cancelled"])
  })
})
