/**
 * Triangulation of planar polygons, with holes: ear clipping on a linked ring, holes joined to the outer ring by bridges, and a
 * z-order curve over the vertices so that the ear test looks only at the vertices near the ear (the algorithm of Mapbox's earcut,
 * written for this core). Close to n log n on the profiles a CAD produces; the previous scan was cubic and stalled on a face of a
 * thousand vertices (a plate with forty holes).
 *
 * Vertices that lie on an edge of the ring (collinear) are kept as long as the ring can be cut without them, so a cap keeps the
 * vertices its side walls share and the solid stays watertight. Only when no ear is left are duplicate and collinear vertices
 * dropped, then local self-intersections cured, then the ring split along a valid diagonal: the same escalation as earcut. The result
 * is never trusted blindly: `triangulateRing` checks that the triangles cover the ring's area and throws otherwise.
 */
import type { Vec2 } from "./vec.ts"
import { signedArea } from "./shapes.ts"

class TNode {
  prev: TNode = this
  next: TNode = this
  z = 0
  prevZ: TNode | undefined = undefined
  nextZ: TNode | undefined = undefined
  steiner = false
  constructor(readonly i: number, readonly x: number, readonly y: number) {}
}

/** Twice the signed area of (p, q, r), negative when the turn p -> q -> r is to the left (counter-clockwise). */
const area = (p: TNode, q: TNode, r: TNode): number => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
const equals = (a: TNode, b: TNode): boolean => a.x === b.x && a.y === b.y
const pointInTriangle = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean =>
  (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py)

const insertNode = (i: number, x: number, y: number, last: TNode | undefined): TNode => {
  const p = new TNode(i, x, y)
  if (last !== undefined) { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p }
  return p
}

const removeNode = (p: TNode): void => {
  p.next.prev = p.prev
  p.prev.next = p.next
  if (p.prevZ !== undefined) p.prevZ.nextZ = p.nextZ
  if (p.nextZ !== undefined) p.nextZ.prevZ = p.prevZ
}

/** A ring as a circular list, counter-clockwise when `ccw`, clockwise otherwise; `offset` is the index of its first point. */
const linkedList = (ring: ReadonlyArray<Vec2>, offset: number, ccw: boolean): TNode | undefined => {
  let last: TNode | undefined
  const forward = (signedArea(ring) > 0) === ccw
  if (forward) for (let k = 0; k < ring.length; k++) last = insertNode(offset + k, ring[k]!.x, ring[k]!.y, last)
  else for (let k = ring.length - 1; k >= 0; k--) last = insertNode(offset + k, ring[k]!.x, ring[k]!.y, last)
  if (last !== undefined && equals(last, last.next)) { removeNode(last); last = last.next }
  return last
}

/** Removes duplicate and collinear vertices between `start` and `end` (the whole ring when they meet). */
const filterPoints = (start: TNode, end: TNode = start): TNode => {
  let p = start, again: boolean
  do {
    again = false
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p)
      p = end = p.prev
      if (p === p.next) break
      again = true
    } else p = p.next
  } while (again || p !== end)
  return end
}

// ---------------------------------------------------------------- z-order

const zOrder = (x0: number, y0: number, minX: number, minY: number, invSize: number): number => {
  let x = ((x0 - minX) * invSize) | 0, y = ((y0 - minY) * invSize) | 0
  x = (x | (x << 8)) & 0x00ff00ff; x = (x | (x << 4)) & 0x0f0f0f0f; x = (x | (x << 2)) & 0x33333333; x = (x | (x << 1)) & 0x55555555
  y = (y | (y << 8)) & 0x00ff00ff; y = (y | (y << 4)) & 0x0f0f0f0f; y = (y | (y << 2)) & 0x33333333; y = (y | (y << 1)) & 0x55555555
  return x | (y << 1)
}

