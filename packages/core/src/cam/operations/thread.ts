/**
 * Thread milling: a helical interpolation of a thread-milling cutter round (or through) a hole, one pitch of Z per revolution.
 *
 * ISO metric thread depth: the internal thread's tooth is `H1 = 0.54127 P` deep (so its minor diameter is `D - 2 H1`), the external
 * thread's is `h3 = 0.61343 P` (so its minor diameter is `D - 2 h3`). The tool centre follows a helix of radius
 *
 *   internal  `(D - d) / 2` at full depth, starting from `(D - 2 H1 - d) / 2` over the radial passes (the tool d must fit the minor)
 *   external  `(D - 2 h3 + d) / 2` at full depth, starting from `(D + d) / 2` over the radial passes
 *
 * Handedness is the helix itself: a right-hand thread rises with counter-clockwise travel, a left-hand one with clockwise. Whether
 * the mill climbs or not decides which way round it goes (internal: climb is counter-clockwise; external: climb is clockwise), and
 * the handedness then decides whether it starts at the bottom (rising) or at the top (descending). The cutter enters on a tangent
 * arc (a half circle from the axis inside a hole; an S-curve from outside a boss) and leaves the same way, so no dwell mark is cut.
 *
 * The cutter's centre travels on a circle of a different radius than the edge that does the work, so the feed along the path is
 * scaled by `r_centre / r_edge` (slower inside a hole, faster round a boss) to keep the feed at the thread constant.
 */
import { Schema } from "effect"
import type { Move, Toolpath } from "../ir.ts"
import { OperationFields, Positive, NonNegative, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import type { Stock, Tool } from "../tool.ts"
import { MoveBuilder, approach, finish, liftTo } from "./common.ts"

/** ISO 68-1 basic profile heights, in pitches. */
export const INTERNAL_THREAD_DEPTH = 0.54127
export const EXTERNAL_THREAD_DEPTH = 0.61343

export class ThreadParams extends Schema.Class<ThreadParams>("cam/ThreadParams")(
  Schema.Struct({
    ...OperationFields,
    // The cutter is not stepped down: the thread length is `totalDepth`, cut in one helix per radial pass.
    stepdown: withDefault(Positive, 1_000_000),
    /** Centre of the hole (or of the boss), mm. */
    x: withDefault(Schema.Finite, 0),
    y: withDefault(Schema.Finite, 0),
    /** Nominal (major) diameter of the thread, mm. */
    diameter: Positive,
    pitch: Positive,
    internal: withDefault(Schema.Boolean, true),
    rightHand: withDefault(Schema.Boolean, true),
    climb: withDefault(Schema.Boolean, true),
    /** Radial passes from the first cut to the full depth (the last is always at full depth). */
    passes: withDefault(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })), 2),
    /** Extra passes at full depth, to clear the springback of the tool. */
    springPasses: withDefault(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })), 0),
    /** Scale the feed from the cutter's centre to the edge that does the work. */
    compensateFeed: withDefault(Schema.Boolean, true),
    /** Distance the entry arc keeps from the thread, as a share of the radius (the S-curve of an external thread). */
    leadIn: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 0.1, maximum: 2 })), 0.5),
    tolerance: withDefault(NonNegative, 0.01)
  }).check(heightsOrdered)
) {}

export interface ThreadResult {
  readonly toolpath: Toolpath
  readonly warnings: ReadonlyArray<string>
  readonly stats: {
    readonly minorDiameter: number
    readonly majorDiameter: number
    /** Radius of the tool centre's helix on each radial pass, mm. */
    readonly radii: ReadonlyArray<number>
    readonly revolutions: number
  }
}

/** Minor diameter of the basic profile. */
export const threadMinorDiameter = (diameter: number, pitch: number, internal: boolean): number =>
  diameter - 2 * (internal ? INTERNAL_THREAD_DEPTH : EXTERNAL_THREAD_DEPTH) * pitch

