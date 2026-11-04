/**
 * Machining limits (spec 69 C7): clips the toolpath a strategy made against a boundary and avoid regions, after the strategy, so every
 * strategy (2.5D, surface, multiaxis) honours the same limits through one seam.
 *
 * A feed move is cut where the tool is allowed and replaced by a lift over the rest: leaving the allowed area the tool rises to
 * `liftZ` at the exit point, crosses at that height and plunges again at the entry point. The boundary of the allowed area is found by
 * bisection to 1 micrometre, so the cut ends where the region says. Rapids and comments pass unchanged; a drilling cycle is kept or
 * dropped by its XY position; an arc that stays allowed stays an arc, one that does not is cut into chords (so its clipped part is
 * written as lines). Moves that carry rotary words are left alone: the limits are planar and are refused for them by the caller.
 */
import type { Vec2 } from "../../cad/vec.ts"
import type { Move, Toolpath } from "../ir.ts"
import type { MachiningLimits } from "./contracts.ts"

const EPS = 1e-6

const inside = (ring: ReadonlyArray<Vec2>, x: number, y: number): boolean => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

const distance = (ring: ReadonlyArray<Vec2>, x: number, y: number): number => {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!, b = ring[i]!
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2))
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)))
  }
  return best
}

/** Whether the tool centre may be at `(x, y)`: inside the boundary and outside every avoid region, by `radius` when the cutter's edge obeys them. */
export const allowedAt = (limits: MachiningLimits, radius: number, x: number, y: number): boolean => {
  const r = limits.containment === "centre" ? 0 : radius
  if (limits.boundary !== undefined && (!inside(limits.boundary, x, y) || distance(limits.boundary, x, y) < r - EPS)) return false
  for (const a of limits.avoid ?? []) if (inside(a, x, y) || distance(a, x, y) < r - EPS) return false
  return true
}

export interface LimitReport {
  readonly toolpath: Toolpath
  /** Feed moves cut short or dropped. */
  readonly clipped: number
}

interface P { x: number; y: number; z: number }

/** Clips `toolpath` (work coordinates, the limits already shifted into them) and says how many moves it changed. */
export const limitToolpath = (toolpath: Toolpath, limits: MachiningLimits, radius: number, liftZ: number): LimitReport => {
  const ok = (p: { readonly x: number; readonly y: number }): boolean => allowedAt(limits, radius, p.x, p.y)
  const step = Math.max(0.05, Math.min(radius / 4, 0.5))
  const out: Move[] = []
  let cur: P | undefined
  let lifted = false
  let clipped = 0

  const lift = (at: P): void => {
    if (lifted) return
    out.push({ _tag: "Rapid", to: { x: at.x, y: at.y, z: Math.max(liftZ, at.z) } } as Move)
    lifted = true
  }
  const enter = (at: P, feed: number): void => {
    if (!lifted) return
    out.push({ _tag: "Rapid", to: { x: at.x, y: at.y, z: Math.max(liftZ, at.z) } } as Move)
    out.push({ _tag: "Linear", to: { x: at.x, y: at.y, z: at.z }, feed } as Move)
    lifted = false
  }
  /** The point between an allowed `a` and a forbidden `b` where the tool stops being allowed. */
  const edge = (a: P, b: P): P => {
    let lo = 0, hi = 1
    for (let i = 0; i < 24 && (hi - lo) * Math.hypot(b.x - a.x, b.y - a.y) > 1e-6; i++) {
      const m = (lo + hi) / 2
      if (ok({ x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m })) lo = m; else hi = m
    }
    return { x: a.x + (b.x - a.x) * lo, y: a.y + (b.y - a.y) * lo, z: a.z + (b.z - a.z) * lo }
  }
  const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })

  /** Feeds along a polyline of points (the first is `cur`), cutting only where allowed. */
  const feedAlong = (points: ReadonlyArray<P>, feed: number): void => {
    let changed = false
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1]!, b = points[k]!
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      const n = Math.max(1, Math.ceil(len / step))
      let from = a
      let fromOk = ok(a)
      if (fromOk && lifted) enter(a, feed)
      for (let i = 1; i <= n; i++) {
        const to = i === n ? b : lerp(a, b, i / n)
        const toOk = ok(to)
        if (fromOk && toOk) { out.push({ _tag: "Linear", to: { x: to.x, y: to.y, z: to.z }, feed } as Move) }
        else if (fromOk && !toOk) { const e = edge(from, to); out.push({ _tag: "Linear", to: { x: e.x, y: e.y, z: e.z }, feed } as Move); lift(e); changed = true }
        else if (!fromOk && toOk) { const e = edge(to, from); enter(e, feed); out.push({ _tag: "Linear", to: { x: to.x, y: to.y, z: to.z }, feed } as Move); changed = true }
        else changed = true
        from = to; fromOk = toOk
      }
    }
    if (changed) clipped++
  }

  for (const m of toolpath.moves) {
    if (m._tag === "Rapid") {
      out.push(m); cur = { x: m.to.x, y: m.to.y, z: m.to.z }
      // A rapid that ends inside the limits ends the lift; one that ends outside leaves the tool lifted.
      lifted = !ok(cur) ? true : false
    } else if (m._tag === "Linear" && m.rotary === undefined) {
      const to = { x: m.to.x, y: m.to.y, z: m.to.z }
      feedAlong([cur ?? to, to], m.feed)
      cur = to
    } else if (m._tag === "Arc" && cur !== undefined) {
      const c = m.center, a0 = Math.atan2(cur.y - c.y, cur.x - c.x)
      const r = Math.hypot(cur.x - c.x, cur.y - c.y)
      let sweep = Math.atan2(m.to.y - c.y, m.to.x - c.x) - a0
      if (m.clockwise) { while (sweep >= 0) sweep -= 2 * Math.PI } else { while (sweep <= 0) sweep += 2 * Math.PI }
      const n = Math.max(2, Math.ceil((Math.abs(sweep) * r) / step))
      const pts: P[] = [cur]
      for (let i = 1; i <= n; i++) {
        const t = i / n, a = a0 + sweep * t
        pts.push(i === n ? { x: m.to.x, y: m.to.y, z: m.to.z } : { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), z: cur.z + (m.to.z - cur.z) * t })
      }
      if (!lifted && pts.every(ok)) out.push(m)
      else feedAlong(pts, m.feed)
      cur = { x: m.to.x, y: m.to.y, z: m.to.z }
    } else if (m._tag === "Cycle") {
      if (ok(m.to)) out.push(m); else clipped++
      cur = { x: m.to.x, y: m.to.y, z: m.to.z }
    } else {
      out.push(m)
      if ("to" in m && m.to !== undefined) cur = { x: (m.to as P).x, y: (m.to as P).y, z: (m.to as P).z }
    }
  }
  return { toolpath: { ...toolpath, moves: out }, clipped }
}
