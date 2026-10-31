/**
 * 2D geometry of a print layer: rings, islands (an outer boundary with its holes) and the few operations the slicer needs.
 *
 * Winding convention (the same the offsetter of `cad/offset.ts` uses): outer boundaries run counter-clockwise, holes
 * clockwise, so the material is always on the left of the direction of travel and a *negative* offset distance moves a
 * boundary into the material.
 */
import { offsetRings } from "../../cad/offset.ts"
import type { Vec2 } from "../../cad/vec.ts"

export type Ring = ReadonlyArray<Vec2>

/** An outer boundary (counter-clockwise) and the holes inside it (clockwise). */
export interface Island {
  readonly outer: Ring
  readonly holes: ReadonlyArray<Ring>
}

/** The material of one layer. */
export type Region = ReadonlyArray<Island>

export interface Box2 { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }

/** Signed area: positive for a counter-clockwise ring. */
export const ringArea = (ring: Ring): number => {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y
  return a / 2
}

export const ringLength = (ring: Ring): number => {
  let l = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const dx = ring[i]!.x - ring[j]!.x, dy = ring[i]!.y - ring[j]!.y; l += Math.sqrt(dx * dx + dy * dy) }
  return l
}

export const ringBox = (ring: Ring): Box2 => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of ring) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export const regionBox = (region: Region): Box2 | undefined => {
  let box: Box2 | undefined
  for (const island of region) {
    const b = ringBox(island.outer)
    box = box === undefined ? b : { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) }
  }
  return box
}

export const islandRings = (island: Island): ReadonlyArray<Ring> => [island.outer, ...island.holes]

/** Every ring of the region, outers first within each island. */
export const regionRings = (region: Region): Ring[] => region.flatMap((island) => [...islandRings(island)])

export const regionArea = (region: Region): number => region.reduce((sum, island) => sum + ringArea(island.outer) + island.holes.reduce((h, ring) => h + ringArea(ring), 0), 0)

/** Even-odd containment over a set of rings. */
export const insideRings = (p: Vec2, rings: ReadonlyArray<Ring>): boolean => {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!
      const b = ring[j]!
      if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside
    }
  }
  return inside
}

export const insideRegion = (p: Vec2, region: Region): boolean => insideRings(p, regionRings(region))

/** Removes vertices closer than `tol` to the line through their neighbours (Douglas-Peucker on a closed ring). */
export const simplifyRing = (ring: Ring, tol: number): Ring => {
  const n = ring.length
  if (n <= 4 || tol <= 0) return ring
  // Anchor on the two points furthest apart so the split of the closed ring is stable.
  let a = 0
  for (let i = 1; i < n; i++) if (ring[i]!.x < ring[a]!.x || (ring[i]!.x === ring[a]!.x && ring[i]!.y < ring[a]!.y)) a = i
  let b = a
  let best = -1
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(ring[i]!.x - ring[a]!.x, ring[i]!.y - ring[a]!.y)
    if (d > best) { best = d; b = i }
  }
  const keep = new Uint8Array(n)
  keep[a] = 1
  keep[b] = 1
  const run = (from: number, to: number): void => {
    // Indices from..to walking forward around the ring.
    const stack: Array<[number, number]> = [[from, to]]
    while (stack.length > 0) {
      const [s, e] = stack.pop()!
      const p = ring[s]!
      const q = ring[e]!
      const dx = q.x - p.x
      const dy = q.y - p.y
      const len = Math.sqrt(dx * dx + dy * dy)
      let worst = -1
      let at = -1
      for (let i = (s + 1) % n; i !== e; i = (i + 1) % n) {
        const r = ring[i]!
        const d = len < 1e-12 ? Math.hypot(r.x - p.x, r.y - p.y) : Math.abs((r.x - p.x) * dy - (r.y - p.y) * dx) / len
        if (d > worst) { worst = d; at = i }
      }
      if (at >= 0 && worst > tol) {
        keep[at] = 1
        stack.push([s, at], [at, e])
      }
    }
  }
  run(a, b)
  run(b, a)
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i]!)
  return out.length >= 3 ? out : ring
}

/**
 * Groups loose rings into islands: a counter-clockwise ring is an outer boundary, a clockwise one a hole of the smallest outer
 * that contains it. A hole that no outer contains (a defect of the input) is dropped.
 */
