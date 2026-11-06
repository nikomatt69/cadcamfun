/**
 * Structural edits of a stored parametric part (`cad_edit.parametric_edit`): add or change a parameter, bind any dimension of any
 * feature to a parameter or an expression, replace, insert, remove, rename and group features. Every edit is one of core's pure history
 * editors (`history-edit.ts`); this module only orders them, refuses with a reason the model can act on, and proves the result by a
 * rebuild. Nothing here models geometry.
 *
 * The whole list is atomic: one refused edit, a history the schema refuses, or an error the edits introduce leaves the part as it was.
 */
import type { ParametricEdit } from "@cadcamfun/api"
import {
  activateConfiguration, addConfiguration, addSketchConstraint, dimensionsOf, groupFeatures, insertFeature, removeConfiguration, removeFeature, removeParameter,
  removeSketchConstraint, renameConfiguration, renameFeature, renameParameter, setConfigurationSuppressed, setConfigurationValue, setConstraintDriven,
  setDimension, setParameter, sketchReport, ungroupFeatures, dependentsOf, type DimConstraint, type Feature, type History, type SketchReport
} from "@cadcamfun/core"
import { decodeHistory, parametricReport } from "./parametric.ts"

export type EditOutcome =
  | {
    readonly ok: true; readonly history: History; readonly report: ReturnType<typeof parametricReport>; readonly applied: ReadonlyArray<string>; readonly removed: ReadonlyArray<string>
    /** The sketches whose constraints an edit changed, as the solver reports them (state of every constraint, degrees of freedom left). */
    readonly sketches: ReadonlyArray<SketchReport>
  }
  | { readonly ok: false; readonly error: string; readonly problems?: ReadonlyArray<string> }

/** One sketch's constraints for the model: the constraint rows (index, name, state, value), the degrees of freedom left and who clashes. */
export const sketchDetail = (history: History, featureId: string): SketchReport | undefined => {
  const report = sketchReport(history, featureId)
  if (report === undefined) return undefined
  // A big sketch would list every point that can move: the first dozen say which part is loose.
  const freedom = Object.fromEntries(Object.entries(report.freedom).slice(0, 12))
  return { ...report, freedom }
}

const fail = (error: string, problems?: ReadonlyArray<string>): EditOutcome => ({ ok: false, error, ...(problems !== undefined ? { problems } : {}) })

/** The most dimensions `outline` lists when no feature is asked for; the rest of the features only say how many they have. */
export const OUTLINE_DIMENSION_CAP = 300

/**
 * Every feature with the dimensions `set_dimension` can reach (path, label, value), so the model binds a literal to a parameter by
 * reading, not by guessing. `only` lists one feature in full; otherwise the list stops at `OUTLINE_DIMENSION_CAP` dimensions.
 */
export const outlineHistory = (history: History, only?: string) => {
  let budget = OUTLINE_DIMENSION_CAP
  const features = history.features.filter((f) => only === undefined || f.id === only).map((f) => {
    const dimensions = dimensionsOf(f)
    const head = { id: f.id, type: f.type, ...(f.name !== undefined ? { name: f.name } : {}), ...(f.group !== undefined ? { group: f.group } : {}), ...(f.suppressed === true ? { suppressed: true } : {}) }
    if (only === undefined && dimensions.length > budget) return { ...head, dimensionCount: dimensions.length, truncated: true as const }
    if (only === undefined) budget -= dimensions.length
    return { ...head, dimensions }
  })
  return features
}

/** The error messages of a report, keyed so the errors a candidate adds can be told from those the part already had. */
const errorKeys = (report: ReturnType<typeof parametricReport>): Map<string, string> =>
  new Map(report.issues.filter((i) => i.severity === "error").map((i) => [`${i.feature}\u0000${i.message}`, `${i.feature}: ${i.message}`]))

const describeValue = (value: unknown): string => typeof value === "string" ? `"${value}"` : String(value)
const describeValues = (values: Readonly<Record<string, number | string>>): string => Object.entries(values).map(([name, v]) => `${name} = ${describeValue(v)}`).join(", ")
const suppressNote = (edit: { readonly suppress?: ReadonlyArray<string>; readonly release?: ReadonlyArray<string> }): string =>
  `${edit.suppress !== undefined ? `; leaves out ${edit.suppress.join(", ")}` : ""}${edit.release !== undefined ? `; builds ${edit.release.join(", ")}` : ""}`

