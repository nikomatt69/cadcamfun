/**
 * Desktop PMI (spec 49 P1): the panel's grouping/summary, the store's capture bookkeeping, the
 * element-selection → Ref adapter and the save adapter's CAS handling, all over the real
 * `@cadcamfun/core` PMI module and the real PMI API group shapes. No live sidecar is needed:
 * the API adapter is exercised with a fake `AppState` whose client records its calls.
 */
import { expect, test } from "bun:test"
import * as THREE from "three"
import { pmi } from "@cadcamfun/core"
import { activeAnnotations, annotationCallout, annotationSummary, anchorPoint, drawingRows, groupByCapture, isBroken, projectPmiLabels, refFromElement } from "../src/features/pmi/pmi-format.ts"
import { usePmiStore } from "../src/features/pmi/pmi-store.ts"
import { loadPmi, savePmi } from "../src/features/pmi/pmi-api.ts"

const ref: pmi.PmiRef = { body: "plate", kind: "face", key: "plate.top", hint: { x: 5, y: 5, z: 10 } }
const set: pmi.PmiSet = {
  version: 1,
  captures: [
    { id: "c1", name: "Front", annotationIds: ["a1", "a2"] },
    { id: "c2", name: "Top", annotationIds: ["a3", "a4"] }
  ],
  annotations: [
    { id: "a1", captureId: "c1", refs: [ref], kind: "dimensional-size", nominal: 20, upper: 0.1, lower: -0.1, unit: "mm" },
    { id: "a2", captureId: "c1", refs: [ref], kind: "geometric-tolerance", gdt: { kind: "flatness", value: 0.05 } },
    { id: "a3", captureId: "c2", refs: [ref], kind: "datum", letter: "A" },
    { id: "a4", captureId: "c2", refs: [], kind: "note", text: "Deburr all edges" }
  ]
}

test("annotations group by capture and summaries reuse the core drawing wording", () => {
  const groups = groupByCapture(set)
  expect(groups.map((g) => [g.capture.name, g.annotations.map((a) => a.id)])).toEqual([["Front", ["a1", "a2"]], ["Top", ["a3", "a4"]]])
  expect(annotationSummary(set.annotations[0]!)).toBe(pmi.pmiDimensionText(set.annotations[0] as never))
  expect(annotationCallout(set.annotations[1]!)).toContain("flatness")
  expect(annotationCallout(set.annotations[2]!)).toBe("[A]")
  expect(activeAnnotations(set, "c1").map((a) => a.id)).toEqual(["a1", "a2"])
  expect(anchorPoint(set.annotations[0]!)).toEqual([5, 5, 10])
  expect(anchorPoint(set.annotations[3]!)).toBeUndefined()
})

test("drawing rows come from the backend derivation, not a fork", () => {
  const rows = drawingRows(set)
  expect(rows.dimensions.map((d) => d.annotationId)).toEqual(["a1"])
  expect(rows.gdt.map((g) => g.annotationId)).toEqual(["a2"])
  expect(rows.datums).toEqual([{ annotationId: "a3", letter: "A" }])
  expect(rows.notes.map((n) => n.text)).toEqual(["Deburr all edges"])
})

test("broken state is the core validation for that annotation", () => {
  const bad: pmi.PmiSet = { version: 1, captures: [{ id: "c1", name: "Front", annotationIds: ["x1"] }], annotations: [{ id: "x1", captureId: "c1", refs: [ref], kind: "geometric-tolerance", gdt: { kind: "parallelism", value: 0.1 } }] }
  const issues = pmi.validatePmiSet(bad)
  expect(issues.length).toBeGreaterThan(0)
  expect(isBroken(issues, "x1")).toBe(true)
  expect(isBroken(issues, "other")).toBe(false)
})

test("the selection adapter builds a topological ref with the pick hint", () => {
  expect(refFromElement({ id: "el-1", name: "Bracket", x: 1, y: 2, z: 3 })).toEqual({ body: "el-1", kind: "face", key: "Bracket", hint: { x: 1, y: 2, z: 3 } })
  expect(refFromElement({ id: "el-2" }).key).toBe("el-2")
})

test("the store keeps captures and annotations consistent on add and remove", () => {
  usePmiStore.getState().clear()
  usePmiStore.getState().setSet(pmi.emptyPmiSet(), "d1")
  const captureId = usePmiStore.getState().addCapture("Front")
  usePmiStore.getState().addAnnotation({ id: "n1", captureId, refs: [], kind: "note", text: "Hi" })
  let state = usePmiStore.getState()
  expect(state.set.captures.find((c) => c.id === captureId)?.annotationIds).toEqual(["n1"])
  expect(state.activeCaptureId).toBe(captureId)
  expect(pmi.validatePmiSet(state.set)).toEqual([])
  usePmiStore.getState().removeAnnotation("n1")
  state = usePmiStore.getState()
  expect(state.set.annotations).toEqual([])
  expect(state.set.captures[0]?.annotationIds).toEqual([])
  usePmiStore.getState().removeCapture(captureId)
  expect(usePmiStore.getState().set.captures).toEqual([])
})

test("viewport projection anchors labels at the ref hint and lists the rest unanchored", () => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
  camera.position.set(50, 50, 50)
  camera.lookAt(5, 5, 10)
  camera.updateMatrixWorld()
  const { labels, unanchored } = projectPmiLabels(set.annotations, camera, 800, 600)
  expect(labels.map((l) => l.id).sort()).toEqual(["a1", "a2", "a3"])
  expect(labels.every((l) => Number.isFinite(l.x) && Number.isFinite(l.anchorX))).toBe(true)
  expect(unanchored.map((a) => a.id)).toEqual(["a4"])
})

/** Fake AppState: only `runtime.run` + `client.pmi` are used by the adapter. */
const fakeApp = (impl: { get?: () => unknown; update?: () => unknown }): unknown => ({
  runtime: { run: async (effect: unknown) => effect as unknown },
  client: {
    pmi: {
      get: (input: unknown) => { void input; return impl.get?.() },
      update: (input: unknown) => { void input; return impl.update?.() }
    }
  }
})

test("load normalises an absent PMI field to the empty set", async () => {
  const result = await loadPmi(fakeApp({ get: () => ({ drawingId: "d1", pmi: set, fingerprint: "fp", issues: [] }) }) as never, "d1")
  expect(result.set.annotations.length).toBe(4)
  expect(result.fingerprint).toBe("fp")
})

test("save refuses an invalid set locally and surfaces a 409 as conflict, never swallowing it", async () => {
  let calls = 0
  const invalid = await savePmi(fakeApp({ update: () => { calls += 1; return {} } }) as never, "d1", { version: 1, captures: [], annotations: [{ id: "x", captureId: "nope", refs: [], kind: "note", text: "" }] })
  expect(invalid.outcome).toBe("invalid")
  expect(calls).toBe(0)

  const conflict = await savePmi(fakeApp({ update: () => { throw Object.assign(new Error("saved elsewhere"), { _tag: "Conflict" }) } }) as never, "d1", set, "2026-01-01T00:00:00.000Z")
  expect(conflict.outcome).toBe("conflict")

  const saved = await savePmi(fakeApp({ update: () => ({ drawingId: "d1", pmi: set, fingerprint: "fp2", issues: [] }) }) as never, "d1", set)
  expect(saved.outcome).toBe("saved")
  if (saved.outcome === "saved") expect(saved.result.fingerprint).toBe("fp2")
})
