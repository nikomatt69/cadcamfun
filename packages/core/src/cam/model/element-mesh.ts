/**
 * The CAD scene as the machine sees it: a closed triangle mesh for every solid element, built the way the editor draws it
 * (`createThreeObject` + the gizmo transform of `sceneHelpers`), so what is machined is what is on screen.
 *
 * Conventions mirrored from the scene (Z up): a cube is `width` (X) x `height` (Y) x `depth` (Z) centred on x,y,z; cylinder, cone,
 * prism, pyramid and hemisphere stand along Z (the cone and pyramid point to +Z, a hemisphere's dome to +Z, or -Z when `direction`
 * is "down"); a capsule lies along its `direction` (x|y|z, default y); a torus lies flat in XY; an extrusion grows from its z to
 * z + depth; a revolution turns its profile (x = radius, y = height) about Z (axis "y"), about X (axis "x") or about Y (none), exactly as
 * the scene's lathe is rotated. The gizmo transform (`translateX/Y/Z`, `rotation` in degrees, XYZ order, `scale`) acts about the
 * centre of the element's bounding box.
 *
 * Meshes are closed (a hemisphere gets its flat disc, an open lathe profile is closed against its axis) so a ray through
 * them enters and leaves in pairs, which is what the dexel model needs. Doubles throughout: float32 positions would lose
 * microns on a large part. Shapes that are not a plain solid (spring, thread, text, sweep, loft, architecture) return
 * `undefined` and the caller reports them: a block of the bounding box would be a lie.
 *
 * Two kinds of element carry their own geometry instead of parameters: `mesh` (vertices and faces, what the editor's Boolean command
 * leaves behind) and `parametric` (a feature history, `cad/history.ts`, rebuilt and united into one solid). Both are in the same
 * scene coordinates as every other element.
 */
import { booleanAll } from "../../cad/csg.ts"
import { gearOutline } from "../../cad/gear.ts"
import { rebuild, type History } from "../../cad/history.ts"
import { signedArea } from "../../cad/shapes.ts"
import { segmentsFor } from "../../cad/tolerance.ts"
import { triangulateRing } from "../../cad/triangulate.ts"
import type { Vec2 } from "../../cad/vec.ts"

export interface Mesh64 {
  readonly positions: Float64Array
  readonly indices: Uint32Array
}

export type Element = Readonly<Record<string, unknown>>

const TAU = 2 * Math.PI
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
const positive = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback)

class Builder {
  readonly p: number[] = []
  readonly i: number[] = []
  v(x: number, y: number, z: number): number {
    this.p.push(x, y, z)
    return this.p.length / 3 - 1
  }
  tri(a: number, b: number, c: number): void { this.i.push(a, b, c) }
  quad(a: number, b: number, c: number, d: number): void { this.tri(a, b, c); this.tri(a, c, d) }
  build(): Mesh64 { return { positions: Float64Array.from(this.p), indices: Uint32Array.from(this.i) } }
}

/** Point k of an n-gon like THREE's cylinder, once stood on Z (x = r sin t, y = -r cos t). */
const ringPoint = (k: number, n: number, r: number): Vec2 => {
  const t = (TAU * k) / n
  return { x: r * Math.sin(t), y: -r * Math.cos(t) }
}

