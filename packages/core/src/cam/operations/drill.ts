/**
 * Drill operation (spec 04-core-cam.md §3): drills at points, optionally pecking.
 *
 * Holes are ordered by nearest neighbour from the work origin (deterministic).
 * Every hole is a canned-cycle intent in the IR (`Cycle`); the post emits
 * `G81/G82/G83/G73` when its dialect supports them and `useCannedCycles` is set,
 * otherwise `expandCycle` turns it into plain moves. Depth is validated
 * `> 0` and converted to a negative Z once (legacy bug 9).
 */
import { Schema } from "effect"
import type { Entity } from "../../cad/entities.ts"
import type { Vec2 } from "../../cad/vec.ts"
import type { Stock, Tool } from "../tool.ts"
import type { CycleKind, Toolpath } from "../ir.ts"
import { nearestNeighbourOrder } from "../geometry.ts"
import { OperationFields, NonNegative, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import { MoveBuilder, finish } from "./common.ts"

const { stepdown: _stepdown, feed: _feed, ...commonFields } = OperationFields

export class DrillParams extends Schema.Class<DrillParams>("cam/DrillParams")(
  Schema.Struct({
    ...commonFields,
    /** Peck increment from the retract plane, mm; `0` drills in one stroke. */
    peck: withDefault(NonNegative, 0),
    /** Break chips with a short retract instead of a full retract between pecks. */
    chipBreak: withDefault(Schema.Boolean, false),
    /** Dwell at the hole bottom, seconds. */
    dwell: withDefault(NonNegative, 0)
  }).check(heightsOrdered)
) {}

export type DrillGeometry = ReadonlyArray<Vec2 | Entity>

const isEntity = (g: Vec2 | Entity): g is Entity => "_tag" in g

/** Hole centres: raw points, circle/arc centres, and the same inside blocks. */
export const holePoints = (geometry: DrillGeometry, offset: Vec2 = { x: 0, y: 0 }): Vec2[] => {
  const out: Vec2[] = []
  for (const g of geometry) {
    if (!isEntity(g)) {
      out.push({ x: g.x + offset.x, y: g.y + offset.y })
      continue
    }
    switch (g._tag) {
      case "Circle":
      case "Arc":
        out.push({ x: g.center.x + offset.x, y: g.center.y + offset.y })
        break
      case "Block":
        out.push(...holePoints(g.entities, { x: offset.x + g.basePoint.x, y: offset.y + g.basePoint.y }))
        break
      default:
        break
    }
  }
  return out
}

export const generateDrill = (params: DrillParams, geometry: DrillGeometry, tool: Tool, stock: Stock): Toolpath => {
  const levels = levelsOf({ ...params, stepdown: params.totalDepth }, stock.origin.z)
  const b = new MoveBuilder()
  b.comment(`Drill: ${params.name}`)
  const holes = nearestNeighbourOrder(holePoints(geometry))
  const cycle: CycleKind =
    params.peck > 0 ? (params.chipBreak ? "chipBreak" : "peck") : params.dwell > 0 ? "dwell" : "drill"
  holes.forEach((p, i) => {
    if (i === 0) b.rapid({ x: p.x, y: p.y, z: levels.clearanceZ })
    b.push({
      _tag: "Cycle",
      cycle,
      to: { x: p.x, y: p.y, z: levels.bottomZ },
      feed: params.plungeFeed,
      peckDepth: params.peck,
      dwellSeconds: params.dwell,
      retractHeight: levels.retractZ
    })
  })
  if (holes.length === 0) b.comment("nothing to drill: no hole positions")
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

export const Drill = { Params: DrillParams, generate: generateDrill } as const
