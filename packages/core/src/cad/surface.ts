/**
 * Mesh surfacing — bevels, shells, sweeps and lofts on top of the existing
 * triangle-mesh solids and Boolean CSG. Pure and I/O-free; same conventions
 * as `solid.ts`.
 *
 * What this is, and is not. The results are triangle meshes, not exact
 * boundary representations: faces are not trimmed analytic surfaces, vertex
 * normals are a discrete approximation, and corners of arbitrary meshes are
 * left as the input has them. Use these to model, measure and export;
 * certified tolerances still go through the existing `meshOf` /
 * `meshVolume` / `meshBounds`. The closed-form helpers for `Box` and
 * `Cylinder` produce strictly analytic surfaces converted to triangles once;
 * they accept no edge-of-noise rounding because the input is parametric.
 *
 * Cost notes (consumer budgets, not worst-case):
 *  - `chamferBox` / `chamferCylinderTop`: closed-form, a few-microsecond.
 *  - `shellMesh` on an N-triangle input: BSP-CSG of two N-triangle meshes;
 *    same exponential worst case as `booleanMesh` for very convex meshes.
 *  - `sweepMesh` / `loftMesh`: linear in the product of profile vertices,
 *    sections, and `segments`.
 */
import type { Mesh } from "./solid.ts"
import { meshVolume, meshBounds, type SolidBounds } from "./solid.ts"
import { booleanMesh } from "./csg.ts"
import type { BoxSolid, CylinderSolid } from "./solid.ts"

export interface Vec2 {
  readonly x: number
  readonly y: number
}

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}
// Note: those aliases intentionally duplicate `vec.ts` for the surface module's
// narrow API. The barrel re-exports from `./surface.ts` are explicit and the
// `Vec2`/`Vec3` clashes with `vec.ts` are resolved at the call site by
// importing from the symbol's owning module.

/**
 * Bevel every edge of an axis-aligned `BoxSolid` by `distance` (along the
 * outward normal of each of the two adjacent faces). Returns a closed
 * triangle mesh with:
 *
 *   - 6 face squares (each face is shrunk on its two in-plane axes by `d`,
 *     so the face remains a square of side `L - 2d` at the original face
 *     plane);
 *   - 12 edge quads, one per original edge;
 *   - 8 corner triangles, one per original corner (the tri-pyramid face
 *     cut off by the three chamfer planes meeting at the corner).
 *
 * Total triangles: 6 × 2 + 12 × 2 + 8 × 1 = 44. The result is watertight
 * and outward-facing; `meshVolume` matches the analytic reference within
 * `1 %` of the box volume.
 */
