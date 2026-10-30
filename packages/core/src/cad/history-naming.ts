/**
 * References to the entities of a parametric history (spec 41 N3, N4 kernel side): which entity a reference names after the
 * history was edited or later features ran, answered from the replay's lineage, never by "the nearest one".
 *
 *   `entityRefs(rebuild, body)`      the references a tool can store for a body (faces, edges, vertices with their keys)
 *   `resolveInHistory(rebuild, ref)` what became of a reference by the end of the replay: exact / split / merged / deleted / ambiguous
 *   `resolveAfterEdit(before, after, ref)` the same across an edit: the key is looked up in the rebuilt body, and, when the
 *                                    key is gone, the lineage of the rebuilt history says why (which feature removed it)
 *   `namingReport(rebuild)`          the health of the names of every body (what the assistant reads before relying on refs)
 */
import { indexOfKey, keyOf, makeRef, namingHealth, resolveAcross, resolveKey, topologyKeys, type LineageStep, type NamingHealth, type Ref, type RefKind, type Resolution } from "./brep/naming-keys.ts"
import { provenanceOf } from "./brep/provenance.ts"
import { uniqueFaceNames } from "./brep/naming.ts"
import type { Brep } from "./brep/topology.ts"
import type { ExactRebuild, ExactSnapshot } from "./history-brep.ts"

/** The body (by id) in `timeline[j]`, following a body that was absorbed into another by a union to the body that holds it. */
const bodyAt = (snap: ExactSnapshot, id: string, previous: Brep | undefined): { readonly id: string; readonly brep: Brep } | undefined => {
  const same = snap.bodies.find((b) => b.id === id)
  if (same !== undefined) return same
  if (previous === undefined) return undefined
  // The body is gone: a union merged it into another body, whose faces descend from this one's.
  return snap.bodies.find((b) => provenanceOf(uniqueFaceNames(b.brep), [uniqueFaceNames(previous)]).faces.some((f) => !f.isNew))
}

/** The references one body offers (every entity that has a key). */
export const entityRefs = (rebuild: ExactRebuild, body: string, kinds: ReadonlyArray<RefKind> = ["face", "edge", "vertex"]): ReadonlyArray<Ref> => {
  const b = rebuild.bodies.find((x) => x.id === body)?.brep
  if (b === undefined) return []
  const out: Ref[] = []
  for (const kind of kinds) {
    const n = kind === "face" ? b.faces.length : kind === "edge" ? b.edges.length : b.vertices.length
    for (let i = 0; i < n; i++) { const r = makeRef(b, body, kind, i); if (typeof r !== "string") out.push(r) }
  }
  return out
}

export interface ResolveOptions {
  /** The feature after which the reference was made (the state the person selected in). Default: the first state that has the key. */
  readonly madeAfter?: string
}

export type HistoryResolution = Resolution & {
  /** The body the entity is in at the end of the replay (it can differ from `ref.body` when a union absorbed that body). */
  readonly body?: string
  /** Why nothing could be said, when the reference did not exist anywhere in the timeline. */
  readonly unknown?: true
}

/**
 * What became of `ref` by the end of the replay. Walks the recorded states of the body from the state the reference was made in
 * to the last one, mapping the entity through the lineage of every feature that changed the body.
 */
