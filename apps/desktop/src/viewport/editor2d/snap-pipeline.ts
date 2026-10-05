/**
 * Snap pipeline for the 2D editor (spec 06-desktop-ui.md §2).
 *
 * The editor has to stay at 60 fps with 10 000 entities, so it must not hand all
 * of them to `findSnap` on every pointer move. This module narrows the candidate
 * set with the spatial index first (entities whose bounds are within
 * `tolerance + a margin` of the cursor) and then calls WP1's `findSnap`, so the
 * snapping semantics stay exactly the ones the legacy editor had.
 *
 * Pure: no canvas, no Solid, no DOM — the renderer only draws the marker it
 * returns.
 */
import {
  type Bounds2D,
  type Entity,
  type Snap,
  type SnapSettings,
  type SnapType,
  type Vec2,
  boundingBox,
  findSnap
} from "@cadcamfun/core"
import type { SpatialIndex } from "../spatial/grid.ts"

/** Index shape the pipeline needs; anything with `query` works (the grid, a test double). */
export interface SnapIndex {
  query(bounds: Bounds2D): ReadonlyArray<string>
}

/** Extra slack around the snap tolerance when picking index candidates, mm. */
export const CANDIDATE_MARGIN = 2

/** A snap plus the marker the renderer draws. */
export interface SnapResult {
  readonly snap: Snap
  /** Entity ids under the cursor, nearest first — what the select tool consumes. */
  readonly hits: ReadonlyArray<string>
  /** Candidates the pipeline considered; handy for tests and for the status bar. */
  readonly candidateCount: number
}

/**
 * Entities worth asking `findSnap` about: those whose bounds come within
 * `tolerance + margin` of the cursor.
 */
export const snapCandidates = (
  index: SnapIndex,
  cursor: Vec2,
  settings: SnapSettings,
  resolve: (id: string) => Entity | undefined
): ReadonlyArray<Entity> => {
  const reach = Math.max(0, settings.tolerance) + CANDIDATE_MARGIN
  const out: Entity[] = []
  const seen = new Set<string>()
  for (const id of index.query({
    minX: cursor.x - reach,
    minY: cursor.y - reach,
    maxX: cursor.x + reach,
    maxY: cursor.y + reach
  })) {
    if (seen.has(id)) continue
    seen.add(id)
    const entity = resolve(id)
    if (entity !== undefined) out.push(entity)
  }
  return out
}

/**
 * Resolves the cursor to a world point: the snap when one is found, the raw
 * cursor otherwise. Tools receive this point, never the raw cursor.
 */
export const resolvePoint = (cursor: Vec2, snap: Snap | undefined): Vec2 => snap?.point ?? { x: cursor.x, y: cursor.y }

export interface SnapPipelineOptions {
  readonly index: SnapIndex
  readonly entities: ReadonlyMap<string, Entity>
  readonly settings: SnapSettings
}

/** Cursor -> snap, narrowing candidates through the spatial index first. */
export const snapAt = (cursor: Vec2, options: SnapPipelineOptions): SnapResult | undefined => {
  const candidates = snapCandidates(options.index, cursor, options.settings, (id) => options.entities.get(id))
  const snap = findSnap(candidates, cursor, options.settings)
  if (snap === undefined) return undefined
  const hits = snap.entityId === undefined ? [] : [snap.entityId]
  return { snap, hits, candidateCount: candidates.length }
}

/**
 * Entities under the cursor, nearest first. Selection needs the *outline*
 * distance, not the bounding box, so it is measured with `entityPoints` from
 * WP1 rather than the index's box test. `radius` is the pick radius in mm.
 */
export const pickEntities = (
  cursor: Vec2,
  index: SnapIndex,
  entities: ReadonlyMap<string, Entity>,
  radius: number,
  distanceToOutline: (entity: Entity, cursor: Vec2) => number
): ReadonlyArray<string> => {
  const ids = index.query({
    minX: cursor.x - radius,
    minY: cursor.y - radius,
    maxX: cursor.x + radius,
    maxY: cursor.y + radius
  })
  const scored: Array<{ id: string; distance: number }> = []
  for (const id of ids) {
    const entity = entities.get(id)
    if (entity === undefined) continue
    const distance = distanceToOutline(entity, cursor)
    if (distance <= radius) scored.push({ id, distance })
  }
  return scored.sort((a, b) => a.distance - b.distance).map((s) => s.id)
}

/** Colour-independent marker shape for each snap type, consumed by the renderer. */
export const SNAP_MARKER_KINDS: Record<SnapType, string> = {
  endpoint: "square",
  midpoint: "triangle",
  center: "circle",
  intersection: "cross",
  perpendicular: "right-angle",
  tangent: "circle",
  nearest: "small-square",
  quadrant: "circle"
}