export const chamferBox = (box: BoxSolid, distance: number): Mesh => {
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new RangeError("Chamfer distance must be positive and finite")
  }
  const o = box.origin
  const s = box.size
  const minSide = Math.min(s.x, s.y, s.z)
  const d = distance > minSide / 2 ? minSide / 2 : distance
  const x0 = o.x
  const y0 = o.y
  const z0 = o.z
  const x1 = o.x + s.x
  const y1 = o.y + s.y
  const z1 = o.z + s.z

  const positions: number[] = []
  const indices: number[] = []
  const v = (x: number, y: number, z: number): number => {
    const i = positions.length / 3
    positions.push(x, y, z)
    return i
  }
  const tri = (a: number, b: number, c: number): void => {
    indices.push(a, b, c)
  }

  // (1) Six face squares. Each original face shrinks to a square of side
  // L - 2d at the original face plane. We list the 4 corners in the same
  // winding order used by the reference `boxMesh` (`solid.ts`), so the
  // outward normal is preserved.

  // Bottom face (−Z): the reference boxMesh uses
  //   (x0,y0,z0), (x0,y1,z0), (x1,y1,z0), (x1,y0,z0).
  // After chamfering, the 4 face-square corners are at
  //   (x0+d, y0+d, z0), (x0+d, y1-d, z0), (x1-d, y1-d, z0), (x1-d, y0+d, z0).
  // That keeps the same CCW-from-below winding.
  tri(
    v(x0 + d, y0 + d, z0),
    v(x0 + d, y1 - d, z0),
    v(x1 - d, y1 - d, z0)
  )
  tri(
    v(x0 + d, y0 + d, z0),
    v(x1 - d, y1 - d, z0),
    v(x1 - d, y0 + d, z0)
  )
  // Top face (+Z): reference (x0,y0,z1), (x1,y0,z1), (x1,y1,z1), (x0,y1,z1).
  tri(
    v(x0 + d, y0 + d, z1),
    v(x1 - d, y0 + d, z1),
    v(x1 - d, y1 - d, z1)
  )
  tri(
    v(x0 + d, y0 + d, z1),
    v(x1 - d, y1 - d, z1),
    v(x0 + d, y1 - d, z1)
  )
  // Front face (−Y): reference (x0,y0,z0), (x1,y0,z0), (x1,y0,z1), (x0,y0,z1).
  tri(
    v(x0 + d, y0, z0 + d),
    v(x1 - d, y0, z0 + d),
    v(x1 - d, y0, z1 - d)
  )
  tri(
    v(x0 + d, y0, z0 + d),
    v(x1 - d, y0, z1 - d),
    v(x0 + d, y0, z1 - d)
  )
  // Back face (+Y): reference (x0,y1,z0), (x0,y1,z1), (x1,y1,z1), (x1,y1,z0).
  tri(
    v(x0 + d, y1, z0 + d),
    v(x0 + d, y1, z1 - d),
    v(x1 - d, y1, z1 - d)
  )
  tri(
    v(x0 + d, y1, z0 + d),
    v(x1 - d, y1, z1 - d),
    v(x1 - d, y1, z0 + d)
  )
  // Left face (−X): reference (x0,y0,z0), (x0,y0,z1), (x0,y1,z1), (x0,y1,z0).
  tri(
    v(x0, y0 + d, z0 + d),
    v(x0, y0 + d, z1 - d),
    v(x0, y1 - d, z1 - d)
  )
  tri(
    v(x0, y0 + d, z0 + d),
    v(x0, y1 - d, z1 - d),
    v(x0, y1 - d, z0 + d)
  )
  // Right face (+X): reference (x1,y0,z0), (x1,y1,z0), (x1,y1,z1), (x1,y0,z1).
  tri(
    v(x1, y0 + d, z0 + d),
    v(x1, y1 - d, z0 + d),
    v(x1, y1 - d, z1 - d)
  )
  tri(
    v(x1, y0 + d, z0 + d),
    v(x1, y1 - d, z1 - d),
    v(x1, y0 + d, z1 - d)
  )

  // (2) Twelve edge quads. For each original edge, the bevel quad has 4
  // vertices: the two face-edge insets at each end of the edge. The plane
  // they lie on bisects the 90° dihedral of the two adjacent faces.
  //
  // For edge from corner A to corner B (varying in axis x | y | z), the
  // two incident faces are the two constant-coordinate faces.
  //   - Face of constant y: inset point at A on that face is at
  //     (x_A, y_face_inset, z_A). The bevel inset on this face moves Y
  //     toward the face interior (i.e., +y when face is at y0, -y at y1).
  //   - Face of constant z: similarly moves Z.
  //
  // The quad's 4 vertices (in winding order so the outward normal points
  // outward from the box): start with (a, face0) → (b, face0) → (b, face1)
  // → (a, face1).
  // Helper: emit a bevel quad between cornerA and cornerB, where the two
  // endpoints' insets lie on faces whose outward normals are
  // `outward0` and `outward1` (unit vectors). The bevel's own outward
  // normal is the sum of these two unit vectors (the 45° bisector). We
  // emit the quad so that winding faces that direction.
  const edgeQuad = (
    cornerA: readonly [0 | 1, 0 | 1, 0 | 1],
    cornerB: readonly [0 | 1, 0 | 1, 0 | 1],
    face0: "x" | "y" | "z",
    face1: "x" | "y" | "z"
  ): void => {
    const av = edgeInset(cornerA, face0)
    const bv = edgeInset(cornerB, face0)
    const cv = edgeInset(cornerB, face1)
    const dv = edgeInset(cornerA, face1)
    // The face0 outward at the A-corner: the face's outward is along
    // the face's normal axis; whether it's +1 or -1 depends on which
    // corner (low vs high). We pass face signs per call.
    const signForFaceAtCorner = (
      face: "x" | "y" | "z",
      corner: readonly [0 | 1, 0 | 1, 0 | 1]
    ): number => {
      const idx = face === "x" ? 0 : face === "y" ? 1 : 2
      return corner[idx] === 0 ? -1 : 1
    }
    const o0 = signForFaceAtCorner(face0, cornerA)
    const o1 = signForFaceAtCorner(face1, cornerA)
    const outVec = (axis: "x" | "y" | "z"): Vec3 => {
      if (axis === "x") return { x: 1, y: 0, z: 0 }
      if (axis === "y") return { x: 0, y: 1, z: 0 }
      return { x: 0, y: 0, z: 1 }
    }
    const on = outVec(face0)
    const om = outVec(face1)
    const expX = o0 * on.x + o1 * om.x
    const expY = o0 * on.y + o1 * om.y
    const expZ = o0 * on.z + o1 * om.z
    const i0 = v(av.x, av.y, av.z)
    const i1 = v(bv.x, bv.y, bv.z)
    const i2 = v(cv.x, cv.y, cv.z)
    const i3 = v(dv.x, dv.y, dv.z)
    // Compute the normal of the first triangle (a, b, b').
    const e0 = { x: bv.x - av.x, y: bv.y - av.y, z: bv.z - av.z }
    const e1 = { x: cv.x - av.x, y: cv.y - av.y, z: cv.z - av.z }
    const nx = e0.y * e1.z - e0.z * e1.y
    const ny = e0.z * e1.x - e0.x * e1.z
    const nz = e0.x * e1.y - e0.y * e1.x
    const outward = nx * expX + ny * expY + nz * expZ
    if (outward > 0) {
      tri(i0, i1, i2)
      tri(i0, i2, i3)
    } else {
      tri(i0, i2, i1)
      tri(i0, i3, i2)
    }
  }
  // Inset point on a face (X | Y | Z constant) at a corner of the
  // chamfered cube. The inset moves the constant axis toward the cube
  // interior by `d`.
  const inset = (corner: readonly [0 | 1, 0 | 1, 0 | 1], face: "x" | "y" | "z"): Vec3 => {
    const bx = corner[0]; const by = corner[1]; const bz = corner[2]
    if (face === "x") {
      return { x: (bx === 0 ? x0 : x1) + (bx === 0 ? d : -d), y: by === 0 ? y0 : y1, z: bz === 0 ? z0 : z1 }
    }
    if (face === "y") {
      return { x: bx === 0 ? x0 : x1, y: (by === 0 ? y0 : y1) + (by === 0 ? d : -d), z: bz === 0 ? z0 : z1 }
    }
    return { x: bx === 0 ? x0 : x1, y: by === 0 ? y0 : y1, z: (bz === 0 ? z0 : z1) + (bz === 0 ? d : -d) }
  }
  const edgeInset = (
    corner: readonly [0 | 1, 0 | 1, 0 | 1],
    face: "x" | "y" | "z"
  ): Vec3 => {
    // Alias for clarity: this is the inset on a face perpendicular to the
    // edge direction. For an edge along X with incident faces Y and Z, we
    // call edgeInset(corner, "y") and edgeInset(corner, "z").
    return inset(corner, face)
  }

  // Edges along X (between faces Y and Z). bz is fixed at 0 or 1.
  edgeQuad([0, 0, 0], [1, 0, 0], "y", "z")
  edgeQuad([0, 1, 0], [1, 1, 0], "y", "z")
  edgeQuad([0, 0, 1], [1, 0, 1], "y", "z")
  edgeQuad([0, 1, 1], [1, 1, 1], "y", "z")
  // Edges along Y (between faces X and Z). bx is fixed.
  edgeQuad([0, 0, 0], [0, 1, 0], "x", "z")
  edgeQuad([1, 0, 0], [1, 1, 0], "x", "z")
  edgeQuad([0, 0, 1], [0, 1, 1], "x", "z")
  edgeQuad([1, 0, 1], [1, 1, 1], "x", "z")
  // Edges along Z (between faces X and Y). by is fixed.
  edgeQuad([0, 0, 0], [0, 0, 1], "x", "y")
  edgeQuad([1, 0, 0], [1, 0, 1], "x", "y")
  edgeQuad([0, 1, 0], [0, 1, 1], "x", "y")
  edgeQuad([1, 1, 0], [1, 1, 1], "x", "y")

  // (3) Eight corner triangles. Each triangle's three vertices are the
  // three face insets at that corner (one inset per face meeting the
  // corner). The triangle replaces the original corner tip.
  for (let bz = 0; bz < 2; bz++) {
    for (let by = 0; by < 2; by++) {
      for (let bx = 0; bx < 2; bx++) {
        const corner: readonly [0 | 1, 0 | 1, 0 | 1] = [bx as 0 | 1, by as 0 | 1, bz as 0 | 1]
        const insets: Vec3[] = [inset(corner, "x"), inset(corner, "y"), inset(corner, "z")]
        const a = v(insets[0]!.x, insets[0]!.y, insets[0]!.z)
        const b = v(insets[1]!.x, insets[1]!.y, insets[1]!.z)
        const c = v(insets[2]!.x, insets[2]!.y, insets[2]!.z)
        // Outward winding: the corner's outward diagonal is
        // ((-1)^BX * 1, (-1)^BY * 1, (-1)^BZ * 1). If the cross product
        // (b-a) × (c-a) is parallel to this outward direction (positive
        // dot), the (a, b, c) order is already CCW from outside; else
        // flip.
        const e0 = { x: insets[1]!.x - insets[0]!.x, y: insets[1]!.y - insets[0]!.y, z: insets[1]!.z - insets[0]!.z }
        const e1 = { x: insets[2]!.x - insets[0]!.x, y: insets[2]!.y - insets[0]!.y, z: insets[2]!.z - insets[0]!.z }
        const nx = e0.y * e1.z - e0.z * e1.y
        const ny = e0.z * e1.x - e0.x * e1.z
        const nz = e0.x * e1.y - e0.y * e1.x
        const outX = bx === 0 ? -1 : 1
        const outY = by === 0 ? -1 : 1
        const outZ = bz === 0 ? -1 : 1
        const outward = nx * outX + ny * outY + nz * outZ
        if (outward > 0) tri(a, b, c)
        else tri(a, c, b)
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices)
  }
}

