/**
 * Push/pull of a fillet band on the exact model (spec 40 U2): the rounded edge of an extrusion (a cylinder) or the rounded rim of a
 * round part (a torus), moved the way Fusion's Press Pull moves it, as a change of the fillet's radius: the two faces beside it stay
 * tangent to it, the fillet gets the radius `r - d` (a convex fillet pushed out of the solid is tighter) or `r + d` (a concave one,
 * whose face looks into the void, is fuller). Nothing else moves.
 *
 * In the section square to the band the two faces beside it are lines meeting at the sharp corner E; a fillet of radius p has its centre
 * on the bisector at p / cos(D / 2) from E (D: the angle the arc turns through) and touches the lines at p / tan(theta / 2) from E. The two
 * fillets, the old and the new, bound with the lines a sliver D between the two arcs, and the edit is the exact Boolean of that sliver,
 * swept along the band (extruded for a cylinder, revolved for a torus): united with the solid when the corner gains material, subtracted
 * when it loses it. The volume is then checked against the sweep of the sliver (area x length; 2 pi x first moment for a revolve).
 *
 * A band whose ends are not square to it (it runs into another fillet or a corner blend), one that is not a single arc between two
 * faces, a radius that would leave under 0.02 mm, and an edit that runs past the faces beside it are refused with the reason.
 */
import { add3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { curvePoint, surfaceNormal, surfacePoint, surfaceProject } from "./geom.ts"
import { massProperties } from "./mass.ts"
import { frame, type Frame, type Vec3 } from "./math.ts"
import { extrudeProfile, loopMoments, revolveProfile, segmentPoint, type ProfileSegment } from "./sweep.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

const TAU = 2 * Math.PI
const MIN_RADIUS = 0.02
const MAX_ARC = Math.PI - 1e-3

interface Band {
  readonly kind: "cylinder" | "torus"
  /** The frame the section is drawn in: x, y the section axes (cylinder), or x radial and z the axis (torus). */
  readonly at: Frame
  /** Length of a cylinder band along its axis (0 for a torus). */
  readonly length: number
  /** Where the section starts along the axis, for a cylinder. */
  readonly start: number
  readonly radius: number
  /** Centre of the arc in section coordinates. */
  readonly centre: { readonly x: number; readonly y: number }
  /** The angles the arc runs between, radians, counter-clockwise. */
  readonly from: number
  readonly to: number
  readonly convex: boolean
}

const angleOf = (x: number, y: number): number => Math.atan2(y, x)

/** The band of a cylinder or torus face, or why that face is not a fillet band. */
const readBand = (b: Brep, face: number): Band | string => {
  const f = b.faces[face]
  if (f === undefined) return "the face does not exist"
  const s = f.surface
  if (s.kind !== "cylinder" && s.kind !== "torus") return "not a cylinder or a torus"
  const points: Vec3[] = []
  for (const loop of f.loops) for (const c of loop.coedges) {
    const e = b.edges[c.edge]!
    for (let k = 0; k <= 16; k++) points.push(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 16))
  }
  if (points.length === 0) return "the face has no boundary"
  const fr = s.frame
  const local = (p: Vec3): Vec3 => { const q = sub3(p, fr.origin); return { x: dot3(q, fr.x), y: dot3(q, fr.y), z: dot3(q, fr.z) } }
  // Which way the surface looks, at the middle of the band: away from the arc's centre means the corner is convex.
  const mid = surfaceProject(s, points[Math.floor(points.length / 2)]!)
  const nat = surfaceNormal(s, mid.u, mid.v)
  const out = f.reversed ? scale3(nat, -1) : nat
  const onSurface = surfacePoint(s, mid.u, mid.v)
  if (s.kind === "cylinder") {
    const q = local(onSurface)
    const radial = normalize3({ x: fr.x.x * q.x + fr.y.x * q.y, y: fr.x.y * q.x + fr.y.y * q.y, z: fr.x.z * q.x + fr.y.z * q.y })
    const convex = dot3(out, radial) > 0
    let vLo = Infinity, vHi = -Infinity
    const samples = points.map((p) => { const q2 = local(p); vLo = Math.min(vLo, q2.z); vHi = Math.max(vHi, q2.z); return { v: q2.z, u: (angleOf(q2.x, q2.y) + TAU) % TAU } })
    if (!(vHi - vLo > 1e-6)) return "the band has no length"
    const sorted = samples.map((p) => p.u).sort((x, y) => x - y)
    let gap = sorted[0]! + TAU - sorted[sorted.length - 1]!, gapEnd = sorted[0]!
    for (let i = 1; i < sorted.length; i++) if (sorted[i]! - sorted[i - 1]! > gap) { gap = sorted[i]! - sorted[i - 1]!; gapEnd = sorted[i]! }
    const span = TAU - gap
    if (!(span > 1e-3 && span < MAX_ARC)) return "the face is not a fillet band: its arc is not less than a half turn"
    const vTol = 1e-6 * Math.max(1, vHi - vLo)
    const onEdge = (u: number): boolean => { const d = (((u - gapEnd) % TAU) + TAU) % TAU; return d < 1e-6 || Math.abs(d - span) < 1e-6 }
    for (const p of samples) if (Math.abs(p.v - vLo) > vTol && Math.abs(p.v - vHi) > vTol && !onEdge(p.u)) return "the band is not square-ended: it runs into another fillet or a corner"
    return { kind: "cylinder", at: frame(add3(fr.origin, scale3(fr.z, vLo)), fr.z, fr.x), length: vHi - vLo, start: vLo, radius: s.radius, centre: { x: 0, y: 0 }, from: gapEnd, to: gapEnd + span, convex }
  }
  // A torus: a full ring whose boundary is two circles of constant tube angle.
  const tube = add3(fr.origin, scale3(add3(scale3(fr.x, Math.cos(mid.u)), scale3(fr.y, Math.sin(mid.u))), s.major))
  const convex = dot3(out, sub3(onSurface, tube)) > 0
  // The seam of a ring (an edge the loop walks twice) crosses the tube angles; the boundary is the circles walked once.
  const walked = new Map<number, number>()
  for (const loop of f.loops) for (const c of loop.coedges) walked.set(c.edge, (walked.get(c.edge) ?? 0) + 1)
  const rimPoints: Vec3[] = []
  for (const loop of f.loops) for (const c of loop.coedges) {
    if (walked.get(c.edge) !== 1) continue
    const e = b.edges[c.edge]!
    for (let k = 0; k <= 16; k++) rimPoints.push(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 16))
  }
  if (rimPoints.length === 0) return "the ring has no boundary circles"
  const vs = rimPoints.map((p) => { const q = surfaceProject(s, p, mid); return q.v })
  // Tube angles of the boundary relative to the middle: unwrap into one run.
  const rel = vs.map((v) => { let d = v - mid.v; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d })
  const lo = Math.min(...rel), hi = Math.max(...rel)
  if (!(hi - lo > 1e-3 && hi - lo < MAX_ARC)) return "the face is not a fillet band: its arc is not less than a half turn"
  for (const d of rel) if (Math.abs(d - lo) > 1e-6 && Math.abs(d - hi) > 1e-6) return "the band is not a full ring between two circles"
  return { kind: "torus", at: frame(fr.origin, fr.z, fr.x), length: 0, start: 0, radius: s.minor, centre: { x: s.major, y: 0 }, from: mid.v + lo, to: mid.v + hi, convex }
}

