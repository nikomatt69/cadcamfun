/**
 * Study runner (spec 48 §2 steps 3-5): validates a `Study`, meshes it, assembles and solves it, recovers stresses and judges
 * them. One path serves static, steady and transient thermal, thermal stress (one-way coupled: the temperature field becomes
 * a thermal-strain load), modal and linear buckling. Every failure is a typed `Refusal`, never a thrown error or a silent NaN.
 */
import {
  type Prepared, bodyForce, conduction, faceConvection, faceFlux, faceInfo, facePoint, geometricStiffness, heatSource, massLike,
  prepare, recoverStress, stiffness, surfaceTraction, thermalLoad, totalArea
} from "./assemble.ts"
import { subspaceIteration } from "./eigen.ts"
import { TRI6 } from "./quadrature.ts"
import { type FailureCriterion, type Material, type SolverMaterial, defaultCriterion, resolveMaterial, toSolverUnits } from "./materials.ts"
import { type TetMesh, meshBox, meshSolid } from "./mesh.ts"
import { regionFaces, regionNodes } from "./regions.ts"
import { extremum, magnitudes, stressFields, type StressFields } from "./results.ts"
import { preconditionerFor } from "./skyline.ts"
import { type Csr, applyDirichlet, combine, matvec, pcg, type Preconditioner } from "./sparse.ts"
import { AXES, type Load, type Refusal, type Study, type Support, type ThermalLoad, type Vec3, refuse } from "./study.ts"

export interface RunHooks {
  readonly shouldStop?: () => boolean
  readonly onProgress?: (stage: string, fraction: number) => void
}

export interface Located { readonly value: number; readonly at: Vec3 }

export interface StudyResult {
  readonly ok: true
  readonly analysis: Study["analysis"]
  readonly material: { readonly id: string; readonly name: string; readonly ductility: Material["ductility"]; readonly yieldMPa: number; readonly ultimateMPa: number }
  readonly criterion: FailureCriterion
  readonly mesh: TetMesh
  readonly meshSummary: { readonly nodes: number; readonly elements: number; readonly dofs: number; readonly cellSize: Vec3; readonly volumeMm3: number; readonly volumeRatio: number | undefined; readonly aspectRatio: number }
  readonly solver: { readonly iterations: number; readonly residual: number; readonly milliseconds: number }
  readonly summary: {
    readonly maxDisplacement?: Located
    readonly maxVonMises?: Located
    readonly maxTresca?: Located
    readonly maxPrincipal?: Located
    readonly minPrincipal?: Located
    readonly minSafetyFactor?: Located
    readonly maxTemperature?: Located
    readonly minTemperature?: Located
    readonly massKg?: number
  }
  readonly fields: {
    readonly displacement?: Float64Array
    readonly temperature?: Float64Array
    readonly stress?: Float64Array
    readonly stressMeasures?: StressFields
  }
  readonly reactions?: ReadonlyArray<{ readonly name: string; readonly force: Vec3 }>
  /** Free-free studies report rigid-body modes with frequency 0. */
  readonly modes?: ReadonlyArray<{ readonly frequencyHz: number; readonly rigid: boolean; readonly shape: Float64Array }>
  /** Factors by which the applied loads (and thermal strain) scale to reach buckling. */
  readonly buckling?: ReadonlyArray<{ readonly factor: number; readonly shape: Float64Array }>
  /** Transient: one entry per solved step; stress entries only at the stress instants. */
  readonly history?: ReadonlyArray<{ readonly time: number; readonly minTemperature: number; readonly maxTemperature: number; readonly maxVonMises?: number; readonly minSafetyFactor?: number }>
  /** Transient thermal stress: the instant the stress fields belong to (the one with the largest peak). */
  readonly stressTime?: number
  readonly warnings: ReadonlyArray<string>
}

export type RunOutcome = StudyResult | Refusal

const loc = (mesh: TetMesh, index: number, value: number): Located => ({ value, at: [mesh.nodes[index * 3]!, mesh.nodes[index * 3 + 1]!, mesh.nodes[index * 3 + 2]!] })
const locate = (mesh: TetMesh, a: Float64Array, which: "max" | "min"): Located => { const e = extremum(a); return which === "max" ? loc(mesh, e.maxAt, e.max) : loc(mesh, e.minAt, e.min) }

class Stop extends Error {}

// ------------------------------------------------------------------------------------------------ constraints

interface Constraints { readonly fixed: Uint8Array; readonly values: Float64Array; readonly groups: ReadonlyArray<{ name: string; nodes: Uint8Array; dofs: ReadonlyArray<number> }> }

