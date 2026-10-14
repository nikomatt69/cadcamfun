/**
 * Face draft on the exact model (Fusion's Draft): a planar face leans by an angle about its hinge, the line where it crosses
 * the neutral plane square to the pull direction. As the mesh rebuild does it, the material between the old face and the
 * leaning one is added on one side of the hinge and removed on the other: each part is the face's own outline pushed along
 * its normal, cut by the leaning plane, then united with or subtracted from the body, all with exact Booleans.
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { brepLocator } from "./classify.ts"
import { curvePoint, surfaceProject } from "./geom.ts"
import { frame, MODEL_TOL, type Vec2, type Vec3 } from "./math.ts"
import { makeBox } from "./primitives.ts"
import { extrudeProfile, type ProfileLoop, type ProfileSegment } from "./sweep.ts"
import type { Brep } from "./topology.ts"

export interface PlanarFacePick {
  readonly face: number
  readonly origin: Vec3
  /** Outward unit normal and the in-plane axes of the face's frame. */
  readonly normal: Vec3
  readonly u: Vec3
  readonly v: Vec3
  readonly distance: number
}

/**
 * The planar face nearest `near` (its plane distance when the point projects inside it, else the distance to its outline);
 * with `normal`, only faces whose outward normal is within 1 degree of it (or whose cosine to it is at least `minCos`).
 */
export const pickPlanarFace = (b: Brep, near: Vec3, normal?: Vec3, minCos = Math.cos(Math.PI / 180)): PlanarFacePick | undefined => {
  const loc = brepLocator(b)
  const hint = normal === undefined ? undefined : normalize3(normal)
  let best: PlanarFacePick | undefined
  b.faces.forEach((f, fi) => {
    if (f.surface.kind !== "plane") return
    const F = f.surface.frame
    const n = f.reversed ? scale3(F.z, -1) : F.z
    if (hint !== undefined && dot3(n, hint) < minCos) return
    const q = surfaceProject(f.surface, near)
    let distance = Math.abs(dot3(sub3(near, F.origin), F.z))
    if (!loc.insideFace(fi, q.u, q.v)) {
      distance = Infinity
      for (const l of f.loops) for (const c of l.coedges) {
        const e = b.edges[c.edge]!
        for (let k = 0; k <= 16; k++) distance = Math.min(distance, length3(sub3(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 16), near)))
      }
    }
    if (best === undefined || distance < best.distance - 1e-9) best = { face: fi, origin: F.origin, normal: n, u: F.x, v: cross3(n, F.x), distance }
  })
  return best
}

/** The loops of a planar face as an exact 2D profile in (u, v) about `origin`: lines and circular arcs only. */
export const faceProfile = (b: Brep, pick: PlanarFacePick): ProfileLoop[] | string => {
  const to2 = (p: Vec3): Vec2 => { const d = sub3(p, pick.origin); return { x: dot3(d, pick.u), y: dot3(d, pick.v) } }
  const loops: ProfileLoop[] = []
  for (const l of b.faces[pick.face]!.loops) {
    const loop: ProfileSegment[] = []
    for (const c of l.coedges) {
      const e = b.edges[c.edge]!
      const [t0, t1] = c.reversed ? [e.t1, e.t0] : [e.t0, e.t1]
      const a = to2(curvePoint(e.curve, t0)), z = to2(curvePoint(e.curve, t1))
      if (e.curve.kind === "line") { loop.push({ kind: "line", a, b: z }); continue }
      if (e.curve.kind !== "circle") return `a face bounded by a ${e.curve.kind} has no exact draft yet`
      const cf = e.curve.frame
      // The coedge turns by t1 - t0 about the circle's axis (t0, t1 already swapped for a reversed coedge); seen in the face's
      // (u, v) that is counter-clockwise when the axis points along the face normal.
      const center = to2(cf.origin)
      const start = Math.atan2(a.y - center.y, a.x - center.x)
      const sweep = (t1 - t0) * Math.sign(dot3(cf.z, pick.normal))
      loop.push({ kind: "arc", center, radius: e.curve.radius, start, end: start + sweep })
    }
    loops.push(loop)
  }
  return loops
}

