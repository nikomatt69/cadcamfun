/**
 * The constraints of a sketch feature as a person (or the assistant) works with them: which ones hold, which are redundant, which
 * cannot hold together, how many degrees of freedom are left and which points can still move; and the edits that keep a sketch
 * solvable (add a constraint, remove one, turn a dimension into a reference). The solving is `sketch-solver.ts`; this maps its
 * answer, which names constraints by `id` or `<type>#<n>`, back to the constraints the feature stores.
 */
import type { Dimension } from "./expr.ts"
import { rebuild, type DimConstraint, type Feature, type History, type RebuildResult } from "./history.ts"
import type { TimelineEdit } from "./history-edit.ts"
import type { SolveStatus } from "./sketch-model.ts"

/** Dimension kinds: the constraints that can be reference (driven) measurements. */
export const DIMENSION_TYPES: ReadonlySet<string> = new Set(["distance", "distanceX", "distanceY", "length", "radius", "diameter", "angle"])

export type ConstraintState = "ok" | "redundant" | "conflict" | "driven"

export interface ConstraintRow {
  /** Position in the feature's own `sketch.constraints`. */
  readonly index: number
  /** The name the solver reports it under (its `id`, or `<type>#<n>`). */
  readonly name: string
  readonly type: string
  readonly state: ConstraintState
  /** Entities it refers to. */
  readonly refs: ReadonlyArray<string>
  /** The dimension it carries, as stored (a number or an expression), and its measured value for a reference dimension. */
  readonly value?: Dimension
  readonly measured?: number
}

export interface SketchReport {
  readonly feature: string
  /** `unsolved` when a dimension or parameter did not evaluate, so the sketch was not even handed to the solver. */
  readonly status: SolveStatus | "unsolved"
  /** Remaining degrees of freedom (0 when fully constrained); -1 when unsolved. */
  readonly dof: number
  readonly message?: string
  readonly rows: ReadonlyArray<ConstraintRow>
  /** Constraints made by the sketch's parametric shapes (rectangle, slot, ...): counted, not editable one by one. */
  readonly generated: number
  /** Points that can still move, with the freedom (1 or 2) each has left. */
  readonly freedom: Readonly<Record<string, number>>
  /** The constraints that cannot all hold (a minimal set when the search finished). */
  readonly conflictSet: ReadonlyArray<string>
}

const REF_KEYS = ["point", "line", "circle", "ellipse", "a", "b"] as const
const refsOf = (c: DimConstraint): ReadonlyArray<string> => {
  const r = c as unknown as Record<string, unknown>
  return REF_KEYS.flatMap((k) => (typeof r[k] === "string" ? [r[k] as string] : []))
}

/** The solver's name for each stored constraint: the counter only advances for constraints without an id. */
export const constraintNames = (constraints: ReadonlyArray<DimConstraint>): ReadonlyArray<string> => {
  let counter = 0
  return constraints.map((c) => c.id ?? `${c.type}#${counter++}`)
}

const sketchOf = (history: History, featureId: string): (Feature & { readonly type: "sketch" }) | undefined => {
  const f = history.features.find((x) => x.id === featureId)
  return f?.type === "sketch" ? f : undefined
}

/**
 * The state of the constraints of sketch `featureId`, from a replay of the features up to and including it (what comes after cannot
 * change the sketch). `undefined` when the feature is not a sketch. A caller that already holds the replay of this very history passes it
 * as `replay` and nothing is rebuilt.
 */
export const sketchReport = (history: History, featureId: string, replay?: RebuildResult): SketchReport | undefined => {
  const feature = sketchOf(history, featureId)
  if (feature === undefined) return undefined
  const at = history.features.findIndex((f) => f.id === featureId)
  const { rollback: _marker, ...rest } = history
  const built = replay ?? rebuild({ ...rest, features: history.features.slice(0, at + 1) })
  const solved = built.sketches[featureId]?.solve
  const own = feature.sketch.constraints
  const names = constraintNames(own)
  if (solved === undefined) {
    const why = built.issues.find((i) => i.feature === featureId && i.severity === "error")?.message ?? "The sketch could not be evaluated"
    return { feature: featureId, status: "unsolved", dof: -1, message: why, rows: own.map((c, index) => ({ index, name: names[index]!, type: c.type, state: c.driven === true ? "driven" : "ok", refs: refsOf(c), ...("value" in c ? { value: c.value as Dimension } : {}) })), generated: 0, freedom: {}, conflictSet: [] }
  }
  const conflicting = new Set([...solved.conflicts, ...(solved.diagnostics?.conflictSet ?? [])])
  const redundant = new Set(solved.diagnostics?.redundant ?? [])
  const driven = new Map((solved.driven ?? []).map((d) => [d.id, d.value] as const))
  const rows = own.map((c, index): ConstraintRow => {
    const name = names[index]!
    const state: ConstraintState = c.driven === true ? "driven" : conflicting.has(name) ? "conflict" : redundant.has(name) ? "redundant" : "ok"
    return { index, name, type: c.type, state, refs: refsOf(c), ...("value" in c ? { value: c.value as Dimension } : {}), ...(driven.has(name) ? { measured: driven.get(name)! } : {}) }
  })
  const generated = Math.max(0, solved.sketch.constraints.length - own.length)
  return {
    feature: featureId, status: solved.status, dof: solved.dof, ...(solved.message === undefined ? {} : { message: solved.message }),
    rows, generated, freedom: solved.diagnostics?.freedom ?? {}, conflictSet: solved.diagnostics?.conflictSet ?? []
  }
}

