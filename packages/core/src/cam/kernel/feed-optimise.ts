/**
 * Feed optimisation along a program (spec 61 Z3, spec 69 G0b). Every move gets the largest feed that keeps the chip thickness at a
 * target (`chip`: constant chip load) or the spindle power at a share of what the machine has (`power`), without ever exceeding
 *
 *   - the machine's highest feed, or `maxFeedFactor` times the feed the move was programmed with,
 *   - the feed at which any load limit binds (spindle power, torque, tool deflection), judged at the engagement the stock gives the
 *     move *plus the declared bound of the measurement* (`engagement.ts`),
 *   - the geometric slowdown of `generator/postpass.ts adaptFeeds` at corners and small-radius arcs (half at a right angle, in
 *     proportion to the radius below 1.5 tool diameters, never below 40 %), which is a cap here, not a floor.
 *
 * A slew limit between consecutive moves only ever lowers a feed (so no limit can be broken by it); a long move is split into
 * pieces of `segment` mm so the feed follows the engagement inside it. The geometry of the program is unchanged: the pieces of a line
 * lie on the line, the pieces of an arc on the arc, and the last piece ends where the move ended. `mode: "off"` returns the very same
 * move list. Moves of a program with a rotary axis are `unresolved` and keep the feed they were programmed with.
 */
import { SPINDLE_ORIENT_SECONDS, arcSweepBetween, expandMoves, isFullCircle, moveLength, type Move } from "../ir.ts"
import type { Vec3 } from "../../cad/vec.ts"
import type { HeightField } from "../verify/heightfield.ts"
import type { Cutter } from "./cutters.ts"
import type { MachineLimits } from "./cutting-data.ts"
import { chipThinning } from "./cutting-data.ts"
import { contactArc, cuttingDataClaim, engagementAlong, moveLoads, stepLoad, type EngagementResult, type LoadSettings, type MoveLoad } from "./engagement.ts"
import type { WorkpieceMaterial } from "./materials.ts"

export type FeedMode = "off" | "chip" | "power"

export interface FeedOptimiseInput {
  readonly moves: ReadonlyArray<Move>
  readonly stock: HeightField
  readonly cutter: Cutter
  readonly material: WorkpieceMaterial
  readonly machine: MachineLimits
  readonly rpm: number
  readonly mode: FeedMode
  /** `chip`: the chip thickness to hold, mm. Default: the largest chip the program makes at the feeds it was programmed with. */
  readonly chip?: number
  /** `power`: the share of the available spindle power to use. Default 0.8. */
  readonly powerShare?: number
  /** Lowest target feed as a share of the programmed one (limits and the slew may still go below). Default 0.4. */
  readonly floor?: number
  /** Highest feed as a multiple of the programmed one. Default 3. */
  readonly maxFeedFactor?: number
  /** Largest relative change of the feed between two consecutive pieces. Default 0.3. */
  readonly slew?: number
  /** Length of the pieces a long move is split into, mm. Default: the cutter radius. */
  readonly segment?: number
  readonly maxDeflection?: number
  /** Rapid rate for the time estimate, mm/min. Default: the machine's highest feed. */
  readonly rapidRate?: number
  readonly start?: Vec3
  readonly signal?: AbortSignal
}

export interface FeedReport {
  readonly mode: FeedMode
  /** Cutting pieces whose feed changed. */
  readonly changed: number
  readonly pieces: number
  readonly unresolved: number
  readonly airPieces: number
  /** Pieces whose feed is held at the one programmed (entry ramps, plunges). */
  readonly entryPieces: number
  readonly feedMin: number
  readonly feedMax: number
  /** The target chip actually used, mm. */
  readonly chip: number
  /** Feed-limited by: counts per binding reason. */
  readonly bound: Readonly<Record<string, number>>
  /** Pieces that ended below the floor because a limit or the slew demanded it. */
  readonly belowFloor: number
  readonly cutSecondsBefore: number
  readonly cutSecondsAfter: number
  readonly totalSecondsBefore: number
  readonly totalSecondsAfter: number
  /** `1 - after/before` over the cutting time. */
  readonly cutTimeSaved: number
  readonly claimBefore: ReturnType<typeof cuttingDataClaim>["status"]
  readonly claimAfter: ReturnType<typeof cuttingDataClaim>["status"]
  /** Worst load / limit before and after (1 = at the limit). */
  readonly worstRatioBefore: number
  readonly worstRatioAfter: number
  readonly aeBound: number
}

