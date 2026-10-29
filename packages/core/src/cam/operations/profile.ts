/**
 * Profile operation (spec 04-core-cam.md §3): follow a contour at a constant
 * offset in several depth passes, with a real lead-in and optional tabs.
 *
 * Conventions
 *  - Closed contours: `outside` cuts with the tool centre outside the ring,
 *    `inside` inside it, `onLine` on it (no tool compensation).
 *  - Open contours: `outside` is the right-hand side of the travel direction,
 *    `inside` the left; `climb` does not apply (the side decides).
 *  - Milling direction assumes a clockwise spindle (`M3`): climb milling keeps the
 *    material on the left of the travel direction, i.e. counter-clockwise around
 *    an outside contour and clockwise around an inside one. `climb: false` flips it.
 *
 * Behaviour that fixes the legacy bugs (see spec §5):
 *  - between passes a closed contour steps down *along the path* (no rapid at
 *    depth, bug 4); an open contour lifts, repositions and re-enters;
 *  - `helix` entry is a real multi-revolution spiral (bug 5);
 *  - `ramp` entry and the step-down laps are limited by `rampAngle`, lapping or
 *    zig-zagging as long as it takes (bug 6);
 *  - circles and arcs stay arcs (exact `G2/G3`), polylines only become arcs when
 *    `arcFit` is set (bug 2).
 */
import { Schema } from "effect"
import { signedArea } from "../../cad/shapes.ts"
import { offsetRings } from "../../cad/offset.ts"
import { distance, type Vec2 } from "../../cad/vec.ts"
import type { Stock, Tool } from "../tool.ts"
import { toolRadius } from "../tool.ts"
import type { Toolpath } from "../ir.ts"
import { fitArcs } from "../arc-fit.ts"
import {
  type GeometryInput,
  distanceToChain,
  pointInRing,
  sourcesOf,
  type Source
} from "../geometry.ts"
import {
  OperationFields,
  Positive,
  NonNegative,
  heightsOrdered,
  levelsOf,
  withDefault,
  type Levels
} from "../params.ts"
import {
  type Path,
  type Seg,
  circlePath,
  endTangent,
  longestSegmentMidpoint,
  pathFromPoints,
  pathLength,
  pathPolyline,
  rotateClosedPath,
  startTangent
} from "../path.ts"
import {
  MoveBuilder,
  type TabWindow,
  approach,
  descendAlong,
  finish,
  helixDown,
  lapWithTabs,
  liftTo
} from "./common.ts"

export const ProfileSideSchema = Schema.Literals(["outside", "inside", "onLine"])
export type ProfileSide = typeof ProfileSideSchema.Type

export const LeadInSchema = Schema.Literals(["direct", "ramp", "helix", "arc"])
export type LeadIn = typeof LeadInSchema.Type

/** Material left standing: position along the path (0..1), width along the path, height above the floor. */
export const TabSchema = Schema.Struct({
  position: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  width: NonNegative,
  height: NonNegative
})
export type Tab = typeof TabSchema.Type

export class ProfileParams extends Schema.Class<ProfileParams>("cam/ProfileParams")(
  Schema.Struct({
    ...OperationFields,
    side: withDefault(ProfileSideSchema, "outside" as const),
    climb: withDefault(Schema.Boolean, true),
    /** Material left on the wall for a finishing pass, mm. */
    allowance: withDefault(NonNegative, 0),
    leadIn: withDefault(LeadInSchema, "direct" as const),
    /** Maximum pitch per helix revolution, mm. */
    helixPitch: withDefault(Positive, 1),
    /** Tool-centre helix radius, mm; `0` = the tool radius. */
    helixRadius: withDefault(NonNegative, 0),
    /** Radius of the tangential lead-in/out arc, mm. */
    leadRadius: withDefault(Positive, 2),
    /** Maximum ramp angle from horizontal, degrees. */
    rampAngle: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 0.1, maximum: 45 })), 3),
    tabs: withDefault(Schema.Array(TabSchema), [] as ReadonlyArray<Tab>),
    /** Replace circular runs of a polyline by arcs (circles and arcs always stay arcs). */
    arcFit: withDefault(Schema.Boolean, false),
    /** Tessellation / arc-fit tolerance, mm. */
    tolerance: withDefault(Positive, 0.01)
  }).check(heightsOrdered)
) {}

