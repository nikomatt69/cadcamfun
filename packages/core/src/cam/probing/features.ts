/**
 * From a feature of the model to the probe cycle that measures it (spec 73 §5.13): the API and the assistant name a feature of an element
 * (a hole, a top face, a side face, a corner, a slot, a boss, a reference sphere); this reads the element's exact B-rep, finds the
 * candidates, and returns the cycle with the reason it was chosen. A stylus that does not fit, a feature that is not machined from
 * above (the cycles run in the work offset; a tilted feature needs a tilted plane) or a name that matches nothing is refused with the reason.
 *
 *   hole            bore       (from inside: a counterbore is measured at its head)
 *   cylindrical boss boss      (from outside)
 *   top face        z-surface  (at a point that is on the face, not in a hole of it)
 *   side face       edge
 *   outside corner  corner     (two vertical faces at right angles that meet in a convex edge)
 *   slot            pocket     (from inside, across the walls)
 *   rib             web        (named by its two faces: `web:<face>,<face>`)
 *   reference sphere sphere
 *
 * A reference names one candidate (`hole:0`, `boss:12`, `face:3`, `side:7`, `corner:4,5`, `slot:slot-0`, `web:4,6`, `sphere:9`); without one the
 * `hint` (a cycle kind) picks the first of that kind, and without that the first kind present in the order above.
 */
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import { brepLocator, edgeUses, recognizeHoles, type Brep, type Face } from "../../cad/brep/index.ts"
import { elementBrep } from "../../cad/scene-step.ts"
import { recognizeNamedFeatures } from "../model/features.ts"
import type { Move } from "../ir.ts"
import { planProbeCycle } from "./cycles.ts"
import type { ProbeContext, ProbeCycle } from "./types.ts"

type Element = Parameters<typeof elementBrep>[0]

export type ProbeFeatureHint = "bore" | "boss" | "z-surface" | "edge" | "corner" | "pocket" | "web" | "sphere"
export const PROBE_FEATURE_HINTS: ReadonlyArray<ProbeFeatureHint> = ["bore", "boss", "z-surface", "edge", "corner", "pocket", "web", "sphere"]

export interface ProbeFeatureRequest {
  readonly elementId: string
  readonly ref?: string
  readonly hint?: ProbeFeatureHint
}

export interface ProbeFeatureCandidate {
  readonly ref: string
  readonly kind: ProbeFeatureHint
  readonly cycle: ProbeCycle
  readonly because: string
}

export type ProbeFeaturePlan =
  | { readonly ok: true; readonly cycle: ProbeCycle; readonly ref: string; readonly chosenBecause: string; readonly candidates: ReadonlyArray<string> }
  | { readonly ok: false; readonly reason: string }

const EPS = 1e-6
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
const r3 = (v: number): number => Math.round(v * 1000) / 1000

interface FaceInfo {
  readonly index: number
  readonly face: Face
  readonly lo: Vec3
  readonly hi: Vec3
  readonly points: ReadonlyArray<Vec3>
}

const infoOf = (b: Brep, loc: ReturnType<typeof brepLocator>): ReadonlyArray<FaceInfo> =>
  b.faces.map((face, index) => {
    const points = (loc.boundaries.rings[index] ?? []).flatMap((ring) => ring.map((s) => loc.boundaries.point(s.g)))
    const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
    for (const p of points) {
      lo.x = Math.min(lo.x, p.x); lo.y = Math.min(lo.y, p.y); lo.z = Math.min(lo.z, p.z)
      hi.x = Math.max(hi.x, p.x); hi.y = Math.max(hi.y, p.y); hi.z = Math.max(hi.z, p.z)
    }
    return { index, face, lo, hi, points }
  })

/** The outward normal of a planar face. */
const planeNormal = (f: Face): Vec3 | undefined => (f.surface.kind === "plane" ? scale(f.surface.frame.z, f.reversed ? -1 : 1) : undefined)

