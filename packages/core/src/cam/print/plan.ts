/**
 * From the material of each layer to the paths that print it: walls (inner ones first, the outer one last, starting at the
 * seam), solid skin where the layer has no material above or below it, bridges over air, the sparse infill everywhere else,
 * supports, and the adhesion (skirt, brim, raft).
 *
 * The inside of a layer is split without any polygon clipping: the infill lines are cut at every crossing with the outlines of
 * the layers around, and each piece is kept or dropped by asking whether its midpoint has material above and below it.
 */
import type { Vec2 } from "../../cad/vec.ts"
import { infillPattern, linesAt, solidLines, type Polyline } from "./infill.ts"
import {
  EdgeIndex, offsetRegion, regionBox, regionRings, ringArea, ringBox, RingSet, rotateRing,
  type Box2, type Island, type Region, type Ring
} from "./geom.ts"
import type { PrintProfile } from "./profile.ts"
import type { SupportPlan } from "./support.ts"
import type { Extrusion, PathKind, PlannedLayer } from "./types.ts"

export interface PlanInput {
  /** The material of every layer, bottom first. */
  readonly regions: ReadonlyArray<Region>
  /** Z of the top of each layer and its thickness, mm. */
  readonly tops: ReadonlyArray<number>
  readonly heights: ReadonlyArray<number>
  readonly profile: PrintProfile
  readonly supports: SupportPlan
  /** Where the nozzle is before the first layer. */
  readonly start: Vec2
  /** Index of the first layer in the finished program (the raft comes before). */
  readonly firstIndex?: number
  readonly onProgress?: (fraction: number) => void
  readonly signal?: { readonly aborted: boolean }
}

export interface PlanOutput {
  readonly layers: ReadonlyArray<PlannedLayer>
  readonly warnings: ReadonlyArray<string>
  /** Islands thinner than one bead, left unprinted. */
  readonly thinIslands: number
  readonly end: Vec2
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)
const polyLength = (p: ReadonlyArray<Vec2>): number => { let l = 0; for (let i = 1; i < p.length; i++) l += dist(p[i - 1]!, p[i]!); return l }

/**
 * The parts of a polyline where `keep` holds. The predicate only changes where the polyline crosses an indexed outline, so it is
 * asked once for the stretch between two crossings, not once per segment: a gyroid of a thousand tiny segments costs what its
 * crossings cost.
 */
const clipPolyline = (poly: Polyline, edges: EdgeIndex, keep: (p: Vec2) => boolean): Polyline[] => {
  const out: Polyline[] = []
  let current: Vec2[] | undefined
  let state: boolean | undefined
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!
    const b = poly[i]!
    const cuts = edges.crossings(a, b)
    let t0 = 0
    for (let j = 0; j <= cuts.length; j++) {
      const t1 = j < cuts.length ? cuts[j]! : 1
      if (t1 - t0 < 1e-12) { t0 = t1; continue }
      if (state === undefined || j > 0) {
        const tm = (t0 + t1) / 2
        state = keep({ x: a.x + (b.x - a.x) * tm, y: a.y + (b.y - a.y) * tm })
      }
      if (state) {
        if (current === undefined) current = [{ x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 }]
        current.push(t1 >= 1 ? b : { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 })
      } else if (current !== undefined) { out.push(current); current = undefined }
      t0 = t1
    }
  }
  if (current !== undefined) out.push(current)
  return out.filter((p) => p.length >= 2).map(dropCollinear)
}

/** Removes the vertices that lie on the straight line between their neighbours (the crossings a kept stretch passed through). */
const dropCollinear = (poly: Polyline): Polyline => {
  if (poly.length < 3) return poly
  const out: Vec2[] = [poly[0]!]
  for (let i = 1; i < poly.length - 1; i++) {
    const a = out[out.length - 1]!
    const b = poly[i]!
    const c = poly[i + 1]!
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    const forward = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0
    if (Math.abs(cross) > 1e-9 || !forward) out.push(b)
  }
  out.push(poly[poly.length - 1]!)
  return out
}

