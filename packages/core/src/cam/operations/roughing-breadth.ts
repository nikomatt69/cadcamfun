/**
 * Roughing breadth (spec 72 P2-3): the strategies a shop reaches for when plain pocket clearing or adaptive is the wrong tool.
 *
 *  - `generatePlunge`: plunge roughing. A lattice of vertical pecks inside the region, for long-reach tools and weak set-ups where
 *    the side force of a side cut is the problem. The lattice keeps `r + allowance` from every wall and island; pitch is `stepover`
 *    % of the diameter, so the ridges between plunges are left standing (for finishing to remove) and are the price of the strategy.
 *  - `generateHighFeed`: high-feed milling. Contour-parallel clearing with the axial depth held to a small fraction of the diameter
 *    (`highFeedDepth`), so the thin chip lets the feed rise; built on the pocket generator, so entries, islands and links are its.
 *  - `generateTrochoidalSlot`: a slot wider than the cutter cut with circular loops advancing along the centre line, so the radial
 *    engagement stays low and constant along the slot instead of burying the cutter full width.
 *  - `generatePeel`: peel milling. Full depth in one axial pass with a small radial step, outside in, so the cutter works along its
 *    flutes with a light side load.
 *
 * Every generator returns an ordinary `Toolpath`; heights follow `params.ts` and no move cuts below `totalDepth`.
 */
import { Schema } from "effect"
import type { Vec2 } from "../../cad/vec.ts"
import { distanceToChain, pointInRing, regionOf, type RegionInput } from "../geometry.ts"
import type { Toolpath } from "../ir.ts"
import { NonNegative, OperationFields, Positive, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import type { Stock, Tool } from "../tool.ts"
import { toolRadius } from "../tool.ts"
import { MoveBuilder, approach, finish, liftTo } from "./common.ts"
import { PocketParams } from "./pocket.ts"
import { generatePocket } from "./pocket.ts"

const stepoverField = (def: number) => withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 100 })), def)

// ----------------------------------------------------------------------------------------------------------- plunge

export class PlungeParams extends Schema.Class<PlungeParams>("cam/PlungeParams")(
  Schema.Struct({
    ...OperationFields,
    /** Lattice pitch as a percentage of the tool diameter. */
    stepover: stepoverField(70),
    /** Distance kept from every wall and island beyond the tool radius, mm. */
    allowance: withDefault(NonNegative, 0),
    /** Axial depth of one peck, mm; the tool lifts `chipLift` between pecks (the full `totalDepth` is reached in several pecks). */
    peck: withDefault(Positive, 3),
    chipLift: withDefault(Positive, 1),
    tolerance: withDefault(Positive, 0.01)
  }).check(heightsOrdered)
) {}

export interface PlungeStats { readonly sites: number }

/** The plunge sites of a region: a serpentine lattice of centres at least `r + allowance` from every ring. */
export const plungeSites = (region: RegionInput, tool: Tool, params: Pick<PlungeParams, "stepover" | "allowance" | "tolerance">): Vec2[] => {
  const reg = regionOf(region, params.tolerance)
  if (reg === undefined) return []
  const clear = toolRadius(tool) + params.allowance
  const pitch = (params.stepover / 100) * tool.diameter
  const rings = [reg.boundary, ...reg.islands]
  const xs = reg.boundary.map((p) => p.x)
  const ys = reg.boundary.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const feasible = (p: Vec2): boolean => {
    let inside = false
    for (const ring of rings) if (pointInRing(p, ring)) inside = !inside
    if (!inside) return false
    return rings.every((ring) => distanceToChain(p, ring, true) >= clear - 1e-6)
  }
  const rows = Math.max(1, Math.ceil((maxY - minY) / pitch - 1e-9) + 1)
  const cols = Math.max(1, Math.ceil((maxX - minX) / pitch - 1e-9) + 1)
  const out: Vec2[] = []
  for (let j = 0; j < rows; j++) {
    const y = rows === 1 ? (minY + maxY) / 2 : minY + ((maxY - minY) * j) / (rows - 1)
    const row: Vec2[] = []
    for (let i = 0; i < cols; i++) {
      const x = cols === 1 ? (minX + maxX) / 2 : minX + ((maxX - minX) * i) / (cols - 1)
      if (feasible({ x, y })) row.push({ x, y })
    }
    out.push(...(j % 2 === 0 ? row : row.reverse()))
  }
  return out
}