/** Closed surface of revolution about Z of a (radius, z) profile; ends are closed with discs on the axis. */
const turned = (profile: ReadonlyArray<{ readonly r: number; readonly z: number }>, segments: number, angle = TAU, phi0 = 0): Mesh64 => {
  const b = new Builder()
  const full = Math.abs(angle - TAU) < 1e-9 || angle >= TAU
  const cols = full ? segments : segments + 1
  // Closed profile against the axis: axis point, the profile, axis point.
  const loop = [{ r: 0, z: profile[0]!.z }, ...profile, { r: 0, z: profile[profile.length - 1]!.z }]
  const rows = loop.map((q) => {
    const row: number[] = []
    for (let c = 0; c < cols; c++) {
      const t = phi0 + (angle * c) / segments
      row.push(b.v(q.r * Math.sin(t), -q.r * Math.cos(t), q.z))
    }
    return row
  })
  const at = (row: number, c: number): number => rows[row]![full ? c % cols : c]!
  for (let s = 0; s < loop.length - 1; s++) {
    const a = loop[s]!, d = loop[s + 1]!
    for (let c = 0; c < segments; c++) {
      const p00 = at(s, c), p01 = at(s, c + 1), p10 = at(s + 1, c), p11 = at(s + 1, c + 1)
      if (a.r === 0 && d.r === 0) continue
      if (a.r === 0) b.tri(p00, p11, p10)
      else if (d.r === 0) b.tri(p00, p01, p10)
      else b.quad(p00, p01, p11, p10)
    }
  }
  if (!full) {
    // The two flat faces where the sweep stops: the profile polygon at each end angle.
    const ring = profile.map((q) => ({ x: q.r, y: q.z }))
    const closedRing = [{ x: 0, y: profile[0]!.z }, ...ring, { x: 0, y: profile[profile.length - 1]!.z }]
    const flip = signedArea(closedRing) < 0
    const tris = triangulateRing(closedRing)
    for (const end of [0, segments]) {
      const idx = closedRing.map((_, k) => rows[k]![end]!)
      for (const [x, y, z] of tris) (end === 0) !== flip ? b.tri(idx[x]!, idx[z]!, idx[y]!) : b.tri(idx[x]!, idx[y]!, idx[z]!)
    }
  }
  return b.build()
}

const box = (w: number, h: number, d: number): Mesh64 => {
  const b = new Builder()
  const x = w / 2, y = h / 2, z = d / 2
  const v = [b.v(-x, -y, -z), b.v(x, -y, -z), b.v(x, y, -z), b.v(-x, y, -z), b.v(-x, -y, z), b.v(x, -y, z), b.v(x, y, z), b.v(-x, y, z)]
  b.quad(v[0]!, v[3]!, v[2]!, v[1]!)
  b.quad(v[4]!, v[5]!, v[6]!, v[7]!)
  b.quad(v[0]!, v[1]!, v[5]!, v[4]!)
  b.quad(v[2]!, v[3]!, v[7]!, v[6]!)
  b.quad(v[1]!, v[2]!, v[6]!, v[5]!)
  b.quad(v[3]!, v[0]!, v[4]!, v[7]!)
  return b.build()
}

/** Extrudes a simple ring from z0 to z1 with capped ends. */
const prism = (ring: ReadonlyArray<Vec2>, z0: number, z1: number): Mesh64 => {
  const b = new Builder()
  const ccw = signedArea(ring) > 0
  const pts = ccw ? ring : [...ring].reverse()
  const lo = pts.map((p) => b.v(p.x, p.y, z0))
  const hi = pts.map((p) => b.v(p.x, p.y, z1))
  const n = pts.length
  for (let k = 0; k < n; k++) b.quad(lo[k]!, lo[(k + 1) % n]!, hi[(k + 1) % n]!, hi[k]!)
  for (const [x, y, z] of triangulateRing(pts)) {
    b.tri(hi[x]!, hi[y]!, hi[z]!)
    b.tri(lo[x]!, lo[z]!, lo[y]!)
  }
  return b.build()
}

const cone = (r0: number, r1: number, h: number, sides: number): Mesh64 =>
  turned([{ r: r0, z: -h / 2 }, { r: r1, z: h / 2 }], sides)

const sphere = (rx: number, ry: number, rz: number, segments: number): Mesh64 => {
  const rings = Math.max(4, Math.ceil(segments / 2))
  const profile: Array<{ r: number; z: number }> = []
  for (let k = 0; k <= rings; k++) {
    const t = (Math.PI * k) / rings
    profile.push({ r: k === 0 || k === rings ? 0 : Math.sin(t), z: -Math.cos(t) })
  }
  const unit = turned(profile, segments)
  const out = Float64Array.from(unit.positions)
  for (let k = 0; k < out.length; k += 3) { out[k] = out[k]! * rx; out[k + 1] = out[k + 1]! * ry; out[k + 2] = out[k + 2]! * rz }
  return { positions: out, indices: unit.indices }
}

