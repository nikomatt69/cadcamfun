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

// ---- reports, incremental and healing (spec 72 step 1.3 additions)

const plate = (lastDiameter: number) => {
  const features: Array<Record<string, unknown>> = [
    { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 120, height: 80 }] } },
    { id: "plate", type: "extrude", sketch: "s", depth: "thick", operation: "new" }
  ]
  for (let i = 0; i < 6; i++) features.push({ id: `h${i}`, type: "hole", plane: "XY", offset: "thick", at: [15 + (i % 3) * 40, 20 + Math.floor(i / 3) * 40], diameter: i === 5 ? lastDiameter : 4, depth: "thick" })
  return { parameters: { thick: 10 }, features }
}

test("every feature reports its state, and a rebuild with a baseline reports how much of the replay the edit reused", async () => {
  const before = plate(4)
  const after = plate(6)
  const plain = Schema.decodeUnknownSync(CadRebuildReport)((await post({ history: after })).body)
  expect(plain.features.map((f) => f.id)).toEqual(["s", "plate", "h0", "h1", "h2", "h3", "h4", "h5"])
  expect(plain.features.every((f) => f.state === "ok")).toBe(true)
  expect(plain.incremental).toBeUndefined()
  expect(plain.healing).toEqual([])

  const resumed = Schema.decodeUnknownSync(CadRebuildReport)((await post({ history: after, baseline: before })).body)
  // Only the last hole changed: the replay resumes after the seven features that did not.
  expect(resumed.incremental).toEqual({ resumedAt: 7, replayed: 1, features: 8 })
  // Resuming is an optimisation, never a different answer.
  expect(resumed.digest).toBe(plain.digest)
  expect(resumed.bodies[0]!.volume).toBeCloseTo(120 * 80 * 10 - 5 * Math.PI * 2 * 2 * 10 - Math.PI * 3 * 3 * 10, 6)
})

test("a malformed baseline is a 400 of its own", async () => {
  const response = await post({ history: plate(4), baseline: { parameters: {}, features: [{ id: "x", type: "no-such-feature" }] } })
  expect(response.status).toBe(400)
  expect(JSON.stringify(response.body)).toContain("Invalid baseline history")
})

test("a feature that cannot be built is reported with its state and the issue behind it", async () => {
  const broken = plate(4)
  broken.features.push({ id: "round", type: "fillet", radius: 500 })
  const report = Schema.decodeUnknownSync(CadRebuildReport)((await post({ history: broken })).body)
  const round = report.features.find((f) => f.id === "round")
  expect(round).toBeDefined()
  expect(round!.type).toBe("fillet")
  expect(round!.state).not.toBe("ok")
  expect(report.issues.some((i) => i.feature === "round")).toBe(true)
})
