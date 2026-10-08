/**
 * 3D surface machining (spec 04-core-cam.md §3): strategies that work from the finished shape, a height field built from the CAD
 * solids (`../model`), not from one outline.
 *
 *   roughing   Z-level clearing: at every depth the region the tool centre may occupy without touching the part (plus the
 *              allowance) is found exactly from the surface, and cleared with the pocket engine (contour-parallel offsets,
 *              islands, helix or ramp entry). What the part's walls overhang is left, never cut.
 *   parallel   Raster finishing: lines at `angle`, the tool dropped on the surface along each (drop-cutter), zig-zag or one way,
 *              stepover from the cusp height `scallop` for a ball cutter or from the stepover percentage.
 *   waterline  Constant-Z finishing: the contour of the surface at each depth, tool-centre offset by the cutter's own shape.
 *
 * Every path is computed against the same drop-cutter (`Surface.tip`), which never answers lower than the true surface, so a path
 * does not gouge; `cam.verify` confirms it on the emitted G-code. Pure: same inputs, same moves.
 */
import { Schema } from "effect"
import type { Vec2 } from "../../cad/vec.ts"
import { distance } from "../../cad/vec.ts"
import type { PartModel } from "../model/model.ts"
import type { Stock, Tool } from "../tool.ts"
import type { Move, Toolpath } from "../ir.ts"
import { OperationFields, Positive, NonNegative, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import { pathFromPoints } from "../path.ts"
import { MoveBuilder, approach, finish, followPath, liftTo } from "./common.ts"
import { PocketEntrySchema, PocketParams, generatePocket } from "./pocket.ts"
import { Surface, contour, cutterOf, nest, sampleNodes, simplify, simplify3, type Cutter, type Rect } from "./surface-field.ts"

export const SurfaceStrategySchema = Schema.Literals(["roughing", "parallel", "waterline"])
export type SurfaceStrategy = typeof SurfaceStrategySchema.Type

export class SurfaceParams extends Schema.Class<SurfaceParams>("cam/SurfaceParams")(
  Schema.Struct({
    ...OperationFields,
    strategy: withDefault(SurfaceStrategySchema, "roughing" as const),
    /** Stepover as a percentage of the tool diameter: between roughing loops, and between raster lines of a flat cutter. */
    stepover: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 100 })), 40),
    /** Cusp height left between raster lines of a ball cutter, mm; `0` = use `stepover`. */
    scallop: withDefault(NonNegative, 0),
    /** Direction of the raster lines, degrees from +X. */
    angle: withDefault(Schema.Finite, 0),
    /** Every raster line in the same direction (otherwise zig-zag). */
    oneWay: withDefault(Schema.Boolean, false),
    climb: withDefault(Schema.Boolean, true),
    /** Material left on the part, mm, on walls and floors alike (the tool path stays this far from the surface). */
    allowance: withDefault(NonNegative, 0),
    /** Chord / simplification tolerance of the paths, mm. */
    tolerance: withDefault(Positive, 0.01),
    entry: withDefault(PocketEntrySchema, "helix" as const),
    helixPitch: withDefault(Positive, 1),
    rampAngle: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 0.1, maximum: 45 })), 3)
  }).check(heightsOrdered)
) {}

export interface SurfaceResult {
  readonly toolpath: Toolpath
  readonly warnings: ReadonlyArray<string>
  readonly stats: { readonly levels: number; readonly lines: number; readonly loops: number; readonly points: number }
}

const stockRect = (stock: Stock): Rect => ({ x0: stock.origin.x, y0: stock.origin.y, x1: stock.origin.x + stock.x, y1: stock.origin.y + stock.y })

/** Cusp height h between lines `s` apart for a ball of radius R: s = 2 sqrt(2Rh - h^2). */
export const scallopSpacing = (radius: number, cusp: number): number => 2 * Math.sqrt(Math.max(0, 2 * radius * cusp - cusp * cusp))

/** Index of the vertex nearest to `from`; the loop is rotated to start there. */
const startNear = (ring: ReadonlyArray<Vec2>, from: Vec2 | undefined): Vec2[] => {
  if (from === undefined) return [...ring]
  let best = 0, bd = Infinity
  ring.forEach((p, i) => { const d = distance(p, from); if (d < bd) { bd = d; best = i } })
  return [...ring.slice(best), ...ring.slice(0, best)]
}