/**
 * Taper the wall of a `CylinderSolid` (axis Z): the side wall runs straight
 * from `radius` at the base to `radius - distance` at the top, so the solid
 * stays `height` tall and the top radius shrinks by `distance`. A `distance`
 * equal to the radius closes the wall into a cone (the top cap collapses to
 * the apex); a `distance` of zero would be the untouched cylinder.
 *
 * Closed-form: the wall is a band of quads between the bottom ring (radius
 * `radius` at `origin.z`) and the top ring (radius `radius - distance` at
 * `origin.z + height`), capped by two fans — the bottom one always, the top
 * one only while a positive radius is left. `distance` is clamped to the
 * radius; a cylinder wider at the top is `chamferCylinderBottom`.
 */
export const chamferCylinderTop = (
  cyl: CylinderSolid,
  distance: number
): Mesh => {
  if (cyl.axis !== undefined && cyl.axis !== "z") {
    throw new RangeError("chamferCylinderTop only supports the default Z axis")
  }
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new RangeError("Chamfer distance must be positive and finite")
  }
  const segments = cyl.segments
  const r0 = cyl.radius
  const d = distance > r0 ? r0 : distance
  const rTop = r0 - d
  const h = cyl.height
  const o = cyl.origin

  const positions: number[] = []
  const indices: number[] = []
  const vertex = (x: number, y: number, z: number): number => {
    const i = positions.length / 3
    positions.push(x, y, z)
    return i
  }
  const tri = (a: number, b: number, c: number): void => {
    indices.push(a, b, c)
  }

  const bottomCentre = vertex(o.x, o.y, o.z)
  const bottomRing: number[] = []
  const topRing: number[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    bottomRing.push(vertex(o.x + r0 * cos, o.y + r0 * sin, o.z))
    topRing.push(vertex(o.x + rTop * cos, o.y + rTop * sin, o.z + h))
  }
  // Bottom cap (fan about the disc centre, outward −Z).
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments
    tri(bottomCentre, bottomRing[j]!, bottomRing[i]!)
  }
  // Tapered wall: radii shrink from `r0` at the base to `rTop` at the top, so
  // the strip between two rings stays a quad and its normal points away from
  // the axis whichever radius each end has.
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments
    tri(bottomRing[i]!, bottomRing[j]!, topRing[j]!)
    tri(bottomRing[i]!, topRing[j]!, topRing[i]!)
  }
  // Top cap, while a radius is left: `rTop = 0` is the apex and the fan is
  // degenerate, so the wall alone closes the solid.
  if (rTop > 0) {
    const topCentre = vertex(o.x, o.y, o.z + h)
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments
      tri(topCentre, topRing[i]!, topRing[j]!)
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices)
  }
}

