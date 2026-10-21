/**
 * Sketch editing tools on the entity model: where two entities cross, Trim (remove the stretch of a line, circle or arc under the
 * cursor between its neighbouring crossings) and Extend (run a line's end on to the first entity it meets). Pure functions: each
 * returns a new `Sketch`, or an error string, and never edits the one it was given. Constraints that mention a point the tool
 * removed are dropped with it; the others stay.
 */
import type { Constraint, Sketch, SketchArc, SketchEntity, SketchLine, SketchPoint } from "./sketch.ts"
import type { Vec2 } from "./vec.ts"

const TAU = Math.PI * 2
const EPS = 1e-9

const pointOf = (s: Sketch, id: string): SketchPoint | undefined => s.entities.find((e): e is SketchPoint => e.kind === "point" && e.id === id)
const at = (s: Sketch, id: string): Vec2 => {
  const p = pointOf(s, id)
  if (p === undefined) throw new Error(`point '${id}' is not in the sketch`)
  return { x: p.x, y: p.y }
}

/** A circle or an arc as centre, radius and a counter-clockwise angular span (a circle: the full turn). */
interface Round { readonly c: Vec2; readonly r: number; readonly a0: number; readonly span: number }
interface Segment { readonly a: Vec2; readonly b: Vec2 }

const angleOf = (c: Vec2, p: Vec2): number => Math.atan2(p.y - c.y, p.x - c.x)
const norm = (a: number): number => ((a % TAU) + TAU) % TAU

const geometry = (s: Sketch, e: SketchEntity): { readonly seg: Segment } | { readonly round: Round } | undefined => {
  if (e.kind === "line") return { seg: { a: at(s, e.p1), b: at(s, e.p2) } }
  if (e.kind === "circle") return { round: { c: at(s, e.center), r: e.radius, a0: 0, span: TAU } }
  if (e.kind === "arc") {
    const c = at(s, e.center), st = at(s, e.start), en = at(s, e.end)
    const a0 = angleOf(c, st)
    return { round: { c, r: Math.hypot(st.x - c.x, st.y - c.y), a0, span: norm(angleOf(c, en) - a0) || TAU } }
  }
  return undefined
}

const onSpan = (r: Round, p: Vec2): boolean => r.span >= TAU - EPS || norm(angleOf(r.c, p) - r.a0) <= r.span + 1e-9

/** Crossings of the infinite carriers; `bounded` limits them to the segments / arcs themselves. */
const cross = (g1: ReturnType<typeof geometry>, g2: ReturnType<typeof geometry>, bounded: boolean): Vec2[] => {
  if (g1 === undefined || g2 === undefined) return []
  const out: Vec2[] = []
  if ("seg" in g1 && "seg" in g2) {
    const d1 = { x: g1.seg.b.x - g1.seg.a.x, y: g1.seg.b.y - g1.seg.a.y }, d2 = { x: g2.seg.b.x - g2.seg.a.x, y: g2.seg.b.y - g2.seg.a.y }
    const den = d1.x * d2.y - d1.y * d2.x
    if (Math.abs(den) < EPS) return []
    const w = { x: g2.seg.a.x - g1.seg.a.x, y: g2.seg.a.y - g1.seg.a.y }
    const t = (w.x * d2.y - w.y * d2.x) / den, u = (w.x * d1.y - w.y * d1.x) / den
    if (!bounded || (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS)) out.push({ x: g1.seg.a.x + d1.x * t, y: g1.seg.a.y + d1.y * t })
    return out
  }
  if ("seg" in g1 && "round" in g2) return lineRound(g1.seg, g2.round, bounded)
  if ("round" in g1 && "seg" in g2) return lineRound(g2.seg, g1.round, bounded)
  if ("round" in g1 && "round" in g2) {
    const a = g1.round, b = g2.round
    const d = Math.hypot(b.c.x - a.c.x, b.c.y - a.c.y)
    if (d < EPS || d > a.r + b.r + EPS || d < Math.abs(a.r - b.r) - EPS) return []
    const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d)
    const h = Math.sqrt(Math.max(0, a.r * a.r - x * x))
    const ux = (b.c.x - a.c.x) / d, uy = (b.c.y - a.c.y) / d
    const m = { x: a.c.x + ux * x, y: a.c.y + uy * x }
    const pts = h < 1e-9 ? [m] : [{ x: m.x - uy * h, y: m.y + ux * h }, { x: m.x + uy * h, y: m.y - ux * h }]
    return pts.filter((p) => !bounded || (onSpan(a, p) && onSpan(b, p)))
  }
  return out
}

