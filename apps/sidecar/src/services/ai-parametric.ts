/** Project adaptation of the existing parametric kernel. Tests never persist a variant. */
import { createHash } from "node:crypto"
import { usesOf, type History } from "@cadcamfun/core"
import { analyzeParametric, decodeHistory, type Diagnosis, KernelJobError, parametricReport, runKernelJob, verificationOf, type ParametricHandlerInput } from "@cadcamfun/ai"

export const historyRevision = (history: unknown): string => createHash("sha256").update(JSON.stringify(history)).digest("hex")

export const inspectParametric = async (history: unknown, signal?: AbortSignal) => {
  const decoded = decodeHistory(history)
  if (!decoded.success) return { ok: false, error: "Stored parametric history is invalid.", problems: decoded.problems.slice(0, 8) }
  const analysis = await analyzeParametric(decoded.data, signal)
  return { ...analysis, history: decoded.data, revision: historyRevision(history), dependencies: Object.keys(decoded.data.parameters).map((name) => ({ name, ...usesOf(decoded.data, name) })) }
}

/** The compact verdict to put beside a stored change (a create, update, edit or timeline step): the rebuild report is kept by the caller. */
export const verificationFor = (history: History, report: ReturnType<typeof parametricReport>) => verificationOf(history, report)

export const changeParameters = async (history: unknown, parameters: Readonly<Record<string, number | string>>, signal?: AbortSignal) => {
  const decoded = decodeHistory(history)
  if (!decoded.success) return { ok: false as const, error: "Stored parametric history is invalid." }
  const unknown = Object.keys(parameters).filter((name) => !Object.hasOwn(decoded.data.parameters, name))
  if (unknown.length > 0) return { ok: false as const, error: `Unknown parameters: ${unknown.join(", ")}. This part's parameters are: ${Object.keys(decoded.data.parameters).join(", ") || "(none)"}. parametric_update changes existing ones; add a new one with parametric_edit set_parameter.` }
  const next = { ...decoded.data, parameters: { ...decoded.data.parameters, ...parameters } }
  const { verification: _verification, diagnosis, ...report } = await analyzeParametric(next, signal)
  return { ok: true as const, history: next, report, ...(diagnosis !== undefined ? { diagnosis } : {}) }
}

export const editTimeline = async (history: unknown, input: Extract<ParametricHandlerInput, { action: "timeline" }>, signal?: AbortSignal) =>
  structuredClone(await runKernelJob("parametric-timeline", { history, input }, { signal }))

/**
 * Each case rebuilds a variant; a case with `checks` is also measured (AI-11 Step 10) in a kernel worker with a deadline, so a
 * heavy part neither blocks this thread nor outlives the turn. A rebuild that succeeds is not an acceptance: the case passes
 * only when every check measures within its limits.
 */
export const testParametric = async (history: unknown, input: Extract<ParametricHandlerInput, { action: "test" }>, signal?: AbortSignal) => {
  const cases = await Promise.all(input.cases.map(async (c) => {
    const changed = await changeParameters(history, c.parameters, signal)
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
