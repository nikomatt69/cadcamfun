import { expect, test } from "bun:test"
import { Schema } from "effect"
import { OpenApi } from "effect/unstable/httpapi"
import { Api } from "../src/index.ts"
import { LiveEvent } from "../src/groups/events.ts"
import {
  CamProbingEmitRequest, CamProbingPlanRequest, CamProbingSimulateRequest, CamRotaryCalibrationRequest, ProbeReportRunBody
} from "../src/cam-probing.ts"

const bore = { kind: "bore", centre: { x: 30, y: 30 }, diameter: 20, depth: 5 }

test("a plan request takes a cycle, in degrees on the wire and radians in the core", () => {
  const r = Schema.decodeUnknownSync(CamProbingPlanRequest)({ operation: { kind: "web", centre: { x: 1, y: 2 }, width: 4, angle: 90, depth: 3 }, settings: { stylusDiameter: 4, workOffset: "G54.1 P3" } })
  expect(r.operation).toMatchObject({ kind: "web", angle: Math.PI / 2 })
  expect(Schema.encodeSync(CamProbingPlanRequest)(r)).toMatchObject({ operation: { angle: 90 } })
})

test("a cycle with an unknown kind, a negative tolerance and a G60 skip are refused by the wire", () => {
  expect(() => Schema.decodeUnknownSync(CamProbingPlanRequest)({ operation: { kind: "warp" } })).toThrow()
  expect(() => Schema.decodeUnknownSync(CamProbingPlanRequest)({ operation: bore, settings: { feed: -5 } })).toThrow()
  expect(() => Schema.decodeUnknownSync(CamProbingPlanRequest)({ operation: bore, settings: { workOffset: "G60!" } })).toThrow()
  expect(() => Schema.decodeUnknownSync(CamProbingPlanRequest)({ operation: bore, checks: [{ name: "d", kind: "size", result: "diameter", nominal: 20, lower: -0.05, upper: 0.05 }] })).not.toThrow()
})

test("an emit request names a dialect the post has", () => {
  expect(Schema.decodeUnknownSync(CamProbingEmitRequest)({ operation: bore, dialect: "siemens", options: { orientSpindle: 90, lineNumbers: true } }).dialect).toBe("siemens")
  expect(() => Schema.decodeUnknownSync(CamProbingEmitRequest)({ operation: bore, dialect: "g60" })).toThrow()
})

test("a simulation takes 1..50 operations, a misplacement and a progress target; a rotary calibration 3..10 angles", () => {
  const elements = [{ id: "a", type: "box" }]
  expect(() => Schema.decodeUnknownSync(CamProbingSimulateRequest)({ elements, operations: [] })).toThrow()
  const ok = Schema.decodeUnknownSync(CamProbingSimulateRequest)({ elements, operations: [{ operation: bore }], misplacement: { x: 0.3, y: -0.2, c: 0.5 }, progress: { projectId: "p", runId: "r" } })
  expect(ok.operations.length).toBe(1)
  const cal = { axis: "C", sphere: { centre: { x: 80, y: 30, z: 10 }, diameter: 16 }, angles: [0, 90, 180] }
  expect(() => Schema.decodeUnknownSync(CamRotaryCalibrationRequest)(cal)).not.toThrow()
  expect(() => Schema.decodeUnknownSync(CamRotaryCalibrationRequest)({ ...cal, angles: [0, 90] })).toThrow()
  expect(() => Schema.decodeUnknownSync(ProbeReportRunBody)({})).toThrow()
})

test("the contract has the routes, the 201, and marks the old probe routes deprecated", () => {
  const doc = OpenApi.fromApi(Api)
  for (const path of ["/api/cam/probing/plan", "/api/cam/probing/emit", "/api/cam/probing/simulate", "/api/cam/probing/calibrate-rotary"]) expect(doc.paths[path]?.post).toBeDefined()
  expect(doc.paths["/api/projects/{id}/probe-reports"]?.post?.responses).toHaveProperty("201")
  expect(doc.paths["/api/projects/{id}/probe-reports"]?.put?.responses).toHaveProperty("201")
  expect(doc.paths["/api/cam/probe/plan"]?.post?.deprecated).toBe(true)
  expect(doc.paths["/api/cam/probe/emit"]?.post?.deprecated).toBe(true)
  expect(doc.paths["/api/machine-configs/{id}/work-offsets"]?.put?.responses).toHaveProperty("409")
})

test("probe.progress and probe.result decode as live events", () => {
  const at = "2026-11-04T10:00:00.000Z"
  expect(Schema.decodeUnknownSync(LiveEvent)({ type: "probe.progress", at, projectId: "p", runId: "r", phase: "running", stage: "touch", index: 2, count: 12 }).type).toBe("probe.progress")
  expect(Schema.decodeUnknownSync(LiveEvent)({ type: "probe.result", at, projectId: "p", runId: "r", verdict: "fail", checks: 4, failed: 1, offsetsUpdated: false, kind: "part" }).type).toBe("probe.result")
  expect(() => Schema.decodeUnknownSync(LiveEvent)({ type: "probe.result", at, projectId: "p", runId: "r", verdict: "great", checks: 1, failed: 0, offsetsUpdated: true, kind: "part" })).toThrow()
})
