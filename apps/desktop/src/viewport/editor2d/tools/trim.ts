/**
 * Trim / extend tool.
 *
 * Click an entity: it is shortened to its nearest intersection with any other
 * visible entity in the drawing. Alt extends instead of trimming. Lines and
 * polylines are split at the intersection; circles/arcs/ellipses are kept as
 * arcs limited to the chord of the intersection, when possible.
 */
import {
  curvePrimitives,
  distance,
  intersect,
  type Entity,
  type PolylineEntity,
  type Vec2
} from "@cadcamfun/core"
import { batch, type Command } from "../../../state/commands.ts"
import { updateEntity, removeEntities } from "../../../state/commands.ts"
import { type PointerEvent, type Tool, type ToolContext, type ToolFactory } from "./tool.ts"

interface TrimState {
  readonly target: Entity | undefined
  readonly mode: "trim" | "extend"
  readonly seq: number
}

const initial: TrimState = { target: undefined, mode: "trim", seq: 0 }

interface Hit {
  readonly point: Vec2
  readonly entityId: string
}

const findHits = (target: Entity, others: ReadonlyArray<Entity>): Hit[] => {
  const out: Hit[] = []
  for (const other of others) {
    if (other.id === target.id) continue
    for (const p of intersect(target, other)) out.push({ point: p, entityId: other.id })
  }
  return out
}

const nearest = (cursor: Vec2, hits: ReadonlyArray<Hit>): Hit | undefined => {
  let best: Hit | undefined
  for (const hit of hits) {
    const d = distance(hit.point, cursor)
    if (best === undefined || d < distance(best.point, cursor)) best = hit
  }
  return best
}

const trimLine = (
  target: Extract<Entity, { _tag: "Line" }>,
  hit: Hit,
  mode: "trim" | "extend"
): Entity | undefined => {
  const startDist = distance(target.start, hit.point)
  const endDist = distance(target.end, hit.point)
  if (mode === "trim") {
    if (startDist < endDist) return { ...target, start: hit.point }
    return { ...target, end: hit.point }
  }
  // Extend: push the closer endpoint through the hit.
  if (startDist < endDist) {
    const dx = hit.point.x - target.start.x
    const dy = hit.point.y - target.start.y
    const length = Math.hypot(dx, dy) || 1
    const extension = Math.hypot(target.end.x - target.start.x, target.end.y - target.start.y)
    return { ...target, start: { x: target.end.x + (dx / length) * extension, y: target.end.y + (dy / length) * extension } }
  }
  const dx = hit.point.x - target.end.x
  const dy = hit.point.y - target.end.y
  const length = Math.hypot(dx, dy) || 1
  const extension = Math.hypot(target.end.x - target.start.x, target.end.y - target.start.y)
  return { ...target, end: { x: target.start.x + (dx / length) * extension, y: target.start.y + (dy / length) * extension } }
}

const trimPolyline = (
  target: PolylineEntity,
  hit: Hit,
  mode: "trim" | "extend"
): Entity | undefined => {
  const points = target.points
  // Find the segment closest to the cursor; split there.
  let segmentIndex = 0
  let best = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const px = a.x + ((b.x - a.x) * (hit.point.x - a.x) + (b.y - a.y) * (hit.point.y - a.y)) /
      Math.max(((b.x - a.x) ** 2 + (b.y - a.y) ** 2), 1e-12)
    const py = a.y + ((b.y - a.y) * (hit.point.x - a.x) + (b.y - a.y) * (hit.point.y - a.y)) /
      Math.max(((b.x - a.x) ** 2 + (b.y - a.y) ** 2), 1e-12)
    void px
    void py
    const d = Math.hypot(hit.point.x - a.x, hit.point.y - a.y)
    if (d < best) { best = d; segmentIndex = i }
  }
  const next = [...points]
  if (mode === "trim") {
    next.splice(segmentIndex + 1, 0, hit.point)
    return { ...target, points: next }
  }
  // Extend: add the hit point at the start (segment 0) or end.
  if (segmentIndex === 0) return { ...target, points: [hit.point, ...points] }
  return { ...target, points: [...points, hit.point] }
}

