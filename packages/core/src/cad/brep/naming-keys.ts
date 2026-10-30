/**
 * Stable keys for faces, edges and vertices, and `resolve` (spec 41 N2, N3).
 *
 *   key(face)   = the face's unique name (`<feature>.<role>[...]`, assigned by the feature that made the surface)
 *   key(edge)   = edge(<face key>,<face key>)[@{<other faces at its ends>}][#k]   the intersection of two named faces
 *   key(vertex) = vertex(<face key>,<face key>,<face key>...)[@{<edge keys>}][#k]
 *
 * A key is built from names and incidence only, never from coordinates, so it does not change when a dimension does. Where
 * two entities of one body would get the same key (two edges between the same two faces: the rim circle of a through bore
 * has none, a slot floor has two) they are told apart, in order, by the faces at their ends (still topological) and, last,
 * by position (`#k`, an *ordinal* key: stable while the geometry is, and reported as such: `ordinal` in the result).
 *
 * `resolve` answers one of five outcomes and never substitutes the nearest entity (spec 41 §3.3):
 *   exact      the entity (same key, or a single successor in the lineage)
 *   split      several successors: the policy of the consumer decides (all pieces, the largest, fail)
 *   merged     the entity became part of a larger one (coplanar faces united): the successor and what it absorbed
 *   deleted    no successor: the reason names the cause
 *   ambiguous  candidates of equal evidence (an ordinal key whose siblings changed)
 */
import { dist3, type Vec3 } from "./math.ts"
import { edgeLineage, provenanceOf, vertexLineage } from "./provenance.ts"
import { edgePointAt, edgeUses, type Brep } from "./topology.ts"
import { faceCentre } from "./naming.ts"

export type RefKind = "face" | "edge" | "vertex"

/** A reference to one entity of one body. `hint` is a point on the entity when it was picked (only used for a warning). */
export interface Ref {
  readonly body: string
  readonly kind: RefKind
  readonly key: string
  readonly hint?: Vec3
  /**
   * For an ordinal key (`...#k`): how many entities shared its stem when the reference was made. If that number differs when the
   * reference is resolved, the ordinal no longer means the same entity and the answer is `ambiguous`.
   */
  readonly siblings?: number
}

/** `face:plate|plate.top` — the body id may contain `:` or `#`, never `|`. */
export const refToString = (r: Pick<Ref, "body" | "kind" | "key">): string => `${r.kind}:${r.body}|${r.key}`

export const parseRef = (s: string): Ref | undefined => {
  const m = /^(face|edge|vertex):([^|]*)\|(.+)$/.exec(s.trim())
  return m === null ? undefined : { kind: m[1] as RefKind, body: m[2]!, key: m[3]! }
}

export interface TopologyKeys {
  /** Key per face; `""` for an unnamed face (no stable key can be made). */
  readonly faces: ReadonlyArray<string>
  readonly edges: ReadonlyArray<string>
  readonly vertices: ReadonlyArray<string>
  /** Keys that end in a position ordinal (`#k`): the weakest tier. */
  readonly ordinal: ReadonlySet<string>
  readonly unnamedFaces: ReadonlyArray<number>
}

const q = (v: number) => Math.round(v * 1e5)

const faceIncidence = (b: Brep): { readonly edgeFaces: ReadonlyArray<ReadonlyArray<number>>; readonly vertexFaces: ReadonlyArray<ReadonlySet<number>> } => {
  const uses = edgeUses(b)
  const edgeFaces = uses.map((u) => [...new Set(u.map((x) => x.face))])
  const vertexFaces = b.vertices.map(() => new Set<number>())
  b.edges.forEach((e, ei) => { for (const f of edgeFaces[ei]!) { vertexFaces[e.v0]!.add(f); vertexFaces[e.v1]!.add(f) } })
  return { edgeFaces, vertexFaces }
}

const CACHE = new WeakMap<Brep, TopologyKeys>()