const torus = (major: number, minor: number, around: number, tube: number): Mesh64 => {
  const b = new Builder()
  const rows: number[][] = []
  for (let i = 0; i < around; i++) {
    const row: number[] = []
    const u = (TAU * i) / around
    for (let j = 0; j < tube; j++) {
      const w = (TAU * j) / tube
      const r = major + minor * Math.cos(w)
      row.push(b.v(r * Math.cos(u), r * Math.sin(u), minor * Math.sin(w)))
    }
    rows.push(row)
  }
  for (let i = 0; i < around; i++) for (let j = 0; j < tube; j++) {
    const a = rows[i]![j]!, c = rows[(i + 1) % around]![j]!, d = rows[(i + 1) % around]![(j + 1) % tube]!, e = rows[i]![(j + 1) % tube]!
    b.quad(a, c, d, e)
  }
  return b.build()
}

const pyramid = (w: number, d: number, h: number): Mesh64 => {
  const b = new Builder()
  const v = [b.v(-w / 2, -d / 2, -h / 2), b.v(w / 2, -d / 2, -h / 2), b.v(w / 2, d / 2, -h / 2), b.v(-w / 2, d / 2, -h / 2), b.v(0, 0, h / 2)]
  b.quad(v[0]!, v[3]!, v[2]!, v[1]!)
  b.tri(v[0]!, v[1]!, v[4]!); b.tri(v[1]!, v[2]!, v[4]!); b.tri(v[2]!, v[3]!, v[4]!); b.tri(v[3]!, v[0]!, v[4]!)
  return b.build()
}

const hemisphere = (r: number, segments: number, down: boolean): Mesh64 => {
  const rings = Math.max(2, Math.ceil(segments / 4))
  const profile: Array<{ r: number; z: number }> = []
  for (let k = 0; k <= rings; k++) {
    const t = (Math.PI / 2) * (k / rings)
    profile.push({ r: k === rings ? 0 : r * Math.cos(t), z: (down ? -1 : 1) * r * Math.sin(t) })
  }
  return turned(profile, segments)
}

/** Capsule along Z, then laid along its `direction` (x | y | z). */
const capsule = (r: number, length: number, segments: number, direction: string): Mesh64 => {
  const rings = Math.max(2, Math.ceil(segments / 4))
  const half = length / 2
  const profile: Array<{ r: number; z: number }> = []
  for (let k = 0; k <= rings; k++) {
    const t = (Math.PI / 2) * (k / rings)
    profile.push({ r: k === rings ? 0 : r * Math.cos(t), z: -half - r * Math.sin(t) })
  }
  profile.reverse()
  for (let k = 1; k <= rings; k++) {
    const t = (Math.PI / 2) * (k / rings)
    profile.push({ r: k === rings ? 0 : r * Math.cos(t), z: half + r * Math.sin(t) })
  }
  const m = turned(profile, segments)
  if (direction === "z") return m
  const out = Float64Array.from(m.positions)
  for (let k = 0; k < out.length; k += 3) {
    const x = out[k]!, y = out[k + 1]!, z = out[k + 2]!
    // A rotation (not a mirror): z -> x for "x", z -> y for "y".
    if (direction === "x") { out[k] = z; out[k + 1] = x; out[k + 2] = y } else { out[k] = x; out[k + 1] = z; out[k + 2] = -y }
  }
  return { positions: out, indices: m.indices }
}

export interface MeshResult {
  readonly mesh: Mesh64
  /** Placement applied, for callers that need the pivot. */
  readonly warnings: ReadonlyArray<string>
}

const profileOf = (value: unknown): Vec2[] =>
  Array.isArray(value) ? value.filter((p): p is { x: number; y: number } => typeof p === "object" && p !== null && Number.isFinite((p as Vec2).x) && Number.isFinite((p as Vec2).y)).map((p) => ({ x: p.x, y: p.y })) : []