/** A point of the face's plane that is on the face: found by asking the solid just under and just over it. */
const pointOnFace = (info: FaceInfo, loc: ReturnType<typeof brepLocator>, n: Vec3): Vec3 | undefined => {
  const steps = 7
  const mean = scale(info.points.reduce(add, { x: 0, y: 0, z: 0 }), 1 / Math.max(1, info.points.length))
  const tries: Vec3[] = [mean]
  for (let i = 1; i < steps; i++) for (let j = 1; j < steps; j++) tries.push({ x: info.lo.x + ((info.hi.x - info.lo.x) * i) / steps, y: info.lo.y + ((info.hi.y - info.lo.y) * j) / steps, z: info.lo.z + ((info.hi.z - info.lo.z) * ((i + j) % steps)) / steps })
  const plane = info.face.surface.kind === "plane" ? info.face.surface.frame : undefined
  for (const t of tries) {
    // Project onto the face's plane.
    const p = plane === undefined ? t : sub(t, scale(plane.z, dot(sub(t, plane.origin), plane.z)))
    if (loc.classify(sub(p, scale(n, 1e-3)), 1e-6) === "in" && loc.classify(add(p, scale(n, 1e-3)), 1e-6) === "out") return p
  }
  return undefined
}

/** Every feature of the solid the cycles can measure, with the cycle for each. */
export const probeCandidates = (b: Brep): ReadonlyArray<ProbeFeatureCandidate> => {
  const out: ProbeFeatureCandidate[] = []
  const loc = brepLocator(b)
  const faces = infoOf(b, loc)
  const up: Vec3 = { x: 0, y: 0, z: 1 }
  const vertical = (n: Vec3): boolean => Math.abs(n.z) < 1e-6

  // holes, from inside
  recognizeHoles(b).forEach((h, i) => {
    if (dot(h.direction, up) > -0.999999) return
    const counterbored = h.form === "counterbore" && h.headDiameter !== undefined && h.headDepth !== undefined
    const diameter = counterbored ? h.headDiameter! : h.diameter
    const room = counterbored ? h.headDepth! : h.depth
    out.push({ ref: `hole:${i}`, kind: "bore", cycle: { kind: "bore", centre: { x: r3(h.entry.x), y: r3(h.entry.y) }, diameter: r3(diameter), depth: r3(Math.min(4, room / 2)), top: r3(h.entry.z) }, because: `a ${h.form} hole of diameter ${r3(h.diameter)} entered from above at (${r3(h.entry.x)}, ${r3(h.entry.y)})` })
  })

  // bosses: a convex full cylinder about a vertical axis
  for (const f of faces) {
    const s = f.face.surface
    if (s.kind !== "cylinder" || Math.abs(Math.abs(s.frame.z.z) - 1) > EPS || f.points.length === 0) continue
    const p = f.points[0]!
    const radial = sub(p, add(s.frame.origin, scale(s.frame.z, dot(sub(p, s.frame.origin), s.frame.z))))
    const outward = f.face.reversed ? scale(radial, -1) : radial
    if (dot(outward, radial) <= 0) continue
    // A full boss goes round: its boundary has points all round the axis.
    const angles = new Set(f.points.map((q) => Math.round(Math.atan2(q.y - s.frame.origin.y, q.x - s.frame.origin.x) / (Math.PI / 4))))
    if (angles.size < 6) continue
    out.push({ ref: `boss:${f.index}`, kind: "boss", cycle: { kind: "boss", centre: { x: r3(s.frame.origin.x), y: r3(s.frame.origin.y) }, diameter: r3(2 * s.radius), depth: r3(Math.min(4, (f.hi.z - f.lo.z) / 2)), top: r3(f.hi.z) }, because: `a cylindrical boss of diameter ${r3(2 * s.radius)} standing ${r3(f.hi.z - f.lo.z)} high` })
  }

  // planar faces
  for (const f of faces) {
    const n = planeNormal(f.face)
    if (n === undefined) continue
    if (dot(n, up) > 1 - EPS) {
      const p = pointOnFace(f, loc, n)
      if (p !== undefined) out.push({ ref: `face:${f.index}`, kind: "z-surface", cycle: { kind: "z-surface", at: { x: r3(p.x), y: r3(p.y) }, expectedZ: r3(p.z) }, because: `a face looking up at z ${r3(p.z)}` })
    } else if (vertical(n) && f.hi.z - f.lo.z > 0.5) {
      const p = pointOnFace(f, loc, n)
      if (p !== undefined) {
        const z = f.hi.z - Math.min(4, (f.hi.z - f.lo.z) / 2)
        out.push({ ref: `side:${f.index}`, kind: "edge", cycle: { kind: "edge", at: { x: r3(p.x), y: r3(p.y), z: r3(z) }, normal: { x: r3(n.x * 1e6) / 1e6, y: r3(n.y * 1e6) / 1e6 } }, because: `a vertical face facing (${r3(n.x)}, ${r3(n.y)})` })
      }
    }
  }

  // outside corners: two vertical faces at right angles meeting in a convex edge
  const uses = edgeUses(b)
  const seen = new Set<string>()
  for (const edgeUse of uses) {
    for (const a of edgeUse) for (const c of edgeUse) {
      if (a.face >= c.face) continue
      const fa = faces[a.face]!, fc = faces[c.face]!
      const na = planeNormal(fa.face), nc = planeNormal(fc.face)
      if (na === undefined || nc === undefined || !vertical(na) || !vertical(nc) || Math.abs(dot(na, nc)) > 1e-6) continue
      const key = `${a.face},${c.face}`
      if (seen.has(key)) continue
      seen.add(key)
      // The corner line: the faces' common vertical line.
      const pa = fa.face.surface.kind === "plane" ? fa.face.surface.frame.origin : undefined
      const pc = fc.face.surface.kind === "plane" ? fc.face.surface.frame.origin : undefined
      if (pa === undefined || pc === undefined) continue
      // Solve na.x = na.pa, nc.x = nc.pc in XY.
      const det = na.x * nc.y - na.y * nc.x
      if (Math.abs(det) < 1e-9) continue
      const da = na.x * pa.x + na.y * pa.y, dc = nc.x * pc.x + nc.y * pc.y
      const corner = { x: (da * nc.y - dc * na.y) / det, y: (na.x * dc - nc.x * da) / det }
      const zMid = Math.max(fa.lo.z, fc.lo.z) + 0.5 * (Math.min(fa.hi.z, fc.hi.z) - Math.max(fa.lo.z, fc.lo.z))
      if (!(Math.min(fa.hi.z, fc.hi.z) - Math.max(fa.lo.z, fc.lo.z) > 0.5)) continue
      // Convex: the solid is just inside both faces and the point diagonally outside is empty.
      const inside = { x: corner.x - 0.01 * (na.x + nc.x), y: corner.y - 0.01 * (na.y + nc.y), z: zMid }
      const outside = { x: corner.x + 0.01 * (na.x + nc.x), y: corner.y + 0.01 * (na.y + nc.y), z: zMid }
      if (loc.classify(inside, 1e-7) !== "in" || loc.classify(outside, 1e-7) !== "out") continue
      // The touches move toward the part: along -normal of each face. The X-facing face is touched by the X move.
      const xFace = Math.abs(na.x) > Math.abs(nc.x) ? na : nc
      const yFace = xFace === na ? nc : na
      const xSense: 1 | -1 = xFace.x > 0 ? -1 : 1
      const ySense: 1 | -1 = yFace.y > 0 ? -1 : 1
      const depth = Math.min(4, (Math.min(fa.hi.z, fc.hi.z) - Math.max(fa.lo.z, fc.lo.z)) / 2)
      const top = Math.min(fa.hi.z, fc.hi.z)
      out.push({ ref: `corner:${a.face},${c.face}`, kind: "corner", cycle: { kind: "corner", corner: { x: r3(corner.x), y: r3(corner.y) }, inside: false, xSense, ySense, depth: r3(depth), top: r3(top) }, because: `an outside corner at (${r3(corner.x)}, ${r3(corner.y)}) of two vertical faces` })
    }
  }

  // slots, from inside, across the walls
  for (const s of recognizeNamedFeatures(b)) {
    if (s.kind !== "slot" || s.width === undefined || s.direction === undefined || s.depth === undefined || s.topZ === undefined) continue
    const along = Math.atan2(s.direction.y, s.direction.x)
    const across = along + Math.PI / 2
    const c: Vec2 = { x: (s.bounds.min.x + s.bounds.max.x) / 2, y: (s.bounds.min.y + s.bounds.max.y) / 2 }
    out.push({ ref: `slot:${s.id}`, kind: "pocket", cycle: { kind: "pocket", centre: { x: r3(c.x), y: r3(c.y) }, width: r3(s.width), angle: r3(across * 1e6) / 1e6, depth: r3(Math.min(4, s.depth / 2)), top: r3(s.topZ) }, because: `a slot ${r3(s.width)} wide, ${r3(s.depth)} deep` })
  }

  // reference spheres
  for (const f of faces) {
    const s = f.face.surface
    if (s.kind !== "sphere") continue
    const span = Math.max(f.hi.x - f.lo.x, f.hi.y - f.lo.y, f.hi.z - f.lo.z)
    if (span < 1.5 * s.radius) continue
    out.push({ ref: `sphere:${f.index}`, kind: "sphere", cycle: { kind: "sphere", centre: { x: r3(s.frame.origin.x), y: r3(s.frame.origin.y), z: r3(s.frame.origin.z) }, diameter: r3(2 * s.radius) }, because: `a sphere of diameter ${r3(2 * s.radius)}` })
  }
  return out
}