export const generatePlunge = (params: PlungeParams, geometry: RegionInput, tool: Tool, stock: Stock): Toolpath & { readonly stats: PlungeStats } => {
  const levels = levelsOf({ ...params, stepdown: params.peck }, stock.origin.z)
  const b = new MoveBuilder()
  b.comment(`Plunge roughing: ${params.name}`)
  const sites = plungeSites(geometry, tool, params)
  for (const s of sites) {
    approach(b, s, levels)
    b.rapid({ x: s.x, y: s.y, z: levels.entryZ })
    for (const z of levels.passZ) {
      b.linear({ x: s.x, y: s.y, z }, params.plungeFeed)
      if (z !== levels.passZ[levels.passZ.length - 1]) {
        // chip break: lift a little, come back to just above the bottom of this peck at the plunge feed
        b.linear({ x: s.x, y: s.y, z: z + params.chipLift }, params.plungeFeed * 2)
        b.linear({ x: s.x, y: s.y, z: z + 0.2 }, params.plungeFeed * 2)
      }
    }
    liftTo(b, levels.retractZ)
  }
  finish(b, levels)
  return { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves: b.moves, stats: { sites: sites.length } }
}

// ----------------------------------------------------------------------------------------------------------- high feed

/** Axial depth of a high-feed pass: 5 % of the diameter (thin chip, the feed rises), never more than the caller's `stepdown`. */
export const highFeedDepth = (tool: Tool, stepdown: number): number => Math.min(stepdown, Math.max(0.2, 0.05 * tool.diameter))

export class HighFeedParams extends Schema.Class<HighFeedParams>("cam/HighFeedParams")(
  Schema.Struct({
    ...OperationFields,
    stepover: stepoverField(70),
    allowance: withDefault(NonNegative, 0),
    tolerance: withDefault(Positive, 0.01)
  }).check(heightsOrdered)
) {}

export const generateHighFeed = (params: HighFeedParams, geometry: RegionInput, tool: Tool, stock: Stock): Toolpath => {
  const ap = highFeedDepth(tool, params.stepdown)
  const p = Schema.decodeUnknownSync(PocketParams)({
    id: params.id, name: params.name, clearanceHeight: params.clearanceHeight, safeHeight: params.safeHeight, retractHeight: params.retractHeight,
    totalDepth: params.totalDepth, stepdown: ap, feed: params.feed, plungeFeed: params.plungeFeed, spindleRpm: params.spindleRpm, coolant: params.coolant,
    stepover: params.stepover, allowance: params.allowance, entry: "ramp", rampAngle: 2, tolerance: params.tolerance
  })
  const tp = generatePocket(p, geometry, tool, stock)
  return { ...tp, moves: [{ _tag: "Comment", text: `High feed: ${params.name} (axial ${ap.toFixed(2)} mm)` }, ...tp.moves] }
}

// ----------------------------------------------------------------------------------------------------------- peel

export class PeelParams extends Schema.Class<PeelParams>("cam/PeelParams")(
  Schema.Struct({
    ...OperationFields,
    /** Radial step as a percentage of the diameter; peel milling keeps it light (at most 15). */
    stepover: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 15 })), 8),
    allowance: withDefault(NonNegative, 0),
    tolerance: withDefault(Positive, 0.01)
  }).check(heightsOrdered)
) {}

/** Outside-in contour-parallel clearing at full depth in one axial pass with a light radial step. */
export const generatePeel = (params: PeelParams, geometry: RegionInput, tool: Tool, stock: Stock): Toolpath => {
  const p = Schema.decodeUnknownSync(PocketParams)({
    id: params.id, name: params.name, clearanceHeight: params.clearanceHeight, safeHeight: params.safeHeight, retractHeight: params.retractHeight,
    totalDepth: params.totalDepth, stepdown: params.totalDepth, feed: params.feed, plungeFeed: params.plungeFeed, spindleRpm: params.spindleRpm, coolant: params.coolant,
    stepover: params.stepover, allowance: params.allowance, order: "outsideIn", entry: "ramp", tolerance: params.tolerance
  })
  const tp = generatePocket(p, geometry, tool, stock)
  return { ...tp, moves: [{ _tag: "Comment", text: `Peel: ${params.name} (full depth ${params.totalDepth} mm, radial ${((params.stepover / 100) * tool.diameter).toFixed(2)} mm)` }, ...tp.moves] }
}

// ----------------------------------------------------------------------------------------------------------- trochoidal slot