const meshOfElement = (e: Element): Mesh64 | undefined => {
  const verts = Array.isArray(e["vertices"]) ? (e["vertices"] as unknown[]) : []
  const faces = Array.isArray(e["faces"]) ? (e["faces"] as unknown[]) : []
  if (verts.length < 4 || faces.length < 4) return undefined
  const positions = new Float64Array(verts.length * 3)
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i] as Record<string, unknown> | null
    if (v === null || typeof v !== "object" || !Number.isFinite(v["x"] as number) || !Number.isFinite(v["y"] as number)) return undefined
    positions[i * 3] = v["x"] as number
    positions[i * 3 + 1] = v["y"] as number
    positions[i * 3 + 2] = num(v["z"])
  }
  const indices: number[] = []
  for (const face of faces) {
    if (!Array.isArray(face) || face.length < 3) continue
    for (let k = 2; k < face.length; k++) {
      const a = face[0], b = face[k - 1], c = face[k]
      if (![a, b, c].every((i) => Number.isInteger(i) && i >= 0 && i < verts.length)) return undefined
      indices.push(a, b, c)
    }
  }
  return indices.length >= 12 ? { positions, indices: Uint32Array.from(indices) } : undefined
}

const parametricCache = new Map<string, Mesh64 | null>()

/** The solid of a feature history: its bodies united. Remembered, because the union is not free and callers ask more than once. */
const parametricMesh = (history: unknown): Mesh64 | undefined => {
  if (typeof history !== "object" || history === null) return undefined
  const key = JSON.stringify(history)
  const hit = parametricCache.get(key)
  if (hit !== undefined) return hit ?? undefined
  let result: Mesh64 | undefined
  try {
    const built = rebuild(history as History)
    if (built.bodies.length > 0) {
      const united = built.bodies.length === 1 ? built.bodies[0]!.mesh : booleanAll(built.bodies.map((b) => b.mesh), "union")
      result = { positions: Float64Array.from(united.positions), indices: Uint32Array.from(united.indices) }
    }
  } catch { result = undefined }
  if (parametricCache.size >= 16) parametricCache.delete(parametricCache.keys().next().value as string)
  parametricCache.set(key, result ?? null)
  return result
}

