/** Project adaptation of the existing parametric kernel. Tests never persist a variant. */
import { createHash } from "node:crypto"
import { moveFeatureTo, rebuild, usesOf, withRollback, withSuppressed, type History } from "@cadcamfun/core"
import {
  compareVariants, decodeHistory, densityOfLibraryRow, densityOfMaterial, designTableView, diagnose, type Diagnosis, KernelJobError, materialOfElement, parametricReport, runKernelJob,
  verificationOf, type ParametricHandlerInput, type VerificationMaterial
} from "@cadcamfun/ai"

export const historyRevision = (history: unknown): string => createHash("sha256").update(JSON.stringify(history)).digest("hex")

/**
 * The material an element carries (`material` or `metadata.material`), resolved to a density: the CAM material library first (grade, EN
 * or AISI number, trade name), then a row of the user's own library by name (`properties.density`). `lookup` is the user's library for
 * a name the first one does not know; a name neither knows comes back as `unknown`, so the verdict says why there is no mass.
 */
export const materialFor = async (element: Readonly<Record<string, unknown>>, lookup?: (name: string) => Promise<VerificationMaterial["density"]>): Promise<VerificationMaterial | undefined> => {
  const name = materialOfElement(element)
  if (name === undefined) return undefined
  const density = densityOfMaterial(name) ?? (lookup === undefined ? undefined : await lookup(name))
  return density !== undefined ? { density } : { unknown: name }
}

/** A library row's density, for `materialFor`. */
export const libraryDensity = (rows: ReadonlyArray<{ readonly name: string; readonly properties: unknown }>, name: string) => {
  const row = rows.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())
  return row === undefined ? undefined : densityOfLibraryRow(row.name, row.properties)
}

export const inspectParametric = (history: unknown, material?: VerificationMaterial) => {
  const decoded = decodeHistory(history)
  if (!decoded.success) return { ok: false, error: "Stored parametric history is invalid.", problems: decoded.problems.slice(0, 8) }
  const report = parametricReport(decoded.data)
  return {
    // The verdict first (what the assistant reads), then the full rebuild report; a failure also says where it started.
    verification: verificationOf(decoded.data, report, material), ...(report.ok ? {} : { diagnosis: diagnose(decoded.data, report) }),
    ...report, history: decoded.data, revision: historyRevision(history), dependencies: Object.keys(decoded.data.parameters).map((name) => ({ name, ...usesOf(decoded.data, name) }))
  }
}

/** The compact verdict to put beside a stored change (a create, update, edit or timeline step): the rebuild report is kept by the caller. */
export const verificationFor = (history: History, report: ReturnType<typeof parametricReport>, material?: VerificationMaterial) => verificationOf(history, report, material)

/**
 * The configurations of a stored part: the design table and, on request, every variant rebuilt and measured with the part's material
 * (so each row has its mass). Reads only: the stored part is not changed, the variants are histories of their own.
 */
export const configurationsOfPart = (history: unknown, compare: boolean, material?: VerificationMaterial) => {
  const decoded = decodeHistory(history)
  if (!decoded.success) return { ok: false as const, error: "Stored parametric history is invalid.", problems: decoded.problems.slice(0, 8) }
  const table = designTableView(decoded.data)
  if (table === undefined) return { ok: true as const, active: null, designTable: null, note: "The part has no configurations: cad_edit parametric_edit add_configuration records the current state as Default and the new variant." }
  return { ok: true as const, active: decoded.data.configuration ?? null, designTable: table, ...(compare ? { variants: compareVariants(decoded.data, material) } : {}) }
}

export const changeParameters = (history: unknown, parameters: Readonly<Record<string, number | string>>) => {
  const decoded = decodeHistory(history)
  if (!decoded.success) return { ok: false as const, error: "Stored parametric history is invalid." }
  const unknown = Object.keys(parameters).filter((name) => !Object.hasOwn(decoded.data.parameters, name))
  if (unknown.length > 0) return { ok: false as const, error: `Unknown parameters: ${unknown.join(", ")}. This part's parameters are: ${Object.keys(decoded.data.parameters).join(", ") || "(none)"}. parametric_update changes existing ones; add a new one with parametric_edit set_parameter.` }
  const next = { ...decoded.data, parameters: { ...decoded.data.parameters, ...parameters } }
  return { ok: true as const, history: next, report: parametricReport(next) }
}

/**
 * A timeline edit of a stored part (spec 58): releases, then suppressions, then a move, then the rollback marker, all through core's
 * pure timeline functions. Refused, with nothing stored, when a feature id is unknown, a move crosses a dependency, or the edit makes
 * a feature fail that built before; a model left with fewer bodies (everything suppressed) is a valid configuration, not a failure.
 */
