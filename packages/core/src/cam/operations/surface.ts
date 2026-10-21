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
 *   steep-shallow  Waterline where the surface is steeper than `slopeAngle`, parallel raster where it is shallower, the two
 *              overlapping by `overlap` degrees so they meet: constant-Z passes do not open up on flats and raster lines do not
 *              stretch apart on walls. The slope is the gradient of the drop-cutter surface itself (the cutter's own shape).
 *   (clearing) Roughing and rest clear each region with `clearing`: "contour" (the pocket engine, contour-parallel) or "adaptive"
 *              (`adaptive.ts`, the radial depth of cut held at `engagement` % of the tool diameter wherever the tool goes).
 *   (rest finishing) `parallel` and `waterline` with `restFrom` finish only where the previous tool did not reach as low: the new tool's
 *              own drop-cutter path, kept where the previous tool's is higher than it by more than `restThreshold`. With a larger ball
 *              before it that is pencil machining: the creases and fillets the big ball bridged.
 *   rest       Roughing of what a previous, larger tool (`restFrom`) left behind, at the same levels: only the regions whose
 *              centres bring this tool's disc to unswept material are cleared (`rest.ts`).
 *   scallop    Constant-scallop (3D offset) finishing: passes a constant distance apart measured ON the surface the tool centre
 *              rides, so they do not open up on slopes the way raster lines do. The distance is the geodesic distance from the edge
 *              of the region over the drop-cutter surface; the passes are its level lines. Faces steeper than 80 degrees (where the
 *              tool-centre surface is a cliff in plan) are left to a waterline pass and reported.
 *   spiral     One Archimedean spiral from `center` (default: the middle of the part) outwards, turns `spacing` apart in plan.
 *   radial     Lines from `center` outwards, spaced `spacing` apart at the outermost radius, run in and out alternately.
 *   flat       Horizontal-area finishing: the flat faces of the part (found from its height field) are cleared at their exact
 *              height with the pocket engine, the tool centre kept where the cutter rests on that face and nothing higher.
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
import { AdaptiveParams, generateAdaptive } from "./adaptive.ts"
import { restField } from "./rest.ts"
import { Surface, contour, cutterOf, nest, nodeGrid, sampleNodes, simplify, simplify3, type Cutter, type Rect } from "./surface-field.ts"
import { ToolKindSchema } from "../tool.ts"

export const SurfaceStrategySchema = Schema.Literals(["roughing", "parallel", "waterline", "rest", "steep-shallow", "scallop", "spiral", "radial", "flat"])
export type SurfaceStrategy = typeof SurfaceStrategySchema.Type

/** The tool whose roughing a `rest` operation continues, and the stock it left on the part. */
export const RestFromSchema = Schema.Struct({
  diameter: Positive,
  kind: withDefault(ToolKindSchema, "endmill" as const),
  /** Corner radius of a bull-nose end mill, mm. */
  tipRadius: Schema.optionalKey(Positive),
  /** Stock to leave the previous tool left on the part, mm; defaults to this operation's own `allowance`. */
  allowance: Schema.optionalKey(NonNegative)
})
export type RestFrom = typeof RestFromSchema.Type

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
    rampAngle: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 0.1, maximum: 45 })), 3),
    /** `rest` only: the previous tool. It is assumed to have cut at the same Z levels with the same stepover logic. */
    restFrom: Schema.optionalKey(RestFromSchema),
    /** `parallel` / `waterline` with `restFrom`: material thicker than this (mm) above what the new tool reaches is finished. */
    restThreshold: withDefault(Positive, 0.02),
    /** How `roughing` and `rest` clear a region: contour-parallel offsets, or adaptive clearing at a bounded radial engagement. */
    clearing: withDefault(Schema.Literals(["contour", "adaptive"]), "contour" as const),
    /** `adaptive` only: the maximum radial depth of cut, as a percentage of the tool diameter. */
    engagement: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 50 })), 12),
    /** `steep-shallow`: slope from the horizontal, degrees, above which the surface is finished by waterline. */
    slopeAngle: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 5, maximum: 85 })), 45),
    /** `steep-shallow`: degrees both passes extend past `slopeAngle`, so they overlap instead of leaving a seam. */
    overlap: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 20 })), 3),
    /** `spiral` / `radial`: the centre of the pattern in XY (default: the middle of the part's extent). */
    center: Schema.optionalKey(Schema.Struct({ x: Schema.Finite, y: Schema.Finite }))
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

/** Slope, degrees, above which `scallop` leaves a face to a waterline pass: there the tool-centre surface is a cliff in plan. */
export const SCALLOP_WALL_ANGLE = 80
/** Heights of the part model's columns within this of each other are one flat face (`flat`), mm. */
const FLAT_TOLERANCE = 1e-3

type P3 = readonly [number, number, number]

/** Grid neighbours of the geodesic distance: 4 axial, 4 diagonal and 8 knight moves (straight-line error at most 2.7 %). */
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]
]

