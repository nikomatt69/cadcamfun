/**
 * Exact sweep of a planar profile along a path of lines and circular arcs (a pipe, a rail, a bent bar), the B-rep twin of the
 * mesh rebuild's sweep: the profile is carried along the path with the least rotation (parallel transport), a straight run
 * is an extrusion, a bend of the path is a revolution of the profile about the bend's axis (parallel transport along a
 * circle is exactly that rotation), and where two runs meet without a bend the joint is mitred on their bisector plane. The
 * pieces are united with exact Booleans, so every face is a plane, cylinder, cone, sphere or torus of the original profile.
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { convexCell } from "./blend.ts"
import { booleanBrep } from "./boolean.ts"
import { sewSolids } from "./sew.ts"
import { applyPoint, frame, rotation, type Vec2, type Vec3 } from "./math.ts"
import { extrudeProfile, normalizeProfile, revolveProfile, segmentPoint, type Profile, type ProfileLoop, type ProfileSegment } from "./sweep.ts"
import type { Brep } from "./topology.ts"

export type PathPiece =
  | { readonly kind: "line"; readonly a: Vec3; readonly b: Vec3 }
  /** `from` turned by `angle` (radians, > 0, right hand) about the axis through `center` along the unit `axis`. */
  | { readonly kind: "arc"; readonly center: Vec3; readonly axis: Vec3; readonly from: Vec3; readonly angle: number }

const turn = (v: Vec3, axis: Vec3, angle: number): Vec3 => applyPoint(rotation(axis, angle), v)
const pieceStart = (p: PathPiece): Vec3 => (p.kind === "line" ? p.a : p.from)
export const pieceEnd = (p: PathPiece): Vec3 => (p.kind === "line" ? p.b : add3(p.center, turn(sub3(p.from, p.center), p.axis, p.angle)))
/** Unit tangent at the start (`end` false) or end of a piece, in the direction of travel. */
export const pieceTangent = (p: PathPiece, end: boolean): Vec3 => {
  if (p.kind === "line") return normalize3(sub3(p.b, p.a))
  const t0 = normalize3(cross3(p.axis, sub3(p.from, p.center)))
  return end ? turn(t0, p.axis, p.angle) : t0
}
export const pieceLength = (p: PathPiece): number => (p.kind === "line" ? length3(sub3(p.b, p.a)) : length3(sub3(p.from, p.center)) * p.angle)

/** The rotation taking unit `a` to unit `b` with the least turn, applied to `v` (the mesh sweep's `alignment`). */
const align = (a: Vec3, b: Vec3, v: Vec3): Vec3 => {
  const c = cross3(a, b), s = length3(c), cosT = dot3(a, b)
  if (s < 1e-12) {
    if (cosT > 0) return v
    throw new RangeError("The sweep path doubles back on itself")
  }
  return turn(v, scale3(c, 1 / s), Math.atan2(s, cosT))
}

/** The profile's axes where the sweep starts: `x` and `y` square to the start tangent. */
export interface PathFrame { readonly x: Vec3; readonly y: Vec3 }

export interface PathSweepOptions {
  /** The path closes on itself (its last point is its first); every joint, the closing one included, is mitred. */
  readonly closed?: boolean
  readonly name?: string
}

/** Maps profile coordinates (along x, y) through a 2x2 linear map that is a rotation or a reflection. */
const mapLoop = (loop: ProfileLoop, m: readonly [number, number, number, number], shift: Vec2): ProfileLoop => {
  const f = (p: Vec2): Vec2 => ({ x: shift.x + m[0] * p.x + m[1] * p.y, y: shift.y + m[2] * p.x + m[3] * p.y })
  const det = m[0] * m[3] - m[1] * m[2]
  return loop.map((s): ProfileSegment => {
    if (s.kind === "line") return { kind: "line", a: f(s.a), b: f(s.b) }
    if (s.kind === "arc") {
      const c = f(s.center), a = f(segmentPoint(s, 0))
      const start = Math.atan2(a.y - c.y, a.x - c.x)
      return { kind: "arc", center: c, radius: s.radius, start, end: start + (s.end - s.start) * Math.sign(det) }
    }
    throw new RangeError("A spline in the profile has no exact sweep yet")
  })
}

/**
 * The swept solid. `profile` is in its own coordinates about the point of the path where the sweep starts; `start` gives its
 * axes there. Throws a `RangeError` for a path that is not continuous, doubles back, or bends tighter than the profile.
 */