const lineRound = (s: Segment, r: Round, bounded: boolean): Vec2[] => {
  const d = { x: s.b.x - s.a.x, y: s.b.y - s.a.y }
  const f = { x: s.a.x - r.c.x, y: s.a.y - r.c.y }
  const A = d.x * d.x + d.y * d.y, B = 2 * (f.x * d.x + f.y * d.y), C = f.x * f.x + f.y * f.y - r.r * r.r
  const disc = B * B - 4 * A * C
  if (A < EPS || disc < -EPS) return []
  const root = Math.sqrt(Math.max(0, disc))
  const ts = root < 1e-9 ? [-B / (2 * A)] : [(-B - root) / (2 * A), (-B + root) / (2 * A)]
  return ts
    .map((t) => ({ t, p: { x: s.a.x + d.x * t, y: s.a.y + d.y * t } }))
    .filter(({ t, p }) => !bounded || (t >= -EPS && t <= 1 + EPS && onSpan(r, p)))
    .map(({ p }) => p)
}

/** Where entity `a` crosses entity `b` (within both), as points. */
export const entityIntersections = (sketch: Sketch, a: string, b: string): Vec2[] => {
  const ea = sketch.entities.find((e) => e.id === a), eb = sketch.entities.find((e) => e.id === b)
  if (ea === undefined || eb === undefined) return []
  return cross(geometry(sketch, ea), geometry(sketch, eb), true)
}

const uid = (s: Sketch, base: string): string => {
  const ids = new Set(s.entities.map((e) => e.id))
  for (let k = 1; ; k++) if (!ids.has(`${base}${k}`)) return `${base}${k}`
}

const withoutIds = (cs: ReadonlyArray<Constraint>, removed: ReadonlySet<string>): Constraint[] =>
  cs.filter((c) => !Object.values(c).some((v) => typeof v === "string" && removed.has(v)))

/**
 * Trim: removes the stretch of line, circle or arc `id` that contains `pick` (a point on or near it), between the crossings with
 * the other entities that bound it. A line keeps the stretches outside (one or two lines); a circle becomes the arc that remains;
 * an arc keeps the rest of its span. With no crossing the entity is deleted.
 */
