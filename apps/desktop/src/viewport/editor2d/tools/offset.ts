/**
 * Offset tool: clone a polyline / rectangle / circle / arc by a distance.
 *
 * The user picks one entity (the current selection, or a click on a hit), then
 * drags from any point to choose the side and magnitude. We commit on
 * pointer-up. Shift forces "pick under cursor" mode.
 */
import {
  baseEntity,
  boundingBox,
  dedupePoints,
  offsetPolyline,
  type CircleEntity,
  type Entity,
  type PolylineEntity,
  type RectangleEntity,
  type Vec2
} from "@cadcamfun/core"
import { addEntities } from "../../../shared/state/commands.ts"
import { type PointerEvent, type Tool, type ToolContext, type ToolFactory } from "./tool.ts"

const MIN_OFFSET = 1e-3

interface OffsetState {
  readonly source: Entity | undefined
  readonly anchor: Vec2 | undefined
  readonly cursor: Vec2 | undefined
  readonly seq: number
}

const initial: OffsetState = { source: undefined, anchor: undefined, cursor: undefined, seq: 0 }

const rectanglePoints = (entity: Extract<Entity, { _tag: "Rectangle" }>): Vec2[] => [
  entity.corner1,
  { x: entity.corner2.x, y: entity.corner1.y },
  entity.corner2,
  { x: entity.corner1.x, y: entity.corner2.y }
]

const offsetDistance = (source: Entity, anchor: Vec2, cursor: Vec2): number => {
  const box = boundingBox(source)
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const fromCentre = Math.hypot(cursor.x - cx, cursor.y - cy)
  const fromAnchor = Math.hypot(anchor.x - cx, anchor.y - cy)
  const sign = fromCentre >= fromAnchor ? 1 : -1
  return sign * Math.max(MIN_OFFSET, Math.abs(fromCentre - fromAnchor))
}

const buildOffset = (source: Entity, anchor: Vec2, cursor: Vec2): Entity | undefined => {
  const distance = offsetDistance(source, anchor, cursor)
  switch (source._tag) {
    case "Line": {
      const loops = offsetPolyline([source.start, source.end], distance, false, { arcJoins: true })
      if (loops.length === 0) return undefined
      const points = dedupePoints(loops[0]!)
      if (points.length < 2) return undefined
      return {
        ...baseEntity(`offset-preview`),
        _tag: "Polyline",
        points,
        closed: false
      }
    }
    case "Polyline": {
      const loops = offsetPolyline(source.points, distance, source.closed, { arcJoins: true })
      if (loops.length === 0) return undefined
      const points = dedupePoints(loops[0]!)
      if (points.length < (source.closed ? 3 : 2)) return undefined
      return {
        ...baseEntity(`offset-preview`),
        _tag: "Polyline",
        points,
        closed: source.closed
      }
    }
    case "Rectangle": {
      const points = rectanglePoints(source)
      const loops = offsetPolyline(points, distance, true, { arcJoins: true })
      if (loops.length === 0) return undefined
      const out = dedupePoints(loops[0]!)
      if (out.length < 3) return undefined
      return {
        ...baseEntity(`offset-preview`),
        _tag: "Polyline",
        points: out,
        closed: true
      }
    }
    case "Circle": {
      const dx = cursor.x - source.center.x
      const dy = cursor.y - source.center.y
      const len = Math.hypot(dx, dy)
      if (len < 1e-12) return undefined
      const next: CircleEntity = {
        ...baseEntity(`offset-preview`),
        _tag: "Circle",
        center: { x: source.center.x + (dx / len) * distance, y: source.center.y + (dy / len) * distance },
        radius: source.radius
      }
      return next
    }
    case "Arc": {
      const dx = cursor.x - source.center.x
      const dy = cursor.y - source.center.y
      const len = Math.hypot(dx, dy)
      if (len < 1e-12) return undefined
      return {
        ...baseEntity(`offset-preview`),
        _tag: "Arc",
        center: { x: source.center.x + (dx / len) * distance, y: source.center.y + (dy / len) * distance },
        radius: source.radius,
        startAngle: source.startAngle,
        endAngle: source.endAngle,
        clockwise: source.clockwise
      }
    }
    default:
      return undefined
  }
}

const previewId = (id: string): PolylineEntity | undefined => undefined

void previewId

/**
 * Offset tool. Picks the first selected entity, or the topmost hit when Shift
 * is held. The user drags to set the offset distance (centred on the source);
 * the closer drag wins, the further drag grows it.
 */
export const offsetTool = (context: () => ToolContext): ToolFactory => {
  return (): Tool => withState(initial)

  function withState(state: OffsetState): Tool {
    const pick = (event: PointerEvent): Entity | undefined => {
      if (event.modifiers.shift) {
        const id = event.hits?.[0]
        if (id === undefined) return undefined
        return context().entity(id)
      }
      const selection = context().selection
      if (selection.length === 0) return undefined
      return context().entity(selection[0]!)
    }

    const preview = (): Entity[] => {
      if (state.source === undefined || state.anchor === undefined || state.cursor === undefined) return []
      const entity = buildOffset(state.source, state.anchor, state.cursor)
      return entity === undefined ? [] : [entity]
    }

    return {
      id: "offset",
      status: {
        hint:
          state.source === undefined
            ? "Select a polyline, rectangle, circle or arc, then drag for distance"
            : state.anchor === undefined
            ? "Drag to set the offset distance"
            : "Drag further to grow; release to commit",
        ready: preview().length > 0
      },
      start: () => withState(initial),
      onPointerDown: (event) => {
        const src = pick(event)
        if (src === undefined) return withState(initial)
        return withState({ source: src, anchor: event.point, cursor: event.point, seq: state.seq + 1 })
      },
      onPointerMove: (event) => {
        if (state.source === undefined || state.anchor === undefined) return withState(state)
        return withState({ source: state.source, anchor: state.anchor, cursor: event.point, seq: state.seq })
      },
      onPointerUp: (event) => {
        if (state.source === undefined || state.anchor === undefined) return withState(state)
        return withState({ source: state.source, anchor: state.anchor, cursor: event.point, seq: state.seq })
      },
      onKey: (key) => (key === "Escape" ? withState(initial) : withState(state)),
      preview,
      command: (): import("../../../shared/state/commands.ts").Command | undefined => {
        const entity = preview()[0]
        return entity === undefined ? undefined : addEntities([entity], "offset")
      }
    }
  }
}