/**
 * Parametric solids, described as data, plus the triangle-mesh generator the
 * viewport and the CAM stock computation consume. Boolean CSG is out of scope
 * for v6.0 (spec 03-core-cad.md §4).
 */
import { Schema } from "effect"
import { TAU, type Vec2 } from "./vec.ts"
import { arcSegmentCount } from "./arc-math.ts"
import { signedArea } from "./shapes.ts"
import { dropClosingDuplicate } from "./tessellate.ts"
import { triangulateRing } from "./triangulate.ts"

const Vec3Point = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  z: Schema.Finite
})

const Point2 = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
const Size = Schema.Struct({ x: Schema.Finite.check(Schema.isGreaterThan(0)), y: Schema.Finite.check(Schema.isGreaterThan(0)), z: Schema.Finite.check(Schema.isGreaterThan(0)) })

export const BoxSolidSchema = Schema.TaggedStruct("Box", {
  origin: Vec3Point,
  size: Size
})
export const CylinderSolidSchema = Schema.TaggedStruct("Cylinder", {
  origin: Vec3Point,
  radius: Schema.Finite.check(Schema.isGreaterThan(0)),
  height: Schema.Finite.check(Schema.isGreaterThan(0)),
  segments: Schema.Int.check(Schema.isBetween({ minimum: 3, maximum: 512 })),
  axis: Schema.Literals(["z", "x", "y"]).pipe(Schema.optionalKey)
})
export const SphereSolidSchema = Schema.TaggedStruct("Sphere", {
  center: Vec3Point,
  radius: Schema.Finite.check(Schema.isGreaterThan(0)),
  rings: Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 256 }))
})
export const ConeSolidSchema = Schema.TaggedStruct("Cone", {
  origin: Vec3Point,
  baseRadius: Schema.Finite.check(Schema.isGreaterThan(0)),
  topRadius: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  height: Schema.Finite.check(Schema.isGreaterThan(0)),
  segments: Schema.Int.check(Schema.isBetween({ minimum: 3, maximum: 512 })),
  axis: Schema.Literals(["z", "x", "y"]).pipe(Schema.optionalKey)
})
export const TorusSolidSchema = Schema.TaggedStruct("Torus", {
  center: Vec3Point,
  majorRadius: Schema.Finite.check(Schema.isGreaterThan(0)),
  minorRadius: Schema.Finite.check(Schema.isGreaterThan(0)),
  /** Rotation of the torus tube around the Z axis, in radians. */
  rotation: Schema.Finite.pipe(Schema.optionalKey),
  majorSegments: Schema.Int.check(Schema.isBetween({ minimum: 3, maximum: 512 })),
  minorSegments: Schema.Int.check(Schema.isBetween({ minimum: 3, maximum: 256 })),
  axis: Schema.Literals(["z", "x", "y"]).pipe(Schema.optionalKey)
})
export const ExtrudeSolidSchema = Schema.TaggedStruct("Extrude", {
  /** Closed profile in the XY plane; first point is not repeated. */
  profile: Schema.Array(Point2).check(Schema.isMinLength(3)),
  height: Schema.Finite,
  origin: Vec3Point.pipe(Schema.optionalKey)
})
export const RevolveSolidSchema = Schema.TaggedStruct("Revolve", {
  /** Profile in the XZ plane, revolved about the Z axis. */
  profile: Schema.Array(Point2).check(Schema.isMinLength(2)),
  angle: Schema.Finite,
  segments: Schema.Int.check(Schema.isBetween({ minimum: 3, maximum: 512 })).pipe(Schema.optionalKey)
})

export type BoxSolid = typeof BoxSolidSchema.Type
export type CylinderSolid = typeof CylinderSolidSchema.Type
export type SphereSolid = typeof SphereSolidSchema.Type
export type ConeSolid = typeof ConeSolidSchema.Type
export type TorusSolid = typeof TorusSolidSchema.Type
export type ExtrudeSolid = typeof ExtrudeSolidSchema.Type
export type RevolveSolid = typeof RevolveSolidSchema.Type

