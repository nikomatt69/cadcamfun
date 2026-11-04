/**
 * The probe kernel jobs (spec 73 §3.2): `cam-probe-plan` (explicit and from a feature), `cam-probe-simulate` against the part as
 * drawn, `cam-probe-calibrate` against a machine whose pivot is not where the control believes. Run inline: the same functions
 * the worker runs, so the two paths cannot drift.
 */
import { describe, expect, test } from "bun:test"
import { brep, cam } from "@cadcamfun/core"
import { runKernelJobInline } from "../src/kernel-job.ts"
import type { CamProbePlanInput, CamProbeSimulateInput } from "../src/cam-probe.ts"

const DEG = Math.PI / 180
const settings: cam.probing.ProbeSettings = { ...cam.probing.DEFAULT_PROBE_SETTINGS, stylusDiameter: 4, safeZ: 50 }
const bore = { kind: "bore" as const, centre: { x: 30, y: 30 }, diameter: 20, depth: 5, top: 0 }

/** A 100 x 60 x 20 plate whose top is z = 0, with a 20 mm hole at (30, 30). */
const plate = () => {
  const block = brep.transformBrep(brep.makeBox(100, 60, 20), brep.translation({ x: 0, y: 0, z: -20 }))
  return brep.booleanBrep(block, brep.transformBrep(brep.makeCylinder(10, 40), brep.translation({ x: 30, y: 30, z: -30 })), "subtract").brep
}
const elements = [{ id: "part", type: "brep", brep: plate(), x: 0, y: 0, z: 0 }] as unknown as ReadonlyArray<Record<string, unknown>>

describe("cam-probe-plan", () => {
  test("an explicit bore is planned with its moves, steps and nominal figures", () => {
    const out = runKernelJobInline("cam-probe-plan", { settings, cycle: bore } satisfies CamProbePlanInput)
    if ("error" in out) throw new Error(out.error)
    expect(out.cycle.kind).toBe("bore")
    expect(out.moves.some((m) => m._tag === "Probe")).toBe(true)
    expect(out.steps.length).toBeGreaterThan(0)
    expect(out.nominal["diameter"]).toBeCloseTo(20, 9)
  })

  test("actions are compiled into the moves (a set-offset writes an OffsetUpdate)", () => {
    const out = runKernelJobInline("cam-probe-plan", {
      settings, cycle: bore,
      actions: [{ kind: "set-offset", ref: { kind: "g5x", code: "G54" }, axes: { X: "x", Y: "y" }, policy: { mode: "set" } }]
    } satisfies CamProbePlanInput)
    if ("error" in out) throw new Error(out.error)
    expect(out.moves.some((m) => m._tag === "OffsetUpdate")).toBe(true)
  })

  test("a feature of an element resolves to its cycle, with the reason", () => {
    const out = runKernelJobInline("cam-probe-plan", { settings, feature: { elements, elementId: "part", hint: "bore" } } satisfies CamProbePlanInput)
    if ("error" in out) throw new Error(out.error)
    expect(out.cycle.kind).toBe("bore")
    expect(out.chosenBecause).toBeDefined()
  })

  test("both a cycle and a feature, or neither, is a refusal, not a throw", () => {
    const both = runKernelJobInline("cam-probe-plan", { settings, cycle: bore, feature: { elements, elementId: "part" } } satisfies CamProbePlanInput)
    expect("error" in both && both.status).toBe(400)
    const neither = runKernelJobInline("cam-probe-plan", { settings } satisfies CamProbePlanInput)
    expect("error" in neither && neither.status).toBe(400)
    const missing = runKernelJobInline("cam-probe-plan", { settings, feature: { elements, elementId: "nope" } } satisfies CamProbePlanInput)
    expect("error" in missing && missing.status).toBe(404)
  })

  test("a stylus that does not fit the bore is refused", () => {
    const out = runKernelJobInline("cam-probe-plan", { settings: { ...settings, stylusDiameter: 24 }, cycle: bore } satisfies CamProbePlanInput)
    expect("error" in out).toBe(true)
  })
})

describe("cam-probe-simulate", () => {
  test("a misplacement is recovered into the offset table", () => {
    const input = {
      settings, elements,
      operations: [{ id: "op1", cycle: bore, actions: [{ kind: "set-offset", ref: { kind: "g5x", code: "G54" }, axes: { X: "x", Y: "y" }, policy: { mode: "set" } }] }],
      misplacement: { x: 0.3, y: -0.2, z: 0.05 }
    } satisfies CamProbeSimulateInput
    const out = runKernelJobInline("cam-probe-simulate", input)
    if ("error" in out) throw new Error(out.error)
    expect(out.report.verdict).toBe("pass")
    expect(out.report.operations).toHaveLength(1)
    expect(out.offsetTable["G54"]?.x).toBeCloseTo(0.3, 3)
    expect(out.offsetTable["G54"]?.y).toBeCloseTo(-0.2, 3)
    expect(out.identity.elements).toMatch(/^[0-9a-f]{64}$/)
  })

  test("a tilt of the part is refused", () => {
    const out = runKernelJobInline("cam-probe-simulate", { settings, elements, operations: [{ cycle: bore }], misplacement: { a: 0.01 } } satisfies CamProbeSimulateInput)
    expect("error" in out && out.error).toMatch(/not simulated/)
  })
})

describe("cam-probe-calibrate", () => {
  test("a pivot the machine does not know is recovered from the simulated ball", () => {
    const angles = [0, 60, 120, 180, 240, 300].map((d) => d * DEG)
    const out = runKernelJobInline("cam-probe-calibrate", {
      settings, axis: "C", sphere: { centre: { x: 80, y: 30, z: 10 }, diameter: 16 }, angles,
      assumed: { layout: "table-AC", pivot: { x: 50, y: 40, z: 0 } },
      truth: { pivot: { x: 50.03, y: 39.98, z: 0.05 } }
    })
    if ("error" in out) throw new Error(out.error)
    expect(out.centres).toHaveLength(6)
    expect(out.calibration?.pivot.x).toBeCloseTo(50.03, 3)
    expect(out.calibration?.pivot.y).toBeCloseTo(39.98, 3)
    expect(out.calibration?.rms).toBeLessThan(1e-3)
  })

  test("measured centres are fitted without a simulation; a mismatched count is refused", () => {
    const angles = [0, 90, 180, 270].map((d) => d * DEG)
    const measured = angles.map((a) => ({ x: 50 + 30 * Math.cos(a), y: 40 + 30 * Math.sin(a), z: 10 }))
    const out = runKernelJobInline("cam-probe-calibrate", {
      settings, axis: "C", sphere: { centre: { x: 80, y: 30, z: 10 }, diameter: 16 }, angles,
      assumed: { layout: "table-AC", pivot: { x: 50, y: 40, z: 0 } }, measured
    })
    if ("error" in out) throw new Error(out.error)
    expect(out.calibration?.pivot.x).toBeCloseTo(50, 6)
    expect(out.calibration?.radius).toBeCloseTo(30, 6)
    const bad = runKernelJobInline("cam-probe-calibrate", {
      settings, axis: "C", sphere: { centre: { x: 80, y: 30, z: 10 }, diameter: 16 }, angles,
      assumed: { layout: "table-AC", pivot: { x: 50, y: 40, z: 0 } }, measured: measured.slice(0, 3)
    })
    expect("error" in bad).toBe(true)
  })
})