export const islandsOf = (rings: ReadonlyArray<Ring>): Region => {
  const outers = rings.filter((r) => r.length >= 3 && ringArea(r) > 0).map((outer) => ({ outer, area: ringArea(outer), holes: [] as Ring[] }))
  outers.sort((a, b) => a.area - b.area)
  for (const ring of rings) {
    if (ring.length < 3 || ringArea(ring) >= 0) continue
    const probe = ring[0]!
    const owner = outers.find((o) => insideRings(probe, [o.outer]))
    owner?.holes.push(ring)
  }
  return outers.map(({ outer, holes }) => ({ outer, holes }))
}

/**
 * Moves every boundary of the region by `distance` (negative: into the material, positive: out of it) and returns what is
 * left. Features that collapse disappear; one island may split in several.
 */
export const offsetRegion = (region: Region, distance: number): Region => {
  if (Math.abs(distance) < 1e-9) return region
  const out: Ring[] = []
  for (const island of region) {
    const rings = islandRings(island).map((points) => ({ points, closed: true }))
    // The offsetter's positive side is the right of travel and the material is on the left: the signs agree.
    const result = offsetRings(rings, distance, { keep: distance < 0 ? "inside" : "outside", mitreLimit: 2, joinFallback: "round" })
    for (const path of result) if (path.closed && path.points.length >= 3) out.push(path.points)
  }
  return islandsOf(out)
}

/** Calls `visit(ix, iy)` for every grid cell the segment a-b touches (a supercover: corner crossings visit both neighbours). */
const walkCells = (a: Vec2, b: Vec2, cell: number, visit: (ix: number, iy: number) => void): void => {
  let x = Math.floor(a.x / cell)
  let y = Math.floor(a.y / cell)
  const endX = Math.floor(b.x / cell)
  const endY = Math.floor(b.y / cell)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const stepX = dx > 0 ? 1 : -1
  const stepY = dy > 0 ? 1 : -1
  const tDeltaX = dx !== 0 ? cell / Math.abs(dx) : Infinity
  const tDeltaY = dy !== 0 ? cell / Math.abs(dy) : Infinity
  let tMaxX = dx > 0 ? ((x + 1) * cell - a.x) / dx : dx < 0 ? (x * cell - a.x) / dx : Infinity
  let tMaxY = dy > 0 ? ((y + 1) * cell - a.y) / dy : dy < 0 ? (y * cell - a.y) / dy : Infinity
  const limit = Math.abs(endX - x) + Math.abs(endY - y) + 2
  for (let n = 0; n <= limit; n++) {
    visit(x, y)
    if (x === endX && y === endY) return
    if (Math.abs(tMaxX - tMaxY) < 1e-9) {
      visit(x + stepX, y)
      visit(x, y + stepY)
      x += stepX; y += stepY
      tMaxX += tDeltaX; tMaxY += tDeltaY
    } else if (tMaxX < tMaxY) { x += stepX; tMaxX += tDeltaX } else { y += stepY; tMaxY += tDeltaY }
  }
}

/** The edges of a set of rings on a uniform grid, so a segment is tested only against the edges near it. */
export class EdgeIndex {
  private readonly ax: number[] = []
  private readonly ay: number[] = []
  private readonly bx: number[] = []
  private readonly by: number[] = []
  private readonly cells = new Map<number, number[]>()
  private stamp = 0
  private seen: Int32Array