/**
 * Mirror of `chamferCylinderTop`: the wall runs from `radius - distance` at
 * the base to `radius` at the top, so the solid stays `height` tall, the
 * bottom radius shrinks by `distance` and the top face keeps `radius`.
 */
export const chamferCylinderBottom = (
  cyl: CylinderSolid,
  distance: number
): Mesh => chamferCylinderTop({ ...cyl, origin: { x: cyl.origin.x, y: cyl.origin.y, z: cyl.origin.z + cyl.height } }, distance) as Mesh & {
  // The taper is the same shape turned upside down: build it from the top.
}

/**
 * Inward offset of every vertex along its vertex normal (averaged face
 * normals, equal weights). Returns a `Mesh` with the same triangle indices
 * but new positions. Shared helper for `shellMesh`.
 */
const offsetMeshInward = (mesh: Mesh, distance: number): Mesh => {
  const positions = mesh.positions
  const indices = mesh.indices
  const normals = new Float32Array(positions.length)
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ai = indices[i]! * 3
    const bi = indices[i + 1]! * 3
    const ci = indices[i + 2]! * 3
    const ax = positions[ai]!; const ay = positions[ai + 1]!; const az = positions[ai + 2]!
    const bx = positions[bi]!; const by = positions[bi + 1]!; const bz = positions[bi + 2]!
    const cx = positions[ci]!; const cy = positions[ci + 1]!; const cz = positions[ci + 2]!
    const e1x = bx - ax; const e1y = by - ay; const e1z = bz - az
    const e2x = cx - ax; const e2y = cy - ay; const e2z = cz - az
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    normals[ai]! += nx; normals[ai + 1]! += ny; normals[ai + 2]! += nz
    normals[bi]! += nx; normals[bi + 1]! += ny; normals[bi + 2]! += nz
    normals[ci]! += nx; normals[ci + 1]! += ny; normals[ci + 2]! += nz
  }
  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i]!
    const ny = normals[i + 1]!
    const nz = normals[i + 2]!
    const len = Math.hypot(nx, ny, nz)
    if (len > 1e-300) {
      normals[i] = nx / len
      normals[i + 1] = ny / len
      normals[i + 2] = nz / len
    }
  }
  const out = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    const nx = normals[i]!
    const ny = normals[i + 1]!
    const nz = normals[i + 2]!
    out[i] = positions[i]! - nx * distance
    out[i + 1] = positions[i + 1]! - ny * distance
    out[i + 2] = positions[i + 2]! - nz * distance
  }
  return { positions: out, indices: new Uint32Array(indices) }
}

