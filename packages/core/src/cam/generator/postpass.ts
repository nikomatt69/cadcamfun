/** Text post-passes: redundant-move removal, arc fitting and fixed-cycle detection. */
import { f3, type Point2 } from "./common.ts"

// -- post passes ---------------------------------------------------------------------------------

export const axisWord = (line: string, axis: string): number | null => {
  const match = line.match(new RegExp(`${axis}([+-]?\\d*\\.?\\d+)`))
  return match ? parseFloat(match[1]!) : null
}

/** Drops duplicate and sub-tolerance `G0/G1` moves (legacy `optimizeToolpath`), tracking modal state across arcs. */
export const optimizeToolpath = (gcode: string, tolerance: number): string => {
  const out: string[] = []
  let cx: number | null = null
  let cy: number | null = null
  let cz: number | null = null
  let cf: number | null = null
  let lastMotion: "G0" | "G1" | null = null
  for (const raw of gcode.split("\n")) {
    const line = raw.trim()
    const motion = line.startsWith("G0 ") || line === "G0" ? "G0" : line.startsWith("G1 ") || line === "G1" ? "G1" : null
    if (line.startsWith(";") || motion === null) {
      // Any other motion word (arcs, cycles) invalidates the remembered position.
      if (/^G[0-3]\d*\b/.test(line) || /^G(2|3|8\d)\b/.test(line)) {
        cx = cy = cz = null
        lastMotion = null
      }
      out.push(line)
      continue
    }
    const x: number | null = axisWord(line, "X") ?? cx
    const y: number | null = axisWord(line, "Y") ?? cy
    const z: number | null = axisWord(line, "Z") ?? cz
    const f: number | null = axisWord(line, "F") ?? cf
    if (x === cx && y === cy && z === cz && f === cf && motion === lastMotion) continue
    const small = cx !== null && cy !== null && cz !== null && x !== null && y !== null && z !== null &&
      Math.hypot(x - cx, y - cy, z - cz) < tolerance
    if (small && motion === "G1" && lastMotion === "G1") continue
    cx = x; cy = y; cz = z; cf = f; lastMotion = motion
    out.push(line)
  }
  return out.join("\n")
}

interface Pt3 { x: number; y: number; z: number }

export const parseLinear = (line: string): Pt3 | null => {
  if (!/^G1\b/.test(line)) return null
  const x = axisWord(line, "X")
  const y = axisWord(line, "Y")
  if (x === null || y === null) return null
  return { x, y, z: axisWord(line, "Z") ?? 0 }
}

export const circumcentre = (a: Pt3, b: Pt3, c: Pt3): Point2 | null => {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-9) return null
  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  }
}

/**
 * Replaces runs of `G1` points that lie on one circle (within `tolerance`) by a single `G2/G3`.
 * Legacy `convertLinesToArcs` used the chord midpoint as the centre and accepted any three points.
 */
