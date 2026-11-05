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

  test("partOrigin: a part drawn away from work zero is found where a cycle in work coordinates expects it", () => {
    // The drawing has the top of the block at z = 50 and its centre at (200, 100); work zero is that point.
    const block = [{ id: "stock", type: "cube", x: 200, y: 100, z: 40, width: 100, height: 60, depth: 20 }] as unknown as ReadonlyArray<Record<string, unknown>>
    const input = {
      settings, elements: block,
      operations: [{ cycle: { kind: "z-surface", at: { x: 0, y: 0 }, expectedZ: 0 } as cam.probing.ProbeCycle }],
      misplacement: { z: 0.3 }
    } satisfies CamProbeSimulateInput
    const placed = runKernelJobInline("cam-probe-simulate", { ...input, partOrigin: { x: 200, y: 100, z: 50 } })
    if ("error" in placed) throw new Error(placed.error)
    expect(placed.report.verdict).not.toBe("missed")
    expect(placed.report.operations[0]!.contacts.length).toBeGreaterThan(0)
    expect(placed.report.operations[0]!.results["z"]).toBeCloseTo(0.3, 6)
    // Without the origin the same cycle stands 150 mm from the block: it must not report a touch.
    const lost = runKernelJobInline("cam-probe-simulate", input)
    if ("error" in lost) throw new Error(lost.error)
    expect(lost.report.verdict).toBe("missed")
  })

  test("a drawing without a closed solid simulates the stock when it is sent, and says so; a solid wins over it", () => {
    const stockElement = { id: "stock", type: "cube", x: 0, y: 0, z: -10, width: 100, height: 60, depth: 20 }
    const operations = [{ cycle: { kind: "z-surface", at: { x: 0, y: 0 }, expectedZ: 0 } as cam.probing.ProbeCycle }]
    const curve = [{ id: "c", type: "line", x1: 0, y1: 0, x2: 10, y2: 0 }]
    expect("error" in runKernelJobInline("cam-probe-simulate", { settings, elements: curve, operations })).toBe(true)
    const out = runKernelJobInline("cam-probe-simulate", { settings, elements: curve, operations, stockElement })
    if ("error" in out) throw new Error(out.error)
    expect(out.warnings.join(" ")).toContain("touches the stock block")
    expect(out.report.operations[0]!.results["z"]).toBeCloseTo(0, 6)
    const solid = runKernelJobInline("cam-probe-simulate", { settings, elements, operations: [{ cycle: bore }], stockElement })
    if ("error" in solid) throw new Error(solid.error)
    expect(solid.warnings.join(" ")).not.toContain("stock block")
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

describe("the NC line of every contact and offset change (spec 73 §1)", () => {
  const G54 = { kind: "g5x" as const, code: "G54" as const }
  const operations = [
    { id: "bore", cycle: bore, actions: [{ kind: "set-offset" as const, ref: G54, axes: { X: "x", Y: "y" }, policy: { mode: "set" as const } }] },
    { id: "top", cycle: { kind: "z-surface" as const, at: { x: 10, y: 10 }, expectedZ: 0 }, actions: [{ kind: "set-offset" as const, ref: G54, axes: { Z: "z" }, policy: { mode: "set" as const } }] }
  ]
  const simulate = (dialect: cam.PostId) => {
    const out = runKernelJobInline("cam-probe-simulate", { settings, elements, operations, dialect, misplacement: { x: 0.3, y: -0.2, z: 0.1 } } satisfies CamProbeSimulateInput)
    if ("error" in out) throw new Error(out.error)
    return out
  }
  for (const [dialect, touch, write] of [["fanuc", /^G91 G31 /, /^#522[123]=/], ["linuxcnc", /^G38\.2 /, /^G10 L2 P1 /], ["siemens", /^G91 MEAS=1 /, /^\$P_UIFR\[1,[XYZ],TR\]=/]] as const) {
    test(`${dialect}: each line is the touch block or the offset write of the program it comes with`, () => {
      const out = simulate(dialect)
      expect(out.warnings.filter((w) => /NC lines/.test(w))).toEqual([])
      const text = out.program!.nc.split("\n")
      expect(out.program!.dialect).toBe(dialect)
      const contacts = out.report.operations.flatMap((o) => o.contacts)
      expect(contacts.length).toBeGreaterThan(6)
      const lines = contacts.map((c) => c.line!)
      for (const l of lines) expect(text[l - 1]!).toMatch(touch)
      // In program order, one block per touch.
      expect(new Set(lines).size).toBe(lines.length)
      expect([...lines].sort((a, b) => a - b)).toEqual(lines)
      expect(out.report.updates.length).toBe(3)
      for (const u of out.report.updates) expect(text[u.line! - 1]!).toMatch(write)
      expect(out.report.updates.map((u) => u.axis)).toEqual(["X", "Y", "Z"])
      // The figures stay the IR's, unrounded by the text.
      expect(out.report.operations[0]!.results["x"]!).toBeCloseTo(30.3, 2)
    })
  }

  test("block numbers in the text: the line is still the line of the text; without a dialect there are none", () => {
    const numbered = runKernelJobInline("cam-probe-simulate", { settings, elements, operations, dialect: "fanuc", options: { lineNumbers: true } } satisfies CamProbeSimulateInput)
    if ("error" in numbered) throw new Error(numbered.error)
    const text = numbered.program!.nc.split("\n")
    for (const c of numbered.report.operations[0]!.contacts) expect(text[c.line! - 1]!).toMatch(/^N\d+ G91 G31 /)
    const out = runKernelJobInline("cam-probe-simulate", { settings, elements, operations } satisfies CamProbeSimulateInput)
    if ("error" in out) throw new Error(out.error)
    expect(out.program).toBeUndefined()
    expect(out.report.operations[0]!.contacts[0]!.line).toBeUndefined()
  })

  test("a control that cannot write the program: the run stands, a warning says why there are no lines", () => {
    const out = simulate("heidenhain")
    expect(out.program).toBeUndefined()
    expect(out.warnings.some((w) => /no NC lines/.test(w))).toBe(true)
    expect(out.report.operations[0]!.results["x"]!).toBeCloseTo(30.3, 2)
  })
})

describe("calibration and native through the kernel jobs", () => {
  test("a stylus on a ring in a simulation: the report carries the stylus record", () => {
    const op = { id: "ring", cycle: { kind: "stylus-calibrate" as const, artefact: { kind: "ring" as const, centre: { x: -60, y: 30 }, diameter: 50, depth: 6, top: 0 }, directions: 4 as const } }
    const out = runKernelJobInline("cam-probe-simulate", { settings, elements, operations: [op], dialect: "fanuc" } satisfies CamProbeSimulateInput)
    if ("error" in out) throw new Error(out.error)
    const cal = out.report.operations[0]!.calibration
    expect(cal?.kind).toBe("stylus")
    if (cal?.kind === "stylus") expect(cal.stylus.effectiveRadius).toBeCloseTo(2, 6)
  })

  test("a rotary axis needs the table; with it, plan and simulate run and the report carries the axis", () => {
    const cycle = { kind: "rotary-axis" as const, axis: "C" as const, sphere: { centre: { x: -60, y: 30, z: 5 }, diameter: 25 }, angles: [0, 90, 180, 270].map((d) => d * DEG) }
    const none = runKernelJobInline("cam-probe-plan", { settings, cycle } satisfies CamProbePlanInput)
    expect("error" in none && none.error).toMatch(/rotary table/)
    const assumed = { layout: "table-AC" as const, pivot: { x: 0, y: 0, z: 0 } }
    const plan = runKernelJobInline("cam-probe-plan", { settings, cycle, assumed, dialect: "fanuc" } satisfies CamProbePlanInput)
    if ("error" in plan) throw new Error(plan.error)
    expect(plan.program!.nc).toContain("C90.000")
    const out = runKernelJobInline("cam-probe-simulate", { settings, elements, operations: [{ cycle }], assumed } satisfies CamProbeSimulateInput)
    if ("error" in out) throw new Error(out.error)
    const cal = out.report.operations[0]!.calibration
    expect(cal?.kind).toBe("rotary")
    if (cal?.kind === "rotary") expect(Math.hypot(cal.rotary.pivotError.x, cal.rotary.pivotError.y)).toBeLessThan(1e-6)
  })

  test("native: the plan writes the cycle, a machine without a package is refused with what to do", () => {
    const out = runKernelJobInline("cam-probe-plan", { settings, cycle: bore, dialect: "fanuc", native: true, macroStyle: "renishaw" } satisfies CamProbePlanInput)
    if ("error" in out) throw new Error(out.error)
    expect(out.native).toBe("G65 P9814")
    expect(out.program!.nc).toContain("G65 P9814 D20.000")
    const refused = runKernelJobInline("cam-probe-plan", { settings, cycle: bore, native: true } satisfies CamProbePlanInput)
    expect("error" in refused && refused.error).toMatch(/Clear native/)
  })
})
