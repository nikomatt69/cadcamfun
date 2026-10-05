/**
 * Face operation (spec 04-core-cam.md §3): zig-zag surfacing across the stock top.
 *
 * Rows run along X (or Y) with `stepover` % of the tool diameter between them and
 * extend `overshoot` beyond the area, so every stepover move and every plunge
 * happens in air when `overshoot >= tool radius`. Depth passes alternate
 * direction and plunge where the previous pass ended: no rapid at depth.
 */
import { Schema } from "effect"
import type { Bounds2D } from "../../cad/box.ts"
import type { Stock, Tool } from "../tool.ts"
import { stockBounds, toolRadius } from "../tool.ts"
import type { Toolpath } from "../ir.ts"
import { OperationFields, Positive, NonNegative, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import { MoveBuilder, approach, finish, liftTo } from "./common.ts"

export class FaceParams extends Schema.Class<FaceParams>("cam/FaceParams")(
  Schema.Struct({
    ...OperationFields,
    /** Stepover as a percentage of the tool diameter, `(0, 100]`. */
    stepover: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 100 })), 60),
    /** How far rows run past the area, mm; `0` = tool radius + 1 (clear of the stock). */
    overshoot: withDefault(NonNegative, 0),
    /** Rows along X when true, along Y otherwise. */
    alongX: withDefault(Schema.Boolean, true),
    tolerance: withDefault(Positive, 0.01)
  }).check(heightsOrdered)
) {}

export const generateFace = (
  params: FaceParams,
  area: Bounds2D | undefined,
  tool: Tool,
  stock: Stock
): Toolpath => {
  const levels = levelsOf(params, stock.origin.z)
  const sb = stockBounds(stock)
  const box = area ?? { minX: sb.minX, minY: sb.minY, maxX: sb.maxX, maxY: sb.maxY }
  const ov = params.overshoot > 0 ? params.overshoot : toolRadius(tool) + 1
  const b = new MoveBuilder()
  b.comment(`Face: ${params.name}`)

  // Row centres across the cross axis, evenly spaced with at most `stepover` between them.
  const lo = params.alongX ? box.minY : box.minX
  const hi = params.alongX ? box.maxY : box.maxX
  const a0 = (params.alongX ? box.minX : box.minY) - ov
  const a1 = (params.alongX ? box.maxX : box.maxY) + ov
  const step = (params.stepover / 100) * tool.diameter
  const rowCount = Math.max(1, Math.ceil((hi - lo) / step - 1e-9) + 1)
  const rows: number[] = []
  for (let i = 0; i < rowCount; i++) rows.push(rowCount === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (rowCount - 1))
  const at = (along: number, cross: number, z: number) =>
    params.alongX ? { x: along, y: cross, z } : { x: cross, y: along, z }

  let forward = true // current row direction: a0 -> a1
  levels.passZ.forEach((z, pass) => {
    const order = pass % 2 === 0 ? rows : [...rows].reverse()
    if (pass === 0) {
      const start = at(a0, order[0]!, 0)
      approach(b, start, levels)
      b.rapid({ x: start.x, y: start.y, z: levels.entryZ })
      b.linear({ x: start.x, y: start.y, z }, params.plungeFeed)
    } else {
      const p = b.pos
      b.linear({ x: p.x, y: p.y, z }, params.plungeFeed)
    }
    order.forEach((cross, k) => {
      const to = forward ? a1 : a0
      b.linear(at(to, cross, z), params.feed)
      const next = order[k + 1]
      if (next !== undefined) b.linear(at(to, next, z), params.feed)
      forward = !forward
    })
  })
  liftTo(b, levels.retractZ)
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

export const Face = { Params: FaceParams, generate: generateFace } as const
