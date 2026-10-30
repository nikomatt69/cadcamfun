/**
 * Verification of NC the kernel did not write (spec 72 step 0.6, spec 53 V2): a program as bytes, the part, the stock and the tools
 * in the spindle, replayed on the tri-dexel against the part and the machine limits.
 *
 *   gouge            the program removed part material, with the first NC line whose tool reached the deepest point
 *   left             the program leaves stock beyond the part plus the allowance
 *   rapid-in-stock   a rapid moves the flutes, shank or holder through material
 *   travel           a move leaves the machine's travel
 *   unknown-tool     a feed move runs with a tool number the caller did not give
 *   unplaced         a move that could not be placed (an arc written with the table turned): the verdict is then incomplete
 *
 * Coordinates are the work frame the program is written in (the part and the stock are given in it); the tool tip is the NC
 * position (tool length compensation is the control's). Every figure carries the declared error of the lattice: a deviation
 * under `tolerance + errorBound` is not reported, and a result that did not see every move says so (`complete: false`).
 *
 * Pure: the same bytes give the same findings.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { Mesh64 } from "../model/element-mesh.ts"
import type { RotaryLayout } from "../indexing.ts"
import { interpretGcode, type GSegment } from "../testing/gcode-interpreter.ts"
import { forEachSample } from "../verify/path.ts"
import type { Cutter } from "./cutters.ts"
import type { StockBox } from "./contracts.ts"
import { TriReplay, triCellFor } from "./tri-replay.ts"
import { toolSolid, type Deviation, type ToolSolid } from "./tridexel.ts"
import { turnedPoses } from "./turned-poses.ts"

export interface VerifyNcRequest {
  readonly nc: string
  /** The part in the work frame, as closed meshes (overlapping solids are taken as their union). */
  readonly part: ReadonlyArray<Mesh64>
  /** The stock box in the work frame. */
  readonly stock: StockBox
  /** The cutter in the spindle for each tool number the program selects. */
  readonly tools: ReadonlyArray<{ readonly number: number; readonly cutter: Cutter }>
  /** The job tolerance, mm (default 0.01). */
  readonly tolerance?: number
  /** Finish stock the program may leave on purpose, mm (default 0.05). */
  readonly allowance?: number
  /** The lattice cell asked for, mm (default 0.1); it grows when the stock would pass the ray budget. */
  readonly cell?: number
  readonly machine?: {
    readonly travel?: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number; readonly minZ: number; readonly maxZ: number }
    readonly fiveAxis?: { readonly layout: RotaryLayout; readonly pivot: Vec3 }
  }
  readonly dwell?: "seconds" | "milliseconds"
  readonly okuma?: boolean
  /** Where the tool stands before the first block, in the work frame (default: 50 mm above the stock's top corner). */
  readonly start?: Vec3
  /** Cell visits the replay may spend (default 2e9). */
  readonly budget?: number
}

export interface NcFinding {
  readonly kind: "gouge" | "rapid-in-stock" | "travel" | "unknown-tool" | "unplaced" | "interpreter"
  readonly message: string
  /** NC line (1-based) of the first move that causes it, when one can be named. */
  readonly line?: number
  readonly point?: Vec3
  /** Gouge depth along the part normal, mm. */
  readonly depth?: number
}

export interface VerifyNcResult {
  /** Every move was placed and replayed, the part is closed and the budget held: the figures are a verdict. */
  readonly complete: boolean
  readonly reasons: ReadonlyArray<string>
  readonly findings: ReadonlyArray<NcFinding>
  readonly gouge: Deviation
  readonly left: Deviation
  readonly detached: number
  readonly cell: number
  /** The declared error of every figure, mm. */
  readonly errorBound: number
  readonly threshold: number
  /** Motions the interpreter produced, and how many of them cut. */
  readonly moves: number
  readonly feedMoves: number
}

