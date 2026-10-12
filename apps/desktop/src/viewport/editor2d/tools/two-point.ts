/**
 * Two-point tools: line, rectangle, circle-by-diameter, ellipse.
 *
 * All four share one gesture — press, drag, release — so they share one state
 * machine with a per-tool entity builder. Keeping them together makes the
 * "commit exactly once, only when the gesture is long enough" rule testable in
 * one place instead of four.
 */
import { baseEntity, type Entity, type Vec2 } from "@cadcamfun/core"
import type { Command } from "../../../shared/state/commands.ts"
import { addEntities } from "../../../shared/state/commands.ts"
import { type PointerEvent, type Tool, type ToolFactory, type ToolId } from "./tool.ts"

/** Minimum drag length before a tool commits, in mm. */
export const MIN_GESTURE = 1e-6

interface TwoPointState {
  readonly from: Vec2 | undefined
  readonly to: Vec2 | undefined
  /** Monotonic counter so two gestures on the same spot never share an id. */
  readonly seq: number
}

/**
 * The tools this file actually builds. It is keyed by the two-point subset of
 * `ToolId` rather than by every id: `polyline`/`arc` have their own chained
 * machines, and the transform/trim/fillet tools operate on a selection rather
 * than on two points, so they belong to other files.
 */
type TwoPointToolId = Extract<ToolId, "select" | "line" | "rectangle" | "circle" | "ellipse">

const builders: Record<TwoPointToolId, (from: Vec2, to: Vec2, id: string) => Entity | undefined> = {
  select: () => undefined,
  line: (from, to, id) => ({
    ...baseEntity(id),
    _tag: "Line",
    start: from,
    end: to
  }),
  rectangle: (from, to, id) => ({
    ...baseEntity(id),
    _tag: "Rectangle",
    corner1: from,
    corner2: to
  }),
  circle: (from, to, id) => ({
    ...baseEntity(id),
    _tag: "Circle",
    center: from,
    radius: distance(from, to)
  }),
  ellipse: (from, to, id) => ({
    ...baseEntity(id),
    _tag: "Ellipse",
    center: from,
    radiusX: Math.abs(to.x - from.x),
    radiusY: Math.abs(to.y - from.y),
    rotation: 0
  })
}

const hints: Record<string, string> = {
  line: "Click to place the start point",
  rectangle: "Click to place the first corner",
  circle: "Click the centre, then the radius",
  ellipse: "Click to place the centre"
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y)

/**
 * A tool that commits one entity per press-drag-release gesture. Shift constrains
 * the geometry the way every CAD program does (a line to 45°, a rectangle to a
 * square).
 *
 * `id` is narrowed to the two-point tools because a press-drag-release gesture is
 * all a line/rectangle/circle/ellipse needs; the other ids have their own machines.
 */
export const twoPointTool = (id: TwoPointToolId): ToolFactory => {
  const build = builders[id]
  const initial: TwoPointState = { from: undefined, to: undefined, seq: 0 }
  return (): Tool => withState(initial)
  function withState(state: TwoPointState): Tool {
    const entityId = (): string => `${id}-${state.seq}`
    const entity = (): Entity | undefined => {
      if (state.from === undefined || state.to === undefined) return undefined
      return build(state.from, state.to, entityId())
    }
    return {
      id,
      status: {
        hint: state.from === undefined ? hints[id] ?? id : "Drag to set the size, Enter to commit, Esc to cancel",
        ready: state.from !== undefined && state.to !== undefined
      },
      start: () => withState(initial),
      onPointerDown: (event) =>
        // A fresh gesture bumps the sequence, so two entities drawn at the same
        // coordinates still get different ids.
        withState({
          from: constrain(state, event, undefined),
          to: undefined,
          seq: state.seq + 1
        }),
      onPointerMove: (event) =>
        withState({ from: state.from, to: constrain(state, event, state.from), seq: state.seq }),
      onPointerUp: (event) =>
        withState({ from: state.from, to: constrain(state, event, state.from), seq: state.seq }),
      onKey: (key, tool) => {
        if (key === "Escape") return withState({ ...state, from: undefined, to: undefined })
        void tool
        return withState(state)
      },
      preview: () => {
        const e = entity()
        return e === undefined ? [] : [e]
      },
      command: () => {
        const e = entity()
        if (e === undefined) return undefined
        if (e._tag === "Circle" && e.radius < MIN_GESTURE) return undefined
        if (state.from && state.to && distance(state.from, state.to) < MIN_GESTURE) return undefined
        if (e._tag === "Ellipse" && (e.radiusX < MIN_GESTURE || e.radiusY < MIN_GESTURE)) return undefined
        return addEntities([e], id)
      }
    }
  }
}

/** Shift constraint: squares and 45° lines. */
const constrain = (state: TwoPointState, event: PointerEvent, from: Vec2 | undefined): Vec2 => {
  const point = event.point
  if (!event.modifiers.shift || from === undefined) return point
  const dx = point.x - from.x
  const dy = point.y - from.y
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  if (state.from === undefined) {
    // First click of a rectangle/ellipse: constrain the drag axis itself.
    return Math.abs(dx) > Math.abs(dy) ? { x: point.x, y: from.y } : { x: from.x, y: point.y }
  }
  const sign = { x: Math.sign(dx) || 1, y: Math.sign(dy) || 1 }
  return { x: from.x + sign.x * size, y: from.y + sign.y * size }
}
