/**
 * B-rep checker (SMLib's AssertValid / is_manifold_solid): topology indices, vertex-on-curve, loop continuity,
 * two-manifold edge use with opposite senses, edges lying on the surfaces of their faces, Euler–Poincaré, and the
 * orientation of closed shells (positive volume). Every issue is reported with the entity it concerns; nothing is
 * repaired here.
 */
import { dist3 } from "./math.ts"
import { curvePoint, surfaceDistance } from "./geom.ts"
import { coedgeEndVertex, coedgeStartVertex, type Brep } from "./topology.ts"
import { massProperties } from "./mass.ts"
import { tessellateBrep } from "./tessellate.ts"

/** Signed volume of a coarse watertight tessellation (divergence theorem over its triangles). */
const coarseVolume = (b: Brep): { readonly volume: number; readonly empty: ReadonlyArray<number> } => {
  const t = tessellateBrep(b, { chordTol: 0.05, angleTolDeg: 30 })
  // A face with a boundary that gives no triangle at all drops its share of the volume without any other sign.
  const meshed = new Set(t.faces.filter((f) => f.indices.length > 0).map((f) => f.face))
  const empty = b.faces.map((f, i) => (f.loops.length > 0 && !meshed.has(i) ? i : -1)).filter((i) => i >= 0)
  const p = t.positions, ix = t.indices
  let v = 0
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i]! * 3, c = ix[i + 1]! * 3, d = ix[i + 2]! * 3
    v += p[a]! * (p[c + 1]! * p[d + 2]! - p[c + 2]! * p[d + 1]!) - p[a + 1]! * (p[c]! * p[d + 2]! - p[c + 2]! * p[d]!) + p[a + 2]! * (p[c]! * p[d + 1]! - p[c + 1]! * p[d]!)
  }
  return { volume: v / 6, empty }
}

export interface BrepIssue {
  readonly kind:
    | "index"
    | "vertex-off-curve"
    | "loop-open"
    | "edge-open"
    | "edge-nonmanifold"
    | "edge-same-sense"
    | "edge-off-surface"
    | "euler"
    | "orientation"
    | "face-empty"
  readonly message: string
  readonly face?: number
  readonly edge?: number
  readonly vertex?: number
}

export interface BrepReport {
  readonly valid: boolean
  readonly issues: ReadonlyArray<BrepIssue>
  /** True when every shell is closed and every edge is used exactly twice with opposite senses. */
  readonly manifoldSolid: boolean
  /** Genus from Euler–Poincaré (number of through-holes) when the counts allow it. */
  readonly genus: number | undefined
  readonly volume: number | undefined
  /** The largest vertex or edge tolerance of the body, mm: how loose the geometry is allowed to be (spec 42 R6). */
  readonly maxTolerance?: number
}

export interface ValidateOptions {
  /** Distance tolerance for geometric checks, mm (default 1e-5 × model size, at least 1e-6). */
  readonly tol?: number
  /** Skip the (more expensive) volume/orientation check. */
  readonly skipVolume?: boolean
  /**
   * Check the orientation on a coarse tessellation's volume instead of the exact one: the sign is all the check needs, and
   * the Boolean validates every result it returns (exact quadrature there was a large share of a blend sequence's time).
   */
  readonly coarseVolume?: boolean
}

