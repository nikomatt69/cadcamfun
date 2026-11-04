/**
 * Guide-curve surface finishing (spec 72 P2-1): the strategies whose tool paths follow curves the programmer chooses instead of a
 * raster or a level. Each family of curves is dropped onto the part with the same drop-cutter (`Surface.tip`, conservative
 * sampled) the other surface strategies use, so the tool never gouges beyond that sampler's declared error.
 *
 *  - `isoparametric`: a Coons patch from four boundary curves (bottom, top, left, right); lines of constant v across the patch.
 *  - `morph`: the curves between two boundary curves A and B, blended point by point along arc length; XY spacing <= stepover.
 *  - `flowline`: like `morph`, but the number of lines is chosen so the spacing measured **on the surface** (3D distance
 *    between neighbouring curve points riding the part) stays within the stepover, so steep stretches get more lines.
 *  - `projection`: curves drawn in plan (engraving, a pattern, a spine) dropped onto the part.
 *
 * Height-field model: undercuts are not seen (spec 72 P2-2), and a point with no material under the cutter ends a run.
 */
import { Schema } from "effect"
import type { Vec2 } from "../../cad/vec.ts"
import type { Move } from "../ir.ts"
import type { PartModel } from "../model/model.ts"
import { NonNegative, OperationFields, Positive, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import type { Stock, Tool } from "../tool.ts"
import { MoveBuilder, approach, finish, liftTo } from "./common.ts"
import { Surface, cutterOf, simplify3 } from "./surface-field.ts"
import { scallopSpacing } from "./surface.ts"

export class GuidedParams extends Schema.Class<GuidedParams>("cam/GuidedParams")(
  Schema.Struct({
    ...OperationFields,
    stepover: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 100 })), 10),
    /** Cusp height, mm, for a ball cutter: sets the surface spacing instead of `stepover` when above 0. */
    scallop: withDefault(NonNegative, 0),
    allowance: withDefault(NonNegative, 0),
    tolerance: withDefault(Positive, 0.01),
    /** Alternate the direction of neighbouring lines. */
    zigzag: withDefault(Schema.Boolean, true)
  }).check(heightsOrdered)
) {}

export type GuidedInput =
  | { readonly mode: "isoparametric"; readonly bottom: ReadonlyArray<Vec2>; readonly top: ReadonlyArray<Vec2>; readonly left: ReadonlyArray<Vec2>; readonly right: ReadonlyArray<Vec2> }
  | { readonly mode: "morph" | "flowline"; readonly from: ReadonlyArray<Vec2>; readonly to: ReadonlyArray<Vec2> }
  | { readonly mode: "projection"; readonly curves: ReadonlyArray<ReadonlyArray<Vec2>> }

const len = (p: ReadonlyArray<Vec2>): number => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.y - p[i - 1]!.y); return s }

/** `n` points at equal arc length along a polyline (n >= 2), including both ends. */
export const resample = (p: ReadonlyArray<Vec2>, n: number): Vec2[] => {
  if (p.length < 2) throw new RangeError("a guide curve needs at least two points")
  const total = len(p)
  if (total < 1e-9) throw new RangeError("a guide curve has no length")
  const out: Vec2[] = []
  let seg = 0, acc = 0
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1)
    while (seg < p.length - 2 && acc + Math.hypot(p[seg + 1]!.x - p[seg]!.x, p[seg + 1]!.y - p[seg]!.y) < target - 1e-12) {
      acc += Math.hypot(p[seg + 1]!.x - p[seg]!.x, p[seg + 1]!.y - p[seg]!.y); seg++
    }
    const a = p[seg]!, b = p[seg + 1]!
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    const t = l < 1e-12 ? 0 : Math.min(1, Math.max(0, (target - acc) / l))
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** Curves of a Coons patch at `v` = 0, 1/(m-1), ..., 1; corners of the four boundaries must meet (within 1e-6 mm), else a RangeError. */
export const coonsLines = (bottom: ReadonlyArray<Vec2>, top: ReadonlyArray<Vec2>, left: ReadonlyArray<Vec2>, right: ReadonlyArray<Vec2>, lines: number, samples: number): Vec2[][] => {
  const near = (a: Vec2, b: Vec2): boolean => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6
  const [b0, b1, t0, t1] = [bottom[0]!, bottom[bottom.length - 1]!, top[0]!, top[top.length - 1]!]
  if (!near(b0, left[0]!) || !near(t0, left[left.length - 1]!) || !near(b1, right[0]!) || !near(t1, right[right.length - 1]!)) throw new RangeError("the four boundary curves of an isoparametric patch do not meet at the corners")
  const B = resample(bottom, samples), T = resample(top, samples), L = resample(left, lines), R = resample(right, lines)
  const out: Vec2[][] = []
  for (let j = 0; j < lines; j++) {
    const v = lines === 1 ? 0 : j / (lines - 1)
    out.push(B.map((_, i) => {
      const u = i / (samples - 1)
      const x = (1 - v) * B[i]!.x + v * T[i]!.x + (1 - u) * L[j]!.x + u * R[j]!.x - ((1 - u) * (1 - v) * b0.x + u * (1 - v) * b1.x + (1 - u) * v * t0.x + u * v * t1.x)
      const y = (1 - v) * B[i]!.y + v * T[i]!.y + (1 - u) * L[j]!.y + u * R[j]!.y - ((1 - u) * (1 - v) * b0.y + u * (1 - v) * b1.y + (1 - u) * v * t0.y + u * v * t1.y)
      return { x, y }
    }))
  }
  return out
}