export const convertLinesToArcs = (gcode: string, tolerance: number): string => {
  const rows = gcode.split("\n")
  const result: string[] = []
  let feed: number | null = null
  let i = 0
  const lastFeed = (line: string): void => {
    const f = axisWord(line, "F")
    if (f !== null) feed = f
  }
  while (i < rows.length) {
    const first = parseLinear(rows[i]!.trim())
    if (!first) {
      lastFeed(rows[i]!)
      result.push(rows[i]!)
      i++
      continue
    }
    // collect a run of consecutive points on the same Z
    const run: Array<{ p: Pt3; line: string }> = [{ p: first, line: rows[i]! }]
    let j = i + 1
    while (j < rows.length) {
      const next = parseLinear(rows[j]!.trim())
      if (!next || next.z !== first.z) break
      run.push({ p: next, line: rows[j]! })
      j++
    }
    lastFeed(rows[i]!)
    if (run.length < 4) {
      for (const r of run) { lastFeed(r.line); result.push(r.line) }
      i = j
      continue
    }
    // Try to fit the whole run; otherwise keep the lines.
    const a = run[0]!.p
    const m = run[Math.floor(run.length / 2)]!.p
    const b = run[run.length - 1]!.p
    const center = circumcentre(a, m, b)
    let ok = center !== null
    if (center) {
      const radius = Math.hypot(a.x - center.x, a.y - center.y)
      for (const r of run) {
        if (Math.abs(Math.hypot(r.p.x - center.x, r.p.y - center.y) - radius) > tolerance) { ok = false; break }
      }
      // a polygon corner is not an arc: chord sag must stay within tolerance
      if (ok) {
        for (let k = 1; k < run.length; k++) {
          const chord = Math.hypot(run[k]!.p.x - run[k - 1]!.p.x, run[k]!.p.y - run[k - 1]!.p.y)
          const sag = radius - Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2))
          if (sag > tolerance) { ok = false; break }
        }
      }
      const closed = Math.hypot(a.x - b.x, a.y - b.y) < 1e-6
      if (ok && center && !closed) {
        const cross = (m.x - a.x) * (b.y - m.y) - (m.y - a.y) * (b.x - m.x)
        const code = cross < 0 ? "G2" : "G3"
        const f = axisWord(rows[i]!, "F") ?? feed
        result.push(`G1 X${f3(a.x)} Y${f3(a.y)}${f !== null ? ` F${f}` : ""}`)
        result.push(`${code} X${f3(b.x)} Y${f3(b.y)} I${f3(center.x - a.x)} J${f3(center.y - a.y)}${f !== null ? ` F${f}` : ""} ; Arc converted from linear segments`)
        i = j
        continue
      }
    }
    for (const r of run) { lastFeed(r.line); result.push(r.line) }
    i = j
  }
  return result.join("\n")
}

export interface GenerateResult {
  readonly gcode: string
  readonly error?: string
}

// -- adaptive feed -------------------------------------------------------------------------------

interface FeedMove {
  readonly index: number
  readonly kind: 1 | 2 | 3
  readonly from: readonly [number, number, number]
  readonly to: readonly [number, number, number]
  /** The feed in force after this line in the original program (mm/min), if one has been set. */
  readonly feed: number | null
  /** Tangent of the path (unit, XY) where the move starts and where it ends; undefined for a pure Z move. */
  readonly tIn?: readonly [number, number]
  readonly tOut?: readonly [number, number]
  readonly length: number
  /** Smallest radius of curvature inside the move (an arc's radius); Infinity for a line. */
  readonly radius: number
}

const formatFeed = (feed: number): string => (feed >= 100 ? String(Math.round(feed)) : f3(feed))

/**
 * Feed that follows the path: the cutter is slowed where the path turns, so that the corner or curve is cut at a load the machine
 * and the tool can follow, and brought back to the programmed feed on the straights.
 *
 *   corner   Between two consecutive cutting moves the direction changes by theta. Under 15 degrees nothing changes; from there the
 *            feed falls linearly to half of the programmed one at 90 degrees and stays there. Both moves that meet at the corner
 *            are slowed (the approach and the exit).
 *   curve    A short-step polyline or an arc of radius rho smaller than 1.5 tool diameters is slowed in proportion to rho (never
 *            below 40 %); a polyline's radius is its step over the turn between steps.
 *   kept     Rapids, vertical moves and helical arcs (plunges have their own feed) are not touched, nor is a program with no feed
 *            set before a move.
 *
 * Pure text transformation of a mill program; the factor is applied to the feed in force when each move is read, so it is meant to
 * be applied once to a freshly generated program.
 */