export interface FilletEdit { readonly brep: Brep; readonly radius: number }

/** The solid with the fillet band `face` pushed by `distance` (out of the solid when positive), or why that cannot be done. */
export const pushPullFillet = (b: Brep, face: number, distance: number): Brep | string => {
  const band = readBand(b, face)
  if (typeof band === "string") return band
  const r = band.radius, r2 = band.convex ? r - distance : r + distance
  if (!(r2 > MIN_RADIUS)) return `the fillet would be ${r2.toFixed(3)} mm: a radius under ${MIN_RADIUS} mm is not a fillet`
  if (Math.abs(r2 - r) < 1e-9) return b
  const delta = band.to - band.from
  const am = (band.from + band.to) / 2
  const m = { x: Math.cos(am), y: Math.sin(am) }
  const k = 1 / Math.cos(delta / 2)
  // The sharp corner, and for a radius p the centre and the two points where the arc touches the lines.
  const corner = { x: band.centre.x + m.x * r * k, y: band.centre.y + m.y * r * k }
  const centreFor = (p: number) => ({ x: corner.x - m.x * p * k, y: corner.y - m.y * p * k })
  const touch = (p: number, angle: number) => { const o = centreFor(p); return { x: o.x + p * Math.cos(angle), y: o.y + p * Math.sin(angle) } }
  const small = Math.min(r, r2), large = Math.max(r, r2)
  const oL = centreFor(large), oS = centreFor(small)
  const loop: ProfileSegment[] = [
    { kind: "line", a: touch(small, band.from), b: touch(large, band.from) },
    { kind: "arc", center: oL, radius: large, start: band.from, end: band.to },
    { kind: "line", a: touch(large, band.to), b: touch(small, band.to) },
    { kind: "arc", center: oS, radius: small, start: band.to, end: band.from }
  ]
  if (band.kind === "torus" && !loop.every((s) => segmentPoint(s, 0).x >= -1e-9 && segmentPoint(s, 0.5).x >= -1e-9 && segmentPoint(s, 1).x >= -1e-9)) return "the new fillet would cross the axis of the ring"
  // The corner gains material when a convex fillet tightens or a concave one fills out.
  const gains = band.convex ? r2 < r : r2 > r
  // The sliver itself would have a face on the old fillet's surface (identical), which a Boolean does not take; what is swept instead is
  // the sliver together with a little of what lies beside it, so every face of the tool crosses the solid or lies clear of it.
  const reach = (large / Math.tan((Math.PI - delta) / 2)) * 1.0
  const beyond = reach + Math.max(0.5, 0.25 * reach)
  const along = (angle: number) => ({ x: -Math.sin(angle), y: Math.cos(angle) })
  // The lines run from the corner along the tangent directions at the two ends of the arc, away from the corner.
  const toward = (angle: number) => { const t = touch(large, angle), d = along(angle); const away = (t.x - corner.x) * d.x + (t.y - corner.y) * d.y >= 0 ? 1 : -1; return { x: corner.x + away * d.x * beyond, y: corner.y + away * d.y * beyond } }
  const fat: ProfileSegment[] = [
    { kind: "line", a: touch(small, band.from), b: toward(band.from) }, { kind: "line", a: toward(band.from), b: toward(band.to) },
    { kind: "line", a: toward(band.to), b: touch(small, band.to) }, { kind: "arc", center: oS, radius: small, start: band.to, end: band.from }
  ]
  // A concave fillet that fills out: the sliver, and the solid under its old arc and beside its two walls (a skin of `beyond` mm into the walls).
  const unit2 = (p: { x: number; y: number }, q: { x: number; y: number }) => { const d = Math.hypot(q.x - p.x, q.y - p.y); return { x: (q.x - p.x) / d, y: (q.y - p.y) / d } }
  const u1 = unit2(corner, touch(r, band.from)), u2 = unit2(corner, touch(r, band.to))
  const outward = (u: { x: number; y: number }, other: { x: number; y: number }) => { const dot = u.x * other.x + u.y * other.y; const px = other.x - dot * u.x, py = other.y - dot * u.y, l = Math.hypot(px, py); return { x: -px / l, y: -py / l } }
  const w1 = outward(u1, u2), w2 = outward(u2, u1)
  const skin = Math.max(0.5, 0.25 * reach)
  const tl1 = touch(large, band.from), tl2 = touch(large, band.to)
  const hull: ProfileSegment[] = [
    { kind: "arc", center: oL, radius: large, start: band.from, end: band.to },
    { kind: "line", a: tl2, b: { x: tl2.x + w2.x * skin, y: tl2.y + w2.y * skin } },
    { kind: "line", a: { x: tl2.x + w2.x * skin, y: tl2.y + w2.y * skin }, b: { x: corner.x + (w1.x + w2.x) * skin, y: corner.y + (w1.y + w2.y) * skin } },
    { kind: "line", a: { x: corner.x + (w1.x + w2.x) * skin, y: corner.y + (w1.y + w2.y) * skin }, b: { x: tl1.x + w1.x * skin, y: tl1.y + w1.y * skin } },
    { kind: "line", a: { x: tl1.x + w1.x * skin, y: tl1.y + w1.y * skin }, b: tl1 }
  ]
  // The region swept: reaching into the wedge between the two walls past the new arc (fat) when the corner's tight side is the new arc's,
  // or taking in the whole corner and a skin outside the wedge (hull). Neither has a face on the old fillet's surface.
  const united = band.convex === gains ? fat : hull
  const before = massProperties(b).volume
  try {
    const sliver = band.kind === "cylinder"
      ? extrudeProfile({ loops: [united] }, band.length, { placement: band.at })
      : revolveProfile({ loops: [united] }, TAU, { origin: band.at.origin, axis: band.at.z, radial: band.at.x })
    const solid = booleanBrep(b, sliver, gains ? "union" : "subtract").brep
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const mom = loopMoments(loop)
    const swept = band.kind === "cylinder" ? Math.abs(mom.area) * band.length : TAU * Math.abs(mom.mx)
    const expected = gains ? swept : -swept
    const after = massProperties(solid).volume
    if (Math.abs(after - before - expected) > 1e-6 * Math.max(before, 1) + 1e-6 * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the fillet accounts for ${expected.toFixed(6)} mm³: the faces beside the fillet are too short for the new radius, or it ran into a neighbouring feature`
    }
    return solid
  } catch (cause) {
    return `the Boolean failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}