export const trimEntity = (sketch: Sketch, id: string, pick: Vec2): Sketch | string => {
  const e = sketch.entities.find((x) => x.id === id)
  if (e === undefined) return `'${id}' is not in the sketch`
  const g = geometry(sketch, e)
  if (g === undefined || e.kind === "point") return `'${id}' cannot be trimmed`
  const others = sketch.entities.filter((x) => x.id !== id && x.kind !== "point")
  const hits = others.flatMap((o) => cross(g, geometry(sketch, o), true))
  const removed = new Set<string>([id])
  const kept = sketch.entities.filter((x) => x.id !== id)
  if ("seg" in g) {
    const l = e as SketchLine
    const d = { x: g.seg.b.x - g.seg.a.x, y: g.seg.b.y - g.seg.a.y }
    const len2 = d.x * d.x + d.y * d.y
    const tOf = (p: Vec2) => ((p.x - g.seg.a.x) * d.x + (p.y - g.seg.a.y) * d.y) / len2
    const ts = [...new Set(hits.map((p) => Math.round(tOf(p) * 1e9) / 1e9))].filter((t) => t > 1e-7 && t < 1 - 1e-7).sort((a, b) => a - b)
    const tp = Math.max(0, Math.min(1, tOf(pick)))
    const lo = [...ts].reverse().find((t) => t <= tp), hi = ts.find((t) => t >= tp)
    if (lo === undefined && hi === undefined) return { entities: kept, constraints: withoutIds(sketch.constraints, removed) }
    const newPts: SketchPoint[] = []
    const pointAt = (t: number): string => {
      const pid = uid({ entities: [...kept, ...newPts], constraints: [] }, "pt")
      newPts.push({ id: pid, kind: "point", x: g.seg.a.x + d.x * t, y: g.seg.a.y + d.y * t })
      return pid
    }
    const pieces: SketchLine[] = []
    const mk = (p1: string, p2: string) => pieces.push({ id: uid({ entities: [...kept, ...newPts, ...pieces], constraints: [] }, `${id}_`), kind: "line", p1, p2 })
    if (lo !== undefined) mk(l.p1, pointAt(lo))
    if (hi !== undefined) mk(pointAt(hi), l.p2)
    // Points the removed stretch leaves unused (an end with nothing else on it) go too.
    const used = new Set<string>([...kept, ...pieces].flatMap((x) => (x.kind === "line" ? [x.p1, x.p2] : x.kind === "circle" || x.kind === "arc" ? [x.center] : [])))
    const dropEnds = [l.p1, l.p2].filter((p) => !used.has(p))
    const entities = [...kept.filter((x) => !(x.kind === "point" && dropEnds.includes(x.id))), ...newPts, ...pieces]
    return { entities, constraints: withoutIds(sketch.constraints, new Set([...removed, ...dropEnds])) }
  }
  const r = g.round
  const rel = (p: Vec2) => norm(angleOf(r.c, p) - r.a0)
  const cuts = [...new Set(hits.map((p) => Math.round(rel(p) * 1e9) / 1e9))].filter((t) => e.kind === "circle" || (t > 1e-7 && t < r.span - 1e-7)).sort((a, b) => a - b)
  if (cuts.length === 0 || (e.kind === "circle" && cuts.length < 2)) {
    return e.kind === "circle" && cuts.length === 1 ? "a circle needs two crossings to trim" : { entities: kept, constraints: withoutIds(sketch.constraints, removed) }
  }
  const tp = rel(pick)
  const centreId = e.kind === "circle" ? e.center : (e as SketchArc).center
  const point = (t: number): SketchPoint => ({ id: "", kind: "point", x: r.c.x + r.r * Math.cos(r.a0 + t), y: r.c.y + r.r * Math.sin(r.a0 + t) })
  const newPts: SketchPoint[] = []
  const add = (t: number): string => {
    const p = point(t)
    const pid = uid({ entities: [...kept, ...newPts], constraints: [] }, "pt")
    newPts.push({ ...p, id: pid })
    return pid
  }
  const arcs: SketchArc[] = []
  const arc = (from: string, to: string) => arcs.push({ id: uid({ entities: [...kept, ...newPts, ...arcs], constraints: [] }, `${id}_`), kind: "arc", center: centreId, start: from, end: to })
  if (e.kind === "circle") {
    // The stretch under the pick is between its neighbouring crossings (wrapping through zero); the arc that stays runs from the upper one round to the lower.
    const below = [...cuts].reverse().find((t) => t <= tp) ?? cuts[cuts.length - 1]!
    const above = cuts.find((t) => t > tp) ?? cuts[0]!
    arc(add(above), add(below))
  } else {
    const a = e as SketchArc
    const lo = [...cuts].reverse().find((t) => t <= tp), hi = cuts.find((t) => t >= tp)
    if (lo !== undefined) arc(a.start, add(lo))
    if (hi !== undefined) arc(add(hi), a.end)
  }
  return { entities: [...kept, ...newPts, ...arcs], constraints: withoutIds(sketch.constraints, removed) }
}

/**
 * Extend: runs end `end` of line `id` along its own direction to the first crossing with `target` (a line, circle or arc; a line
 * target is taken as its carrier line extended). Moves that end point; an error string when the line never reaches the target.
 */
export const extendLine = (sketch: Sketch, id: string, end: "p1" | "p2", target: string): Sketch | string => {
  const e = sketch.entities.find((x) => x.id === id)
  if (e === undefined || e.kind !== "line") return `'${id}' is not a line of the sketch`
  const t = sketch.entities.find((x) => x.id === target)
  if (t === undefined || t.kind === "point") return `'${target}' is not an entity to extend to`
  const a = at(sketch, e.p1), b = at(sketch, e.p2)
  const moving = end === "p1" ? a : b, fixed = end === "p1" ? b : a
  const dir = { x: moving.x - fixed.x, y: moving.y - fixed.y }
  const len = Math.hypot(dir.x, dir.y)
  if (len < EPS) return `line '${id}' has no length`
  // The ray from the fixed end through the moving end, past the moving end.
  const g = geometry(sketch, t)
  const carrier: Segment = { a: fixed, b: moving }
  const gt = g !== undefined && "seg" in g ? g : g
  const hits = cross({ seg: carrier }, gt, false)
    .map((p) => ({ p, s: ((p.x - fixed.x) * dir.x + (p.y - fixed.y) * dir.y) / (len * len) }))
    .filter(({ s, p }) => s > 1 + 1e-9 && (gt === undefined || !("round" in gt) || onSpan(gt.round, p)))
    .sort((x, y) => x.s - y.s)
  if (hits.length === 0) return `line '${id}' does not reach '${target}' when extended`
  const to = hits[0]!.p
  const pid = end === "p1" ? e.p1 : e.p2
  return { entities: sketch.entities.map((x) => (x.kind === "point" && x.id === pid ? { ...x, x: to.x, y: to.y } : x)), constraints: sketch.constraints }
}
