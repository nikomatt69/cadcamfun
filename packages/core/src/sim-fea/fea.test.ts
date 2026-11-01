import { describe, expect, test } from "bun:test"
import { type Study, type StudyResult, MATERIALS, materialById, runStudy, safetyOf, toSolverUnits } from "./index.ts"
import { principal, vonMises } from "./results.ts"

const ok = (r: ReturnType<typeof runStudy>): StudyResult => { if (!r.ok) throw new Error(`${r.code}: ${r.message}`); return r }
const STEEL = { id: "steel-s235" }

/** Uniform tension of a 10 mm cube held by a plane and two corner pins: the field is exactly linear. */
const tensionBar = (over: Partial<Study> = {}): Study => ({
  analysis: "static", geometry: { kind: "box", min: [0, 0, 0], max: [10, 10, 10] }, material: STEEL, mesh: { size: 5 },
  supports: [
    { name: "wall", region: { kind: "plane", axis: "x", value: 0 }, dofs: ["x"] },
    { name: "pin y z", region: { kind: "box", min: [0, 0, 0], max: [0, 0, 0] }, dofs: ["y", "z"] },
    { name: "pin z", region: { kind: "box", min: [0, 10, 0], max: [0, 10, 0] }, dofs: ["z"] }
  ],
  loads: [{ kind: "force", name: "pull", region: { kind: "plane", axis: "x", value: 10 }, force: [1000, 0, 0] }], ...over
})

describe("sim-fea: material library and stress measures", () => {
  test("every material has physical, ordered properties", () => {
    for (const m of MATERIALS) {
      expect(m.poisson).toBeGreaterThan(0); expect(m.poisson).toBeLessThan(0.5)
      expect(m.ultimateMPa).toBeGreaterThanOrEqual(m.yieldMPa)
      const s = toSolverUnits(m)
      expect(s.E).toBe(m.youngGPa * 1000)
      expect(s.rho).toBeCloseTo(m.density * 1e-12, 20)
    }
    expect(new Set(MATERIALS.map((m) => m.id)).size).toBe(MATERIALS.length)
  })

  test("principal stresses and von Mises of known states", () => {
    const p0 = principal([100, 0, 0, 0, 0, 0]); expect(p0[0]).toBeCloseTo(100, 5); expect(p0[1]).toBeCloseTo(0, 5); expect(p0[2]).toBeCloseTo(0, 5)
    const p = principal([0, 0, 0, 50, 0, 0])
    expect(p[0]).toBeCloseTo(50, 9); expect(p[1]).toBeCloseTo(0, 9); expect(p[2]).toBeCloseTo(-50, 9)
    expect(vonMises([0, 0, 0, 50, 0, 0])).toBeCloseTo(50 * Math.sqrt(3), 9)
    expect(vonMises([80, 80, 80, 0, 0, 0])).toBeCloseTo(0, 9)
    const q = principal([30, -20, 10, 5, -7, 3]); expect(q[0]).toBeGreaterThanOrEqual(q[1]); expect(q[1]).toBeGreaterThanOrEqual(q[2])
    expect(q[0] + q[1] + q[2]).toBeCloseTo(20, 9)
  })

  test("criteria: ductile by von Mises or Tresca, brittle by Mohr-Coulomb", () => {
    const steel = toSolverUnits(materialById("steel-s235")!), iron = toSolverUnits(materialById("cast-iron-gg25")!)
    expect(safetyOf("von_mises", steel, 100, 0, 100).safety).toBeCloseTo(2.35, 9)
    expect(safetyOf("tresca", steel, 100, -100, 173).safety).toBeCloseTo(235 / 200, 9)
    // grey iron: tension 125 of 250 is a factor 2; compression 425 of 850 is also 2
    expect(safetyOf("mohr_coulomb", iron, 125, 0, 125).safety).toBeCloseTo(2, 9)
    expect(safetyOf("mohr_coulomb", iron, 0, -425, 425).safety).toBeCloseTo(2, 9)
    expect(safetyOf("von_mises", steel, 0, 0, 0).safety).toBe(1000)
  })
})