export const verifyNc = (request: VerifyNcRequest): VerifyNcResult => {
  const tolerance = request.tolerance ?? 0.01
  const allowance = request.allowance ?? 0.05
  const { min, max } = request.stock
  const cell = triCellFor({ x: max.x - min.x, y: max.y - min.y, z: max.z - min.z }, request.cell ?? 0.1)
  const replay = new TriReplay({ min, max, cell, budget: request.budget ?? 2e9 })
  const cutters = new Map(request.tools.map((t) => [t.number, t.cutter] as const))
  const radiusOf = new Map(request.tools.map((t) => [t.number, t.cutter.diameter / 2] as const))
  const full = new Map<Cutter, ToolSolid>()
  const withHolder = (c: Cutter): ToolSolid => { let s = full.get(c); if (s === undefined) { s = toolSolid(c, ["cutting", "shank", "holder"]); full.set(c, s) } return s }
  const findings: NcFinding[] = []
  const reasons: string[] = []

  const run = interpretGcode(request.nc, {
    track: true,
    start: request.start ?? { x: min.x, y: min.y, z: max.z + 50 },
    dwell: request.dwell ?? "seconds",
    okuma: request.okuma === true,
    toolRadius: (_d, tool) => (tool === undefined ? undefined : radiusOf.get(tool))
  })
  for (const e of run.errors.slice(0, 3)) findings.push({ kind: "interpreter", message: `The NC interpreter could not model: ${e}` })
  if (run.errors.length > 0) reasons.push(`the NC interpreter could not model ${run.errors.length} blocks`)

  const five = request.machine?.fiveAxis
  const travel = request.machine?.travel
  // Feed poses of every segment, kept to attribute the deepest gouge to the first move whose tool reached it.
  const placed: Array<{ readonly line: number; readonly cutter: Cutter; readonly tips: ReadonlyArray<Vec3>; readonly axes: ReadonlyArray<Vec3> | undefined }> = []
  let angles = { a: 0, b: 0, c: 0 }
  let feedMoves = 0, travelHits = 0, rapidHits = 0
  const unknown = new Set<number>()
  const states = run.states ?? []
  run.segments.forEach((s, index) => {
    if (s.kind === "dwell") return
    const tool = states[index]?.tool
    const cutter = tool === undefined ? undefined : cutters.get(tool)
    if (travel !== undefined) {
      const p = s.to
      if ((p.x < travel.minX - 1e-9 || p.x > travel.maxX + 1e-9 || p.y < travel.minY - 1e-9 || p.y > travel.maxY + 1e-9 || p.z < travel.minZ - 1e-9 || p.z > travel.maxZ + 1e-9) && travelHits++ === 0) {
        findings.push({ kind: "travel", line: s.line, point: p, message: `NC line ${s.line} moves outside the machine travel` })
      }
    }
    const rapid = s.kind === "rapid"
    const turned = s.kind !== "arc" && s.rotary !== undefined
    if (!rapid) feedMoves++
    if (!rapid && cutter === undefined) {
      if (tool !== undefined ? !unknown.has(tool) : !unknown.has(-1)) {
        unknown.add(tool ?? -1)
        findings.push({ kind: "unknown-tool", line: s.line, message: tool === undefined ? `Feed motion at NC line ${s.line} runs with no tool selected` : `Feed motion at NC line ${s.line} runs with tool T${tool}, which the caller did not describe` })
      }
      replay.unchecked(`feed motion at NC line ${s.line} has no known cutter`)
      return
    }
    // Poses of the move in the part's frame.
    let tips: Vec3[] | undefined, axes: Vec3[] | undefined
    if (turned) {
      const end = { a: s.rotary?.a ?? 0, b: s.rotary?.b ?? 0, c: s.rotary?.c ?? 0 }
      const start = angles
      angles = end
      if (five === undefined) { replay.unchecked(`NC line ${s.line} turns the table and the machine has no rotary table described`); return }
      const poses = turnedPoses(five.layout, five.pivot, s.from, s.to, start, end, cell)
      tips = poses.map((q) => q.tip); axes = poses.map((q) => q.axis)
    } else if (s.kind === "arc") {
      if (angles.a !== 0 || angles.b !== 0 || angles.c !== 0) { replay.unchecked(`the arc at NC line ${s.line} is written with the table turned and is not interpreted in the part's frame`); return }
      tips = [s.from]
      forEachSample({ from: s.from, to: s.to, center: s.center, clockwise: s.clockwise }, cell, (x, y, z) => { tips!.push({ x, y, z }) })
    } else {
      tips = [s.from, s.to]
    }
    if (cutter === undefined) return
    if (rapid) {
      // Rapids probe the flutes, shank and holder against the stock as it stands: nothing may move through material.
      const solid = withHolder(cutter)
      const step = replay.stock.sampleStep(solid)
      for (let i = 0; i < tips.length && rapidHits < 5; i++) {
        const a = tips[i]!, b = tips[Math.min(i + 1, tips.length - 1)]!
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / step))
        let hit = false
        for (let k = 0; k <= n && !hit; k++) {
          const f = k / n
          const tip = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }
          const axis = axes === undefined ? undefined : axes[i]
          const p = replay.stock.probe(solid, tip, axis)
          if (p.overlap > replay.stock.errorBound + tolerance) {
            hit = true
            rapidHits++
            findings.push({ kind: "rapid-in-stock", line: s.line, ...(p.at !== undefined ? { point: p.at } : {}), message: `Rapid move through material at NC line ${s.line} (${cutter.name}, ${p.overlap.toFixed(3)} mm into the stock)` })
          }
        }
        if (hit) break
        if (tips.length === 2) break
      }
      return
    }
    replay.cut(cutter, tips, axes)
    placed.push({ line: s.line, cutter, tips, axes })
  })
  for (const t of unknown) if (t >= 0) reasons.push(`tool T${t} is not described`)

  const verdict = replay.verdict(request.part, tolerance, allowance)
  const threshold = tolerance + verdict.errorBound
  if (verdict.gouge.depth > threshold && verdict.closedPart) {
    // The first move after which the stock is cut below the part: the shortest prefix of the cutting moves that already gouges.
    // Removal only grows, so "this prefix gouges" is monotone and a bisection finds the move in log2(n) replays.
    const at = verdict.gouge.at
    const gouges = (count: number): boolean => {
      const r = new TriReplay({ min, max, cell, budget: request.budget ?? 2e9 })
      for (let i = 0; i < count; i++) r.cut(placed[i]!.cutter, placed[i]!.tips, placed[i]!.axes)
      return r.verdict(request.part, tolerance, allowance).gouge.depth > threshold
    }
    let lo = 1, hi = placed.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (gouges(mid)) hi = mid; else lo = mid + 1 }
    const line = placed[lo - 1]?.line
    findings.push({ kind: "gouge", ...(line !== undefined ? { line } : {}), ...(at !== undefined ? { point: at } : {}), depth: verdict.gouge.depth, message: `The program cuts ${verdict.gouge.depth.toFixed(3)} mm below the part surface${line !== undefined ? `, first at NC line ${line}` : ""}, beyond the declared error of ${verdict.errorBound.toFixed(3)} mm` })
  }
  reasons.push(...verdict.reasons)
  return {
    complete: reasons.length === 0, reasons, findings, gouge: verdict.gouge, left: verdict.left, detached: verdict.detached,
    cell: verdict.cell, errorBound: verdict.errorBound, threshold, moves: run.segments.length, feedMoves
  }
}
