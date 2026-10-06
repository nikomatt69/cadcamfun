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