export const SolidSchema: Schema.Codec<Solid> = Schema.Union([
  BoxSolidSchema,
  CylinderSolidSchema,
  SphereSolidSchema,
  ConeSolidSchema,
  TorusSolidSchema,
  ExtrudeSolidSchema,
  RevolveSolidSchema
])

export type Solid =
  | BoxSolid
  | CylinderSolid
  | SphereSolid
  | ConeSolid
  | TorusSolid
  | ExtrudeSolid
  | RevolveSolid

export type SolidTag = Solid["_tag"]

export const decodeSolid = Schema.decodeUnknownEffect(SolidSchema)

/** Axis-aligned bounds of a solid, in millimetres. */
export interface SolidBounds {
  readonly minX: number
  readonly minY: number
  readonly minZ: number
  readonly maxX: number
  readonly maxY: number
  readonly maxZ: number
}

export const solidBounds = (solid: Solid): SolidBounds => {
  switch (solid._tag) {
    case "Box":
      return {
        minX: solid.origin.x,
        minY: solid.origin.y,
        minZ: solid.origin.z,
        maxX: solid.origin.x + solid.size.x,
        maxY: solid.origin.y + solid.size.y,
        maxZ: solid.origin.z + solid.size.z
      }
    case "Cylinder": {
      // `origin` is the centre of the base disc and the cylinder grows along the
      // positive axis direction, so the radius is centred on the origin pair
      // perpendicular to the axis.
      const axis = solid.axis ?? "z"
      const rx = axis === "x" ? 0 : solid.radius
      const ry = axis === "y" ? 0 : solid.radius
      const rz = axis === "z" ? 0 : solid.radius
      return {
        minX: solid.origin.x - rx,
        minY: solid.origin.y - ry,
        minZ: solid.origin.z - rz,
        maxX: solid.origin.x + rx + (axis === "x" ? solid.height : 0),
        maxY: solid.origin.y + ry + (axis === "y" ? solid.height : 0),
        maxZ: solid.origin.z + rz + (axis === "z" ? solid.height : 0)
      }
    }
    case "Sphere":
      return {
        minX: solid.center.x - solid.radius,
        minY: solid.center.y - solid.radius,
        minZ: solid.center.z - solid.radius,
        maxX: solid.center.x + solid.radius,
        maxY: solid.center.y + solid.radius,
        maxZ: solid.center.z + solid.radius
      }
    case "Cone": {
      const axis = solid.axis ?? "z"
      const r = Math.max(solid.baseRadius, solid.topRadius)
      const rx = axis === "x" ? 0 : r
      const ry = axis === "y" ? 0 : r
      const rz = axis === "z" ? 0 : r
      return {
        minX: solid.origin.x - rx,
        minY: solid.origin.y - ry,
        minZ: solid.origin.z - rz,
        maxX: solid.origin.x + rx + (axis === "x" ? solid.height : 0),
        maxY: solid.origin.y + ry + (axis === "y" ? solid.height : 0),
        maxZ: solid.origin.z + rz + (axis === "z" ? solid.height : 0)
      }
    }
    case "Torus": {
      const axis = solid.axis ?? "z"
      const r = solid.majorRadius + solid.minorRadius
      const rx = axis === "x" ? solid.minorRadius : r
      const ry = axis === "y" ? solid.minorRadius : r
      const rz = axis === "z" ? solid.minorRadius : r
      return {
        minX: solid.center.x - rx,
        minY: solid.center.y - ry,
        minZ: solid.center.z - rz,
        maxX: solid.center.x + rx,
        maxY: solid.center.y + ry,
        maxZ: solid.center.z + rz
      }
    }
    case "Extrude": {
      const origin = solid.origin ?? { x: 0, y: 0, z: 0 }
      const xs = solid.profile.map((p) => p.x + origin.x)
      const ys = solid.profile.map((p) => p.y + origin.y)
      return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        minZ: origin.z + Math.min(0, solid.height),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
        maxZ: origin.z + Math.max(0, solid.height)
      }
    }
    case "Revolve": {
      const xs = solid.profile.map((p) => p.x)
      const zs = solid.profile.map((p) => p.y)
      const maxR = Math.max(...xs.map(Math.abs))
      const sweep = Math.abs(solid.angle) >= TAU - 1e-9
      const angles = [0, solid.angle]
      const low = Math.min(0, solid.angle)
      const high = Math.max(0, solid.angle)
      for (let i = Math.ceil(low / (Math.PI / 2)); i <= Math.floor(high / (Math.PI / 2)) && !sweep; i++) angles.push(i * Math.PI / 2)
      const projectedX = xs.flatMap((r) => angles.map((a) => r * Math.cos(a)))
      const projectedY = xs.flatMap((r) => angles.map((a) => r * Math.sin(a)))
      return {
        minX: sweep ? -maxR : Math.min(...projectedX),
        minY: sweep ? -maxR : Math.min(...projectedY),
        minZ: Math.min(...zs),
        maxX: sweep ? maxR : Math.max(...projectedX),
        maxY: sweep ? maxR : Math.max(...projectedY),
        maxZ: Math.max(...zs)
      }
    }
  }
}

