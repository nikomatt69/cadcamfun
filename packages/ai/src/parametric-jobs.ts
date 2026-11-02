/** Pure parametric computation, executed through the existing scoped kernel-job interface. */
import { moveFeatureTo, rebuild, withRollback, withSuppressed, brep, historyToStep, type History } from "@cadcamfun/core"
import { decodeHistory, exactReport, EXACT_ACTION_BUDGET_MS, parametricReport } from "./parametric.ts"
import { diagnose } from "./parametric-verification.ts"
import type { ParametricHandlerInput } from "./actions/parametric.ts"

export const parametricDiagnosis = ({ history, report }: { readonly history: History; readonly report: ReturnType<typeof parametricReport> }) => diagnose(history, report)

/**
 * A timeline edit of a stored part (spec 58): releases, then suppressions, then a move, then the rollback marker, all through core's
 * pure timeline functions. Refused, with nothing stored, when a feature id is unknown, a move crosses a dependency, or the edit makes
 * a feature fail that built before; a model left with fewer bodies (everything suppressed) is a valid configuration, not a failure.
 */
export const parametricTimeline = ({ history, input }: { readonly history: unknown; readonly input: Extract<ParametricHandlerInput, { action: "timeline" }> }) => {
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

/** STEP text returned inline up to this size; larger files are only summarised. */
const STEP_INLINE_LIMIT = 400_000

/**
 * The exact B-rep of each body of a part: exact volume, area, centroid, through-holes, faces and surface kinds, or why a
 * body has only its mesh; optionally the STEP AP214 file of the exact bodies.
 */
export const parametricExact = ({ history, includeStep, name }: { readonly history: History; readonly includeStep?: boolean; readonly name?: string }) => {
  const result = rebuild(history)
  const exact = exactReport(history, result, EXACT_ACTION_BUDGET_MS)
  const out: Record<string, unknown> = { ok: !result.issues.some((i) => i.severity === "error"), bodies: exact.bodies, warnings: [...new Set(exact.warnings)], issues: result.issues.slice(0, 20) }
  if (includeStep === true) {
    const step = brep.withBudget(EXACT_ACTION_BUDGET_MS, () => historyToStep(history, name ?? "part"))
    out["exported"] = step.exported
    out["skipped"] = step.skipped
    out["warnings"] = [...new Set([...exact.warnings, ...step.warnings])]
    if (step.step !== undefined) {
      out["stepBytes"] = step.step.length
      if (step.step.length <= STEP_INLINE_LIMIT) out["step"] = step.step
      else out["stepNote"] = `The STEP file is ${step.step.length} characters; export it from the part instead of inline.`
    }
  }
  return out
}