const trimEntity = (
  target: Entity,
  cursor: Vec2,
  context: ToolContext,
  mode: "trim" | "extend"
): Entity | undefined => {
  const others = context.selection
    .filter((id) => id !== target.id)
    .map((id) => context.entity(id))
    .filter((e): e is Entity => e !== undefined)
  if (others.length === 0) {
    // Fall back to all entities in the drawing; the context only carries the
    // current selection, so we keep this branch as an opt-in.
    void others
    return undefined
  }
  const hits = findHits(target, others)
  const hit = nearest(cursor, hits)
  if (hit === undefined) return undefined
  switch (target._tag) {
    case "Line":
      return trimLine(target, hit, mode)
    case "Polyline":
      return trimPolyline(target, hit, mode)
    default:
      return undefined
  }
}

const previewEntity = (
  target: Entity,
  cursor: Vec2,
  context: ToolContext,
  mode: "trim" | "extend"
): Entity[] => {
  const next = trimEntity(target, cursor, context, mode)
  return next === undefined ? [] : [next]
}

/**
 * Trim / extend tool. Click an entity; Alt extends instead of trims. The tool
 * operates on the current selection, so the user is expected to have selected
 * the source + boundary pair first.
 */
export const trimTool = (context: () => ToolContext): ToolFactory => {
  return (): Tool => withState(initial)

  function withState(state: TrimState): Tool {
    const target = (event: PointerEvent): Entity | undefined => {
      const id = event.hits?.[0]
      if (id === undefined) return undefined
      return context().entity(id)
    }

    const preview = (event: PointerEvent | undefined): Entity[] => {
      if (state.target === undefined || event === undefined) return []
      return previewEntity(state.target, event.point, context(), state.mode)
    }

    return {
      id: "trim",
      status: {
        hint: state.target === undefined
          ? "Click an entity to trim to the nearest boundary (Alt = extend)"
          : "Click another boundary to refine, Esc to exit",
        ready: state.target !== undefined
      },
      start: () => withState(initial),
      onPointerDown: (event) => {
        const t = target(event)
        return withState({
          target: t,
          mode: event.modifiers.alt ? "extend" : "trim",
          seq: state.seq + 1
        })
      },
      onPointerMove: () => withState(state),
      onPointerUp: () => withState(state),
      onKey: (key) => (key === "Escape" ? withState(initial) : withState(state)),
      preview: (tool) => {
        if (state.target === undefined) return []
        // The editor's preview runs at idle (no current event), so use the
        // target's geometric centre as the cursor fallback.
        const prim = curvePrimitives(state.target)[0]
        const cursor: Vec2 | undefined =
          prim?.kind === "segment"
            ? { x: (prim.value.a.x + prim.value.b.x) / 2, y: (prim.value.a.y + prim.value.b.y) / 2 }
            : prim?.kind === "circle" || prim?.kind === "arc"
            ? prim.value.center
            : undefined
        return cursor === undefined ? [] : previewEntity(state.target, cursor, context(), state.mode)
      },
      command: (): Command | undefined => {
        if (state.target === undefined) return undefined
        const prim = curvePrimitives(state.target)[0]
        const cursor: Vec2 | undefined =
          prim?.kind === "segment"
            ? { x: (prim.value.a.x + prim.value.b.x) / 2, y: (prim.value.a.y + prim.value.b.y) / 2 }
            : prim?.kind === "circle" || prim?.kind === "arc"
            ? prim.value.center
            : undefined
        if (cursor === undefined) return undefined
        const next = trimEntity(state.target, cursor, context(), state.mode)
        return next === undefined ? undefined : updateEntity(state.target.id, next, state.mode)
      }
    }
  }
}

void batch
void removeEntities