/** Local mesh around the origin, or `undefined` when the element is not a plain solid. */
const localMesh = (e: Element, tolerance: number): { mesh: Mesh64; offset?: readonly [number, number, number] } | undefined => {
  const seg = (radius: number, minimum = 16, cap = 256): number => typeof e["segments"] === "number" && e["segments"] >= 3 ? Math.min(2048, Math.floor(e["segments"] as number)) : Math.max(minimum, segmentsFor(radius, typeof e["tolerance"] === "number" ? e["tolerance"] : tolerance, cap))
  switch (e["type"]) {
    case "mesh": { const m = meshOfElement(e); return m === undefined ? undefined : { mesh: m } }
    case "parametric": { const m = parametricMesh(e["history"]); return m === undefined ? undefined : { mesh: m } }
    case "cube": return { mesh: box(positive(e["width"], 1), positive(e["height"], 1), positive(e["depth"], 1)) }
    case "sphere": { const r = positive(e["radius"], 1); return { mesh: sphere(r, r, r, seg(r)) } }
    case "ellipsoid": {
      const rx = positive(e["radiusX"], 1), ry = positive(e["radiusY"], 0.75), rz = positive(e["radiusZ"], 0.5)
      return { mesh: sphere(rx, ry, rz, seg(Math.max(rx, ry, rz))) }
    }
    case "cylinder": { const r = positive(e["radius"], 1); return { mesh: cone(r, r, positive(e["height"], 1), seg(r)) } }
    case "cone": { const r = positive(e["radius"], 1); return { mesh: cone(r, 0, positive(e["height"], 1), seg(r)) } }
    case "prism": {
      const r = positive(e["radius"], 1), sides = Math.max(3, Math.floor(num(e["sides"], 6)))
      const ring = Array.from({ length: sides }, (_, k) => ringPoint(k, sides, r))
      return { mesh: prism(ring, -positive(e["height"], 1) / 2, positive(e["height"], 1) / 2) }
    }
    case "pyramid": return { mesh: pyramid(positive(e["baseWidth"] ?? e["width"], 1), positive(e["baseDepth"] ?? e["depth"], 1), positive(e["height"], 1)) }
    case "hemisphere": { const r = positive(e["radius"], 1); return { mesh: hemisphere(r, seg(r), e["direction"] === "down") } }
    case "capsule": { const r = positive(e["radius"], 0.5); return { mesh: capsule(r, positive(e["height"], 2), seg(r), typeof e["direction"] === "string" ? e["direction"] : "y") } }
    case "torus": {
      const R = positive(e["radius"], 1), r = positive(e["tubeRadius"], R / 4)
      return { mesh: torus(R, r, typeof e["tubularSegments"] === "number" ? e["tubularSegments"] : seg(R + r, 32), typeof e["radialSegments"] === "number" ? e["radialSegments"] : seg(r, 16)) }
    }
    case "gear": {
      // The involute spur gear the editor draws, centred on its thickness, with its bore cut through.
      const moduleValue = positive(e["moduleValue"], 1), teeth = Math.floor(positive(e["teeth"], 20)), thickness = positive(e["thickness"], 5)
      let ring: Vec2[]
      try { ring = [...gearOutline({ moduleValue, teeth, pressureAngle: positive(e["pressureAngle"], 20) })] } catch { return undefined }
      const body = prism(ring, -thickness / 2, thickness / 2)
      const bore = num(e["holeDiameter"]) / 2
      if (!(bore > 0)) return { mesh: body }
      const root = (moduleValue * teeth) / 2 - 1.25 * moduleValue
      if (bore >= root) return undefined
      try {
        // The CSG works in single precision (about 1e-5 mm on a gear this size), the same as a parametric part's.
        const single = (m: Mesh64) => ({ positions: Float32Array.from(m.positions), indices: m.indices })
        const cut = booleanAll([single(body), single(cone(bore, bore, thickness + 2, seg(bore)))], "subtract")
        return { mesh: { positions: Float64Array.from(cut.positions), indices: Uint32Array.from(cut.indices) } }
      } catch { return undefined }
    }
    case "extrusion": {
      const depth = positive(e["depth"], 10)
      let ring: Vec2[] = []
      if (e["shape"] === "rect") { const w = positive(e["width"], 50) / 2, h = positive(e["height"], 30) / 2; ring = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }] }
      else if (e["shape"] === "circle") { const r = positive(e["radius"], 25), n = seg(r); ring = Array.from({ length: n }, (_, k) => ({ x: r * Math.cos((TAU * k) / n), y: r * Math.sin((TAU * k) / n) })) }
      else ring = profileOf(e["profile"])
      if (ring.length < 3 || Math.abs(signedArea(ring)) < 1e-12) return undefined
      // The scene extrudes from z to z + depth; the element's z is the bottom, so the local origin is that bottom.
      return { mesh: prism(ring, 0, depth), offset: [0, 0, 0] }
    }
    case "revolution": {
      const pts = profileOf(e["profile"])
      if (pts.length < 2 || pts.some((p) => p.x < 0)) return undefined
      const radius = Math.max(...pts.map((p) => p.x))
      const angle = positive(e["angle"], TAU)
      const m = turned(pts.map((p) => ({ r: p.x, z: p.y })), typeof e["segments"] === "number" ? e["segments"] : seg(radius), angle, num(e["phiStart"]))
      // axis "y" stands the lathe on Z, "x" lays it along X, none leaves its axis along Y: the scene's own rotations.
      if (e["axis"] === "y") return { mesh: m }
      const out = Float64Array.from(m.positions)
      for (let k = 0; k < out.length; k += 3) {
        const x = out[k]!, y = out[k + 1]!, z = out[k + 2]!
        // From Z-up lathe coordinates (x, y, h) back to the scene's Y-up lathe (x, h, -y); axis "x" then lays it along X (a turn of -90 degrees about Z).
        const sx = x, sy = z, sz = -y
        if (e["axis"] === "x") { out[k] = sy; out[k + 1] = -sx; out[k + 2] = sz } else { out[k] = sx; out[k + 1] = sy; out[k + 2] = sz }
      }
      return { mesh: { positions: out, indices: m.indices } }
    }
    default: return undefined
  }
}

