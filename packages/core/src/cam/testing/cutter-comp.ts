/**
 * Cutter radius compensation geometry (G41 / G42 in the XY plane, spec 32 §4.3): the path the tool centre really follows when
 * the program describes the part's contour and the control offsets it by the tool radius.
 *
 *   offset     every line and arc moves `radius` to the left (G41) or right (G42) of the direction of travel; an arc keeps
 *              its centre and changes its radius (smaller when the offset is towards the centre)
 *   inside     at a corner turning towards the offset side the two offset elements are cut back to where they intersect
 *   outside    at a corner turning away from it the tool rolls round the corner on an arc of the tool radius (the
 *              transition circle of Siemens G450 / Haas; Fanuc type C extends lines instead — the part is the same)
 *
 * Z is carried along: an element keeps its programmed heights, a join is at the height where the two elements meet.
 */
import type { P3 } from "./gcode-interpreter.ts"

export interface CompLine { readonly kind: "line"; readonly from: P3; readonly to: P3 }
export interface CompArc { readonly kind: "arc"; readonly from: P3; readonly to: P3; readonly center: { readonly x: number; readonly y: number }; readonly clockwise: boolean }
export type CompElement = CompLine | CompArc

/** +1: the tool on the left of the travel (G41); -1: on the right (G42). */
export type CompSide = 1 | -1

interface V2 { readonly x: number; readonly y: number }
const EPS = 1e-9

const unit = (x: number, y: number): V2 | undefined => {
  const l = Math.hypot(x, y)
  return l < EPS ? undefined : { x: x / l, y: y / l }
}

/** Direction of travel at the start or the end of an element (XY); `undefined` for an element with no XY length. */
export const tangentOf = (e: CompElement, at: "start" | "end"): V2 | undefined => {
  if (e.kind === "line") return unit(e.to.x - e.from.x, e.to.y - e.from.y)
  const p = at === "start" ? e.from : e.to
  const u = unit(p.x - e.center.x, p.y - e.center.y)
  if (u === undefined) return undefined
  return e.clockwise ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x }
}

/** The offset direction for a travel direction: left of it for G41, right for G42. */
export const normalOf = (t: V2, side: CompSide): V2 => (side === 1 ? { x: -t.y, y: t.x } : { x: t.y, y: -t.x })

const shifted = (p: P3, n: V2, r: number): P3 => ({ x: p.x + n.x * r, y: p.y + n.y * r, z: p.z })

/** The element moved by the radius; `undefined` when an arc's offset radius is not positive (the tool does not fit). */
export const offsetElement = (e: CompElement, side: CompSide, radius: number): CompElement | undefined => {
  const t0 = tangentOf(e, "start"), t1 = tangentOf(e, "end")
  if (t0 === undefined || t1 === undefined) return undefined
  if (e.kind === "line") { const n = normalOf(t0, side); return { kind: "line", from: shifted(e.from, n, radius), to: shifted(e.to, n, radius) } }
  const R = Math.hypot(e.from.x - e.center.x, e.from.y - e.center.y)
  // The left of a counter-clockwise arc is its centre.
  const inward = (side === 1) === !e.clockwise
  const Ro = inward ? R - radius : R + radius
  if (Ro <= EPS) return undefined
  const on = (p: P3): P3 => {
    const R1 = Math.hypot(p.x - e.center.x, p.y - e.center.y)
    const k = (inward ? R1 - radius : R1 + radius) / Math.max(R1, EPS)
    return { x: e.center.x + (p.x - e.center.x) * k, y: e.center.y + (p.y - e.center.y) * k, z: p.z }
  }
  return { kind: "arc", from: on(e.from), to: on(e.to), center: e.center, clockwise: e.clockwise }
}

const cross = (a: V2, b: V2): number => a.x * b.y - a.y * b.x
const dot = (a: V2, b: V2): number => a.x * b.x + a.y * b.y

