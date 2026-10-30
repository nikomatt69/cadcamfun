/**
 * Provenance of B-rep faces, edges and vertices (spec 41 N1).
 *
 * Every operation that derives a Brep from others records, next to the result, which operand face each result face came
 * from and how (`same`, `trimmed`, `split`, `merged`, `offset`, `blend`, ...). The record is a side table keyed by the
 * result object (`WeakMap`), so no operation changes its return type and a chain of operations (a blend is a few dozen
 * Booleans and transforms) composes by itself: `provenanceOf(result, operands)` walks the links from the result back to
 * the operands the caller names and composes the face maps on the way.
 *
 *   - a Brep that is one of the named operands maps every face to itself (`same`);
 *   - a Brep with a recorded link is composed through its sources;
 *   - a Brep nothing recorded (a primitive, an extrusion, a tool made for a Boolean) has no operand ancestor: its faces
 *     are `new`.
 *
 * Operations that derive a Brep from another one WITHOUT recording a link would make the second rule a lie, so every
 * such operation of the kernel records one (`transformBrep`, `mergeBreps`, `compactBrep`, `booleanBrep`, `uniqueFaceNames`
 * and, through them, blend / shell / draft / push-pull / hole / boss edits). The table is not serialised: it lives with
 * the objects of one process (a worker boundary or a JSON round trip drops it, and the result is then `new` for every
 * face).
 */
import { dist3, type Vec3 } from "./math.ts"
import { edgeUses, type Brep } from "./topology.ts"
import { recordDerivation, STEPS, type FaceOrigin, type FaceRelation } from "./lineage-record.ts"

export { hasDerivation, recordDerivation, recordRelabel } from "./lineage-record.ts"
export type { FaceOrigin, FaceRelation } from "./lineage-record.ts"

export interface FaceLineage {
  /** The operand faces this face descends from; empty when the face is new. */
  readonly from: ReadonlyArray<FaceOrigin>
  readonly isNew: boolean
}

export interface Provenance {
  readonly operands: number
  /** One entry per face of the result. */
  readonly faces: ReadonlyArray<FaceLineage>
  /** Per operand, the faces with no descendant in the result. */
  readonly deleted: ReadonlyArray<ReadonlyArray<number>>
  /** Per operand, the faces with more than one descendant (their pieces sum to the operand face). */
  readonly split: ReadonlyArray<ReadonlyArray<{ readonly face: number; readonly into: ReadonlyArray<number> }>>
}

// ------------------------------------------------------------------ composition

const RANK: Record<FaceRelation, number> = { same: 0, reversed: 1, offset: 2, trimmed: 3, blend: 4, merged: 5, split: 6, new: 7 }

const strongest = (a: FaceRelation, b: FaceRelation): FaceRelation => (RANK[a] >= RANK[b] ? a : b)

type Table = ReadonlyArray<ReadonlyArray<FaceOrigin>>

/** The faces of `b` expressed in the faces of `operands` (memoised per call). */
const trace = (b: Brep, operands: ReadonlyArray<Brep>, memo: Map<Brep, Table>): Table => {
  const done = memo.get(b)
  if (done !== undefined) return done
  let out: Table
  const at = operands.indexOf(b)
  if (at >= 0) out = b.faces.map((_, i) => [{ operand: at, face: i, relation: "same" as const }])
  else {
    const step = STEPS.get(b)
    if (step === undefined) out = b.faces.map(() => [])
    else {
      const parents = step.sources.map((s) => trace(s, operands, memo))
      out = step.faces.map((from) => {
        const acc = new Map<string, FaceOrigin>()
        for (const o of from) {
          if (o.relation === "new") continue
          // A step own split or merged is not carried: those are decided on the composed table (a split undone later is a trim).
          const own: FaceRelation = o.relation === "split" || o.relation === "merged" ? "trimmed" : o.relation
          for (const p of parents[o.operand]?.[o.face] ?? []) {
            const relation = strongest(own, p.relation)
            const flipped = (o.flipped === true) !== (p.flipped === true)
            const key = `${p.operand}:${p.face}`
            const prev = acc.get(key)
            const merged: FaceOrigin = { operand: p.operand, face: p.face, relation: prev === undefined ? relation : strongest(prev.relation, relation), ...(flipped ? { flipped: true as const } : {}) }
            acc.set(key, merged)
          }
        }
        return [...acc.values()]
      })
    }
  }
  memo.set(b, out)
  return out
}

