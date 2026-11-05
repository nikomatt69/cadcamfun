/**
 * The `camProbing` compute routes over HTTP (spec 73 §3.1/§3.2): plan (explicit and from a feature), emit, simulate,
 * calibrate-rotary and a stored operation's run. Settings arrive in wire units (degrees) and are resolved in the service;
 * a refusal of the kernel is the caller's 400 with its reason.
 */
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { CamProbingPlan, CamProbingProgram, CamProbingSimulation, CamRotaryCalibrationResult, ProbeReportDocument } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const bore = { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5, top: 0 }
const plate = [{ id: "plate", type: "cube", x: 50, y: 30, z: -10, width: 100, height: 60, depth: 20 }]

test("plan: an explicit bore, resolved settings, and the refusals of a bad request", async () => {
  expect((await app.call("/api/cam/probing/plan", { method: "POST", json: { operation: bore }, auth: false })).status).toBe(401)
  const planned = Schema.decodeUnknownSync(CamProbingPlan)((await app.call("/api/cam/probing/plan", { method: "POST", json: { operation: bore } })).body)
  expect(planned.cycle).toBe("bore")
  expect(planned.operation.kind).toBe("bore")
  expect(planned.settings.workOffset).toBe("G54")
  expect(planned.steps.length).toBeGreaterThan(0)
  expect(planned.moves.some((m) => m._tag === "Probe")).toBe(true)
  expect(planned.nominal["diameter"]).toBeCloseTo(20, 9)
  // Both a cycle and a feature, or neither, is a 400 that says so.
  const both = await app.call("/api/cam/probing/plan", { method: "POST", json: { operation: bore, feature: { elements: plate, elementId: "plate" } } })
  expect(both.status).toBe(400)
  expect(JSON.stringify(both.body)).toContain("exactly one")
  expect((await app.call("/api/cam/probing/plan", { method: "POST", json: {} })).status).toBe(400)
  // A stylus that does not fit, and an offset key that is not one.
  expect((await app.call("/api/cam/probing/plan", { method: "POST", json: { operation: bore, settings: { stylusDiameter: 24 } } })).status).toBe(400)
  expect((await app.call("/api/cam/probing/plan", { method: "POST", json: { operation: bore, settings: { workOffset: "banana" } } })).status).toBe(400)
})

test("plan: a feature of an element resolves to its cycle in a kernel job", async () => {
  const planned = Schema.decodeUnknownSync(CamProbingPlan)((await app.call("/api/cam/probing/plan", {
    method: "POST", json: { feature: { elements: plate, elementId: "plate", hint: "z-surface" } }
  })).body)
  expect(planned.cycle).toBe("z-surface")
  expect(planned.chosenBecause).toBeDefined()
  const missing = await app.call("/api/cam/probing/plan", { method: "POST", json: { feature: { elements: plate, elementId: "nope" } } })
  expect(missing.status).toBe(404)
})

test("emit: a Fanuc program that never starts the spindle, with spindle orientation when asked", async () => {
  const program = Schema.decodeUnknownSync(CamProbingProgram)((await app.call("/api/cam/probing/emit", {
    method: "POST", json: { operation: bore, dialect: "fanuc", options: { orientSpindle: 0 } }
  })).body)
  expect(program.dialect).toBe("fanuc")
  expect(program.nc).not.toMatch(/(^|\s)M0?[34](\s|$)/m)
  expect(program.nc).toContain("M19")
  expect(program.identity.nc).toMatch(/^[0-9a-f]{64}$/)
  expect(program.lines).toBeGreaterThan(0)
})

test("simulate: the top of the plate is touched where the program believes it is", async () => {
  const out = Schema.decodeUnknownSync(CamProbingSimulation)((await app.call("/api/cam/probing/simulate", {
    method: "POST", json: { elements: plate, operations: [{ operation: { kind: "z-surface", at: { x: 50, y: 30 }, expectedZ: 0 } }] }
  })).body)
  expect(out.report.operations).toHaveLength(1)
  expect(out.report.operations[0]?.contacts.length).toBeGreaterThan(0)
  expect(out.report.verdict).toBe("pass")
  expect(out.identity.elements).toMatch(/^[0-9a-f]{64}$/)
})