/** The keys of every entity of `b` (names must be unique: use the exact bodies of the replay, already `uniqueFaceNames`d). Memoised per object. */
export const topologyKeys = (b: Brep): TopologyKeys => {
  const hit = CACHE.get(b)
  if (hit !== undefined) return hit
  const ordinal = new Set<string>()
  const faceNames = b.faces.map((f) => f.name ?? "")
  // Two faces with one name (an unprepared body): the second and later get an ordinal.
  const seen = new Map<string, number>()
  const faces = faceNames.map((n) => {
    if (n === "") return ""
    const c = seen.get(n) ?? 0
    seen.set(n, c + 1)
    if (c === 0) return n
    const k = `${n}#dup${c}`
    ordinal.add(k)
    return k
  })
  const { edgeFaces, vertexFaces } = faceIncidence(b)
  const faceKey = (f: number) => faces[f]!
  // ---- edges
  const base = b.edges.map((_, ei) => {
    const ks = edgeFaces[ei]!.map(faceKey)
    if (ks.some((k) => k === "")) return ""
    const sorted = [...ks].sort()
    return `edge(${sorted.length === 1 ? `${sorted[0]},${sorted[0]}` : sorted.join(",")})`
  })
  const edgeGroups = new Map<string, number[]>()
  base.forEach((k, ei) => { if (k !== "") edgeGroups.set(k, [...(edgeGroups.get(k) ?? []), ei]) })
  const edges = base.slice()
  const endFaces = (ei: number): string => {
    const e = b.edges[ei]!, own = new Set(edgeFaces[ei]!)
    const around = new Set<string>()
    for (const v of [e.v0, e.v1]) for (const f of vertexFaces[v]!) if (!own.has(f)) around.add(faceKey(f) || "?")
    return [...around].sort().join(",")
  }
  for (const [k, members] of edgeGroups) {
    if (members.length === 1) continue
    const ends = members.map(endFaces)
    if (new Set(ends).size === members.length) { members.forEach((ei, i) => { edges[ei] = `${k}@{${ends[i]}}` }); continue }
    const order = members
      .map((ei, i) => ({ ei, end: ends[i]!, m: edgePointAt(b.edges[ei]!, 0.5) }))
      .sort((p, r) => p.end.localeCompare(r.end) || q(p.m.x) - q(r.m.x) || q(p.m.y) - q(r.m.y) || q(p.m.z) - q(r.m.z))
    order.forEach((o, i) => { const key = `${k}${o.end === "" ? "" : `@{${o.end}}`}#${i}`; edges[o.ei] = key; ordinal.add(key) })
  }
  // ---- vertices
  const vbase = b.vertices.map((_, vi) => {
    const ks = [...vertexFaces[vi]!].map(faceKey)
    if (ks.length === 0 || ks.some((k) => k === "")) return ""
    return `vertex(${ks.sort().join(",")})`
  })
  const vgroups = new Map<string, number[]>()
  vbase.forEach((k, vi) => { if (k !== "") vgroups.set(k, [...(vgroups.get(k) ?? []), vi]) })
  const vertices = vbase.slice()
  if ([...vgroups.values()].some((m) => m.length > 1)) {
    const vEdges = b.vertices.map(() => [] as number[])
    b.edges.forEach((e, ei) => { vEdges[e.v0]!.push(ei); if (e.v1 !== e.v0) vEdges[e.v1]!.push(ei) })
    for (const [k, members] of vgroups) {
      if (members.length === 1) continue
      const around = members.map((vi) => vEdges[vi]!.map((ei) => edges[ei]!).sort().join(";"))
      if (new Set(around).size === members.length) { members.forEach((vi, i) => { vertices[vi] = `${k}@{${around[i]}}` }); continue }
      const order = members
        .map((vi, i) => ({ vi, a: around[i]!, p: b.vertices[vi]!.point }))
        .sort((p, r) => p.a.localeCompare(r.a) || q(p.p.x) - q(r.p.x) || q(p.p.y) - q(r.p.y) || q(p.p.z) - q(r.p.z))
      order.forEach((o, i) => { const key = `${k}#${i}`; vertices[o.vi] = key; ordinal.add(key) })
    }
  }
  // A key with an ordinal anywhere in it (a face named `bore.side0.0#1` by position, or an edge of such a face) is the weakest tier.
  for (const k of [...faces, ...edges, ...vertices]) if (k.includes("#")) ordinal.add(k)
  const out: TopologyKeys = { faces, edges, vertices, ordinal, unnamedFaces: faces.map((k, i) => (k === "" ? i : -1)).filter((i) => i >= 0) }
  CACHE.set(b, out)
  return out
}

