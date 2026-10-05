/** Helpers that turn a toolpath into G-code and check geometric invariants on the *text*. */
import { type Program, type Toolpath, makeProgram, toolpathLength } from "../../src/cam/ir.ts"
import { type PostId, type PostOptions, posts } from "../../src/cam/post/index.ts"
import { type GSegment, type InterpretResult, interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import type { Stock, Tool } from "../../src/cam/tool.ts"

/** Emits `toolpath` with a post and replays the text with the reference interpreter. */
export const run = (
  toolpath: Toolpath,
  post: PostId = "generic",
  options: Partial<PostOptions> = {}
): { readonly text: string; readonly result: InterpretResult; readonly program: Program } => {
  const program = makeProgram("test", [toolpath])
  const text = posts[post]!.emit(program, { decimals: 7, ...options })
  const result = interpretGcode(text, { dwell: post === "fanuc" ? "milliseconds" : "seconds" })
  return { text, result, program }
}

export interface InvariantOptions {
  readonly stock: Stock
  readonly tool: Tool
  readonly totalDepth: number
  /** Drilling expands cycles that rapid back down into the hole; allow that. */
  readonly allowRapidIntoHole?: boolean
}

const topOf = (stock: Stock): number => stock.origin.z

/** Returns a list of violations (empty when the program is sound). */
export const invariantViolations = (toolpath: Toolpath, options: InvariantOptions, post: PostId = "generic"): string[] => {
  const { text, result } = run(toolpath, post)
  void text
  const out: string[] = [...result.errors]
  const top = topOf(options.stock)
  const margin = options.tool.diameter + 1
  const sb = options.stock
  const inside = (x: number, y: number): boolean =>
    x >= sb.origin.x - margin && x <= sb.origin.x + sb.x + margin && y >= sb.origin.y - margin && y <= sb.origin.y + sb.y + margin

  if (result.minZ < top - options.totalDepth - 1e-6) out.push(`deepest Z ${result.minZ} below -${options.totalDepth}`)
  for (const s of result.segments) {
    if (s.kind === "dwell") continue
    const lowest = Math.min(s.from.z, s.to.z)
    if (s.kind === "rapid") {
      if (lowest < top - 1e-9 && !options.allowRapidIntoHole) {
        const horizontal = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) > 1e-9
        const upward = s.to.z >= s.from.z
        if (horizontal || !upward) out.push(`line ${s.line}: rapid inside the stock ${fmt(s)}`)
      }
      continue
    }
    if (lowest < top - 1e-9) {
      const pts =
        s.kind === "arc"
          ? [s.from, s.to, { x: s.center.x + s.radiusStart, y: s.center.y }, { x: s.center.x - s.radiusStart, y: s.center.y }, { x: s.center.x, y: s.center.y + s.radiusStart }, { x: s.center.x, y: s.center.y - s.radiusStart }]
          : [s.from, s.to]
      for (const p of pts) if (!inside(p.x, p.y)) out.push(`line ${s.line}: cut outside the stock at ${p.x},${p.y}`)
    }
    if (s.kind === "arc" && Math.abs(s.radiusStart - s.radiusEnd) > 1e-6) {
      out.push(`line ${s.line}: arc radius ${s.radiusStart} vs ${s.radiusEnd}`)
    }
  }
  const expected = toolpathLength(toolpath)
  if (Math.abs(result.cutLength - expected) > 5e-4) out.push(`cut length ${result.cutLength} vs IR ${expected}`)
  return out
}

const fmt = (s: GSegment): string => (s.kind === "dwell" ? "" : `(${s.from.x},${s.from.y},${s.from.z}) -> (${s.to.x},${s.to.y},${s.to.z})`)

/** Segments that cut (feed moves), with 2D endpoints, for distance checks. */
export const cuttingSegments = (result: InterpretResult, belowZ: number): GSegment[] =>
  result.segments.filter((s) => (s.kind === "linear" || s.kind === "arc") && Math.min(s.from.z, s.to.z) < belowZ)

/** Points along a replayed segment (arcs are sampled `n` times; lines return their ends). */
export const sampleSegment = (s: GSegment, n = 24): Array<{ x: number; y: number }> => {
  if (s.kind === "dwell") return []
  if (s.kind !== "arc") return [s.from, s.to]
  const a0 = Math.atan2(s.from.y - s.center.y, s.from.x - s.center.x)
  const a1 = Math.atan2(s.to.y - s.center.y, s.to.x - s.center.x)
  let sweep = s.clockwise ? a0 - a1 : a1 - a0
  sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  if (Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) < 1e-9 || sweep < 1e-12) sweep = 2 * Math.PI
  const dir = s.clockwise ? -1 : 1
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + (dir * sweep * i) / n
    out.push({ x: s.center.x + s.radiusStart * Math.cos(a), y: s.center.y + s.radiusStart * Math.sin(a) })
  }
  return out
}
