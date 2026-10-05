/**
 * Multi-click tools: polyline and the three-point arc.
 *
 * These commit only on `Enter` (or the last click of the arc), not on pointer-up,
 * because a polyline is an open-ended gesture and an arc needs its third point.
 * `preview` always shows the in-progress geometry so the user sees what they
 * committed.
 */
import { baseEntity, type Entity, type Vec2 } from "@cadcamfun/core"
import type { Command } from "../../../state/commands.ts"
import { addEntities } from "../../../state/commands.ts"
import { type PointerEvent, type Tool, type ToolFactory } from "./tool.ts"

interface PolylineState {
  readonly points: ReadonlyArray<Vec2>
  readonly cursor: Vec2 | undefined
  readonly closed: boolean
  readonly seq: number
}

const initial: PolylineState = { points: [], cursor: undefined, closed: false, seq: 0 }

/** Chain tool: click to add points, Enter or a click on the first point to finish. */
export const polylineTool = (): ToolFactory => {
  return (): Tool => withState(initial)

  function withState(state: PolylineState): Tool {
    const isClosedRing = (): boolean =>
      state.points.length >= 3 && distance(state.cursor ?? state.points[0]!, state.points[0]!) < 1e-6

    return {
      id: "polyline",
      status: {
        hint:
          state.points.length === 0
            ? "Click to add the first point"
            : isClosedRing()
            ? "Click the first point to close, Enter to finish"
            : "Click to add points, Enter to finish, Esc to cancel",
        ready: state.points.length >= 2
      },
      start: () => withState(initial),
      onPointerDown: (event) => withState({ ...state, cursor: event.point }),
      onPointerMove: (event) => withState({ ...state, cursor: event.point }),
      onPointerUp: (event) => {
        // A click on the first point closes the ring; anywhere else appends.
        if (
          state.points.length >= 3 &&
          distance(event.point, state.points[0]!) < 1e-6
        ) {
          return withState({ ...state, closed: true, cursor: undefined })
        }
        return withState({ ...state, points: [...state.points, event.point], cursor: undefined })
      },
      onKey: (key) => {
        if (key === "Escape") return withState({ ...state, points: [], cursor: undefined, closed: false })
        return withState(state)
      },
      preview: () => {
        const points = pending(state)
        return points.length >= 2
          ? [
              {
                ...baseEntity(`polyline-preview-${state.seq}`),
                _tag: "Polyline",
                points,
                closed: false
              }
            ]
          : []
      },
      command: () => {
        const points = committed(state)
        if (points.length < 2) return undefined
        return addEntities(
          [
            {
              ...baseEntity(`polyline-${state.seq}`),
              _tag: "Polyline",
              points,
              closed: state.closed
            }
          ],
          "polyline"
        )
      },
      state
    }
  }
}

interface ArcState {
  readonly start: Vec2 | undefined
  readonly through: Vec2 | undefined
  readonly cursor: Vec2 | undefined
  readonly seq: number
}

const arcInitial: ArcState = { start: undefined, through: undefined, cursor: undefined, seq: 0 }

/** Three-point arc: start, a point on the arc, end. */
export const arcTool = (): ToolFactory => {
  return (): Tool => withState(arcInitial)

  function withState(state: ArcState): Tool {
    return {
      id: "arc",
      status: {
        hint:
          state.start === undefined
            ? "Click the arc start"
            : state.through === undefined
            ? "Click a point on the arc"
            : "Click the arc end",
        ready: state.start !== undefined && state.through !== undefined && state.cursor !== undefined
      },
      start: () => withState(arcInitial),
      onPointerDown: (event) => withState({ ...state, cursor: event.point }),
      onPointerMove: (event) => withState({ ...state, cursor: event.point }),
      onPointerUp: (event) => {
        if (state.start === undefined) return withState({ start: event.point, through: undefined, cursor: undefined, seq: state.seq })
        if (state.through === undefined) {
          return withState({ start: state.start, through: event.point, cursor: undefined, seq: state.seq })
        }
        return withState({ ...state, cursor: event.point })
      },
      onKey: (key) => {
        if (key === "Escape") return withState(arcInitial)
        return withState(state)
      },
      preview: () => {
        const entity = arcEntity(state)
        return entity === undefined ? [] : [entity]
      },
      command: () => {
        const entity = arcEntity(state)
        return entity === undefined ? undefined : addEntities([entity], "arc")
      },
      state
    }
  }
}

const arcEntity = (state: ArcState): Entity | undefined => {
  if (state.start === undefined || state.through === undefined || state.cursor === undefined) return undefined
  const centre = circumcentre(state.start, state.through, state.cursor)
  if (centre === undefined) return undefined
  const radius = distance(centre, state.start)
  if (radius < 1e-9) return undefined
  const startAngle = normalizeAngle(Math.atan2(state.start.y - centre.y, state.start.x - centre.x))
  const endAngle = normalizeAngle(Math.atan2(state.cursor.y - centre.y, state.cursor.x - centre.x))
  const throughAngle = Math.atan2(state.through.y - centre.y, state.through.x - centre.x)
  // Pick the direction that actually passes through the middle point.
  const ccw = arcContains(startAngle, endAngle, throughAngle)
  return {
    ...baseEntity(`arc-${state.seq}`),
    _tag: "Arc",
    center: centre,
    radius,
    startAngle,
    endAngle,
    clockwise: !ccw
  }
}

const arcContains = (startAngle: number, endAngle: number, angle: number): boolean => {
  const sweep = normalizeAngle(endAngle - startAngle)
  const rel = normalizeAngle(angle - startAngle)
  return rel <= sweep + 1e-9
}

const circumcentre = (a: Vec2, b: Vec2, c: Vec2): Vec2 | undefined => {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-12) return undefined
  const aSq = a.x * a.x + a.y * a.y
  const bSq = b.x * b.x + b.y * b.y
  const cSq = c.x * c.x + c.y * c.y
  return {
    x: (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / d,
    y: (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / d
  }
}

const normalizeAngle = (a: number): number => {
  const twoPi = Math.PI * 2
  const r = a % twoPi
  return r < 0 ? r + twoPi : r
}

/** Points the user has committed so far. */
export const committed = (state: PolylineState): Vec2[] => [...state.points]

/** Points to draw right now: the committed ones plus the rubber-band cursor. */
const pending = (state: PolylineState): Vec2[] => {
  const points = [...state.points]
  if (state.cursor !== undefined && points.length > 0) points.push(state.cursor)
  return points
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y)
