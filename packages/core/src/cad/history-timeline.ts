/**
 * The timeline rules of the parametric history (spec 58 §3.1–3.2, §3.5.1): which features are active, and why the others
 * are not. One definition, used by the mesh replay, the exact replay and every reader that interprets features itself (the
 * CAM, drawings, DFM, the assistant): `activeHistory` is the model the person sees.
 *
 *   suppressed      the feature's own flag
 *   suppressed-by   it needs a suppressed feature: a declared reference (the sketch of an extrude, the source of a pattern,
 *                   ...) or a body that feature made (`targets`, `body`, `tools`, ...), transitively
 *   rolled-back     after the rollback marker
 * A feature that acts on "the bodies built so far" without naming them is not suppressed-by anything: it acts on the bodies
 * that remain, exactly as if the suppressed feature had been deleted.
 */
import type { Feature, History } from "./history.ts"

export type TimelineState = { readonly state: "active" | "suppressed" | "rolled-back" } | { readonly state: "suppressed-by"; readonly by: string }

/** The feature that made a body: body ids are the feature id, or `<feature>#<n>` / `<label>:<body>` for copies. */
export const bodyCreator = (bodyId: string): string => bodyId.split(/[#:]/)[0]!

/** Ids of the features `f` names (the inverse of `dependentsOf` in history-edit.ts: the same references, read from the other side). */
export const declaredNeeds = (f: Feature): ReadonlyArray<string> => {
  switch (f.type) {
    case "extrude": case "revolve": case "rib": case "sheet": return [f.sketch]
    case "plane": return f.from.kind !== "points" && f.from.kind !== "face" ? [f.from.base] : []
    case "sketch": return [f.plane]
    case "hole": case "text": return [f.plane]
    case "pattern": case "mirror": return f.feature === undefined ? [] : [f.feature]
    case "shell": return [f.feature]
    case "sweep": return [f.profile, f.path]
    case "loft": return [...f.sections]
    default: return []
  }
}

/** Ids of the bodies `f` names explicitly. */
export const bodyRefs = (f: Feature): ReadonlyArray<string> => {
  const r = f as Feature & { targets?: ReadonlyArray<string>; bodies?: ReadonlyArray<string>; body?: string; target?: string; tools?: ReadonlyArray<string>; to?: { body?: string } }
  const refs = [...(r.targets ?? []), ...(r.bodies ?? []), ...(r.tools ?? [])]
  if (typeof r.body === "string") refs.push(r.body)
  if (typeof r.target === "string") refs.push(r.target)
  if (typeof r.to?.body === "string") refs.push(r.to.body)
  if (f.type === "plane" && f.from.kind === "face" && f.from.body !== undefined) refs.push(f.from.body)
  return refs
}

/** The state of every feature before the replay, and what is wrong with the timeline fields themselves. */
export const timelinePlan = (history: History): { readonly states: Readonly<Record<string, TimelineState>>; readonly problems: ReadonlyArray<string> } => {
  const problems: string[] = []
  let last = history.features.length - 1
  if (history.rollback !== undefined) {
    const at = history.features.findIndex((f) => f.id === history.rollback)
    if (at < 0) problems.push(`the rollback marker names '${history.rollback}', which is not a feature: the whole history is built`)
    else last = at
  }
  const states: Record<string, TimelineState> = {}
  // The suppressed feature at the root of each inactive feature, so `suppressed-by` names the cause, not the next link.
  const root = new Map<string, string>()
  for (const [i, f] of history.features.entries()) {
    if (i > last) { states[f.id] = { state: "rolled-back" }; continue }
    if (f.suppressed === true) { states[f.id] = { state: "suppressed" }; root.set(f.id, f.id); continue }
    const cause = [...declaredNeeds(f), ...bodyRefs(f).map(bodyCreator)].find((id) => root.has(id))
    if (cause !== undefined) { states[f.id] = { state: "suppressed-by", by: root.get(cause)! }; root.set(f.id, root.get(cause)!); continue }
    states[f.id] = { state: "active" }
  }
  const groups = new Set((history.groups ?? []).map((g) => g.id))
  for (const f of history.features) if (f.group !== undefined && !groups.has(f.group)) problems.push(`feature '${f.id}' is in the group '${f.group}', which is not defined`)
  return { states, problems }
}

/** The history the model is built from: only the active features, no rollback marker. */
export const activeHistory = (history: History): History => {
  if (history.rollback === undefined && !history.features.some((f) => f.suppressed === true)) return history
  const { states } = timelinePlan(history)
  const { rollback: _marker, ...rest } = history
  return { ...rest, features: history.features.filter((f) => states[f.id]?.state === "active") }
}

/**
 * The history with `ids` suppressed (or released with `suppressed = false`). Releasing removes the flag rather than writing
 * `false`, so suppressing then releasing gives back the identical history (spec 58 T8; a configuration is parameters plus a set of
 * suppressed ids applied through this function).
 */
export const withSuppressed = (history: History, ids: ReadonlyArray<string>, suppressed = true): History => {
  const unknown = ids.filter((id) => !history.features.some((f) => f.id === id))
  if (unknown.length > 0) throw new RangeError(`no feature ${unknown.map((id) => `'${id}'`).join(", ")} in the history`)
  const chosen = new Set(ids)
  return {
    ...history,
    features: history.features.map((f) => {
      if (!chosen.has(f.id)) return f
      if (suppressed) return f.suppressed === true ? f : { ...f, suppressed: true }
      const { suppressed: _flag, ...rest } = f
      return rest as Feature
    })
  }
}

/** The history rolled back to just after `id` (the last active feature), or rolled forward to the end with `undefined`. */
export const withRollback = (history: History, id: string | undefined): History => {
  if (id === undefined) {
    const { rollback: _marker, ...rest } = history
    return rest
  }
  if (!history.features.some((f) => f.id === id)) throw new RangeError(`no feature '${id}' in the history`)
  return { ...history, rollback: id }
}
