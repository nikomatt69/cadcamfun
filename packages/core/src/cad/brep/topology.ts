/**
 * Boundary-representation topology, modelled on SMLib's SmBrep / SmShell / SmFace / SmLoop / SmEdgeuse / SmEdge /
 * SmVertex (and STEP's ADVANCED_FACE / EDGE_LOOP / ORIENTED_EDGE / EDGE_CURVE / VERTEX_POINT).
 *
 * The model is a set of plain index tables, so a Brep serialises to JSON, crosses a worker boundary and diffs in the
 * project history unchanged:
 *
 *   Vertex   a point and its tolerance.
 *   Edge     a bounded piece [t0, t1] (t0 < t1) of an exact 3D curve from vertex v0 = C(t0) to v1 = C(t1).
 *   Coedge   one use of an edge by a face loop, with its sense and an optional p-curve in the face's (u, v) domain
 *            (SMLib's edge-use, STEP's ORIENTED_EDGE + PCURVE).
 *   Loop     a closed cycle of coedges; the face's material lies on the LEFT of every loop when seen from the face's
 *            outward normal (outer loops counter-clockwise, holes clockwise).
 *   Face     a region of an exact surface; `reversed` says the outward normal is −(S_u × S_v).
 *   Shell    a connected set of faces; a closed shell bounds a volume.
 *
 * Seams (an edge used twice by the same face, e.g. the generator line of a full cylinder) and poles (a loop that
 * passes through a degenerate point of the surface, e.g. a cone apex) need no special entities.
 */
import { applyPoint, compose, IDENTITY, MODEL_TOL, near3, type Transform, type Vec3 } from "./math.ts"
import { curvePoint, transformCurve, transformSurface, type Curve2, type Curve3, type Surface } from "./geom.ts"

export interface Vertex {
  readonly point: Vec3
  readonly tol: number
}

export interface Edge {
  readonly curve: Curve3
  readonly t0: number
  readonly t1: number
  readonly v0: number
  readonly v1: number
  readonly tol: number
}

export interface Coedge {
  readonly edge: number
  /** True when the loop runs from the edge's v1 to v0. */
  readonly reversed: boolean
  readonly pcurve?: Curve2
}

export interface Loop {
  readonly coedges: ReadonlyArray<Coedge>
}

export interface Face {
  readonly surface: Surface
  readonly reversed: boolean
  /** Outer loop first when known; the tessellator does not rely on it. */
  readonly loops: ReadonlyArray<Loop>
  /** Optional name of the feature/face (persistent naming for the history, colours, CAM selections). */
  readonly name?: string
}

export interface Shell {
  readonly faces: ReadonlyArray<number>
  readonly closed: boolean
}

export interface Brep {
  readonly vertices: ReadonlyArray<Vertex>
  readonly edges: ReadonlyArray<Edge>
  readonly faces: ReadonlyArray<Face>
  readonly shells: ReadonlyArray<Shell>
}

export const EMPTY_BREP: Brep = { vertices: [], edges: [], faces: [], shells: [] }

// ---------------------------------------------------------------- accessors

export const coedgeStartVertex = (b: Brep, c: Coedge): number => {
  const e = b.edges[c.edge]!
  return c.reversed ? e.v1 : e.v0
}
export const coedgeEndVertex = (b: Brep, c: Coedge): number => {
  const e = b.edges[c.edge]!
  return c.reversed ? e.v0 : e.v1
}

/** Point of the edge at the fraction `f` ∈ [0, 1] of its parameter range. */
export const edgePointAt = (e: Edge, f: number): Vec3 => curvePoint(e.curve, e.t0 + (e.t1 - e.t0) * f)

/** True when the edge closes on itself (v0 = v1 and a non-trivial range, e.g. a full circle). */
export const isClosedEdge = (e: Edge): boolean => e.v0 === e.v1

export interface EdgeUse {
  readonly face: number
  readonly loop: number
  readonly index: number
  readonly reversed: boolean
}

/** For each edge, the coedges that use it. */
export const edgeUses = (b: Brep): ReadonlyArray<ReadonlyArray<EdgeUse>> => {
  const uses: EdgeUse[][] = b.edges.map(() => [])
  b.faces.forEach((f, fi) =>
    f.loops.forEach((l, li) => l.coedges.forEach((c, ci) => uses[c.edge]?.push({ face: fi, loop: li, index: ci, reversed: c.reversed })))
  )
  return uses
}

/** Faces sharing an edge with face `fi`. */
export const adjacentFaces = (b: Brep, fi: number): ReadonlyArray<number> => {
  const uses = edgeUses(b)
  const out = new Set<number>()
  for (const l of b.faces[fi]!.loops) for (const c of l.coedges) for (const u of uses[c.edge]!) if (u.face !== fi) out.add(u.face)
  return [...out]
}

// ---------------------------------------------------------------- builder

/** Incremental construction with vertex welding (by tolerance) and a closing shell. */
export class BrepBuilder {
  readonly vertices: Vertex[] = []
  readonly edges: Edge[] = []
  readonly faces: Face[] = []

  constructor(readonly tol: number = MODEL_TOL) {}

  /** Index of a vertex at `p`, reusing one within tolerance. */
  vertex(p: Vec3): number {
    for (let i = 0; i < this.vertices.length; i++) if (near3(this.vertices[i]!.point, p, this.tol)) return i
    this.vertices.push({ point: p, tol: this.tol })
    return this.vertices.length - 1
  }

