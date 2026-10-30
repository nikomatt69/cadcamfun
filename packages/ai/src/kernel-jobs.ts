/**
 * The pure kernel work a job may run (AI-11 Step 10): the same functions inline and in the worker, so the two paths cannot
 * drift. Inputs and outputs are plain data (structured-clone safe); histories are decoded here, at the job's own boundary.
 */
import { acceptPart, type AcceptanceCheck, type AcceptanceReport } from "./acceptance.ts"
import { brep, cad, cam, drawing, exactDigest, exactSummary, rebuild, rebuildExact, type History } from "@cadcamfun/core"
import { decodeHistory, parametricReport, parseHistory } from "./parametric.ts"

// ---------------------------------------------------------------- the exact CAD kernel
// The B-rep kernel's heavy operations (analysis, STEP export, setup planning, a feature edit, assembly interference): the same
// functions the HTTP handlers used to run on the sidecar's main thread, now behind the same queue, worker, deadline, cache and
// history as the CAM kernel. Inputs and outputs are plain data.

export type SceneElements = ReadonlyArray<Record<string, unknown>>

export interface CadAnalyzeInput { readonly elements: SceneElements; readonly options: NonNullable<Parameters<typeof cad.analyzeScene>[1]> }
export interface CadStepInput { readonly elements: SceneElements; readonly ids?: ReadonlyArray<string>; readonly options: { readonly faceted?: boolean; readonly author: string } }
export interface CadSetupsInput { readonly elements: SceneElements; readonly options: NonNullable<Parameters<typeof cad.setupsForScene>[1]> }
export interface CadAssemblyInput { readonly elements: SceneElements; readonly options: NonNullable<Parameters<typeof cad.assemblyReport>[1]> }

/** One feature edit of the exact model; the request's validation has already chosen which. */
export type CadFeatureEdit =
  | { readonly kind: "nurbs"; readonly id: string; readonly face: Parameters<typeof cad.sceneNurbsEdit>[2]; readonly edit: cad.NurbsEdit }
  | { readonly kind: "fillet"; readonly id: string; readonly edge: Parameters<typeof cad.sceneFilletEdit>[2]; readonly radius: number }
  | { readonly kind: "boss"; readonly id: string; readonly boss: Parameters<typeof cad.sceneBossEdit>[2]; readonly diameter: number; readonly taper: number }
  | { readonly kind: "hole"; readonly id: string; readonly hole: Parameters<typeof cad.sceneHoleEdit>[2]; readonly change: Parameters<typeof cad.sceneHoleEdit>[3] }
export interface CadHoleInput { readonly elements: SceneElements; readonly edit: CadFeatureEdit }

/** What a feature-edit request (the HTTP route and the assistant's tool take the same fields) asks for, once it has been validated. */
export type CadFeatureRequest = Parameters<typeof cad.nurbsEditOf>[0] & {
  readonly id: string
  readonly nurbs?: Parameters<typeof cad.sceneNurbsEdit>[2]
  readonly fillet?: Parameters<typeof cad.sceneFilletEdit>[2]
  readonly boss?: Parameters<typeof cad.sceneBossEdit>[2]
  readonly hole?: Parameters<typeof cad.sceneHoleEdit>[2]
  readonly radius?: number
  readonly diameter?: number
  readonly taper?: number
}

/** The edit a request means, or why a free-form face edit is not one. The HTTP route and the assistant build it the same way. */
export const featureEditOf = (r: CadFeatureRequest): CadFeatureEdit | string => {
  if (r.nurbs !== undefined) {
    const edit = cad.nurbsEditOf(r)
    return typeof edit === "string" ? edit : { kind: "nurbs", id: r.id, face: r.nurbs, edit }
  }
  if (r.fillet !== undefined) return { kind: "fillet", id: r.id, edge: r.fillet, radius: r.radius! }
  if (r.boss !== undefined) return { kind: "boss", id: r.id, boss: r.boss, diameter: r.diameter!, taper: r.taper ?? 0 }
  return { kind: "hole", id: r.id, hole: r.hole!, change: r.diameter !== undefined ? { kind: "resize", diameter: r.diameter, ...(r.taper !== undefined ? { taper: r.taper } : {}) } : { kind: "fill" } }
}

export const cadAnalyze = ({ elements, options }: CadAnalyzeInput) => cad.analyzeScene(elements, options)

export const cadStep = ({ elements, ids, options }: CadStepInput) => {
  const selected = cad.selectElements(elements, ids)
  const out = cad.sceneToStep(selected, { ...(options.faceted !== undefined ? { faceted: options.faceted } : {}), author: options.author })
  return { ...(out.step !== undefined ? { step: out.step } : {}), parts: out.parts.map((p) => ({ id: p.id, name: p.name, exact: p.exact, faces: p.faces, valid: p.valid, ...(p.note !== undefined ? { note: p.note } : {}) })), skipped: out.skipped }
}

export const cadSetups = ({ elements, options }: CadSetupsInput) => cad.setupsForScene(elements, options)

export const cadAssembly = ({ elements, options }: CadAssemblyInput) => cad.assemblyReport(elements, options)

