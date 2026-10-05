/**
 * Uniform grid spatial index (spec 06-desktop-ui.md §2).
 *
 * The editor must stay at 60 fps with 10 000 entities, so hit-testing and
 * viewport culling cannot scan every entity per pointer event. A uniform grid is
 * the cheapest index that works for CAD-like distributions (entities clustered in
 * a few regions), and it stays exact: a cell lookup returns every entity whose
 * bounding box touches the cell, never a subset.
 */
import { type Bounds2D, type Entity, boundingBox, emptyBounds, unionBox } from "@cadcamfun/core"

/** Anything the index can store: the editor indexes entities and toolpaths. */
export interface SpatialItem {
  /** Stable key the editor selects by (an entity id, a toolpath id). */
  readonly id: string
  readonly bounds: Bounds2D
}

export interface GridOptions {
  /** Cell size in world units. Defaults to a value that suits a 1 m drawing. */
  readonly cellSize?: number
}

const DEFAULT_CELL = 50

/** Above this many cells an item is tracked aside instead of per cell. */
const MAX_CELLS_PER_ITEM = 4096

/** Guards against `cellSize <= 0`, which would make the cell loop infinite. */
export const MIN_CELL_SIZE = 1e-6

export interface SpatialIndex<T extends SpatialItem> {
  /** Rebuilds the index from scratch. */
  build(items: ReadonlyArray<T>): void
  /** Inserts or replaces one item (keyed by its `id`). */
  upsert(id: string, item: T): void
  /** Removes one item; unknown ids are ignored. */
  remove(id: string): void
  /** Ids whose bounds intersect the query box, in insertion order. */
  query(bounds: Bounds2D): ReadonlyArray<string>
  /** Nearest item to a point within `radius`, or `undefined`. */
  nearest(point: { readonly x: number; readonly y: number }, radius: number): { readonly id: string; readonly distance: number } | undefined
  /** Total indexed items. */
  readonly size: number
  /** Number of non-empty cells; a cheap "is the index doing anything" metric. */
  readonly occupiedCells: number
  /** Bounds of everything indexed, or an empty box when empty. */
  readonly bounds: Bounds2D
}

interface Cell {
  readonly x: number
  readonly y: number
}

const cellKey = (cell: Cell): string => `${cell.x}:${cell.y}`

