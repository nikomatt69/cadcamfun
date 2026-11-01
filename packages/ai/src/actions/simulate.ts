/**
 * `cad.simulate`: the finite-element kernel (`fea` in `@cadcamfun/core`, spec 48) on the exact solid of one element or of a
 * history sent inline. The answer carries numbers, locations and findings with next steps, never whole fields: improving a
 * study is a loop (run, read the findings, change the part or the setup, run again), and `converge` / `materials` are the
 * two loops the kernel runs for the model.
 */
import type { CadSimulateInput } from "@cadcamfun/api"
import { exchange, fea } from "@cadcamfun/core"
import { bodiesOf } from "./export.ts"
import type { ActionContext } from "./action.ts"

type Rec = Record<string, unknown>
const round = (x: number, d = 4): number => Math.round(x * 10 ** d) / 10 ** d
const fail = (error: string, extra: Rec = {}) => ({ ok: false as const, error, ...extra })
/** The sidecar thread runs this synchronously, so the default stays small; the caller may raise it to the hard cap. */
const DEFAULT_ELEMENTS = 12_000
const HARD_ELEMENTS = 40_000

const where = (l: fea.Located | undefined) => l === undefined ? undefined : { value: round(l.value, 3), at: l.at.map((v) => round(v, 2)) }

const refusal = (r: fea.Refusal) => fail(r.message, { code: r.code, ...(r.details !== undefined ? { details: r.details } : {}) })

const summarise = (study: fea.Study, r: fea.StudyResult, probes: ReadonlyArray<readonly [number, number, number]>) => {
  const s = r.summary
  const history = r.history === undefined ? undefined : (() => {
    const step = Math.max(1, Math.ceil(r.history.length / 12))
    return r.history.filter((_, i) => i % step === 0 || i === r.history!.length - 1).map((h) => ({
      time: round(h.time, 3), minTemperature: round(h.minTemperature, 2), maxTemperature: round(h.maxTemperature, 2),
      ...(h.maxVonMises !== undefined ? { maxVonMises: round(h.maxVonMises, 2) } : {}), ...(h.minSafetyFactor !== undefined ? { minSafetyFactor: round(h.minSafetyFactor, 2) } : {})
    }))
  })()
  return {
    ok: true as const, op: "run" as const, analysis: r.analysis, material: r.material, criterion: r.criterion,
    mesh: {
      nodes: r.meshSummary.nodes, elements: r.meshSummary.elements, unknowns: r.meshSummary.dofs, cell: r.meshSummary.cellSize.map((c) => round(c, 3)),
      volumeMm3: round(r.meshSummary.volumeMm3, 2), ...(r.meshSummary.volumeRatio !== undefined ? { volumeRatio: round(r.meshSummary.volumeRatio, 4) } : {}), element: "10-node tetrahedron"
    },
    bounds: { min: r.mesh.bounds.min.map((v) => round(v, 3)), max: r.mesh.bounds.max.map((v) => round(v, 3)) },
    solver: r.solver,
    summary: {
      ...(s.massKg !== undefined ? { massKg: round(s.massKg, 5) } : {}),
      ...(s.maxDisplacement !== undefined ? { maxDisplacementMm: where(s.maxDisplacement) } : {}),
      ...(s.maxVonMises !== undefined ? { maxVonMisesMPa: where(s.maxVonMises) } : {}),
      ...(s.maxTresca !== undefined ? { maxTrescaMPa: where(s.maxTresca) } : {}),
      ...(s.maxPrincipal !== undefined ? { maxPrincipalMPa: where(s.maxPrincipal) } : {}),
      ...(s.minPrincipal !== undefined ? { minPrincipalMPa: where(s.minPrincipal) } : {}),
      ...(s.minSafetyFactor !== undefined ? { minSafetyFactor: where(s.minSafetyFactor) } : {}),
      ...(s.maxTemperature !== undefined ? { maxTemperatureC: where(s.maxTemperature) } : {}),
      ...(s.minTemperature !== undefined ? { minTemperatureC: where(s.minTemperature) } : {})
    },
    ...(r.reactions !== undefined ? { reactionsN: r.reactions.map((x) => ({ name: x.name, force: x.force.map((v) => round(v, 3)) })) } : {}),
    ...(r.modes !== undefined ? { modes: r.modes.map((m, i) => ({ mode: i + 1, frequencyHz: round(m.frequencyHz, 3), ...(m.rigid ? { rigid: true } : {}) })) } : {}),
    ...(r.buckling !== undefined ? { bucklingFactors: r.buckling.map((b) => round(b.factor, 4)) } : {}),
    ...(history !== undefined ? { history } : {}), ...(r.stressTime !== undefined ? { stressTimeS: round(r.stressTime, 3) } : {}),
    ...(probes.length > 0 ? { probes: probes.map((p) => { const v = fea.probe(r, p); return { point: p, nodeDistanceMm: round(v.node.distance, 3), ...(v.displacement !== undefined ? { displacementMm: round(v.displacement, 5) } : {}), ...(v.temperature !== undefined ? { temperatureC: round(v.temperature, 2) } : {}), ...(v.vonMises !== undefined ? { vonMisesMPa: round(v.vonMises, 2), safetyFactor: round(v.safetyFactor!, 2) } : {}) } }) } : {}),
    findings: fea.review(study, r), warnings: r.warnings
  }
}