/** The key without its trailing position ordinal. */
const stemOf = (key: string): string => key.replace(/#\d+$/, "")

const table = (k: TopologyKeys, kind: RefKind): ReadonlyArray<string> => (kind === "face" ? k.faces : kind === "edge" ? k.edges : k.vertices)

/** The key of one entity, or undefined when it has none (an unnamed face or an entity next to one). */
export const keyOf = (b: Brep, kind: RefKind, index: number): string | undefined => {
  const k = table(topologyKeys(b), kind)[index]
  return k === undefined || k === "" ? undefined : k
}

/** Index of the entity with this key, or undefined. Keys are unique per body, so there is at most one. */
export const indexOfKey = (b: Brep, kind: RefKind, key: string): number | undefined => {
  const i = table(topologyKeys(b), kind).indexOf(key)
  return i < 0 ? undefined : i
}

/** A point on the entity (used as the hint of a reference and to warn when the resolved entity moved far from it). */
export const entityPoint = (b: Brep, kind: RefKind, index: number): Vec3 =>
  kind === "face" ? faceCentre(b, index) : kind === "edge" ? edgePointAt(b.edges[index]!, 0.5) : b.vertices[index]!.point

/** The reference to an entity of the body called `body`, or why it cannot be made. */
export const makeRef = (b: Brep, body: string, kind: RefKind, index: number): Ref | string => {
  if (index < 0 || index >= (kind === "face" ? b.faces.length : kind === "edge" ? b.edges.length : b.vertices.length)) return `${kind} ${index} does not exist (the body has ${kind === "face" ? b.faces.length : kind === "edge" ? b.edges.length : b.vertices.length})`
  const key = keyOf(b, kind, index)
  if (key === undefined) return `${kind} ${index} has no stable name: it is unnamed or touches an unnamed face (a body imported without names stays positional)`
  const stem = stemOf(key)
  const siblings = topologyKeys(b).ordinal.has(key) && stem !== key ? table(topologyKeys(b), kind).filter((k) => stemOf(k) === stem).length : undefined
  return { body, kind, key, hint: entityPoint(b, kind, index), ...(siblings !== undefined ? { siblings } : {}) }
}

// ------------------------------------------------------------------ resolve

export type Resolution =
  | { readonly outcome: "exact"; readonly kind: RefKind; readonly index: number; readonly key: string; readonly ordinal: boolean; readonly moved?: number }
  | { readonly outcome: "split"; readonly kind: RefKind; readonly indices: ReadonlyArray<number>; readonly keys: ReadonlyArray<string> }
  | { readonly outcome: "merged"; readonly kind: RefKind; readonly index: number; readonly key: string; readonly absorbed: ReadonlyArray<string>; readonly withOtherBody: boolean }
  | { readonly outcome: "deleted"; readonly kind: RefKind; readonly reason: string; readonly feature?: string }
  | { readonly outcome: "ambiguous"; readonly kind: RefKind; readonly indices: ReadonlyArray<number>; readonly keys: ReadonlyArray<string>; readonly reason: string }

/** Distance between the hint and the resolved entity when it exceeds a tenth of the body's diagonal (a warning, never a re-pick). */
const movedFar = (b: Brep, kind: RefKind, index: number, hint: Vec3 | undefined): number | undefined => {
  if (hint === undefined) return undefined
  const pts = b.vertices.map((v) => v.point)
  if (pts.length === 0) return undefined
  let lo = { ...pts[0]! }, hi = { ...pts[0]! }
  for (const p of pts) { lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) }; hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) } }
  const d = dist3(entityPoint(b, kind, index), hint)
  return d > 0.1 * dist3(lo, hi) ? d : undefined
}