export const cadHole = ({ elements, edit }: CadHoleInput) => {
  switch (edit.kind) {
    case "nurbs": return cad.sceneNurbsEdit(elements, edit.id, edit.face, edit.edit)
    case "fillet": return cad.sceneFilletEdit(elements, edit.id, edit.edge, edit.radius)
    case "boss": return cad.sceneBossEdit(elements, edit.id, edit.boss, edit.diameter, edit.taper)
    case "hole": return cad.sceneHoleEdit(elements, edit.id, edit.hole, edit.change)
  }
}

export interface CadRebuildInput { readonly history: unknown; readonly budgetMs?: number }

/**
 * A history rebuilt from its features alone (spec 72 step 1.3): the mesh rebuild's issues and parameters plus the exact model of each
 * body, and the digest a client holding its own kernel compares with. The same `rebuild` + `rebuildExact` the desktop runs locally.
 */
export const cadRebuild = ({ history, budgetMs }: CadRebuildInput) => {
  const decoded = parseHistory(history)
  const result = rebuild(decoded)
  let warnings: ReadonlyArray<string> = []
  const summary = brep.withBudget(budgetMs ?? 60_000, () => {
    const exact = rebuildExact(decoded, result)
    warnings = exact.warnings
    return exactSummary(exact)
  })
  return {
    ok: result.bodies.length > 0 && !result.issues.some((i) => i.severity === "error"),
    parameters: result.parameters,
    bodies: summary, digest: exactDigest(summary),
    issues: result.issues.map((i) => ({ feature: i.feature, severity: i.severity, message: i.message, ...(i.remedy !== undefined ? { remedy: i.remedy } : {}) })),
    warnings
  }
}

export interface CadImportStepInput {
  readonly step: string
  /** The history to add the bodies to, already decoded against `ParametricHistory` by the caller. */
  readonly history?: unknown
  readonly idPrefix?: string
  readonly tolerance?: number
  readonly keepAccepted?: boolean
}

/**
 * A STEP file as base bodies of a history (spec 72 step 2.2): `importStepToHistory` reads, validates, heals and refuses; the bodies go
 * into the history in their stored JSON form; and what comes back is decoded against `ParametricHistory` once more, so a history this
 * returns is one every other layer accepts. All or nothing unless `keepAccepted`: a refused body is never dropped silently.
 */
export const cadImportStep = ({ step, history, idPrefix, tolerance, keepAccepted }: CadImportStepInput) => {
  const base: History | undefined = history === undefined ? undefined : parseHistory(history)
  let imported: ReturnType<typeof cad.importStepToHistory>
  try {
    imported = cad.importStepToHistory(step, { ...(idPrefix !== undefined ? { idPrefix } : {}), ...(tolerance !== undefined ? { heal: { tol: tolerance } } : {}) })
  } catch (error) {
    // A file that is not STEP at all (no DATA section, a broken entity table) is the caller's mistake, not a worker fault.
    return { ok: false, bodies: [], bases: [], problems: [`The file could not be read as STEP: ${error instanceof Error ? error.message : String(error)}`], warnings: [] as string[] } as const
  }
  const problems: string[] = []
  const accepted = imported.refused.length === 0 || keepAccepted === true ? imported.bases : []
  let ok = accepted.length > 0
  let next: History | undefined
  if (ok && base !== undefined) {
    const joined = cad.historyToJson(cad.withImported(base, accepted))
    const stored = cad.basesStorageProblem(joined)
    const decoded = stored !== undefined ? undefined : decodeHistory(joined)
    if (stored !== undefined) problems.push(stored)
    else if (decoded !== undefined && !decoded.success) problems.push(...decoded.problems.slice(0, 8))
    else next = joined
    ok = next !== undefined
  }
  if (imported.refused.length > 0 && keepAccepted !== true) problems.push(`${imported.refused.length} of ${imported.report.length} bodies were refused; nothing was added (send keepAccepted to add the accepted ones)`)
  // The ids the history gave the accepted bodies, in order (an id is made unique against the history it joins).
  const added = next === undefined || base === undefined ? accepted : (next.bases ?? []).slice((base.bases ?? []).length)
  let at = 0
  const bodies = imported.report.map((r) => {
    const placed = r.status === "refused" || !ok ? undefined : added[at]
    if (r.status !== "refused") at++
    return {
      ...(placed !== undefined ? { id: placed.id } : {}), name: r.name, status: r.status, faces: r.faces, ...(r.volume !== undefined ? { volume: r.volume } : {}),
      maxTolerance: r.maxTolerance, limit: r.limit, loose: r.loose, diagnostics: [...r.diagnostics], ...(r.healed !== undefined ? { healed: { ...r.healed } } : {})
    }
  })
  return {
    ok, bodies, bases: ok ? cad.historyToJson({ parameters: {}, features: [], bases: added }).bases! : [],
    ...(ok && next !== undefined ? { history: next } : {}), problems, warnings: [...imported.warnings]
  }
}

