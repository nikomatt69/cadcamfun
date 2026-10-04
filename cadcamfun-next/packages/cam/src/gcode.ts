import { expandCycle, type Motion } from "./toolpath"

export interface ParseResult {
  readonly moves: ReadonlyArray<Motion>
  readonly units: "mm" | "inch"
  readonly warnings: ReadonlyArray<string>
}

const WORD = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g

/**
 * Parse G-code into linear moves for preview and analysis. Supports G0/G1/G2/G3 (arcs are
 * linearised, I/J or R form), canned drilling cycles (G81/G82/G83, G80, G98/G99), G20/G21,
 * G90/G91 and F. Unknown words are ignored.
 */
export const parse = (source: string, options: { readonly arcSegmentLength?: number } = {}): ParseResult => {
  const seg = options.arcSegmentLength ?? 0.5
  const moves: Array<Motion> = []
  const warnings: Array<string> = []
  let units: "mm" | "inch" = "mm"
  let absolute = true
  let motion = 0
  let pos = { x: 0, y: 0, z: 0 }
  let feed = 0
  // Canned cycle modal state.
  let cycle: { r: number; z: number; q: number; initialZ: number } | undefined
  let returnToInitial = true

  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw
      .replace(/\(.*?\)/g, "")
      .replace(/;.*$/, "")
      .toUpperCase()
      .trim()
    if (!line || line === "%") return
    const words = new Map<string, number>()
    const gs: Array<number> = []
    for (const [, letter, value] of line.matchAll(WORD)) {
      if (letter === "G") gs.push(Number(value))
      else words.set(letter!, Number(value))
    }
    for (const g of gs) {
      if (g === 0 || g === 1 || g === 2 || g === 3) {
        motion = g
        cycle = undefined
      } else if (g === 81 || g === 82 || g === 83) {
        motion = g
        cycle = { r: cycle?.r ?? pos.z, z: cycle?.z ?? pos.z, q: 0, initialZ: cycle?.initialZ ?? pos.z }
      } else if (g === 80) {
        motion = 0
        cycle = undefined
      } else if (g === 98) returnToInitial = true
      else if (g === 99) returnToInitial = false
      else if (g === 20) units = "inch"
      else if (g === 21) units = "mm"
      else if (g === 90) absolute = true
      else if (g === 91) absolute = false
    }
    if (words.has("F")) feed = words.get("F")!
    const hasAxis = words.has("X") || words.has("Y") || words.has("Z")
    if (!hasAxis) return
    const axis = (k: "X" | "Y" | "Z", cur: number) =>
      words.has(k) ? (absolute ? words.get(k)! : cur + words.get(k)!) : cur
    if (cycle && motion >= 81) {
      if (words.has("R")) cycle.r = words.get("R")!
      if (words.has("Z")) cycle.z = words.get("Z")!
      if (words.has("Q")) cycle.q = words.get("Q")!
      const x = axis("X", pos.x)
      const y = axis("Y", pos.y)
      const peck = motion === 83 ? cycle.q : 0
      const expanded = expandCycle({ _tag: "DrillCycle", x, y, z: cycle.z, r: cycle.r, peck, f: feed }, pos.z)
      // G99 retracts to R instead of the initial plane.
      if (!returnToInitial) expanded[expanded.length - 1] = { _tag: "Rapid", x, y, z: cycle.r }
      moves.push(...expanded)
      pos = { x, y, z: returnToInitial ? Math.max(cycle.initialZ, cycle.r) : cycle.r }
      return
    }
    const target = { x: axis("X", pos.x), y: axis("Y", pos.y), z: axis("Z", pos.z) }

    if (motion === 0) moves.push({ _tag: "Rapid", ...target })
    else if (motion === 1) moves.push({ _tag: "Feed", ...target, f: feed })
    else {
      let cx: number
      let cy: number
      if (words.has("R")) {
        const r = words.get("R")!
        const dx = target.x - pos.x
        const dy = target.y - pos.y
        const d = Math.hypot(dx, dy)
        const h2 = r * r - (d / 2) ** 2
        if (h2 < -1e-6) {
          warnings.push(`line ${index + 1}: arc radius too small, treated as line`)
          moves.push({ _tag: "Feed", ...target, f: feed })
          pos = target
          return
        }
        const h = Math.sqrt(Math.max(0, h2)) * (motion === 2 ? -1 : 1) * Math.sign(r)
        cx = pos.x + dx / 2 - (h * dy) / d
        cy = pos.y + dy / 2 + (h * dx) / d
      } else {
        cx = pos.x + (words.get("I") ?? 0)
        cy = pos.y + (words.get("J") ?? 0)
      }
      const r = Math.hypot(pos.x - cx, pos.y - cy)
      const a0 = Math.atan2(pos.y - cy, pos.x - cx)
      let a1 = Math.atan2(target.y - cy, target.x - cx)
      if (motion === 3 && a1 <= a0 + 1e-9) a1 += Math.PI * 2
      if (motion === 2 && a1 >= a0 - 1e-9) a1 -= Math.PI * 2
      const sweep = a1 - a0
      const n = Math.max(2, Math.ceil((Math.abs(sweep) * r) / seg))
      for (let i = 1; i <= n; i++) {
        const t = i / n
        const a = a0 + sweep * t
        moves.push({
          _tag: "Feed",
          x: i === n ? target.x : cx + r * Math.cos(a),
          y: i === n ? target.y : cy + r * Math.sin(a),
          z: pos.z + (target.z - pos.z) * t,
          f: feed,
        })
      }
    }
    pos = target
  })
  return { moves, units, warnings }
}