/** Greedy nearest-end ordering; a path may be walked backwards. Returns the items in order and where the nozzle ends. */
const orderItems = <T extends { readonly points: ReadonlyArray<Vec2> }>(items: ReadonlyArray<T>, from: Vec2): { ordered: T[]; end: Vec2 } => {
  const left = items.slice()
  const ordered: T[] = []
  let pos = from
  while (left.length > 0) {
    let best = 0
    let bestD = Infinity
    let reverse = false
    for (let i = 0; i < left.length; i++) {
      const p = left[i]!.points
      const d0 = dist(pos, p[0]!)
      const d1 = dist(pos, p[p.length - 1]!)
      if (d0 < bestD) { bestD = d0; best = i; reverse = false }
      if (d1 < bestD) { bestD = d1; best = i; reverse = true }
    }
    const chosen = left.splice(best, 1)[0]!
    const item = reverse ? { ...chosen, points: chosen.points.slice().reverse() } : chosen
    ordered.push(item)
    pos = item.points[item.points.length - 1]!
  }
  return { ordered, end: pos }
}

/** Runs that end next to where the next one starts are joined with a short extruding connector, as a zigzag fill is. */
const joinNear = (ordered: ReadonlyArray<Polyline>, maxGap: number, ok: (p: Vec2) => boolean): Polyline[] => {
  const out: Polyline[] = []
  for (const path of ordered) {
    const last = out[out.length - 1]
    if (last !== undefined) {
      const tail = last[last.length - 1]!
      const head = path[0]!
      const d = dist(tail, head)
      if (d > 1e-9 && d <= maxGap && ok({ x: (tail.x + head.x) / 2, y: (tail.y + head.y) / 2 })) { last.push(...path); continue }
    }
    out.push(path.slice())
  }
  return out
}

const orderPaths = (paths: ReadonlyArray<Polyline>, from: Vec2): { ordered: Polyline[]; end: Vec2 } => {
  const r = orderItems(paths.map((points) => ({ points })), from)
  return { ordered: r.ordered.map((x) => x.points as Polyline), end: r.end }
}

/** A deterministic scatter in [0, 1) from a point and a layer, for the random seam. */
const scatter = (p: Vec2, layer: number): number => {
  const v = Math.sin(p.x * 12.9898 + p.y * 78.233 + layer * 37.719) * 43758.5453
  return v - Math.floor(v)
}

const ringSignature = (r: Ring): string => `${r.length}:${ringArea(r).toFixed(4)}:${r[0]!.x.toFixed(4)}:${r[0]!.y.toFixed(4)}`

/**
 * Whether the material of `outer` (a whole layer) wholly contains `inner` (the rings of one island). Same rings, or: every
 * vertex of the island inside, none of its edges crossing the outline, and no ring of the outer layer (a hole, another island)
 * inside the island. A doubtful answer is "no", which costs a test and never a wrong fill.
 */
const covers = (outer: RingSet, inner: ReadonlyArray<Ring>, innerSet: RingSet): boolean => {
  if (outer.rings.length === 0) return false
  const known = new Set(outer.rings.map(ringSignature))
  if (inner.every((r) => known.has(ringSignature(r)))) return true
  for (const ring of inner) for (const v of ring) if (!outer.contains(v)) return false
  const index = outer.index
  for (const ring of inner) for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) if (index.crossings(ring[b]!, ring[a]!).length > 0) return false
  for (const ring of outer.rings) if (innerSet.contains(ring[0]!)) return false
  return true
}

class Planner {
  private pos: Vec2
  private readonly warnings = new Set<string>()
  thinIslands = 0
  private readonly innerMemo = new Map<number, Region>()
  private readonly ringMemo = new Map<number, RingSet>()
  private readonly regionMemo = new Map<number, RingSet>()
  private readonly box: Box2
  private readonly profile: PrintProfile
  private readonly w: number

  constructor(private readonly input: PlanInput) {
    this.pos = input.start
    this.profile = input.profile
    this.w = input.profile.extrusionWidth
    const boxes = input.regions.map(regionBox).filter((b): b is Box2 => b !== undefined)
    this.box = boxes.length === 0 ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : {
      minX: Math.min(...boxes.map((b) => b.minX)), minY: Math.min(...boxes.map((b) => b.minY)),
      maxX: Math.max(...boxes.map((b) => b.maxX)), maxY: Math.max(...boxes.map((b) => b.maxY))
    }
  }

  get end(): Vec2 { return this.pos }
  get notes(): string[] { return [...this.warnings] }

  /** How far inside the wall's inner edge the sparse infill reaches, so its beads fuse with the walls. */
  private get innerOffset(): number { return this.profile.walls * this.w - 0.1 * this.w }