/** A path to cut together with a predicate for valid tool-centre positions (used to place lead-ins). */
export interface ProfilePlan {
  readonly path: Path
  readonly feasible: ((p: Vec2) => boolean) | undefined
}

const TOL = 1e-6

const wantCcw = (side: ProfileSide, climb: boolean): boolean => (side === "inside" ? !climb : climb)

const orientLoop = (loop: ReadonlyArray<Vec2>, ccw: boolean): Vec2[] =>
  signedArea(loop) > 0 === ccw ? [...loop] : [...loop].reverse()

const pathOfPoints = (points: ReadonlyArray<Vec2>, closed: boolean, params: ProfileParams): Path => {
  if (params.arcFit) {
    const ring = closed ? [...points, points[0]!] : points
    const fit = fitArcs(ring, { tolerance: params.tolerance })
    if (fit.arcs > 0) return { start: points[0]!, segs: fit.segs as ReadonlyArray<Seg>, closed }
  }
  return pathFromPoints(points, closed)
}

const startOnStraight = (path: Path): Path => {
  if (!path.closed || path.segs.length < 2) return path
  const { index, s } = longestSegmentMidpoint(path)
  return rotateClosedPath(path, index, s)
}

/** Turns one source curve into the tool-centre paths to cut. */
export const planSource = (source: Source, params: ProfileParams, tool: Tool): ProfilePlan[] => {
  const d = toolRadius(tool) + params.allowance
  const side = params.side
  switch (source.kind) {
    case "circle": {
      const radius = side === "outside" ? source.radius + d : side === "inside" ? source.radius - d : source.radius
      if (radius < 1e-6) return []
      const ccw = wantCcw(side, params.climb)
      const c = source.center
      const feasible =
        side === "outside"
          ? (p: Vec2) => distance(p, c) >= source.radius + d - TOL
          : side === "inside"
            ? (p: Vec2) => distance(p, c) <= source.radius - d + TOL
            : undefined
      return [{ path: circlePath(c, radius, !ccw, 0), feasible }]
    }
    case "arc": {
      // Right of travel is away from the centre for a counter-clockwise arc.
      const signed = side === "outside" ? d : side === "inside" ? -d : 0
      const radius = source.clockwise ? source.radius - signed : source.radius + signed
      if (radius < 1e-6) return []
      const at = (angle: number): Vec2 => ({
        x: source.center.x + radius * Math.cos(angle),
        y: source.center.y + radius * Math.sin(angle)
      })
      const start = at(source.startAngle)
      const end = at(source.endAngle)
      return [
        {
          path: {
            start,
            segs: [{ kind: "Arc", to: source.startAngle === source.endAngle ? start : end, center: source.center, clockwise: source.clockwise }],
            closed: false
          },
          feasible: undefined
        }
      ]
    }
    case "contour": {
      const { points, closed } = source.contour
      if (closed) {
        const ring = signedArea(points) >= 0 ? [...points] : [...points].reverse()
        const feasible =
          side === "outside"
            ? (p: Vec2) => !pointInRing(p, ring) && distanceToChain(p, ring, true) >= d - TOL
            : side === "inside"
              ? (p: Vec2) => pointInRing(p, ring) && distanceToChain(p, ring, true) >= d - TOL
              : undefined
        const loops =
          side === "onLine"
            ? [ring]
            : offsetRings([{ points: ring, closed: true }], side === "outside" ? d : -d, {
                mitreLimit: 2,
                joinFallback: "round"
              })
                .filter((p) => p.closed)
                .map((p) => [...p.points])
        const ccw = wantCcw(side, params.climb)
        return loops.map((loop) => ({
          path: startOnStraight(pathOfPoints(orientLoop(loop, ccw), true, params)),
          feasible
        }))
      }
      if (side === "onLine") return [{ path: pathOfPoints(points, false, params), feasible: undefined }]
      return offsetRings([{ points, closed: false }], side === "outside" ? d : -d, { mitreLimit: 2, joinFallback: "round" })
        .filter((p) => !p.closed)
        .map((p) => ({ path: pathOfPoints(p.points, false, params), feasible: undefined }))
    }
  }
}

