import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/recipes.ts"
import { planOnly, runJob, type CamArtifact, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(100_000)

const plate = buildRecipe("mounting_plate", { width: 80, depth: 50, thickness: 10, fastener: "M5", counterbore: true })
const base: ManufacturingJob = {
  schemaVersion: 1, id: "partial plate", name: "Plate / partial", material: "6061", machine: findMachine("siemens-840d-vmc")!, quality: { resolution: 0.4 },
  part: { kind: "elements", elements: [{ id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: plate.history } as never] }
}
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("one operation that fails does not take the others down", () => {
  // The Siemens post has no rigid tapping: an explicit tap operation fails, the planned operations do not.
  const planned = planOnly(base)
  const good = planned.status === "ok" ? planned.value.operations.filter((o) => !(o.strategy === "drill" && o.cut === "tap")).slice(0, 2) : []
  const tap = { id: "tap", strategy: "drill", points: [{ x: 0, y: 0 }], top: 10, bottom: 0, cut: "tap", tool: "tap-m5" }
  const a = ok(runJob({ ...base, operations: [...good, tap] as never }))

  test("the operations that work keep their toolpaths and NC", () => {
    expect(good.length).toBeGreaterThan(0)
    expect(a.nc).not.toBe("")
    for (const o of good) expect(a.operations.find((x) => x.id === o.id)?.status).toBe("ok")
  })

  test("the failed one is named, as a warning, and the program is released as a preview, never as verified", () => {
    expect(a.operations.find((x) => x.id === "tap")?.status).toBe("failed")
    const issue = a.issues.find((i) => i.operationId === "tap" && i.tag === "GenerationFailed")
    expect(issue?.severity).toBe("warning")
    expect(a.claims.find((c) => c.id === "operations-complete")?.status).toBe("failed")
    expect(a.release).toBe("preview")
  })

  test("a job whose every operation fails still has no NC and stays blocked", () => {
    const none = ok(runJob({ ...base, operations: [tap] as never }))
    expect(none.nc).toBe("")
    expect(none.release).toBe("blocked")
  })
})