/** `web:<faceA>,<faceB>`: a rib named by its two faces (they face away from each other, in parallel, over a common height). */
const webOf = (b: Brep, ref: string): ProbeFeatureCandidate | string => {
  const m = /^web:(\d+),(\d+)$/.exec(ref)
  if (m === null) return `'${ref}' is not a web reference (web:<face>,<face>)`
  const loc = brepLocator(b)
  const faces = infoOf(b, loc)
  const fa = faces[Number(m[1])], fb = faces[Number(m[2])]
  if (fa === undefined || fb === undefined) return `the model has ${b.faces.length} faces`
  const na = planeNormal(fa.face), nb = planeNormal(fb.face)
  if (na === undefined || nb === undefined || Math.abs(na.z) > 1e-6 || Math.abs(nb.z) > 1e-6) return "a rib's faces are vertical planes"
  if (dot(na, nb) > -1 + 1e-6) return "a rib's faces are parallel and face away from each other"
  const pa = fa.face.surface.kind === "plane" ? fa.face.surface.frame.origin : fa.lo
  const pb = fb.face.surface.kind === "plane" ? fb.face.surface.frame.origin : fb.lo
  const width = dot(sub(pa, pb), na)
  // The faces face away: A's outward normal points from B toward A, so the rib lies between them and A is on the +na side.
  if (!(width > 0)) return "the two faces face each other: they bound a slot, not a rib"
  const top = Math.min(fa.hi.z, fb.hi.z), low = Math.max(fa.lo.z, fb.lo.z)
  if (!(top - low > 0.5)) return "the two faces do not share a height"
  // The centre line is the middle plane; along the rib it is the middle of the extent the two faces share.
  const mid = { x: (Math.max(fa.lo.x, fb.lo.x) + Math.min(fa.hi.x, fb.hi.x)) / 2, y: (Math.max(fa.lo.y, fb.lo.y) + Math.min(fa.hi.y, fb.hi.y)) / 2 }
  const toMiddle = (dot(pa, na) + dot(pb, na)) / 2 - (mid.x * na.x + mid.y * na.y)
  const c = { x: mid.x + na.x * toMiddle, y: mid.y + na.y * toMiddle }
  return { ref, kind: "web", cycle: { kind: "web", centre: { x: r3(c.x), y: r3(c.y) }, width: r3(width), angle: r3(Math.atan2(na.y, na.x) * 1e6) / 1e6, depth: r3(Math.min(4, (top - low) / 2)), top: r3(top) }, because: `a rib ${r3(width)} wide between faces ${m[1]} and ${m[2]}` }
}

