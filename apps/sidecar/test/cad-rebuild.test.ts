import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe, exactDigest, exactSummary, rebuild, rebuildExact } from "@cadcamfun/core"
import { CadRebuildReport } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(90_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const post = (json: unknown, auth = true) => app.call("/api/cad/exact/rebuild", { method: "POST", json, auth })

test("the rebuild route is authenticated and refuses a body without a history", async () => {
  expect((await post({ history: recipe.history }, false)).status).toBe(401)
  expect((await post({})).status).toBe(400)
})

test("the server-side rebuild answers with the digest of the desktop's own rebuildExact", async () => {
  const response = await post({ history: JSON.parse(JSON.stringify(recipe.history)) })
  expect(response.status).toBe(200)
  const report = Schema.decodeUnknownSync(CadRebuildReport)(response.body)
  const local = exactSummary(rebuildExact(recipe.history, rebuild(recipe.history)))
  expect(report.digest).toBe(exactDigest(local))
  expect(report.ok).toBe(true)
  expect(report.bodies).toHaveLength(local.length)
  expect(report.bodies[0]!.exact).toBe(true)
  expect(report.bodies[0]!.volume).toBeCloseTo(local[0]!.volume!, 6)
})

test("a different history gives a different digest, and the same one gives the same digest twice", async () => {
  const thicker = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 14, fastener: "M5", counterbore: true })
  const a = Schema.decodeUnknownSync(CadRebuildReport)((await post({ history: JSON.parse(JSON.stringify(recipe.history)) })).body)
  const b = Schema.decodeUnknownSync(CadRebuildReport)((await post({ history: JSON.parse(JSON.stringify(recipe.history)) })).body)
  const c = Schema.decodeUnknownSync(CadRebuildReport)((await post({ history: JSON.parse(JSON.stringify(thicker.history)) })).body)
  expect(b.digest).toBe(a.digest)
  expect(c.digest).not.toBe(a.digest)
})

test("a malformed history is a 400 that names the refused fields", async () => {
  const response = await post({ history: { parameters: {}, features: [{ id: "x", type: "no-such-feature" }] } })
  expect(response.status).toBe(400)
  expect(JSON.stringify(response.body)).toContain("Invalid parametric history")
})