export const generateThread = (params: ThreadParams, tool: Tool, stock: Stock): ThreadResult => {
  const levels = levelsOf(params, stock.origin.z)
  const warnings: string[] = []
  const b = new MoveBuilder()
  b.comment(`Thread mill: ${params.name} ${params.internal ? "internal" : "external"} M${params.diameter}x${params.pitch} ${params.rightHand ? "RH" : "LH"}`)
  const d = tool.diameter
  const minor = threadMinorDiameter(params.diameter, params.pitch, params.internal)
  const empty = (): ThreadResult => ({
    toolpath: { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves: b.moves },
    warnings, stats: { minorDiameter: minor, majorDiameter: params.diameter, radii: [], revolutions: 0 }
  })
  if (tool.kind === "drill") warnings.push("A drill cannot mill a thread; use a thread-milling cutter.")
  if (params.internal && d >= minor - 1e-6) {
    warnings.push(`The cutter (${d} mm) does not fit the minor diameter (${minor.toFixed(3)} mm) of the thread: it cannot enter the hole.`)
    b.comment("nothing to cut: the cutter is too large for the thread")
    return empty()
  }
  if (params.totalDepth < params.pitch) warnings.push(`The thread is shorter (${params.totalDepth} mm) than one pitch (${params.pitch} mm).`)

  // Radius of the tool centre's helix at full depth and at the first pass.
  const full = params.internal ? (params.diameter - d) / 2 : (minor + d) / 2
  const first = params.internal ? (minor - d) / 2 : (params.diameter + d) / 2
  const radii = Array.from({ length: params.passes }, (_, k) => (params.passes === 1 ? full : first + ((full - first) * k) / (params.passes - 1)))
  for (let k = 0; k < params.springPasses; k++) radii.push(full)

  // Sense of travel: +1 counter-clockwise, -1 clockwise. Internal climb milling is counter-clockwise, external climb is clockwise.
  const sense = params.internal === params.climb ? 1 : -1
  // The helix is right-handed when it rises with counter-clockwise travel; +1 means z grows along the travel.
  const rising = (params.rightHand ? 1 : -1) * sense === 1
  const top = levels.topZ
  const bottom = levels.bottomZ
  const zStart = rising ? bottom : top
  const zEnd = rising ? top : bottom
  const revolutions = params.totalDepth / params.pitch
  const whole = Math.floor(revolutions + 1e-9)
  const remainder = revolutions - whole
  const c = { x: params.x, y: params.y }

  for (const r of radii) {
    // Edge radius at this pass: where the cutting edge touches the thread (internal: the tool centre plus its radius; external: minus).
    const edge = params.internal ? r + d / 2 : r - d / 2
    const feed = params.compensateFeed && edge > 0 ? params.feed * (r / edge) : params.feed
    const start = { x: c.x + r, y: c.y }
    const turn = sense === -1
    // Entry arc: arrive at `start` going the way the helix goes there (tangent +Y for counter-clockwise, -Y for clockwise).
    if (b.started) liftTo(b, levels.retractZ)
    if (params.internal) {
      // Down the axis of the hole, then a half circle out to the helix.
      approach(b, c, levels)
      b.linear({ x: c.x, y: c.y, z: zStart }, params.plungeFeed)
      b.arc({ x: start.x, y: start.y, z: zStart }, { x: c.x + r / 2, y: c.y }, turn, feed)
    } else {
      // An S-curve from outside: the entry circle bends the other way, centred beyond the thread.
      const rho = params.leadIn * r
      const sEntry = -sense
      const centre = { x: start.x + rho, y: start.y }
      const angle = Math.PI - (sEntry * Math.PI) / 2
      const from = { x: centre.x + rho * Math.cos(angle), y: centre.y + rho * Math.sin(angle) }
      approach(b, from, levels)
      b.linear({ x: from.x, y: from.y, z: zStart }, params.plungeFeed)
      b.arc({ x: start.x, y: start.y, z: zStart }, centre, sEntry === -1, feed)
    }
    // The helix: one revolution per pitch, then the rest of a turn.
    const dz = rising ? params.pitch : -params.pitch
    let z = zStart
    for (let i = 0; i < whole; i++) {
      z += dz
      b.arc({ x: start.x, y: start.y, z: i === whole - 1 && remainder < 1e-6 ? zEnd : z }, c, turn, feed)
    }
    if (remainder >= 1e-6) {
      const phi = sense * 2 * Math.PI * remainder
      b.arc({ x: c.x + r * Math.cos(phi), y: c.y + r * Math.sin(phi), z: zEnd }, c, turn, feed)
    }
    // Leave the way it came in, at the end height.
    const here = b.pos
    if (params.internal) {
      b.arc({ x: c.x, y: c.y, z: zEnd }, { x: (here.x + c.x) / 2, y: (here.y + c.y) / 2 }, turn, feed)
    } else {
      const rho = params.leadIn * r
      const sExit = -sense
      const dirX = Math.cos(Math.atan2(here.y - c.y, here.x - c.x)), dirY = Math.sin(Math.atan2(here.y - c.y, here.x - c.x))
      const centre = { x: here.x + dirX * rho, y: here.y + dirY * rho }
      const a0 = Math.atan2(here.y - centre.y, here.x - centre.x) + (sExit * Math.PI) / 2
      b.arc({ x: centre.x + rho * Math.cos(a0), y: centre.y + rho * Math.sin(a0), z: zEnd }, centre, sExit === -1, feed)
    }
  }
  if (b.started) {
    liftTo(b, levels.retractZ)
    finish(b, levels)
  }
  return {
    toolpath: { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves: b.moves },
    warnings,
    stats: { minorDiameter: minor, majorDiameter: params.diameter, radii, revolutions }
  }
}

export const Thread = { Params: ThreadParams, generate: generateThread } as const
export type { Move }
