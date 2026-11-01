/**
 * What makes a study improvable (spec 48 §2 step 6): mesh convergence with a Richardson estimate and singularity detection,
 * a material sweep, and a review that turns a result into findings with concrete next steps. The AI harness calls these so a
 * model can run a study, read what is wrong with it, change the part or the setup, and run it again.
 */
import { MATERIALS, materialById, resolveMaterial } from "./materials.ts"
import { type RunHooks, type StudyResult, runStudy } from "./run.ts"
import { type Refusal, type Study } from "./study.ts"

export type Metric = "maxVonMises" | "maxDisplacement" | "minSafetyFactor" | "maxTemperature" | "maxPrincipal" | "frequency" | "bucklingFactor"

export const metricOf = (r: StudyResult, metric: Metric): number | undefined => {
  switch (metric) {
    case "maxVonMises": return r.summary.maxVonMises?.value
    case "maxDisplacement": return r.summary.maxDisplacement?.value
    case "minSafetyFactor": return r.summary.minSafetyFactor?.value
    case "maxTemperature": return r.summary.maxTemperature?.value
    case "maxPrincipal": return r.summary.maxPrincipal?.value
    case "frequency": return r.modes?.find((m) => !m.rigid)?.frequencyHz
    case "bucklingFactor": return r.buckling?.[0]?.factor
  }
}

/** The headline number of an analysis, used when the caller does not name one. */
export const defaultMetric = (analysis: Study["analysis"]): Metric => {
  switch (analysis) {
    case "thermal": case "transient_thermal": return "maxTemperature"
    case "modal": return "frequency"
    case "buckling": return "bucklingFactor"
    default: return "maxVonMises"
  }
}

export interface Finding {
  readonly severity: "critical" | "warning" | "info"
  readonly code: string
  readonly message: string
  /** A concrete next step the caller can take. */
  readonly suggestion?: string
}

export interface ConvergenceLevel {
  readonly size: number
  readonly elements: number
  readonly dofs: number
  readonly value: number
  /** Secondary check: peak displacement (static), so a singular stress can be told from a converged field. */
  readonly displacement?: number
  /** Change of `value` against the previous (coarser) level, percent. */
  readonly changePercent?: number
  readonly milliseconds: number
}

export interface ConvergenceReport {
  readonly ok: true
  readonly metric: Metric
  readonly levels: ReadonlyArray<ConvergenceLevel>
  readonly converged: boolean
  readonly toleranceFraction: number
  /** Richardson extrapolation of the metric to zero element size, when the sequence is monotone. */
  readonly extrapolated?: number
  readonly order?: number
  readonly singularity: boolean
  readonly limitedByBudget: boolean
  readonly advice: string
  /** The finest result, for reading fields or reviewing. */
  readonly result: StudyResult
}

export interface ConvergeOptions {
  readonly metric?: Metric
  /** Number of meshes (2-5). Default 3. */
  readonly levels?: number
  /** Element size ratio between levels (1.2-3). Default 1.6. */
  readonly factor?: number
  /** Relative change accepted as converged. Default 3 %. */
  readonly tolerance?: number
}