/** Intersections of two offset elements taken whole (lines infinite, arcs full circles), XY. */
const intersections = (a: CompElement, b: CompElement): V2[] => {
  const lineCircle = (l: CompLine, c: CompArc): V2[] => {
    const d = unit(l.to.x - l.from.x, l.to.y - l.from.y)
    if (d === undefined) return []
    const R = Math.hypot(c.from.x - c.center.x, c.from.y - c.center.y)
    const fx = l.from.x - c.center.x, fy = l.from.y - c.center.y
    const bq = fx * d.x + fy * d.y, cq = fx * fx + fy * fy - R * R
    const disc = bq * bq - cq
    if (disc < -1e-9) return []
    const s = Math.sqrt(Math.max(0, disc))
    return [-bq - s, -bq + s].map((t) => ({ x: l.from.x + d.x * t, y: l.from.y + d.y * t }))
  }
  if (a.kind === "line" && b.kind === "line") {
    const u = { x: a.to.x - a.from.x, y: a.to.y - a.from.y }, v = { x: b.to.x - b.from.x, y: b.to.y - b.from.y }
    const den = cross(u, v)
    if (Math.abs(den) < EPS) return []
    const t = cross({ x: b.from.x - a.from.x, y: b.from.y - a.from.y }, v) / den
    return [{ x: a.from.x + u.x * t, y: a.from.y + u.y * t }]
  }
  if (a.kind === "line" && b.kind === "arc") return lineCircle(a, b)
  if (a.kind === "arc" && b.kind === "line") return lineCircle(b, a)
  const A = a as CompArc, B = b as CompArc
  const r0 = Math.hypot(A.from.x - A.center.x, A.from.y - A.center.y), r1 = Math.hypot(B.from.x - B.center.x, B.from.y - B.center.y)
  const dx = B.center.x - A.center.x, dy = B.center.y - A.center.y, d = Math.hypot(dx, dy)
  if (d < EPS || d > r0 + r1 + 1e-9 || d < Math.abs(r0 - r1) - 1e-9) return []
  const along = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, r0 * r0 - along * along))
  const mx = A.center.x + (dx * along) / d, my = A.center.y + (dy * along) / d
  return [{ x: mx + (-dy * h) / d, y: my + (dx * h) / d }, { x: mx - (-dy * h) / d, y: my - (dx * h) / d }]
}

/** How the tool goes from one offset element to the next at the programmed corner. */
export type CompJoin =
  /** The previous element ends, and the next starts, at `point` (an inside corner, or a smooth one). */
  | { readonly kind: "meet"; readonly point: P3 }
  /** The tool rolls round the corner: the previous element ends at `from`, an arc about `center` takes it to `to`. */
  | { readonly kind: "roll"; readonly from: P3; readonly to: P3; readonly center: { readonly x: number; readonly y: number }; readonly clockwise: boolean }

/**
 * The join between `prev` and `next` (programmed elements meeting at `prev.to`), given their offsets. `undefined` when the
 * elements have no XY direction there.
 */
export const joinOf = (prev: CompElement, next: CompElement, prevOffset: CompElement, nextOffset: CompElement, side: CompSide): CompJoin | undefined => {
  const t0 = tangentOf(prev, "end"), t1 = tangentOf(next, "start")
  if (t0 === undefined || t1 === undefined) return undefined
  const corner = prev.to
  const a = prevOffset.to, b = nextOffset.from
  if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-7) return { kind: "meet", point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: corner.z } }
  const turn = cross(t0, t1)
  const inside = side * turn > 1e-9 || (Math.abs(turn) <= 1e-9 && dot(t0, t1) > 0)
  if (inside) {
    const candidates = intersections(prevOffset, nextOffset)
    if (candidates.length > 0) {
      const best = candidates.reduce((p, q) => (Math.hypot(q.x - corner.x, q.y - corner.y) < Math.hypot(p.x - corner.x, p.y - corner.y) ? q : p))
      return { kind: "meet", point: { x: best.x, y: best.y, z: corner.z } }
    }
  }
  return { kind: "roll", from: a, to: { ...b, z: a.z }, center: { x: corner.x, y: corner.y }, clockwise: side === 1 }
}

/**
 * Where `point` lies along an offset line (0 at its start, 1 at its end); used to tell an inside corner that eats a whole
 * element (the tool is larger than the element: the control would overcut or alarm).
 */
export const alongLine = (l: CompLine, point: V2): number => {
  const dx = l.to.x - l.from.x, dy = l.to.y - l.from.y
  const len2 = dx * dx + dy * dy
  return len2 < EPS ? 0 : ((point.x - l.from.x) * dx + (point.y - l.from.y) * dy) / len2
}