export const editTimeline = (history: unknown, input: Extract<ParametricHandlerInput, { action: "timeline" }>) => {
  const decoded = decodeHistory(history)
  if (!decoded.success) return { ok: false as const, error: "Stored parametric history is invalid." }
  let next: History = decoded.data
  try {
    if (input.release !== undefined) next = withSuppressed(next, input.release, false)
    if (input.suppress !== undefined) next = withSuppressed(next, input.suppress, true)
    if (input.move !== undefined) {
      const moved = moveFeatureTo(next, input.move.feature, input.move.to)
      if (moved.refusal !== undefined) return { ok: false as const, error: `Not moved: ${moved.refusal}` }
      next = moved.history
    }
    if (input.rollForward === true) next = withRollback(next, undefined)
    if (input.rollback !== undefined) next = withRollback(next, input.rollback)
  } catch (error) {
    if (error instanceof RangeError) return { ok: false as const, error: error.message }
    throw error
  }
  // A history written with the timeline fields says so; one that no longer uses them goes back to the plain form.
  const usesTimeline = next.rollback !== undefined || next.groups !== undefined || next.features.some((f) => f.suppressed === true)
  if (usesTimeline) next = { ...next, version: 2 }
  else { const { version: _version, ...plain } = next; next = plain }
  const key = (i: { feature: string; message: string }) => `${i.feature}\u0000${i.message}`
  const before = new Set(rebuild(decoded.data).issues.filter((i) => i.severity === "error").map(key))
  const report = parametricReport(next)
  const introduced = report.issues.filter((i) => i.severity === "error" && !before.has(key(i)))
  if (introduced.length > 0) return { ok: false as const, error: "The timeline was not changed: it makes features fail that built before.", problems: introduced.map((i) => `${i.feature}: ${i.message}`) }
  return { ok: true as const, history: next, report }
}

/**
 * Each case rebuilds a variant; a case with `checks` is also measured (AI-11 Step 10) in a kernel worker with a deadline, so a
 * heavy part neither blocks this thread nor outlives the turn. A rebuild that succeeds is not an acceptance: the case passes
 * only when every check measures within its limits.
 */
export const testParametric = async (history: unknown, input: Extract<ParametricHandlerInput, { action: "test" }>, signal?: AbortSignal) => {
  const cases = await Promise.all(input.cases.map(async (c) => {
    const changed = changeParameters(history, c.parameters)
    if (!changed.ok) return { name: c.name, passed: false, error: changed.error }
    const report = changed.report
    const acceptance = c.checks === undefined || !report.ok ? undefined
      : await runKernelJob("acceptance", { history: changed.history, checks: c.checks as never }, signal === undefined ? {} : { signal })
        .catch((error: unknown) => ({ error: error instanceof KernelJobError ? `${error.reason}: ${error.message}` : String(error) }))
    const failures = [
      ...(!report.ok ? ["The variant did not rebuild successfully"] : []),
      ...(c.expectedBodies !== undefined && report.bodyCount !== c.expectedBodies ? [`Expected ${c.expectedBodies} bodies; got ${report.bodyCount}`] : []),
      ...(c.minVolumeMm3 !== undefined && (report.volumeMm3 === null || report.volumeMm3 < c.minVolumeMm3) ? ["Volume is below minVolumeMm3"] : []),
      ...(c.maxVolumeMm3 !== undefined && (report.volumeMm3 === null || report.volumeMm3 > c.maxVolumeMm3) ? ["Volume exceeds maxVolumeMm3"] : []),
      ...(acceptance === undefined ? [] : "error" in acceptance ? [`The dimensional checks could not run (${acceptance.error})`]
        : acceptance.checks.filter((check) => check.status !== "pass").map((check) => `${check.name}: ${check.status}${check.measured !== undefined ? ` (measured ${check.measured}, limits ${check.limits?.min}..${check.limits?.max})` : ""}${check.reason !== undefined ? `, ${check.reason}` : ""}`))
    ]
    return { name: c.name, passed: failures.length === 0, failures, ...(acceptance !== undefined ? { acceptance } : {}), ...report }
  }))
  return { ok: cases.every((c) => c.passed), revision: historyRevision(history), mutated: false, cases }
}

/** One sentence a person can act on: what failed first, the usual fix, and what that left behind. */
export const failureMessage = (report: { readonly diagnosis?: Diagnosis; readonly error?: unknown }, lead: string): string => {
  const diagnosis = report.diagnosis
  if (diagnosis === undefined) return typeof report.error === "string" ? report.error : `${lead}: the part does not rebuild into a valid solid.`
  const causes = diagnosis.rootCauses.slice(0, 3).map((c) => `${c.feature}: ${c.message}`)
  const hint = diagnosis.removedLastSolid?.hint ?? diagnosis.rootCauses.find((c) => c.hint !== undefined)?.hint
  return `${lead}. ${causes.length > 0 ? causes.join("; ") + "." : "The build leaves no solid."}${hint !== undefined ? ` ${hint}` : ""}`
}