export interface FeedOptimiseResult {
  readonly moves: ReadonlyArray<Move>
  readonly report: FeedReport
  readonly engagement: EngagementResult | undefined
  readonly loadsBefore: ReadonlyArray<MoveLoad>
  readonly loadsAfter: ReadonlyArray<MoveLoad>
}

// ------------------------------------------------------------------------------------------------- splitting

type Cutting = Extract<Move, { _tag: "Linear" | "Arc" }>

const splitMove = (mv: Cutting, from: Vec3, maxLength: number): Move[] => {
  const length = moveLength(mv, from)
  const pieces = Math.max(1, Math.ceil(length / maxLength))
  if (pieces === 1) return [mv]
  const out: Move[] = []
  if (mv._tag === "Linear") {
    for (let i = 1; i <= pieces; i++) {
      const t = i / pieces
      out.push({ ...mv, to: i === pieces ? mv.to : { x: from.x + (mv.to.x - from.x) * t, y: from.y + (mv.to.y - from.y) * t, z: from.z + (mv.to.z - from.z) * t } })
    }
    return out
  }
  const full = isFullCircle(mv, from)
  const sweep = full ? Math.PI * 2 : arcSweepBetween(from, mv.to, mv.center, mv.clockwise)
  const radius = Math.hypot(from.x - mv.center.x, from.y - mv.center.y)
  const a0 = Math.atan2(from.y - mv.center.y, from.x - mv.center.x)
  for (let i = 1; i <= pieces; i++) {
    const t = i / pieces
    const a = a0 + (mv.clockwise ? -1 : 1) * sweep * t
    out.push({ ...mv, to: i === pieces ? mv.to : { x: mv.center.x + radius * Math.cos(a), y: mv.center.y + radius * Math.sin(a), z: from.z + (mv.to.z - from.z) * t } })
  }
  return out
}

/** The move list with every canned cycle expanded and every cutting move cut into pieces of at most `maxLength` mm. */
export const splitProgram = (moves: ReadonlyArray<Move>, start: Vec3, maxLength: number): Move[] => {
  const expanded = expandMoves(moves, start)
  const out: Move[] = []
  let at = start
  for (const mv of expanded) {
    if (mv._tag === "Linear" || mv._tag === "Arc") out.push(...splitMove(mv, at, maxLength))
    else out.push(mv)
    if (mv._tag === "Rapid" || mv._tag === "Linear" || mv._tag === "Arc") at = mv.to
  }
  return out
}

// ------------------------------------------------------------------------------------------------- geometry caps

interface Geometry {
  /** Tangent at the start and at the end of a cutting piece (null for a vertical move). */
  readonly tIn: readonly [number, number] | null
  readonly tOut: readonly [number, number] | null
  readonly radius: number
  readonly length: number
  readonly horizontal: number
  readonly dz: number
}

const geometryOf = (mv: Cutting, from: Vec3): Geometry => {
  const dx = mv.to.x - from.x, dy = mv.to.y - from.y
  const horizontal = Math.hypot(dx, dy)
  const dz = mv.to.z - from.z
  if (mv._tag === "Linear") {
    const t = horizontal > 1e-9 ? ([dx / horizontal, dy / horizontal] as const) : null
    return { tIn: t, tOut: t, radius: Infinity, length: Math.hypot(horizontal, dz), horizontal, dz }
  }
  const r = Math.hypot(from.x - mv.center.x, from.y - mv.center.y)
  const sweep = isFullCircle(mv, from) ? Math.PI * 2 : arcSweepBetween(from, mv.to, mv.center, mv.clockwise)
  const tangent = (p: Vec3): readonly [number, number] => {
    const rx = (p.x - mv.center.x) / (r || 1), ry = (p.y - mv.center.y) / (r || 1)
    return mv.clockwise ? [ry, -rx] : [-ry, rx]
  }
  return { tIn: tangent(from), tOut: tangent(mv.to), radius: r, length: Math.hypot(r * sweep, dz), horizontal: r * sweep, dz }
}