/** Builds a spatial index over `T extends SpatialItem`. */
export const createSpatialIndex = <T extends SpatialItem>(options: GridOptions = {}): SpatialIndex<T> => {
  const cellSize = Math.max(MIN_CELL_SIZE, options.cellSize ?? DEFAULT_CELL)
  const cells = new Map<string, Set<string>>()
  const items = new Map<string, T>()
  /**
   * Items spanning more cells than `MAX_CELLS_PER_ITEM` (a stock box, a huge
   * hatch) would blow the index up, so they are kept aside and checked on every
   * query instead of per cell. Exactness is preserved: they are still returned,
   * just without the cell bookkeeping.
   */
  const oversized = new Set<string>()

  /** Cells an item covers, or `undefined` when it is too large to enumerate. */
  const cellsOf = (bounds: Bounds2D): ReadonlyArray<Cell> | undefined => {
    const x0 = Math.floor(bounds.minX / cellSize)
    const x1 = Math.floor(bounds.maxX / cellSize)
    const y0 = Math.floor(bounds.minY / cellSize)
    const y1 = Math.floor(bounds.maxY / cellSize)
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS_PER_ITEM) return undefined
    const out: Cell[] = []
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) out.push({ x, y })
    }
    return out
  }

  const add = (id: string, item: T): void => {
    items.set(id, item)
    const covered = cellsOf(item.bounds)
    if (covered === undefined) {
      oversized.add(id)
      return
    }
    for (const cell of covered) {
      const key = cellKey(cell)
      const bucket = cells.get(key)
      if (bucket === undefined) cells.set(key, new Set([id]))
      else bucket.add(id)
    }
  }

  const drop = (id: string): void => {
    const item = items.get(id)
    if (item === undefined) return
    items.delete(id)
    oversized.delete(id)
    for (const cell of cellsOf(item.bounds) ?? []) {
      const key = cellKey(cell)
      const bucket = cells.get(key)
      if (bucket === undefined) continue
      bucket.delete(id)
      if (bucket.size === 0) cells.delete(key)
    }
  }

  const intersects = (a: Bounds2D, b: Bounds2D): boolean =>
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY

  const index: SpatialIndex<T> = {
    build: (list) => {
      cells.clear()
      items.clear()
      oversized.clear()
      for (const item of list) add(item.id, item)
    },
    upsert: (id, item) => {
      drop(id)
      add(id, item)
    },
    remove: drop,
    query: (bounds) => {
      const seen = new Set<string>()
      const out: string[] = []
      const consider = (id: string): void => {
        if (seen.has(id)) return
        seen.add(id)
        const item = items.get(id)
        if (item !== undefined && intersects(item.bounds, bounds)) out.push(id)
      }
      const covered = cellsOf(bounds)
      if (covered === undefined) {
        for (const id of items.keys()) consider(id)
        return out
      }
      for (const cell of covered) {
        for (const id of cells.get(cellKey(cell)) ?? []) consider(id)
      }
      // Oversized items live in no cell, so every query checks them.
      for (const id of oversized) consider(id)
      return out
    },
    nearest: (point, radius) => {
      let best: { id: string; distance: number } | undefined
      const box = {
        minX: point.x - radius,
        minY: point.y - radius,
        maxX: point.x + radius,
        maxY: point.y + radius
      }
      for (const id of index.query(box)) {
        const item = items.get(id)
        if (item === undefined) continue
        const distance = distanceToBox(point, item.bounds)
        if (distance > radius) continue
        if (best === undefined || distance < best.distance) best = { id, distance }
      }
      return best
    },
    get size() {
      return items.size
    },
    get occupiedCells() {
      return cells.size
    },
    get bounds() {
      let acc = emptyBounds()
      for (const item of items.values()) acc = unionBox(acc, item.bounds)
      return acc
    }
  }
  return index
}

/** Distance from a point to a box (0 inside). */
export const distanceToBox = (
  point: { readonly x: number; readonly y: number },
  bounds: Bounds2D
): number => {
  const dx = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX)
  const dy = Math.max(bounds.minY - point.y, 0, point.y - bounds.maxY)
  return Math.hypot(dx, dy)
}

/** Builds an index over CAD entities, using WP1's exact bounding boxes. */
export const indexEntities = <E extends { id: string; bounds?: Bounds2D }>(
  entities: ReadonlyArray<E>,
  options?: GridOptions
): SpatialIndex<{ id: string; bounds: Bounds2D }> => {
  const index = createSpatialIndex<{ id: string; bounds: Bounds2D }>(options)
  index.build(entities.map((e) => ({ id: e.id, bounds: e.bounds ?? boundingBox(e as never) })))
  return index
}

/** Index over `Entity`, with WP1's exact bounding boxes. */
export const entityIndex = (
  entities: ReadonlyArray<Entity>,
  options?: GridOptions
): SpatialIndex<{ id: string; bounds: Bounds2D }> =>
  indexEntities(entities.map((e) => ({ id: e.id, bounds: boundingBox(e) })), options)

/**
 * Brute-force counterpart of `query`. The tests use it to prove the grid is
 * exact — same ids as a linear scan — instead of asserting a wall-clock timing,
 * which would be flaky on CI.
 */
export const bruteForceQuery = <T extends SpatialItem>(
  items: ReadonlyArray<T>,
  bounds: Bounds2D
): ReadonlyArray<string> =>
  items
    .filter(
      (item) =>
        item.bounds.minX <= bounds.maxX &&
        item.bounds.maxX >= bounds.minX &&
        item.bounds.minY <= bounds.maxY &&
        item.bounds.maxY >= bounds.minY
    )
    .map((item) => item.id)