/**
 * The cycle for a feature of an element. `elements` are the drawing's elements (a Boolean's operands are looked up in them).
 */
export const planProbeForFeature = (elements: ReadonlyArray<Element>, request: ProbeFeatureRequest, ctx: ProbeContext): ProbeFeaturePlan => {
  const byId = new Map<string, Element>()
  for (const e of elements) byId.set(String(e["id"] ?? ""), e)
  const element = byId.get(request.elementId)
  if (element === undefined) return { ok: false, reason: `the drawing has no element '${request.elementId}'` }
  const built = elementBrep(element, byId)
  if (built.brep === undefined) return { ok: false, reason: `the element has no exact solid to read features from: ${built.reason}` }
  const all = [...probeCandidates(built.brep)]
  const finish = (c: ProbeFeatureCandidate, why: string): ProbeFeaturePlan => {
    const planned = planProbeCycle(c.cycle, ctx)
    if ("refused" in planned) return { ok: false, reason: `${c.ref} (${c.because}): ${planned.refused}` }
    return { ok: true, cycle: c.cycle, ref: c.ref, chosenBecause: `${why}: ${c.because}`, candidates: all.map((x) => x.ref) }
  }
  if (request.ref !== undefined) {
    const named = request.ref.startsWith("web:") ? webOf(built.brep, request.ref) : all.find((c) => c.ref === request.ref)
    if (named === undefined) return { ok: false, reason: `the element has no feature '${request.ref}' that a probe can measure (it has ${all.map((c) => c.ref).join(", ") || "none"})` }
    if (typeof named === "string") return { ok: false, reason: named }
    return finish(named, `named by the reference ${request.ref}`)
  }
  if (request.hint === "web") return { ok: false, reason: "a rib is named by its two faces: ref web:<face>,<face>" }
  const kinds = request.hint !== undefined ? [request.hint] : PROBE_FEATURE_HINTS.filter((k) => k !== "web")
  for (const kind of kinds) {
    const of = all.filter((c) => c.kind === kind)
    if (of.length === 0) continue
    const why = request.hint !== undefined ? `the first ${kind} of the element (${of.length} found)` : `the element's ${kind} (${of.length} found; the first kind present in the order bore, boss, z-surface, edge, corner, pocket, sphere)`
    return finish(of[0]!, why)
  }
  return { ok: false, reason: `the element has no ${request.hint ?? "feature"} that a probe cycle measures (found: ${all.map((c) => c.ref).join(", ") || "none"})` }
}

/** A preview of a routine's moves for the desktop: where the probe rapids, touches and retracts, in work coordinates. */
export interface PreviewMove { readonly kind: "rapid" | "probe" | "retract"; readonly from: Vec3; readonly to: Vec3 }

export const previewMoves = (moves: ReadonlyArray<Move>): ReadonlyArray<PreviewMove> => {
  const out: PreviewMove[] = []
  let at: Vec3 | undefined
  for (const m of moves) {
    if (m._tag !== "Probe" && m._tag !== "Rapid" && m._tag !== "Linear") continue
    const to = m.to
    if (at === undefined) { at = to; continue }
    if (m._tag === "Probe" && m.kind === "touch") {
      const end = add(to, scale(m.direction, m.overtravel))
      out.push({ kind: "probe", from: at, to: end })
      at = to
    } else {
      const retract = to.z > at.z + 1e-9 && Math.hypot(to.x - at.x, to.y - at.y) < 1e-9
      out.push({ kind: retract ? "retract" : "rapid", from: at, to })
      at = to
    }
  }
  return out
}