const supportConstraints = (mesh: TetMesh, supports: ReadonlyArray<Support>): Constraints | Refusal => {
  const fixed = new Uint8Array(mesh.nodeCount * 3), values = new Float64Array(mesh.nodeCount * 3)
  const groups: Array<{ name: string; nodes: Uint8Array; dofs: number[] }> = []
  for (const [i, s] of supports.entries()) {
    const nodes = regionNodes(mesh, s.region), name = s.name ?? `support ${i + 1}`
    if (nodes.every((v) => v === 0)) return refuse("region_empty", `The region of ${name} selects no node of the mesh. Check the plane value and axis, or raise its tolerance (cell size ${mesh.cell.map((c) => +c.toFixed(3)).join(" x ")} mm).`, { support: name })
    const dofs = (s.dofs ?? AXES).map((a) => AXES.indexOf(a))
    for (let n = 0; n < mesh.nodeCount; n++) if (nodes[n] === 1) for (const d of dofs) { fixed[n * 3 + d] = 1; values[n * 3 + d] = s.value ?? 0 }
    groups.push({ name, nodes, dofs })
  }
  return { fixed, values, groups }
}

/** Three isostatic constraints (3-2-1) so a free part can expand without rigid-body motion. */
const isostatic = (mesh: TetMesh): Constraints => {
  const fixed = new Uint8Array(mesh.nodeCount * 3), values = new Float64Array(mesh.nodeCount * 3)
  const c = [0, 1, 2].map((d) => (mesh.bounds.min[d]! + mesh.bounds.max[d]!) / 2)
  const dist = (n: number, p: ArrayLike<number>) => Math.hypot(mesh.nodes[n * 3]! - p[0]!, mesh.nodes[n * 3 + 1]! - p[1]!, mesh.nodes[n * 3 + 2]! - p[2]!)
  let a = 0
  for (let n = 1; n < mesh.nodeCount; n++) if (dist(n, c) < dist(a, c)) a = n
  const pa = [mesh.nodes[a * 3]!, mesh.nodes[a * 3 + 1]!, mesh.nodes[a * 3 + 2]!]
  let b = a
  for (let n = 0; n < mesh.nodeCount; n++) if (dist(n, pa) > dist(b, pa)) b = n
  const ab = [0, 1, 2].map((d) => mesh.nodes[b * 3 + d]! - pa[d]!)
  const axis = ab.reduce((m, v, i) => Math.abs(v) > Math.abs(ab[m]!) ? i : m, 0)
  const others = [0, 1, 2].filter((d) => d !== axis) as [number, number]
  for (let d = 0; d < 3; d++) fixed[a * 3 + d] = 1
  for (const d of others) fixed[b * 3 + d] = 1
  let cNode = a, best = -1
  for (let n = 0; n < mesh.nodeCount; n++) {
    const r = others.map((d) => mesh.nodes[n * 3 + d]! - pa[d]!) as [number, number], len = Math.hypot(r[0], r[1])
    if (len > best) { best = len; cNode = n }
  }
  const r = others.map((d) => mesh.nodes[cNode * 3 + d]! - pa[d]!) as [number, number]
  // rotation about the axis moves the node perpendicular to its in-plane offset: lock the other in-plane direction
  fixed[cNode * 3 + (Math.abs(r[0]) >= Math.abs(r[1]) ? others[1] : others[0])] = 1
  return { fixed, values, groups: [] }
}

// ------------------------------------------------------------------------------------------------ solving

interface Reduced { readonly a: Csr; readonly pre: Preconditioner; readonly offset: Float64Array; readonly fixed: Uint8Array; readonly values: Float64Array }

const reduce = (k: Csr, fixed: Uint8Array, values: Float64Array): Reduced => {
  const { a, b } = applyDirichlet(k, new Float64Array(k.n), fixed, values)
  return { a, pre: preconditionerFor(a), offset: b, fixed, values }
}

interface SolveStats { iterations: number; residual: number }

const solveReduced = (r: Reduced, rhs: Float64Array, guess: Float64Array | undefined, hooks: RunHooks, what: string): { x: Float64Array; stats: SolveStats } | Refusal => {
  const b = new Float64Array(rhs.length)
  for (let i = 0; i < b.length; i++) b[i] = r.fixed[i] === 1 ? r.values[i]! : rhs[i]! + r.offset[i]!
  const x = guess !== undefined ? Float64Array.from(guess) : new Float64Array(b.length)
  for (let i = 0; i < x.length; i++) if (r.fixed[i] === 1) x[i] = r.values[i]!
  const res = pcg(r.a, b, x, r.pre, { tolerance: 1e-10, maxIterations: 6000, ...(hooks.shouldStop !== undefined ? { shouldStop: hooks.shouldStop } : {}) })
  if (res.stopped) return refuse("cancelled", "The run was cancelled.")
  if (!res.converged) return refuse("no_convergence", `${what}: the iterative solve stopped at relative residual ${res.residual.toExponential(2)} after ${res.iterations} iterations. The system is probably singular (under-constrained: rigid-body motion, or no heat path) or extremely ill-conditioned.`, { residual: res.residual, iterations: res.iterations })
  return { x, stats: { iterations: res.iterations, residual: res.residual } }
}

