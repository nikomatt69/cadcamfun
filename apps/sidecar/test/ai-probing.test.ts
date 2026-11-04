/**
 * The assistant's probing loop end to end (spec 73 §3.3): a hole becomes a bore cycle, a misplaced part is measured and the correction
 * reaches the machine's offsets, failed or stale reports are refused, and `cam review` reads the verdict. Real database, real kernel.
 */
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { brep } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string
let drawingId: string
let machineId: string
/** The catalogue's HTTP face: the same registry, input schemas and handlers the in-app assistant calls. */
const run = async (tool: string, input: Record<string, unknown>) => {
  const response = await app.call("/api/ai/actions/invoke", { method: "POST", json: { projectId, tool, input } })
  return (response.body.result ?? response.body) as Record<string, any>
}

/** A 100 x 60 x 20 plate whose top is z = 0, with a 20 mm hole at (30, 30). */
const plate = () => {
  const block = brep.transformBrep(brep.makeBox(100, 60, 20), brep.translation({ x: 0, y: 0, z: -20 }))
  return brep.booleanBrep(block, brep.transformBrep(brep.makeCylinder(10, 40), brep.translation({ x: 30, y: 30, z: -30 })), "subtract").brep
}
const elements = () => [{ id: "part", type: "brep", brep: plate(), x: 0, y: 0, z: 0 }]

beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Probing" } })).body.id
  drawingId = (await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: elements(), version: "1.0" } } })).body.id
  const saved = await run("library_edit", {
    action: "upsert_machine_config", name: "VMC probe", kind: "mill", post: "fanuc",
    rotary: { layout: "table-AC", tilt: { min: -120, max: 120 }, pivot: { x: 0, y: 0, z: 100 } },
    probing: { stylusDiameter: 4, toolNumber: 99, feeds: { touch: 60, fast: 500 }, doubleTouch: true },
    toolSetter: { kind: "contact", position: { x: 400, y: -200, z: -350 }, triggerZ: -420, maxToolDiameter: 30, feeds: { fast: 500, touch: 20 }, brokenTolerance: 0.2 },
    workOffsetTable: { entries: { G54: { x: -300, y: -200, z: -400 } } }
  })
  expect(saved).toMatchObject({ ok: true, created: true })
  machineId = saved.id
})
afterAll(async () => { await app.dispose() })

const offsets = () => app.call(`/api/machine-configs/${machineId}/work-offsets`)

test("upsert_machine_config keeps the probe, the setter and the offsets, as the probe routes read them", async () => {
  const config = (await app.call(`/api/machine-configs/${machineId}/probe`)).body
  expect(config.probing).toMatchObject({ stylusDiameter: 4, toolNumber: 99, feeds: { touch: 60, fast: 500 } })
  expect(config.toolSetter).toMatchObject({ kind: "contact", triggerZ: -420 })
  expect((await offsets()).body.entries.G54).toEqual({ x: -300, y: -200, z: -400 })
})

test("a hole becomes a bore: stored with its program, no spindle start; run with a misplaced part; the correction reaches the machine", async () => {
  const stored = await run("cam_edit", { action: "probe", feature: { elementId: "part", hint: "bore" }, workOffset: "G54", machineConfig: machineId })
  expect(stored).toMatchObject({ ok: true, cycle: "bore", dialect: "fanuc" })
  expect(stored.chosenBecause).toBeDefined()
  const row = (await app.call(`/api/toolpaths/${stored.operationId}`)).body
  expect(row).toMatchObject({ operationType: "probing", machineConfigId: machineId, drawingId })
  expect(row.data.format).toBe("cadcamfun-probe")
  expect(row.gcode).not.toMatch(/\bM0?[34]\b/)
  expect(row.gcode).toMatch(/G31/)
  expect(await run("cam", { action: "review", operationId: stored.operationId })).toMatchObject({ ok: false, status: "unverified" })

  const report = await run("cam_edit", { action: "probe_run", operationId: stored.operationId, misplace: { x: 0.3, y: -0.2 } })
  expect(report).toMatchObject({ ok: true, verdict: "pass", offsetsUpdated: true, kind: "part" })
  expect(await run("cam", { action: "review", operationId: stored.operationId })).toMatchObject({ ok: true, status: "pass", reportId: report.reportId, verdict: "pass" })

  const applied = await run("cam_edit", { action: "probe_apply", machineConfig: machineId, reportId: report.reportId, mode: "add" })
  expect(applied).toMatchObject({ ok: true, machineConfigId: machineId, applied: ["G54"] })
  const g54 = (await offsets()).body.entries.G54
  expect(g54.x).toBeCloseTo(-299.7, 3)
  expect(g54.y).toBeCloseTo(-200.2, 3)
  expect(g54.z).toBe(-400)
})