export interface Mesh {
  readonly positions: Float32Array
  readonly indices: Uint32Array
}

class MeshBuilder {
  readonly positions: Array<number> = []
  readonly indices: Array<number> = []

  vertex(x: number, y: number, z: number): number {
    const index = this.positions.length / 3
    this.positions.push(x, y, z)
    return index
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c)
  }

  /** Preserves concave outlines and the polygon's winding. */
  polygon(points: ReadonlyArray<Vec2>, to3: (p: Vec2) => { x: number; y: number; z: number }): void {
    const ring = points.map((p) => {
      const v = to3(p)
      return this.vertex(v.x, v.y, v.z)
    })
    for (const [a, b, c] of triangulateRing(points)) this.triangle(ring[a]!, ring[b]!, ring[c]!)
  }

  /** Adds an already-3D planar polygon as a fan about its centroid. */
  polygon3(points: ReadonlyArray<{ x: number; y: number; z: number }>): void {
    if (points.length < 3) return
    let cx = 0
    let cy = 0
    let cz = 0
    for (const p of points) {
      cx += p.x
      cy += p.y
      cz += p.z
    }
    const ci = this.vertex(cx / points.length, cy / points.length, cz / points.length)
    const ring = points.map((p) => this.vertex(p.x, p.y, p.z))
    for (let i = 0; i < ring.length; i++) {
      this.triangle(ci, ring[i]!, ring[(i + 1) % ring.length]!)
    }
  }

  /** Appends a triangle, reversing the winding when `flip` is set. */
  emitWound(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number },
    flip: boolean
  ): void {
    const i0 = this.vertex(a.x, a.y, a.z)
    const i1 = this.vertex(b.x, b.y, b.z)
    const i2 = this.vertex(c.x, c.y, c.z)
    if (flip) this.triangle(i0, i2, i1)
    else this.triangle(i0, i1, i2)
  }

  build(): Mesh {
    return {
      positions: new Float32Array(this.positions),
      indices: new Uint32Array(this.indices)
    }
  }
}

/**
 * Axis-aligned box mesh. Each face lists its four corners in the order that is
 * counter-clockwise seen from outside the solid, so every triangle normal points
 * outward and `meshVolume` returns the enclosed volume.
 */