// ------------------------------------------------------------------------------------------------ loads

const structuralLoads = (p: Prepared, mat: SolverMaterial, loads: ReadonlyArray<Load>): Float64Array | Refusal => {
  const f = new Float64Array(p.mesh.nodeCount * 3)
  for (const [i, load] of loads.entries()) {
    if (load.kind === "gravity") { bodyForce(p, mat.rho, load.acceleration ?? [0, 0, -9810], f); continue }
    const faces = regionFaces(p.mesh, load.region), name = load.name ?? `${load.kind} ${i + 1}`
    if (faces.length === 0) return refuse("region_empty", `The region of ${name} selects no boundary face. A face is selected when all six of its nodes lie in the region (plane tolerance default is tiny: raise it for non-axis-aligned or staircase surfaces).`, { load: name })
    if (load.kind === "force") {
      const area = totalArea(p.mesh, faces), t: Vec3 = [load.force[0] / area, load.force[1] / area, load.force[2] / area]
      surfaceTraction(p.mesh, faces, () => t, f)
    } else if (load.kind === "pressure") {
      surfaceTraction(p.mesh, faces, (_x, n) => [-load.pressure * n[0], -load.pressure * n[1], -load.pressure * n[2]], f)
    } else {
      const len = Math.hypot(...load.axis)
      if (!(len > 0)) return refuse("invalid_study", `The axis of ${name} has zero length.`)
      const a: Vec3 = [load.axis[0] / len, load.axis[1] / len, load.axis[2] / len]
      const arm = (x: Vec3): Vec3 => { const r: Vec3 = [x[0] - load.center[0], x[1] - load.center[1], x[2] - load.center[2]]; return [a[1] * r[2] - a[2] * r[1], a[2] * r[0] - a[0] * r[2], a[0] * r[1] - a[1] * r[0]] }
      let J = 0
      for (const face of faces) { const info = faceInfo(p.mesh, face); for (let g = 0; g < TRI6.weights.length; g++) { const v = arm(facePoint(info, TRI6.points[g]!)); J += info.area * TRI6.weights[g]! * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) } }
      if (!(J > 0)) return refuse("invalid_study", `${name} has no lever arm about its axis (the region lies on the axis).`)
      const s = load.torque / J
      surfaceTraction(p.mesh, faces, (x) => { const v = arm(x); return [s * v[0], s * v[1], s * v[2]] }, f)
    }
  }
  return f
}

interface ThermalSystem { readonly k: Csr; readonly f: Float64Array; readonly fixed: Uint8Array; readonly values: Float64Array; readonly heatPath: boolean }

const thermalSystem = (p: Prepared, mat: SolverMaterial, thermal: ReadonlyArray<ThermalLoad>): ThermalSystem | Refusal => {
  const k = conduction(p, mat.k), f = new Float64Array(p.mesh.nodeCount)
  const fixed = new Uint8Array(p.mesh.nodeCount), values = new Float64Array(p.mesh.nodeCount)
  let heatPath = false
  for (const [i, t] of thermal.entries()) {
    if (t.kind === "heat") { heatSource(p, t.power * 1000 / p.mesh.volume, f); continue }
    const name = t.name ?? `${t.kind} ${i + 1}`
    if (t.kind === "temperature") {
      const nodes = regionNodes(p.mesh, t.region)
      if (nodes.every((v) => v === 0)) return refuse("region_empty", `The region of ${name} selects no node.`, { load: name })
      for (let n = 0; n < nodes.length; n++) if (nodes[n] === 1) { fixed[n] = 1; values[n] = t.value }
      heatPath = true
      continue
    }
    const faces = regionFaces(p.mesh, t.region)
    if (faces.length === 0) return refuse("region_empty", `The region of ${name} selects no boundary face.`, { load: name })
    if (t.kind === "convection") { faceConvection(p.mesh, faces, t.coefficient * 1e-3, t.ambient, k, f); heatPath = true } else faceFlux(p.mesh, faces, t.flux * 1e-3, f)
  }
  return { k, f, fixed, values, heatPath }
}

