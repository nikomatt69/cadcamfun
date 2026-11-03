import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { CamProgramStatus } from "@cadcamfun/api"
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