const boxMesh = (solid: BoxSolid): Mesh => {
  const o = solid.origin
  const s = solid.size
  const x0 = o.x
  const y0 = o.y
  const z0 = o.z
  const x1 = o.x + s.x
  const y1 = o.y + s.y
  const z1 = o.z + s.z
  const faces: ReadonlyArray<ReadonlyArray<{ x: number; y: number; z: number }>> = [
    // bottom (−Z)
    [{ x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y0, z: z0 }],
    // top (+Z)
    [{ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }],
    // front (−Y)
    [{ x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 }],
    // back (+Y)
    [{ x: x0, y: y1, z: z0 }, { x: x0, y: y1, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y1, z: z0 }],
    // left (−X)
    [{ x: x0, y: y0, z: z0 }, { x: x0, y: y0, z: z1 }, { x: x0, y: y1, z: z1 }, { x: x0, y: y1, z: z0 }],
    // right (+X)
    [{ x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 }]
  ]
  const b = new MeshBuilder()
  for (const face of faces) {
    const ring = face.map((v) => b.vertex(v.x, v.y, v.z))
    b.triangle(ring[0]!, ring[1]!, ring[2]!)
    b.triangle(ring[0]!, ring[2]!, ring[3]!)
  }
  return b.build()
}


/**
 * Closed cylinder mesh: two caps plus a side band. The side band is built from
 * `cos`/`sin` sampling so the ring is counter-clockwise seen from `+Z`, and the
 * triangles are wound so their normals point away from the axis.
 */
const cylinderMesh = (solid: CylinderSolid): Mesh => {
  const b = new MeshBuilder()
  const n = solid.segments
  const o = solid.origin
  const atLocal = (x: number, y: number, z: number) => axisPoint(x, y, z, solid.axis ?? "z", o)
  const at = (i: number, z: number): { x: number; y: number; z: number } => {
    const a = (i / n) * TAU
    return atLocal(solid.radius * Math.cos(a), solid.radius * Math.sin(a), z)
  }
  // Caps as fans about the disc centres.
  const bottomCenter = b.vertex(...vecOf(atLocal(0, 0, 0)))
  const topCenter = b.vertex(...vecOf(atLocal(0, 0, solid.height)))
  const bottom = Array.from({ length: n }, (_, i) => b.vertex(...vecOf(at(i, 0))))
  const top = Array.from({ length: n }, (_, i) => b.vertex(...vecOf(at(i, solid.height))))
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    b.triangle(bottomCenter, bottom[j]!, bottom[i]!)
    b.triangle(topCenter, top[i]!, top[j]!)
    b.triangle(bottom[i]!, bottom[j]!, top[j]!)
    b.triangle(bottom[i]!, top[j]!, top[i]!)
  }
  return b.build()
}

const vecOf = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z]

// Cyclic permutations preserve handedness, so every axis shares the same winding.
const axisPoint = (x: number, y: number, z: number, axis: "x" | "y" | "z", origin: { x: number; y: number; z: number }) => {
  if (axis === "x") return { x: origin.x + z, y: origin.y + x, z: origin.z + y }
  if (axis === "y") return { x: origin.x + y, y: origin.y + z, z: origin.z + x }
  return { x: origin.x + x, y: origin.y + y, z: origin.z + z }
}

/**
 * UV sphere mesh. Rows run from the north pole (`phi = 0`, `+Z`) down to the
 * south pole, and the triangles are wound so the normals point outward.
 */
const sphereMesh = (solid: SphereSolid): Mesh => {
  const b = new MeshBuilder()
  const rings = solid.rings
  const segments = Math.max(3, rings * 2)
  const c = solid.center
  const r = solid.radius
  for (let i = 0; i <= rings; i++) {
    const phi = (i * Math.PI) / rings
    for (let j = 0; j < segments; j++) {
      const theta = (j * TAU) / segments
      b.vertex(
        c.x + r * Math.sin(phi) * Math.cos(theta),
        c.y + r * Math.sin(phi) * Math.sin(theta),
        c.z + r * Math.cos(phi)
      )
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments
      const a = i * segments + j
      const bIdx = i * segments + j1
      const cIdx = (i + 1) * segments + j
      const d = (i + 1) * segments + j1
      b.triangle(a, d, bIdx)
      b.triangle(a, cIdx, d)
    }
  }
  return b.build()
}

