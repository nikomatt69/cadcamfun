import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { CamLinkOrder, CamLinkReport, CamProbePlan, CamProbeProgram } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

/** Probing and linking (spec 72 P4-7, P3-4) over HTTP: the route answers what the core function answers. */
setDefaultTimeout(60_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const post = (path: string, json: unknown, auth = true) => app.call(path, { method: "POST", json, auth })
const settings = { stylusDiameter: 4, feed: 100, search: 10, workOffset: "G54", safeZ: 20 }
const bore = { cycle: "bore", centre: { x: 10, y: 20 }, diameter: 30, depth: 8 }

test("the probing and linking routes are authenticated and refuse bodies that are not theirs", async () => {
  for (const path of ["/api/cam/probe/plan", "/api/cam/probe/emit", "/api/cam/linking/report", "/api/cam/linking/order"]) {
    expect((await post(path, {}, false)).status).toBe(401)
    expect((await post(path, {})).status).toBe(400)
  }
})

test("a probing plan is the core planner's, and settings the probe cannot work with are a 400 that says why", async () => {
  const response = await post("/api/cam/probe/plan", { operation: bore, settings })
  expect(response.status).toBe(200)
  const plan = Schema.decodeUnknownSync(CamProbePlan)(response.body)
  expect(plan).toEqual(JSON.parse(JSON.stringify(cam.program.planProbe(bore as never, settings as never))))
  expect(plan.steps.filter((s) => s.kind === "touch").length).toBeGreaterThanOrEqual(4)
  expect(plan.notes.join(" ")).toContain("spindle stays off")
  const refused = await post("/api/cam/probe/plan", { operation: bore, settings: { ...settings, stylusDiameter: 0 } })
  expect(refused.status).toBe(400)
})

test("the probing program is written for each control and keeps the spindle off", async () => {
  const text = async (dialect: string) => Schema.decodeUnknownSync(CamProbeProgram)((await post("/api/cam/probe/emit", { operation: bore, settings, dialect })).body).gcode
  const fanuc = await text("fanuc"), linux = await text("linuxcnc"), siemens = await text("siemens")
  expect(fanuc).toContain("G31")
  expect(linux).toContain("G38.2")
  expect(siemens).toContain("MEAS=1")
  for (const nc of [fanuc, linux, siemens]) { expect(nc).toContain("M5"); expect(nc).not.toMatch(/M0?3\b/) }
  expect((await post("/api/cam/probe/emit", { operation: bore, settings, dialect: "mazatrol" })).status).toBe(400)
})

test("linking: operations of one tool are ordered to shorten the travel, a fixed one is a barrier", async () => {
  const items = [
    { id: "a", tool: "T1", start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
    { id: "far", tool: "T1", start: { x: 100, y: 0 }, end: { x: 100, y: 0 } },
    { id: "near", tool: "T1", start: { x: 10, y: 0 }, end: { x: 10, y: 0 } },
    { id: "finish", tool: "T1", start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, reorderable: false }
  ]
  const response = await post("/api/cam/linking/order", { items, from: { x: 0, y: 0 } })
  expect(response.status).toBe(200)
  const order = Schema.decodeUnknownSync(CamLinkOrder)(response.body)
  expect(order).toEqual(cam.program.orderForLinking(items, { x: 0, y: 0 }))
  expect(order.after).toBeLessThanOrEqual(order.before)
  expect(order.order.indexOf("finish")).toBe(order.order.length - 1)
})

test("linking report: a link that climbs to the clearance plane is lowered to the safe level, cuts are untouched", async () => {
  const at = (x: number, y: number, z: number) => ({ x, y, z })
  const toolpath = {
    id: "tp1", name: "pocket", toolId: "T1", spindleRpm: 8000, coolant: "off",
    moves: [
      { _tag: "Rapid", to: at(0, 0, 50) },
      { _tag: "Linear", to: at(0, 0, -2), feed: 200 },
      { _tag: "Linear", to: at(20, 0, -2), feed: 400 },
      { _tag: "Rapid", to: at(20, 0, 50) },
      { _tag: "Rapid", to: at(80, 0, 50) },
      { _tag: "Rapid", to: at(80, 0, 5) },
      { _tag: "Linear", to: at(80, 0, -2), feed: 200 },
      { _tag: "Linear", to: at(100, 0, -2), feed: 400 }
    ]
  }
  const local = cam.program.linkReport([Schema.decodeUnknownSync(cam.ToolpathSchema)(toolpath)], { lowSafeZ: 10 })
  const response = await post("/api/cam/linking/report", { toolpaths: [toolpath], lowSafeZ: 10 })
  if (response.status !== 200) throw new Error(JSON.stringify(response.body))
  const report = Schema.decodeUnknownSync(CamLinkReport)(response.body)
  expect(report.report).toEqual(local.report)
  expect(report.report.rewrittenLinks).toBeGreaterThan(0)
  expect(report.report.airAfter).toBeLessThan(report.report.airBefore)
  const cuts = (moves: ReadonlyArray<{ _tag: string }>) => moves.filter((m) => m._tag === "Linear")
  expect(cuts(report.toolpaths[0]!.moves)).toEqual(cuts(toolpath.moves))
})