/** Preparation stays in the worker too; optional stock placement never requires a second mesh build on the caller. */
type ManufacturingInput = cam.kernel.ManufacturingJob & cam.kernel.PrepareOptions

export interface KernelJobs {
  readonly acceptance: { readonly input: { readonly history: unknown; readonly checks: ReadonlyArray<AcceptanceCheck>; readonly budgetMs?: number }; readonly output: AcceptanceReport }
  readonly "parametric-report": { readonly input: { readonly history: unknown }; readonly output: ReturnType<typeof parametricReport> }
  /** The CAM kernel on a whole job (spec 29): NC plus evidence; progress is reported before each operation and stage. */
  readonly "cam-manufacture": { readonly input: ManufacturingInput; readonly output: ReturnType<typeof cam.kernel.runJob> }
  readonly "cam-plan": { readonly input: ManufacturingInput; readonly output: ReturnType<typeof cam.kernel.planOnly> }
  /** The toolpath generator on one request (the panel's Generate button): G-code plus evidence; progress is reported before each step. */
  readonly "cam-generate": { readonly input: cam.generator.GenerateRequest; readonly output: cam.generator.GenerateOutcome }
  /** G-code text to statistics and IR (the Parse button and pasted programs): a program of any size is read off the sidecar's main thread. */
  readonly "cam-parse": { readonly input: { readonly gcode: string; readonly name: string }; readonly output: ReturnType<typeof cam.generator.analyseGcode> }
  /** The stock simulation of a toolpath (the Verify button): minutes of work on a large program, so it runs in a worker too. */
  /** The exact CAD kernel (B-rep) on a scene: analysis, STEP export, setup planning, a feature edit, assembly interference. */
  readonly "cad-analyze": { readonly input: CadAnalyzeInput; readonly output: ReturnType<typeof cadAnalyze> }
  readonly "cad-step": { readonly input: CadStepInput; readonly output: ReturnType<typeof cadStep> }
  readonly "cad-setups": { readonly input: CadSetupsInput; readonly output: ReturnType<typeof cadSetups> }
  readonly "cad-hole": { readonly input: CadHoleInput; readonly output: ReturnType<typeof cadHole> }
  readonly "cad-assembly": { readonly input: CadAssemblyInput; readonly output: ReturnType<typeof cadAssembly> }
  readonly "cad-rebuild": { readonly input: CadRebuildInput; readonly output: ReturnType<typeof cadRebuild> }
  /** A STEP file as base bodies of a history (spec 72 step 2.2). Not cached: the input is the file. */
  readonly "cad-import-step": { readonly input: CadImportStepInput; readonly output: ReturnType<typeof cadImportStep> }
  /** A drawing sheet of a parametric part: the views, dimensions, section and the title block, as SVG and as entities. */
  readonly "cad-sheet": { readonly input: { readonly history: History; readonly options: drawing.SheetOptions }; readonly output: ReturnType<typeof drawing.generateSheet> }
  readonly "cam-verify": { readonly input: Parameters<typeof cam.verify.verifyToolpath>[0]; readonly output: ReturnType<typeof cam.verify.verifyToolpath> }
}

/** Progress a job may report while it runs (only the CAM jobs do): a kernel stage or a generator step. */
/** A job that has to wait for one of the workers says so, with the number of jobs ahead of it. */
export interface QueuedProgress { readonly stage: "queued"; readonly ahead: number }

export type KernelJobProgress = cam.kernel.KernelProgress | cam.generator.GenerateProgress | QueuedProgress

export type KernelJobName = keyof KernelJobs

export const KERNEL_JOBS: { readonly [K in KernelJobName]: (input: KernelJobs[K]["input"], report?: (progress: KernelJobProgress) => void) => KernelJobs[K]["output"] } = {
  acceptance: (input) => acceptPart(parseHistory(input.history), input.checks, input.budgetMs === undefined ? {} : { budgetMs: input.budgetMs }),
  "parametric-report": (input) => parametricReport(parseHistory(input.history)),
  "cam-manufacture": ({ stockFromPartBottom, ...job }, report) => cam.kernel.runJob(job, { ...(stockFromPartBottom !== undefined ? { stockFromPartBottom } : {}), ...(report === undefined ? {} : { onProgress: report }) }),
  "cam-plan": ({ stockFromPartBottom, ...job }) => cam.kernel.planOnly(job, stockFromPartBottom === undefined ? {} : { stockFromPartBottom }),
  "cam-generate": (request, report) => cam.generator.generateToolpath(cam.generator.decodeGenerateRequest(request), report === undefined ? {} : { onProgress: report }),
  "cam-parse": ({ gcode, name }) => cam.generator.analyseGcode(gcode, name),
  "cam-verify": (request) => cam.verify.verifyToolpath(request),
  "cad-analyze": cadAnalyze,
  "cad-step": cadStep,
  "cad-setups": cadSetups,
  "cad-hole": cadHole,
  "cad-assembly": cadAssembly,
  "cad-rebuild": cadRebuild,
  "cad-import-step": cadImportStep,
  "cad-sheet": ({ history, options }) => drawing.generateSheet(history, options)
}
