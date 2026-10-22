/**
 * Unique, stable face names (persistent naming). The features name the faces they make (`<feature>.top`, `<feature>.side0.1`);
 * a pattern copies a tool and a blend makes many faces from one rule, so several faces of a body can share a name. A name that
 * is used once is left alone. Faces that share one are told apart, in this order, by
 *
 *   1. the names of the faces around them (`blend.side0.2@plate.top+bore.side0.0`): a topological key, it does not change when
 *      a dimension does;
 *   2. where they are (`bore.side0.0#2`, the faces ordered by the centre of their edges): stable while the geometry is.
 *
 * Unnamed faces stay unnamed. The result is a Brep whose face names are pairwise distinct for every named face.
 */
import type { Vec3 } from "./math.ts"
import { adjacentFaces, edgePointAt, type Brep } from "./topology.ts"

const centre = (b: Brep, fi: number): Vec3 => {
  let x = 0, y = 0, z = 0, n = 0
  for (const l of b.faces[fi]!.loops) for (const c of l.coedges) {
    const e = b.edges[c.edge]!
    const p = edgePointAt(e, 0.5)
    x += p.x; y += p.y; z += p.z; n++
  }
  return n === 0 ? { x: 0, y: 0, z: 0 } : { x: x / n, y: y / n, z: z / n }
}

/** The centre of a face: the mean of its edge midpoints (a point on the face, for a selection or a report). */
export const faceCentre = (b: Brep, fi: number): Vec3 => centre(b, fi)

export const uniqueFaceNames = (b: Brep): Brep => {
  const groups = new Map<string, number[]>()
  b.faces.forEach((f, i) => { if (f.name !== undefined) groups.set(f.name, [...(groups.get(f.name) ?? []), i]) })
  if ([...groups.values()].every((g) => g.length === 1)) return b
  const names = b.faces.map((f) => f.name)
  for (const [name, members] of groups) {
    if (members.length === 1) continue
    // 1. by the neighbours' names
    const keys = members.map((fi) => [...new Set(adjacentFaces(b, fi).map((n) => b.faces[n]!.name ?? "?"))].sort().join("+"))
    if (new Set(keys).size === members.length) { members.forEach((fi, k) => { names[fi] = `${name}@${keys[k]}` }); continue }
    // 2. by position: the faces ordered by the centre of their edges, quantised so rounding noise does not reorder them.
    const q = (v: number) => Math.round(v * 1e5)
    const order = members
      .map((fi) => ({ fi, c: centre(b, fi), key: keys[members.indexOf(fi)]! }))
      .sort((p, r) => p.key.localeCompare(r.key) || q(p.c.x) - q(r.c.x) || q(p.c.y) - q(r.c.y) || q(p.c.z) - q(r.c.z))
    order.forEach((o, k) => { names[o.fi] = `${name}#${k}` })
  }
  return { ...b, faces: b.faces.map((f, i) => (names[i] === f.name ? f : { ...f, name: names[i]! })) }
}

/** Index of the face called `name`, or undefined (names are unique after `uniqueFaceNames`). */
export const faceByName = (b: Brep, name: string): number | undefined => {
  const i = b.faces.findIndex((f) => f.name === name)
  return i < 0 ? undefined : i
}

export interface FaceMatch {
  /** Face of the old body. */
  readonly from: number
  /** Face of the new body, or undefined when nothing in it corresponds. */
  readonly to: number | undefined
  /** `name`: the same name. `neighbours`: renamed, found by surface kind and the faces around it. `position`: nearest same-kind face. */
  readonly by: "name" | "neighbours" | "position" | "none"
}

const kindOf = (b: Brep, fi: number): string => b.faces[fi]!.surface.kind

/**
 * Where the faces of a body went after it was rebuilt (an upstream edit, a renamed feature): a selection stored as a name or
 * an index follows the body. A face keeps its name when the new body has it; otherwise it is found by surface kind and the
 * names of the faces around it, and last by the nearest face of the same kind. Each new face is taken once.
 */
export const matchFaces = (before: Brep, after: Brep): ReadonlyArray<FaceMatch> => {
  const taken = new Set<number>()
  const out: FaceMatch[] = before.faces.map((_, from) => ({ from, to: undefined, by: "none" as const }))
  const nbr = (b: Brep, fi: number) => [...new Set(adjacentFaces(b, fi).map((n) => b.faces[n]!.name ?? "?"))].sort().join("+")
  const result: FaceMatch[] = out.map((m) => {
    const name = before.faces[m.from]!.name
    const to = name === undefined ? undefined : faceByName(after, name)
    if (to === undefined || taken.has(to)) return m
    taken.add(to)
    return { from: m.from, to, by: "name" as const }
  })
  const centres = before.faces.map((_, i) => centre(before, i)), centresAfter = after.faces.map((_, i) => centre(after, i))
  const dist = (a: Vec3, c: Vec3) => Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z)
  for (const pass of ["neighbours", "position"] as const) {
    for (const m of result) {
      if (m.to !== undefined) continue
      const kind = kindOf(before, m.from)
      const cands = after.faces.map((_, j) => j).filter((j) => !taken.has(j) && kindOf(after, j) === kind)
      const pool = pass === "neighbours" ? cands.filter((j) => nbr(after, j) === nbr(before, m.from)) : cands
      if (pool.length === 0) continue
      const best = pool.reduce((p, j) => (dist(centresAfter[j]!, centres[m.from]!) < dist(centresAfter[p]!, centres[m.from]!) ? j : p))
      taken.add(best)
      result[m.from] = { from: m.from, to: best, by: pass }
    }
  }
  return result
}