export const converge = (study: Study, options: ConvergeOptions = {}, hooks: RunHooks = {}): ConvergenceReport | Refusal => {
  const metric = options.metric ?? defaultMetric(study.analysis)
  const n = Math.max(2, Math.min(options.levels ?? 3, 5)), factor = Math.max(1.2, Math.min(options.factor ?? 1.6, 3)), tol = options.tolerance ?? 0.03
  const levels: ConvergenceLevel[] = []
  let last: StudyResult | undefined
  let limited = false
  for (let i = 0; i < n; i++) {
    const size = study.mesh.size / factor ** i
    const r = runStudy({ ...study, mesh: { ...study.mesh, size } }, hooks)
    if (!r.ok) {
      if (r.code === "too_large" && last !== undefined) { limited = true; break }
      return r
    }
    const value = metricOf(r, metric)
    if (value === undefined) return { ok: false, code: "invalid_study", message: `The metric ${metric} does not exist for a ${study.analysis} study.` }
    const prev = levels[levels.length - 1]
    levels.push({
      size: +size.toFixed(4), elements: r.meshSummary.elements, dofs: r.meshSummary.dofs, value, milliseconds: r.solver.milliseconds,
      ...(r.summary.maxDisplacement !== undefined ? { displacement: r.summary.maxDisplacement.value } : {}),
      ...(prev !== undefined && prev.value !== 0 ? { changePercent: +(100 * (value - prev.value) / Math.abs(prev.value)).toFixed(2) } : {})
    })
    last = r
  }
  if (last === undefined || levels.length < 2) return { ok: false, code: "too_large", message: "Only one mesh fits the element budget: raise the element size or the budget." }
  const a = levels[levels.length - 1]!, b = levels[levels.length - 2]!
  const change = b.value !== 0 ? Math.abs(a.value - b.value) / Math.abs(b.value) : 0
  const converged = change <= tol
  let extrapolated: number | undefined, order: number | undefined
  if (levels.length >= 3) {
    const c = levels[levels.length - 3]!
    const d1 = b.value - c.value, d2 = a.value - b.value
    if (d1 * d2 > 0 && Math.abs(d2) < Math.abs(d1)) {
      order = Math.log(Math.abs(d1 / d2)) / Math.log(factor)
      if (order > 0.2 && order < 6) extrapolated = a.value + d2 / (factor ** order - 1)
    }
  }
  // a stress that keeps growing while the displacement has settled is a singularity (point load, sharp corner), not an answer
  const stressMetric = metric === "maxVonMises" || metric === "maxPrincipal"
  const dispSettled = a.displacement !== undefined && b.displacement !== undefined && b.displacement !== 0 && Math.abs(a.displacement - b.displacement) / Math.abs(b.displacement) < 0.02
  const singularity = stressMetric && !converged && dispSettled && a.value > b.value
  const advice = singularity
    ? "The peak stress keeps rising with every refinement while the displacement has settled: it is a stress singularity (a point load, a sharp re-entrant corner or a support edge). Do not read the peak as a real stress: spread the load over an area, add a fillet at the corner, or judge the stress away from the singularity."
    : converged
      ? `The ${metric} changed by ${(change * 100).toFixed(1)} % on the last refinement: the result is mesh-converged within ${(tol * 100).toFixed(0)} %.${extrapolated !== undefined ? ` Extrapolated to zero element size: ${extrapolated.toPrecision(5)}.` : ""}`
      : limited
        ? `The ${metric} still changed by ${(change * 100).toFixed(1)} % when the element budget ran out: raise the element size ratio or analyse a smaller region.`
        : `The ${metric} still changed by ${(change * 100).toFixed(1)} % on the last refinement: run again with a smaller mesh.size${extrapolated !== undefined ? ` (the trend points to ${extrapolated.toPrecision(5)})` : ""}.`
  return { ok: true, metric, levels, converged, toleranceFraction: tol, ...(extrapolated !== undefined ? { extrapolated } : {}), ...(order !== undefined ? { order: +order.toFixed(2) } : {}), singularity, limitedByBudget: limited, advice, result: last }
}

export interface MaterialRow {
  readonly id: string
  readonly name: string
  readonly massKg?: number
  readonly maxVonMises?: number
  readonly maxDisplacement?: number
  readonly minSafetyFactor?: number
  readonly maxTemperature?: number
  readonly frequencyHz?: number
  readonly bucklingFactor?: number
  readonly ok: boolean
  readonly reason?: string
}

export interface MaterialSweep {
  readonly ok: true
  readonly rows: ReadonlyArray<MaterialRow>
  /** Lightest material whose safety factor reaches `targetSafety` (strength studies). */
  readonly lightest?: string
  readonly best?: string
  readonly advice: string
}