/**
 * Resolves a key in ONE body (a rebuilt body, no lineage): the same key is `exact`; a face whose name was refined by
 * `uniqueFaceNames` into several (`plate.top` -> `plate.top@a`, `plate.top@b`) is `split`; an ordinal key whose siblings
 * changed is `ambiguous`; anything else is `deleted` (with the honest reason that no lineage was available).
 */
export const resolveKey = (b: Brep, ref: Pick<Ref, "kind" | "key" | "hint" | "siblings">): Resolution => {
  const keys = topologyKeys(b)
  const t = table(keys, ref.kind)
  const at = t.indexOf(ref.key)
  if (at >= 0 && ref.siblings !== undefined && stemOf(ref.key) !== ref.key) {
    const same = t.map((k, i) => ({ k, i })).filter(({ k }) => stemOf(k) === stemOf(ref.key))
    if (same.length !== ref.siblings) return { outcome: "ambiguous", kind: ref.kind, indices: same.map((s) => s.i), keys: same.map((s) => s.k), reason: `the ordinal key '${ref.key}' still exists but ${same.length} entities share its stem now (${ref.siblings} when it was made): the ordinal may name a different one` }
  }
  if (at >= 0) {
    const moved = movedFar(b, ref.kind, at, ref.hint)
    return { outcome: "exact", kind: ref.kind, index: at, key: ref.key, ordinal: keys.ordinal.has(ref.key), ...(moved !== undefined ? { moved } : {}) }
  }
  // Refined names: the key is a prefix of several keys.
  const prefix = stemOf(ref.key)
  const siblings = t.map((k, i) => ({ k, i })).filter(({ k }) => k !== "" && k !== ref.key && (k.startsWith(`${ref.key}@`) || k.startsWith(`${ref.key}#`)))
  if (siblings.length > 1) return { outcome: "split", kind: ref.kind, indices: siblings.map((s) => s.i), keys: siblings.map((s) => s.k) }
  if (siblings.length === 1) return { outcome: "exact", kind: ref.kind, index: siblings[0]!.i, key: siblings[0]!.k, ordinal: keys.ordinal.has(siblings[0]!.k) }
  if (/#\d+$/.test(ref.key)) {
    const same = t.map((k, i) => ({ k, i })).filter(({ k }) => k !== "" && stemOf(k) === prefix)
    if (same.length > 0) return { outcome: "ambiguous", kind: ref.kind, indices: same.map((s) => s.i), keys: same.map((s) => s.k), reason: `the ordinal key '${ref.key}' is gone; ${same.length} entit${same.length === 1 ? "y" : "ies"} share its stem and only their position tells them apart` }
  }
  return { outcome: "deleted", kind: ref.kind, reason: `no ${ref.kind} with the key '${ref.key}' in this body, and no lineage was given to say what became of it` }
}

/** The entities of `kind` of `after` that descend from entity `index` of `before`, with the lineage of the step. */
const descendants = (before: Brep, after: Brep, kind: RefKind): ((index: number) => { readonly into: number[]; readonly mergedWith: number[]; readonly joined: boolean }) => {
  const p = provenanceOf(after, [before])
  if (kind === "face") {
    const into = new Map<number, number[]>()
    p.faces.forEach((f, r) => { for (const o of f.from) into.set(o.face, [...(into.get(o.face) ?? []), r]) })
    return (i) => {
      const list = into.get(i) ?? []
      const others = list.flatMap((r) => p.faces[r]!.from.filter((o) => o.face !== i).map((o) => o.face))
      return { into: list, mergedWith: [...new Set(others)], joined: list.some((r) => p.faces[r]!.from.some((o) => o.face === i && o.absorbed === true)) }
    }
  }
  const lin = kind === "edge" ? edgeLineage(after, [before], p) : vertexLineage(after, [before])
  const into = new Map<number, number[]>()
  lin.forEach((l, r) => { for (const o of l.from) into.set(o.index, [...(into.get(o.index) ?? []), r]) })
  return (i) => ({ into: into.get(i) ?? [], mergedWith: [], joined: false })
}