/** Simon Tatham's merge sort of the z-list. */
const sortLinked = (head: TNode): void => {
  let list: TNode | undefined = head, inSize = 1, numMerges: number
  do {
    let p: TNode | undefined = list, tail: TNode | undefined
    list = undefined
    numMerges = 0
    while (p !== undefined) {
      numMerges++
      let q: TNode | undefined = p, pSize = 0
      for (let i = 0; i < inSize; i++) { pSize++; q = q.nextZ; if (q === undefined) break }
      let qSize = inSize
      while (pSize > 0 || (qSize > 0 && q !== undefined)) {
        let e: TNode
        if (pSize !== 0 && (qSize === 0 || q === undefined || p!.z <= q.z)) { e = p!; p = p!.nextZ; pSize-- } else { e = q!; q = q!.nextZ; qSize-- }
        if (tail !== undefined) tail.nextZ = e
        else list = e
        e.prevZ = tail
        tail = e
      }
      p = q
    }
    tail!.nextZ = undefined
    inSize *= 2
  } while (numMerges > 1)
}

const indexCurve = (start: TNode, minX: number, minY: number, invSize: number): void => {
  let p = start
  do {
    if (p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize)
    p.prevZ = p.prev
    p.nextZ = p.next
    p = p.next
  } while (p !== start)
  p.prevZ!.nextZ = undefined
  p.prevZ = undefined
  sortLinked(p)
}

// ---------------------------------------------------------------- ears

/** A vertex that blocks the ear (a, b, c): inside it or on its border, reflex, and not one of its corners. */
const blocks = (a: TNode, b: TNode, c: TNode, p: TNode): boolean =>
  p !== a && p !== b && p !== c && !equals(p, a) && !equals(p, b) && !equals(p, c) &&
  pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0

const isEar = (ear: TNode): boolean => {
  const a = ear.prev, b = ear, c = ear.next
  if (area(a, b, c) >= 0) return false
  const x0 = Math.min(a.x, b.x, c.x), y0 = Math.min(a.y, b.y, c.y), x1 = Math.max(a.x, b.x, c.x), y1 = Math.max(a.y, b.y, c.y)
  for (let p = c.next; p !== a; p = p.next) if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && blocks(a, b, c, p)) return false
  return true
}

const isEarHashed = (ear: TNode, minX: number, minY: number, invSize: number): boolean => {
  const a = ear.prev, b = ear, c = ear.next
  if (area(a, b, c) >= 0) return false
  const x0 = Math.min(a.x, b.x, c.x), y0 = Math.min(a.y, b.y, c.y), x1 = Math.max(a.x, b.x, c.x), y1 = Math.max(a.y, b.y, c.y)
  const minZ = zOrder(x0, y0, minX, minY, invSize), maxZ = zOrder(x1, y1, minX, minY, invSize)
  const hit = (p: TNode): boolean => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && blocks(a, b, c, p)
  let p = ear.prevZ, n = ear.nextZ
  while (p !== undefined && p.z >= minZ && n !== undefined && n.z <= maxZ) {
    if (hit(p)) return false
    p = p.prevZ
    if (hit(n)) return false
    n = n.nextZ
  }
  while (p !== undefined && p.z >= minZ) { if (hit(p)) return false; p = p.prevZ }
  while (n !== undefined && n.z <= maxZ) { if (hit(n)) return false; n = n.nextZ }
  return true
}

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0)
const onSegment = (p: TNode, q: TNode, r: TNode): boolean =>
  q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y)
const intersects = (p1: TNode, q1: TNode, p2: TNode, q2: TNode): boolean => {
  const o1 = sign(area(p1, q1, p2)), o2 = sign(area(p1, q1, q2)), o3 = sign(area(p2, q2, p1)), o4 = sign(area(p2, q2, q1))
  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(p1, p2, q1)) return true
  if (o2 === 0 && onSegment(p1, q2, q1)) return true
  if (o3 === 0 && onSegment(p2, p1, q2)) return true
  if (o4 === 0 && onSegment(p2, q1, q2)) return true
  return false
}
const intersectsPolygon = (a: TNode, b: TNode): boolean => {
  let p = a
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true
    p = p.next
  } while (p !== a)
  return false
}
const locallyInside = (a: TNode, b: TNode): boolean =>
  area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0
