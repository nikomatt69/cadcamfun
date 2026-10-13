/**
 * Pocket operation (spec 04-core-cam.md §3): contour-parallel clearing of a closed
 * boundary with optional islands, in several depth passes.
 *
 * Strategy
 *  - The tool centre follows offsets of the region at `r + allowance`,
 *    `r + allowance + stepover`, ... until the region collapses; one last,
 *    finer offset is added if the final gap would otherwise be wider than the
 *    tool can cover. All rings are offset together (boundary shrinks, islands
 *    grow), so islands are respected by construction.
 *  - Loops are cut from the inside out by default (`order`), starting with a
 *    helix or ramp entry; stepover moves between loops stay at depth when the
 *    straight link lies entirely on tool-centre ground, otherwise the tool lifts
 *    and re-enters.
 *  - Deeper passes revisit exactly the same XY chains, so all vertical travel
 *    happens where the previous pass already cleared the material.
 *  - `finishPass` with a positive `allowance` adds a last wall pass at full depth.
 */
import { Schema } from "effect"
import { signedArea } from "../../cad/shapes.ts"
import { offsetRings, type OffsetPath } from "../../cad/offset.ts"
import { distance, type Vec2 } from "../../cad/vec.ts"
import type { Stock, Tool } from "../tool.ts"
import { toolRadius } from "../tool.ts"
import type { Toolpath } from "../ir.ts"
import {
  type RegionInput,
  type Region,
  distanceToChain,
  pointInRing,
  regionOf,
} from "../geometry.ts"
import { OperationFields, Positive, NonNegative, heightsOrdered, levelsOf, withDefault, type Levels } from "../params.ts"
import { type Path, longestSegmentMidpoint, pathFromPoints, pathLength, rotateClosedPath, startTangent } from "../path.ts"
import { MoveBuilder, approach, descendAlong, finish, followPath, helixDown, liftTo } from "./common.ts"

export const PocketEntrySchema = Schema.Literals(["plunge", "ramp", "helix"])
export type PocketEntry = typeof PocketEntrySchema.Type

export const PocketOrderSchema = Schema.Literals(["insideOut", "outsideIn"])

export class PocketParams extends Schema.Class<PocketParams>("cam/PocketParams")(
  Schema.Struct({
    ...OperationFields,
    /** Stepover as a percentage of the tool diameter, `(0, 100]`. */
    stepover: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 100 })), 40),
    /** Material left on the walls, mm. */
    allowance: withDefault(NonNegative, 0),
    /** Add a final wall pass at full depth (only meaningful with `allowance > 0`). */
    finishPass: withDefault(Schema.Boolean, false),
    climb: withDefault(Schema.Boolean, true),
    entry: withDefault(PocketEntrySchema, "helix" as const),
    order: withDefault(PocketOrderSchema, "insideOut" as const),
    helixPitch: withDefault(Positive, 1),
    /** Tool-centre helix radius, mm; `0` = the tool radius. */
    helixRadius: withDefault(NonNegative, 0),
    rampAngle: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 0.1, maximum: 45 })), 3),
    tolerance: withDefault(Positive, 0.01),
    /**
     * The geometry is already the region the tool CENTRE may occupy (as the 3D roughing computes it), so the tool radius is not
     * taken off the walls again. `allowance` is then the distance kept from that region's walls.
     */
    toolCentre: withDefault(Schema.Boolean, false)
  }).check(heightsOrdered)
) {}

const TOL = 1e-6
const OFFSET_OPTIONS = { mitreLimit: 2, joinFallback: "round" } as const

const orient = (ring: ReadonlyArray<Vec2>, ccw: boolean): Vec2[] =>
  signedArea(ring) > 0 === ccw ? [...ring] : [...ring].reverse()

/** Offset chains of a region at tool-centre distance `d`. */
const chainsAt = (region: Region, d: number): OffsetPath[] =>
  offsetRings(
    [
      { points: orient(region.boundary, false), closed: true },
      ...region.islands.map((points) => ({ points: orient(points, true), closed: true }))
    ],
    d,
    { ...OFFSET_OPTIONS, keep: "inside" }
  )

/** Predicate: valid tool-centre position at least `minDist` from every ring, inside the region. */
const makeFeasible = (region: Region, minDist: number): ((p: Vec2) => boolean) => {
  const rings = [region.boundary, ...region.islands]
  return (p) => {
    let inside = false
    for (const ring of rings) if (pointInRing(p, ring)) inside = !inside
    if (!inside) return false
    for (const ring of rings) if (distanceToChain(p, ring, true) < minDist - TOL) return false
    return true
  }
}