  constructor(rings: ReadonlyArray<Ring>, private readonly cell = 3) {
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const id = this.ax.length
        const p = ring[j]!
        const q = ring[i]!
        this.ax.push(p.x); this.ay.push(p.y); this.bx.push(q.x); this.by.push(q.y)
        walkCells(p, q, cell, (ix, iy) => {
          const key = (ix + 32768) * 65536 + (iy + 32768)
          const list = this.cells.get(key)
          if (list === undefined) this.cells.set(key, [id]); else list.push(id)
        })
      }
    }
    this.seen = new Int32Array(this.ax.length)
  }

  /** Parameters t in (0, 1) at which the segment a-b crosses an indexed edge, sorted. */
  crossings(a: Vec2, b: Vec2): number[] {
    const out: number[] = []
    const rx = b.x - a.x
    const ry = b.y - a.y
    this.stamp++
    const test = (id: number): void => {
      if (this.seen[id] === this.stamp) return
      this.seen[id] = this.stamp
      const px = this.ax[id]!, py = this.ay[id]!
      const sx = this.bx[id]! - px
      const sy = this.by[id]! - py
      const denom = rx * sy - ry * sx
      if (Math.abs(denom) < 1e-14) return
      const t = ((px - a.x) * sy - (py - a.y) * sx) / denom
      const u = ((px - a.x) * ry - (py - a.y) * rx) / denom
      // Both edges at a vertex can round just outside their half-open ranges. Include endpoints
      // on both edges and deduplicate t, so a diagonal through a corner still leaves the region.
      if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) out.push(t)
    }
    const ix0 = Math.floor(a.x / this.cell), iy0 = Math.floor(a.y / this.cell)
    if (ix0 === Math.floor(b.x / this.cell) && iy0 === Math.floor(b.y / this.cell)) {
      // A short segment inside one cell (a gyroid is thousands of them): no walk.
      const list = this.cells.get((ix0 + 32768) * 65536 + (iy0 + 32768))
      if (list !== undefined) for (const id of list) test(id)
    } else {
      walkCells(a, b, this.cell, (ix, iy) => {
        const list = this.cells.get((ix + 32768) * 65536 + (iy + 32768))
        if (list !== undefined) for (const id of list) test(id)
      })
    }
    return out.length > 1 ? out.sort((x, y) => x - y).filter((t, i, all) => i === 0 || t - all[i - 1]! > 1e-9) : out
  }
}

/** Parameters t in (0, 1) at which the segment a-b crosses an edge of any ring, sorted. */
export const crossings = (a: Vec2, b: Vec2, rings: ReadonlyArray<Ring>): number[] => new EdgeIndex(rings).crossings(a, b)

/** Even-odd containment against a fixed set of rings, with each ring's box tested first. */
export class RingSet {
  readonly rings: ReadonlyArray<Ring>
  private readonly boxes: ReadonlyArray<Box2>
  private edgeIndex: EdgeIndex | undefined
  constructor(rings: ReadonlyArray<Ring>) {
    this.rings = rings
    this.boxes = rings.map(ringBox)
  }
  /** The edges of the rings on a grid, built on first use. */
  get index(): EdgeIndex {
    if (this.edgeIndex === undefined) this.edgeIndex = new EdgeIndex(this.rings)
    return this.edgeIndex
  }
  contains(p: Vec2): boolean {
    let inside = false
    for (let r = 0; r < this.rings.length; r++) {
      const box = this.boxes[r]!
      if (p.x < box.minX || p.x > box.maxX || p.y < box.minY || p.y > box.maxY) continue
      const ring = this.rings[r]!
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!
        const b = ring[j]!
        if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside
      }
    }
    return inside
  }
}

/**
 * The parts of the segment a-b where `keep(point)` holds, found by cutting the segment at every crossing with the indexed rings
 * (the predicate only changes there) and testing the middle of each piece. Neighbouring pieces are joined.
 */
export const clipSegment = (a: Vec2, b: Vec2, edges: EdgeIndex, keep: (p: Vec2) => boolean): Array<[Vec2, Vec2]> => {
  const cuts = [0, ...edges.crossings(a, b), 1]
  const out: Array<[Vec2, Vec2]> = []
  let open: number | undefined
  for (let i = 0; i + 1 < cuts.length; i++) {
    const t0 = cuts[i]!
    const t1 = cuts[i + 1]!
    if (t1 - t0 < 1e-12) continue
    const tm = (t0 + t1) / 2
    const ok = keep({ x: a.x + (b.x - a.x) * tm, y: a.y + (b.y - a.y) * tm })
    if (ok && open === undefined) open = t0
    if (!ok && open !== undefined) { out.push([lerp(a, b, open), lerp(a, b, t0)]); open = undefined }
  }
  if (open !== undefined) out.push([lerp(a, b, open), b])
  return out
}

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** Rotates a ring so it starts at vertex `index`. */
export const rotateRing = (ring: Ring, index: number): Ring => (index === 0 ? ring : [...ring.slice(index), ...ring.slice(0, index)])

/** A stable signature of a region: two layers with the same one hold the same material (prisms, extrusions). */
export const regionKey = (region: Region): string => {
  const box = regionBox(region)
  if (box === undefined) return "empty"
  const n = region.reduce((c, i) => c + i.outer.length + i.holes.reduce((h, r) => h + r.length, 0), 0)
  return `${region.length}:${n}:${regionArea(region).toFixed(3)}:${box.minX.toFixed(3)}:${box.minY.toFixed(3)}:${box.maxX.toFixed(3)}:${box.maxY.toFixed(3)}`
}