const unknownConfiguration = (history: History, id: string): string => {
  const list = history.configurations ?? []
  return `there is no configuration '${id}'. ${list.length === 0 ? "The part has none: add_configuration creates the first (and keeps the current state as Default)." : `Configurations: ${list.map((c) => `${c.id} ("${c.name}")`).join(", ")}.`}`
}
/** A refusal about an unknown parameter, with the names that exist. */
const withParameters = (refusal: string, history: History): string =>
  refusal.startsWith("no parameter") ? `${refusal}. Parameters: ${Object.keys(history.parameters).join(", ") || "(none)"}; add one with set_parameter first` : refusal

/**
 * The values and suppressed features of configuration `id`, set one by one through core's editors (each checks its own refusal: an
 * unknown parameter, a value that does not evaluate, an unknown feature). A history, or the text of the first refusal.
 */
const configurationContent = (history: History, id: string, edit: { readonly values?: Readonly<Record<string, number | string>>; readonly suppress?: ReadonlyArray<string>; readonly release?: ReadonlyArray<string> }): History | string => {
  let next = history
  for (const [name, value] of Object.entries(edit.values ?? {})) {
    const set = setConfigurationValue(next, id, name, value)
    if (set.refusal !== undefined) return `${withParameters(set.refusal, next)}.`
    next = set.history
  }
  for (const [ids, on] of [[edit.suppress, true], [edit.release, false]] as const) {
    if (ids === undefined) continue
    const set = setConfigurationSuppressed(next, id, ids, on)
    if (set.refusal !== undefined) return `${set.refusal}. Features: ${next.features.map((f) => f.id).join(", ")}.`
    next = set.history
  }
  return next
}

const describeFreedom = (report: SketchReport): string =>
  report.status === "fully-constrained" ? "fully constrained" : `${report.status}${report.dof >= 0 ? `, ${report.dof} degree(s) of freedom left` : ""}`
/** The sketches of the history, for a refusal that named one that is not there. */
const sketchHint = (history: History, feature: string): string => {
  const sketches = history.features.filter((f) => f.type === "sketch").map((f) => f.id)
  return sketches.includes(feature) ? "" : ` Sketch features: ${sketches.join(", ") || "(none)"}.`
}