const linkIsFeasible = (a: Vec2, b: Vec2, feasible: (p: Vec2) => boolean, step: number): boolean => {
  const len = distance(a, b)
  const n = Math.max(1, Math.ceil(len / Math.max(step, 1e-3)))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    if (!feasible({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false
  }
  return true
}

const toPath = (chain: OffsetPath, climb: boolean): Path => {
  const points = climb ? chain.points : [...chain.points].reverse()
  return pathFromPoints(points, chain.closed)
}

/** Rotates a closed chain so it starts at the vertex nearest to `from`. */
const startNear = (path: Path, from: Vec2): Path => {
  if (!path.closed || path.segs.length < 2) return path
  let best = 0
  let bestD = Infinity
  const points = [path.start, ...path.segs.slice(0, -1).map((s) => s.to)]
  points.forEach((p, i) => {
    const d = distance(p, from)
    if (d < bestD - 1e-12) {
      bestD = d
      best = i
    }
  })
  return rotateClosedPath(path, best, 0)
}

/** Orders chains greedily by distance from the previous end, rotating loops to start near it. */
const sequence = (chains: ReadonlyArray<Path>, from: Vec2 | undefined): Path[] => {
  const remaining = [...chains]
  const out: Path[] = []
  let at = from
  while (remaining.length > 0) {
    let bi = 0
    let bd = Infinity
    remaining.forEach((c, i) => {
      const d = at === undefined ? 0 : distance(c.start, at)
      if (d < bd - 1e-12) {
        bd = d
        bi = i
      }
    })
    let [next] = remaining.splice(bi, 1)
    if (next === undefined) break
    next = at === undefined ? startMid(next) : startNear(next, at)
    out.push(next)
    at = next.closed ? next.start : next.segs[next.segs.length - 1]?.to ?? next.start
  }
  return out
}

const startMid = (path: Path): Path => {
  if (!path.closed || path.segs.length < 2) return path
  const { index, s } = longestSegmentMidpoint(path)
  return rotateClosedPath(path, index, s)
}

interface Entry {
  readonly kind: "plunge" | "ramp" | "helix"
  readonly center?: Vec2
  readonly clockwise?: boolean
}

const planEntry = (path: Path, params: PocketParams, tool: Tool, feasible: (p: Vec2) => boolean): Entry => {
  if (params.entry === "helix") {
    const radius = params.helixRadius > 0 ? params.helixRadius : toolRadius(tool)
    const t = startTangent(path)
    const n = { x: -t.y, y: t.x }
    for (const s of [1, -1]) {
      const center = { x: path.start.x + s * n.x * radius, y: path.start.y + s * n.y * radius }
      let ok = feasible(center)
      for (let i = 0; ok && i < 24; i++) {
        const a = (i * 2 * Math.PI) / 24
        ok = feasible({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) })
      }
      if (ok) return { kind: "helix", center, clockwise: s === -1 }
    }
    return { kind: "ramp" }
  }
  return { kind: params.entry }
}

const enterAt = (
  b: MoveBuilder,
  path: Path,
  entry: Entry,
  fromZ: number,
  toZ: number,
  params: PocketParams
): void => {
  const S = path.start
  if (entry.kind === "helix" && entry.center !== undefined) {
    helixDown(b, entry.center, entry.clockwise === true, fromZ, toZ, params.helixPitch, params.plungeFeed)
  } else if (entry.kind === "ramp") {
    descendAlong(b, path, fromZ, toZ, params.rampAngle, params.plungeFeed)
  } else {
    b.linear({ x: S.x, y: S.y, z: toZ }, params.plungeFeed)
  }
}

export const generatePocket = (
  params: PocketParams,
  geometry: RegionInput,
  tool: Tool,
  stock: Stock
): Toolpath => {
  const levels = levelsOf(params, stock.origin.z)
  const b = new MoveBuilder()
  b.comment(`Pocket: ${params.name}`)
  const region = regionOf(geometry, params.tolerance)
  const r = toolRadius(tool)
  const done = (): Toolpath => {
    finish(b, levels)
    return { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves: b.moves }
  }
  if (region === undefined) {
    b.comment("nothing to cut: no closed boundary")
    return done()
  }
  const d0 = (params.toolCentre ? 0 : r) + params.allowance
  const step = (params.stepover / 100) * tool.diameter

  // Offset levels from the wall inwards.
  const byLevel: OffsetPath[][] = []
  let d = d0
  let last: OffsetPath[] = []
  for (let guard = 0; guard < 10000; guard++) {
    const chains = chainsAt(region, d)
    if (chains.length === 0) break
    byLevel.push(chains)
    last = chains
    d += step
  }
  if (last.length > 0) {
    // The next full step collapsed; try finer steps so no band wider than the tool is left.
    for (const f of [0.5, 0.25]) {
      const chains = chainsAt(region, d - step + f * step)
      if (chains.length > 0) {
        byLevel.push(chains)
        break
      }
    }
  }
  if (byLevel.length === 0) {
    b.comment("nothing to cut: the pocket is narrower than the tool")
    return done()
  }
  let ordered = params.order === "insideOut" ? [...byLevel].reverse() : byLevel
  // Surface regions can collapse to a sub-millimetre loop at their innermost offset. Enter on the outer loop instead:
  // its ramp retains the angle limit, then the small loops are swept at depth without thousands of entry laps.
  if (params.toolCentre && params.order === "insideOut" && ordered[0]?.some((c) => pathLength(toPath(c, params.climb)) < tool.diameter)) {
    ordered = byLevel
  }

  // Fixed XY sequence reused by every depth pass.
  const seq: Path[] = []
  let at: Vec2 | undefined
  for (const level of ordered) {
    const paths = sequence(level.map((c) => toPath(c, params.climb)), at)
    seq.push(...paths)
    const lastPath = paths[paths.length - 1]
    if (lastPath !== undefined) at = lastPath.closed ? lastPath.start : lastPath.segs[lastPath.segs.length - 1]?.to ?? lastPath.start
  }
  const feasible = makeFeasible(region, d0)
  const linkStep = Math.max(0.25 * r, 0.05)
  const maxLink = 4 * tool.diameter

  const passes = levels.passZ
  passes.forEach((z, j) => {
    const zPrev = j === 0 ? levels.entryZ : passes[j - 1]!
    seq.forEach((path, i) => {
      const Q = path.start
      let linked = false
      if (i > 0 && b.started) {
        const E = b.pos
        linked =
          Math.abs(E.z - z) < 1e-9 &&
          distance(E, Q) <= maxLink &&
          linkIsFeasible(E, Q, feasible, linkStep)
        if (linked) b.linear({ x: Q.x, y: Q.y, z }, params.feed)
      }
      if (!linked) {
        if (b.started) liftTo(b, levels.retractZ)
        approach(b, Q, levels)
        if (j === 0) {
          b.rapid({ x: Q.x, y: Q.y, z: levels.entryZ })
        } else {
          // Everything above the previous floor was cleared by the previous pass along this very chain.
          b.rapid({ x: Q.x, y: Q.y, z: Math.max(levels.entryZ, zPrev) })
          b.linear({ x: Q.x, y: Q.y, z: zPrev }, params.feed)
        }
        const entry = planEntry(path, params, tool, feasible)
        enterAt(b, path, entry, zPrev, z, params)
      }
      followPath(b, path, z, params.feed)
    })
  })

  // Optional finishing wall pass at full depth.
  if (params.finishPass && params.allowance > 0 && !params.toolCentre) {
    const z = levels.bottomZ
    const finishFeasible = makeFeasible(region, r)
    const chains = sequence(chainsAt(region, r).map((c) => toPath(c, params.climb)), b.started ? b.pos : undefined)
    chains.forEach((path) => {
      const Q = path.start
      const E = b.pos
      const linked = Math.abs(E.z - z) < 1e-9 && distance(E, Q) <= maxLink && linkIsFeasible(E, Q, finishFeasible, linkStep)
      if (linked) b.linear({ x: Q.x, y: Q.y, z }, params.feed)
      else {
        liftTo(b, levels.retractZ)
        approach(b, Q, levels)
        b.rapid({ x: Q.x, y: Q.y, z: levels.entryZ })
        b.linear({ x: Q.x, y: Q.y, z }, params.plungeFeed)
      }
      followPath(b, path, z, params.feed)
    })
  }
  liftTo(b, levels.retractZ)
  return done()
}

export const Pocket = { Params: PocketParams, generate: generatePocket } as const
export type { Levels }
