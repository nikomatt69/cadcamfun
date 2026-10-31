import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { brep, buildRecipe, exactDigest, exactSummary, rebuild, rebuildExact } from "@cadcamfun/core"
import { buildTools, decodeHistory, type ToolHandlersShape } from "@cadcamfun/ai"
import { CadImportStepReport, CadRebuildReport } from "@cadcamfun/api"
import { Schema } from "effect"
import { explodeWithGaps } from "../../../packages/core/src/cad/brep/exploded-fixture.ts"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const run = async (id: string, input: unknown) => JSON.parse(await buildTools(handlers, projectId).find((t) => t.id === id)!.execute(input, ctx))
beforeAll(async () => {
  app = await makeApp()
  handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Bases" } })).body.id
})
afterAll(async () => { await app.dispose() })

/** A 10 x 20 x 30 box written face by face with 30 micrometre gaps (healed on import), as STEP text. */
const stepText = brep.writeStepBreps([{ name: "bracket", brep: explodeWithGaps(brep.makeBox(10, 20, 30), 3e-5) }])
/** A through hole of diameter 4 down from the top face: the exact volume of the box with it is 6000 - pi * 4 * 30. */
const hole = { id: "h1", type: "hole", plane: "XY", offset: 30, at: [5, 10], diameter: "bore", depth: 30 }
const VOLUME = 6000 - Math.PI * 4 * 30
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)
const post = (path: string, json: unknown) => app.call(`/api/cad/exact/${path}`, { method: "POST", json })

const imported = async () => {
  const response = await post("import-step", { step: stepText, history: { parameters: { bore: 4 }, features: [hole] } })
  expect(response.status).toBe(200)
  return Schema.decodeUnknownSync(CadImportStepReport)(response.body)
}

test("the import route heals the file, adds the body as a base and answers a history every layer accepts", async () => {
  const report = await imported()
  expect(report.ok).toBe(true)
  expect(report.problems).toEqual([])
  expect(report.bodies).toHaveLength(1)
  expect(report.bodies[0]).toMatchObject({ id: "imported1", name: "bracket", status: "healed", faces: 6 })
  expect(rel(report.bodies[0]!.volume!, 6000)).toBeLessThan(1e-9)
  const history = report.history as { bases: Array<{ id: string; brep: { version: number } }>; features: unknown[] }
  expect(history.bases).toHaveLength(1)
  expect(history.bases[0]!.brep.version).toBe(1)
  expect(history.features).toHaveLength(1)
  const decoded = decodeHistory(history)
  expect(decoded.success).toBe(true)
})

test("API -> rebuild route -> store -> load -> rebuild gives the same exact volume", async () => {
  const report = await imported()
  const history = JSON.parse(JSON.stringify(report.history))

  // The server rebuild.
  const rebuilt = Schema.decodeUnknownSync(CadRebuildReport)((await post("rebuild", { history })).body)
  expect(rebuilt.ok).toBe(true)
  expect(rel(rebuilt.bodies[0]!.volume!, VOLUME)).toBeLessThan(1e-9)

  // Stored by the assistant's create action, loaded by inspect: the bases come back as they went in.
  const created = await run("cad_edit", { action: "parametric_create", name: "Imported bracket", history })
  expect(created.ok).toBe(true)
  const elementId = created.ids?.[0] ?? created.elementId
  const inspected = await run("cad", { action: "parametric_inspect", elementId })
  expect(inspected.ok).toBe(true)
  expect(inspected.history.bases).toEqual(history.bases)
  const loaded = decodeHistory(inspected.history)
  expect(loaded.success).toBe(true)
  if (!loaded.success) return
  const local = exactSummary(rebuildExact(loaded.data, rebuild(loaded.data)))
  expect(rel(local[0]!.volume!, VOLUME)).toBeLessThan(1e-9)
  // The digest of the server's rebuild is the one of the history that went through the store.
  expect(rebuilt.digest).toBe(exactDigest(local))

  // A parameter edit goes through the store again and keeps the base: nothing is stripped on the way.
  const updated = await run("cad_edit", { action: "parametric_update", elementId, expectedRevision: inspected.revision, parameters: { bore: 5 } })
  expect(updated.ok).toBe(true)
  const again = await run("cad", { action: "parametric_inspect", elementId })
  expect(again.history.bases).toEqual(history.bases)
  const exact = await run("cad", { action: "parametric_exact", elementId })
  expect(exact.ok).toBe(true)
  expect(rel(exact.bodies[0].volumeMm3, 6000 - Math.PI * 6.25 * 30)).toBeLessThan(1e-6)
})

test("a history without bases is exactly as it was: no bases key, the same text", () => {
  const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
  const text = JSON.stringify(recipe.history)
  const decoded = decodeHistory(JSON.parse(text))
  expect(decoded.success).toBe(true)
  if (!decoded.success) return
  expect("bases" in decoded.data).toBe(false)
  expect(JSON.stringify(decoded.data)).toBe(text)
})