// ------------------------------------------------------------------------------------------------ runner

const MAX_DOFS = 240_000

export const runStudy = (study: Study, hooks: RunHooks = {}): RunOutcome => {
  const started = performance.now()
  try { return run(study, hooks, started) } catch (cause) {
    if (cause instanceof Stop) return refuse("cancelled", "The run was cancelled.")
    throw cause
  }
}

const check = (hooks: RunHooks): void => { if (hooks.shouldStop?.() === true) throw new Stop() }

const run = (study: Study, hooks: RunHooks, started: number): RunOutcome => {
  const material = resolveMaterial(study.material)
  if (material === undefined) return refuse("unknown_material", `No material "${study.material.id}" in the library.`)
  if (!(study.mesh.size > 0)) return refuse("invalid_study", "mesh.size must be a positive element size in mm.")
  const mat = toSolverUnits(material)
  const criterion = study.criterion ?? defaultCriterion(material)
  const analysis = study.analysis
  const loads = study.loads ?? [], thermal = study.thermal ?? [], supports = study.supports ?? []
  const reference = study.referenceTemperature ?? 20

  const thermalInput = thermal.length > 0 || study.uniformTemperature !== undefined
  if (analysis === "thermal" && thermal.length === 0) return refuse("no_thermal_input", "A thermal study needs thermal conditions: a temperature, convection, flux or heat source.")
  if (analysis === "transient_thermal" && (thermal.length === 0 || study.transient === undefined)) return refuse("no_thermal_input", "A transient thermal study needs thermal conditions and transient: { duration, steps }.")
  if (analysis === "thermal_stress" && !thermalInput) return refuse("no_thermal_input", "A thermal stress study needs thermal conditions (solved first) or a uniformTemperature.")
  if (analysis === "static" && loads.length === 0 && !supports.some((s) => (s.value ?? 0) !== 0)) return refuse("invalid_study", "A static study needs at least one load or a prescribed displacement.")
  if (analysis === "buckling" && loads.length === 0 && !thermalInput) return refuse("invalid_study", "A buckling study needs the loads (or the temperature) whose critical multiple is wanted.")

  hooks.onProgress?.("mesh", 0)
  const meshed = study.geometry.kind === "box"
    ? meshBox(study.geometry.min, study.geometry.max, study.mesh)
    : meshSolid(study.geometry, study.mesh)
  if (!meshed.ok) return refuse(meshed.code === "too_large" ? "too_large" : "mesh_failed", meshed.message)
  const mesh = meshed.mesh
  const dpnStructural = mesh.nodeCount * 3
  const needsStructural = analysis !== "thermal" && analysis !== "transient_thermal"
  if (dpnStructural > MAX_DOFS && needsStructural) return refuse("too_large", `${dpnStructural} unknowns exceed the limit of ${MAX_DOFS}: raise the element size.`)
  check(hooks)
  const p = prepare(mesh)
  const warnings: string[] = []
  if (mesh.quality.volumeRatio !== undefined && study.geometry.kind === "solid" && Math.abs(mesh.quality.volumeRatio - 1) > 0.03) {
    warnings.push(`The staircase mesh holds ${(mesh.quality.volumeRatio * 100).toFixed(1)} % of the solid's volume: curved and slanted surfaces are approximated by grid steps. Refine (smaller mesh.size) before trusting local stresses.`)
  }
  if (mesh.quality.minJacobianRatio < 0.2) warnings.push(`Cell aspect ratio ${mesh.quality.minJacobianRatio.toFixed(2)} (thin part against the element size): refine across the thin direction.`)

  const meshSummary = {
    nodes: mesh.nodeCount, elements: mesh.elementCount, dofs: needsStructural ? dpnStructural : mesh.nodeCount, cellSize: mesh.cell as Vec3, volumeMm3: mesh.volume,
    volumeRatio: mesh.quality.volumeRatio, aspectRatio: mesh.quality.minJacobianRatio
  }
  const finish = (partial: Omit<StudyResult, "ok" | "analysis" | "material" | "criterion" | "mesh" | "meshSummary" | "solver" | "warnings">, stats: SolveStats): StudyResult => ({
    ok: true, analysis, material: { id: material.id, name: material.name, ductility: material.ductility, yieldMPa: material.yieldMPa, ultimateMPa: material.ultimateMPa },
    criterion, mesh, meshSummary, solver: { iterations: stats.iterations, residual: stats.residual, milliseconds: Math.round(performance.now() - started) }, warnings, ...partial,
    summary: { ...partial.summary, massKg: mesh.volume * mat.rho * 1000 }
  })

  // ------------------------------------------------ thermal solve (steady) when the study needs a temperature field
  let temperature: Float64Array | undefined
  let stats: SolveStats = { iterations: 0, residual: 0 }
  const thermalSolve = (): ThermalSystem | Refusal => {
    const sys = thermalSystem(p, mat, thermal)
    return sys
  }

  if (analysis === "thermal" || (analysis === "thermal_stress" && thermal.length > 0)) {
    hooks.onProgress?.("thermal", 0.2)
    const sys = thermalSolve()
    if ("ok" in sys) return sys
    if (!sys.heatPath) return refuse("no_heat_path", "A steady thermal study needs a temperature boundary or a convection boundary: with only heat input the part heats without limit.")
    const solved = solveReduced(reduce(sys.k, sys.fixed, sys.values), sys.f, new Float64Array(mesh.nodeCount).fill(reference), hooks, "Steady thermal solve")
    if ("ok" in solved) return solved
    temperature = solved.x; stats = solved.stats
    const top = extremum(temperature)
    if (material.maxServiceC !== undefined && top.max > material.maxServiceC) warnings.push(`The peak temperature ${top.max.toFixed(0)} °C exceeds the service limit of ${material.name} (${material.maxServiceC} °C).`)
    if (analysis === "thermal") {
      return finish({ summary: { maxTemperature: loc(mesh, top.maxAt, top.max), minTemperature: loc(mesh, top.minAt, top.min) }, fields: { temperature } }, stats)
    }
  } else if (analysis === "thermal_stress") {
    temperature = new Float64Array(mesh.nodeCount).fill(study.uniformTemperature!)
  }

  // ------------------------------------------------ transient thermal
  if (analysis === "transient_thermal") return transient(study, p, mat, material, criterion, reference, hooks, warnings, finish)

  // ------------------------------------------------ structural family
  check(hooks)
  const cons = supports.length > 0 ? supportConstraints(mesh, supports) : analysis === "modal" ? { fixed: new Uint8Array(dpnStructural), values: new Float64Array(dpnStructural), groups: [] } : isostatic(mesh)
  if ("ok" in cons) return cons
  if (supports.length === 0 && analysis !== "thermal_stress" && analysis !== "modal") return refuse("under_constrained", "A structural study needs at least one support: add a fixed region (supports) so the part cannot move as a rigid body.")
  if (supports.length === 0 && analysis === "thermal_stress") warnings.push("No supports: the part is held by three minimal point constraints and expands freely, so the stress shown is the self-equilibrated thermal stress (zero for a uniform temperature). Add real supports to see the constrained case.")
  if (supports.length === 0 && analysis === "modal") warnings.push("No supports: free-free modes. The first six are rigid-body motions (0 Hz).")

  hooks.onProgress?.("assemble", 0.4)
  const K = stiffness(p, mat)
  check(hooks)

  if (analysis === "modal") return modal(study, p, mat, K, cons, hooks, finish, warnings)

  const f = structuralLoads(p, mat, loads)
  if ("ok" in f) return f
  if (temperature !== undefined) thermalLoad(p, mat, temperature, reference, f)
  hooks.onProgress?.("solve", 0.6)
  const red = reduce(K, cons.fixed, cons.values)
  const solved = solveReduced(red, f, undefined, hooks, "Static solve")
  if ("ok" in solved) {
    if (solved.code === "no_convergence" && supports.length > 0) return refuse("under_constrained", `${solved.message} The supports may leave a rigid-body motion free (for example a single plane support, or a hole's axis).`, solved.details)
    return solved
  }
  const u = solved.x
  stats = { iterations: stats.iterations + solved.stats.iterations, residual: solved.stats.residual }

  if (analysis === "buckling") return buckling(study, p, mat, K, red, u, temperature, reference, cons, hooks, finish, warnings)

  hooks.onProgress?.("results", 0.9)
  const stress = recoverStress(p, mat, u, temperature, reference)
  const measures = stressFields(stress, mesh.nodeCount, mat, criterion)
  const reactions = reactionsOf(K, u, f, cons, mesh)
  const disp = magnitudes(u)
  const dmax = extremum(disp)
  const summary: StudyResult["summary"] = {
    maxDisplacement: loc(mesh, dmax.maxAt, dmax.max),
    maxVonMises: locate(mesh, measures.vonMises, "max"), maxTresca: locate(mesh, measures.tresca, "max"),
    maxPrincipal: locate(mesh, measures.maxPrincipal, "max"), minPrincipal: locate(mesh, measures.minPrincipal, "min"),
    minSafetyFactor: locate(mesh, measures.safetyFactor, "min"),
    ...(temperature !== undefined ? { maxTemperature: locate(mesh, temperature, "max"), minTemperature: locate(mesh, temperature, "min") } : {})
  }
  return finish({ summary, fields: { displacement: u, stress, stressMeasures: measures, ...(temperature !== undefined ? { temperature } : {}) }, reactions }, stats)
}