/**
 * Extruded closed profile. Caps are emitted to face outward (down at `z = 0`, up
 * at `z = height`) and the side wall is oriented from the profile's own winding,
 * so both windings of the input produce a closed solid with outward normals.
 */
const extrudeMesh = (solid: ExtrudeSolid): Mesh => {
  const b = new MeshBuilder()
  const o = solid.origin ?? { x: 0, y: 0, z: 0 }
  const ring = dropClosingDuplicate(solid.profile)
  const at = (p: Vec2, z: number): { x: number; y: number; z: number } => ({ x: p.x + o.x, y: p.y + o.y, z: z + o.z })
  const ccw = signedArea(ring) >= 0
  const upward = solid.height >= 0
  // Bottom cap faces −Z, so its ring is reversed when the profile is CCW.
  const bottomRing = ccw === upward ? [...ring].reverse() : ring
  const topRing = ccw === upward ? ring : [...ring].reverse()
  b.polygon(bottomRing, (p) => at(p, 0))
  b.polygon(topRing, (p) => at(p, solid.height))
  const bottom = ring.map((p) => b.vertex(...vecOf(at(p, 0))))
  const top = ring.map((p) => b.vertex(...vecOf(at(p, solid.height))))
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length
    if (ccw === upward) {
      b.triangle(bottom[i]!, bottom[j]!, top[j]!)
      b.triangle(bottom[i]!, top[j]!, top[i]!)
    } else {
      b.triangle(bottom[j]!, bottom[i]!, top[i]!)
      b.triangle(bottom[j]!, top[i]!, top[j]!)
    }
  }
  return b.build()
}

/**
 * Revolved cross-section. `profile` is a **closed** ring in the XZ plane (`x` =
 * radius from the revolve axis, `y` = Z), revolved through `angle` radians about
 * the Z axis. A partial sweep is closed with a flat cap at each sweep end; a full
 * sweep needs none. Triangles are wound outward from the revolve axis, so
 * `meshVolume` returns the enclosed volume.
 */
const revolveMesh = (solid: RevolveSolid): Mesh => {
  const b = new MeshBuilder()
  const ring = dropClosingDuplicate(solid.profile)
  const m = ring.length
  const sweep = solid.angle
  const fullCircle = Math.abs(sweep) >= TAU - 1e-9
  const radius = Math.max(...ring.map((p) => Math.abs(p.x)))
  const steps = solid.segments ?? arcSegmentCount(Math.max(radius, 1e-9), Math.abs(sweep), 0.01, 16)
  const cols = fullCircle ? steps : steps + 1
  const at = (row: number, col: number): { x: number; y: number; z: number } => {
    const p = ring[row]!
    const a = (sweep * col) / steps
    return { x: p.x * Math.cos(a), y: p.x * Math.sin(a), z: p.y }
  }
  // Orientation rule: for a profile wound counter-clockwise in the (radius, Z)
  // plane and a positive sweep, the outward normal of a band quad is
  // `sweepDirection × profileDirection`, which is exactly the winding
  // (A, B, C) below. A clockwise profile or a negative sweep flips it. Deriving
  // the winding this way (rather than testing the normal at runtime) also works
  // for profile rows that sit on the axis, where the normal test degenerates.
  const flip = signedArea(ring) < 0 !== sweep < 0
  const bandCols = fullCircle ? cols : cols - 1
  for (let row = 0; row < m; row++) {
    const row1 = (row + 1) % m
    for (let col = 0; col < bandCols; col++) {
      const col1 = (col + 1) % cols
      const a = at(row, col)
      const b1 = at(row, col1)
      const c = at(row1, col)
      const d = at(row1, col1)
      // A→B→D→C walks the quad in order, so both triangles share one winding.
      b.emitWound(a, b1, d, flip)
      b.emitWound(a, d, c, flip)
    }
  }
  // Sweep-end caps: triangulate the profile ring in the end plane. The cap at
  // `col = 0` faces backwards along the sweep and the one at `col = steps`
  // forwards, so the two ends share a winding and differ only in direction.
  if (!fullCircle) {
    const triangles = triangulateRing(ring)
    for (const col of [0, steps]) {
      const reverse = (signedArea(ring) < 0) !== ((col === 0 ? -1 : 1) * sweep < 0)
      for (const [a, c, d] of triangles) b.emitWound(at(a, col), at(c, col), at(d, col), reverse)
    }
  }
  return b.build()
}