export const validateBrep = (b: Brep, options: ValidateOptions = {}): BrepReport => {
  const issues: BrepIssue[] = []
  let size = 0
  for (const v of b.vertices) size = Math.max(size, Math.abs(v.point.x), Math.abs(v.point.y), Math.abs(v.point.z))
  const tol = options.tol ?? Math.max(1e-6, 1e-7 * (1 + size) * 10)
  // Indices.
  b.edges.forEach((e, ei) => {
    if (b.vertices[e.v0] === undefined || b.vertices[e.v1] === undefined) issues.push({ kind: "index", edge: ei, message: `edge ${ei} references a missing vertex` })
    if (!(e.t1 > e.t0)) issues.push({ kind: "index", edge: ei, message: `edge ${ei} has an empty range` })
  })
  b.faces.forEach((f, fi) => f.loops.forEach((l) => l.coedges.forEach((c) => { if (b.edges[c.edge] === undefined) issues.push({ kind: "index", face: fi, message: `face ${fi} uses missing edge ${c.edge}` }) })))
  b.shells.forEach((s, si) => s.faces.forEach((fi) => { if (b.faces[fi] === undefined) issues.push({ kind: "index", message: `shell ${si} references missing face ${fi}` }) }))
  if (issues.length > 0) return { valid: false, issues, manifoldSolid: false, genus: undefined, volume: undefined }
  // Vertices on their edges' curves.
  b.edges.forEach((e, ei) => {
    const d0 = dist3(curvePoint(e.curve, e.t0), b.vertices[e.v0]!.point)
    const d1 = dist3(curvePoint(e.curve, e.t1), b.vertices[e.v1]!.point)
    const lim = tol + e.tol + Math.max(b.vertices[e.v0]!.tol, b.vertices[e.v1]!.tol)
    if (d0 > lim) issues.push({ kind: "vertex-off-curve", edge: ei, vertex: e.v0, message: `edge ${ei} starts ${d0.toExponential(2)} mm from vertex ${e.v0}` })
    if (d1 > lim) issues.push({ kind: "vertex-off-curve", edge: ei, vertex: e.v1, message: `edge ${ei} ends ${d1.toExponential(2)} mm from vertex ${e.v1}` })
  })
  // Loop continuity.
  b.faces.forEach((f, fi) =>
    f.loops.forEach((l, li) => {
      for (let i = 0; i < l.coedges.length; i++) {
        const a = coedgeEndVertex(b, l.coedges[i]!)
        const c = coedgeStartVertex(b, l.coedges[(i + 1) % l.coedges.length]!)
        if (a !== c) issues.push({ kind: "loop-open", face: fi, message: `face ${fi} loop ${li} breaks after coedge ${i} (vertex ${a} ≠ ${c})` })
      }
    })
  )
  // Edge use per shell.
  let manifold = true
  for (const s of b.shells) {
    const uses = new Map<number, boolean[]>()
    for (const fi of s.faces) for (const l of b.faces[fi]!.loops) for (const c of l.coedges) {
      const u = uses.get(c.edge) ?? []
      u.push(c.reversed)
      uses.set(c.edge, u)
    }
    for (const [ei, u] of uses) {
      if (u.length === 1) {
        if (s.closed) issues.push({ kind: "edge-open", edge: ei, message: `edge ${ei} is used by one face only` })
        manifold = false
      } else if (u.length > 2) {
        issues.push({ kind: "edge-nonmanifold", edge: ei, message: `edge ${ei} is used ${u.length} times` })
        manifold = false
      } else if (u[0] === u[1]) {
        issues.push({ kind: "edge-same-sense", edge: ei, message: `edge ${ei} is used twice in the same direction (faces not consistently oriented)` })
        manifold = false
      }
    }
    if (!s.closed) manifold = false
  }
  // Edges on their faces' surfaces.
  b.faces.forEach((f, fi) => {
    const seen = new Set<number>()
    for (const l of f.loops) for (const c of l.coedges) {
      if (seen.has(c.edge)) continue
      seen.add(c.edge)
      const e = b.edges[c.edge]!
      let worst = 0
      for (let k = 0; k <= 4; k++) worst = Math.max(worst, surfaceDistance(f.surface, curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 4)))
      if (worst > tol + e.tol) issues.push({ kind: "edge-off-surface", face: fi, edge: c.edge, message: `edge ${c.edge} lies ${worst.toExponential(2)} mm off the surface of face ${fi}` })
    }
  })
  // Euler–Poincaré: V − E + F − (L − F) = 2 (S − G).
  const usedV = new Set<number>()
  for (const e of b.edges) { usedV.add(e.v0); usedV.add(e.v1) }
  const V = usedV.size, E = b.edges.length, F = b.faces.length
  const L = b.faces.reduce((s, f) => s + f.loops.length, 0)
  const S = b.shells.length
  const chi = V - E + F - (L - F)
  let genus: number | undefined
  if (manifold) {
    const g2 = 2 * S - chi
    if (g2 % 2 !== 0 || g2 < 0) issues.push({ kind: "euler", message: `Euler–Poincaré fails: V−E+F−(L−F) = ${chi} with ${S} shell(s)` })
    else genus = g2 / 2
  }
  let volume: number | undefined
  if (manifold && options.skipVolume !== true && issues.length === 0) {
    if (options.coarseVolume === true) {
      const c = coarseVolume(b)
      volume = c.volume
      for (const fi of c.empty) issues.push({ kind: "face-empty", face: fi, message: `face ${fi} gives no triangle: its boundary cannot be triangulated, so the solid's volume is incomplete` })
    } else volume = massProperties(b).volume
    if (!(volume > 0)) issues.push({ kind: "orientation", message: `closed shell encloses a non-positive volume (${volume}); faces point inwards` })
  }
  let maxTolerance = 0
  for (const v of b.vertices) maxTolerance = Math.max(maxTolerance, v.tol)
  for (const e of b.edges) maxTolerance = Math.max(maxTolerance, e.tol)
  return { valid: issues.length === 0, issues, manifoldSolid: manifold && issues.length === 0, genus, volume, maxTolerance }
}
