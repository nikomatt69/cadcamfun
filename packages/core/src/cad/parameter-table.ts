/**
 * The parameter table of a history as a person reads it (Fusion 360's "Change Parameters"): each user parameter with its formula,
 * the value it resolves to, what kind of quantity it is, what it depends on, what uses it, and what is wrong with it. Pure; the
 * edits live in `history-edit.ts`.
 */
import { inferKind, parameterDependencies, parameterCycles, resolveParameters, type QuantityKind } from "./expr.ts"
import type { History, ParameterKind, ParameterNote } from "./history.ts"
import { usesOf } from "./history-edit.ts"

export interface ParameterRow {
  readonly name: string
  /** The stored number or formula. */
  readonly definition: number | string
  /** Resolved value (mm / radians / bare), absent when the parameter failed. */
  readonly value?: number
  /** Why it failed (a loop names the loop), absent when it resolved. */
  readonly error?: string
  /** What it measures: the declared kind, else inferred from its formula (`any` for a bare number). */
  readonly kind: QuantityKind
  readonly declared: boolean
  /** Unit mix-ups found in the formula (a length added to an angle, a length given to `sin`): warnings, never errors. */
  readonly warnings: ReadonlyArray<string>
  readonly dependsOn: ReadonlyArray<string>
  readonly usedBy: { readonly parameters: ReadonlyArray<string>; readonly features: ReadonlyArray<string>; readonly configurations: ReadonlyArray<string> }
  readonly comment?: string
  readonly favorite: boolean
  /** Part of a circular definition. */
  readonly inCycle: boolean
}

const KINDS: Readonly<Record<ParameterKind, QuantityKind>> = { length: "length", angle: "angle", scalar: "any" }

export const parameterTable = (history: History): ReadonlyArray<ParameterRow> => {
  const { values, errors } = resolveParameters(history.parameters)
  const deps = parameterDependencies(history.parameters)
  const cyclic = new Set(parameterCycles(history.parameters).flat())
  const notes: Readonly<Record<string, ParameterNote>> = history.notes ?? {}
  // The kind of a parameter feeds the check of the formulas that use it; a loop or a failure counts as unknown.
  const kinds = new Map<string, QuantityKind>()
  const kindOf = (name: string, trail: ReadonlyArray<string> = []): QuantityKind => {
    const known = kinds.get(name)
    if (known !== undefined) return known
    if (!Object.hasOwn(history.parameters, name) || trail.includes(name) || errors[name] !== undefined) return "any"
    const declared = notes[name]?.kind
    let kind: QuantityKind = "any"
    if (declared !== undefined) kind = KINDS[declared]
    else {
      const def = history.parameters[name]!
      if (typeof def === "string") { try { kind = inferKind(def, (n) => kindOf(n, [...trail, name])).kind } catch { kind = "any" } }
    }
    kinds.set(name, kind)
    return kind
  }
  return Object.entries(history.parameters).map(([name, definition]): ParameterRow => {
    let warnings: ReadonlyArray<string> = []
    if (typeof definition === "string" && errors[name] === undefined) {
      try {
        const report = inferKind(definition, (n) => kindOf(n))
        const declared = notes[name]?.kind
        warnings = declared !== undefined && report.kind !== "any" && KINDS[declared] !== report.kind
          ? [...report.problems, `declared as ${declared} but the formula gives ${report.kind === "angle" ? "an angle" : "a length"}`]
          : report.problems
      } catch { warnings = [] }
    }
    const used = usesOf(history, name)
    const note = notes[name]
    return {
      name, definition,
      ...(values[name] === undefined ? {} : { value: values[name]! }),
      ...(errors[name] === undefined ? {} : { error: errors[name]! }),
      kind: kindOf(name), declared: note?.kind !== undefined, warnings,
      dependsOn: (deps.get(name) ?? []).filter((d) => Object.hasOwn(history.parameters, d)),
      usedBy: { parameters: used.parameters, features: used.features, configurations: used.configurations ?? [] },
      ...(note?.comment === undefined || note.comment === "" ? {} : { comment: note.comment }),
      favorite: note?.favorite === true,
      inCycle: cyclic.has(name)
    }
  })
}

/** A parameter's note set (merged into what is there) or cleared with `undefined`; empty notes are dropped. */
export const setParameterNote = (history: History, name: string, note: ParameterNote | undefined): History => {
  if (!Object.hasOwn(history.parameters, name)) throw new RangeError(`No parameter '${name}'`)
  const comment = note?.comment?.trim()
  if (comment !== undefined && comment.length > 300) throw new RangeError("a comment has at most 300 characters")
  const merged: ParameterNote = {
    ...(history.notes?.[name] ?? {}), ...(note ?? {}),
    ...(comment === undefined ? {} : { comment })
  }
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "favorite" && v === false)) clean[k] = v
  const { notes: _old, ...rest } = history
  const others = Object.fromEntries(Object.entries(history.notes ?? {}).filter(([k]) => k !== name))
  const next = note === undefined || Object.keys(clean).length === 0 ? others : { ...others, [name]: clean as ParameterNote }
  return Object.keys(next).length === 0 ? rest : { ...rest, notes: next }
}