type Finish = (partial: Omit<StudyResult, "ok" | "analysis" | "material" | "criterion" | "mesh" | "meshSummary" | "solver" | "warnings">, stats: SolveStats) => StudyResult

const reactionsOf = (K: Csr, u: Float64Array, f: Float64Array, cons: Constraints, mesh: TetMesh): Array<{ name: string; force: Vec3 }> => {
  const ku = new Float64Array(u.length)
  matvec(K, u, ku)
  const out: Array<{ name: string; force: Vec3 }> = []
  const sum = (mask: Uint8Array | undefined, dofs: ReadonlyArray<number>): Vec3 => {
    const r: [number, number, number] = [0, 0, 0]
    for (let n = 0; n < mesh.nodeCount; n++) for (const d of dofs) if ((mask === undefined || mask[n] === 1) && cons.fixed[n * 3 + d] === 1) r[d]! += ku[n * 3 + d]! - f[n * 3 + d]!
    return r
  }
  for (const g of cons.groups) out.push({ name: g.name, force: sum(g.nodes, g.dofs) })
  if (cons.groups.length === 0) out.push({ name: "isostatic constraints", force: sum(undefined, [0, 1, 2]) })
  return out
}

// ------------------------------------------------------------------------------------------------ modal

const modal = (study: Study, p: Prepared, mat: SolverMaterial, K: Csr, cons: Constraints, hooks: RunHooks, finish: Finish, warnings: string[]): RunOutcome => {
  const M = massLike(p, mat.rho, 3), n = K.n
  const anyFixed = cons.fixed.some((v) => v === 1)
  const free = new Uint8Array(n)
  for (let i = 0; i < n; i++) free[i] = cons.fixed[i] === 1 ? 0 : 1
  // fixed unknowns: identity in K, nothing in M
  let shift = 0
  if (!anyFixed) {
    let sum = 0, cnt = 0
    for (let i = 0; i < n; i += 7) {
      let kd = 0, md = 0
      for (let q = K.rowPtr[i]!; q < K.rowPtr[i + 1]!; q++) if (K.col[q] === i) { kd = K.val[q]!; md = M.val[q]! }
      if (md > 0) { sum += kd / md; cnt++ }
    }
    shift = 1e-7 * (cnt > 0 ? sum / cnt : 1)
  }
  const { a: kr } = applyDirichlet(K, new Float64Array(n), cons.fixed, cons.values)
  const A = shift > 0 ? combine(kr, 1, M, shift) : kr
  const Mf = { n: M.n, rowPtr: M.rowPtr, col: M.col, val: Float64Array.from(M.val) }
  for (let i = 0; i < n; i++) for (let q = Mf.rowPtr[i]!; q < Mf.rowPtr[i + 1]!; q++) if (cons.fixed[i] === 1 || cons.fixed[Mf.col[q]!] === 1) Mf.val[q] = 0
  hooks.onProgress?.("modal", 0.5)
  const count = Math.max(1, Math.min(study.modes ?? 6, 12))
  const rigidVectors: Float64Array[] = []
  if (!anyFixed) {
    const c = [0, 1, 2].map((d) => (p.mesh.bounds.min[d]! + p.mesh.bounds.max[d]!) / 2)
    for (let k = 0; k < 6; k++) {
      const v = new Float64Array(n)
      for (let node = 0; node < p.mesh.nodeCount; node++) {
        const r = [p.mesh.nodes[node * 3]! - c[0]!, p.mesh.nodes[node * 3 + 1]! - c[1]!, p.mesh.nodes[node * 3 + 2]! - c[2]!]
        if (k < 3) v[node * 3 + k] = 1
        else { const a = k - 3, b = (a + 1) % 3, d = (a + 2) % 3; v[node * 3 + b] = -r[d]!; v[node * 3 + d] = r[b]! }
      }
      rigidVectors.push(v)
    }
  }
  const result = subspaceIteration({
    a: A, pre: preconditionerFor(A), applyB: (x, y) => matvec(Mf, x, y), free, count, mode: "smallest", ...(rigidVectors.length > 0 ? { deflate: rigidVectors } : {}),
    ...(hooks.shouldStop !== undefined ? { shouldStop: hooks.shouldStop } : {}),
    onIteration: (i) => hooks.onProgress?.("modal", 0.5 + 0.4 * Math.min(1, i / 30))
  })
  if (result === undefined) return refuse("no_convergence", "The modal eigenproblem could not be reduced (the stiffness or mass matrix is not positive definite on the free unknowns).")
  if (result.stopped) return refuse("cancelled", "The run was cancelled.")
  if (!result.converged) warnings.push("The modal iteration did not reach 1e-9 in 60 iterations: the higher requested modes are approximate.")
  const elastic = result.values.map((theta, i) => {
    const lambda = theta - shift
    const shape = result.vectors[i]!
    const peak = extremum(magnitudes(shape)).max
    const scaled = new Float64Array(shape.length)
    for (let q = 0; q < shape.length; q++) scaled[q] = peak > 0 ? shape[q]! / peak : 0
    return { frequencyHz: Math.sqrt(Math.max(lambda, 0)) / (2 * Math.PI), rigid: false, shape: scaled }
  })
  const rigid = rigidVectors.map((v) => ({ frequencyHz: 0, rigid: true, shape: v }))
  return finish({ summary: {}, fields: {}, modes: [...rigid, ...elastic] }, { iterations: result.iterations, residual: 0 })
}