const replaceConstraints = (history: History, featureId: string, constraints: ReadonlyArray<DimConstraint>): History => ({
  ...history,
  features: history.features.map((f) => (f.id === featureId && f.type === "sketch" ? { ...f, sketch: { ...f.sketch, constraints } } : f))
})

export interface ConstraintEdit extends TimelineEdit { readonly report?: SketchReport }

const judge = (before: History, after: History, featureId: string): ConstraintEdit => {
  const report = sketchReport(after, featureId)
  if (report === undefined) return { history: before, refusal: `no sketch '${featureId}' in the history` }
  if (report.status === "conflicting" || report.status === "failed" || report.status === "unsolved") {
    const culprit = report.conflictSet.length > 0 ? ` (they cannot all hold: ${report.conflictSet.join(", ")})` : ""
    return { history: before, refusal: `${report.message ?? "the sketch cannot be solved"}${report.message?.includes("cannot all hold") ? "" : culprit}` }
  }
  return { history: after, report }
}

/**
 * A constraint added to a sketch. Refused, with the constraints that clash, when the sketch can no longer be solved; kept (and
 * reported as redundant) when it only repeats what the others already say. Entities it names must exist.
 */
export const addSketchConstraint = (history: History, featureId: string, constraint: DimConstraint): ConstraintEdit => {
  const feature = sketchOf(history, featureId)
  if (feature === undefined) return { history, refusal: `no sketch '${featureId}' in the history` }
  if (constraint.driven === true && !DIMENSION_TYPES.has(constraint.type)) return { history, refusal: `a ${constraint.type} constraint is not a dimension, so it cannot be a reference` }
  if (constraint.id !== undefined && constraintNames(feature.sketch.constraints).includes(constraint.id)) return { history, refusal: `the constraint id '${constraint.id}' is already used` }
  const known = new Set([...feature.sketch.entities.map((e) => e.id)])
  // Entities made by shapes are known to the solver but not stored; let it be the judge of those.
  const stored = refsOf(constraint).find((r) => !known.has(r) && !(feature.sketch.shapes ?? []).some((s) => r === s.id || r.startsWith(`${s.id}.`)))
  if (stored !== undefined) return { history, refusal: `'${stored}' is not an entity of sketch '${featureId}'` }
  return judge(history, replaceConstraints(history, featureId, [...feature.sketch.constraints, constraint]), featureId)
}

/** The constraint at `index` removed. (Removing a constraint can only add freedom, so this is never refused for the solver.) */
export const removeSketchConstraint = (history: History, featureId: string, index: number): ConstraintEdit => {
  const feature = sketchOf(history, featureId)
  if (feature === undefined) return { history, refusal: `no sketch '${featureId}' in the history` }
  if (!Number.isInteger(index) || index < 0 || index >= feature.sketch.constraints.length) return { history, refusal: `sketch '${featureId}' has no constraint ${index}` }
  const after = replaceConstraints(history, featureId, feature.sketch.constraints.filter((_, i) => i !== index))
  const report = sketchReport(after, featureId)
  return { history: after, ...(report === undefined ? {} : { report }) }
}

/**
 * A dimension turned into a reference measurement (it then measures and constrains nothing) or back into a driving one. Turning a
 * reference back to driving is refused, naming the clash, when its value contradicts the rest.
 */
export const setConstraintDriven = (history: History, featureId: string, index: number, driven: boolean): ConstraintEdit => {
  const feature = sketchOf(history, featureId)
  if (feature === undefined) return { history, refusal: `no sketch '${featureId}' in the history` }
  const c = feature.sketch.constraints[index]
  if (c === undefined) return { history, refusal: `sketch '${featureId}' has no constraint ${index}` }
  if (!DIMENSION_TYPES.has(c.type)) return { history, refusal: `a ${c.type} constraint is not a dimension, so it cannot be a reference` }
  const { driven: _d, ...plain } = c
  const next = (driven ? { ...plain, driven: true } : plain) as DimConstraint
  return judge(history, replaceConstraints(history, featureId, feature.sketch.constraints.map((x, i) => (i === index ? next : x))), featureId)
}
