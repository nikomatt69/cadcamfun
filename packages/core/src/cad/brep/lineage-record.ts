/**
 * The record of derivations that `provenance.ts` composes (spec 41 N1). Kept apart from it so `topology.ts` can record the
 * steps of `transformBrep`, `mergeBreps` and `compactBrep` without an import cycle.
 */
import type { Brep } from "./topology.ts"

export type FaceRelation = "same" | "trimmed" | "split" | "merged" | "reversed" | "offset" | "blend" | "new"

/** One ancestor of a result face. */
export interface FaceOrigin {
  /** Index into the operand list given to `provenanceOf` (0 = the first body of the operation). */
  readonly operand: number
  readonly face: number
  readonly relation: FaceRelation
  /** True when the result face points the opposite way of the operand face (the tool faces of a subtraction). */
  readonly flipped?: true
}

/** A recorded step: result face -> faces of the step's sources. */
export interface Step {
  readonly op: string
  readonly sources: ReadonlyArray<Brep>
  readonly faces: ReadonlyArray<ReadonlyArray<FaceOrigin>>
}

export const STEPS = new WeakMap<Brep, Step>()

/** Records that `result` was derived from `sources`: `faces[r]` lists the source faces of result face `r` (empty = new). */
export const recordDerivation = (result: Brep, op: string, sources: ReadonlyArray<Brep>, faces: ReadonlyArray<ReadonlyArray<FaceOrigin>>): Brep => {
  if (result.faces.length === 0 || sources.includes(result)) return result
  STEPS.set(result, { op, sources, faces })
  return result
}

/** A step in which face `i` of the result is face `map[i]` of the single source. */
export const recordRelabel = (result: Brep, op: string, source: Brep, map?: ReadonlyArray<number>, relation: FaceRelation = "same"): Brep =>
  recordDerivation(result, op, [source], result.faces.map((_, i) => [{ operand: 0, face: map === undefined ? i : map[i]!, relation }]))

/** Whether anything was recorded for `b` (it is derived by a tracked operation). */
export const hasDerivation = (b: Brep): boolean => STEPS.has(b)

