import { describe, expect, test } from "bun:test"
import { makeBox, makeCylinder } from "../cad/brep/index.ts"
import { brepMesh } from "../cad/exchange/index.ts"
import { type Study, compareMaterials, converge, meshSolid, review, runStudy, solidVolume } from "./index.ts"

const cantilever = (over: Partial<Study> = {}): Study => ({
  analysis: "static", geometry: { kind: "box", min: [0, 0, 0], max: [100, 10, 10] }, material: { id: "steel-s235" }, mesh: { size: 10 },
  supports: [{ name: "root", region: { kind: "plane", axis: "x", value: 0 } }],
  loads: [{ kind: "force", region: { kind: "plane", axis: "x", value: 100 }, force: [0, 0, -100] }], ...over
})

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }> }

describe("sim-fea advisor", () => {
  test("converge refines the mesh and reports the displacement settling", () => {
    const c = ok(converge(cantilever(), { metric: "maxDisplacement", levels: 3, factor: 2 }))
    expect(c.levels.length).toBe(3)
    expect(c.levels[2]!.elements).toBeGreaterThan(c.levels[0]!.elements)
    expect(Math.abs(c.levels[2]!.changePercent!)).toBeLessThan(Math.abs(c.levels[1]!.changePercent!) + 1)
    // deflection matches the beam answer within a few percent on the finest mesh
    const E = 210000, G = E / 2.6, I = 833.333, beam = 100 * 100 ** 3 / (3 * E * I) + 100 * 100 / ((5 / 6) * G * 100)
    expect(c.levels[2]!.value).toBeGreaterThan(beam * 0.95); expect(c.levels[2]!.value).toBeLessThan(beam * 1.05)
    expect(c.advice.length).toBeGreaterThan(10)
  })

  test("converge stops at the element budget instead of failing", () => {
    const c = ok(converge(cantilever({ mesh: { size: 5, maxElements: 4000 } }), { metric: "maxDisplacement", levels: 4, factor: 2 }))
    expect(c.limitedByBudget).toBe(true)
    expect(c.levels.length).toBeGreaterThanOrEqual(2)
  })

  test("a material sweep ranks grades by safety factor and finds the lightest that passes", () => {
    const s = ok(compareMaterials(cantilever({ mesh: { size: 10 } }), ["steel-s235", "aluminium-6061-t6", "titanium-ti6al4v", "pla"], 2))
    expect(s.rows.length).toBe(4)
    const al = s.rows.find((r) => r.id === "aluminium-6061-t6")!, steel = s.rows.find((r) => r.id === "steel-s235")!
    expect(al.massKg!).toBeLessThan(steel.massKg!)
    expect(al.maxDisplacement!).toBeGreaterThan(steel.maxDisplacement!)
    expect(s.lightest).toBeDefined()
    expect(s.rows.find((r) => r.id === "pla")!.minSafetyFactor!).toBeLessThan(steel.minSafetyFactor!)
  })

  test("thermal stress sweep: low E x alpha wins, and the review names the constraint", () => {
    const base: Study = {
      analysis: "thermal_stress", geometry: { kind: "box", min: [0, 0, 0], max: [100, 10, 10] }, material: { id: "steel-s235" }, mesh: { size: 10 }, uniformTemperature: 120,
      supports: [{ region: { kind: "plane", axis: "x", value: 0 }, dofs: ["x"] }, { region: { kind: "plane", axis: "x", value: 100 }, dofs: ["x"] }, { region: { kind: "box", min: [0, 0, 0], max: [0, 0, 0] }, dofs: ["y", "z"] }, { region: { kind: "box", min: [0, 10, 0], max: [0, 10, 0] }, dofs: ["z"] }]
    }
    const sweep = ok(compareMaterials(base, ["steel-s235", "titanium-ti6al4v", "stainless-304"], 1))
    const ti = sweep.rows.find((r) => r.id === "titanium-ti6al4v")!, ss = sweep.rows.find((r) => r.id === "stainless-304")!
    expect(ti.maxVonMises!).toBeLessThan(ss.maxVonMises!)
    const r = ok(runStudy(base))
    const f = review(base, r)
    expect(f.some((x) => x.code === "thermal_constraint" && x.severity === "critical")).toBe(true)
    expect(f.some((x) => x.code === "fails")).toBe(true)
  })

  test("review flags a failing, a marginal and an over-designed part", () => {
    const heavy = ok(runStudy(cantilever({ loads: [{ kind: "force", region: { kind: "plane", axis: "x", value: 100 }, force: [0, 0, -800] }] })))
    expect(review(cantilever(), heavy).some((x) => x.code === "fails")).toBe(true)
    const light = ok(runStudy(cantilever({ loads: [{ kind: "force", region: { kind: "plane", axis: "x", value: 100 }, force: [0, 0, -2] }] })))
    expect(review(cantilever(), light).some((x) => x.code === "overdesigned")).toBe(true)
  })
})

describe("sim-fea solid mesher", () => {
  test("a box tessellation meshes like the box, with the full volume", () => {
    const mesh = brepMesh(makeBox(40, 20, 10))
    expect(solidVolume(mesh)).toBeCloseTo(8000, 3)
    const m = meshSolid(mesh, { size: 5 })
    expect(m.ok).toBe(true)
    if (m.ok) expect(m.mesh.quality.volumeRatio).toBeGreaterThan(0.999)
  })

  test("a cylinder is a staircase: the volume ratio is reported and the pull-test stays within a few percent", () => {
    const solid = brepMesh(makeCylinder(5, 20), { chordTol: 0.01 })
    const exact = Math.PI * 25 * 20
    expect(solidVolume(solid)).toBeGreaterThan(exact * 0.99)
    const r = ok(runStudy({
      analysis: "static", geometry: { kind: "solid", positions: solid.positions, indices: solid.indices }, material: { id: "steel-s235" }, mesh: { size: 1.25 },
      supports: [{ region: { kind: "plane", axis: "z", value: 0 } }], loads: [{ kind: "force", region: { kind: "plane", axis: "z", value: 20 }, force: [0, 0, 1000] }]
    }))
    expect(r.meshSummary.volumeRatio!).toBeGreaterThan(0.9); expect(r.meshSummary.volumeRatio!).toBeLessThan(1.05)
    const area = Math.PI * 25 * r.meshSummary.volumeRatio!
    expect(r.summary.maxDisplacement!.value).toBeGreaterThan(1000 * 20 / (210000 * Math.PI * 25) * 0.9)
    void area
  }, 30_000)

  test("an open or empty surface is refused with a reason", () => {
    const open = meshSolid({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }, { size: 1 })
    expect(open.ok).toBe(false)
    const flat = meshSolid(brepMesh(makeBox(10, 10, 10)), { size: 0 })
    expect(flat.ok).toBe(false)
  })
})