export interface LineageStep {
  /** The body before and after one operation (or one feature). */
  readonly before: Brep
  readonly after: Brep
  /** Name of the operation that made `after`, for the reason of a deletion. */
  readonly by: string
}

/**
 * Resolves a reference made on the first body of a chain of steps against the last one. Each step maps the tracked
 * entities through the lineage of `provenanceOf`; the key of the result is read from the last body.
 */
export const resolveAcross = (start: Brep, steps: ReadonlyArray<LineageStep>, ref: Pick<Ref, "kind" | "key" | "hint" | "siblings">): Resolution => {
  let at = indexOfKey(start, ref.kind, ref.key)
  if (at === undefined) return { outcome: "deleted", kind: ref.kind, reason: `the body has no ${ref.kind} with the key '${ref.key}' at the start of the chain` }
  let tracked: number[] = [at]
  const absorbed = new Set<string>()
  let current = start
  let merged = false
  let otherBody = false
  for (const s of steps) {
    if (s.before !== current) throw new RangeError("the steps of a lineage chain must follow each other: step.before is not the previous step's result")
    if (s.after === s.before) continue
    const map = descendants(s.before, s.after, ref.kind)
    const next = new Set<number>()
    for (const i of tracked) {
      const d = map(i)
      for (const r of d.into) next.add(r)
      if (d.joined) { merged = true; if (d.mergedWith.length === 0) otherBody = true }
      if (d.mergedWith.length > 0) {
        merged = true
        for (const w of d.mergedWith) { const k = keyOf(s.before, ref.kind, w); if (k !== undefined) absorbed.add(k) }
      }
    }
    if (next.size === 0) return { outcome: "deleted", kind: ref.kind, reason: `${ref.kind} '${ref.key}' has no successor after ${s.by}`, feature: s.by }
    tracked = [...next]
    current = s.after
  }
  const keys = tracked.map((i) => keyOf(current, ref.kind, i) ?? "")
  if (tracked.length > 1) return { outcome: "split", kind: ref.kind, indices: tracked, keys }
  at = tracked[0]!
  if (merged) return { outcome: "merged", kind: ref.kind, index: at, key: keys[0]!, absorbed: [...absorbed], withOtherBody: otherBody }
  const moved = movedFar(current, ref.kind, at, ref.hint)
  return { outcome: "exact", kind: ref.kind, index: at, key: keys[0]!, ordinal: topologyKeys(current).ordinal.has(keys[0]!), ...(moved !== undefined ? { moved } : {}) }
}

// ------------------------------------------------------------------ health

export interface NamingHealth {
  readonly faces: number
  readonly edges: number
  readonly vertices: number
  /** Faces with no name: references to them (and to their edges and vertices) cannot be made. */
  readonly unnamedFaces: number
  /** Entities whose key needs a position ordinal: stable only while the geometry is. */
  readonly ordinalKeys: number
  readonly unkeyedEdges: number
  readonly unkeyedVertices: number
  readonly duplicateKeys: number
  /** True when every entity has a key and no key is ordinal. */
  readonly stable: boolean
}

export const namingHealth = (b: Brep): NamingHealth => {
  const k = topologyKeys(b)
  const dup = (a: ReadonlyArray<string>) => a.length - new Set(a.filter((x) => x !== "")).size - a.filter((x) => x === "").length
  const unkeyedEdges = k.edges.filter((x) => x === "").length, unkeyedVertices = k.vertices.filter((x) => x === "").length
  const ordinalKeys = [...k.faces, ...k.edges, ...k.vertices].filter((x) => k.ordinal.has(x)).length
  return {
    faces: b.faces.length, edges: b.edges.length, vertices: b.vertices.length,
    unnamedFaces: k.unnamedFaces.length, ordinalKeys, unkeyedEdges, unkeyedVertices,
    duplicateKeys: dup(k.faces) + dup(k.edges) + dup(k.vertices),
    stable: k.unnamedFaces.length === 0 && ordinalKeys === 0 && unkeyedEdges === 0 && unkeyedVertices === 0
  }
}