describe("sim-fea F1/F2: static stress", () => {
  test("F1 patch test: uniaxial tension reproduces stress and extension exactly", () => {
    const r = ok(runStudy(tensionBar()))
    expect(r.analysis).toBe("static")
    expect(r.summary.maxVonMises!.value).toBeCloseTo(10, 5)
    expect(r.summary.maxPrincipal!.value).toBeCloseTo(10, 5)
    expect(r.summary.minPrincipal!.value).toBeCloseTo(0, 5)
    expect(r.summary.maxDisplacement!.value).toBeGreaterThan(0)
    // extension = sigma L / E; the largest displacement is the end face (lateral Poisson motion is smaller)
    const ux = Math.max(...Array.from({ length: r.mesh.nodeCount }, (_, n) => r.fields.displacement![n * 3]!))
    expect(ux).toBeCloseTo(10 * 10 / 210000, 8)
    expect(r.summary.minSafetyFactor!.value).toBeCloseTo(23.5, 3)
    // the wall carries the whole load
    const wall = r.reactions!.find((x) => x.name === "wall")!
    expect(wall.force[0]).toBeCloseTo(-1000, 3)
  })

  test("F2 cantilever tip deflection against Euler-Bernoulli with shear", () => {
    const r = ok(runStudy({
      analysis: "static", geometry: { kind: "box", min: [0, 0, 0], max: [100, 10, 10] }, material: STEEL, mesh: { size: 5 },
      supports: [{ name: "root", region: { kind: "plane", axis: "x", value: 0 } }],
      loads: [{ kind: "force", region: { kind: "plane", axis: "x", value: 100 }, force: [0, 0, -100] }]
    }))
    const E = 210000, nu = 0.3, G = E / (2 * (1 + nu)), I = 10 * 10 ** 3 / 12, A = 100
    const beam = 100 * 100 ** 3 / (3 * E * I) + 100 * 100 / ((5 / 6) * G * A)
    expect(r.summary.maxDisplacement!.value).toBeGreaterThan(beam * 0.95)
    expect(r.summary.maxDisplacement!.value).toBeLessThan(beam * 1.05)
    // root bending stress M c / I = 100*100*5/833.3 = 60 MPa (the clamp corners raise the peak)
    expect(r.summary.maxVonMises!.value).toBeGreaterThan(55)
  })

  test("gravity and pressure load a part; torque twists it", () => {
    const g = ok(runStudy({
      analysis: "static", geometry: { kind: "box", min: [0, 0, 0], max: [100, 10, 10] }, material: STEEL, mesh: { size: 5 },
      supports: [{ region: { kind: "plane", axis: "x", value: 0 } }], loads: [{ kind: "gravity" }]
    }))
    // w = rho g A = 7.85e-9 * 9810 * 100 = 7.7e-3 N/mm; tip = w L^4 / (8 E I)
    expect(g.summary.maxDisplacement!.value / (7.7e-3 * 1e8 / (8 * 210000 * 833.333))).toBeGreaterThan(0.95)
    expect(g.summary.massKg).toBeCloseTo(0.0785, 4)
    const p = ok(runStudy({ ...tensionBar(), loads: [{ kind: "pressure", region: { kind: "plane", axis: "x", value: 10 }, pressure: -10 }] }))
    expect(p.summary.maxPrincipal!.value).toBeCloseTo(10, 5)
    const t = ok(runStudy({
      analysis: "static", geometry: { kind: "box", min: [0, 0, 0], max: [40, 10, 10] }, material: STEEL, mesh: { size: 5 },
      supports: [{ region: { kind: "plane", axis: "x", value: 0 } }],
      loads: [{ kind: "torque", region: { kind: "plane", axis: "x", value: 40 }, axis: [1, 0, 0], center: [40, 5, 5], torque: 5000 }]
    }))
    expect(t.summary.maxVonMises!.value).toBeGreaterThan(10)
  })

  test("typed refusals: empty region, no support, no load", () => {
    const empty = runStudy(tensionBar({ loads: [{ kind: "force", region: { kind: "plane", axis: "x", value: 55 }, force: [1, 0, 0] }] }))
    expect(!empty.ok && empty.code).toBe("region_empty")
    const free = runStudy({ ...tensionBar(), supports: [] })
    expect(!free.ok && free.code).toBe("under_constrained")
    const none = runStudy({ ...tensionBar(), loads: [] })
    expect(!none.ok && none.code).toBe("invalid_study")
    const bad = runStudy({ ...tensionBar(), material: { id: "unobtainium" } })
    expect(!bad.ok && bad.code).toBe("unknown_material")
  })

  test("a run stops when asked", () => {
    const r = runStudy(tensionBar(), { shouldStop: () => true })
    expect(!r.ok && r.code).toBe("cancelled")
  })
})