/** The edits applied to a stored history; the result is the new history, its rebuild report and one line per edit. */
export const editHistory = (stored: unknown, edits: ReadonlyArray<ParametricEdit>): EditOutcome => {
  const decoded = decodeHistory(stored)
  if (!decoded.success) return fail("Stored parametric history is invalid.", decoded.problems.slice(0, 8))
  const before = decoded.data
  let next: History = before
  const applied: string[] = []
  const removed: string[] = []
  const touched = new Set<string>()
  for (const [index, edit] of edits.entries()) {
    const at = `edits[${index}] ${edit.op}`
    try {
      switch (edit.op) {
        case "set_parameter": {
          const existing = next.parameters[edit.name]
          next = setParameter(next, edit.name, edit.value)
          applied.push(existing === undefined ? `parameter ${edit.name} added = ${describeValue(edit.value)}` : `parameter ${edit.name}: ${describeValue(existing)} -> ${describeValue(edit.value)}`)
          break
        }
        case "rename_parameter":
          next = renameParameter(next, edit.from, edit.to)
          applied.push(`parameter ${edit.from} renamed ${edit.to} (formulas and dimensions follow)`)
          break
        case "remove_parameter":
          if (!(edit.name in next.parameters)) return fail(`${at}: there is no parameter '${edit.name}'. Parameters: ${Object.keys(next.parameters).join(", ") || "(none)"}.`)
          next = removeParameter(next, edit.name)
          applied.push(`parameter ${edit.name} removed`)
          break
        case "set_dimension": {
          const feature = next.features.find((f) => f.id === edit.feature)
          if (feature === undefined) return fail(`${at}: there is no feature '${edit.feature}'. Features: ${next.features.map((f) => f.id).join(", ")}.`)
          const known = dimensionsOf(feature)
          const current = known.find((d) => d.path === edit.path)
          if (current === undefined) return fail(`${at}: feature '${edit.feature}' (${feature.type}) has no dimension '${edit.path}'. Its dimensions: ${known.map((d) => d.path).join(", ") || "(none)"}. Use replace_feature for a field that is not a dimension.`)
          next = setDimension(next, edit.feature, edit.path, edit.value)
          applied.push(`${edit.feature}.${edit.path}: ${describeValue(current.value)} -> ${describeValue(edit.value)}`)
          break
        }
        case "replace_feature": {
          const old = next.features.find((f) => f.id === edit.feature.id)
          if (old === undefined) return fail(`${at}: there is no feature '${edit.feature.id}' to replace. Use insert_feature for a new one.`)
          if (old.type !== edit.feature.type) return fail(`${at}: '${old.id}' is a ${old.type}; a ${edit.feature.type} cannot replace it. Remove it and insert the new feature instead.`)
          const carried = { ...(old.suppressed !== undefined ? { suppressed: old.suppressed } : {}), ...(old.name !== undefined ? { name: old.name } : {}), ...(old.group !== undefined ? { group: old.group } : {}) }
          const replacement = { ...carried, ...edit.feature } as Feature
          next = { ...next, features: next.features.map((f) => (f.id === old.id ? replacement : f)) }
          applied.push(`feature ${old.id} (${old.type}) replaced`)
          break
        }
        case "insert_feature": {
          const feature = edit.feature as Feature
          const last = next.features[next.features.length - 1]
          if (edit.after !== undefined && edit.atStart === true) return fail(`${at}: send after or atStart, not both.`)
          const after = edit.atStart === true ? undefined : edit.after ?? last?.id
          const inserted = insertFeature(next, feature, after)
          if (inserted.refusal !== undefined) return fail(`${at}: ${inserted.refusal}.`)
          next = inserted.history
          applied.push(`feature ${feature.id} (${feature.type}) inserted ${after === undefined ? "at the top" : `after ${after}`}`)
          break
        }
        case "remove_feature": {
          if (!next.features.some((f) => f.id === edit.id)) return fail(`${at}: there is no feature '${edit.id}'. Features: ${next.features.map((f) => f.id).join(", ")}.`)
          const dependents = dependentsOf(next, edit.id)
          const after = removeFeature(next, edit.id)
          const gone = next.features.filter((f) => !after.features.some((k) => k.id === f.id)).map((f) => f.id)
          if (gone.length > 1 && edit.cascade !== true) {
            return fail(`${at}: '${edit.id}' is needed by ${dependents.join(", ")}; removing it also removes ${gone.filter((g) => g !== edit.id).join(", ")}. Send cascade:true to remove them all, or remove the dependents first.`)
          }
          next = after
          removed.push(...gone)
          applied.push(`feature ${edit.id} removed${gone.length > 1 ? ` with ${gone.filter((g) => g !== edit.id).join(", ")}` : ""}`)
          break
        }
        case "rename_feature":
          next = renameFeature(next, edit.id, edit.name)
          applied.push(edit.name === undefined ? `feature ${edit.id} shown by its id` : `feature ${edit.id} named "${edit.name}"`)
          break
        case "group_features": {
          const grouped = groupFeatures(next, { id: edit.group, name: edit.name }, edit.ids)
          if (grouped.refusal !== undefined) return fail(`${at}: ${grouped.refusal}.`)
          next = grouped.history
          applied.push(`group ${edit.group} "${edit.name}": ${edit.ids.join(", ")}`)
          break
        }
        case "ungroup_features":
          if (!(next.groups ?? []).some((g) => g.id === edit.group)) return fail(`${at}: there is no group '${edit.group}'.`)
          next = ungroupFeatures(next, edit.group)
          applied.push(`group ${edit.group} dissolved`)
          break
        case "add_configuration": {
          const added = addConfiguration(next, edit.name, edit.id)
          if (added.refusal !== undefined) return fail(`${at}: ${added.refusal}.`)
          next = added.history
          // The new variant is the shown one: its values and suppressed set are written into the part as they are given.
          const id = next.configuration!
          const refused = configurationContent(next, id, edit)
          if (typeof refused === "string") return fail(`${at}: ${refused}`)
          next = refused
          applied.push(`configuration '${edit.name}' (${id}) added and shown${edit.values !== undefined ? `; values ${describeValues(edit.values)}` : ""}${suppressNote(edit)}`)
          break
        }
        case "set_configuration": {
          if (edit.values === undefined && edit.clear === undefined && edit.suppress === undefined && edit.release === undefined) return fail(`${at}: send at least one of values, clear, suppress or release.`)
          if (!(next.configurations ?? []).some((c) => c.id === edit.id)) return fail(`${at}: ${unknownConfiguration(next, edit.id)}`)
          for (const name of edit.clear ?? []) {
            const cleared = setConfigurationValue(next, edit.id, name, undefined)
            if (cleared.refusal !== undefined) return fail(`${at}: ${withParameters(cleared.refusal, next)}.`)
            next = cleared.history
          }
          const refused = configurationContent(next, edit.id, edit)
          if (typeof refused === "string") return fail(`${at}: ${refused}`)
          next = refused
          applied.push(`configuration '${edit.id}' changed${edit.values !== undefined ? `: ${describeValues(edit.values)}` : ""}${edit.clear !== undefined ? `; ${edit.clear.join(", ")} follow the current value` : ""}${suppressNote(edit)}`)
          break
        }
        case "activate_configuration": {
          const shown = activateConfiguration(next, edit.id)
          if (shown.refusal !== undefined) return fail(`${at}: ${shown.refusal.startsWith("no configuration") ? unknownConfiguration(next, edit.id) : shown.refusal + "."}`)
          next = shown.history
          applied.push(`configuration '${edit.id}' shown`)
          break
        }
        case "rename_configuration": {
          const renamed = renameConfiguration(next, edit.id, edit.name)
          if (renamed.refusal !== undefined) return fail(`${at}: ${renamed.refusal.startsWith("no configuration") ? unknownConfiguration(next, edit.id) : renamed.refusal + "."}`)
          next = renamed.history
          applied.push(`configuration '${edit.id}' renamed "${edit.name}"`)
          break
        }
        case "remove_configuration": {
          const gone = removeConfiguration(next, edit.id)
          if (gone.refusal !== undefined) return fail(`${at}: ${unknownConfiguration(next, edit.id)}`)
          next = gone.history
          applied.push(`configuration '${edit.id}' removed (the part stays as it shows now)`)
          break
        }
        case "add_sketch_constraint": {
          const changed = addSketchConstraint(next, edit.feature, edit.constraint as unknown as DimConstraint)
          if (changed.refusal !== undefined) return fail(`${at}: ${changed.refusal}.${sketchHint(next, edit.feature)}`)
          next = changed.history
          applied.push(`sketch ${edit.feature}: ${edit.constraint.type} constraint added${changed.report !== undefined ? ` (${describeFreedom(changed.report)})` : ""}`)
          touched.add(edit.feature)
          break
        }
        case "remove_sketch_constraint": {
          const changed = removeSketchConstraint(next, edit.feature, edit.index)
          if (changed.refusal !== undefined) return fail(`${at}: ${changed.refusal}.${sketchHint(next, edit.feature)}`)
          const was = (next.features.find((f) => f.id === edit.feature) as Extract<Feature, { type: "sketch" }>).sketch.constraints[edit.index]!
          next = changed.history
          applied.push(`sketch ${edit.feature}: ${was.type} constraint ${edit.index} removed${changed.report !== undefined ? ` (${describeFreedom(changed.report)})` : ""}`)
          touched.add(edit.feature)
          break
        }
        case "set_constraint_driven": {
          const changed = setConstraintDriven(next, edit.feature, edit.index, edit.driven)
          if (changed.refusal !== undefined) return fail(`${at}: ${changed.refusal}.${sketchHint(next, edit.feature)}`)
          next = changed.history
          applied.push(`sketch ${edit.feature}: constraint ${edit.index} is now a ${edit.driven ? "reference (driven)" : "driving"} dimension${changed.report !== undefined ? ` (${describeFreedom(changed.report)})` : ""}`)
          touched.add(edit.feature)
          break
        }
      }
    } catch (error) {
      if (error instanceof RangeError) return fail(`${at}: ${error.message}`)
      throw error
    }
  }
  // A history that uses the timeline fields says so; one that no longer does goes back to the plain form (as `timeline` does).
  const usesTimeline = next.rollback !== undefined || next.groups !== undefined || next.features.some((f) => f.suppressed === true)
  if (usesTimeline) next = { ...next, version: 2 }
  else { const { version: _version, ...plain } = next; next = plain }
  // The schema is the gate: references that point forward, a duplicate id or an empty history are named here, not found by a rebuild.
  const checked = decodeHistory(next)
  if (!checked.success) return fail("The edits would leave a history the schema refuses; nothing was changed.", checked.problems.slice(0, 8))
  const report = parametricReport(checked.data)
  if (report.issues.some((i) => i.severity === "error")) {
    const previous = errorKeys(parametricReport(before))
    const introduced = [...errorKeys(report)].filter(([key]) => !previous.has(key)).map(([, text]) => text)
    if (introduced.length > 0) return fail("The edits were not applied: they make the part fail to rebuild.", introduced.slice(0, 12))
  }
  // A feature removed later in the same list takes its sketch report with it.
  const sketches = [...touched].flatMap((id) => { const detail = sketchDetail(checked.data, id); return detail === undefined ? [] : [detail] })
  return { ok: true, history: checked.data, report, applied, removed, sketches }
}