test("calibrate-rotary: measured centres are fitted; no assumed table and no machine is a 400", async () => {
  const angles = [0, 90, 180, 270]
  const measured = angles.map((d) => { const a = d * Math.PI / 180; return { x: 50 + 30 * Math.cos(a), y: 40 + 30 * Math.sin(a), z: 10 } })
  const out = Schema.decodeUnknownSync(CamRotaryCalibrationResult)((await app.call("/api/cam/probing/calibrate-rotary", {
    method: "POST", json: { axis: "C", sphere: { centre: { x: 80, y: 30, z: 10 }, diameter: 16 }, angles, assumed: { layout: "table-AC", pivot: { x: 50, y: 40, z: 0 } }, measured }
  })).body)
  expect(out.calibration?.pivot.x).toBeCloseTo(50, 6)
  expect(out.calibration?.radius).toBeCloseTo(30, 6)
  const noAssumed = await app.call("/api/cam/probing/calibrate-rotary", {
    method: "POST", json: { axis: "C", sphere: { centre: { x: 80, y: 30, z: 10 }, diameter: 16 }, angles, measured }
  })
  expect(noAssumed.status).toBe(400)
})

test("reports run: a stored probe operation is simulated and its report kept", async () => {
  const projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Probed plate" } })).body.id as string
  const otherProject = (await app.call("/api/projects", { method: "POST", json: { name: "Other" } })).body.id as string
  const drawingId = (await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: plate } } })).body.id as string
  const operation = {
    kind: "z-surface", at: { x: 50, y: 30 }, expectedZ: 0
  }
  const checks = [{ name: "top", kind: "position", result: "z", nominal: 0, lower: -0.05, upper: 0.05 }]
  const toolpath = await app.call(`/api/drawings/${drawingId}/toolpaths`, {
    method: "POST", json: { name: "Probe top", operationType: "probing", data: { format: "cadcamfun-probe", operation, checks } }
  })
  const operationId = toolpath.body.id as string
  const run = await app.call(`/api/projects/${projectId}/probe-reports`, { method: "POST", json: { operationId } })
  expect(run.status).toBe(201)
  const doc = Schema.decodeUnknownSync(ProbeReportDocument)(run.body)
  expect(doc).toMatchObject({ projectId, toolpathId: operationId, kind: "part", source: "simulated", verdict: "pass" })
  const listed = (await app.call(`/api/projects/${projectId}/probe-reports?operationId=${operationId}`)).body as Array<{ id: string }>
  expect(listed.map((r) => r.id)).toEqual([doc.id])
  // The operation of another project is not found here; an operation without a cycle is a 400.
  expect((await app.call(`/api/projects/${otherProject}/probe-reports`, { method: "POST", json: { operationId } })).status).toBe(404)
  const bare = (await app.call(`/api/drawings/${drawingId}/toolpaths`, { method: "POST", json: { name: "Bare", operationType: "probing", data: { format: "cadcamfun-probe" } } })).body.id as string
  const refused = await app.call(`/api/projects/${projectId}/probe-reports`, { method: "POST", json: { operationId: bare } })
  expect(refused.status).toBe(400)
  expect(JSON.stringify(refused.body)).toContain("no cycle")
})

test("tool setter cycles plan on a machine: the setter is reached through the machine's work zero", async () => {
  const id = (await app.call("/api/machine-configs", { method: "POST", json: { name: "Setter", type: "mill", config: { workVolume: { x: 800, y: 500, z: 500 }, maxSpindleSpeed: 10000, maxFeedRate: 10000 } } })).body.data.id
  const setter = { kind: "contact", position: { x: -300, y: 200, z: -310 }, triggerZ: -350, discDiameter: 12, maxToolDiameter: 80, feeds: { fast: 800, touch: 50 }, brokenTolerance: 0.2 }
  expect((await app.call(`/api/machine-configs/${id}/probe`, { method: "PUT", json: { probing: { stylusDiameter: 4 }, toolSetter: setter } })).status).toBe(200)
  const plan = { operation: { kind: "tool-length", tool: 1, nominalLength: 100 }, settings: { machineConfig: id } }
  // Without the work zero the setter cannot be placed, and the refusal says so.
  const refused = await app.call("/api/cam/probing/plan", { method: "POST", json: plan })
  expect(refused.status).toBe(400)
  expect(JSON.stringify(refused.body)).toContain("work zero")
  expect((await app.call(`/api/machine-configs/${id}/work-offsets`, { method: "PUT", json: { entries: { G54: { x: 100, y: 200, z: -300 } } } })).status).toBe(200)
  const planned = await app.call("/api/cam/probing/plan", { method: "POST", json: plan })
  expect(planned.body).toMatchObject({ cycle: "tool-length" })
  expect(planned.status).toBe(200)
})