/** Euler XYZ (degrees) as a row-major 3x3, applied as Rx * Ry * Rz. */
const rotationMatrix = (rx: number, ry: number, rz: number): readonly number[] => {
  const a = (rx * Math.PI) / 180, b = (ry * Math.PI) / 180, c = (rz * Math.PI) / 180
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c)
  return [
    cb * cc, -cb * sc, sb,
    ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb,
    sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb
  ]
}

const bounds = (m: Mesh64): { min: [number, number, number]; max: [number, number, number] } => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let k = 0; k < m.positions.length; k += 3) for (let a = 0; a < 3; a++) {
    const v = m.positions[k + a]!
    if (v < min[a]!) min[a] = v
    if (v > max[a]!) max[a] = v
  }
  return { min, max }
}

/**
 * Mesh of a solid element in scene coordinates, or `undefined` for anything that is not a plain solid. `tolerance` bounds
 * the chord error of round shapes unless the element carries its own `tolerance` or `segments`.
 */
export const elementMesh = (e: Element, tolerance = 0.01): Mesh64 | undefined => {
  const local = localMesh(e, tolerance)
  return local === undefined ? undefined : placeElementMesh(e, local.mesh)
}

/** A mesh given around the element's own origin, moved to where the element is: its x, y, z, then its gizmo transform. */
export const placeElementMesh = (e: Element, local: Mesh64): Mesh64 => {
  const x = num(e["x"]), y = num(e["y"]), z = num(e["z"])
  const p = Float64Array.from(local.positions)
  for (let k = 0; k < p.length; k += 3) { p[k] = p[k]! + x; p[k + 1] = p[k + 1]! + y; p[k + 2] = p[k + 2]! + z }
  let mesh: Mesh64 = { positions: p, indices: local.indices }
  // Gizmo transform about the centre of the element's bounding box.
  const r = typeof e["rotation"] === "object" && e["rotation"] !== null ? e["rotation"] as Record<string, unknown> : {}
  const s = typeof e["scale"] === "object" && e["scale"] !== null ? e["scale"] as Record<string, unknown> : {}
  const rx = num(r["x"]), ry = num(r["y"]), rz = num(r["z"])
  const sx = num(s["x"], 1), sy = num(s["y"], 1), sz = num(s["z"], 1)
  const tx = num(e["translateX"]), ty = num(e["translateY"]), tz = num(e["translateZ"])
  if (rx !== 0 || ry !== 0 || rz !== 0 || sx !== 1 || sy !== 1 || sz !== 1 || tx !== 0 || ty !== 0 || tz !== 0) {
    const { min, max } = bounds(mesh)
    const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2
    const R = rotationMatrix(rx, ry, rz)
    const q = Float64Array.from(mesh.positions)
    for (let k = 0; k < q.length; k += 3) {
      const vx = (q[k]! - cx) * sx, vy = (q[k + 1]! - cy) * sy, vz = (q[k + 2]! - cz) * sz
      q[k] = cx + tx + R[0]! * vx + R[1]! * vy + R[2]! * vz
      q[k + 1] = cy + ty + R[3]! * vx + R[4]! * vy + R[5]! * vz
      q[k + 2] = cz + tz + R[6]! * vx + R[7]! * vy + R[8]! * vz
    }
    // A mirroring scale flips the winding.
    const flip = sx * sy * sz < 0
    const idx = flip ? Uint32Array.from(mesh.indices, (v, k) => (k % 3 === 1 ? mesh.indices[k + 1]! : k % 3 === 2 ? mesh.indices[k - 1]! : v)) : mesh.indices
    mesh = { positions: q, indices: idx }
  }
  return mesh
}

/** Signed volume of a closed mesh, mm^3 (positive when the triangles face outward). */
export const volumeOf = (m: Mesh64): number => {
  let v = 0
  const p = m.positions
  for (let k = 0; k + 2 < m.indices.length; k += 3) {
    const a = m.indices[k]! * 3, b = m.indices[k + 1]! * 3, c = m.indices[k + 2]! * 3
    v += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6
  }
  return v
}

export const meshBounds = bounds