// ---------------------------------------------------------------- entry

const leftOf = (t: Vec2): Vec2 => ({ x: -t.y, y: t.x })

/** Samples of a circle, used to verify that a helix or lead-in arc stays on feasible ground. */
const circleSamples = (center: Vec2, radius: number, n = 24): Vec2[] => {
  const out: Vec2[] = [center]
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n
    out.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) })
  }
  return out
}

interface HelixPlan {
  readonly center: Vec2
  readonly clockwise: boolean
}

const planHelix = (plan: ProfilePlan, radius: number): HelixPlan | undefined => {
  if (plan.feasible === undefined || radius < 1e-6) return undefined
  const t = startTangent(plan.path)
  for (const s of [1, -1]) {
    const n = leftOf(t)
    const center = { x: plan.path.start.x + s * n.x * radius, y: plan.path.start.y + s * n.y * radius }
    if (circleSamples(center, radius).every(plan.feasible)) return { center, clockwise: s === -1 }
  }
  return undefined
}

interface LeadPlan {
  readonly side: 1 | -1
  readonly radius: number
}

/** Chooses the side of the tangential lead-in/out arcs, or `undefined` when neither fits. */
const planLead = (plan: ProfilePlan, radius: number): LeadPlan | undefined => {
  if (plan.feasible === undefined) return undefined
  const tIn = startTangent(plan.path)
  const tOut = endTangent(plan.path)
  const S = plan.path.start
  for (const s of [1, -1] as const) {
    const nIn = leftOf(tIn)
    const nOut = leftOf(tOut)
    const cIn = { x: S.x + s * nIn.x * radius, y: S.y + s * nIn.y * radius }
    const cOut = { x: S.x + s * nOut.x * radius, y: S.y + s * nOut.y * radius }
    const P = { x: S.x + radius * (s * nIn.x - tIn.x), y: S.y + radius * (s * nIn.y - tIn.y) }
    const Q = { x: S.x + radius * (s * nOut.x + tOut.x), y: S.y + radius * (s * nOut.y + tOut.y) }
    const samples = [P, Q, ...quarterSamples(cIn, P, S), ...quarterSamples(cOut, S, Q)]
    if (samples.every(plan.feasible)) return { side: s, radius }
  }
  return undefined
}

/** Points on the short arc from `a` to `b` around `center` (both at the same radius). */
const quarterSamples = (center: Vec2, a: Vec2, b: Vec2, n = 6): Vec2[] => {
  const r = distance(a, center)
  const a0 = Math.atan2(a.y - center.y, a.x - center.x)
  let sweep = Math.atan2(b.y - center.y, b.x - center.x) - a0
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  while (sweep < -Math.PI) sweep += 2 * Math.PI
  const out: Vec2[] = []
  for (let i = 1; i < n; i++) {
    const ang = a0 + (sweep * i) / n
    out.push({ x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) })
  }
  return out
}

/**
 * Brings the tool to `path.start` at `z0`, coming from above the stock. Falls back
 * to a direct plunge when the requested lead-in does not fit.
 */
