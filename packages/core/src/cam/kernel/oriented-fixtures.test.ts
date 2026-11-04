import { expect, setDefaultTimeout, test } from "bun:test"
import { prepareJob, runJob, type ManufacturingJob } from "./index.ts"

setDefaultTimeout(90_000)

// Spec 72 P0-2: a non-+Z setup whose fixing is described by bodies is judged like the +Z one.
const sideJob = (fixtures?: ManufacturingJob["fixtures"]): ManufacturingJob => ({
  schemaVersion: 1, id: "side-fx", name: "Side hole", material: "6061", setupOrientation: "+X",
  part: { kind: "elements", elements: [{ id: "p", type: "parametric", x: 0, y: 0, z: 0, history: {
    parameters: {}, features: [
      { id: "b", type: "primitive", element: "cube", params: { width: 20, height: 16, depth: 10 }, operation: "new" },
      { id: "h", type: "hole", plane: "YZ", offset: 10, at: [0, 0], diameter: 4, depth: 6 }
    ]
  } }] },
  stock: { min: { x: -10, y: -8, z: -5 }, max: { x: 11, y: 8, z: 5 } },
  quality: { resolution: 0.25 },
  ...(fixtures !== undefined ? { fixtures } : {})
})

const drillOnly = (job: ManufacturingJob): ManufacturingJob => {
  const p = prepareJob(job)
  if (p.status !== "ok") throw new Error(JSON.stringify(p.issues))
  return { ...job, operations: p.value.operations.filter((op) => op.strategy === "drill") }
}
const claim = (a: { claims: ReadonlyArray<{ id: string; status: string; detail: string }> }, id: string) => a.claims.find((c) => c.id === id)

test("with a clear fixture body the +X setup decides workholding and forces no open part-coverage", () => {
  const jaw = { id: "vise-jaw", min: { x: -60, y: -20, z: -20 }, max: { x: -40, y: 20, z: 20 } }
  const a = runJob(drillOnly(sideJob([jaw])))
  if (a.status !== "ok") throw new Error(JSON.stringify(a.issues))
  expect(claim(a.value, "setup-workholding")?.status).toBe("passed")
  expect(claim(a.value, "part-coverage")).toBeUndefined()
})

test("without fixtures the manual setup keeps both claims open", () => {
  const a = runJob(drillOnly(sideJob()))
  if (a.status !== "ok") throw new Error(JSON.stringify(a.issues))
  expect(claim(a.value, "setup-workholding")?.status).toBe("unresolved")
  expect(claim(a.value, "part-coverage")?.status).toBe("unresolved")
  expect(a.value.release).not.toBe("verified-program")
})
