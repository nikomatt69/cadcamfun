/**
 * The exact solid as the drawing generator sees it (`drawing/project.ts`: "an exact B-rep kernel replaces `edgesOf` and
 * nothing after it changes"). Structurally the same `Edge3` records, without importing the drawing module:
 *
 *   B-rep edges   sampled on their exact curves (within the chord tolerance), with the outward normals of their two faces
 *                 at each segment. A feature edge between faces that meet at an angle is a `crease` (always drawn, however
 *                 shallow the angle: on a drawing a 5-degree bend is still an edge). An edge between tangent faces (a
 *                 fillet's boundary) or a seam is `smooth`: drawn only where it is a silhouette.
 *   face interiors  the inner edges of each curved face's triangulation, `smooth`, so cylinders, cones, spheres and
 *                 freeform faces show their silhouettes.
 *
 * `mesh` is the watertight tessellation the hidden-line pass occludes against.
 */
import { cross3, dot3, length3, normalize3, sub3, type Vec3 } from "./math.ts"
import { curvePoint, surfaceNormal, surfaceProject } from "./geom.ts"
import { edgeUses, type Brep } from "./topology.ts"
import { tessellateBrep, type TessellateOptions } from "./tessellate.ts"

export interface DrawingEdge {
  readonly a: Vec3
  readonly b: Vec3
  readonly n1: Vec3
  readonly n2: Vec3 | undefined
  readonly kind: "crease" | "boundary" | "smooth"
  /** The B-rep edge this segment belongs to (undefined for a face-interior silhouette candidate). */
  readonly edge?: number
  /** Kind of the edge's exact curve: a drawing dimensions a `circle` by its radius, a `line` by its length. */
  readonly curve?: "line" | "circle" | "ellipse" | "nurbs"
}

export interface DrawingInput {
  readonly mesh: { readonly positions: Float32Array; readonly indices: Uint32Array }
  readonly edges: ReadonlyArray<DrawingEdge>
}

export interface DrawingEdgeOptions extends TessellateOptions {
  /** Faces meeting within this angle are tangent: their common edge is not a drawn feature (degrees, default 1). */
  readonly tangentDegrees?: number
}

export const drawingEdges = (b: Brep, options: DrawingEdgeOptions = {}): DrawingInput => {
  const t = tessellateBrep(b, options)
  const P = (g: number): Vec3 => ({ x: t.positions[g * 3]!, y: t.positions[g * 3 + 1]!, z: t.positions[g * 3 + 2]! })
  const cosTangent = Math.cos(((options.tangentDegrees ?? 1) * Math.PI) / 180)
  const uses = edgeUses(b)
  const outward = (fi: number, p: Vec3): Vec3 => {
    const f = b.faces[fi]!
    const q = surfaceProject(f.surface, p)
    const n = surfaceNormal(f.surface, q.u, q.v)
    return f.reversed ? { x: -n.x, y: -n.y, z: -n.z } : n
  }
  const out: DrawingEdge[] = []
  // B-rep edges.
  t.edges.forEach((poly, ei) => {
    const e = b.edges[ei]!
    const faces = uses[ei]!.map((u) => u.face)
    const seam = faces.length === 2 && faces[0] === faces[1]
    for (let k = 0; k + 1 < poly.points.length; k++) {
      const a = P(poly.points[k]!), c = P(poly.points[k + 1]!)
      const mid = curvePoint(e.curve, (poly.params[k]! + poly.params[k + 1]!) / 2)
      const n1 = faces.length > 0 ? outward(faces[0]!, mid) : { x: 0, y: 0, z: 1 }
      if (faces.length < 2) { out.push({ a, b: c, n1, n2: undefined, kind: "boundary", edge: ei, curve: e.curve.kind }); continue }
      const n2 = outward(faces[1]!, mid)
      const kind = seam || dot3(n1, n2) >= cosTangent ? "smooth" : "crease"
      out.push({ a, b: c, n1, n2, kind, edge: ei, curve: e.curve.kind })
    }
  })
  // Inner edges of curved faces: silhouette candidates with the triangles' own normals.
  for (const fm of t.faces) {
    if (b.faces[fm.face]!.surface.kind === "plane") continue
    const owners = new Map<string, Vec3[]>()
    for (let i = 0; i < fm.indices.length; i += 3) {
      const ids = [fm.indices[i]!, fm.indices[i + 1]!, fm.indices[i + 2]!]
      const g = ids.map((k) => fm.global[k]!)
      const n = normalize3(cross3(sub3(P(g[1]!), P(g[0]!)), sub3(P(g[2]!), P(g[0]!))))
      if (length3(n) === 0) continue
      for (let k = 0; k < 3; k++) {
        const x = g[k]!, y = g[(k + 1) % 3]!
        const key = x < y ? `${x}_${y}` : `${y}_${x}`
        const l = owners.get(key) ?? []
        l.push(n)
        owners.set(key, l)
      }
    }
    for (const [key, ns] of owners) {
      if (ns.length !== 2) continue // boundary of the face: a B-rep edge, already drawn above
      const [x, y] = key.split("_").map(Number) as [number, number]
      out.push({ a: P(x), b: P(y), n1: ns[0]!, n2: ns[1]!, kind: "smooth" })
    }
  }
  return { mesh: { positions: Float32Array.from(t.positions), indices: t.indices }, edges: out }
}