/** Binary min-heap of grid nodes keyed by distance, with lazy deletion (a node may be pushed again with a smaller key). */
class NodeHeap {
  private keys: Float64Array = new Float64Array(1024)
  private nodes: Int32Array = new Int32Array(1024)
  size = 0
  push(key: number, node: number): void {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2); k.set(this.keys); this.keys = k
      const n = new Int32Array(this.size * 2); n.set(this.nodes); this.nodes = n
    }
    let i = this.size++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent]! <= key) break
      this.keys[i] = this.keys[parent]!; this.nodes[i] = this.nodes[parent]!
      i = parent
    }
    this.keys[i] = key; this.nodes[i] = node
  }
  /** Removes the smallest entry; `topKey` / `topNode` hold it. */
  topKey = 0
  topNode = 0
  pop(): void {
    this.topKey = this.keys[0]!; this.topNode = this.nodes[0]!
    const key = this.keys[--this.size]!, node = this.nodes[this.size]!
    let i = 0
    for (;;) {
      let c = 2 * i + 1
      if (c >= this.size) break
      if (c + 1 < this.size && this.keys[c + 1]! < this.keys[c]!) c++
      if (this.keys[c]! >= key) break
      this.keys[i] = this.keys[c]!; this.nodes[i] = this.nodes[c]!
      i = c
    }
    this.keys[i] = key; this.nodes[i] = node
  }
}

/**
 * Geodesic distance over a height field sampled on a grid of nodes (`z`, row-major, `w` per row, spacing `dx` x `dy`), from the
 * nodes where `seed` is set, through the nodes where `inside` is set (Dijkstra over 16 neighbours; a move between two nodes is
 * allowed only when the nodes it passes between are inside too). Edges are straight 3D segments, so the result never
 * underestimates the distance along the surface by more than the grid represents it, and overestimates a straight run by at
 * most 2.7 %. Nodes not reached are Infinity.
 */
export const geodesicDistance = (z: Float64Array, inside: Uint8Array, seed: Uint8Array, w: number, h: number, dx: number, dy: number): Float64Array => {
  const dist = new Float64Array(w * h).fill(Infinity)
  const heap = new NodeHeap()
  for (let k = 0; k < w * h; k++) if (seed[k] === 1 && inside[k] === 1) { dist[k] = 0; heap.push(0, k) }
  while (heap.size > 0) {
    heap.pop()
    const d = heap.topKey, k = heap.topNode
    if (d > dist[k]!) continue
    const i = k % w, j = (k - i) / w
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di, nj = j + dj
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue
      const n = nj * w + ni
      if (inside[n] !== 1) continue
      // A diagonal or knight move passes between two nodes: both must be inside, so the path never jumps a gap.
      if (di !== 0 && dj !== 0) {
        // Diagonal: (i+di, j) and (i, j+dj). Knight (1, 2): the two nodes of the row it crosses halfway; (2, 1) likewise.
        const [ai, aj, bi, bj] = Math.abs(dj) === 2 ? [i, j + Math.sign(dj), i + di, j + Math.sign(dj)]
          : Math.abs(di) === 2 ? [i + Math.sign(di), j, i + Math.sign(di), j + dj]
          : [i + di, j, i, j + dj]
        if (inside[aj * w + ai] !== 1 || inside[bj * w + bi] !== 1) continue
      }
      const nd = d + Math.hypot(di * dx, dj * dy, z[n]! - z[k]!)
      if (nd < dist[n]!) { dist[n] = nd; heap.push(nd, n) }
    }
  }
  return dist
}

/** Index of the vertex nearest to `from`; the loop is rotated to start there. */
const startNear = (ring: ReadonlyArray<Vec2>, from: Vec2 | undefined): Vec2[] => {
  if (from === undefined) return [...ring]
  let best = 0, bd = Infinity
  ring.forEach((p, i) => { const d = distance(p, from); if (d < bd) { bd = d; best = i } })
  return [...ring.slice(best), ...ring.slice(0, best)]
}

/**
 * `remaining` is the top of the stock left by the operations before (spec 29 §6), in the same frame as `stock`. With it, rest
 * roughing and rest finishing work from the material really there instead of the model of one previous tool (`restFrom`).
 */