const enter = (
  b: MoveBuilder,
  plan: ProfilePlan,
  z0: number,
  params: ProfileParams,
  tool: Tool,
  levels: Levels
): void => {
  const S = plan.path.start
  const radius = params.helixRadius > 0 ? params.helixRadius : toolRadius(tool)
  let mode: LeadIn = params.leadIn
  const helix = mode === "helix" ? planHelix(plan, radius) : undefined
  if (mode === "helix" && helix === undefined) mode = "ramp"
  const lead = mode === "arc" ? planLead(plan, params.leadRadius) : undefined
  if (mode === "arc" && lead === undefined) mode = "direct"

  if (mode === "arc" && lead !== undefined) {
    const t = startTangent(plan.path)
    const n = leftOf(t)
    const r = lead.radius
    const P = { x: S.x + r * (lead.side * n.x - t.x), y: S.y + r * (lead.side * n.y - t.y) }
    approach(b, P, levels)
    b.rapid({ x: P.x, y: P.y, z: levels.entryZ })
    b.linear({ x: P.x, y: P.y, z: z0 }, params.plungeFeed)
    const center = { x: S.x + lead.side * n.x * r, y: S.y + lead.side * n.y * r }
    b.arc({ x: S.x, y: S.y, z: z0 }, center, lead.side === -1, params.feed)
    return
  }
  approach(b, S, levels)
  b.rapid({ x: S.x, y: S.y, z: levels.entryZ })
  if (mode === "helix" && helix !== undefined) {
    helixDown(b, helix.center, helix.clockwise, levels.entryZ, z0, params.helixPitch, params.plungeFeed)
  } else if (mode === "ramp") {
    descendAlong(b, plan.path, levels.entryZ, z0, params.rampAngle, params.plungeFeed)
  } else {
    b.linear({ x: S.x, y: S.y, z: z0 }, params.plungeFeed)
  }
}

/** Tangential lead-out arc and lift after the final pass. */
const leaveCut = (b: MoveBuilder, plan: ProfilePlan, params: ProfileParams, levels: Levels): void => {
  if (params.leadIn === "arc") {
    const lead = planLead(plan, params.leadRadius)
    if (lead !== undefined) {
      const t = endTangent(plan.path)
      const n = leftOf(t)
      const E = b.pos
      const r = lead.radius
      const Q = { x: E.x + r * (lead.side * n.x + t.x), y: E.y + r * (lead.side * n.y + t.y), z: E.z }
      b.arc(Q, { x: E.x + lead.side * n.x * r, y: E.y + lead.side * n.y * r }, lead.side === -1, params.feed)
    }
  }
  liftTo(b, levels.retractZ)
}

const tabWindows = (path: Path, params: ProfileParams, levels: Levels): TabWindow[] => {
  const total = pathLength(path)
  const windows: TabWindow[] = []
  for (const tab of params.tabs) {
    if (tab.width <= 0 || tab.height <= 0 || total <= 0) continue
    const z = levels.bottomZ + tab.height
    const center = tab.position * total
    const s0 = center - tab.width / 2
    const s1 = center + tab.width / 2
    if (s0 >= 0 && s1 <= total) windows.push({ s0, s1, z })
    else if (path.closed && s0 < 0) {
      windows.push({ s0: 0, s1, z }, { s0: total + s0, s1: total, z })
    } else if (path.closed && s1 > total) {
      windows.push({ s0, s1: total, z }, { s0: 0, s1: s1 - total, z })
    } else windows.push({ s0: Math.max(0, s0), s1: Math.min(total, s1), z })
  }
  return windows
}

/** Where a tab stands: the tool-centre path under it, and the height its top reaches above the operation's bottom. */
export interface TabFootprint {
  readonly points: ReadonlyArray<Vec2>
  /** Z of the top of the material left standing. */
  readonly z: number
}

/**
 * The material `params.tabs` leave standing, as the stretch of tool-centre path each one raises the cutter over. The cutter
 * (radius `toolRadius`) does not cut below `z` within that radius of the stretch, which is what the stock replay has to expect.
 * Uses the same plans as `generateProfile`, so the footprints and the moves agree.
 */
