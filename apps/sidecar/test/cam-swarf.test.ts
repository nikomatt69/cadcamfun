import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { model } from "@cadcamfun/core"
import { CamKernelResult } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(110_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const m = model()
m.extrude(m.sketch("XY").circle([0, 0], 20), { depth: 30, taper: 5 })
const cone = { id: "cone", type: "parametric", name: "Cone", x: 0, y: 0, z: 0, layerId: "default", history: m.build() }
const request = {
  schemaVersion: 1, id: "swarf-job", name: "Cone", material: "6061", machine: "trunnion-5ax", elements: [cone],
  stock: { x: 0, y: 0, width: 48, height: 48, depth: 31 },
  operations: [{ id: "swarf", strategy: "multiaxis", mode: "swarf", tool: "flat-10", top: 30, stepover: 20, near: [{ x: 19, y: 0, z: 2 }] }]
}
const post = (json: unknown) => app.call("/api/toolpaths/manufacture", { method: "POST", json })

test("a swarf operation is part of the request contract: a point on the wall gives a five-axis program", async () => {
  const bad = await post({ ...request, operations: [{ ...request.operations[0], near: [] }] })
  expect(bad.status).toBe(400)
  const ok = await post(request)
  expect(ok.status).toBe(200)
  const result = Schema.decodeUnknownSync(CamKernelResult)(ok.body)
  if (result.status !== "ok") throw new Error("expected an artifact")
  expect(result.value.operations.map((o) => o.parameters["mode"])).toEqual(["swarf"])
  expect(result.value.nc).toMatch(/\bA-?\d/)
  expect(result.value.nc).toMatch(/\bC-?\d/)
})
