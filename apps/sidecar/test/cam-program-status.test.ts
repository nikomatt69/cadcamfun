import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { CamProgramStatus, CamRegenerateResult } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(90_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const plate = { id: "plate", type: "cube", name: "Plate", x: 0, y: 0, z: 0, width: 40, height: 30, depth: 8, layerId: "default" }
const status = async (id: string) => Schema.decodeUnknownSync(CamProgramStatus)((await app.call(`/api/toolpaths/${id}/status`)).body)

test("a stored kernel program is current, stays current under a rename, and goes stale with the class and the element when the model changes", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Status program" } })).body.id
  const drawing = (await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate] } } })).body.id
  const handlers = await app.toolHandlers()
  const saved = await handlers.manufactureOperation!(project, { material: "6061" }) as { ok: boolean; operationId: string }
  expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true })

  expect(await status(saved.operationId)).toEqual({ status: "current", displayOnly: [] })

  // A rename and a recolour are not a model change: current, and the element is named as display-only.
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: [{ ...plate, name: "Base plate", color: "#ff0000" }] } } })
  expect(await status(saved.operationId)).toEqual({ status: "current", displayOnly: ["plate"] })
  // The assistant's review says the same: the drawing revision moved (so the review is stale) but the model did not.
  expect(await handlers.reviewOperation!(project, saved.operationId)).toMatchObject({ status: "stale", modelChange: { status: "current", displayOnly: ["plate"] } })

  // A dimension is: stale as geometry, naming the plate.
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: [{ ...plate, width: 44 }] } } })
  expect(await status(saved.operationId)).toMatchObject({ status: "stale", class: "geometry", changed: ["plate"], added: [], removed: [] })
  expect(await handlers.reviewOperation!(project, saved.operationId)).toMatchObject({ status: "stale", modelChange: { status: "stale", class: "geometry", changed: ["plate"] } })

  // The whole part moved: rigid, with the translation.
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: [{ ...plate, x: 5, z: -3 }] } } })
  expect(await status(saved.operationId)).toMatchObject({ status: "stale", class: "rigid", move: { x: 5, y: 0, z: -3 } })

  // An element added: topology.
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: [plate, { id: "pin", type: "cylinder", x: 5, y: 5, z: 5, radius: 3, height: 8 }] } } })
  expect(await status(saved.operationId)).toMatchObject({ status: "stale", class: "topology", added: ["pin"] })

  // Back to the original: current again.
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: [plate] } } })
  expect(await status(saved.operationId)).toEqual({ status: "current", displayOnly: [] })
})

test("the status is authenticated and a toolpath that is not a kernel program is unknown with the reason, never current", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Plain status" } })).body.id
  const plain = await app.call("/api/toolpaths", { method: "POST", json: { name: "Plain", projectId: project, data: { gcode: "G0 X0" }, gcode: "G0 X0" } })
  expect(plain.status).toBe(201)
  expect((await app.call(`/api/toolpaths/${plain.body.id}/status`, { auth: false })).status).toBe(401)
  expect(await status(plain.body.id)).toMatchObject({ status: "unknown", reason: expect.stringContaining("no kernel request") })
  expect((await app.call("/api/toolpaths/no-such-toolpath/status")).status).toBe(404)
})

test("a regeneration preview diffs against the stored program, stores nothing, and an unchanged model regenerates to the same bytes", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Regenerate program" } })).body.id
  const drawing = (await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate] } } })).body.id
  const handlers = await app.toolHandlers()
  const saved = await handlers.manufactureOperation!(project, { material: "6061" }) as { ok: boolean; operationId: string }
  expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true })
  const stored = (await app.call(`/api/toolpaths/${saved.operationId}`)).body
  const regenerate = async (json: unknown = {}) => Schema.decodeUnknownSync(CamRegenerateResult)((await app.call(`/api/toolpaths/${saved.operationId}/regenerate`, { method: "POST", json })).body)

  const same = await regenerate()
  expect(same.status).toEqual({ status: "current", displayOnly: [] })
  if (same.outcome.status !== "ok") throw new Error("expected a regenerated artifact")
  expect(same.outcome.artifact.nc).toBe(stored.gcode)
  expect(same.outcome.diff).toMatchObject({ same: true, safe: true, nc: { identical: true } })

  // A longer plate: the same operations change, the preview carries the new program, and the stored one is untouched.
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: [{ ...plate, width: 55 }] } } })
  const longer = await regenerate()
  expect(longer.status).toMatchObject({ status: "stale", class: "geometry", changed: ["plate"] })
  if (longer.outcome.status !== "ok") throw new Error("expected a regenerated artifact")
  expect(longer.outcome.diff.same).toBe(false)
  expect(longer.outcome.diff.operations.changed.length).toBeGreaterThan(0)
  expect(longer.outcome.diff.cycleTimeSeconds.delta).toBeCloseTo(longer.outcome.artifact.cycleTimeSeconds - stored.data.kernelArtifact.cycleTimeSeconds, 6)
  expect(longer.outcome.artifact.nc).not.toBe(stored.gcode)
  expect((await app.call(`/api/toolpaths/${saved.operationId}`)).body.gcode).toBe(stored.gcode)

  // The assistant previews the same regeneration and gets the same diff.
  const asked = await handlers.regenerateOperation!(project, saved.operationId, "program") as { ok: boolean; mutated: boolean; diff: { same: boolean; cycleTimeSeconds: { delta: number } }; modelChange: { status: string } }
  expect(asked).toMatchObject({ ok: true, mutated: false, modelChange: { status: "stale" } })
  expect(asked.diff.same).toBe(false)
  expect(asked.diff.cycleTimeSeconds.delta).toBeCloseTo(longer.outcome.diff.cycleTimeSeconds.delta, 6)
  expect(await handlers.regenerateOperation!(project, "no-such", "program")).toMatchObject({ ok: false })

  // A part element added since: the program scope leaves it out, the drawing scope machines it.
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: [plate, { id: "pin", type: "cylinder", x: 5, y: 5, z: 5, radius: 3, height: 8 }] } } })
  const program = await regenerate({ scope: "program" })
  expect(program.status).toMatchObject({ status: "stale", class: "topology", added: ["pin"] })
  if (program.outcome.status !== "ok") throw new Error("expected a regenerated artifact")
  expect(program.outcome.diff.same).toBe(true)
  const wide = await regenerate({ scope: "drawing" })
  if (wide.outcome.status !== "ok") throw new Error("expected a regenerated artifact")
  expect(wide.outcome.diff.same).toBe(false)
})

test("regenerating needs a kernel program and the right to open it", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Plain regenerate" } })).body.id
  const plain = await app.call("/api/toolpaths", { method: "POST", json: { name: "Plain", projectId: project, data: { gcode: "G0 X0" }, gcode: "G0 X0" } })
  expect((await app.call(`/api/toolpaths/${plain.body.id}/regenerate`, { method: "POST", json: {} })).status).toBe(400)
  expect((await app.call(`/api/toolpaths/${plain.body.id}/regenerate`, { method: "POST", json: {}, auth: false })).status).toBe(401)
  expect((await app.call("/api/toolpaths/no-such-toolpath/regenerate", { method: "POST", json: {} })).status).toBe(404)
})