describe("sim-fea F9: thermal and thermal stress", () => {
  const slab = (over: Partial<Study> = {}): Study => ({
    analysis: "thermal", geometry: { kind: "box", min: [0, 0, 0], max: [100, 10, 10] }, material: { id: "aluminium-6061-t6" }, mesh: { size: 5 },
    thermal: [{ kind: "temperature", region: { kind: "plane", axis: "x", value: 0 }, value: 100 }, { kind: "temperature", region: { kind: "plane", axis: "x", value: 100 }, value: 20 }], ...over
  })

  test("1D slab: the steady profile is linear between the two temperatures", () => {
    const r = ok(runStudy(slab()))
    expect(r.summary.maxTemperature!.value).toBeCloseTo(100, 6); expect(r.summary.minTemperature!.value).toBeCloseTo(20, 6)
    const T = r.fields.temperature!
    for (let n = 0; n < r.mesh.nodeCount; n++) expect(T[n]!).toBeCloseTo(100 - 0.8 * r.mesh.nodes[n * 3]!, 6)
  })

  test("conduction with flux and convection balances: q = h (T - Tinf)", () => {
    // bar insulated on its sides: flux in at x=0, convection out at x=L; steady surface temperature Tinf + q/h
    const r = ok(runStudy(slab({ thermal: [{ kind: "flux", region: { kind: "plane", axis: "x", value: 0 }, flux: 5000 }, { kind: "convection", region: { kind: "plane", axis: "x", value: 100 }, coefficient: 50, ambient: 25 }] })))
    // exit face: 25 + 5000/50 = 125 C ; the root is hotter by q L / k = 5000 * 0.1 / 167
    expect(r.summary.minTemperature!.value).toBeCloseTo(125, 3)
    expect(r.summary.maxTemperature!.value).toBeCloseTo(125 + 5000 * 0.1 / 167, 2)
  })

  test("a thermal study without a heat path is refused", () => {
    const r = runStudy(slab({ thermal: [{ kind: "heat", power: 10 }] }))
    expect(!r.ok && r.code).toBe("no_heat_path")
  })

  test("free expansion of a clamped bar: extension alpha dT L and no stress", () => {
    const r = ok(runStudy({
      analysis: "thermal_stress", geometry: { kind: "box", min: [0, 0, 0], max: [100, 10, 10] }, material: STEEL, mesh: { size: 5 }, uniformTemperature: 120,
      supports: [{ region: { kind: "plane", axis: "x", value: 0 }, dofs: ["x"] }, { region: { kind: "box", min: [0, 0, 0], max: [0, 0, 0] }, dofs: ["y", "z"] }, { region: { kind: "box", min: [0, 10, 0], max: [0, 10, 0] }, dofs: ["z"] }]
    }))
    const tip = Math.max(...Array.from({ length: r.mesh.nodeCount }, (_, n) => r.fields.displacement![n * 3]!))
    expect(tip).toBeCloseTo(12e-6 * 100 * 100, 6)
    expect(r.summary.maxVonMises!.value).toBeLessThan(1e-3)
  })

  test("fully constrained bar: sigma = -E alpha dT", () => {
    const r = ok(runStudy({
      analysis: "thermal_stress", geometry: { kind: "box", min: [0, 0, 0], max: [100, 10, 10] }, material: STEEL, mesh: { size: 5 }, uniformTemperature: 120,
      supports: [{ region: { kind: "plane", axis: "x", value: 0 }, dofs: ["x"] }, { region: { kind: "plane", axis: "x", value: 100 }, dofs: ["x"] }, { region: { kind: "box", min: [0, 0, 0], max: [0, 0, 0] }, dofs: ["y", "z"] }, { region: { kind: "box", min: [0, 10, 0], max: [0, 10, 0] }, dofs: ["z"] }]
    }))
    expect(r.summary.minPrincipal!.value).toBeCloseTo(-210000 * 12e-6 * 100, 3)
    expect(r.summary.maxVonMises!.value).toBeCloseTo(252, 3)
    expect(r.summary.minSafetyFactor!.value).toBeCloseTo(235 / 252, 3)
    expect(r.reactions!.find((x) => x.name === "support 1")!.force[0]).toBeCloseTo(252 * 100, 0)
  })

  test("a block clamped on every face: hydrostatic -E alpha dT / (1 - 2 nu), no distortion", () => {
    const planes = (["x", "y", "z"] as const).flatMap((axis) => [0, 20].map((value) => ({ region: { kind: "plane" as const, axis, value } })))
    const r = ok(runStudy({ analysis: "thermal_stress", geometry: { kind: "box", min: [0, 0, 0], max: [20, 20, 20] }, material: STEEL, mesh: { size: 5 }, uniformTemperature: 120, supports: planes }))
    expect(r.summary.minPrincipal!.value).toBeCloseTo(-210000 * 12e-6 * 100 / 0.4, 2)
    expect(r.summary.maxVonMises!.value).toBeLessThan(1e-3)
  })

  test("coupled: a heated end of a clamped bar produces thermal stress from the solved temperature", () => {
    const r = ok(runStudy({
      analysis: "thermal_stress", geometry: { kind: "box", min: [0, 0, 0], max: [100, 10, 10] }, material: STEEL, mesh: { size: 5 },
      thermal: [{ kind: "temperature", region: { kind: "plane", axis: "x", value: 0 }, value: 220 }, { kind: "temperature", region: { kind: "plane", axis: "x", value: 100 }, value: 20 }],
      supports: [{ region: { kind: "plane", axis: "x", value: 0 }, dofs: ["x"] }, { region: { kind: "plane", axis: "x", value: 100 }, dofs: ["x"] }, { region: { kind: "box", min: [0, 0, 0], max: [0, 0, 0] }, dofs: ["y", "z"] }, { region: { kind: "box", min: [0, 10, 0], max: [0, 10, 0] }, dofs: ["z"] }]
    }))
    // linear profile between the clamps: the mean rise is 100 K, so the mean axial stress is -E alpha 100
    expect(r.fields.temperature).toBeDefined()
    expect(r.summary.minPrincipal!.value).toBeLessThan(-210000 * 12e-6 * 100 * 0.9)
    expect(r.summary.maxTemperature!.value).toBeCloseTo(220, 6)
  })

  test("transient: a small hot cube cooling by convection follows the lumped-capacity curve", () => {
    const tau = 2700 * 896 * 0.01 / (6 * 100)
    const r = ok(runStudy({
      analysis: "transient_thermal", geometry: { kind: "box", min: [0, 0, 0], max: [10, 10, 10] }, material: { id: "aluminium-6061-t6" }, mesh: { size: 5 },
      initialTemperature: 100, thermal: [{ kind: "convection", region: { kind: "all" }, coefficient: 100, ambient: 20 }], transient: { duration: tau, steps: 80, stressSteps: 0 }
    }))
    expect(r.summary.maxTemperature!.value).toBeGreaterThan(20 + 80 * Math.exp(-1) - 1)
    expect(r.summary.maxTemperature!.value).toBeLessThan(20 + 80 * Math.exp(-1) + 1)
    expect(r.history!.length).toBe(80)
    expect(r.history![79]!.time).toBeCloseTo(tau, 6)
  })

  test("transient thermal shock produces a stress history and reports the peak instant", () => {
    const r = ok(runStudy({
      analysis: "transient_thermal", geometry: { kind: "box", min: [0, 0, 0], max: [20, 20, 20] }, material: STEEL, mesh: { size: 5 }, initialTemperature: 20,
      thermal: [{ kind: "temperature", region: { kind: "plane", axis: "x", value: 0 }, value: 300 }, { kind: "convection", region: { kind: "plane", axis: "x", value: 20 }, coefficient: 20, ambient: 20 }],
      supports: [{ region: { kind: "plane", axis: "z", value: 0 }, dofs: ["z"] }, { region: { kind: "box", min: [0, 0, 0], max: [0, 0, 0] }, dofs: ["x", "y"] }, { region: { kind: "box", min: [20, 0, 0], max: [20, 0, 0] }, dofs: ["y"] }],
      transient: { duration: 5, steps: 20, stressSteps: 4 }
    }))
    expect(r.history!.filter((h) => h.maxVonMises !== undefined).length).toBe(4)
    expect(r.stressTime).toBeDefined()
    expect(r.summary.maxVonMises!.value).toBeGreaterThan(1)
    expect(r.history![19]!.maxTemperature).toBeGreaterThan(r.history![0]!.maxTemperature - 1e-6)
  })
})