  /** Wall-inner edge of a whole layer (neighbour layers are compared against it). */
  private inner(i: number): Region {
    if (i < 0 || i >= this.input.regions.length) return []
    const memo = this.innerMemo.get(i)
    if (memo !== undefined) return memo
    const region = this.input.regions[i]!
    const value = this.profile.walls === 0 ? region : offsetRegion(region, -this.innerOffset)
    this.innerMemo.set(i, value)
    return value
  }

  private ringsOfInner(i: number): RingSet {
    const memo = this.ringMemo.get(i)
    if (memo !== undefined) return memo
    const set = new RingSet(regionRings(this.inner(i)))
    this.ringMemo.set(i, set)
    return set
  }

  private ringsOfRegion(i: number): RingSet {
    const memo = this.regionMemo.get(i)
    if (memo !== undefined) return memo
    const set = new RingSet(i < 0 || i >= this.input.regions.length ? [] : regionRings(this.input.regions[i]!))
    this.regionMemo.set(i, set)
    return set
  }

  private seamStart(ring: Ring, layer: number): number {
    const n = ring.length
    if (this.profile.seam === "aligned") {
      const target = { x: this.box.maxX, y: this.box.maxY }
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < n; i++) { const d = dist(ring[i]!, target); if (d < bestD) { bestD = d; best = i } }
      return best
    }
    if (this.profile.seam === "random") return Math.min(n - 1, Math.floor(scatter(ring[0]!, layer) * n))
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) { const d = dist(ring[i]!, this.pos); if (d < bestD) { bestD = d; best = i } }
    return best
  }

  /** A closed wall as a path that starts at the seam and returns to it. */
  private loop(ring: Ring, layer: number): Polyline {
    const start = this.seamStart(ring, layer)
    const rotated = rotateRing(ring, start)
    return [...rotated, rotated[0]!]
  }

  private push(out: Extrusion[], kind: PathKind, points: Polyline, widthScale?: number): void {
    if (points.length < 2) return
    out.push(widthScale === undefined ? { kind, points } : { kind, points, widthScale })
    this.pos = points[points.length - 1]!
  }

  private wallsOf(island: Island): Ring[][] {
    const out: Ring[][] = []
    for (let k = 0; k < this.profile.walls; k++) {
      const region = offsetRegion([island], -(this.w / 2 + k * this.w))
      const rings = regionRings(region).filter((r) => Math.abs(ringArea(r)) > this.w * this.w * 0.25)
      if (rings.length === 0) break
      out.push(rings)
    }
    return out
  }

  private islandPaths(i: number, island: Island, layerBox: Box2, out: Extrusion[]): void {
    const { profile: pf, w } = this
    const walls = this.wallsOf(island)
    if (pf.walls > 0 && walls.length === 0) {
      this.thinIslands++
      this.warnings.add("A feature thinner than one bead was left unprinted")
      return
    }
    const order = pf.outerWallFirst ? walls.map((_, k) => k) : walls.map((_, k) => walls.length - 1 - k)
    for (const k of order) {
      const remaining = walls[k]!.slice()
      while (remaining.length > 0) {
        let best = 0
        let bestD = Infinity
        remaining.forEach((r, idx) => { const d = Math.min(...r.map((p) => dist(p, this.pos))); if (d < bestD) { bestD = d; best = idx } })
        const ring = remaining.splice(best, 1)[0]!
        this.push(out, k === 0 ? "wall-outer" : "wall-inner", this.loop(ring, i))
      }
    }

    const innerIsland = pf.walls === 0 ? [island] : offsetRegion([island], -this.innerOffset)
    if (innerIsland.length === 0) return
    const innerRings = regionRings(innerIsland)
    const box = regionBox(innerIsland)
    if (box === undefined) return
    const innerSet = new RingSet(innerRings)
    const inside = (p: Vec2): boolean => innerSet.contains(p)
    const near = (r: Ring): boolean => { const b = ringBox(r); return b.maxX >= box.minX - 1 && b.minX <= box.maxX + 1 && b.maxY >= box.minY - 1 && b.minY <= box.maxY + 1 }

    // Only the layers whose material does not wholly contain this island can make part of it solid or bridged; the others
    // are left out of both the cuts and the tests (a prism has none, a sphere half of them).
    const above: RingSet[] = []
    const below: RingSet[] = []
    let bottomSolid = i < pf.bottomLayers
    for (let k = 1; k <= pf.topLayers; k++) { const set = this.ringsOfInner(i + k); if (!above.includes(set) && !covers(set, innerRings, innerSet)) above.push(set) }
    for (let k = 1; k <= pf.bottomLayers; k++) {
      if (i - k < 0) { bottomSolid = true; break }
      const set = this.ringsOfInner(i - k)
      if (!below.includes(set) && !covers(set, innerRings, innerSet)) below.push(set)
    }
    const air = i > 0 ? this.ringsOfRegion(i - 1) : undefined
    const airRelevant = air !== undefined && !covers(air, innerRings, innerSet)
    const solidPossible = bottomSolid || above.length > 0 || below.length > 0
    const solidAt = (p: Vec2): boolean => bottomSolid || above.some((s) => !s.contains(p)) || below.some((s) => !s.contains(p))
    const airBelow = (p: Vec2): boolean => airRelevant && !air!.contains(p)
    const cutRings = [...innerRings, ...[...above, ...below].flatMap((s) => s.rings.filter(near)), ...(airRelevant ? air!.rings.filter(near) : [])]
    const edges = new EdgeIndex(cutRings)

    const solidKeep = (p: Vec2): boolean => inside(p) && solidAt(p) && !airBelow(p)
    const bridgeKeep = (p: Vec2): boolean => inside(p) && solidAt(p) && airBelow(p)
    const sparseKeep = (p: Vec2): boolean => inside(p) && !solidAt(p)

    const collect = (raw: Polyline[], keep: (p: Vec2) => boolean, minLength: number): Polyline[] =>
      raw.flatMap((poly) => clipPolyline(poly, edges, keep)).filter((p) => polyLength(p) >= minLength)

    if (solidPossible) {
      const skin = collect(solidLines(box, w, i), solidKeep, w * 0.5)
      const skinOrdered = orderPaths(skin, this.pos)
      for (const p of joinNear(skinOrdered.ordered, 2.5 * w, solidKeep)) this.push(out, "skin", p)
    }

    if (solidPossible && airRelevant) {
      const bridgeAngle = box.maxX - box.minX <= box.maxY - box.minY ? 0 : 90
      const bridges = collect(linesAt(box, w * 1.05, bridgeAngle), bridgeKeep, w * 0.5)
      for (const p of joinNear(orderPaths(bridges, this.pos).ordered, 2.5 * w, bridgeKeep)) this.push(out, "bridge", p)
    }

    if (pf.infillDensity > 0 && !pf.vase) {
      const density = pf.infillDensity / 100
      let raw: Polyline[]
      if (pf.infillPattern === "concentric") {
        raw = []
        const spacing = w / density
        for (let d = 0; d < Math.max(box.maxX - box.minX, box.maxY - box.minY); d += spacing) {
          const rings = regionRings(offsetRegion(innerIsland, -d))
          if (rings.length === 0) break
          for (const r of rings) raw.push([...r, r[0]!])
        }
      } else {
        raw = infillPattern({ pattern: pf.infillPattern, box, lineWidth: w, density, layer: i, z: this.input.tops[i]! })
      }
      const sparse = collect(raw, sparseKeep, w * 1.5)
      for (const p of joinNear(orderPaths(sparse, this.pos).ordered, 2.5 * w, sparseKeep)) this.push(out, "infill", p)
    }
    void layerBox
  }

  /** The spiral of vase mode: one wall that climbs from the layer below to this layer's top over one turn. */
  private spiral(i: number): Extrusion[] {
    const region = this.input.regions[i]!
    if (region.length === 0) return []
    if (region.length > 1) this.warnings.add("Vase mode prints the largest part only; the other parts are left out")
    const island = region.slice().sort((a, b) => ringArea(b.outer) - ringArea(a.outer))[0]!
    const rings = regionRings(offsetRegion([{ outer: island.outer, holes: [] }], -this.w / 2))
    const ring = rings.sort((a, b) => ringArea(b) - ringArea(a))[0]
    if (ring === undefined) return []
    const path = this.loop(ring, i)
    const lower = i === 0 ? this.input.tops[i]! - this.input.heights[i]! : this.input.tops[i - 1]!
    const top = this.input.tops[i]!
    const total = polyLength(path)
    const zs: number[] = [lower]
    let run = 0
    for (let k = 1; k < path.length; k++) { run += dist(path[k - 1]!, path[k]!); zs.push(lower + ((top - lower) * run) / total) }
    this.pos = path[path.length - 1]!
    return [{ kind: "vase", points: path, zs }]
  }

  layer(i: number, index: number): PlannedLayer {
    const { profile: pf } = this
    const region = this.input.regions[i]!
    const paths: Extrusion[] = []
    const layerBox = regionBox(region) ?? this.box
    if (i === 0) this.adhesion(region, paths)
    const sup = this.input.supports.layers[i] ?? []
    for (const item of orderItems(sup, this.pos).ordered) this.push(paths, item.kind, item.points as Polyline)
    const spiralLayer = pf.vase && i >= Math.max(pf.bottomLayers, 1)
    if (spiralLayer) paths.push(...this.spiral(i))
    else {
      // Islands run nearest first so the nozzle does not cross the plate between them.
      const left = region.slice()
      while (left.length > 0) {
        let best = 0
        let bestD = Infinity
        left.forEach((isl, idx) => { const d = Math.min(...isl.outer.map((p) => dist(p, this.pos))); if (d < bestD) { bestD = d; best = idx } })
        this.islandPaths(i, left.splice(best, 1)[0]!, layerBox, paths)
      }
    }
    return { index, z: this.input.tops[i]!, height: this.input.heights[i]!, paths }
  }

  /** Skirt or brim around the first layer. */
  private adhesion(region: Region, out: Extrusion[]): void {
    const { profile: pf, w } = this
    if (region.length === 0) return
    const outers: Region = region.map((island) => ({ outer: island.outer, holes: [] }))
    if (pf.adhesion === "brim") {
      const loops = Math.max(1, Math.ceil(pf.brimWidth / w))
      for (let k = loops - 1; k >= 0; k--) {
        for (const ring of regionRings(offsetRegion(outers, w / 2 + k * w))) this.push(out, "brim", this.loop(ring, 0))
      }
    } else if (pf.adhesion === "skirt") {
      const hull = convexHull(region.flatMap((island) => island.outer as Vec2[]))
      if (hull.length < 3) return
      for (let k = pf.skirtLoops - 1; k >= 0; k--) {
        for (const ring of regionRings(offsetRegion([{ outer: hull, holes: [] }], pf.skirtDistance + k * w))) this.push(out, "skirt", this.loop(ring, 0))
      }
    }
  }
}

