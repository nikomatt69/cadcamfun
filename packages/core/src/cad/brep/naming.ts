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