/**
 * Triangle mesh for a solid. `tolerance` bounds the chord error of the curved
 * surfaces and is ignored by the planar primitives.
 */
export const meshOf = (solid: Solid, tolerance = 0.1): Mesh => {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError("Mesh tolerance must be positive and finite")
  const segments = (radius: number, sweep: number, minimum: number, budget = tolerance): number => {
    const step = 4 * Math.asin(Math.sqrt(Math.min(1, budget / radius) / 2))
    const count = Math.max(minimum, Math.ceil(Math.abs(sweep) / step))
    if (!Number.isFinite(count) || count > 65536) throw new RangeError("Mesh tolerance exceeds subdivision budget")
    return count
  }
  const checkGrid = (rows: number, columns: number): void => {
    if (rows * columns > 1_000_000) throw new RangeError("Mesh tolerance exceeds vertex budget")
  }
  switch (solid._tag) {
    case "Box":
      return boxMesh(solid)
    case "Cylinder":
      return cylinderMesh({ ...solid, segments: segments(solid.radius, TAU, solid.segments) })
    case "Sphere": {
      const rings = segments(solid.radius, Math.PI, solid.rings, tolerance / 2)
      checkGrid(rings + 1, rings * 2)
      return sphereMesh({ ...solid, rings })
    }
    case "Cone":
      return coneMesh({ ...solid, segments: segments(Math.max(solid.baseRadius, solid.topRadius), TAU, solid.segments) })
    case "Torus": {
      const majorSegments = segments(solid.majorRadius + solid.minorRadius, TAU, solid.majorSegments, tolerance / 2)
      const minorSegments = segments(solid.minorRadius, TAU, solid.minorSegments, tolerance / 2)
      checkGrid(majorSegments * 4, minorSegments)
      return torusMesh({ ...solid, majorSegments, minorSegments })
    }
    case "Extrude":
      return extrudeMesh(solid)
    case "Revolve": {
      const radius = Math.max(...solid.profile.map((p) => Math.abs(p.x)))
      const count = segments(radius, Math.abs(solid.angle), solid.segments ?? 16)
      checkGrid(solid.profile.length * 6, count)
      return revolveMesh({ ...solid, segments: count })
    }
  }
}

/** Signed volume of a closed mesh (positive when outward-facing). */
export const meshVolume = (mesh: Mesh): number => {
  let v = 0
  for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
    const i0 = mesh.indices[i]! * 3
    const i1 = mesh.indices[i + 1]! * 3
    const i2 = mesh.indices[i + 2]! * 3
    const ax = mesh.positions[i0]!
    const ay = mesh.positions[i0 + 1]!
    const az = mesh.positions[i0 + 2]!
    const bx = mesh.positions[i1]!
    const by = mesh.positions[i1 + 1]!
    const bz = mesh.positions[i1 + 2]!
    const cx = mesh.positions[i2]!
    const cy = mesh.positions[i2 + 1]!
    const cz = mesh.positions[i2 + 2]!
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return v
}