const middleInside = (a: TNode, b: TNode): boolean => {
  let p = a, inside = false
  const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2
  do {
    if (p.y > py !== p.next.y > py && p.next.y !== p.y && px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x) inside = !inside
    p = p.next
  } while (p !== a)
  return inside
}
const isValidDiagonal = (a: TNode, b: TNode): boolean =>
  a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
  ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0)) ||
    (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0))

/** Joins `a` and `b` by a diagonal: the ring becomes two, `a`'s and the returned one. */
const splitPolygon = (a: TNode, b: TNode): TNode => {
  const a2 = new TNode(a.i, a.x, a.y), b2 = new TNode(b.i, b.x, b.y), an = a.next, bp = b.prev
  a.next = b; b.prev = a
  a2.next = an; an.prev = a2
  b2.next = a2; a2.prev = b2
  bp.next = b2; b2.prev = bp
  return b2
}

type Out = number[]

const cureLocalIntersections = (start0: TNode, out: Out): TNode => {
  let start = start0, p = start
  do {
    const a = p.prev, b = p.next.next
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      out.push(a.i, p.i, b.i)
      removeNode(p)
      removeNode(p.next)
      p = start = b
    }
    p = p.next
  } while (p !== start)
  return filterPoints(p)
}

const splitEarcut = (start: TNode, out: Out, minX: number, minY: number, invSize: number): void => {
  let a = start
  do {
    let b = a.next.next
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c = splitPolygon(a, b)
        a = filterPoints(a, a.next)
        c = filterPoints(c, c.next)
        earcutLinked(a, out, minX, minY, invSize, 0)
        earcutLinked(c, out, minX, minY, invSize, 0)
        return
      }
      b = b.next
    }
    a = a.next
  } while (a !== start)
}

const earcutLinked = (ear0: TNode | undefined, out: Out, minX: number, minY: number, invSize: number, pass: 0 | 1 | 2): void => {
  if (ear0 === undefined) return
  let ear = ear0
  if (pass === 0 && invSize !== 0) indexCurve(ear, minX, minY, invSize)
  let stop = ear
  while (ear.prev !== ear.next) {
    const prev = ear.prev, next = ear.next
    if (invSize !== 0 ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
      out.push(prev.i, ear.i, next.i)
      removeNode(ear)
      ear = next.next
      stop = next.next
      continue
    }
    ear = next
    if (ear === stop) {
      if (pass === 0) earcutLinked(filterPoints(ear), out, minX, minY, invSize, 1)
      else if (pass === 1) earcutLinked(cureLocalIntersections(filterPoints(ear), out), out, minX, minY, invSize, 2)
      else splitEarcut(ear, out, minX, minY, invSize)
      break
    }
  }
}

// ---------------------------------------------------------------- holes

const findHoleBridge = (hole: TNode, outer: TNode): TNode | undefined => {
  let p = outer, qx = -Infinity, m: TNode | undefined
  const hx = hole.x, hy = hole.y
  // The nearest edge to the left of the hole's leftmost point, on a horizontal ray.
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y)
      if (x <= hx && x > qx) {
        qx = x
        m = p.x < p.next.x ? p : p.next
        if (x === hx) return m
      }
    }
    p = p.next
  } while (p !== outer)
  if (m === undefined) return undefined
  // Of the vertices inside the triangle (hole, ray hit, m), the one closest in angle to the ray sees the hole.
  const stop = m, mx = m.x, my = m.y
  let tanMin = Infinity
  p = m
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x)
      if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
        m = p
        tanMin = tan
      }
    }
    p = p.next
  } while (p !== stop)
  return m
}
const sectorContainsSector = (m: TNode, p: TNode): boolean => area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0

const leftmost = (start: TNode): TNode => {
  let p = start, best = start
  do {
    if (p.x < best.x || (p.x === best.x && p.y < best.y)) best = p
    p = p.next
  } while (p !== start)
  return best
}

const eliminateHole = (hole: TNode, outer: TNode): TNode => {
  const bridge = findHoleBridge(hole, outer)
  if (bridge === undefined) return outer
  const reverse = splitPolygon(bridge, hole)
  filterPoints(reverse, reverse.next)
  return filterPoints(bridge, bridge.next)
}