test("named rows are written; a stale base is a conflict; entries and reportId are exclusive", async () => {
  const before = (await offsets()).body
  const set = await run("cam_edit", { action: "probe_apply", machineConfig: machineId, entries: [{ offset: "G55", x: 1, y: 2, z: 3 }], mode: "set", baseUpdatedAt: before.updatedAt })
  expect(set).toMatchObject({ ok: true, applied: ["G55"] })
  const stale = await run("cam_edit", { action: "probe_apply", machineConfig: machineId, entries: [{ offset: "G55", x: 9, y: 9, z: 9 }], mode: "set", baseUpdatedAt: before.updatedAt })
  expect(stale).toMatchObject({ ok: false })
  expect(JSON.stringify(stale)).toContain("conflict")
  expect((await offsets()).body.entries.G55).toEqual({ x: 1, y: 2, z: 3 })
  expect((await run("cam_edit", { action: "probe_apply", machineConfig: machineId, mode: "set" })).ok).toBe(false)
})

test("a failed report and a report of another machine are refused", async () => {
  const stored = await run("cam_edit", {
    action: "probe", operation: { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5, top: 0 }, workOffset: "G54", machineConfig: machineId,
    checks: [{ name: "Ø19", kind: "size", result: "diameter", nominal: 19, lower: -0.01, upper: 0.01 }]
  })
  expect(stored.ok).toBe(true)
  const failed = await run("cam_edit", { action: "probe_run", operationId: stored.operationId })
  expect(failed).toMatchObject({ ok: false, verdict: "fail", failed: 1 })
  expect(await run("cam", { action: "review", operationId: stored.operationId })).toMatchObject({ ok: false, status: "failed", verdict: "fail" })
  const refused = await run("cam_edit", { action: "probe_apply", machineConfig: machineId, reportId: failed.reportId, mode: "add" })
  expect(JSON.stringify(refused)).toContain("never written")
  const other = (await run("library_edit", { action: "upsert_machine_config", name: "Other", kind: "mill" })).id
  const good = await run("cam_edit", { action: "probe", operationId: stored.operationId, operation: { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5, top: 0 }, workOffset: "G54", machineConfig: machineId })
  const pass = await run("cam_edit", { action: "probe_run", operationId: good.operationId })
  expect(pass.verdict).toBe("pass")
  expect(JSON.stringify(await run("cam_edit", { action: "probe_apply", machineConfig: other, reportId: pass.reportId, mode: "add" }))).toContain("another machine")
})

test("a rotary calibration: the pivot error is recovered, written to the machine; never to a setup", async () => {
  const stored = await run("cam_edit", {
    action: "probe", operation: { kind: "rotary-axis", axis: "A", sphere: { centre: { x: 0, y: 0, z: 150 }, diameter: 25 }, angles: [-60, -30, 0, 30, 60] }, machineConfig: machineId, dialect: "fanuc", settings: { safeZ: 260 }
  })
  expect(stored).toMatchObject({ ok: true, cycle: "rotary-axis" })
  const report = await run("cam_edit", { action: "probe_run", operationId: stored.operationId, calibrationError: { pivot: { x: 0.03, y: -0.02, z: 100.05 } } })
  expect(report).toMatchObject({ kind: "rotary", verdict: "pass" })
  expect(report.calibration.pivot.y).toBeCloseTo(-0.02, 2)
  const setup = await run("cam_edit", { action: "probe_apply", machineConfig: machineId, reportId: report.reportId, setupId: "s1", mode: "set" })
  expect(JSON.stringify(setup)).toContain("not to a setup")
  expect(await run("cam_edit", { action: "probe_apply", machineConfig: machineId, reportId: report.reportId, mode: "set" })).toMatchObject({ ok: true, applied: ["rotary calibration"] })
  const config = (await app.call(`/api/machine-configs/${machineId}/probe`)).body
  expect(config.rotaryCalibration.pivotMeasured.y).toBeCloseTo(-0.02, 2)
})

test("a changed drawing makes the operation and its report stale", async () => {
  const stored = await run("cam_edit", { action: "probe", feature: { elementId: "part", hint: "bore" }, workOffset: "G54", machineConfig: machineId })
  const report = await run("cam_edit", { action: "probe_run", operationId: stored.operationId, misplace: { x: 0.1 } })
  expect(report.verdict).toBe("pass")
  expect((await run("cam_edit", { action: "probe", feature: { elementId: "part", hint: "bore" }, expectedRevision: "old" })).status).toBe("stale")
  const updated = await app.call(`/api/drawings/${drawingId}`, { method: "PUT", json: { data: { elements: [...elements(), { id: "extra", type: "cube", x: 200, y: 0, z: 0, width: 10, height: 10, depth: 10 }], version: "1.0" } } })
  expect(updated.status).toBeLessThan(300)
  expect(await run("cam_edit", { action: "probe_run", operationId: stored.operationId })).toMatchObject({ ok: false, status: "stale" })
  expect(await run("cam_edit", { action: "probe_apply", machineConfig: machineId, reportId: report.reportId, mode: "add" })).toMatchObject({ ok: false, status: "stale" })
  expect(await run("cam", { action: "review", operationId: stored.operationId })).toMatchObject({ ok: false, status: "stale" })
})