  /** Always a new vertex (for coincident but distinct topology). */
  newVertex(p: Vec3): number {
    this.vertices.push({ point: p, tol: this.tol })
    return this.vertices.length - 1
  }

  edge(curve: Curve3, t0: number, t1: number, v0?: number, v1?: number): number {
    if (!(t1 > t0)) throw new RangeError(`edge range must increase (${t0} .. ${t1})`)
    const a = v0 ?? this.vertex(curvePoint(curve, t0))
    const b = v1 ?? this.vertex(curvePoint(curve, t1))
    this.edges.push({ curve, t0, t1, v0: a, v1: b, tol: this.tol })
    return this.edges.length - 1
  }

  /** Adds a face; each loop is a list of `[edge, reversed]` or full coedges. */
  face(surface: Surface, reversed: boolean, loops: ReadonlyArray<ReadonlyArray<Coedge | readonly [number, boolean]>>, name?: string): number {
    const ls: Loop[] = loops.map((l) => ({ coedges: l.map((c) => (Array.isArray(c) ? { edge: c[0] as number, reversed: c[1] as boolean } : (c as Coedge))) }))
    this.faces.push(name === undefined ? { surface, reversed, loops: ls } : { surface, reversed, loops: ls, name })
    return this.faces.length - 1
  }

  /** One closed shell with every face. */
  build(closed = true): Brep {
    return { vertices: [...this.vertices], edges: [...this.edges], faces: [...this.faces], shells: [{ faces: this.faces.map((_, i) => i), closed }] }
  }
}

// ---------------------------------------------------------------- transforms

const det = (m: Transform["m"]): number =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])

/**
 * The Brep moved by a similarity transform. A reflection (negative determinant) turns every face inside out, so faces
 * toggle `reversed` and loops run backwards to keep the material on their left.
 */
export const transformBrep = (b: Brep, tr: Transform): Brep => {
  const mirror = det(tr.m) < 0
  const vertices = b.vertices.map((v) => ({ point: applyPoint(tr, v.point), tol: v.tol }))
  const edges = b.edges.map((e) => ({ ...e, curve: transformCurve(e.curve, tr) }))
  const faces = b.faces.map((f): Face => {
    const surface = transformSurface(f.surface, tr)
    const loops = mirror
      ? f.loops.map((l) => ({ coedges: [...l.coedges].reverse().map((c) => ({ edge: c.edge, reversed: !c.reversed })) }))
      : f.loops.map((l) => ({ coedges: l.coedges.map((c) => ({ edge: c.edge, reversed: c.reversed })) }))
    return f.name === undefined ? { surface, reversed: mirror ? !f.reversed : f.reversed, loops } : { surface, reversed: mirror ? !f.reversed : f.reversed, loops, name: f.name }
  })
  return { vertices, edges, faces, shells: b.shells }
}

/** Several breps as one (shells side by side, indices renumbered). No Boolean is done. */
export const mergeBreps = (parts: ReadonlyArray<Brep>): Brep => {
  const vertices: Vertex[] = [], edges: Edge[] = [], faces: Face[] = [], shells: Shell[] = []
  for (const b of parts) {
    const vo = vertices.length, eo = edges.length, fo = faces.length
    vertices.push(...b.vertices)
    edges.push(...b.edges.map((e) => ({ ...e, v0: e.v0 + vo, v1: e.v1 + vo })))
    faces.push(...b.faces.map((f) => ({ ...f, loops: f.loops.map((l) => ({ coedges: l.coedges.map((c) => ({ ...c, edge: c.edge + eo })) })) })))
    shells.push(...b.shells.map((s) => ({ closed: s.closed, faces: s.faces.map((x) => x + fo) })))
  }
  return { vertices, edges, faces, shells }
}

/** Removes vertices and edges no face uses and renumbers (after Boolean surgery). */
export const compactBrep = (b: Brep): Brep => {
  const usedE = new Map<number, number>()
  const usedV = new Map<number, number>()
  const edges: Edge[] = []
  const vertices: Vertex[] = []
  const mapV = (v: number): number => {
    let n = usedV.get(v)
    if (n === undefined) { n = vertices.length; vertices.push(b.vertices[v]!); usedV.set(v, n) }
    return n
  }
  const faceOrder = b.shells.flatMap((s) => s.faces)
  const faceMap = new Map<number, number>()
  const faces: Face[] = []
  for (const fi of faceOrder) {
    if (faceMap.has(fi)) continue
    const f = b.faces[fi]!
    const loops = f.loops.map((l) => ({
      coedges: l.coedges.map((c) => {
        let n = usedE.get(c.edge)
        if (n === undefined) {
          const e = b.edges[c.edge]!
          n = edges.length
          edges.push({ ...e, v0: mapV(e.v0), v1: mapV(e.v1) })
          usedE.set(c.edge, n)
        }
        return { ...c, edge: n }
      })
    }))
    faceMap.set(fi, faces.length)
    faces.push({ ...f, loops })
  }
  const shells = b.shells.map((s) => ({ closed: s.closed, faces: s.faces.map((x) => faceMap.get(x)!) }))
  return { vertices, edges, faces, shells }
}

export const countTopology = (b: Brep): { readonly vertices: number; readonly edges: number; readonly faces: number; readonly loops: number; readonly shells: number } => ({
  vertices: b.vertices.length,
  edges: b.edges.length,
  faces: b.faces.length,
  loops: b.faces.reduce((s, f) => s + f.loops.length, 0),
  shells: b.shells.length
})

export { IDENTITY, compose }