export const adaptFeeds = (gcode: string, toolDiameter: number): string => {
  const lines = gcode.split("\n")
  const moves: FeedMove[] = []
  const at = { x: 0, y: 0, z: 0 }
  let known = false
  let feed: number | null = null
  const num = (line: string, axis: string): number | null => axisWord(line, axis)
  lines.forEach((raw, index) => {
    const line = raw.trim()
    const m = /^G0?([0-3])\b/.exec(line)
    if (m === null || line.startsWith(";")) return
    const kind = Number(m[1])
    const f = num(line, "F")
    if (f !== null) feed = f
    const to = { x: num(line, "X") ?? at.x, y: num(line, "Y") ?? at.y, z: num(line, "Z") ?? at.z }
    if (kind >= 1 && known) {
      const dx = to.x - at.x, dy = to.y - at.y
      const xy = Math.hypot(dx, dy)
      const base = { index, kind: kind as 1 | 2 | 3, from: [at.x, at.y, at.z] as const, to: [to.x, to.y, to.z] as const, feed }
      if (kind === 1) {
        moves.push(xy > 1e-9
          ? { ...base, tIn: [dx / xy, dy / xy], tOut: [dx / xy, dy / xy], length: xy, radius: Infinity }
          : { ...base, length: Math.abs(to.z - at.z), radius: Infinity })
      } else {
        const i = num(line, "I") ?? 0, j = num(line, "J") ?? 0
        const r = Math.hypot(i, j)
        const cx = at.x + i, cy = at.y + j
        const cw = kind === 2
        const tangent = (px: number, py: number): readonly [number, number] => {
          const rx = (px - cx) / (r || 1), ry = (py - cy) / (r || 1)
          return cw ? [ry, -rx] : [-ry, rx]
        }
        const helical = Math.abs(to.z - at.z) > 1e-6
        moves.push(r > 1e-9 && !helical
          ? { ...base, tIn: tangent(at.x, at.y), tOut: tangent(to.x, to.y), length: Math.max(xy, 1e-6), radius: r }
          : { ...base, length: xy, radius: Infinity })
      }
    }
    at.x = to.x; at.y = to.y; at.z = to.z
    if (num(line, "X") !== null || num(line, "Y") !== null || num(line, "Z") !== null) known = true
  })

  const factor = new Map<number, number>()
  const slow = (index: number, f: number): void => { factor.set(index, Math.min(factor.get(index) ?? 1, f)) }
  const D = Math.max(toolDiameter, 1e-6)
  moves.forEach((a, k) => {
    if (a.tIn !== undefined && a.radius < 1.5 * D) slow(a.index, Math.max(0.4, a.radius / (1.5 * D)))
    const b = moves[k + 1]
    if (b === undefined || a.tOut === undefined || b.tIn === undefined) return
    const cos = Math.max(-1, Math.min(1, a.tOut[0] * b.tIn[0] + a.tOut[1] * b.tIn[1]))
    const theta = Math.acos(cos)
    if (theta < 1e-3) return
    let f = 1
    if (theta >= (30 * Math.PI) / 180) f = theta >= Math.PI / 2 ? 0.5 : 1 - 0.5 * ((theta - (15 * Math.PI) / 180) / (Math.PI / 2 - (15 * Math.PI) / 180))
    else {
      // A gentle turn between short steps is a curve: its radius is the step over the turn.
      const rho = (0.5 * (a.length + b.length)) / theta
      if (rho < 1.5 * D) f = Math.max(0.4, rho / (1.5 * D))
    }
    if (f < 1) { slow(a.index, f); slow(b.index, f) }
  })

  const byIndex = new Map(moves.map((mv) => [mv.index, mv]))
  let last: number | null = null
  return lines.map((raw, index) => {
    const mv = byIndex.get(index)
    if (mv === undefined || mv.feed === null) return raw
    const desired = Math.round(mv.feed * (factor.get(index) ?? 1) * 1000) / 1000
    const stripped = raw.replace(/\s+F[+-]?\d*\.?\d+/i, "")
    if (last === desired) { last = desired; return stripped }
    last = desired
    return `${stripped} F${formatFeed(desired)}`
  }).join("\n")
}