/**
 * Where each face of `result` came from, in the faces of `operands` (spec 41 §3.2). `split` and `merged` are decided on the
 * composed table: an operand face with several descendants is `split` in each, a result face with several ancestors is
 * `merged` from each.
 */
export const provenanceOf = (result: Brep, operands: ReadonlyArray<Brep>): Provenance => {
  const table = trace(result, operands, new Map())
  const kids = operands.map(() => new Map<number, number[]>())
  table.forEach((from, r) => { for (const o of from) { const m = kids[o.operand]!; const l = m.get(o.face) ?? []; l.push(r); m.set(o.face, l) } })
  const faces: FaceLineage[] = table.map((from) => {
    const many = from.length > 1
    const list = from.map((o): FaceOrigin => {
      let relation = o.relation
      if (many) relation = "merged"
      else if ((kids[o.operand]!.get(o.face)?.length ?? 0) > 1) relation = "split"
      return relation === o.relation ? o : { ...o, relation }
    })
    return { from: list, isNew: list.length === 0 }
  })
  const deleted = operands.map((b, k) => b.faces.map((_, i) => i).filter((i) => !kids[k]!.has(i)))
  const split = operands.map((_, k) => [...kids[k]!].filter(([, into]) => into.length > 1).map(([face, into]) => ({ face, into })))
  return { operands: operands.length, faces, deleted, split }
}

// ------------------------------------------------------------------ edges and vertices

export interface EntityLineage {
  /** Operand edges (or vertices) the result entity lies on; empty when the entity is new (an intersection curve, a corner). */
  readonly from: ReadonlyArray<{ readonly operand: number; readonly index: number }>
  readonly isNew: boolean
}

/**
 * Edge lineage derived from the face lineage: a result edge between faces F and G descends from the operand edges that
 * separate an ancestor of F from an ancestor of G in the same operand (a seam edge, whose two uses are one face, from the
 * edges of that face's ancestors used twice). An edge no operand edge explains is new (the curve where two operand
 * surfaces met).
 */
export const edgeLineage = (result: Brep, operands: ReadonlyArray<Brep>, p: Provenance): ReadonlyArray<EntityLineage> => {
  const ruse = edgeUses(result)
  const ouse = operands.map((o) => edgeUses(o))
  return result.edges.map((_, ei): EntityLineage => {
    const faces = [...new Set(ruse[ei]!.map((u) => u.face))]
    const from: Array<{ operand: number; index: number }> = []
    for (let k = 0; k < operands.length; k++) {
      const anc = faces.map((f) => new Set(p.faces[f]!.from.filter((o) => o.operand === k).map((o) => o.face)))
      if (anc.some((s) => s.size === 0)) continue
      const first = anc[0]!, second = anc[1] ?? anc[0]!
      operands[k]!.edges.forEach((_, oe) => {
        const fs = ouse[k]![oe]!.map((u) => u.face)
        if (fs.length === 0) return
        const a = fs[0]!, b = fs[1] ?? fs[0]!
        if ((first.has(a) && second.has(b)) || (first.has(b) && second.has(a))) from.push({ operand: k, index: oe })
      })
    }
    return { from, isNew: from.length === 0 }
  })
}

/** Vertex lineage: a result vertex that coincides (within the tolerances) with an operand vertex is that vertex; others are new. */
export const vertexLineage = (result: Brep, operands: ReadonlyArray<Brep>): ReadonlyArray<EntityLineage> => {
  const h = 1e-5
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  const grid = new Map<string, Array<{ operand: number; index: number; tol: number; point: Vec3 }>>()
  operands.forEach((o, k) => o.vertices.forEach((w, i) => {
    const kk = key(Math.floor(w.point.x / h), Math.floor(w.point.y / h), Math.floor(w.point.z / h))
    const l = grid.get(kk) ?? []
    l.push({ operand: k, index: i, tol: w.tol, point: w.point })
    grid.set(kk, l)
  }))
  return result.vertices.map((v): EntityLineage => {
    const from: Array<{ operand: number; index: number }> = []
    const cx = Math.floor(v.point.x / h), cy = Math.floor(v.point.y / h), cz = Math.floor(v.point.z / h)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
      for (const w of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) if (dist3(v.point, w.point) <= Math.max(v.tol, w.tol, 1e-9) * 10) from.push({ operand: w.operand, index: w.index })
    return { from, isNew: from.length === 0 }
  })
}