/** Axis-aligned bounds of a mesh, used for stock and viewport framing. */
export const meshBounds = (mesh: Mesh): SolidBounds => {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i + 2 < mesh.positions.length; i += 3) {
    const x = mesh.positions[i]!
    const y = mesh.positions[i + 1]!
    const z = mesh.positions[i + 2]!
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

/** Axis-aligned stock block, the shape the CAM operations use as the workpiece. */
export const stockBox = (
  origin: { x: number; y: number; z: number },
  size: { x: number; y: number; z: number }
): BoxSolid => ({ _tag: "Box", origin, size })

/**
 * Truncated cone / cylinder with two radii (base and top). When `topRadius`
 * equals `baseRadius`, this is a regular cylinder. The base is at `origin` and
 * the top is at `origin + height * axis`.
 */
const coneMesh = (solid: ConeSolid): Mesh => {
  const b = new MeshBuilder()
  const n = solid.segments
  const axis = solid.axis ?? "z"
  const o = solid.origin
  const h = solid.height
  const r0 = solid.baseRadius
  const r1 = solid.topRadius
  // Rotate the radius direction by `theta` and offset by height along `axis`.
  const at = (i: number, top: 0 | 1): { x: number; y: number; z: number } => {
    const a = (i / n) * TAU
    const r = top === 0 ? r0 : r1
    return axisPoint(r * Math.cos(a), r * Math.sin(a), top * h, axis, o)
  }
  const ring = (top: 0 | 1): number[] => {
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      const p = at(i, top)
      out.push(b.vertex(p.x, p.y, p.z))
    }
    return out
  }
  const bottom = ring(0)
  const top = ring(1)
  // Side band: each quad is (bottom i, bottom j, top j, top i) where j = i + 1.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    b.triangle(bottom[i]!, bottom[j]!, top[j]!)
    b.triangle(bottom[i]!, top[j]!, top[i]!)
  }
  // Caps: only when the matching radius is > 0 (a tip would have no surface).
  if (r0 > 0) b.polygon3(bottom.map((idx) => vertexFromIndex(b, idx)).reverse())
  if (r1 > 0) b.polygon3(top.map((idx) => vertexFromIndex(b, idx)))
  return b.build()
}

/**
 * Torus mesh. The major circle lies in the plane perpendicular to `axis`
 * (default Z) at `center`, with tube radius `minorRadius` swept around a
 * circle of radius `majorRadius`. `rotation` rotates the tube cross-section
 * within that plane.
 */
const torusMesh = (solid: TorusSolid): Mesh => {
  const b = new MeshBuilder()
  const c = solid.center
  const R = solid.majorRadius
  const r = solid.minorRadius
  const maj = solid.majorSegments
  const min = solid.minorSegments
  const axis = solid.axis ?? "z"
  const tube = solid.rotation ?? 0
  // Build a (maj+1) × (min+1) grid of tube centres + tube offsets.
  const indexAt = (i: number, j: number): number => {
    const phi = (i / maj) * TAU
    const theta = (j / min) * TAU + tube
    const radial = R + r * Math.cos(theta)
    return b.vertex(...vecOf(axisPoint(radial * Math.cos(phi), radial * Math.sin(phi), r * Math.sin(theta), axis, c)))
  }
  for (let i = 0; i < maj; i++) {
    for (let j = 0; j < min; j++) {
      const a = indexAt(i, j)
      const bIdx = indexAt(i, j + 1)
      const cIdx = indexAt(i + 1, j)
      const d = indexAt(i + 1, j + 1)
      b.triangle(a, d, bIdx)
      b.triangle(a, cIdx, d)
    }
  }
  return b.build()
}

const vertexFromIndex = (b: MeshBuilder, index: number): { x: number; y: number; z: number } => ({
  x: b.positions[index * 3]!,
  y: b.positions[index * 3 + 1]!,
  z: b.positions[index * 3 + 2]!
})