export const sweepPath = (profile: Profile, start: PathFrame, path: ReadonlyArray<PathPiece>, options: PathSweepOptions = {}): Brep => {
  if (path.length === 0) throw new RangeError("The sweep path is empty")
  for (let i = 0; i + 1 < path.length; i++) if (length3(sub3(pieceEnd(path[i]!), pieceStart(path[i + 1]!))) > 1e-6) throw new RangeError(`The sweep path is broken after piece ${i + 1}`)
  const closed = options.closed === true
  if (closed && length3(sub3(pieceEnd(path[path.length - 1]!), pieceStart(path[0]!))) > 1e-6) throw new RangeError("A closed sweep path must end where it starts")
  const loops = normalizeProfile(profile)
  // The profile's reach from the path, for the length a mitred run must carry past its corner.
  let reach = 0
  for (const l of loops) for (const s of l) for (let k = 0; k <= 8; k++) { const q = segmentPoint(s, k / 8); reach = Math.max(reach, Math.hypot(q.x, q.y)) }
  // The frame at the start of every piece, carried along the path.
  const frames: PathFrame[] = []
  let X = start.x, Y = start.y
  for (let i = 0; i < path.length; i++) {
    if (i > 0) {
      const t0 = pieceTangent(path[i - 1]!, true), t1 = pieceTangent(path[i]!, false)
      X = align(t0, t1, X); Y = align(t0, t1, Y)
    }
    frames.push({ x: X, y: Y })
    const p = path[i]!
    if (p.kind === "arc") { X = turn(X, p.axis, p.angle); Y = turn(Y, p.axis, p.angle) }
  }
  if (closed) {
    // Parallel transport round a closed path that is not planar comes back turned: the mesh sweep would tear there too.
    const t0 = pieceTangent(path[path.length - 1]!, true), t1 = pieceTangent(path[0]!, false)
    const Xb = align(t0, t1, X)
    if (length3(sub3(Xb, frames[0]!.x)) > 1e-6) throw new RangeError("A closed sweep path that is not planar has no exact model yet")
  }
  // The mitre at the joint before piece i (between i - 1 and i), when the tangent turns there.
  const mitre = (i: number): { readonly n: Vec3; readonly at: Vec3; readonly angle: number } | undefined => {
    if (i === 0 && !closed) return undefined
    const prev = path[(i + path.length - 1) % path.length]!
    const t0 = pieceTangent(prev, true), t1 = pieceTangent(path[i]!, false)
    const angle = Math.acos(Math.max(-1, Math.min(1, dot3(t0, t1))))
    if (angle < 1e-9) return undefined
    if (angle > (170 * Math.PI) / 180) throw new RangeError("The sweep path turns back on itself")
    return { n: normalize3(add3(t0, t1)), at: pieceStart(path[i]!), angle }
  }
  const pieces: Brep[] = []
  path.forEach((p, i) => {
    const F = frames[i]!
    const t = pieceTangent(p, false)
    if (p.kind === "line") {
      const before = mitre(i), after = closed || i + 1 < path.length ? mitre((i + 1) % path.length) : undefined
      if (before !== undefined && p.kind === "line" && path[(i + path.length - 1) % path.length]!.kind === "arc") throw new RangeError("A sharp joint after a bend has no exact sweep")
      const e0 = before === undefined ? 0 : reach * Math.tan(before.angle / 2) + 1
      const e1 = after === undefined ? 0 : reach * Math.tan(after.angle / 2) + 1
      const L = pieceLength(p)
      // Profile x along the frame's x; y along y when (x, y, tangent) is right-handed, mirrored otherwise.
      const hand = dot3(cross3(t, F.x), F.y) >= 0 ? 1 : -1
      const placed = { loops: loops.map((l) => mapLoop(l, [1, 0, 0, hand], { x: 0, y: 0 })) }
      let solid = extrudeProfile(placed, L + e0 + e1, { placement: frame(sub3(p.a, scale3(t, e0)), t, F.x), name: `${options.name ?? "sweep"}.${i}` })
      if (before !== undefined || after !== undefined) {
        const big = L + e0 + e1 + 2 * reach + 10
        const box = (["x", "y", "z"] as const).flatMap((k) => {
          const n = { x: 0, y: 0, z: 0, [k]: 1 } as Vec3
          const c = (p.a[k] + p.b[k]) / 2
          return [{ n, d: c + big }, { n: scale3(n, -1), d: -(c - big) }]
        })
        const cuts = [
          ...(before !== undefined ? [{ n: scale3(before.n, -1), d: -dot3(before.n, before.at) }] : []),
          ...(after !== undefined ? [{ n: after.n, d: dot3(after.n, after.at) }] : [])
        ]
        const cell = convexCell([...cuts, ...box])
        if (cell === undefined) throw new RangeError("The mitres of a straight run leave nothing of it")
        solid = booleanBrep(solid, cell, "intersect").brep
      }
      pieces.push(solid)
      return
    }
    if (mitre(i) !== undefined) throw new RangeError("A sharp joint before a bend has no exact sweep")
    // A bend: the profile in the plane through the axis and the start point, revolved about the axis.
    const radial = normalize3(sub3(p.from, p.center))
    const r = length3(sub3(p.from, p.center))
    const m: [number, number, number, number] = [dot3(F.x, radial), dot3(F.y, radial), dot3(F.x, p.axis), dot3(F.y, p.axis)]
    const placed = { loops: loops.map((l) => mapLoop(l, m, { x: r, y: 0 })) }
    for (const l of placed.loops) for (const s of l) for (let k = 0; k <= 8; k++) if (segmentPoint(s, k / 8).x <= 1e-9) throw new RangeError("A bend of the sweep path is tighter than the profile")
    pieces.push(revolveProfile(placed, p.angle, { origin: p.center, axis: p.axis, radial, name: `${options.name ?? "sweep"}.${i}` }))
  })
  // Consecutive pieces share their joint face exactly (a run's end cap is the next bend's start cap): sewn, not Booleaned.
  let acc = pieces[0]!
  // A closed path's last piece meets the first again: that joint is inside one solid already, so the Boolean closes it.
  for (const [k, b] of pieces.slice(1).entries()) acc = (closed && k === pieces.length - 2 ? undefined : sewSolids(acc, b)) ?? booleanBrep(acc, b, "union").brep
  return acc
}