describe("sim-fea F5: modal and buckling", () => {
  test("cantilever first bending frequency against Euler-Bernoulli", () => {
    const r = ok(runStudy({
      analysis: "modal", geometry: { kind: "box", min: [0, 0, 0], max: [100, 10, 10] }, material: STEEL, mesh: { size: 5 }, modes: 3,
      supports: [{ region: { kind: "plane", axis: "x", value: 0 } }]
    }))
    const exact = 1.875104 ** 2 / (2 * Math.PI) * Math.sqrt(210e9 * (0.01 ** 4 / 12) / (7850 * 1e-4 * 0.1 ** 4))
    expect(r.modes!.length).toBe(3)
    expect(r.modes![0]!.frequencyHz).toBeGreaterThan(exact * 0.96)
    expect(r.modes![0]!.frequencyHz).toBeLessThan(exact * 1.03)
    // square section: the second mode is the same bending in the other plane
    expect(r.modes![1]!.frequencyHz / r.modes![0]!.frequencyHz).toBeGreaterThan(0.99)
    expect(r.modes![1]!.frequencyHz / r.modes![0]!.frequencyHz).toBeLessThan(1.02)
  })

  test("a free cube shows six rigid-body modes at zero frequency", () => {
    const r = ok(runStudy({ analysis: "modal", geometry: { kind: "box", min: [0, 0, 0], max: [20, 20, 20] }, material: STEEL, mesh: { size: 10 }, modes: 2 }))
    expect(r.modes!.filter((m) => m.rigid).length).toBe(6)
    expect(r.modes!.filter((m) => !m.rigid)[0]!.frequencyHz).toBeGreaterThan(1000)
  })

  test("Euler column: clamped-free buckling factor", () => {
    const r = ok(runStudy({
      analysis: "buckling", geometry: { kind: "box", min: [0, 0, 0], max: [100, 5, 5] }, material: STEEL, mesh: { size: 2.5 }, modes: 2,
      supports: [{ region: { kind: "plane", axis: "x", value: 0 } }],
      loads: [{ kind: "force", region: { kind: "plane", axis: "x", value: 100 }, force: [-1000, 0, 0] }]
    }))
    const pcr = Math.PI ** 2 * 210000 * (5 ** 4 / 12) / (4 * 100 ** 2)
    expect(r.buckling![0]!.factor * 1000).toBeGreaterThan(pcr * 0.93)
    expect(r.buckling![0]!.factor * 1000).toBeLessThan(pcr * 1.08)
    const tension = runStudy({
      analysis: "buckling", geometry: { kind: "box", min: [0, 0, 0], max: [100, 5, 5] }, material: STEEL, mesh: { size: 5 },
      supports: [{ region: { kind: "plane", axis: "x", value: 0 } }], loads: [{ kind: "force", region: { kind: "plane", axis: "x", value: 100 }, force: [1000, 0, 0] }]
    })
    expect(!tension.ok && tension.code).toBe("no_buckling")
  })
})

describe("sim-fea machining load", () => {
  test("Kienzle force of a 2 mm cut in aluminium is the handbook order of magnitude and grows with depth and teeth", async () => {
    const { cuttingForce } = await import("./index.ts")
    const f = cuttingForce({ kc11: 600, mc: 0.25, ap: 2, fz: 0.1 })
    expect(f.tangential).toBeCloseTo(600 * 0.1 ** 0.75 * 2, 6)
    expect(f.tangential).toBeGreaterThan(100); expect(f.tangential).toBeLessThan(400)
    expect(f.resultant).toBeCloseTo(f.tangential * Math.hypot(1, 0.4), 6)
    expect(cuttingForce({ kc11: 600, mc: 0.25, ap: 4, fz: 0.1, teeth: 2 }).tangential).toBeCloseTo(f.tangential * 4, 6)
  })
})