// ------------------------------------------------------------------------------------------------ buckling

const buckling = (study: Study, p: Prepared, mat: SolverMaterial, K: Csr, red: Reduced, u: Float64Array, temperature: Float64Array | undefined, reference: number, cons: Constraints, hooks: RunHooks, finish: Finish, warnings: string[]): RunOutcome => {
  const Kg = geometricStiffness(p, mat, u, temperature, reference), n = K.n
  const free = new Uint8Array(n)
  for (let i = 0; i < n; i++) free[i] = cons.fixed[i] === 1 ? 0 : 1
  const neg = { n: Kg.n, rowPtr: Kg.rowPtr, col: Kg.col, val: Float64Array.from(Kg.val, (v) => -v) }
  for (let i = 0; i < n; i++) for (let q = neg.rowPtr[i]!; q < neg.rowPtr[i + 1]!; q++) if (cons.fixed[i] === 1 || cons.fixed[neg.col[q]!] === 1) neg.val[q] = 0
  hooks.onProgress?.("buckling", 0.7)
  const count = Math.max(1, Math.min(study.modes ?? 3, 8))
  const result = subspaceIteration({
    a: red.a, pre: red.pre, applyB: (x, y) => matvec(neg, x, y), free, count, mode: "largest-positive",
    ...(hooks.shouldStop !== undefined ? { shouldStop: hooks.shouldStop } : {}),
    onIteration: (i) => hooks.onProgress?.("buckling", 0.7 + 0.25 * Math.min(1, i / 30))
  })
  if (result === undefined) return refuse("no_buckling", "The buckling eigenproblem could not be reduced.")
  if (result.stopped) return refuse("cancelled", "The run was cancelled.")
  const finite = result.values.map((v, i) => ({ v, i })).filter((x) => Number.isFinite(x.v) && x.v > 0)
  if (finite.length === 0) return refuse("no_buckling", "The loads put nothing in compression, so there is no buckling mode: apply a compressive load (or heat a constrained part).")
  if (!result.converged) warnings.push("The buckling iteration did not converge fully in 60 iterations: treat the factors as approximate.")
  warnings.push("Linear (eigenvalue) buckling: factors are upper bounds that ignore imperfections and plasticity; apply knock-down factors before using them.")
  const buck = finite.map(({ v, i }) => {
    const shape = result.vectors[i]!, peak = extremum(magnitudes(shape)).max, scaled = new Float64Array(shape.length)
    for (let q = 0; q < shape.length; q++) scaled[q] = peak > 0 ? shape[q]! / peak : 0
    return { factor: v, shape: scaled }
  })
  return finish({ summary: {}, fields: { displacement: u }, buckling: buck }, { iterations: result.iterations, residual: 0 })
}