export class TrochoidalSlotParams extends Schema.Class<TrochoidalSlotParams>("cam/TrochoidalSlotParams")(
  Schema.Struct({
    ...OperationFields,
    /** Advance of the loop centre per revolution as a percentage of the diameter (the radial engagement scale). */
    stepover: stepoverField(12),
    /** Counter-clockwise loops (climb on the left wall) when true. */
    ccw: withDefault(Schema.Boolean, true),
    tolerance: withDefault(Positive, 0.01)
  }).check(heightsOrdered)
) {}

export interface SlotSpec { readonly from: Vec2; readonly to: Vec2; readonly width: number }

/** Angular step of a loop of radius `r` whose chords stay within `tolerance` (at most 15 degrees). */
export const loopAngleStep = (r: number, tolerance: number): number => Math.min(Math.PI / 12, 2 * Math.acos(Math.max(0, 1 - tolerance / Math.max(r, tolerance * 2))))

/**
 * Tool-centre points of one trochoidal pass from `slot.from` to `slot.to`: a full circle at the start, loops advancing along the
 * centre line, a full circle at the end. The centre stays within `(width - D) / 2` of the line, so the cutter never leaves the slot.
 */
export const trochoidPoints = (slot: SlotSpec, tool: Tool, params: Pick<TrochoidalSlotParams, "stepover" | "ccw" | "tolerance">): Vec2[] => {
  const r = (slot.width - tool.diameter) / 2
  const dx = slot.to.x - slot.from.x, dy = slot.to.y - slot.from.y
  const len = Math.hypot(dx, dy)
  const ux = len === 0 ? 1 : dx / len, uy = len === 0 ? 0 : dy / len
  const nx = -uy, ny = ux
  const sign = params.ccw ? 1 : -1
  const dTheta = loopAngleStep(r, params.tolerance)
  const loops = Math.max(1, Math.ceil(len / ((params.stepover / 100) * tool.diameter) - 1e-9))
  const at = (s: number, theta: number): Vec2 => {
    const a = sign * theta
    const along = s + r * Math.sin(a), across = -r * Math.cos(a)
    return { x: slot.from.x + ux * along + nx * across, y: slot.from.y + uy * along + ny * across }
  }
  const out: Vec2[] = []
  const circle = (s: number): void => { const n = Math.ceil(2 * Math.PI / dTheta); for (let i = 0; i <= n; i++) out.push(at(s, (2 * Math.PI * i) / n)) }
  circle(0)
  const total = 2 * Math.PI * loops
  const n = Math.ceil(total / dTheta)
  for (let i = 1; i <= n; i++) { const th = (total * i) / n; out.push(at((len * i) / n, th)) }
  circle(len)
  return out
}

export const generateTrochoidalSlot = (params: TrochoidalSlotParams, slot: SlotSpec, tool: Tool, stock: Stock): Toolpath => {
  if (slot.width < tool.diameter * 1.05) throw new RangeError(`trochoidal slot: width ${slot.width} mm is not wider than the cutter (${tool.diameter} mm); cut a slot that narrow with a straight pass`)
  if (Math.hypot(slot.to.x - slot.from.x, slot.to.y - slot.from.y) === 0) throw new RangeError("trochoidal slot: from and to coincide")
  const levels = levelsOf(params, stock.origin.z)
  const b = new MoveBuilder()
  b.comment(`Trochoidal slot: ${params.name}`)
  const forward = trochoidPoints(slot, tool, params)
  const backward = [...forward].reverse()
  levels.passZ.forEach((z, pass) => {
    const pts = pass % 2 === 0 ? forward : backward
    const first = pts[0]!
    if (pass === 0) {
      approach(b, first, levels)
      // helical entry over the start circle: the descent is spread over the first loop, which is cut from free air above the slot
      b.rapid({ x: first.x, y: first.y, z: levels.entryZ })
      const loop = Math.min(pts.length - 1, Math.ceil((2 * Math.PI) / loopAngleStep((slot.width - tool.diameter) / 2, params.tolerance)))
      for (let i = 1; i <= loop; i++) b.linear({ ...pts[i]!, z: levels.entryZ + ((z - levels.entryZ) * i) / loop }, params.plungeFeed)
      for (let i = loop + 1; i < pts.length; i++) b.linear({ ...pts[i]!, z }, params.feed)
    } else {
      const p = b.pos
      b.linear({ x: p.x, y: p.y, z }, params.plungeFeed)
      for (let i = 1; i < pts.length; i++) b.linear({ ...pts[i]!, z }, params.feed)
    }
  })
  liftTo(b, levels.retractZ)
  finish(b, levels)
  return { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves: b.moves }
}
