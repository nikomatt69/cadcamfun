/**
 * Exact primitive solids (SMLib's SmApiCreateBox / Cylinder / Cone / Sphere / Torus). Each is a single closed shell of
 * analytic faces in a placement frame; seams and poles follow the STEP conventions so the faces export unchanged.
 */
import { frame, fromFrame, neg3, sub3, length3, WORLD, type Frame, type Vec3 } from "./math.ts"
import { circleCurve, lineCurve } from "./geom.ts"
import { BrepBuilder, type Brep } from "./topology.ts"

const TAU = Math.PI * 2

const positive = (name: string, x: number): void => {
  if (!(Number.isFinite(x) && x > 0)) throw new RangeError(`${name} must be a positive finite number, got ${x}`)
}

/** Straight edge between two existing vertices of the builder. */
export const lineEdge = (b: BrepBuilder, va: number, vb: number): number => {
  const pa = b.vertices[va]!.point, pb = b.vertices[vb]!.point
  const d = sub3(pb, pa)
  const len = length3(d)
  if (len <= b.tol) throw new RangeError("degenerate line edge")
  return b.edge(lineCurve(pa, d), 0, len, va, vb)
}

/**
 * Planar polygon faces sharing straight edges: a polyhedron from its vertices and faces (each face's indices
 * counter-clockwise seen from outside). Edges are shared by vertex pair.
 */
export const polyhedron = (points: ReadonlyArray<Vec3>, faces: ReadonlyArray<ReadonlyArray<number>>, names?: ReadonlyArray<string>): Brep => {
  const b = new BrepBuilder()
  const vs = points.map((p) => b.newVertex(p))
  const edgeOf = new Map<string, number>()
  const use = (a: number, c: number): readonly [number, boolean] => {
    const key = a < c ? `${a}:${c}` : `${c}:${a}`
    let e = edgeOf.get(key)
    if (e === undefined) {
      e = a < c ? lineEdge(b, vs[a]!, vs[c]!) : lineEdge(b, vs[c]!, vs[a]!)
      edgeOf.set(key, e)
    }
    return [e, a > c]
  }
  faces.forEach((f, fi) => {
    const p0 = points[f[0]!]!
    // Newell normal of the polygon, so concave faces are fine.
    let nx = 0, ny = 0, nz = 0
    for (let i = 0; i < f.length; i++) {
      const a = points[f[i]!]!, c = points[f[(i + 1) % f.length]!]!
      nx += (a.y - c.y) * (a.z + c.z)
      ny += (a.z - c.z) * (a.x + c.x)
      nz += (a.x - c.x) * (a.y + c.y)
    }
    const ref = sub3(points[f[1]!]!, p0)
    const loop = f.map((v, i) => use(v, f[(i + 1) % f.length]!))
    b.face({ kind: "plane", frame: frame(p0, { x: nx, y: ny, z: nz }, ref) }, false, [loop], names?.[fi])
  })
  return b.build()
}

/** Axis-aligned (in `placement`) box with one corner at the placement origin. */
export const makeBox = (dx: number, dy: number, dz: number, placement: Frame = WORLD): Brep => {
  positive("dx", dx)
  positive("dy", dy)
  positive("dz", dz)
  const P = (i: number, j: number, k: number): Vec3 => fromFrame(placement, i * dx, j * dy, k * dz)
  const pts = [P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0), P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)]
  return polyhedron(
    pts,
    [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [3, 7, 6, 2],
      [0, 4, 7, 3],
      [1, 2, 6, 5]
    ],
    ["bottom", "top", "front", "back", "left", "right"]
  )
}

/** Cylinder of `radius` and `height` standing on the placement's XY plane along its Z axis. */
export const makeCylinder = (radius: number, height: number, placement: Frame = WORLD): Brep => makeCone(radius, radius, height, placement)

/**
 * Cone frustum from `r1` (at z = 0) to `r2` (at z = height); either radius may be 0 (apex). Equal radii give a
 * cylinder.
 */
export const makeCone = (r1: number, r2: number, height: number, placement: Frame = WORLD): Brep => {
  positive("height", height)
  if (!(r1 >= 0 && r2 >= 0 && r1 + r2 > 0)) throw new RangeError("cone radii must be ≥ 0 and not both 0")
  const b = new BrepBuilder()
  const f0 = placement
  const top = { ...f0, origin: fromFrame(f0, 0, 0, height) }
  const surface =
    r1 === r2
      ? ({ kind: "cylinder", frame: f0, radius: r1 } as const)
      : ({ kind: "cone", frame: f0, radius: r1, semiAngle: Math.atan((r2 - r1) / height) } as const)
  const vb = b.newVertex(fromFrame(f0, r1, 0, 0))
  const vt = b.newVertex(fromFrame(f0, r2, 0, height))
  const seam = lineEdge(b, vb, vt)
  const lateral: Array<readonly [number, boolean]> = []
  let bottomCircle: number | undefined
  let topCircle: number | undefined
  if (r1 > 0) {
    bottomCircle = b.edge(circleCurve(f0, r1), 0, TAU, vb, vb)
    lateral.push([bottomCircle, false])
  }
  lateral.push([seam, false])
  if (r2 > 0) {
    topCircle = b.edge(circleCurve(top, r2), 0, TAU, vt, vt)
    lateral.push([topCircle, true])
  }
  lateral.push([seam, true])
  b.face(surface, false, [lateral], "side")
  if (bottomCircle !== undefined) b.face({ kind: "plane", frame: frame(f0.origin, neg3(f0.z), f0.x) }, false, [[[bottomCircle, true]]], "bottom")
  if (topCircle !== undefined) b.face({ kind: "plane", frame: top }, false, [[[topCircle, false]]], "top")
  return b.build()
}

/** Sphere of `radius` about the placement origin; poles on the placement's Z axis, seam in its XZ half-plane. */
export const makeSphere = (radius: number, placement: Frame = WORLD): Brep => {
  positive("radius", radius)
  const b = new BrepBuilder()
  const c = placement.origin
  const south = b.newVertex(fromFrame(placement, 0, 0, -radius))
  const north = b.newVertex(fromFrame(placement, 0, 0, radius))
  const meridianFrame = frame(c, neg3(placement.y), placement.x)
  const seam = b.edge(circleCurve(meridianFrame, radius), -Math.PI / 2, Math.PI / 2, south, north)
  b.face({ kind: "sphere", frame: placement, radius }, false, [[[seam, false], [seam, true]]], "sphere")
  return b.build()
}

/** Torus about the placement's Z axis: `major` radius to the tube centre, tube radius `minor` (< major). */
export const makeTorus = (major: number, minor: number, placement: Frame = WORLD): Brep => {
  positive("major", major)
  positive("minor", minor)
  if (minor >= major) throw new RangeError("torus minor radius must be smaller than the major radius")
  const b = new BrepBuilder()
  const v = b.newVertex(fromFrame(placement, major + minor, 0, 0))
  const big = b.edge(circleCurve(placement, major + minor), 0, TAU, v, v)
  const tube = b.edge(circleCurve(frame(fromFrame(placement, major, 0, 0), neg3(placement.y), placement.x), minor), 0, TAU, v, v)
  b.face({ kind: "torus", frame: placement, major, minor }, false, [[[big, false], [tube, false], [big, true], [tube, true]]], "torus")
  return b.build()
}
