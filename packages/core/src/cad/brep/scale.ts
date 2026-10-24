/**
 * Non-uniform scale of a solid (spec 40 U4).
 *
 * A scale with three different factors is an affine map, and the exact model of its image is known only for some
 * surfaces: a plane stays a plane, a NURBS surface stays a NURBS surface (an affine map is a NURBS-preserving
 * transform, the control points move and the weights do not), and a cylinder whose axis runs along a coordinate axis
 * becomes a cylinder or an elliptic extrusion. What the kernel has no surface for — a sphere (its image is an
 * ellipsoid), a cone, a torus, a surface of revolution — is refused with a reason, so the body keeps the model it
 * had instead of an approximation of it (spec 39 §2, rule 2).
 *
 * The scale is diagonal (a factor per axis), which is what the scale feature offers. A general affine map would need
 * the same machinery with the ellipse's principal axes; it is not offered here.
 */
import { cross3, dot3, length3, normalize3, scale3, sub3, type Vec3 } from "../vec.ts"
import { scaleOf, uniformScale, type Transform } from "./math.ts"
import { transformBrep, type Brep, type Face, type Vertex } from "./topology.ts"
import type { Curve3, Surface } from "./geom.ts"

export interface ScaleFactors {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Two lengths that differ by less than this (relative) are the same for the kernel's tolerances. */
const same = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/** The map on directions: a diagonal scale. */
const dir = (s: ScaleFactors, v: Vec3): Vec3 => ({ x: s.x * v.x, y: s.y * v.y, z: s.z * v.z })

/** The map on points, about `about`. */
const point = (s: ScaleFactors, about: Vec3, v: Vec3): Vec3 => ({
  x: about.x + s.x * (v.x - about.x),
  y: about.y + s.y * (v.y - about.y),
  z: about.z + s.z * (v.z - about.z)
})

/** Whether a direction runs along a coordinate axis. */
const alongAxis = (v: Vec3): boolean => [v.x, v.y, v.z].every((c) => Math.abs(c) < 1e-9 || Math.abs(Math.abs(c) - 1) < 1e-9)

/** The image of a circular or elliptical section under the scale: an ellipse, or the reason there is none. */
const scaledSection = (
  s: ScaleFactors,
  about: Vec3,
  origin: Vec3,
  ex: Vec3,
  ey: Vec3,
  a: number,
  b: number
): { readonly frame: { readonly origin: Vec3; readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 }; readonly a: number; readonly b: number } | string => {
  const X = dir(s, ex), Y = dir(s, ey)
  // The image of the section is an ellipse only when the two scaled axes stay orthogonal; otherwise it is a sheared
  // ellipse, which is not one of the kernel's curves.
  if (Math.abs(dot3(X, Y)) > 1e-9 * Math.max(1, length3(X) * length3(Y))) return "a section whose axes are not parallel to the coordinate axes is sheared by a non-uniform scale, which the kernel has no curve for"
  const x = normalize3(X), y = normalize3(Y)
  const z = cross3(x, y)
  if (length3(z) < 1e-12) return "a section collapsed by the scale"
  return { frame: { origin: point(s, about, origin), x, y, z: normalize3(z) }, a: a * length3(X), b: b * length3(Y) }
}

/** The image of a curve under the scale, or the reason there is none. */
const scaledCurve = (s: ScaleFactors, about: Vec3, c: Curve3): Curve3 | string => {
  switch (c.kind) {
    case "line": {
      const d = dir(s, c.dir)
      const l = length3(d)
      if (l < 1e-12) return "a line collapsed by the scale"
      return { kind: "line", origin: point(s, about, c.origin), dir: normalize3(d) }
    }
    case "circle": {
      const e = scaledSection(s, about, c.frame.origin, c.frame.x, c.frame.y, c.radius, c.radius)
      if (typeof e === "string") return e
      // A section that stays a circle stays a circle: the kernel has a curve for it.
      return same(e.a, e.b) ? { kind: "circle", frame: e.frame, radius: e.a } : { kind: "ellipse", frame: e.frame, a: e.a, b: e.b }
    }
    case "ellipse": {
      const e = scaledSection(s, about, c.frame.origin, c.frame.x, c.frame.y, c.a, c.b)
      if (typeof e === "string") return e
      return { kind: "ellipse", frame: e.frame, a: e.a, b: e.b }
    }
    case "nurbs":
      // An affine map moves the control points and leaves the weights and the knots: the image is the same curve.
      return { kind: "nurbs", data: { ...c.data, points: c.data.points.map((q) => { const v = point(s, about, { x: q[0]!, y: q[1]!, z: q[2] ?? 0 }); return [v.x, v.y, v.z] }) } }
  }
}

/** The image of a surface under the scale, or the reason there is none. */
const scaledSurface = (s: ScaleFactors, about: Vec3, f: Surface): Surface | string => {
  switch (f.kind) {
    case "plane": {
      const n = f.frame.z
      // The normal of the image is the inverse transpose of the map applied to the normal.
      const raw = { x: n.x / s.x, y: n.y / s.y, z: n.z / s.z }
      if (length3(raw) < 1e-12) return "a plane collapsed by the scale"
      const z = normalize3(raw)
      const X = dir(s, f.frame.x)
      const x = normalize3(sub3(X, scale3(z, dot3(X, z))))
      if (length3(x) < 1e-12) return "a plane collapsed by the scale"
      const y = cross3(z, x)
      return { kind: "plane", frame: { origin: point(s, about, f.frame.origin), x, y, z } }
    }
    case "cylinder": {
      const ex = f.frame.x, ey = f.frame.y, ez = f.frame.z
      const X = dir(s, ex), Y = dir(s, ey)
      const perpendicular = Math.abs(dot3(X, Y)) <= 1e-9 * Math.max(1, length3(X) * length3(Y))
      const section = scaledSection(s, about, f.frame.origin, ex, ey, f.radius, f.radius)
      if (typeof section === "string") return section
      const axis = dir(s, ez)
      if (length3(axis) < 1e-12) return "a cylinder collapsed by the scale"
      const z = normalize3(axis)
      if (!perpendicular) return "a cylinder whose axis is not parallel to a coordinate axis is sheared by a non-uniform scale, which the kernel has no surface for"
      if (same(section.a, section.b)) {
        // The section stays circular: the image is a cylinder.
        return { kind: "cylinder", frame: { origin: section.frame.origin, x: section.frame.x, y: section.frame.y, z }, radius: section.a }
      }
      // The section becomes an ellipse: the image is an elliptic extrusion along the axis.
      return { kind: "extrusion", curve: { kind: "ellipse", frame: section.frame, a: section.a, b: section.b }, dir: z }
    }
    case "nurbs":
      // An affine map moves the control points and leaves the weights: the image is the same surface.
      return { kind: "nurbs", data: { ...f.data, points: f.data.points.map((row) => row.map((q) => { const v = point(s, about, { x: q[0]!, y: q[1]!, z: q[2] ?? 0 }); return [v.x, v.y, v.z] })) } }
    case "sphere":
      return "a sphere scaled unevenly becomes an ellipsoid, which the kernel has no surface for"
    case "cone":
      return "a cone scaled unevenly becomes an elliptic cone, which the kernel has no surface for"
    case "torus":
      return "a torus scaled unevenly has no exact image in the kernel"
    case "revolution":
      return "a surface of revolution scaled unevenly has no exact image in the kernel"
    case "extrusion":
      return "an extrusion scaled unevenly has no exact image in the kernel"
  }
}

/**
 * The exact image of a body under a non-uniform scale about `about`, or the reason it has none. A uniform scale keeps
 * the kernel's own transform (it is exact for every surface); a non-uniform one is refused as soon as one face or
 * edge has no exact image, so the body is never left with a mixture of exact and approximated faces.
 */
export const scaleBrep = (b: Brep, s: ScaleFactors, about: Vec3): Brep | string => {
  if (![s.x, s.y, s.z].every((v) => Number.isFinite(v) && v > 0)) return "a scale factor must be positive"
  if (same(s.x, s.y) && same(s.y, s.z)) {
    const tr: Transform = uniformScale(s.x, about)
    return transformBrep(b, tr)
  }
  const mirror = s.x * s.y * s.z < 0
  const k = Math.cbrt(Math.abs(s.x * s.y * s.z))
  // The faces first: a refusal anywhere leaves the body untouched.
  const surfaces: Surface[] = []
  for (const f of b.faces) {
    const s2 = scaledSurface(s, about, f.surface)
    if (typeof s2 === "string") return s2
    surfaces.push(s2)
  }
  const curves: Curve3[] = []
  for (const e of b.edges) {
    const c = scaledCurve(s, about, e.curve)
    if (typeof c === "string") return c
    curves.push(c)
  }
  const vertices: Vertex[] = b.vertices.map((v) => ({ point: point(s, about, v.point), tol: v.tol * k }))
  const edges = b.edges.map((e, i) => {
    const c = curves[i]!
    // A line is parametrised by arc length, so its bounds grow with the scale; the other curves are parametrised by
    // an angle and keep their bounds.
    const factor = e.curve.kind === "line" ? length3(dir(s, e.curve.dir)) : 1
    return { ...e, curve: c, t0: e.t0 * factor, t1: e.t1 * factor, tol: e.tol * k }
  })
  const faces: Face[] = b.faces.map((f, i) => {
    const loops = mirror
      ? f.loops.map((l) => ({ coedges: [...l.coedges].reverse().map((c) => ({ edge: c.edge, reversed: !c.reversed })) }))
      : f.loops.map((l) => ({ coedges: l.coedges.map((c) => ({ edge: c.edge, reversed: c.reversed })) }))
    const reversed = mirror ? !f.reversed : f.reversed
    return f.name === undefined ? { surface: surfaces[i]!, reversed, loops } : { surface: surfaces[i]!, reversed, loops, name: f.name }
  })
  return { vertices, edges, faces, shells: b.shells }
}

/** Whether a scale is uniform (the kernel's own transform is exact for it). */
export const isUniformScale = (s: ScaleFactors): boolean => same(s.x, s.y) && same(s.y, s.z)

/** The scale of a transform, for the callers that need to know. */
export const transformScale = scaleOf
