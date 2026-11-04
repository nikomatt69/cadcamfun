/**
 * Engrave operation (spec 04-core-cam.md §3): follows open and closed paths at a
 * constant depth, without tool compensation.
 *
 * Several depth passes are allowed: a closed path is lapped again after
 * plunging in the groove, an open path is run back and forth, so the tool never
 * leaves the groove (and never rapids at depth) between passes.
 */
import { Schema } from "effect"
import type { Stock, Tool } from "../tool.ts"
import type { Toolpath } from "../ir.ts"
import { type GeometryInput, type Source, sourcesOf } from "../geometry.ts"
import { OperationFields, Positive, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import { type Path, circlePath, pathFromPoints, reversePath } from "../path.ts"
import { OrderingSchema, orderChains } from "./ordering.ts"
import { MoveBuilder, approach, finish, followPath, liftTo } from "./common.ts"

export class EngraveParams extends Schema.Class<EngraveParams>("cam/EngraveParams")(
  Schema.Struct({
    ...OperationFields,
    tolerance: withDefault(Positive, 0.01),
    /** Visit order of the paths: `shortest` (2-opt / or-opt over the links, spec 69 F11) or the order given. */
    ordering: withDefault(OrderingSchema, "shortest" as const)
  }).check(heightsOrdered)
) {}

const pathOf = (source: Source): Path | undefined => {
  switch (source.kind) {
    case "circle":
      return circlePath(source.center, source.radius, false, 0)
    case "arc": {
      const at = (angle: number) => ({
        x: source.center.x + source.radius * Math.cos(angle),
        y: source.center.y + source.radius * Math.sin(angle)
      })
      const start = at(source.startAngle)
      const end = source.startAngle === source.endAngle ? start : at(source.endAngle)
      return { start, segs: [{ kind: "Arc", to: end, center: source.center, clockwise: source.clockwise }], closed: false }
    }
    case "contour":
      return pathFromPoints(source.contour.points, source.contour.closed)
  }
}

export const generateEngrave = (params: EngraveParams, geometry: GeometryInput, tool: Tool, stock: Stock): Toolpath => {
  const levels = levelsOf(params, stock.origin.z)
  const b = new MoveBuilder()
  b.comment(`Engrave: ${params.name}`)
  const paths: Path[] = []
  for (const source of sourcesOf(geometry, params.tolerance)) {
    const p = pathOf(source)
    if (p !== undefined && p.segs.length > 0) paths.push(p)
  }
  // An open stroke may be run either way, a closed one starts where it starts.
  const ordered = orderChains(paths, params.ordering, (p) => ({ start: p.start, end: p.closed ? p.start : p.segs[p.segs.length - 1]?.to ?? p.start, reversible: !p.closed }))
  for (const { item, reversed } of ordered) {
    const path = reversed ? reversePath(item) : item
    approach(b, path.start, levels)
    b.rapid({ x: path.start.x, y: path.start.y, z: levels.entryZ })
    let forward = true
    const back = path.closed ? path : reversePath(path)
    levels.passZ.forEach((z) => {
      const p = b.pos
      b.linear({ x: p.x, y: p.y, z }, params.plungeFeed)
      followPath(b, path.closed || forward ? path : back, z, params.feed)
      if (!path.closed) forward = !forward
    })
    liftTo(b, levels.retractZ)
  }
  if (!b.started) b.comment("nothing to engrave: no paths")
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

export const Engrave = { Params: EngraveParams, generate: generateEngrave } as const