// ------------------------------------------------------------------------------------------------ transient

const transient = (
  study: Study, p: Prepared, mat: SolverMaterial, material: Material, criterion: FailureCriterion, reference: number, hooks: RunHooks, warnings: string[], finish: Finish
): RunOutcome => {
  const mesh = p.mesh, spec = study.transient!
  if (!(spec.duration > 0) || !(spec.steps >= 1)) return refuse("invalid_study", "transient needs a positive duration (s) and at least one step.")
  const steps = Math.min(Math.round(spec.steps), 2000), dt = spec.duration / steps
  const sys = thermalSystem(p, mat, study.thermal ?? [])
  if ("ok" in sys) return sys
  const C = massLike(p, mat.rho * mat.cp, 1)
  const A = combine(C, 1 / dt, sys.k, 1)
  const red = reduce(A, sys.fixed, sys.values)
  let T: Float64Array = new Float64Array(mesh.nodeCount).fill(study.initialTemperature ?? reference)
  const history: Array<{ time: number; minTemperature: number; maxTemperature: number; maxVonMises?: number; minSafetyFactor?: number }> = []
  const stressSteps = Math.max(0, Math.min(spec.stressSteps ?? 4, 12))
  const stressAt = new Set<number>()
  for (let i = 1; i <= stressSteps; i++) stressAt.add(Math.max(1, Math.round(steps * i / stressSteps)))
  let structural: { red: Reduced; K: Csr; cons: Constraints } | undefined
  if (stressSteps > 0) {
    const supports = study.supports ?? []
    const cons = supports.length > 0 ? supportConstraints(mesh, supports) : isostatic(mesh)
    if ("ok" in cons) return cons
    const K = stiffness(p, mat)
    structural = { K, red: reduce(K, cons.fixed, cons.values), cons }
    if (supports.length === 0) warnings.push("No supports: thermal stress is the free-expansion (self-equilibrated) stress; add supports to see constrained thermal stress.")
  }
  let best: { time: number; u: Float64Array; T: Float64Array; vm: number } | undefined
  let iterations = 0, residual = 0
  const tmp = new Float64Array(mesh.nodeCount), rhs = new Float64Array(mesh.nodeCount)
  for (let s = 1; s <= steps; s++) {
    check(hooks)
    hooks.onProgress?.("transient", s / steps)
    matvec(C, T, tmp)
    for (let i = 0; i < rhs.length; i++) rhs[i] = tmp[i]! / dt + sys.f[i]!
    const solved = solveReduced(red, rhs, T, hooks, `Transient step ${s}`)
    if ("ok" in solved) return solved
    T = solved.x; iterations += solved.stats.iterations; residual = solved.stats.residual
    const range = extremum(T)
    const entry: { time: number; minTemperature: number; maxTemperature: number; maxVonMises?: number; minSafetyFactor?: number } = { time: s * dt, minTemperature: range.min, maxTemperature: range.max }
    if (structural !== undefined && stressAt.has(s)) {
      const f = new Float64Array(mesh.nodeCount * 3)
      thermalLoad(p, mat, T, reference, f)
      const solvedU = solveReduced(structural.red, f, undefined, hooks, `Thermal stress at t = ${(s * dt).toFixed(3)} s`)
      if ("ok" in solvedU) return solvedU
      const stress = recoverStress(p, mat, solvedU.x, T, reference)
      const m = stressFields(stress, mesh.nodeCount, mat, criterion)
      entry.maxVonMises = extremum(m.vonMises).max
      entry.minSafetyFactor = extremum(m.safetyFactor).min
      if (best === undefined || entry.maxVonMises > best.vm) best = { time: s * dt, u: solvedU.x, T: Float64Array.from(T), vm: entry.maxVonMises }
    }
    history.push(entry)
  }
  const final = extremum(T)
  if (material.maxServiceC !== undefined && final.max > material.maxServiceC) warnings.push(`The final peak temperature ${final.max.toFixed(0)} °C exceeds the service limit of ${material.name} (${material.maxServiceC} °C).`)
  const stats = { iterations, residual }
  if (best === undefined || structural === undefined) {
    return finish({ summary: { maxTemperature: loc(mesh, final.maxAt, final.max), minTemperature: loc(mesh, final.minAt, final.min) }, fields: { temperature: T }, history }, stats)
  }
  const stress = recoverStress(p, mat, best.u, best.T, reference)
  const measures = stressFields(stress, mesh.nodeCount, mat, criterion)
  const dmax = extremum(magnitudes(best.u))
  return finish({
    summary: {
      maxDisplacement: loc(mesh, dmax.maxAt, dmax.max), maxVonMises: locate(mesh, measures.vonMises, "max"), maxTresca: locate(mesh, measures.tresca, "max"), maxPrincipal: locate(mesh, measures.maxPrincipal, "max"),
      minPrincipal: locate(mesh, measures.minPrincipal, "min"), minSafetyFactor: locate(mesh, measures.safetyFactor, "min"),
      maxTemperature: locate(mesh, best.T, "max"), minTemperature: locate(mesh, best.T, "min")
    },
    fields: { temperature: best.T, displacement: best.u, stress, stressMeasures: measures }, history, stressTime: best.time
  }, stats)
}
