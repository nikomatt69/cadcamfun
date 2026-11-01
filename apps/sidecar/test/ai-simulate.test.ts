import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(120_000)

/** `cad simulate` through the real host: the bridge, the exact kernel and the finite-element solver. */
describe("cad simulate through the bridge", () => {
  let app: Awaited<ReturnType<typeof makeApp>>
  beforeAll(async () => { app = await makeApp() })
  afterAll(async () => { await app.dispose() })

  const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true }).history }

  const setup = async () => {
    const project = (await app.call("/api/projects", { method: "POST", json: { name: "Simulate" } })).body.id as string
    await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate] } } })
    const token = (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "sim-test", projectId: project, mode: "read" } })).body.token as string
    const invoke = (input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", {
      method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool: "cad", input: { action: "simulate", ...input } }
    })
    return { invoke }
  }

  test("the library lists the grades with their strength and thermal data", async () => {
    const { invoke } = await setup()
    const r = await invoke({ op: "library" })
    expect(r.body.result.ok).toBe(true)
    expect(r.body.result.materials.find((m: { id: string }) => m.id === "aluminium-6061-t6")).toMatchObject({ yieldMPa: 276, expansion: 23.6e-6 })
  })

  test("a plate with counterbored holes is clamped on one end and loaded on the other: stress, safety factor and findings", async () => {
    const { invoke } = await setup()
    const probe = await invoke({ op: "run", analysis: "thermal_stress", id: "plate", uniformTemperature: 20, size: 8 })
    expect(probe.body.result).toMatchObject({ ok: true, analysis: "thermal_stress" })
    const { min, max } = probe.body.result.bounds as { min: number[]; max: number[] }
    const run = await invoke({
      op: "run", analysis: "static", id: "plate", size: 6, material: "aluminium-6061-t6",
      supports: [{ name: "clamp", region: { kind: "plane", axis: "x", value: min[0]! } }],
      loads: [{ kind: "force", name: "pull", region: { kind: "plane", axis: "x", value: max[0]! }, force: [0, 0, -300] }],
      probes: [[max[0]!, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2]]
    })
    const r = run.body.result
    expect(r).toMatchObject({ ok: true, op: "run", analysis: "static", criterion: "von_mises", material: { id: "aluminium-6061-t6" } })
    expect(r.summary.maxVonMisesMPa.value).toBeGreaterThan(0)
    expect(r.summary.maxDisplacementMm.value).toBeGreaterThan(0)
    expect(r.reactionsN[0].name).toBe("clamp")
    expect(r.reactionsN[0].force[2]).toBeCloseTo(300, 0)
    expect(r.mesh.volumeRatio).toBeGreaterThan(0.8)
    expect(Array.isArray(r.findings)).toBe(true)
    expect(r.probes[0].displacementMm).toBeGreaterThan(0)
    expect(JSON.stringify(r).length).toBeLessThan(8000)
  })

  test("thermal stress: a clamped plate heated 100 K reports a constraint finding, and the sweep names a gentler grade", async () => {
    const { invoke } = await setup()
    const probe = await invoke({ op: "run", analysis: "thermal_stress", id: "plate", uniformTemperature: 20, size: 8 })
    const { min, max } = probe.body.result.bounds as { min: number[]; max: number[] }
    const input = {
      analysis: "thermal_stress", id: "plate", size: 8, uniformTemperature: 120, material: "aluminium-6061-t6",
      supports: [{ region: { kind: "plane", axis: "x", value: min[0]! }, dofs: ["x"] }, { region: { kind: "plane", axis: "x", value: max[0]! }, dofs: ["x"] },
        { region: { kind: "plane", axis: "y", value: min[1]! }, dofs: ["y"] }, { region: { kind: "plane", axis: "z", value: min[2]! }, dofs: ["z"] }]
    }
    const run = await invoke({ op: "run", ...input })
    expect(run.body.result.ok).toBe(true)
    expect(run.body.result.summary.maxVonMisesMPa.value).toBeGreaterThan(50)
    const sweep = await invoke({ op: "materials", ...input, candidates: ["aluminium-6061-t6", "titanium-ti6al4v", "steel-s235"], targetSafety: 1 })
    expect(sweep.body.result).toMatchObject({ ok: true, op: "materials" })
    expect(sweep.body.result.rows).toHaveLength(3)
  })

  test("converge refines and answers with the levels and its advice; bad input says why", async () => {
    const { invoke } = await setup()
    const probe = await invoke({ op: "run", analysis: "modal", id: "plate", size: 10, modes: 2 })
    expect(probe.body.result.ok).toBe(true)
    expect(probe.body.result.modes.filter((m: { rigid?: boolean }) => m.rigid)).toHaveLength(6)
    const { min } = probe.body.result.bounds as { min: number[] }
    const c = await invoke({
      op: "converge", analysis: "modal", id: "plate", size: 12, modes: 1, levels: 2, factor: 1.5, metric: "frequency",
      supports: [{ region: { kind: "plane", axis: "x", value: min[0]! } }]
    })
    expect(c.body.result).toMatchObject({ ok: true, op: "converge", metric: "frequency" })
    expect(c.body.result.levels).toHaveLength(2)
    expect(typeof c.body.result.advice).toBe("string")

    const empty = await invoke({ op: "run", analysis: "static", id: "plate", size: 8, supports: [{ region: { kind: "plane", axis: "x", value: 9999 } }], loads: [{ kind: "gravity" }] })
    expect(empty.body.result).toMatchObject({ ok: false, code: "region_empty" })
    expect((await invoke({ op: "run", analysis: "static", id: "ghost", size: 8 })).body.result.ok).toBe(false)
    expect((await invoke({ op: "run", id: "plate" })).body.result.ok).toBe(false)
  })
})