const libraryRows = () => fea.MATERIALS.map((m) => ({
  id: m.id, name: m.name, family: m.family, ductility: m.ductility, youngGPa: m.youngGPa, poisson: m.poisson, densityKgM3: m.density, yieldMPa: m.yieldMPa, ultimateMPa: m.ultimateMPa,
  conductivity: m.conductivity, specificHeat: m.specificHeat, expansion: m.expansion, ...(m.maxServiceC !== undefined ? { maxServiceC: m.maxServiceC } : {})
}))

export const runCadSimulate = async (input: CadSimulateInput, context: ActionContext): Promise<unknown> => {
  try {
    if (input.op === "library") return { ok: true, op: "library", materials: libraryRows(), criteria: ["von_mises", "tresca", "max_principal", "mohr_coulomb"], note: "Default criterion: von_mises for ductile grades, mohr_coulomb for brittle ones." }
    if (input.analysis === undefined) return fail("analysis is required: static, thermal, thermal_stress, transient_thermal, modal or buckling.")
    if (input.id !== undefined && input.history !== undefined) return fail("Send id (an element of the drawing) or history (a part sent inline), not both.")
    if (input.id === undefined && input.history === undefined) return fail("Name the solid: id (an element of the drawing with an exact solid) or history.")
    const got = await bodiesOf({ ids: input.id !== undefined ? [input.id] : undefined, history: input.history }, context)
    if ("ok" in got) return got
    const pick = input.body !== undefined ? got.bodies.find((b) => b.id === input.body || b.name === input.body) : got.bodies.length === 1 ? got.bodies[0] : undefined
    if (pick === undefined) return fail(got.bodies.length > 1 ? "The part has several bodies: name one with body." : `No body "${input.body}".`, { bodies: got.bodies.map((b) => b.id) })
    // the triangle mesh only classifies grid cells, so a fraction of the element size is accurate enough
    const probeMesh = exchange.brepMesh(pick.brep, { chordTol: 0.05 })
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < probeMesh.positions.length; i += 3) for (let d = 0; d < 3; d++) { min[d] = Math.min(min[d]!, probeMesh.positions[i + d]!); max[d] = Math.max(max[d]!, probeMesh.positions[i + d]!) }
    const extent = [0, 1, 2].map((d) => max[d]! - min[d]!)
    const size = input.size ?? Math.max(0.2, Math.min(Math.max(...extent) / 24, Math.min(...extent) / 2))
    const mesh = exchange.brepMesh(pick.brep, { chordTol: Math.max(0.001, Math.min(0.05, size / 10)) })
    const study: fea.Study = {
      analysis: input.analysis,
      geometry: { kind: "solid", positions: mesh.positions, indices: mesh.indices },
      material: { id: input.material ?? "steel-s235", ...(input.overrides !== undefined ? { overrides: input.overrides } : {}) },
      mesh: { size, maxElements: Math.min(input.maxElements ?? DEFAULT_ELEMENTS, HARD_ELEMENTS) },
      ...(input.supports !== undefined ? { supports: input.supports as fea.Study["supports"] } : {}),
      ...(input.loads !== undefined ? { loads: input.loads as fea.Study["loads"] } : {}),
      ...(input.thermal !== undefined ? { thermal: input.thermal as fea.Study["thermal"] } : {}),
      ...(input.referenceTemperature !== undefined ? { referenceTemperature: input.referenceTemperature } : {}),
      ...(input.uniformTemperature !== undefined ? { uniformTemperature: input.uniformTemperature } : {}),
      ...(input.initialTemperature !== undefined ? { initialTemperature: input.initialTemperature } : {}),
      ...(input.transient !== undefined ? { transient: input.transient } : {}),
      ...(input.modes !== undefined ? { modes: input.modes } : {}),
      ...(input.criterion !== undefined ? { criterion: input.criterion } : {}),
      ...(input.freeExpansion !== undefined ? { freeExpansion: input.freeExpansion } : {})
    }
    const hooks: fea.RunHooks = { shouldStop: () => context.signal?.aborted === true }
    const probes = input.probes ?? []
    if (input.op === "run") {
      const r = fea.runStudy(study, hooks)
      return r.ok ? { ...summarise(study, r, probes), ...(got.warnings.length > 0 ? { warnings: [...got.warnings, ...r.warnings] } : {}), size: round(size, 3) } : refusal(r)
    }
    if (input.op === "converge") {
      const c = fea.converge(study, { ...(input.metric !== undefined ? { metric: input.metric } : {}), ...(input.levels !== undefined ? { levels: input.levels } : {}), ...(input.factor !== undefined ? { factor: input.factor } : {}), ...(input.tolerance !== undefined ? { tolerance: input.tolerance } : {}) }, hooks)
      if (!c.ok) return refusal(c)
      return {
        ok: true, op: "converge", metric: c.metric, converged: c.converged, singularity: c.singularity, limitedByBudget: c.limitedByBudget, tolerance: c.toleranceFraction,
        levels: c.levels.map((l) => ({ ...l, value: round(l.value, 4), ...(l.displacement !== undefined ? { displacement: round(l.displacement, 6) } : {}) })),
        ...(c.extrapolated !== undefined ? { extrapolated: round(c.extrapolated, 4), order: c.order } : {}), advice: c.advice,
        finest: summarise(study, c.result, probes)
      }
    }
    const sweep = fea.compareMaterials(study, input.candidates ?? [], input.targetSafety ?? 2, hooks)
    return sweep.ok ? { ...sweep, op: "materials", size: round(size, 3) } : refusal(sweep)
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : String(cause))
  }
}