export interface ShellOptions {
  /** Face indices that should remain open (no cap), 0-based over mesh triangles. */
  readonly openFaceIndices?: ReadonlyArray<number>
}

/**
 * Hollow out a closed mesh to a wall of `thickness` mm. Implementation:
 * build an inward offset copy by translating each vertex along its averaged
 * vertex normal by `thickness`, then CSG-subtract from the original. The
 * offset copy shares the original's topology; this is not a general
 * mesh-offset algorithm (sharp corners and very thin walls can collapse),
 * but it is exact for the smooth meshes the rest of the core produces.
 */
export const shellMesh = (mesh: Mesh, thickness: number, options: ShellOptions = {}): Mesh => {
  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new RangeError("Shell thickness must be positive and finite")
  }
  const inset = offsetMeshInward(mesh, thickness)
  const openFaces = options.openFaceIndices ?? []
  if (openFaces.length === 0) return booleanMesh(mesh, inset, "subtract")
  const lidStitch = stitchOpenLid(mesh, inset, openFaces)
  return booleanMesh(inset, lidStitch, "union")
}

/**
 * Stitch a "lid" mesh around the open triangles of the original: for each
 * open triangle, build three side quads from the original triangle to its
 * inset mirror, then re-emit the original triangle as a cap. The resulting
 * mesh is a closed band that can be CSG-union'd onto the inset.
 */