export const generateSurface = (params: SurfaceParams, part: PartModel, tool: Tool, stock: Stock): SurfaceResult => {
  const levels = levelsOf(params, stock.origin.z)
  const warnings: string[] = [...part.warnings]
  const b = new MoveBuilder()
  b.comment(`Surface ${params.strategy}: ${params.name}`)
  const surface = new Surface(part.grid, part.dexels.top(-Infinity))
  const cutter = cutterOf(tool, params.allowance)
  const stats = { levels: 0, lines: 0, loops: 0, points: 0 }
  const done = (moves: ReadonlyArray<Move>): SurfaceResult => ({
    toolpath: { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves },
    warnings, stats
  })
  let partTop = -Infinity
  for (const h of surface.height) if (h > partTop) partTop = h
  if (partTop === -Infinity) {
    b.comment("nothing to cut: the model has no material")
    return done(b.moves)
  }
  if (tool.kind === "drill") warnings.push("A drill cannot machine a surface; use an end mill or a ball nose cutter.")
  const bottomZ = levels.bottomZ
  const cell = Math.min(part.grid.cellX, part.grid.cellY)

  if (params.strategy === "roughing") {
    const step = Math.max(cell, Math.min(params.tolerance * 25, tool.diameter / 6, 0.5))
    const margin = cutter.radius + 2 * step
    const s = stockRect(stock)
    const reach = tool.diameter / 2
    // The tool centre needs to go as far as `reach` past the stock edge to clear it, and no further.
    const keep: Rect = { x0: s.x0 - reach, y0: s.y0 - reach, x1: s.x1 + reach, y1: s.y1 + reach }
    const rect: Rect = { x0: keep.x0 - margin, y0: keep.y0 - margin, x1: keep.x1 + margin, y1: keep.y1 + margin }
    const value = (x: number, y: number): number => (x < keep.x0 || x > keep.x1 || y < keep.y0 || y > keep.y1 ? Infinity : surface.tip(cutter, x, y))
    const nodes = sampleNodes(value, rect, step)
    let zPrev = levels.topZ
    for (const z of levels.passZ) {
      const level = Math.max(z, bottomZ)
      const loops = contour(value, level + 1e-9, rect, step, true, nodes).map((l) => simplify(l, params.tolerance, true)).filter((l) => l.length >= 3)
      stats.levels += 1
      stats.loops += loops.length
      for (const group of nest(loops)) {
        const pocket = Schema.decodeUnknownSync(PocketParams)({
          id: params.id, name: `${params.name} Z${level.toFixed(3)}`,
          clearanceHeight: params.clearanceHeight, safeHeight: params.safeHeight, retractHeight: params.retractHeight,
          totalDepth: zPrev - level, stepdown: zPrev - level, feed: params.feed, plungeFeed: params.plungeFeed,
          spindleRpm: params.spindleRpm, coolant: params.coolant, stepover: params.stepover,
          entry: params.entry, helixPitch: params.helixPitch, rampAngle: params.rampAngle, climb: params.climb,
          tolerance: params.tolerance, toolCentre: true, allowance: 0
        })
        const levelStock: Stock = { ...stock, origin: { ...stock.origin, z: zPrev } }
        const path = generatePocket(pocket, { boundary: group.boundary, islands: group.islands }, tool, levelStock)
        for (const m of path.moves) {
          if (m._tag === "Comment") continue
          b.push(m)
        }
      }
      zPrev = level
    }
    if (stats.loops === 0) b.comment("nothing to cut: the part leaves no room for the tool at any depth")
    if (b.started) finish(b, levels)
    return done(b.moves)
  }

  if (params.strategy === "waterline") {
    const step = Math.max(cell, Math.min(params.tolerance * 25, tool.diameter / 6, 0.5))
    const margin = cutter.radius + 2 * step
    const rect: Rect = { x0: part.bounds.min[0] - margin, y0: part.bounds.min[1] - margin, x1: part.bounds.max[0] + margin, y1: part.bounds.max[1] + margin }
    const value = (x: number, y: number): number => surface.tip(cutter, x, y)
    const nodes = sampleNodes(value, rect, step)
    let at: Vec2 | undefined
    for (const z of levels.passZ) {
      const level = Math.max(z, bottomZ)
      if (level >= partTop + cutter.lift) continue
      const loops = contour(value, level, rect, step, false, nodes).map((l) => simplify(l, params.tolerance, true)).filter((l) => l.length >= 3)
      if (loops.length === 0) continue
      stats.levels += 1
      // The contours run with the part on their left: that is climb milling; the other direction is conventional.
      const remaining = loops.map((l) => (params.climb ? l : [...l].reverse()))
      while (remaining.length > 0) {
        let bi = 0, bd = Infinity
        remaining.forEach((l, i) => { const d = at === undefined ? 0 : Math.min(...l.map((p) => distance(p, at!))); if (d < bd) { bd = d; bi = i } })
        const [loop] = remaining.splice(bi, 1)
        const ring = startNear(loop!, at)
        const path = pathFromPoints(ring, true)
        if (b.started) liftTo(b, levels.retractZ)
        approach(b, path.start, levels)
        b.rapid({ x: path.start.x, y: path.start.y, z: Math.max(levels.entryZ, level + 1) })
        b.linear({ x: path.start.x, y: path.start.y, z: level }, params.plungeFeed)
        followPath(b, path, level, params.feed)
        at = path.start
        stats.loops += 1
        stats.points += ring.length
      }
    }
    if (stats.loops === 0) b.comment("nothing to cut: no contour of the part at the requested depths")
    if (b.started) finish(b, levels)
    return done(b.moves)
  }

  // ---- parallel (raster) finishing
  const R = tool.diameter / 2
  const spacing = params.scallop > 0 && (tool.kind === "ballnose")
    ? scallopSpacing(R + params.allowance, Math.min(params.scallop, R))
    : (params.stepover / 100) * tool.diameter
  if (!(spacing > 0)) {
    warnings.push("The cusp height or the stepover gives a zero line spacing")
    return done(b.moves)
  }
  const ang = (params.angle * Math.PI) / 180
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux
  // Extent of the part along and across the lines (corners of its box, widened by the cutter).
  const lo = part.bounds.min, hi = part.bounds.max
  const corners: Array<[number, number]> = [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]]
  const sAll = corners.map(([x, y]) => x * ux + y * uy), tAll = corners.map(([x, y]) => x * nx + y * ny)
  const s0 = Math.min(...sAll) - cutter.radius, s1 = Math.max(...sAll) + cutter.radius
  const t0 = Math.min(...tAll), t1 = Math.max(...tAll)
  const lines = Math.max(1, Math.ceil((t1 - t0) / spacing - 1e-9) + 1)
  const ds = Math.max(Math.min(cell, params.tolerance * 5), params.tolerance)
  const dropAt = (s: number, t: number): [number, number, number] | undefined => {
    const x = s * ux + t * nx, y = s * uy + t * ny
    const tip = surface.tip(cutter, x, y)
    return tip === -Infinity ? undefined : [x, y, Math.max(tip, bottomZ)]
  }
  type P3 = readonly [number, number, number]
  const runs: P3[][] = []
  for (let i = 0; i < lines; i++) {
    const t = lines === 1 ? (t0 + t1) / 2 : t0 + ((t1 - t0) * i) / (lines - 1)
    const forward = params.oneWay ? params.climb : (params.climb ? i % 2 === 0 : i % 2 === 1)
    let current: P3[] = []
    const n = Math.max(1, Math.ceil((s1 - s0) / ds))
    for (let k = 0; k <= n; k++) {
      const s = forward ? s0 + ((s1 - s0) * k) / n : s1 - ((s1 - s0) * k) / n
      const p = dropAt(s, t)
      if (p === undefined) { if (current.length > 1) runs.push(simplify3(current, params.tolerance)); current = []; continue }
      current.push(p)
    }
    if (current.length > 1) runs.push(simplify3(current, params.tolerance))
  }
  stats.lines = runs.length
  const linkOk = (a: P3, c: P3): P3[] | undefined => {
    // Stay down between neighbouring runs when the surface under the straight link is all there is to follow.
    const len = Math.hypot(c[0] - a[0], c[1] - a[1])
    if (len > 2.5 * spacing + 2 * cutter.radius * 0.1) return undefined
    const n = Math.max(1, Math.ceil(len / ds))
    const out: P3[] = []
    for (let k = 1; k < n; k++) {
      const x = a[0] + ((c[0] - a[0]) * k) / n, y = a[1] + ((c[1] - a[1]) * k) / n
      const tip = surface.tip(cutter, x, y)
      if (tip === -Infinity) return undefined
      out.push([x, y, Math.max(tip, bottomZ)])
    }
    return out
  }
  let last: P3 | undefined
  for (const run of runs) {
    const first = run[0]!
    const link = last === undefined ? undefined : linkOk(last, first)
    if (link !== undefined) {
      for (const p of simplify3([last!, ...link, first], params.tolerance).slice(1)) b.linear({ x: p[0], y: p[1], z: p[2] }, params.feed)
    } else {
      if (b.started) liftTo(b, levels.retractZ)
      approach(b, { x: first[0], y: first[1] }, levels)
      b.rapid({ x: first[0], y: first[1], z: Math.max(levels.entryZ, first[2] + 1) })
      b.linear({ x: first[0], y: first[1], z: first[2] }, params.plungeFeed)
    }
    for (let k = 1; k < run.length; k++) b.linear({ x: run[k]![0], y: run[k]![1], z: run[k]![2] }, params.feed)
    last = run[run.length - 1]
    stats.points += run.length
  }
  if (runs.length === 0) b.comment("nothing to cut: the cutter finds no surface along any line")
  if (b.started) finish(b, levels)
  return done(b.moves)
}

export const Surface3D = { Params: SurfaceParams, generate: generateSurface } as const
export type { Cutter }