export const compareMaterials = (study: Study, ids: ReadonlyArray<string>, targetSafety = 2, hooks: RunHooks = {}): MaterialSweep | Refusal => {
  const list = ids.length > 0 ? ids : MATERIALS.map((m) => m.id)
  const rows: MaterialRow[] = []
  for (const id of list) {
    const m = materialById(id)
    if (m === undefined) { rows.push({ id, name: id, ok: false, reason: "not in the library" }); continue }
    const r = runStudy({ ...study, material: { id } }, hooks)
    if (!r.ok) {
      if (r.code === "cancelled") return r
      rows.push({ id, name: m.name, ok: false, reason: r.message }); continue
    }
    rows.push({
      id, name: m.name, ok: true, ...(r.summary.massKg !== undefined ? { massKg: +r.summary.massKg.toFixed(5) } : {}),
      ...(r.summary.maxVonMises !== undefined ? { maxVonMises: +r.summary.maxVonMises.value.toFixed(3) } : {}),
      ...(r.summary.maxDisplacement !== undefined ? { maxDisplacement: +r.summary.maxDisplacement.value.toPrecision(4) } : {}),
      ...(r.summary.minSafetyFactor !== undefined ? { minSafetyFactor: +r.summary.minSafetyFactor.value.toFixed(3) } : {}),
      ...(r.summary.maxTemperature !== undefined ? { maxTemperature: +r.summary.maxTemperature.value.toFixed(2) } : {}),
      ...(r.modes?.find((x) => !x.rigid) !== undefined ? { frequencyHz: +r.modes.find((x) => !x.rigid)!.frequencyHz.toFixed(2) } : {}),
      ...(r.buckling?.[0] !== undefined ? { bucklingFactor: +r.buckling[0].factor.toFixed(3) } : {})
    })
  }
  const solved = rows.filter((r) => r.ok)
  if (solved.length === 0) return { ok: false, code: "invalid_study", message: "No candidate material could be solved.", details: { rows } }
  const feasible = solved.filter((r) => (r.minSafetyFactor ?? 0) >= targetSafety && r.massKg !== undefined)
  const lightest = feasible.sort((x, y) => x.massKg! - y.massKg!)[0]?.id
  const best = [...solved].sort((x, y) => (y.minSafetyFactor ?? y.frequencyHz ?? y.bucklingFactor ?? 0) - (x.minSafetyFactor ?? x.frequencyHz ?? x.bucklingFactor ?? 0))[0]?.id
  const advice = study.analysis === "thermal_stress" || study.analysis === "transient_thermal"
    ? "Thermal stress scales with E x alpha x the temperature difference the part is not free to take up: low-expansion, low-modulus grades win, but check the service temperature."
    : lightest !== undefined ? `${lightest} is the lightest grade that keeps a safety factor of ${targetSafety}.` : `No candidate reaches a safety factor of ${targetSafety}: change the geometry or the loads as well.`
  return { ok: true, rows, ...(lightest !== undefined ? { lightest } : {}), ...(best !== undefined ? { best } : {}), advice }
}

