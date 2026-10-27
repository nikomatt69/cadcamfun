/** Project adaptation of the existing parametric kernel. Tests never persist a variant. */
import { createHash } from "node:crypto"
import { moveFeatureTo, rebuild, usesOf, withRollback, withSuppressed, type History } from "@cadcamfun/core"
import { decodeHistory, KernelJobError, parametricReport, runKernelJob, type ParametricHandlerInput } from "@cadcamfun/ai"

export const historyRevision = (history: unknown): string => createHash("sha256").update(JSON.stringify(history)).digest("hex")

export const inspectParametric = (history: unknown) => {
  const decoded = decodeHistory(history)
  if (!decoded.success) return { ok: false, error: "Stored parametric history is invalid.", problems: decoded.problems.slice(0, 8) }
  return { ...parametricReport(decoded.data), history: decoded.data, revision: historyRevision(history), dependencies: Object.keys(decoded.data.parameters).map((name) => ({ name, ...usesOf(decoded.data, name) })) }
}

export const changeParameters = (history: unknown, parameters: Readonly<Record<string, number | string>>) => {
  const decoded = decodeHistory(history)
  if (!decoded.success) return { ok: false as const, error: "Stored parametric history is invalid." }
  const unknown = Object.keys(parameters).filter((name) => !Object.hasOwn(decoded.data.parameters, name))
  if (unknown.length > 0) return { ok: false as const, error: `Unknown parameters: ${unknown.join(", ")}. Inspect the part first.` }
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