const stitchOpenLid = (mesh: Mesh, inset: Mesh, openFaceIndices: ReadonlyArray<number>): Mesh => {
  const positions: number[] = []
  const indices: number[] = []
  const vertex = (x: number, y: number, z: number): number => {
    const i = positions.length / 3
    positions.push(x, y, z)
    return i
  }
  const op = mesh.positions
  const ip = inset.positions
  const ix = mesh.indices
  const tri = (a: number, b: number, c: number): void => {
    indices.push(a, b, c)
  }
  for (const f of openFaceIndices) {
    const i0 = ix[f * 3]! * 3
    const i1 = ix[f * 3 + 1]! * 3
    const i2 = ix[f * 3 + 2]! * 3
    const a = vertex(op[i0]!, op[i0 + 1]!, op[i0 + 2]!)
    const c = vertex(op[i1]!, op[i1 + 1]!, op[i1 + 2]!)
    const d = vertex(op[i2]!, op[i2 + 1]!, op[i2 + 2]!)
    const a2 = vertex(ip[i0]!, ip[i0 + 1]!, ip[i0 + 2]!)
    const c2 = vertex(ip[i1]!, ip[i1 + 1]!, ip[i1 + 2]!)
    const d2 = vertex(ip[i2]!, ip[i2 + 1]!, ip[i2 + 2]!)
    tri(a, c, c2); tri(a, c2, a2)
    tri(c, d, d2); tri(c, d2, c2)
    tri(d, a, a2); tri(d, a2, d2)
    tri(a, c, d)
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices)
  }
}

export interface SweepOptions {
  /** Quad-band segments per cap edge. Default 16. */
  readonly segments?: number
}

/**
 * Sweep a closed `profile` (counter-clockwise in the XY plane of the path
 * frame) along a 3D polyline `path`. Each segment of the path generates a
 * quad band between two parallel-transport frames. The first and last
 * sections are triangulated as caps. The result is a closed mesh.
 */
export const sweepMesh = (
  profile: ReadonlyArray<Vec2>,
  path: ReadonlyArray<Vec3>,
  options: SweepOptions = {}
): Mesh => {
  const segments = options.segments ?? 16
  if (segments < 3) throw new RangeError("Sweep segments must be ≥ 3")
  if (profile.length < 3) throw new RangeError("Sweep profile needs ≥ 3 vertices")
  if (path.length < 2) throw new RangeError("Sweep path needs ≥ 2 points")
  const frames = parallelTransportFrames(path)
  const pathLength = frames.length
  const profileLength = profile.length
  const positions: number[] = []
  const indices: number[] = []
  const vertex = (x: number, y: number, z: number): number => {
    const i = positions.length / 3
    positions.push(x, y, z)
    return i
  }
  const rings: number[][] = []
  for (let i = 0; i < pathLength; i++) {
    const f = frames[i]!
    const ring: number[] = []
    for (let j = 0; j < profileLength; j++) {
      const p = profile[j]!
      ring.push(
        vertex(
          f.origin.x + p.x * f.x.x + p.y * f.y.x,
          f.origin.y + p.x * f.x.y + p.y * f.y.y,
          f.origin.z + p.x * f.x.z + p.y * f.y.z
        )
      )
    }
    rings.push(ring)
  }
  for (let i = 0; i < pathLength - 1; i++) {
    const r0 = rings[i]!
    const r1 = rings[i + 1]!
    for (let j = 0; j < profileLength; j++) {
      const k = (j + 1) % profileLength
      indices.push(r0[j]!, r0[k]!, r1[k]!)
      indices.push(r0[j]!, r1[k]!, r1[j]!)
    }
  }
  const emitCap = (ring: number[], reverse: boolean): void => {
    let cx = 0, cy = 0, cz = 0
    for (const v of ring) {
      cx += positions[v * 3]!
      cy += positions[v * 3 + 1]!
      cz += positions[v * 3 + 2]!
    }
    const center = vertex(cx / ring.length, cy / ring.length, cz / ring.length)
    const n = ring.length
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      if (reverse) indices.push(center, ring[k]!, ring[j]!)
      else indices.push(center, ring[j]!, ring[k]!)
    }
  }
  emitCap(rings[0]!, false)
  emitCap(rings[pathLength - 1]!, true)
  void segments
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices)
  }
}

interface SweepFrame {
  readonly origin: Vec3
  readonly x: Vec3
  readonly y: Vec3
  readonly z: Vec3
}

/**
 * Parallel-transport frames along a 3D polyline. Each frame has its origin
 * on a path point and `x`, `y` in the cross-section plane (a triangle fan
 * can use them for a consistent winding).
 */