export const resolveInHistory = (rebuild: ExactRebuild, ref: Ref, options: ResolveOptions = {}): HistoryResolution => {
  const timeline = rebuild.timeline
  const finalBody = rebuild.bodies.find((b) => b.id === ref.body)
  if (timeline === undefined || timeline.length === 0) {
    if (finalBody?.brep === undefined) return { outcome: "deleted", kind: ref.kind, reason: `body '${ref.body}' has no exact model${finalBody?.reason !== undefined ? `: ${finalBody.reason}` : ""}`, unknown: true }
    return { ...resolveKey(finalBody.brep, ref), body: ref.body }
  }
  // The state the reference was made in.
  let from = 0
  if (options.madeAfter !== undefined) {
    const j = timeline.findIndex((s) => s.feature === options.madeAfter)
    if (j < 0) return { outcome: "deleted", kind: ref.kind, reason: `the history has no feature '${options.madeAfter}' (or the replay did not reach it)`, unknown: true }
    from = j
  } else {
    const j = timeline.findIndex((s) => { const b = s.bodies.find((x) => x.id === ref.body); return b !== undefined && indexOfKey(uniqueFaceNames(b.brep), ref.kind, ref.key) !== undefined })
    if (j < 0) {
      // Never existed under this key: ask the final body (it may be a refined name), else say so.
      if (finalBody?.brep !== undefined) return { ...resolveKey(finalBody.brep, ref), body: ref.body }
      return { outcome: "deleted", kind: ref.kind, reason: `no state of body '${ref.body}' has ${ref.kind} '${ref.key}'`, unknown: true }
    }
    from = j
  }
  const first = timeline[from]!.bodies.find((b) => b.id === ref.body)
  if (first === undefined) return { outcome: "deleted", kind: ref.kind, reason: `body '${ref.body}' does not exist after '${timeline[from]!.feature ?? "the start"}'`, unknown: true }
  let id = ref.body
  let prev = uniqueFaceNames(first.brep)
  const start = prev
  const steps: LineageStep[] = []
  let gone: string | undefined
  for (let j = from + 1; j < timeline.length; j++) {
    const snap = timeline[j]!
    const here = bodyAt(snap, id, prev)
    if (here === undefined) { gone = snap.feature; break }
    id = here.id
    const next = uniqueFaceNames(here.brep)
    if (next !== prev) steps.push({ before: prev, after: next, by: snap.feature ?? "the history" })
    prev = next
  }
  if (gone !== undefined) return { outcome: "deleted", kind: ref.kind, reason: `body '${id}' no longer exists after '${gone}'`, feature: gone, body: id }
  const r = resolveAcross(start, steps, ref)
  return { ...r, body: id }
}

/**
 * Resolves a reference made on the model `before` against the rebuilt model `after` (an edit of a parameter, a dimension, an
 * earlier feature). The key is looked up in the rebuilt body; when the key is gone, the lineage of the rebuilt history says
 * what happened to the entity the key named (a refined name is a `split`, a removed face is `deleted` with the feature).
 */
export const resolveAfterEdit = (after: ExactRebuild, ref: Ref): HistoryResolution => {
  const b = after.bodies.find((x) => x.id === ref.body)
  if (b?.brep === undefined) return { outcome: "deleted", kind: ref.kind, reason: `body '${ref.body}' has no exact model after the edit${b?.reason !== undefined ? `: ${b.reason}` : ""}`, unknown: true }
  const direct = resolveKey(b.brep, ref)
  if (direct.outcome === "exact" || direct.outcome === "split" || direct.outcome === "ambiguous") return { ...direct, body: ref.body }
  // The key is not in the final body: find the state where it still was and follow it.
  const lineage = resolveInHistory(after, ref)
  return lineage.unknown === true ? { ...direct, body: ref.body } : lineage
}

export interface BodyNamingReport {
  readonly body: string
  readonly health: NamingHealth
  /** Keys that depend on a position ordinal (stable only while the geometry is). */
  readonly ordinalKeys: ReadonlyArray<string>
  /** Number of references that can be made. */
  readonly refs: number
}

/** The naming health of every exact body: what the assistant reads before it stores references. */
export const namingReport = (rebuild: ExactRebuild): ReadonlyArray<BodyNamingReport> =>
  rebuild.bodies.flatMap((b) => {
    if (b.brep === undefined) return []
    const k = topologyKeys(b.brep)
    return [{ body: b.id, health: namingHealth(b.brep), ordinalKeys: [...k.ordinal].sort(), refs: [...k.faces, ...k.edges, ...k.vertices].filter((x) => x !== "").length }]
  })

/** The key of an entity of a rebuilt body (re-exported for the callers that start from an index). */
export const keyOfEntity = (rebuild: ExactRebuild, body: string, kind: RefKind, index: number): string | undefined => {
  const b = rebuild.bodies.find((x) => x.id === body)?.brep
  return b === undefined ? undefined : keyOf(b, kind, index)
}