/** Convex hull, counter-clockwise (monotone chain). */
export const convexHull = (points: ReadonlyArray<Vec2>): Vec2[] => {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Vec2[] = []
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop(); lower.push(p) }
  const upper: Vec2[] = []
  for (const p of pts.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop(); upper.push(p) }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

export const planLayers = (input: PlanInput): PlanOutput => {
  const planner = new Planner(input)
  const layers: PlannedLayer[] = []
  const first = input.firstIndex ?? 0
  for (let i = 0; i < input.regions.length; i++) {
    if (input.signal?.aborted) throw Object.assign(new Error("Slicing cancelled"), { name: "AbortError" })
    layers.push(planner.layer(i, first + i))
    input.onProgress?.((i + 1) / input.regions.length)
  }
  return { layers, warnings: planner.notes, thinIslands: planner.thinIslands, end: planner.end }
}

/**
 * The raft under the part: a wide base layer, dense layers on it, all over the footprint of the first layer grown by `margin`.
 * Returns the raft layers and the footprint.
 */
export const planRaft = (first: Region, profile: PrintProfile, tops: ReadonlyArray<number>, heights: ReadonlyArray<number>, start: Vec2, margin = 3): { layers: PlannedLayer[]; end: Vec2 } => {
  const w = profile.extrusionWidth
  const footprint = offsetRegion(first.map((island) => ({ outer: island.outer, holes: [] })), margin)
  const box = regionBox(footprint)
  if (box === undefined) return { layers: [], end: start }
  const rings = regionRings(footprint)
  const edges = new EdgeIndex(rings)
  const set = new RingSet(rings)
  let pos = start
  const layers: PlannedLayer[] = []
  for (let r = 0; r < tops.length; r++) {
    const base = r === 0
    const scale = base ? 1.6 : 1
    const spacing = base ? w * scale * 1.25 : w * 1.02
    const angle = base ? 0 : r % 2 === 1 ? 90 : 0
    const raw = linesAt(box, spacing, angle)
    const pieces = raw.flatMap((poly) => clipPolyline(poly, edges, (p) => set.contains(p))).filter((p) => polyLength(p) >= w)
    const ordered = orderPaths(pieces, pos)
    pos = ordered.end
    const paths: Extrusion[] = ordered.ordered.map((points) => ({ kind: "raft", points, widthScale: scale }))
    layers.push({ index: r, z: tops[r]!, height: heights[r]!, paths })
  }
  return { layers, end: pos }
}