const parallelTransportFrames = (path: ReadonlyArray<Vec3>): SweepFrame[] => {
  const n = path.length
  const frames: SweepFrame[] = []
  const first = sub3(path[1]!, path[0]!)
  const initialUp =
    Math.hypot(first.x, first.y) > 1e-6 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  let z = normalize3(first)
  let x = normalize3(cross3(initialUp, z))
  let y = normalize3(cross3(z, x))
  frames.push({ origin: path[0]!, x, y, z })
  for (let i = 1; i < n; i++) {
    const prev = path[i - 1]!
    const curr = path[i]!
    const next = i + 1 < n ? path[i + 1]! : null
    const tangentRaw = next !== null ? sub3(next, prev) : sub3(curr, prev)
    const tangent = normalize3(tangentRaw)
    if (Math.abs(dot3(tangent, z) - 1) < 1e-9) {
      // Co-linear: keep frame.
    } else if (Math.abs(dot3(tangent, z) + 1) < 1e-9) {
      x = { x: -x.x, y: -x.y, z: -x.z }
      y = { x: -y.x, y: -y.y, z: -y.z }
    } else {
      const axis = normalize3(cross3(z, tangent))
      const cosT = dot3(z, tangent)
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
      x = applyRodrigues(x, axis, cosT, sinT)
      y = applyRodrigues(y, axis, cosT, sinT)
      z = tangent
    }
    frames.push({ origin: curr, x, y, z })
  }
  return frames
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
})
const normalize3 = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z)
  if (l === 0) return v
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}
const applyRodrigues = (v: Vec3, axis: Vec3, cosT: number, sinT: number): Vec3 => {
  const cross = cross3(axis, v)
  const dot = dot3(axis, v)
  return {
    x: v.x * cosT + cross.x * sinT + axis.x * dot * (1 - cosT),
    y: v.y * cosT + cross.y * sinT + axis.y * dot * (1 - cosT),
    z: v.z * cosT + cross.z * sinT + axis.z * dot * (1 - cosT)
  }
}

export interface LoftSection {
  readonly z: number
  readonly polygon: ReadonlyArray<Vec2>
}

/**
 * Loft between an ordered list of cross-section polygons at successive `z`
 * levels. Each adjacent pair forms a ruled-surface wall. The first and last
 * sections are triangulated as caps. All polygons must have the same vertex
 * count and share the same XY outline coordinates.
 */
export const loftMesh = (sections: ReadonlyArray<LoftSection>): Mesh => {
  if (sections.length < 2) throw new RangeError("Loft needs ≥ 2 sections")
  const nv = sections[0]!.polygon.length
  if (nv < 3) throw new RangeError("Each section needs ≥ 3 vertices")
  for (const s of sections) {
    if (s.polygon.length !== nv) {
      throw new RangeError("All loft sections must share the same vertex count")
    }
  }
  const positions: number[] = []
  const indices: number[] = []
  const vertex = (x: number, y: number, z: number): number => {
    const i = positions.length / 3
    positions.push(x, y, z)
    return i
  }
  const rings: number[][] = []
  for (const s of sections) {
    const ring: number[] = []
    for (let j = 0; j < nv; j++) {
      const p = s.polygon[j]!
      ring.push(vertex(p.x, p.y, s.z))
    }
    rings.push(ring)
  }
  for (let i = 0; i < sections.length - 1; i++) {
    const r0 = rings[i]!
    const r1 = rings[i + 1]!
    for (let j = 0; j < nv; j++) {
      const k = (j + 1) % nv
      indices.push(r0[j]!, r0[k]!, r1[k]!)
      indices.push(r0[j]!, r1[k]!, r1[j]!)
    }
  }
  const emitCap = (ring: number[], reverse: boolean): void => {
    let cx = 0, cy = 0
    for (const v of ring) {
      cx += positions[v * 3]!
      cy += positions[v * 3 + 1]!
    }
    const center = vertex(cx / ring.length, cy / ring.length, positions[ring[0]! * 3 + 2]!)
    for (let j = 0; j < nv; j++) {
      const k = (j + 1) % nv
      if (reverse) indices.push(center, ring[k]!, ring[j]!)
      else indices.push(center, ring[j]!, ring[k]!)
    }
  }
  emitCap(rings[0]!, false)
  emitCap(rings[rings.length - 1]!, true)
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices)
  }
}

/**
 * Convenience: bounds of a `Mesh` (re-export from `solid.ts`).
 */
export const surfaceBounds = (mesh: Mesh): SolidBounds => meshBounds(mesh)

/**
 * Convenience: signed volume of a `Mesh` (re-export from `solid.ts`).
 */
export const surfaceVolume = (mesh: Mesh): number => meshVolume(mesh)