export const generateSurface = (params: SurfaceParams, part: PartModel, tool: Tool, stock: Stock, remaining?: (x: number, y: number) => number): SurfaceResult => {
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
  // The previous tool, for rest roughing and rest finishing alike.
  const previousTool: Tool | undefined = params.restFrom === undefined ? undefined : {
    id: "rest-from", name: "previous tool", kind: params.restFrom.kind, diameter: params.restFrom.diameter, flutes: 2, maxRpm: 1,
    ...(params.restFrom.tipRadius !== undefined ? { tipRadius: params.restFrom.tipRadius } : {})
  }
  const previous: Cutter | undefined = previousTool === undefined ? undefined : cutterOf(previousTool, params.restFrom?.allowance ?? params.allowance)
  const finishing = params.strategy === "parallel" || params.strategy === "waterline" || params.strategy === "scallop" || params.strategy === "spiral" || params.strategy === "radial"
  if (finishing && remaining === undefined && params.restFrom !== undefined && params.restFrom.diameter < tool.diameter) {
    warnings.push(`The previous tool (${params.restFrom.diameter} mm) is smaller than this one (${tool.diameter} mm): there is nothing a larger tool left behind.`)
  }
  // Rest finishing (a `restFrom` on a finishing strategy) works from the stock really left when the caller supplies it.
  const stockRest = remaining !== undefined && params.restFrom !== undefined
  /** Where this tool can go lower than the previous one did: there is material for it (always true without a previous tool). */
  const leftAt = (x: number, y: number, tip: number): boolean => {
    if (stockRest) {
      if (tip === -Infinity) return false
      if (x < stock.origin.x - 1e-9 || x > stock.origin.x + stock.x + 1e-9 || y < stock.origin.y - 1e-9 || y > stock.origin.y + stock.y + 1e-9) return false
      return remaining(x, y) - tip > params.restThreshold
    }
    if (previous === undefined) return true
    if (tip === -Infinity) return false
    // Past the edge of the stock there is nothing to leave behind, however differently two cutters ride a cliff there.
    if (x < stock.origin.x - 1e-9 || x > stock.origin.x + stock.x + 1e-9 || y < stock.origin.y - 1e-9 || y > stock.origin.y + stock.y + 1e-9) return false
    return surface.tip(previous, x, y) - tip > params.restThreshold
  }
  /** Splits a ring (or chain) into the stretches where `keep` holds; a ring wholly kept stays closed. */
  const piecesWhere = <T,>(pts: ReadonlyArray<T>, keep: ReadonlyArray<boolean>): Array<{ readonly pts: T[]; readonly closed: boolean }> => {
    if (keep.every(Boolean)) return [{ pts: [...pts], closed: true }]
    if (!keep.some(Boolean)) return []
    const n = pts.length
    const first = keep.findIndex((v) => !v)
    const out: Array<{ pts: T[]; closed: boolean }> = []
    let cur: T[] = []
    for (let i = 1; i <= n; i++) {
      const k = (first + i) % n
      if (keep[k]) cur.push(pts[k]!)
      else if (cur.length > 0) { out.push({ pts: cur, closed: false }); cur = [] }
    }
    if (cur.length > 0) out.push({ pts: cur, closed: false })
    return out.filter((p) => p.pts.length >= 2)
  }

  if (params.strategy === "roughing" || params.strategy === "rest") {
    const isRest = params.strategy === "rest"
    // Rest regions are small and bounded by the previous pass, so their grid is finer than a plain roughing's.
    const step = isRest
      ? Math.max(cell, Math.min(params.tolerance * 10, tool.diameter / 8, 0.25))
      : Math.max(cell, Math.min(params.tolerance * 25, tool.diameter / 6, 0.5))
    const margin = cutter.radius + 2 * step
    const s = stockRect(stock)
    const reach = tool.diameter / 2
    // The tool centre needs to go as far as `reach` past the stock edge to clear it, and no further.
    const keep: Rect = { x0: s.x0 - reach, y0: s.y0 - reach, x1: s.x1 + reach, y1: s.y1 + reach }
    const rect: Rect = { x0: keep.x0 - margin, y0: keep.y0 - margin, x1: keep.x1 + margin, y1: keep.y1 + margin }
    const value = (x: number, y: number): number => (x < keep.x0 || x > keep.x1 || y < keep.y0 || y > keep.y1 ? Infinity : surface.tip(cutter, x, y))
    const nodes = sampleNodes(value, rect, step)
    let restAt: ReturnType<typeof restField> | undefined
    if (isRest) {
      const from = params.restFrom
      if (remaining === undefined && (from === undefined || previous === undefined)) {
        warnings.push("A rest operation needs `restFrom` (the previous tool it continues) or the stock the earlier operations left.")
        b.comment("nothing to cut: no previous tool given for the rest machining")
        return done(b.moves)
      }
      if (remaining === undefined && from !== undefined && from.diameter < tool.diameter) warnings.push(`The previous tool (${from.diameter} mm) is smaller than this one (${tool.diameter} mm): there is nothing a larger tool left behind.`)
      restAt = restField({
        surface, ...(remaining === undefined ? { previous, previousRadius: from!.diameter / 2 } : { remaining, allowance: params.allowance, threshold: params.restThreshold }),
        radius: tool.diameter / 2, keep, rect, step, stock: s, margin: 2 * cell, nodes, value
      })
    }
    let zPrev = levels.topZ
    for (const z of levels.passZ) {
      const level = Math.max(z, bottomZ)
      const field = restAt?.(level)
      const loops = contour(field?.value ?? value, level + 1e-9, rect, step, true, field?.nodes ?? nodes).map((l) => simplify(l, params.tolerance, true)).filter((l) => l.length >= 3)
      stats.levels += 1
      stats.loops += loops.length
      for (const group of nest(loops)) {
        const levelStock: Stock = { ...stock, origin: { ...stock.origin, z: zPrev } }
        if (params.clearing === "adaptive") {
          const adaptive = Schema.decodeUnknownSync(AdaptiveParams)({
            id: params.id, name: `${params.name} Z${level.toFixed(3)}`,
            clearanceHeight: params.clearanceHeight, safeHeight: params.safeHeight, retractHeight: params.retractHeight,
            totalDepth: zPrev - level, stepdown: zPrev - level, feed: params.feed, plungeFeed: params.plungeFeed,
            spindleRpm: params.spindleRpm, coolant: params.coolant, engagement: params.engagement,
            helixPitch: params.helixPitch, climb: params.climb, tolerance: params.tolerance
          })
          // Only the stock is material (the margin round it is air); a rest pass takes only what the previous tool left, from free air.
          const result = generateAdaptive(adaptive, { boundary: group.boundary, islands: group.islands }, tool, levelStock, field === undefined
            ? { material: (x, y) => x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1, helix: true }
            : { material: field.isUnswept })
          warnings.push(...result.warnings)
          for (const m of result.toolpath.moves) {
            if (m._tag === "Comment") continue
            b.push(m)
          }
          continue
        }
        const pocket = Schema.decodeUnknownSync(PocketParams)({
          id: params.id, name: `${params.name} Z${level.toFixed(3)}`,
          clearanceHeight: params.clearanceHeight, safeHeight: params.safeHeight, retractHeight: params.retractHeight,
          totalDepth: zPrev - level, stepdown: zPrev - level, feed: params.feed, plungeFeed: params.plungeFeed,
          spindleRpm: params.spindleRpm, coolant: params.coolant, stepover: params.stepover,
          entry: params.entry, helixPitch: params.helixPitch, rampAngle: params.rampAngle, climb: params.climb,
          tolerance: params.tolerance, toolCentre: true, allowance: 0
        })
        const path = generatePocket(pocket, { boundary: group.boundary, islands: group.islands }, tool, levelStock)
        for (const m of path.moves) {
          if (m._tag === "Comment") continue
          b.push(m)
        }
      }
      zPrev = level
    }
    if (stats.loops === 0) b.comment(isRest ? "nothing to cut: the previous tool left no material this tool can reach" : "nothing to cut: the part leaves no room for the tool at any depth")
    if (b.started) finish(b, levels)
    return done(b.moves)
  }

  /** Waterline passes; with `region` only the stretches of each contour where it holds. */
  const waterline = (region?: (x: number, y: number) => boolean): void => {
    const step = Math.max(cell, Math.min(params.tolerance * 25, tool.diameter / 6, 0.5))
    const margin = cutter.radius + 2 * step
    const rect: Rect = { x0: part.bounds.min[0] - margin, y0: part.bounds.min[1] - margin, x1: part.bounds.max[0] + margin, y1: part.bounds.max[1] + margin }
    const value = (x: number, y: number): number => surface.tip(cutter, x, y)
    const nodes = sampleNodes(value, rect, step)
    /**
     * The contour is interpolated linearly between grid nodes; where the drop-cutter surface curves (a ball rolling over an
     * edge) that misses the level by more than the tolerance. A few Newton steps along the gradient put the point on the level
     * of the true drop-cutter surface; a step that leaves the surface or jumps further than half a cell keeps the point.
     */
    const onLevel = (p: Vec2, level: number): Vec2 => {
      let q = p
      const h = Math.max(step / 8, 1e-4)
      for (let k = 0; k < 4; k++) {
        const f = value(q.x, q.y) - level
        if (!Number.isFinite(f) || Math.abs(f) <= params.tolerance / 20) break
        const gx = (value(q.x + h, q.y) - value(q.x - h, q.y)) / (2 * h), gy = (value(q.x, q.y + h) - value(q.x, q.y - h)) / (2 * h)
        const g2 = gx * gx + gy * gy
        if (!Number.isFinite(g2) || g2 < 1e-12) break
        const next = { x: q.x - (f * gx) / g2, y: q.y - (f * gy) / g2 }
        if (Math.hypot(next.x - p.x, next.y - p.y) > step / 2 || !Number.isFinite(value(next.x, next.y))) break
        q = next
      }
      // Still above the level (a cliff: the surface ends within the cell, where the gradient is meaningless): bisect downhill
      // to where the cutter is no lower than the surface, so the point never puts the tool into the part.
      const v0 = value(q.x, q.y)
      if (Number.isFinite(v0) && v0 - level > params.tolerance / 20) {
        let dx = 0, dy = 0
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const v = value(q.x + ox * h, q.y + oy * h)
          const drop = Number.isFinite(v) ? v0 - v : 1e6
          dx += ox * drop; dy += oy * drop
        }
        const len = Math.hypot(dx, dy)
        if (len > 1e-12) {
          const ux = dx / len, uy = dy / len
          const below = (t: number): boolean => { const v = value(q.x + ux * t, q.y + uy * t); return !Number.isFinite(v) || v <= level + params.tolerance / 20 }
          let lo = 0, hi = step / 2
          if (below(hi)) {
            for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (below(mid)) hi = mid; else lo = mid }
            q = { x: q.x + ux * hi, y: q.y + uy * hi }
          }
        }
      }
      return q
    }
    let at: Vec2 | undefined
    for (const z of levels.passZ) {
      const level = Math.max(z, bottomZ)
      if (level >= partTop + cutter.lift) continue
      const loops = contour(value, level, rect, step, false, nodes).map((l) => simplify(l.map((p) => onLevel(p, level)), params.tolerance, true)).filter((l) => l.length >= 3)
      if (loops.length === 0) continue
      stats.levels += 1
      // The contours run with the part on their left: that is climb milling; the other direction is conventional.
      // With a previous tool only the stretches it left material on are cut, as open pieces.
      const remaining = loops
        .map((l) => (params.climb ? l : [...l].reverse()))
        .flatMap((l) => (previous === undefined && !stockRest && region === undefined ? [{ pts: l, closed: true }] : piecesWhere(l, l.map((p) => leftAt(p.x, p.y, level) && (region === undefined || region(p.x, p.y))))))
      while (remaining.length > 0) {
        let bi = 0, bd = Infinity
        remaining.forEach((l, i) => { const d = at === undefined ? 0 : Math.min(...l.pts.map((p) => distance(p, at!))); if (d < bd) { bd = d; bi = i } })
        const [piece] = remaining.splice(bi, 1)
        const ring = piece!.closed ? startNear(piece!.pts, at) : piece!.pts
        const path = pathFromPoints(ring, piece!.closed)
        if (b.started) liftTo(b, levels.retractZ)
        approach(b, path.start, levels)
        b.rapid({ x: path.start.x, y: path.start.y, z: Math.max(levels.entryZ, level + 1) })
        b.linear({ x: path.start.x, y: path.start.y, z: level }, params.plungeFeed)
        followPath(b, path, level, params.feed)
        at = piece!.closed ? path.start : ring[ring.length - 1]
        stats.loops += 1
        stats.points += ring.length
      }
    }
  }

  /** Distance between finishing passes: from the cusp height for a ball cutter, otherwise the stepover percentage. */
  const passSpacing = (): number => params.scallop > 0 && tool.kind === "ballnose"
    ? scallopSpacing(tool.diameter / 2 + params.allowance, Math.min(params.scallop, tool.diameter / 2))
    : (params.stepover / 100) * tool.diameter
  /** Sampling step along a finishing pass: the drop-cutter is asked at least once per cell. */
  const ds = Math.max(Math.min(cell, params.tolerance * 5), params.tolerance)
  /** The tool tip at (x, y), or undefined where there is no surface, the previous tool left nothing, or `region` excludes it. */
  const dropAt = (x: number, y: number, region?: (x: number, y: number) => boolean): P3 | undefined => {
    const tip = surface.tip(cutter, x, y)
    return tip === -Infinity || !leftAt(x, y, tip) || (region !== undefined && !region(x, y)) ? undefined : [x, y, Math.max(tip, bottomZ)]
  }
  /** Splits points along a pass into the runs where the tool has a surface to follow, each simplified to the tolerance. */
  const runsAlong = (xy: ReadonlyArray<Vec2>, region?: (x: number, y: number) => boolean): P3[][] => {
    const runs: P3[][] = []
    let current: P3[] = []
    for (const q of xy) {
      const p = dropAt(q.x, q.y, region)
      if (p === undefined) { if (current.length > 1) runs.push(simplify3(current, params.tolerance)); current = []; continue }
      current.push(p)
    }
    if (current.length > 1) runs.push(simplify3(current, params.tolerance))
    return runs
  }
  /**
   * Emits finishing runs in order. Between two runs the tool stays down, riding the drop-cutter surface along the straight link,
   * when `stayDown(length in plan)` allows it and the surface is there all the way; otherwise it lifts, moves over and plunges.
   */
  const emitRuns = (runs: ReadonlyArray<ReadonlyArray<P3>>, stayDown: (len: number) => boolean): void => {
    const linkOk = (a: P3, c: P3): P3[] | undefined => {
      const len = Math.hypot(c[0] - a[0], c[1] - a[1])
      if (!stayDown(len)) return undefined
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
      if (run.length < 2) continue
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
  }

  /** Raster passes; with `region` only where it holds (the tool lifts between the pieces). */
  const parallel = (region?: (x: number, y: number) => boolean): void => {
    const spacing = passSpacing()
    if (!(spacing > 0)) {
      warnings.push("The cusp height or the stepover gives a zero line spacing")
      return
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
    const runs: P3[][] = []
    for (let i = 0; i < lines; i++) {
      const t = lines === 1 ? (t0 + t1) / 2 : t0 + ((t1 - t0) * i) / (lines - 1)
      const forward = params.oneWay ? params.climb : (params.climb ? i % 2 === 0 : i % 2 === 1)
      const n = Math.max(1, Math.ceil((s1 - s0) / ds))
      const xy: Vec2[] = []
      for (let k = 0; k <= n; k++) {
        const s = forward ? s0 + ((s1 - s0) * k) / n : s1 - ((s1 - s0) * k) / n
        xy.push({ x: s * ux + t * nx, y: s * uy + t * ny })
      }
      runs.push(...runsAlong(xy, region))
    }
    stats.lines = runs.length
    // Stay down between neighbouring runs; between pieces of a rest finish there is nothing to follow: the tool lifts.
    emitRuns(runs, (len) => previous === undefined && region === undefined && len <= 2.5 * spacing + 2 * cutter.radius * 0.1)
  }

  /** Centre of a spiral or radial pattern, and the radius that takes the cutter past every corner of the part. */
  const pattern = (): { readonly c: Vec2; readonly rMax: number } => {
    const lo = part.bounds.min, hi = part.bounds.max
    const c = params.center ?? { x: (lo[0] + hi[0]) / 2, y: (lo[1] + hi[1]) / 2 }
    const corners: Array<[number, number]> = [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]]
    return { c, rMax: Math.max(...corners.map(([x, y]) => Math.hypot(x - c.x, y - c.y))) + cutter.radius }
  }

  /** One Archimedean spiral r = spacing theta / 2 pi from the centre outwards (counter-clockwise when climbing). */
  const spiral = (): void => {
    const spacing = passSpacing()
    if (!(spacing > 0)) { warnings.push("The cusp height or the stepover gives a zero spacing between turns"); return }
    const { c, rMax } = pattern()
    const sense = params.climb ? 1 : -1
    const thetaMax = (2 * Math.PI * rMax) / spacing
    const xy: Vec2[] = []
    for (let theta = 0; ; ) {
      const r = (spacing * theta) / (2 * Math.PI)
      xy.push({ x: c.x + r * Math.cos(sense * theta), y: c.y + r * Math.sin(sense * theta) })
      if (theta >= thetaMax) break
      // Arc length ds per step, r dtheta; near the centre at most a quarter turn.
      theta = Math.min(thetaMax, theta + Math.min(Math.PI / 2, ds / Math.max(r, ds)))
    }
    const runs = runsAlong(xy)
    stats.lines = runs.length
    emitRuns(runs, (len) => previous === undefined && len <= 2.5 * spacing)
  }

  /** Lines from the centre outwards, `spacing` apart at the outermost radius; out and back in alternately. */
  const radial = (): void => {
    const spacing = passSpacing()
    if (!(spacing > 0)) { warnings.push("The cusp height or the stepover gives a zero spacing between lines"); return }
    const { c, rMax } = pattern()
    const count = Math.max(8, Math.ceil((2 * Math.PI * rMax) / spacing))
    const n = Math.max(1, Math.ceil(rMax / ds))
    const runs: P3[][] = []
    for (let i = 0; i < count; i++) {
      const a = ((params.climb ? 1 : -1) * 2 * Math.PI * i) / count
      const out = i % 2 === 0
      const xy: Vec2[] = []
      for (let k = 0; k <= n; k++) {
        const r = (rMax * (out ? k : n - k)) / n
        xy.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) })
      }
      runs.push(...runsAlong(xy))
    }
    stats.lines = runs.length
    emitRuns(runs, (len) => previous === undefined && len <= 2.5 * spacing)
  }

  /**
   * Constant-scallop finishing (see the header). Distances are measured over the tool-centre (drop-cutter) surface from the edge
   * of the region it covers; passes are the level lines of that distance at (k + 1/2) spacing, plus one through the middle of a
   * region whose innermost pass would leave more than half a spacing to its crest. Faces steeper than `SCALLOP_WALL_ANGLE`
   * bound the region like its edge.
   */
  const scallop3d = (): void => {
    const spacing = passSpacing()
    if (!(spacing > 0)) { warnings.push("The cusp height or the stepover gives a zero spacing between passes"); return }
    const step = Math.max(cell, Math.min(spacing / 2, params.tolerance * 25, tool.diameter / 6, 0.5))
    const margin = cutter.radius + 2 * step
    const rect: Rect = { x0: part.bounds.min[0] - margin, y0: part.bounds.min[1] - margin, x1: part.bounds.max[0] + margin, y1: part.bounds.max[1] + margin }
    const grid = nodeGrid(rect, step)
    const w = grid.nx + 1, h = grid.ny + 1
    const z = sampleNodes((x, y) => { const t = surface.tip(cutter, x, y); return t === -Infinity ? t : Math.max(t, bottomZ) }, rect, step)
    const tanWall = Math.tan((SCALLOP_WALL_ANGLE * Math.PI) / 180)
    const has = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < w && j < h && z[j * w + i]! !== -Infinity
    const inside = new Uint8Array(w * h)
    let steep = 0
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!has(i, j)) continue
      const k = j * w + i, v = z[k]!
      // One-sided differences where a neighbour has no surface (the edge of the region).
      const gx = has(i + 1, j) && has(i - 1, j) ? (z[k + 1]! - z[k - 1]!) / (2 * grid.dx) : has(i + 1, j) ? (z[k + 1]! - v) / grid.dx : has(i - 1, j) ? (v - z[k - 1]!) / grid.dx : 0
      const gy = has(i, j + 1) && has(i, j - 1) ? (z[k + w]! - z[k - w]!) / (2 * grid.dy) : has(i, j + 1) ? (z[k + w]! - v) / grid.dy : has(i, j - 1) ? (v - z[k - w]!) / grid.dy : 0
      if (Math.hypot(gx, gy) > tanWall) { steep++; continue }
      inside[k] = 1
    }
    if (steep > 0) warnings.push(`About ${(steep * grid.dx * grid.dy).toFixed(0)} mm2 (in plan) is steeper than ${SCALLOP_WALL_ANGLE} degrees and is left for a waterline pass`)
    const seed = new Uint8Array(w * h)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i
      if (inside[k] !== 1) continue
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1 || inside[k - 1] !== 1 || inside[k + 1] !== 1 || inside[k - w] !== 1 || inside[k + w] !== 1) seed[k] = 1
    }
    const dist = geodesicDistance(z, inside, seed, w, h, grid.dx, grid.dy)
    const field = new Float64Array(w * h)
    for (let k = 0; k < w * h; k++) field[k] = inside[k] === 1 && Number.isFinite(dist[k]!) ? dist[k]! : -1
    // Connected regions (4-neighbours) and the largest distance in each: where its passes stop.
    const region = new Int32Array(w * h).fill(-1)
    const crest: number[] = []
    for (let k0 = 0; k0 < w * h; k0++) {
      if (field[k0]! < 0 || region[k0] !== -1) continue
      const id = crest.length
      let top = 0
      const queue = [k0]
      region[k0] = id
      while (queue.length > 0) {
        const k = queue.pop()!
        if (field[k]! > top) top = field[k]!
        const i = k % w
        for (const n of [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, k - w, k + w]) {
          if (n < 0 || n >= w * h || field[n]! < 0 || region[n] !== -1) continue
          region[n] = id
          queue.push(n)
        }
      }
      crest.push(top)
    }
    const value = (x: number, y: number): number => {
      const fx = Math.min(grid.nx - 1e-9, Math.max(0, (x - rect.x0) / grid.dx)), fy = Math.min(grid.ny - 1e-9, Math.max(0, (y - rect.y0) / grid.dy))
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j
      const k = j * w + i
      return (field[k]! * (1 - tx) + field[k + 1]! * tx) * (1 - ty) + (field[k + w]! * (1 - tx) + field[k + w + 1]! * tx) * ty
    }
    /** The region a loop belongs to: one of the nodes of the cell its first point is in. */
    const regionOf = (p: Vec2): number => {
      const i = Math.min(grid.nx - 1, Math.max(0, Math.floor((p.x - rect.x0) / grid.dx))), j = Math.min(grid.ny - 1, Math.max(0, Math.floor((p.y - rect.y0) / grid.dy)))
      for (const k of [j * w + i, j * w + i + 1, (j + 1) * w + i, (j + 1) * w + i + 1]) if (region[k]! >= 0) return region[k]!
      return -1
    }
    // Levels: (k + 1/2) spacing everywhere, and per region one more halfway between its last level and its crest when needed.
    const levelsAt: Array<{ readonly level: number; readonly only?: number }> = []
    const top = Math.max(0, ...crest)
    for (let k = 0; (k + 0.5) * spacing < top; k++) levelsAt.push({ level: (k + 0.5) * spacing })
    crest.forEach((m, id) => {
      const last = m <= 0.5 * spacing ? undefined : (Math.ceil(m / spacing - 0.5) - 0.5) * spacing
      if (last === undefined) { if (m > 0) levelsAt.push({ level: m / 2, only: id }); return }
      if (m - last > 0.5 * spacing) levelsAt.push({ level: (last + m) / 2, only: id })
    })
    levelsAt.sort((a, b2) => a.level - b2.level)
    /** A closed level line in 3D: subdivided to the sampling step, dropped onto the surface, cut where there is no surface. */
    const piecesOf = (loop: ReadonlyArray<Vec2>): Array<{ readonly pts: P3[]; readonly closed: boolean }> => {
      const xy: Vec2[] = []
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i]!, c = loop[(i + 1) % loop.length]!
        const n = Math.max(1, Math.ceil(distance(a, c) / ds))
        for (let k = 0; k < n; k++) xy.push({ x: a.x + ((c.x - a.x) * k) / n, y: a.y + ((c.y - a.y) * k) / n })
      }
      const drops = xy.map((q) => dropAt(q.x, q.y))
      return piecesWhere(drops, drops.map((d) => d !== undefined)) as Array<{ readonly pts: P3[]; readonly closed: boolean }>
    }
    const runs: P3[][] = []
    let at: Vec2 | undefined
    for (const { level, only } of levelsAt) {
      const loops = contour(value, level, rect, step, false, field)
        .map((l) => simplify(l, Math.min(params.tolerance, step / 4), true))
        .filter((l) => l.length >= 3 && (only === undefined || regionOf(l[0]!) === only))
        .map((l) => (params.climb ? l : [...l].reverse()))
      if (loops.length === 0) continue
      stats.levels += 1
      const pieces = loops.flatMap(piecesOf).filter((p) => p.pts.length >= 2)
      while (pieces.length > 0) {
        let bi = 0, bd = Infinity
        pieces.forEach((p, i) => {
          const d = at === undefined ? 0 : Math.min(...p.pts.map((q) => Math.hypot(q[0] - at!.x, q[1] - at!.y)))
          if (d < bd) { bd = d; bi = i }
        })
        const [piece] = pieces.splice(bi, 1)
        let pts = piece!.pts
        if (piece!.closed && at !== undefined) {
          let best = 0, bestD = Infinity
          pts.forEach((q, i) => { const d = Math.hypot(q[0] - at!.x, q[1] - at!.y); if (d < bestD) { bestD = d; best = i } })
          pts = [...pts.slice(best), ...pts.slice(0, best)]
        }
        if (piece!.closed) pts = [...pts, pts[0]!]
        const run = simplify3(pts, params.tolerance)
        runs.push(run)
        const end = run[run.length - 1]!
        at = { x: end[0], y: end[1] }
        stats.loops += 1
      }
    }
    // Neighbouring passes are a spacing apart over the surface, so at most that in plan: the tool rides the surface between them.
    emitRuns(runs, (len) => previous === undefined && len <= 2 * spacing)
  }

  /**
   * Flat-area finishing (see the header). A flat face is a set of part columns at one height (within `FLAT_TOLERANCE`) covering
   * at least a quarter of the cutter's footprint; the tool centre may go where the cutter at that height rests on the part
   * (drop-cutter tip equal to it within the tolerance): nothing higher is under the cutter there, and it is not over a lower
   * area. Each such region is cleared at that height by the pocket engine. It enters by feeding down from the stock top (a helix
   * or ramp, never a rapid): an earlier roughing leaves its allowance on the walls round the face, above it, where a rapid
   * descent next to the wall would run into it.
   */
  const flats = (): void => {
    if (tool.kind === "ballnose") warnings.push("A ball nose leaves cusps on a flat face; a flat or bull-nose end mill finishes it")
    const heights: number[] = []
    for (const v of surface.height) if (v !== -Infinity) heights.push(v)
    heights.sort((a, c) => a - c)
    const minColumns = (Math.PI * cutter.radius * cutter.radius) / 4 / (part.grid.cellX * part.grid.cellY)
    const faces: number[] = []
    for (let i = 0; i < heights.length; ) {
      let j = i
      while (j + 1 < heights.length && heights[j + 1]! - heights[i]! <= FLAT_TOLERANCE) j++
      if (j - i + 1 >= minColumns) faces.push(heights[j]!)
      i = j + 1
    }
    const tol = Math.max(params.tolerance, 2 * FLAT_TOLERANCE)
    const step = Math.max(cell, Math.min(params.tolerance * 25, tool.diameter / 6, 0.5))
    const margin = cutter.radius + 2 * step
    const rect: Rect = { x0: part.bounds.min[0] - margin, y0: part.bounds.min[1] - margin, x1: part.bounds.max[0] + margin, y1: part.bounds.max[1] + margin }
    const tips = sampleNodes((x, y) => surface.tip(cutter, x, y), rect, step)
    const off = new Float64Array(tips.length)
    // Highest face first, so the tool works its way down.
    for (const face of faces.reverse()) {
      const zt = face + cutter.lift
      if (zt < bottomZ - 1e-9 || zt > levels.topZ + 1e-9) continue
      for (let k = 0; k < tips.length; k++) off[k] = tips[k] === -Infinity ? Infinity : Math.abs(tips[k]! - zt)
      const value = (x: number, y: number): number => { const t = surface.tip(cutter, x, y); return t === -Infinity ? Infinity : Math.abs(t - zt) }
      const loops = contour(value, tol, rect, step, true, off).map((l) => simplify(l, params.tolerance, true)).filter((l) => l.length >= 3)
      if (loops.length === 0) continue
      stats.levels += 1
      stats.loops += loops.length
      const above = Math.max(1, stock.origin.z - zt)
      for (const group of nest(loops)) {
        const pocket = Schema.decodeUnknownSync(PocketParams)({
          id: params.id, name: `${params.name} flat Z${zt.toFixed(3)}`,
          clearanceHeight: params.clearanceHeight, safeHeight: params.safeHeight, retractHeight: params.retractHeight,
          totalDepth: above, stepdown: above, feed: params.feed, plungeFeed: params.plungeFeed,
          spindleRpm: params.spindleRpm, coolant: params.coolant, stepover: params.stepover,
          entry: params.entry, helixPitch: params.helixPitch, rampAngle: params.rampAngle, climb: params.climb,
          tolerance: params.tolerance, toolCentre: true, allowance: 0
        })
        const path = generatePocket(pocket, { boundary: group.boundary, islands: group.islands }, tool, { ...stock, origin: { ...stock.origin, z: zt + above } })
        for (const m of path.moves) {
          if (m._tag === "Comment") continue
          b.push(m)
        }
      }
    }
  }

  /** Slope of the drop-cutter surface at (x, y), degrees from the horizontal; a cliff (no surface on one side) is vertical. */
  const slopeAt = (x: number, y: number): number => {
    const h = Math.max(cell, params.tolerance * 5)
    const xp = surface.tip(cutter, x + h, y), xm = surface.tip(cutter, x - h, y), yp = surface.tip(cutter, x, y + h), ym = surface.tip(cutter, x, y - h)
    if (![xp, xm, yp, ym].every(Number.isFinite)) return 90
    return (Math.atan(Math.hypot((xp - xm) / (2 * h), (yp - ym) / (2 * h))) * 180) / Math.PI
  }

  if (params.strategy === "waterline") {
    waterline()
    if (stats.loops === 0) b.comment(previous === undefined ? "nothing to cut: no contour of the part at the requested depths" : "nothing to cut: the previous tool left no material this tool can reach")
  } else if (params.strategy === "steep-shallow") {
    waterline((x, y) => slopeAt(x, y) >= params.slopeAngle - params.overlap)
    const steepLoops = stats.loops
    parallel((x, y) => slopeAt(x, y) <= params.slopeAngle + params.overlap)
    if (steepLoops === 0 && stats.lines === 0) b.comment("nothing to cut: no steep wall and no shallow area reachable")
  } else if (params.strategy === "scallop") {
    scallop3d()
    if (stats.loops === 0) b.comment(previous === undefined ? "nothing to cut: no surface the tool can follow at a constant scallop" : "nothing to cut: the previous tool left no material this tool can reach")
  } else if (params.strategy === "spiral" || params.strategy === "radial") {
    if (params.strategy === "spiral") spiral(); else radial()
    if (stats.lines === 0) b.comment(previous === undefined ? "nothing to cut: the cutter finds no surface along the pattern" : "nothing to cut: the previous tool left no material this tool can reach")
  } else if (params.strategy === "flat") {
    flats()
    if (stats.loops === 0) b.comment("nothing to cut: the part has no flat face the tool can rest on within the depths")
  } else {
    parallel()
    if (stats.lines === 0) b.comment(previous === undefined ? "nothing to cut: the cutter finds no surface along any line" : "nothing to cut: the previous tool left no material this tool can reach")
  }
  if (b.started) finish(b, levels)
  return done(b.moves)
}

export const Surface3D = { Params: SurfaceParams, generate: generateSurface } as const
export type { Cutter }