/** Findings and next steps for a result: the review a designer would do before trusting it. */
export const review = (study: Study, r: StudyResult): Finding[] => {
  const out: Finding[] = []
  const material = resolveMaterial(study.material)
  const sf = r.summary.minSafetyFactor
  const diag = Math.hypot(r.mesh.bounds.max[0] - r.mesh.bounds.min[0], r.mesh.bounds.max[1] - r.mesh.bounds.min[1], r.mesh.bounds.max[2] - r.mesh.bounds.min[2])
  if (sf !== undefined) {
    const where = `at (${sf.at.map((v) => v.toFixed(1)).join(", ")}) mm`
    if (sf.value < 1) out.push({ severity: "critical", code: "fails", message: `Safety factor ${sf.value.toFixed(2)} ${where}: the ${r.criterion.replace("_", " ")} stress exceeds the allowable.`, suggestion: "Thicken the section, add a fillet at the highlighted corner, spread the load over more area, or use a stronger material (run the materials sweep)." })
    else if (sf.value < 1.5) out.push({ severity: "warning", code: "marginal", message: `Safety factor ${sf.value.toFixed(2)} ${where} is below the usual 1.5-2 for a static load.`, suggestion: "Add margin or confirm the loads are the worst case; check mesh convergence before relying on the peak." })
    else if (sf.value > 8 && r.analysis === "static") out.push({ severity: "info", code: "overdesigned", message: `Safety factor ${sf.value.toFixed(1)}: the part carries much more than the load.`, suggestion: "Remove material (pockets, thinner walls) or move to a lighter grade; re-run to see the margin." })
  }
  if (r.summary.maxDisplacement !== undefined && r.summary.maxDisplacement.value > 0.01 * diag && r.analysis !== "modal") {
    out.push({ severity: "warning", code: "large_displacement", message: `The peak displacement ${r.summary.maxDisplacement.value.toPrecision(3)} mm is above 1 % of the part size: linear theory is optimistic here.`, suggestion: "Stiffen the part (a deeper section) or treat the result as an upper bound on stiffness." })
  }
  if (r.summary.maxTemperature !== undefined && material?.maxServiceC !== undefined && r.summary.maxTemperature.value > material.maxServiceC) {
    out.push({ severity: "critical", code: "service_temperature", message: `The peak temperature ${r.summary.maxTemperature.value.toFixed(0)} °C exceeds the service limit of ${material.name} (${material.maxServiceC} °C).`, suggestion: "Use a grade rated for the temperature, add cooling (convection) or a heat path to the sink." })
  }
  if ((r.analysis === "thermal_stress" || r.analysis === "transient_thermal") && r.summary.maxVonMises !== undefined && material !== undefined) {
    const ratio = r.summary.maxVonMises.value / material.yieldMPa
    if (ratio > 0.8) out.push({ severity: ratio > 1 ? "critical" : "warning", code: "thermal_constraint", message: `Thermal stress reaches ${(ratio * 100).toFixed(0)} % of the yield: the part is not free to expand.`, suggestion: "Release one support along the expansion direction (slotted hole, floating bearing), add an expansion loop or bellows, reduce the temperature swing, or pick a grade with lower E x alpha (run the materials sweep)." })
    if ((study.supports ?? []).length === 0) out.push({ severity: "info", code: "free_expansion", message: "No supports: only the self-equilibrated thermal stress is shown.", suggestion: "Add the real supports to see the stress from restrained expansion." })
  }
  if (r.analysis === "buckling" && r.buckling?.[0] !== undefined) {
    const f = r.buckling[0].factor
    if (f < 1) out.push({ severity: "critical", code: "buckles", message: `Buckling factor ${f.toFixed(2)}: the applied load is above the elastic critical load.`, suggestion: "Shorten the free length, add a brace, or increase the section's second moment of area." })
    else if (f < 3) out.push({ severity: "warning", code: "buckling_margin", message: `Buckling factor ${f.toFixed(2)} leaves little margin once imperfections are considered (use 3 or more).`, suggestion: "Stiffen the member or reduce its free length." })
  }
  if (r.analysis === "modal" && r.modes !== undefined) {
    const first = r.modes.find((m) => !m.rigid)
    if (first !== undefined) out.push({ severity: "info", code: "first_mode", message: `First natural frequency ${first.frequencyHz.toFixed(1)} Hz.`, suggestion: "Keep it at least 1.5 times above any excitation (spindle speed x teeth, motor, line frequency); stiffen or lighten to raise it." })
  }
  for (const w of r.warnings) out.push({ severity: "warning", code: "solver_note", message: w })
  if (r.meshSummary.volumeRatio !== undefined && r.meshSummary.volumeRatio < 0.97 && study.geometry.kind === "solid") {
    out.push({ severity: "warning", code: "staircase_mesh", message: `The mesh holds ${(r.meshSummary.volumeRatio * 100).toFixed(1)} % of the solid: boundaries are stepped.`, suggestion: "Halve mesh.size around the region of interest, or run converge." })
  }
  if (r.analysis === "static" || r.analysis === "thermal_stress") out.push({ severity: "info", code: "convergence_unchecked", message: "Peak stress depends on the mesh.", suggestion: "Run the converge operation before quoting a stress; a peak that keeps rising is a singularity." })
  return out
}

export interface ProbeValue {
  readonly point: readonly [number, number, number]
  readonly node: { readonly index: number; readonly at: readonly [number, number, number]; readonly distance: number }
  readonly displacement?: number
  readonly temperature?: number
  readonly vonMises?: number
  readonly maxPrincipal?: number
  readonly safetyFactor?: number
}

/** The result fields at the mesh node nearest a point (a probe the AI can place without reading whole fields). */
export const probe = (r: StudyResult, point: readonly [number, number, number]): ProbeValue => {
  const m = r.mesh
  let best = 0, bd = Infinity
  for (let n = 0; n < m.nodeCount; n++) {
    const d = Math.hypot(m.nodes[n * 3]! - point[0], m.nodes[n * 3 + 1]! - point[1], m.nodes[n * 3 + 2]! - point[2])
    if (d < bd) { bd = d; best = n }
  }
  const u = r.fields.displacement, s = r.fields.stressMeasures
  return {
    point, node: { index: best, at: [m.nodes[best * 3]!, m.nodes[best * 3 + 1]!, m.nodes[best * 3 + 2]!], distance: bd },
    ...(u !== undefined ? { displacement: Math.hypot(u[best * 3]!, u[best * 3 + 1]!, u[best * 3 + 2]!) } : {}),
    ...(r.fields.temperature !== undefined ? { temperature: r.fields.temperature[best]! } : {}),
    ...(s !== undefined ? { vonMises: s.vonMises[best]!, maxPrincipal: s.maxPrincipal[best]!, safetyFactor: s.safetyFactor[best]! } : {})
  }
}