export interface GuidedResult {
  readonly toolpath: { readonly id: string; readonly name: string; readonly toolId: string; readonly spindleRpm: number; readonly coolant: GuidedParams["coolant"]; readonly moves: ReadonlyArray<Move> }
  readonly warnings: ReadonlyArray<string>
  readonly stats: { readonly curves: number; readonly runs: number; readonly points: number }
}

export const generateGuided = (params: GuidedParams, part: PartModel, tool: Tool, stock: Stock, input: GuidedInput): GuidedResult => {
  const levels = levelsOf(params, stock.origin.z)
  const warnings: string[] = [...part.warnings]
  const surface = new Surface(part.grid, (part.conservative ?? part.dexels).top(-Infinity))
  const cutter = cutterOf(tool, params.allowance)
  const cell = Math.min(part.grid.cellX, part.grid.cellY)
  const spacing = tool.kind === "ballnose" && params.scallop > 0 ? scallopSpacing(tool.diameter / 2, params.scallop) : (params.stepover / 100) * tool.diameter
  const sampleStep = Math.max(cell, params.tolerance * 4)
  const zAt = (p: Vec2): number => surface.tip(cutter, p.x, p.y)

  let curves: Vec2[][]
  if (input.mode === "projection") {
    curves = input.curves.map((c) => resample(c, Math.max(2, Math.ceil(len(c) / sampleStep) + 1)))
  } else if (input.mode === "isoparametric") {
    const samples = Math.max(2, Math.ceil(Math.max(len(input.bottom), len(input.top)) / sampleStep) + 1)
    const across = Math.max(len(input.left), len(input.right))
    curves = coonsLines(input.bottom, input.top, input.left, input.right, Math.max(2, Math.ceil(across / spacing) + 1), samples)
  } else {
    const samples = Math.max(2, Math.ceil(Math.max(len(input.from), len(input.to)) / sampleStep) + 1)
    const A = resample(input.from, samples), B = resample(input.to, samples)
    let across = 0
    for (let i = 0; i < samples; i++) {
      let d = Math.hypot(A[i]!.x - B[i]!.x, A[i]!.y - B[i]!.y)
      if (input.mode === "flowline") {
        // on the surface: the straight line between the two points ridden over the part, measured in 3D
        const n = Math.max(2, Math.ceil(d / sampleStep))
        let s3 = 0
        let prev: { x: number; y: number; z: number } | undefined
        for (let k = 0; k <= n; k++) {
          const q = lerp(A[i]!, B[i]!, k / n)
          const z = zAt(q)
          const cur = { x: q.x, y: q.y, z: Number.isFinite(z) ? z : (prev?.z ?? 0) }
          if (prev !== undefined) s3 += Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z)
          prev = cur
        }
        d = s3
      }
      across = Math.max(across, d)
    }
    const lines = Math.max(2, Math.ceil(across / spacing) + 1)
    curves = Array.from({ length: lines }, (_, j) => A.map((a, i) => lerp(a, B[i]!, j / (lines - 1))))
  }

  const b = new MoveBuilder()
  b.comment(`${input.mode}: ${params.name}`)
  let runs = 0, points = 0
  curves.forEach((curve, ci) => {
    const pts = params.zigzag && ci % 2 === 1 ? [...curve].reverse() : curve
    // split into runs where the cutter has material under it and the tool-centre height is above the floor
    let run: Array<readonly [number, number, number]> = []
    const flush = (): void => {
      if (run.length >= 2) {
        const path = simplify3(run, params.tolerance)
        const first = path[0]!
        approach(b, { x: first[0], y: first[1] }, levels)
        b.linear({ x: first[0], y: first[1], z: first[2] }, params.plungeFeed)
        for (let i = 1; i < path.length; i++) b.linear({ x: path[i]![0], y: path[i]![1], z: path[i]![2] }, params.feed)
        liftTo(b, levels.retractZ)
        runs++; points += path.length
      }
      run = []
    }
    for (const p of pts) {
      const z = zAt(p)
      if (!Number.isFinite(z)) { flush(); continue }
      run.push([p.x, p.y, Math.max(z, levels.bottomZ)])
    }
    flush()
  })
  if (runs === 0) warnings.push("no guide curve touches the part: nothing was cut")
  finish(b, levels)
  return { toolpath: { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves: b.moves }, warnings, stats: { curves: curves.length, runs, points } }
}