test("invalid bases are refused with the path of the field", async () => {
  const report = await imported()
  const good = JSON.parse(JSON.stringify(report.history))
  const refuse = (mutate: (h: any) => void) => {
    const h = JSON.parse(JSON.stringify(good))
    mutate(h)
    const decoded = decodeHistory(h)
    expect(decoded.success).toBe(false)
    return decoded.success ? "" : decoded.problems.join(" | ")
  }
  expect(refuse((h) => { h.bases[0].brep.faces[1].loops[0].coedges[0].edge = 9999 })).toContain("bases.0.brep.faces.1.loops.0.coedges.0.edge")
  expect(refuse((h) => { h.bases[0].brep.version = 7 })).toContain("bases.0.brep.version")
  expect(refuse((h) => { h.bases[0].brep.faces[0].surface.kind = "blob" })).toContain("bases.0.brep.faces.0.surface.kind")
  expect(refuse((h) => { h.bases[0].id = "h1" })).toContain("also a feature id")
  expect(refuse((h) => { h.bases.push(JSON.parse(JSON.stringify(h.bases[0]))) })).toContain("Duplicate imported body id")
  // The routes answer 400 with the same message.
  const tampered = JSON.parse(JSON.stringify(good))
  tampered.bases[0].brep.edges[0].v1 = -3
  const response = await post("rebuild", { history: tampered })
  expect(response.status).toBe(400)
  expect(JSON.stringify(response.body)).toContain("bases.0.brep.edges.0.v1")
  const created = await run("cad_edit", { action: "parametric_create", name: "Bad", history: tampered })
  expect(created.ok).toBe(false)
  expect(JSON.stringify(created)).toContain("bases")
})

test("a body that is not a closed solid is refused with the diagnostics of the heal, and nothing is added", async () => {
  const exploded = explodeWithGaps(brep.makeBox(10, 10, 10), 0)
  const open = { ...exploded, faces: exploded.faces.slice(0, 5), shells: [{ faces: [0, 1, 2, 3, 4], closed: true }] }
  const step = brep.writeStepBreps([{ name: "lid-less", brep: open }])
  const response = await post("import-step", { step, history: { parameters: { bore: 4 }, features: [hole] } })
  expect(response.status).toBe(200)
  const report = Schema.decodeUnknownSync(CadImportStepReport)(response.body)
  expect(report.ok).toBe(false)
  expect(report.history).toBeUndefined()
  expect(report.bases).toEqual([])
  expect(report.bodies[0]).toMatchObject({ name: "lid-less", status: "refused" })
  expect(report.bodies[0]!.diagnostics.join(" ")).toContain("face")
  expect(report.problems.join(" ")).toContain("refused")
})

test("a file with one good and one open body is all or nothing unless keepAccepted is sent", async () => {
  const exploded = explodeWithGaps(brep.makeBox(10, 10, 10), 0)
  const open = { ...exploded, faces: exploded.faces.slice(0, 5), shells: [{ faces: [0, 1, 2, 3, 4], closed: true }] }
  const step = brep.writeStepBreps([{ name: "good", brep: brep.makeBox(5, 5, 5) }, { name: "lid-less", brep: open }])
  const none = Schema.decodeUnknownSync(CadImportStepReport)((await post("import-step", { step, history: { parameters: { bore: 4 }, features: [hole] } })).body)
  expect(none.ok).toBe(false)
  expect(none.bases).toEqual([])
  const kept = Schema.decodeUnknownSync(CadImportStepReport)((await post("import-step", { step, keepAccepted: true, history: { parameters: { bore: 4 }, features: [hole] } })).body)
  expect(kept.ok).toBe(true)
  expect(kept.bodies.map((b) => b.status)).toEqual(["exact", "refused"])
  expect(kept.bodies[0]!.id).toBe("imported1")
  expect(kept.bases).toHaveLength(1)
})

test("the route refuses a malformed history, an empty file and a request without a STEP text", async () => {
  expect((await post("import-step", { step: stepText, history: { parameters: {}, features: [{ id: "x", type: "nope" }] } })).status).toBe(400)
  expect((await post("import-step", {})).status).toBe(400)
  const empty = Schema.decodeUnknownSync(CadImportStepReport)((await post("import-step", { step: "not a step file" })).body)
  expect(empty.ok).toBe(false)
  expect(empty.problems.join(" ")).toContain("could not be read as STEP")
})

test("an imported id never collides with a feature id", async () => {
  const response = await post("import-step", { step: stepText, idPrefix: "h", history: { parameters: { bore: 4 }, features: [{ ...hole, id: "h1" }] } })
  const report = Schema.decodeUnknownSync(CadImportStepReport)(response.body)
  expect(report.ok).toBe(true)
  expect(report.bodies[0]!.id).toBe("h1-2")
})

test("a history that holds only an imported body is accepted, rebuilt, stored and loaded", async () => {
  const response = await post("import-step", { step: stepText, history: { parameters: {}, features: [] } })
  expect(response.status).toBe(200)
  const report = Schema.decodeUnknownSync(CadImportStepReport)(response.body)
  expect(report.ok).toBe(true)
  expect(report.problems).toEqual([])
  const history = JSON.parse(JSON.stringify(report.history))
  expect(history.features).toEqual([])
  expect(history.bases).toHaveLength(1)
  const rebuilt = Schema.decodeUnknownSync(CadRebuildReport)((await post("rebuild", { history })).body)
  expect(rebuilt.ok).toBe(true)
  expect(rel(rebuilt.bodies[0]!.volume!, 6000)).toBeLessThan(1e-9)
  const created = await run("cad_edit", { action: "parametric_create", name: "Imported only", history })
  expect(created.ok).toBe(true)
  const elementId = created.ids?.[0] ?? created.elementId
  const inspected = await run("cad", { action: "parametric_inspect", elementId })
  expect(inspected.history.bases).toEqual(history.bases)
  // Neither a feature nor a body is still refused, with the field named.
  const empty = decodeHistory({ parameters: {}, features: [] })
  expect(empty.success).toBe(false)
  if (!empty.success) expect(empty.problems.join(" ")).toContain("at least one feature or one imported body")
})