export interface DraftOptions {
  readonly near: Vec3
  readonly normal?: Vec3
  /** Unit pull direction (the mould opens along it). */
  readonly pull: Vec3
  /** Position of the neutral plane along `pull`, from the origin. */
  readonly neutral: number
  /** Degrees; positive leans the face into the body above the neutral plane. */
  readonly angle: number
}

/** The body with one planar face drafted, or why it cannot be. */
export const draftPlanarFace = (b: Brep, o: DraftOptions): Brep | string => {
  const pick = pickPlanarFace(b, o.near, o.normal)
  if (pick === undefined) return "no planar face near the given point"
  const w = normalize3(o.pull), n = pick.normal
  const q0 = sub3(w, scale3(n, dot3(w, n)))
  if (length3(q0) < 1e-6) return "A face square to the pull direction cannot be drafted"
  const angle = (o.angle * Math.PI) / 180
  if (Math.abs(angle) < 1e-12) return b
  const q = normalize3(q0)
  // The hinge: where the face's steepest line through its origin meets the neutral plane.
  const hinge = add3(pick.origin, scale3(q, (o.neutral - dot3(w, pick.origin)) / dot3(w, q)))
  const e = normalize3(cross3(n, w))
  const rotate = (v: Vec3, th: number): Vec3 => add3(add3(scale3(v, Math.cos(th)), scale3(cross3(e, v), Math.sin(th))), scale3(e, dot3(e, v) * (1 - Math.cos(th))))
  const displacement = (nn: Vec3, p: Vec3): number => -dot3(nn, sub3(p, hinge)) / dot3(nn, n)
  const lean = displacement(rotate(n, Math.abs(angle)), add3(hinge, q)) < 0 ? 1 : -1
  const tilted = rotate(n, lean * angle)
  const profile = faceProfile(b, pick)
  if (typeof profile === "string") return profile
  // How far the leaning plane lies from the face along its normal, over the face's outline.
  let sMax = 0, sMin = 0
  for (const l of b.faces[pick.face]!.loops) for (const c of l.coedges) {
    const ed = b.edges[c.edge]!
    for (let k = 0; k <= 32; k++) {
      const s = displacement(tilted, curvePoint(ed.curve, ed.t0 + ((ed.t1 - ed.t0) * k) / 32))
      sMax = Math.max(sMax, s); sMin = Math.min(sMin, s)
    }
  }
  let extent = 0
  for (const v of b.vertices) extent = Math.max(extent, length3(sub3(v.point, hinge)))
  if (Math.max(sMax, -sMin) > 2 * extent) return "The draft is too large for this body (the face tilts away by more than twice the body's size)"
  const half = 4 * extent + 4 * Math.max(sMax, -sMin)
  const margin = 0.01
  const tv = normalize3(cross3(tilted, Math.abs(tilted.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }))
  const tu = cross3(tv, tilted)
  // Half-space beyond (side 1) or behind (side -1) the leaning plane, as a large box on it.
  const slab = (side: 1 | -1): Brep => {
    const corner = add3(add3(add3(hinge, scale3(tu, -half)), scale3(tv, -half)), scale3(tilted, side > 0 ? 0 : -half))
    return makeBox(2 * half, 2 * half, half, frame(corner, tilted, tu))
  }
  const pushed = (from: number, to: number): Brep =>
    extrudeProfile({ loops: profile }, to - from, { placement: frame(add3(pick.origin, scale3(n, from)), n, pick.u), name: "draft" })
  let out = b
  try {
    // Out of the body where the leaning plane lies outside the face, into it where it lies inside.
    if (sMax > MODEL_TOL) {
      // The pushed outline minus the half-space beyond the leaning plane. Intersecting with the half-space behind it is the
      // same set, but with the hinge on an edge of the face and the outline a solver residual (1e-11) off square, that
      // intersection left open edges.
      const add = booleanBrep(pushed(-margin, sMax + margin), slab(1), "subtract").brep
      if (add.faces.length > 0) out = booleanBrep(out, add, "union").brep
    }
    if (sMin < -MODEL_TOL) {
      const remove = booleanBrep(pushed(sMin - margin, margin), slab(1), "intersect").brep
      if (remove.faces.length > 0) out = booleanBrep(out, remove, "subtract").brep
    }
  } catch (err) {
    return `exact draft failed: ${err instanceof Error ? err.message : String(err)}`
  }
  return out
}
