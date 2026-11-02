/** Pure exact naming report, shared by the scoped kernel worker and equivalence fixtures. */
import type { CadKernelInput } from "@cadcamfun/api"
import { brep, entityRefs, rebuildExact, resolveAfterEdit, resolveInHistory, namingReport, type ExactRebuild, type History } from "@cadcamfun/core"
import { EXACT_ACTION_BUDGET_MS } from "../parametric.ts"

type Counters = ReturnType<typeof brep.booleanCounters>

const delta = (after: Counters, before: Counters): Record<string, unknown> => ({
  calls: after.calls - before.calls,
  exact: after.exact - before.exact,
  recoveredByDisplacement: after.recoveredByDisplacement - before.recoveredByDisplacement,
  strictFailure: after.strictFailure - before.strictFailure,
  failed: after.failed - before.failed,
  emptyResult: after.emptyResult - before.emptyResult,
  poleContact: after.poleContact - before.poleContact,
  byStage: { prepare: after.byStage.prepare - before.byStage.prepare, arrange: after.byStage.arrange - before.byStage.arrange, validate: after.byStage.validate - before.byStage.validate }
})

const build = (history: History): { readonly exact: ExactRebuild; readonly counters: Record<string, unknown> } => {
  const before = brep.booleanCounters()
  const exact = brep.withBudget(EXACT_ACTION_BUDGET_MS, () => rebuildExact(history))
  return { exact, counters: delta(brep.booleanCounters(), before) }
}

const round = (x: number) => Math.round(x * 1e4) / 1e4

export const cadKernelReport = ({ input, history }: { readonly input: CadKernelInput; readonly history: History }) => {
  const { op } = input
  let built: ReturnType<typeof build>
  try { built = build(history) } catch (cause) {
    return { ok: false, op, error: `The exact model could not be built: ${cause instanceof Error ? cause.message : String(cause)}` }
  }
  const { exact, counters } = built
  const warnings = [...new Set(exact.warnings)]
  const lacking = exact.bodies.filter((b) => b.brep === undefined).map((b) => ({ id: b.id, reason: b.reason ?? "no exact model" }))
  if (op === "health") {
    const displaced = Number(counters["recoveredByDisplacement"])
    return {
      ok: exact.bodies.some((b) => b.brep !== undefined) && Number(counters["failed"]) === 0,
      op,
      bodies: [...namingReport(exact).map((r) => ({ id: r.body, ...r.health, ordinalKeysList: r.ordinalKeys.slice(0, 20), refs: r.refs })), ...lacking.map((l) => ({ id: l.id, exact: false, reason: l.reason }))],
      booleans: { ...counters, note: displaced > 0 ? `${displaced} Boolean(s) of this build displaced an operand to break a degenerate contact: the result is approximate there (see warnings).` : "Every Boolean of this build was solved by the plain pipeline." },
      warnings
    }
  }
  const kinds = input.kinds ?? ["face", "edge", "vertex"]
  if (op === "refs") {
    const bodies = input.body === undefined ? exact.bodies.filter((b) => b.brep !== undefined).map((b) => b.id) : [input.body]
    const limit = input.limit ?? 200
    const all = bodies.flatMap((body) => entityRefs(exact, body, kinds).map((r) => ({ ref: brep.refToString(r), body, kind: r.kind, key: r.key, ...(r.siblings !== undefined ? { ordinal: true, siblings: r.siblings } : {}), ...(r.hint !== undefined ? { at: { x: round(r.hint.x), y: round(r.hint.y), z: round(r.hint.z) } } : {}) })))
    if (all.length === 0) return { ok: false, op, error: input.body !== undefined ? `Body '${input.body}' has no exact model or no named entities.` : "No body has an exact model with named entities.", bodies: lacking }
    return { ok: true, op, refs: all.slice(0, limit), truncated: all.length > limit, warnings }
  }
  // resolve
  if (input.refs === undefined) return { ok: false, op, error: "resolve needs refs (strings from a refs call)." }
  const edited: History | undefined = input.after !== undefined ? (input.after as History) : input.parameters !== undefined ? { ...history, parameters: { ...history.parameters, ...input.parameters } } : undefined
  let target = exact
  if (edited !== undefined) {
    try { target = build(edited).exact } catch (cause) { return { ok: false, op, error: `The edited model could not be built: ${cause instanceof Error ? cause.message : String(cause)}` } }
  }
  const results = input.refs.map((text) => {
    const ref = brep.parseRef(text)
    if (ref === undefined) return { ref: text, outcome: "invalid", error: "Not a reference (kind:body|key)." }
    const resolution = edited !== undefined
      ? resolveAfterEdit(target, ref)
      : resolveInHistory(target, ref, input.madeAfter !== undefined ? { madeAfter: input.madeAfter } : {})
    return { ref: text, ...resolution }
  })
  return { ok: true, op, results, warnings }
}
