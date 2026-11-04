/** Probe reports of a project over HTTP (spec 73 §3.1): save (201), list newest first with filters, get, delete, access. */
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { ProbeReportDocument, ProbeReportSummary } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(60_000)
let app: Awaited<ReturnType<typeof makeApp>>
let projectId = ""
let otherProject = ""
let operationId = ""
let foreignOperation = ""
beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Probed plate" } })).body.id
  otherProject = (await app.call("/api/projects", { method: "POST", json: { name: "Other" } })).body.id
  operationId = (await app.call("/api/toolpaths", { method: "POST", json: { name: "Probe bore", projectId, operationType: "probing", data: { format: "cadcamfun-probe" } } })).body.id
  foreignOperation = (await app.call("/api/toolpaths", { method: "POST", json: { name: "Elsewhere", projectId: otherProject, operationType: "probing" } })).body.id
})
afterAll(async () => { await app.dispose() })

const body = (over: Record<string, unknown> = {}) => ({
  name: "Bore Ø20", kind: "part", source: "simulated", verdict: "pass", workOffset: "G54", programHash: "a".repeat(64),
  data: { checks: [{ name: "Ø20", measured: 20.004, deviation: 0.004, pass: true }], offsets: [{ ref: "G54", axis: "X", before: 0, after: 0.3 }] }, ...over
})
const path = () => `/api/projects/${projectId}/probe-reports`

test("save answers 201 with the document; list is newest first and filters by operation; get returns the data", async () => {
  expect((await app.call(path(), { method: "PUT", json: body(), auth: false })).status).toBe(401)
  const first = await app.call(path(), { method: "PUT", json: body({ toolpathId: operationId }) })
  expect(first.status).toBe(201)
  const doc = Schema.decodeUnknownSync(ProbeReportDocument)(first.body)
  expect(doc).toMatchObject({ projectId, toolpathId: operationId, verdict: "pass", workOffset: "G54", kind: "part", source: "simulated" })
  const second = Schema.decodeUnknownSync(ProbeReportDocument)((await app.call(path(), { method: "PUT", json: body({ toolpathId: operationId, verdict: "fail" }) })).body)
  const loose = Schema.decodeUnknownSync(ProbeReportDocument)((await app.call(path(), { method: "PUT", json: body({ kind: "rotary", name: "C axis" }) })).body)
  const all = Schema.decodeUnknownSync(Schema.Array(ProbeReportSummary))((await app.call(path())).body)
  expect(all.map((r) => r.id)).toEqual([loose.id, second.id, doc.id])
  expect(all.every((r) => !("data" in r))).toBe(true)
  const byOp = (await app.call(`${path()}?operationId=${operationId}`)).body as Array<{ id: string }>
  expect(byOp.map((r) => r.id)).toEqual([second.id, doc.id])
  expect(((await app.call(`${path()}?limit=1`)).body as unknown[]).length).toBe(1)
  expect(((await app.call(`${path()}?before=${encodeURIComponent(second.createdAt)}`)).body as Array<{ id: string }>).map((r) => r.id)).toEqual([doc.id])
  const got = Schema.decodeUnknownSync(ProbeReportDocument)((await app.call(`${path()}/${doc.id}`)).body)
  expect(got.data).toMatchObject({ checks: [{ name: "Ø20", measured: 20.004 }] })
})

test("bad input is 400: a toolpath of another project, a bad hash, a bad limit, an unknown verdict", async () => {
  const across = await app.call(path(), { method: "PUT", json: body({ toolpathId: foreignOperation }) })
  expect(across.status).toBe(400)
  expect(JSON.stringify(across.body)).toContain("not in this project")
  expect((await app.call(path(), { method: "PUT", json: body({ programHash: "xyz" }) })).status).toBe(400)
  expect((await app.call(path(), { method: "PUT", json: body({ verdict: "ok" }) })).status).toBe(400)
  expect((await app.call(path(), { method: "PUT", json: body({ measuredAt: "yesterday" }) })).status).toBe(400)
  expect((await app.call(`${path()}?limit=0`)).status).toBe(400)
  expect((await app.call(`${path()}?limit=1000`)).status).toBe(400)
})

test("delete, then not found; a report is not reachable through another project; an unknown project is 404", async () => {
  const doc = (await app.call(path(), { method: "PUT", json: body() })).body as { id: string }
  expect((await app.call(`/api/projects/${otherProject}/probe-reports/${doc.id}`)).status).toBe(404)
  expect((await app.call(`/api/projects/${otherProject}/probe-reports/${doc.id}`, { method: "DELETE" })).status).toBe(404)
  const removed = await app.call(`${path()}/${doc.id}`, { method: "DELETE" })
  expect(removed.status).toBe(200)
  expect((await app.call(`${path()}/${doc.id}`)).status).toBe(404)
  expect((await app.call(`${path()}/${doc.id}`, { method: "DELETE" })).status).toBe(404)
  expect((await app.call("/api/projects/nope/probe-reports")).status).toBe(404)
})

test("deleting the probe operation keeps its reports (operation id cleared)", async () => {
  const op = (await app.call("/api/toolpaths", { method: "POST", json: { name: "Probe corner", projectId, operationType: "probing" } })).body.id as string
  const doc = (await app.call(path(), { method: "PUT", json: body({ toolpathId: op }) })).body as { id: string }
  expect((await app.call(`/api/toolpaths/${op}`, { method: "DELETE" })).status).toBe(200)
  expect((await app.call(`${path()}/${doc.id}`)).body).toMatchObject({ id: doc.id, toolpathId: null })
})
