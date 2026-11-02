/**
 * Persistent references stored in the features of a history (spec 41 N4/N5).
 *
 * A feature that selects a face or an edge can carry a reference string (`face:plate|plate.top`, `edge:plate|edge(plate.side0.0,plate.top)`:
 * `refToString` of `brep/naming-keys.ts`) instead of a point, a box or an axis filter. The reference is made of names and incidence only,
 * so it survives a parameter edit and the insertion of a feature upstream (the key is looked up in the body the feature sees, which has
 * the same key for the same face or edge). Resolution is explicit and never substitutes the nearest entity:
 *
 *   exact      the entity
 *   split      a face or an edge that was refined into several pieces: every piece (all consumers here take all of them)
 *   ambiguous  an ordinal key whose siblings changed: refused, the candidates are named
 *   deleted    the entity is gone: a "reference lost" error that names the feature that removed it, when the replay knows it
 *
 * Both replays (the mesh `rebuild` and the exact replay) lower a reference to the same entities through `lookupRef`, so a feature that
 * cannot resolve its reference fails the same way in both.
 *
 * Old selections (a `name`, a point near a face, a geometric edge filter) keep working. `migrateSelectionsToRefs` writes the matching
 * reference next to them (never in place of them) so the history stores both, and records every conversion.
 */
import { indexOfKey, parseRef, refToString, resolveKey, topologyKeys, type Ref, type RefKind } from "./brep/naming-keys.ts"
import { uniqueFaceNames } from "./brep/naming.ts"
import { curvePoint, type Brep } from "./brep/index.ts"
import type { PlanarFacePick } from "./brep/draft.ts"
import { cross3, scale3, type Vec3 } from "./brep/math.ts"
import type { ExactSnapshot } from "./history-brep.ts"

export interface RefBody { readonly id: string; readonly brep?: Brep }

export type RefHit = {
  readonly ok: true
  /** The body the entities are in (it can differ from the reference's body when a union absorbed that body). */
  readonly body: string
  /** The body with unique face names (the indices are the same as in the raw body). */
  readonly brep: Brep
  readonly kind: RefKind
  readonly indices: ReadonlyArray<number>
  readonly keys: ReadonlyArray<string>
  /** Things a person should know: the reference resolved in another body, or its entity moved far from where it was picked. */
  readonly notes: ReadonlyArray<string>
}
export type RefMiss = { readonly ok: false; readonly error: string; readonly lostBy?: string }

/** The reference text of an entity (a convenience for tests and tools that hold a body and an index). */
export const refText = (ref: Pick<Ref, "body" | "kind" | "key">): string => refToString(ref)

/** Why a key is gone, read from the states the replay went through: the feature after which it no longer existed. */
const lostReason = (timeline: ReadonlyArray<ExactSnapshot> | undefined, body: string, kind: RefKind, key: string): { readonly text: string; readonly feature?: string } => {
  if (timeline === undefined || timeline.length === 0) return { text: "no state of the replay is available to say what happened to it" }
  let last = -1
  timeline.forEach((s, j) => {
    const b = s.bodies.find((x) => x.id === body)
    if (b !== undefined && indexOfKey(uniqueFaceNames(b.brep), kind, key) !== undefined) last = j
  })
  if (last < 0) return { text: `no earlier feature made a ${kind} with this key on body '${body}'` }
  const next = timeline[last + 1]
  return next?.feature === undefined
    ? { text: `it exists after '${timeline[last]!.feature ?? "the start"}' but not in the state this feature sees` }
    : { text: `it was removed by '${next.feature}'`, feature: next.feature }
}

/**
 * The entities a reference names in the bodies the feature sees (`bodies`: the replay's state just before the feature) and the
 * states before it (`timeline`, only to say what removed a lost entity).
 */
export const lookupRef = (text: string, bodies: ReadonlyArray<RefBody>, timeline: ReadonlyArray<ExactSnapshot> | undefined, expect: RefKind): RefHit | RefMiss => {
  const ref = parseRef(text)
  if (ref === undefined) return { ok: false, error: `the reference '${text}' is not a reference (expected '${expect}:<body>|<key>')` }
  if (ref.kind !== expect) return { ok: false, error: `the reference '${text}' names a ${ref.kind}, but a ${expect} is needed here` }
  const notes: string[] = []
  const withModel = bodies.filter((b) => b.brep !== undefined)
  let host = withModel.find((b) => b.id === ref.body)
  if (host === undefined) {
    if (bodies.some((b) => b.id === ref.body)) return { ok: false, error: `the reference '${text}' is on body '${ref.body}', which has no exact model at this point of the history` }
    // The body may have been absorbed by a union: the key then lives in the body that holds it, if exactly one does.
    const holding = withModel.filter((b) => indexOfKey(uniqueFaceNames(b.brep!), ref.kind, ref.key) !== undefined)
    if (holding.length === 1) { host = holding[0]!; notes.push(`body '${ref.body}' no longer exists; the reference resolved in '${host.id}'`) }
    else return { ok: false, error: `reference lost: ${text}: body '${ref.body}' does not exist at this point of the history`, lostBy: undefined }
  }
  const brep = uniqueFaceNames(host.brep!)
  const r = resolveKey(brep, ref)
  if (r.outcome === "exact") {
    if (r.moved !== undefined) notes.push(`'${ref.key}' is ${r.moved.toFixed(1)} mm from where it was picked`)
    return { ok: true, body: host.id, brep, kind: ref.kind, indices: [r.index], keys: [r.key], notes }
  }
  if (r.outcome === "split") return { ok: true, body: host.id, brep, kind: ref.kind, indices: r.indices, keys: r.keys, notes: [...notes, `'${ref.key}' was split into ${r.indices.length} pieces; all of them are used`] }
  if (r.outcome === "ambiguous") return { ok: false, error: `ambiguous reference ${text}: ${r.reason} (candidates: ${r.keys.slice(0, 6).join(", ")})` }
  if (r.outcome === "merged") return { ok: true, body: host.id, brep, kind: ref.kind, indices: [r.index], keys: [r.key], notes: [...notes, `'${ref.key}' was merged with ${r.absorbed.join(", ") || "another face"}`] }
  const why = lostReason(timeline, host.id, ref.kind, ref.key)
  return { ok: false, error: `reference lost: ${text}: ${why.text}`, ...(why.feature !== undefined ? { lostBy: why.feature } : {}) }
}