/** Slowdown at a vertex between two cutting pieces, the way `adaptFeeds` reads it (half at a right angle). */
const cornerFactor = (a: Geometry, b: Geometry, d: number): number => {
  if (a.tOut === null || b.tIn === null) return 1
  const cos = Math.max(-1, Math.min(1, a.tOut[0] * b.tIn[0] + a.tOut[1] * b.tIn[1]))
  const theta = Math.acos(cos)
  if (theta < 1e-3) return 1
  if (theta >= (30 * Math.PI) / 180) return theta >= Math.PI / 2 ? 0.5 : 1 - 0.5 * ((theta - (15 * Math.PI) / 180) / (Math.PI / 2 - (15 * Math.PI) / 180))
  const rho = (0.5 * (a.length + b.length)) / theta
  return rho < 1.5 * d ? Math.max(0.4, rho / (1.5 * d)) : 1
}

// ------------------------------------------------------------------------------------------------- the optimiser

const cutSeconds = (moves: ReadonlyArray<Move>, feeds: ReadonlyArray<number>, start: Vec3): number => {
  let at = start
  let seconds = 0
  moves.forEach((mv, i) => {
    if (mv._tag === "Linear" || mv._tag === "Arc") seconds += (moveLength(mv, at) / feeds[i]!) * 60
    if (mv._tag === "Rapid" || mv._tag === "Linear" || mv._tag === "Arc") at = mv.to
  })
  return seconds
}

const rapidSeconds = (moves: ReadonlyArray<Move>, rate: number, start: Vec3): number => {
  let at = start
  let seconds = 0
  for (const mv of moves) {
    if (mv._tag === "Rapid") seconds += (moveLength(mv, at) / rate) * 60
    if (mv._tag === "Dwell") seconds += mv.seconds
    if (mv._tag === "SpindleOrient") seconds += SPINDLE_ORIENT_SECONDS
    if (mv._tag === "Rapid" || mv._tag === "Linear" || mv._tag === "Arc") at = mv.to
  }
  return seconds
}

