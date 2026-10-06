/**
 * Fillet / chamfer tool: rounds or bevels the corner between two lines.
 *
 * Pick the first line, then the second; the tool finds their intersection,
 * trims both back to the tangent points, and inserts the rounding in between.
 * Shift swaps between fillet (arc) and chamfer (straight cut) at the same
 * radius.
 */
import {
  chamfer,
  distance,
  fillet,
  lineLineIntersection,
  type Entity,
  type LineEntity,
  type PolylineEntity,
  type Vec2
} from "@cadcamfun/core"
import { addEntities } from "../../../state/commands.ts"
import type { Command } from "../../../state/commands.ts"
import { removeEntities } from "../../../state/commands.ts"
import { type PointerEvent, type Tool, type ToolContext, type ToolFactory } from "./tool.ts"

type Mode = "fillet" | "chamfer"

interface FilletState {
  readonly first: Entity | undefined
  readonly second: Entity | undefined
  readonly radius: number
  readonly mode: Mode
  readonly seq: number
}

const initial: FilletState = {
  first: undefined,
  second: undefined,
  radius: 5,
  mode: "fillet",
  seq: 0
}

const segmentOf = (entity: Entity): { start: Vec2; end: Vec2 } | undefined => {
  if (entity._tag === "Line") return { start: entity.start, end: entity.end }
  return undefined
}

/** Tangent points for an arc with the given chord (chordA..chordB) tangent to two meeting segments. */
const arcPoints = (
  corner: Vec2,
  tangentA: Vec2,
  tangentB: Vec2,
  radius: number
): Vec2[] => {
  // Midpoint of the chord (tangentA-bend is unknown; use the angle bisector).
  const segAX = tangentA.x - corner.x
  const segAY = tangentA.y - corner.y
  const segBX = tangentB.x - corner.x
  const segBY = tangentB.y - corner.y
  const lenA = Math.hypot(segAX, segAY)
  const lenB = Math.hypot(segBX, segBY)
  if (lenA < 1e-12 || lenB < 1e-12) return [tangentA, tangentB]
  const uAx = segAX / lenA
  const uAy = segAY / lenA
  const uBx = segBX / lenB
  const uBy = segBY / lenB
  // Centre of the rounding arc: offset from the corner along the bisector.
  const bisectorX = uAx + uBx
  const bisectorY = uAy + uBy
  const bisectorLen = Math.hypot(bisectorX, bisectorY)
  if (bisectorLen < 1e-12) return [tangentA, tangentB]
  const sinHalfAngle = Math.min(1, Math.hypot(uAx - uBx, uAy - uBy) / 2)
  const offset = radius / Math.max(sinHalfAngle, 1e-9)
  const center: Vec2 = {
    x: corner.x + (bisectorX / bisectorLen) * offset,
    y: corner.y + (bisectorY / bisectorLen) * offset
  }
  const startAngle = Math.atan2(tangentA.y - center.y, tangentA.x - center.x)
  const endAngle = Math.atan2(tangentB.y - center.y, tangentB.x - center.x)
  const steps = 16
  const sweep = ((endAngle - startAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  const out: Vec2[] = []
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (sweep * i) / steps
    out.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius })
  }
  return out
}

const buildCommands = (state: FilletState): Command[] => {
  if (state.first === undefined || state.second === undefined) return []
  const segA = segmentOf(state.first)
  const segB = segmentOf(state.second)
  if (segA === undefined || segB === undefined) return []
  const corner = lineLineIntersection(segA.start, segA.end, segB.start, segB.end)
  if (corner === undefined) return []
  // Choose the far end of each segment (the endpoint away from the corner is
  // what survives; we replace the rest with the rounded edge).
  const farA = distance(segA.start, corner) > distance(segA.end, corner) ? segA.start : segA.end
  const farB = distance(segB.start, corner) > distance(segB.end, corner) ? segB.start : segB.end
  const result = state.mode === "fillet"
    ? fillet(corner, farA, farB, state.radius)
    : chamfer(corner, farA, farB, state.radius)
  if (result === undefined) return []

  const lineA = state.first as LineEntity
  const lineB = state.second as LineEntity
  const trimmedA: LineEntity = { ...lineA, start: farA, end: result.a }
  const trimmedB: LineEntity = { ...lineB, start: farB, end: result.b }

  // Fillet arc / chamfer straight cut between the two tangent points.
  const curvePoints =
    state.mode === "fillet"
      ? arcPoints(corner, result.a, result.b, state.radius)
      : [result.a, result.b]
  const filletEntity: PolylineEntity = {
    ...lineA,
    id: `${lineA.id}-fillet-${state.seq}`,
    _tag: "Polyline",
    points: curvePoints,
    closed: false
  }

  return [
    removeEntities([lineA.id, lineB.id], state.mode),
    addEntities([trimmedA, trimmedB, filletEntity], state.mode)
  ]
}

/**
 * Fillet / chamfer tool. Click two lines; the corner between them is rounded
 * (fillet) or bevelled (chamfer) at `state.radius`. Shift swaps between the
 * two modes without resetting the radius.
 */
export const filletTool = (context: () => ToolContext): ToolFactory => {
  return (): Tool => withState(initial)

  function withState(state: FilletState): Tool {
    const pick = (event: PointerEvent): Entity | undefined => {
      const id = event.hits?.[0]
      if (id === undefined) return undefined
      return context().entity(id)
    }

    return {
      id: "fillet",
      status: {
        hint: state.first === undefined
          ? "Pick the first line"
          : state.second === undefined
          ? "Pick the second line (Shift = chamfer)"
          : `${state.mode === "fillet" ? "Fillet" : "Chamfer"} ready; release to commit`,
        ready: state.first !== undefined && state.second !== undefined
      },
      start: () => withState(initial),
      onPointerDown: (event) => {
        const entity = pick(event)
        if (entity === undefined) return withState(state)
        if (state.first === undefined) {
          return withState({ first: entity, second: undefined, radius: state.radius, mode: event.modifiers.shift ? "chamfer" : state.mode, seq: state.seq + 1 })
        }
        return withState({ first: state.first, second: entity, radius: state.radius, mode: event.modifiers.shift ? "chamfer" : state.mode, seq: state.seq })
      },
      onPointerMove: () => withState(state),
      onPointerUp: () => withState(state),
      onKey: (key) => {
        if (key === "Escape") return withState(initial)
        return withState(state)
      },
      preview: () => [],
      command: (): Command | undefined => {
        const commands = buildCommands(state)
        if (commands.length === 0) return undefined
        return {
          label: state.mode,
          touched: commands.flatMap((c) => c.touched),
          apply: (drawing) => commands.reduce((current, command) => command.apply(current), drawing)
        }
      }
    }
  }
}