export const profileTabFootprints = (params: ProfileParams, geometry: GeometryInput, tool: Tool, stock: Stock): TabFootprint[] => {
  const levels = levelsOf(params, stock.origin.z)
  const out: TabFootprint[] = []
  for (const source of sourcesOf(geometry, params.tolerance)) {
    for (const plan of planSource(source, params, tool)) {
      const path = plan.path
      const total = pathLength(path)
      if (path.segs.length === 0 || total <= 0) continue
      const poly = pathPolyline(path, 0.01)
      const cum = [0]
      for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1]! + Math.hypot(poly[i]!.x - poly[i - 1]!.x, poly[i]!.y - poly[i - 1]!.y))
      const scale = cum[cum.length - 1]! / total
      for (const w of tabWindows(path, params, levels)) {
        const s0 = w.s0 * scale, s1 = w.s1 * scale
        const pts: Vec2[] = []
        const at = (s: number): Vec2 => {
          let i = 1
          while (i < cum.length - 1 && cum[i]! < s) i++
          const span = cum[i]! - cum[i - 1]!
          const t = span > 0 ? (s - cum[i - 1]!) / span : 0
          return { x: poly[i - 1]!.x + (poly[i]!.x - poly[i - 1]!.x) * t, y: poly[i - 1]!.y + (poly[i]!.y - poly[i - 1]!.y) * t }
        }
        pts.push(at(s0))
        for (let i = 1; i < poly.length - 1; i++) if (cum[i]! > s0 && cum[i]! < s1) pts.push(poly[i]!)
        pts.push(at(s1))
        out.push({ points: pts, z: w.z })
      }
    }
  }
  return out
}

const emitPlan = (b: MoveBuilder, plan: ProfilePlan, params: ProfileParams, tool: Tool, levels: Levels): void => {
  const path = plan.path
  if (path.segs.length === 0) return
  const tabs = tabWindows(path, params, levels)
  const passes = levels.passZ
  passes.forEach((z, index) => {
    if (index === 0 || !path.closed) {
      enter(b, plan, z, params, tool, levels)
    } else {
      // Closed contour: step down along the path, never rapid at depth (bug 4).
      descendAlong(b, path, passes[index - 1]!, z, params.rampAngle, params.plungeFeed, tabs)
    }
    lapWithTabs(b, path, z, params.feed, params.plungeFeed, tabs)
    if (!path.closed) liftTo(b, levels.retractZ)
  })
  leaveCut(b, plan, params, levels)
}

/** The area the tool centre must stay in, a tool radius off every wall: the pocket the profile is cut in and the islands standing in it. */
export interface ProfileWithin {
  readonly boundary: ReadonlyArray<Vec2>
  readonly islands: ReadonlyArray<ReadonlyArray<Vec2>>
}

/** Narrows where lead-ins and helices may go to `within`: they must not swing into a neighbouring wall or island. */
const keepWithin = (plan: ProfilePlan, within: ProfileWithin, d: number): ProfilePlan => {
  if (plan.feasible === undefined) return plan
  const own = plan.feasible
  return {
    path: plan.path,
    feasible: (p) =>
      own(p) && pointInRing(p, within.boundary) && distanceToChain(p, within.boundary, true) >= d - TOL &&
      within.islands.every((i) => !pointInRing(p, i) && distanceToChain(p, i, true) >= d - TOL)
  }
}

/**
 * Generates a profile toolpath. Pure: the same inputs always yield the same
 * moves, which is what makes golden G-code tests possible. `within` (optional) is the region the tool stays in; it only
 * changes where the lead-ins may be placed, never the path.
 */
export const generateProfile = (
  params: ProfileParams,
  geometry: GeometryInput,
  tool: Tool,
  stock: Stock,
  within?: ProfileWithin
): Toolpath => {
  const levels = levelsOf(params, stock.origin.z)
  const b = new MoveBuilder()
  b.comment(`Profile ${params.side}: ${params.name}`)
  const d = toolRadius(tool) + params.allowance
  for (const source of sourcesOf(geometry, params.tolerance)) {
    for (const plan of planSource(source, params, tool)) emitPlan(b, within === undefined ? plan : keepWithin(plan, within, d), params, tool, levels)
  }
  if (!b.started) b.comment("nothing to cut: the offset contour collapsed")
  finish(b, levels)
  return {
    id: params.id,
    name: params.name,
    toolId: tool.id,
    spindleRpm: params.spindleRpm,
    coolant: params.coolant,
    moves: b.moves
  }
}

export const Profile = { Params: ProfileParams, generate: generateProfile } as const