/** The edges named by several references, by body (every piece of a split edge). */
export const lookupEdgeRefs = (refs: ReadonlyArray<string>, bodies: ReadonlyArray<RefBody>, timeline: ReadonlyArray<ExactSnapshot> | undefined):
  { readonly ok: true; readonly byBody: ReadonlyMap<string, { readonly brep: Brep; readonly edges: ReadonlySet<number> }>; readonly notes: ReadonlyArray<string> } | RefMiss => {
  const byBody = new Map<string, { brep: Brep; edges: Set<number> }>()
  const notes: string[] = []
  for (const text of refs) {
    const hit = lookupRef(text, bodies, timeline, "edge")
    if (!hit.ok) return hit
    const entry = byBody.get(hit.body) ?? { brep: hit.brep, edges: new Set<number>() }
    for (const i of hit.indices) entry.edges.add(i)
    byBody.set(hit.body, entry)
    notes.push(...hit.notes)
  }
  return { ok: true, byBody, notes }
}

/** The planar face `index` of `b` as the pick the face-edit kernel works with, or why it is not planar. */
export const planarPickOf = (b: Brep, index: number): PlanarFacePick | string => {
  const face = b.faces[index]
  if (face === undefined) return `face ${index} does not exist`
  if (face.surface.kind !== "plane") return `the face '${face.name ?? index}' is ${face.surface.kind === "cylinder" ? "a cylinder" : `a ${face.surface.kind} surface`}, not a plane`
  const F = face.surface.frame
  const n = face.reversed ? scale3(F.z, -1) : F.z
  return { face: index, origin: F.origin, normal: n, u: F.x, v: cross3(n, F.x), distance: 0 }
}

/**
 * The distance from a point to an edge of the body: exact for a line, a polyline of 256 pieces for any other curve (its chord sag
 * is taken off, so a point on a large circle is at distance 0 and not at the sag).
 */
export const distanceToEdge = (b: Brep, edge: number, p: Vec3): number => {
  const e = b.edges[edge]!
  const N = e.curve.kind === "line" ? 1 : 256
  let prev = curvePoint(e.curve, e.t0)
  let best = Infinity
  for (let k = 1; k <= N; k++) {
    const q = curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / N)
    const d = { x: q.x - prev.x, y: q.y - prev.y, z: q.z - prev.z }
    const l2 = d.x * d.x + d.y * d.y + d.z * d.z
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - prev.x) * d.x + (p.y - prev.y) * d.y + (p.z - prev.z) * d.z) / l2))
    best = Math.min(best, Math.hypot(p.x - (prev.x + d.x * t), p.y - (prev.y + d.y * t), p.z - (prev.z + d.z * t)))
    prev = q
  }
  const sag = e.curve.kind === "circle" ? e.curve.radius * (1 - Math.cos(Math.abs(e.t1 - e.t0) / N / 2)) : 0
  return Math.max(0, best - sag)
}

/** Whether a segment (a mesh edge, a facet of a rim) lies on one of the edges: both ends within `tol` of it. */
export const segmentOnEdges = (b: Brep, edges: ReadonlySet<number>, a: Vec3, c: Vec3, tol: number): boolean => {
  for (const e of edges) if (distanceToEdge(b, e, a) <= tol && distanceToEdge(b, e, c) <= tol) return true
  return false
}

/** A reference to entity `index` of body `body` (a body with unnamed faces cannot offer one). */
export const refOf = (b: Brep, body: string, kind: RefKind, index: number): string | undefined => {
  const keys = topologyKeys(uniqueFaceNames(b))
  const key = kind === "face" ? keys.faces[index] : kind === "edge" ? keys.edges[index] : keys.vertices[index]
  return key === undefined || key === "" ? undefined : refToString({ body, kind, key })
}

/**
 * The open ends of a shell from `openFaces` references: the top and bottom faces of the extrusion (`<extrusion>.top`, `<extrusion>.bottom`).
 * A reference to a side face, or to a face of another feature, is refused: the shell opens the ends of an extrusion only.
 */
export const shellOpenFromRefs = (
  extrusion: string, refs: ReadonlyArray<string>, bodies: ReadonlyArray<RefBody>, timeline: ReadonlyArray<ExactSnapshot> | undefined
): { readonly ok: true; readonly open: "none" | "top" | "bottom" | "both" } | RefMiss => {
  let top = false, bottom = false
  for (const text of refs) {
    const hit = lookupRef(text, bodies, timeline, "face")
    if (!hit.ok) return hit
    for (const key of hit.keys) {
      const role = key.startsWith(`${extrusion}.`) ? /^[^@#]*/.exec(key.slice(extrusion.length + 1))![0] : undefined
      if (role === "top") top = true
      else if (role === "bottom") bottom = true
      else return { ok: false, error: `the reference '${text}' names '${key}': a shell opens the top or bottom face of '${extrusion}' only` }
    }
  }
  return { ok: true, open: top && bottom ? "both" : top ? "top" : bottom ? "bottom" : "none" }
}