const firstPoint = (moves: ReadonlyArray<Move>): Vec3 => {
  for (const m of moves) if (m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Arc") return m.to
  return { x: 0, y: 0, z: 0 }
}

/** Largest feed in `[lo, hi]` for which `ok(feed)` holds, by bisection (`ok` is monotone: a feed that fails stays failed above). */
const largestFeed = (lo: number, hi: number, ok: (feed: number) => boolean): number => {
  if (ok(hi)) return hi
  if (!ok(lo)) return lo
  let a = lo, b = hi
  for (let i = 0; i < 40 && b - a > 1e-3 * Math.max(1, a); i++) {
    const mid = (a + b) / 2
    if (ok(mid)) a = mid
    else b = mid
  }
  return a
}

export const optimizeFeeds = (input: FeedOptimiseInput): FeedOptimiseResult => {
  const start = input.start ?? firstPoint(input.moves)
  const machine = input.machine
  const rapidRate = input.rapidRate ?? machine.maxFeed
  if (input.mode === "off") {
    // Byte-for-byte today's program: the very same list, no engagement run.
    const feeds = input.moves.map((m) => (m._tag === "Linear" || m._tag === "Arc" ? m.feed : 1))
    const cut = cutSeconds(input.moves, feeds, start)
    const total = cut + rapidSeconds(input.moves, rapidRate, start)
    return {
      moves: input.moves, engagement: undefined, loadsBefore: [], loadsAfter: [],
      report: {
        mode: "off", changed: 0, pieces: 0, unresolved: 0, airPieces: 0, entryPieces: 0, feedMin: 0, feedMax: 0, chip: 0, bound: {}, belowFloor: 0,
        cutSecondsBefore: cut, cutSecondsAfter: cut, totalSecondsBefore: total, totalSecondsAfter: total, cutTimeSaved: 0,
        claimBefore: "unresolved", claimAfter: "unresolved", worstRatioBefore: 0, worstRatioAfter: 0, aeBound: 0
      }
    }
  }
  const c = input.cutter
  const D = c.diameter
  const floor = input.floor ?? 0.4
  const factor = input.maxFeedFactor ?? 3
  const slew = input.slew ?? 0.3
  const segment = Math.max(input.segment ?? D / 2, 0.2)
  const settings: LoadSettings = { material: input.material, cutter: c, machine, rpm: input.rpm, ...(input.maxDeflection !== undefined ? { maxDeflection: input.maxDeflection } : {}) }
  const z = Math.max(1, c.flutes)

  const pieces = splitProgram(input.moves, start, segment)
  const engagement = engagementAlong(pieces, input.stock, c, { start, ...(input.signal !== undefined ? { signal: input.signal } : {}) })
  const nominal: number[] = pieces.map((m) => (m._tag === "Linear" || m._tag === "Arc" ? m.feed : 0))
  const loadsBefore = moveLoads(engagement, settings, nominal)

  // Geometry of every cutting piece.
  const geometry: Array<Geometry | undefined> = new Array(pieces.length)
  {
    let at = start
    pieces.forEach((mv, i) => {
      if (mv._tag === "Linear" || mv._tag === "Arc") geometry[i] = geometryOf(mv, at)
      if (mv._tag === "Rapid" || mv._tag === "Linear" || mv._tag === "Arc") at = mv.to
    })
  }

  // The chip to hold: the largest chip the program makes as programmed, unless the caller names one.
  let chipTarget = input.chip ?? 0
  if (input.chip === undefined) {
    for (const m of engagement.perMove) {
      const g = geometry[m.index]
      if (m.status !== "resolved" || g === undefined || g.horizontal < Math.abs(g.dz)) continue
      const l = stepLoad(settings, m.aeMax, m.apMax, nominal[m.index]!)
      if (l.chipMax > chipTarget) chipTarget = l.chipMax
    }
  }
  const powerShare = input.powerShare ?? 0.8
  const powerLimit = machine.powerKw !== undefined ? machine.powerKw : undefined
  const eta = machine.efficiency ?? 0.8

  const feeds: number[] = [...nominal]
  const cap: number[] = new Array(pieces.length).fill(Infinity)
  const cutting: boolean[] = new Array(pieces.length).fill(false)
  const anchored: boolean[] = new Array(pieces.length).fill(false)
  const bound: Record<string, number> = {}
  const note = (why: string): void => { bound[why] = (bound[why] ?? 0) + 1 }
  let unresolved = 0, airPieces = 0, entryPieces = 0

  for (let i = 0; i < pieces.length; i++) {
    const mv = pieces[i]!
    if (mv._tag !== "Linear" && mv._tag !== "Arc") continue
    cutting[i] = true
    const m = engagement.perMove[i]!
    const g = geometry[i]!
    const base = nominal[i]!
    if (m.status === "unresolved") { unresolved++; anchored[i] = true; continue }
    const ceiling = Math.min(machine.maxFeed, base * factor)
    if (m.status === "air") {
      airPieces++
      feeds[i] = ceiling
      cap[i] = ceiling
      note(ceiling >= machine.maxFeed ? "machine feed" : "feed factor")
      continue
    }
    // An entry (a ramp or a plunge steeper than 45 degrees) keeps the feed it was programmed with.
    if (g.horizontal < Math.abs(g.dz)) { entryPieces++; anchored[i] = true; continue }
    const aeHi = Math.min(D, m.aeMax + engagement.bound.ae)
    const phiHi = contactArc(aeHi, D)
    const ok = (f: number): boolean => stepLoad(settings, aeHi, m.apMax, f).ratio <= 1
    const limit = largestFeed(Math.max(1, 0.02 * base), ceiling, ok)
    let target: number
    let why: string
    if (input.mode === "chip") {
      const sinPhi = phiHi >= Math.PI / 2 ? 1 : Math.sin(phiHi)
      const sinK = c.kind === "chamfer" || c.kind === "spot" || c.kind === "engraver" ? Math.sin(((c.angle ?? 90) * Math.PI) / 360) : 1
      target = (chipTarget / (sinPhi * sinK)) * c.flutes * input.rpm
      why = "chip"
    } else {
      target = powerLimit === undefined ? ceiling : largestFeed(Math.max(1, 0.02 * base), ceiling, (f) => stepLoad(settings, aeHi, m.apMax, f).powerKw / eta <= powerShare * powerLimit)
      why = "power"
    }
    let f = Math.max(target, floor * base)
    if (f > ceiling) { f = ceiling; why = ceiling >= machine.maxFeed ? "machine feed" : "feed factor" }
    if (f > limit) { f = limit; why = stepLoad(settings, aeHi, m.apMax, limit).binding }
    if (f < floor * base - 1e-9) note(`${why} (below floor)`)
    else note(why)
    feeds[i] = f
    cap[i] = limit
  }

  // Corners and small arcs keep their geometric slowdown (a cap on the optimised feed, not a floor).
  {
    let prev = -1
    for (let i = 0; i < pieces.length; i++) {
      if (!cutting[i]) { if (pieces[i]!._tag === "Rapid") prev = -1; continue }
      const g = geometry[i]!
      let f = 1
      if (g.radius < 1.5 * D && g.tIn !== null) f = Math.min(f, Math.max(0.4, g.radius / (1.5 * D)))
      if (prev >= 0) {
        const corner = cornerFactor(geometry[prev]!, g, D)
        if (corner < 1) {
          for (const k of [prev, i]) if (!anchored[k]) { feeds[k] = Math.min(feeds[k]!, Math.max(feeds[k]! * corner, 1)); }
        }
      }
      if (f < 1 && !anchored[i]) feeds[i] = Math.max(feeds[i]! * f, 1)
      prev = i
    }
  }

  // Slew: consecutive cutting pieces differ by at most `slew`; only ever lowers a feed.
  const run: number[] = []
  const flushRun = (): void => {
    for (let a = 1; a < run.length; a++) feeds[run[a]!] = Math.min(feeds[run[a]!]!, feeds[run[a - 1]!]! * (1 + slew))
    for (let a = run.length - 2; a >= 0; a--) feeds[run[a]!] = Math.min(feeds[run[a]!]!, feeds[run[a + 1]!]! * (1 + slew))
    run.length = 0
  }
  for (let i = 0; i < pieces.length; i++) {
    // An anchored piece (an entry at its own feed, an unresolved move) is not part of a run: the feeds around it are not tied to it.
    if (cutting[i] && !anchored[i]) run.push(i)
    else flushRun()
  }
  flushRun()

  // Feeds are written as whole mm/min, rounded down: rounding can only lower a feed.
  const out: Move[] = pieces.map((mv, i) => {
    if (!cutting[i] || mv._tag === "Rapid") return mv
    const f = Math.max(1, Math.floor(feeds[i]!))
    feeds[i] = f
    return f === nominal[i] ? mv : ({ ...mv, feed: f } as Move)
  })
  let changed = 0
  let feedMin = Infinity, feedMax = 0, belowFloor = 0
  for (let i = 0; i < pieces.length; i++) {
    if (!cutting[i]) continue
    if (feeds[i] !== nominal[i]) changed++
    feedMin = Math.min(feedMin, feeds[i]!); feedMax = Math.max(feedMax, feeds[i]!)
    const m = engagement.perMove[i]!
    if (m.status === "resolved" && feeds[i]! < floor * nominal[i]! - 1e-9 && geometry[i]!.horizontal >= Math.abs(geometry[i]!.dz)) belowFloor++
  }
  const loadsAfter = moveLoads(engagement, settings, feeds)
  const before = cuttingDataClaim(loadsBefore)
  const after = cuttingDataClaim(loadsAfter)
  const cutBefore = cutSeconds(pieces, nominal.map((f) => (f > 0 ? f : 1)), start)
  const cutAfter = cutSeconds(out, feeds.map((f, i) => (cutting[i] ? f : 1)), start)
  const rapid = rapidSeconds(pieces, rapidRate, start)
  return {
    moves: out, engagement, loadsBefore, loadsAfter,
    report: {
      mode: input.mode, changed, pieces: cutting.filter(Boolean).length, unresolved, airPieces, entryPieces,
      feedMin: Number.isFinite(feedMin) ? feedMin : 0, feedMax, chip: chipTarget, bound, belowFloor,
      cutSecondsBefore: cutBefore, cutSecondsAfter: cutAfter, totalSecondsBefore: cutBefore + rapid, totalSecondsAfter: cutAfter + rapid,
      cutTimeSaved: cutBefore > 0 ? 1 - cutAfter / cutBefore : 0, claimBefore: before.status, claimAfter: after.status,
      worstRatioBefore: before.worst?.ratio ?? 0, worstRatioAfter: after.worst?.ratio ?? 0, aeBound: engagement.bound.ae
    }
  }
}

/** The chip-thinning feed multiple a light cut allows (`cutting-data.ts`), exported for callers that start from the nominal data. */
export const thinningFor = (ae: number, d: number): number => chipThinning(ae, d)