/**
 * Triangles of the polygon `outer` with `holes`, as index triples into the points of `outer` followed by those of each hole in turn.
 * The triangles turn the way `outer` does (counter-clockwise when its signed area is positive); the holes may be given in either
 * orientation. Rings must not repeat their first point. A ring that is not simple is triangulated as well as the fallbacks allow;
 * check the covered area when it matters (`triangulateRing` does).
 */
export const triangulatePolygon = (outer: ReadonlyArray<Vec2>, holes: ReadonlyArray<ReadonlyArray<Vec2>> = []): Array<readonly [number, number, number]> => {
  const out: Out = []
  if (outer.length < 3) return []
  let outerNode = linkedList(outer, 0, true)
  if (outerNode === undefined || outerNode.next === outerNode.prev) return []
  let offset = outer.length
  if (holes.length > 0) {
    const queue: TNode[] = []
    for (const hole of holes) {
      const list = hole.length >= 3 ? linkedList(hole, offset, false) : undefined
      offset += hole.length
      if (list === undefined) continue
      if (list === list.next) list.steiner = true
      queue.push(leftmost(list))
    }
    queue.sort((a, b) => a.x - b.x || a.y - b.y)
    for (const hole of queue) outerNode = eliminateHole(hole, outerNode)
  }
  let invSize = 0, minX = 0, minY = 0
  if (offset > 80) {
    minX = Infinity; minY = Infinity
    let maxX = -Infinity, maxY = -Infinity
    for (const ring of [outer, ...holes]) for (const p of ring) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    const size = Math.max(maxX - minX, maxY - minY)
    invSize = size !== 0 ? 32767 / size : 0
  }
  earcutLinked(outerNode, out, minX, minY, invSize, 0)
  const flip = signedArea(outer) < 0
  const tris: Array<readonly [number, number, number]> = []
  for (let t = 0; t + 2 < out.length; t += 3) tris.push(flip ? [out[t]!, out[t + 2]!, out[t + 1]!] : [out[t]!, out[t + 1]!, out[t + 2]!])
  return tris
}

/** Area covered by `tris` over `points`, unsigned. */
const coveredArea = (points: ReadonlyArray<Vec2>, tris: ReadonlyArray<readonly [number, number, number]>): number => {
  let s = 0
  for (const [a, b, c] of tris) {
    const pa = points[a]!, pb = points[b]!, pc = points[c]!
    s += Math.abs((pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x)) / 2
  }
  return s
}

/** Triangle indices in the input winding for a simple planar ring. Throws when the ring has no area or cannot be covered exactly. */
export const triangulateRing = (points: ReadonlyArray<Vec2>): ReadonlyArray<readonly [number, number, number]> => {
  const area0 = signedArea(points)
  if (points.length < 3 || !Number.isFinite(area0) || area0 === 0) throw new RangeError("Profile must have nonzero finite area")
  const tris = triangulatePolygon(points)
  if (Math.abs(coveredArea(points, tris) - Math.abs(area0)) > 1e-7 * Math.abs(area0) + 1e-12) throw new RangeError("Profile must be a simple triangulable ring")
  return tris
}

/**
 * Like `triangulatePolygon`, checked: the triangles must cover the outer ring's area minus the holes'. Returns `undefined` when they
 * do not (rings that cross each other or themselves), so a caller can fall back to what it had.
 */
export const triangulatePolygonChecked = (outer: ReadonlyArray<Vec2>, holes: ReadonlyArray<ReadonlyArray<Vec2>> = []): Array<readonly [number, number, number]> | undefined => {
  const expected = Math.abs(signedArea(outer)) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0)
  if (!(expected > 0)) return undefined
  const tris = triangulatePolygon(outer, holes)
  const all = holes.length === 0 ? outer : [...outer, ...holes.flat()]
  return Math.abs(coveredArea(all, tris) - expected) <= 1e-7 * Math.abs(signedArea(outer)) + 1e-12 ? tris : undefined
}
