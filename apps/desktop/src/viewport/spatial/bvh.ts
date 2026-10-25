/**
 * Triangle BVH for ray picking (spec 06 §viewport, picking).
 *
 * `THREE.Mesh.raycast` tests every triangle of a mesh. That is fine for a bolt and ruinous for a 200 000-triangle housing
 * under a hover that fires once per frame. This is a small bounding volume hierarchy over a triangle soup (an index buffer
 * or an unindexed position buffer), built with a binned surface-area heuristic and traversed nearest-first.
 *
 * It works on plain typed arrays, never touches three.js and allocates nothing per query: results are written into a
 * caller-owned {@link BvhHit}. The triangle test is the one `THREE.Ray.intersectTriangle` uses (same operations in the same
 * order, in float64), so the closest hit and its distance equal the brute-force answer; ties go to the lower triangle index,
 * which is what a stable sort of brute-force hits does. `bvh.test.ts` checks that on random rays.
 *
 * Face-level picking (spec 41) gets the triangle index as `triangle` and does no naming of its own.
 */

export type TriangleSide = "front" | "back" | "double"

/** Where the closest hit goes; reuse one object across queries. */
export interface BvhHit {
  /** Triangle index (`faceIndex` in three.js terms). */
  triangle: number
  /** Ray parameter of the hit: `origin + direction * t`. */
  t: number
}

export const createBvhHit = (): BvhHit => ({ triangle: -1, t: Infinity })

export interface TriangleBvh {
  readonly triangleCount: number
  readonly nodeCount: number
  /** `min.xyz, max.xyz` per node. */
  readonly bounds: Float64Array
  /** Inner node: index of its left child (the right child is the next node). Leaf: offset into `order`. */
  readonly first: Int32Array
  /** Leaf: triangle count. Inner node: 0. */
  readonly count: Int32Array
  /** Triangle indices, grouped by leaf. */
  readonly order: Uint32Array
  /** Deepest level, for the traversal stack. */
  readonly depth: number
}

export interface BuildOptions {
  /** Most triangles in a leaf (default 6). */
  readonly leafSize?: number
}

const BINS = 12
const MAX_DEPTH = 48

/** Vertex indices of triangle `i`, honouring an optional index buffer. */
const vertexOf = (index: ArrayLike<number> | null, triangle: number, corner: number): number => (index ? index[triangle * 3 + corner]! : triangle * 3 + corner)

export const triangleCountOf = (positions: ArrayLike<number>, index: ArrayLike<number> | null): number =>
  Math.floor((index ? index.length : positions.length / 3) / 3)

/** Builds the hierarchy. `positions` is xyz per vertex; `index` is optional (triangles are consecutive vertex triples without it). */
export const buildTriangleBvh = (positions: ArrayLike<number>, index: ArrayLike<number> | null, options: BuildOptions = {}): TriangleBvh => {
  const n = triangleCountOf(positions, index)
  const leafSize = Math.max(1, options.leafSize ?? 6)
  const tb = new Float64Array(n * 6) // per-triangle min.xyz, max.xyz
  const centroid = new Float64Array(n * 3)
  for (let i = 0; i < n; i++) {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (let c = 0; c < 3; c++) {
      const v = vertexOf(index, i, c) * 3
      const x = positions[v]!, y = positions[v + 1]!, z = positions[v + 2]!
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
    }
    tb[i * 6] = minX; tb[i * 6 + 1] = minY; tb[i * 6 + 2] = minZ; tb[i * 6 + 3] = maxX; tb[i * 6 + 4] = maxY; tb[i * 6 + 5] = maxZ
    centroid[i * 3] = (minX + maxX) / 2; centroid[i * 3 + 1] = (minY + maxY) / 2; centroid[i * 3 + 2] = (minZ + maxZ) / 2
  }

  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  const capacity = Math.max(1, 2 * n)
  const bounds = new Float64Array(capacity * 6)
  const first = new Int32Array(capacity)
  const count = new Int32Array(capacity)
  let used = 1
  let deepest = 0

  const binCount = new Int32Array(BINS)
  const binBounds = new Float64Array(BINS * 6)
  const rightArea = new Float64Array(BINS)
  const rightCount = new Int32Array(BINS)

  const area = (b: ArrayLike<number>, o: number): number => {
    const dx = b[o + 3]! - b[o]!, dy = b[o + 4]! - b[o + 1]!, dz = b[o + 5]! - b[o + 2]!
    return dx < 0 ? 0 : 2 * (dx * dy + dy * dz + dz * dx)
  }

  // Work list of [node, start, end, depth]; children are allocated as an adjacent pair.
  const stack: number[] = [0, 0, n, 0]
  if (n === 0) { count[0] = 0; first[0] = 0; bounds.fill(0, 0, 6) }
  while (stack.length > 0) {
    const depth = stack.pop()!, end = stack.pop()!, start = stack.pop()!, node = stack.pop()!
    if (depth > deepest) deepest = depth
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity, cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity
    for (let k = start; k < end; k++) {
      const t = order[k]! * 6, c = order[k]! * 3
      if (tb[t]! < minX) minX = tb[t]!; if (tb[t + 1]! < minY) minY = tb[t + 1]!; if (tb[t + 2]! < minZ) minZ = tb[t + 2]!
      if (tb[t + 3]! > maxX) maxX = tb[t + 3]!; if (tb[t + 4]! > maxY) maxY = tb[t + 4]!; if (tb[t + 5]! > maxZ) maxZ = tb[t + 5]!
      if (centroid[c]! < cMinX) cMinX = centroid[c]!; if (centroid[c]! > cMaxX) cMaxX = centroid[c]!
      if (centroid[c + 1]! < cMinY) cMinY = centroid[c + 1]!; if (centroid[c + 1]! > cMaxY) cMaxY = centroid[c + 1]!
      if (centroid[c + 2]! < cMinZ) cMinZ = centroid[c + 2]!; if (centroid[c + 2]! > cMaxZ) cMaxZ = centroid[c + 2]!
    }
    const o = node * 6
    bounds[o] = minX; bounds[o + 1] = minY; bounds[o + 2] = minZ; bounds[o + 3] = maxX; bounds[o + 4] = maxY; bounds[o + 5] = maxZ
    const size = end - start
    const ex = cMaxX - cMinX, ey = cMaxY - cMinY, ez = cMaxZ - cMinZ
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2
    const extent = axis === 0 ? ex : axis === 1 ? ey : ez
    const lo = axis === 0 ? cMinX : axis === 1 ? cMinY : cMinZ
    if (size <= leafSize || !(extent > 0) || depth >= MAX_DEPTH) {
      first[node] = start; count[node] = size
      continue
    }

    // Binned SAH along the widest centroid axis.
    binCount.fill(0)
    for (let b = 0; b < BINS; b++) { const p = b * 6; binBounds[p] = Infinity; binBounds[p + 1] = Infinity; binBounds[p + 2] = Infinity; binBounds[p + 3] = -Infinity; binBounds[p + 4] = -Infinity; binBounds[p + 5] = -Infinity }
    const binOf = (tri: number): number => {
      const v = centroid[tri * 3 + axis]!
      const b = Math.floor(((v - lo) / extent) * BINS)
      return b >= BINS ? BINS - 1 : b < 0 ? 0 : b
    }
    for (let k = start; k < end; k++) {
      const tri = order[k]!, b = binOf(tri), p = b * 6, t = tri * 6
      binCount[b]!++
      for (let a = 0; a < 3; a++) {
        if (tb[t + a]! < binBounds[p + a]!) binBounds[p + a] = tb[t + a]!
        if (tb[t + 3 + a]! > binBounds[p + 3 + a]!) binBounds[p + 3 + a] = tb[t + 3 + a]!
      }
    }
    // Sweep from the right once, then from the left, to get the cost of every split plane.
    const acc = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
    let accCount = 0
    for (let b = BINS - 1; b > 0; b--) {
      const p = b * 6
      for (let a = 0; a < 3; a++) { if (binBounds[p + a]! < acc[a]!) acc[a] = binBounds[p + a]!; if (binBounds[p + 3 + a]! > acc[3 + a]!) acc[3 + a] = binBounds[p + 3 + a]! }
      accCount += binCount[b]!
      rightArea[b] = accCount > 0 ? area(acc, 0) : 0
      rightCount[b] = accCount
    }
    const left = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
    let leftCount = 0
    let bestCost = Infinity, bestSplit = -1
    for (let b = 0; b < BINS - 1; b++) {
      const p = b * 6
      for (let a = 0; a < 3; a++) { if (binBounds[p + a]! < left[a]!) left[a] = binBounds[p + a]!; if (binBounds[p + 3 + a]! > left[3 + a]!) left[3 + a] = binBounds[p + 3 + a]! }
      leftCount += binCount[b]!
      const rc = rightCount[b + 1]!
      if (leftCount === 0 || rc === 0) continue
      const cost = area(left, 0) * leftCount + rightArea[b + 1]! * rc
      if (cost < bestCost) { bestCost = cost; bestSplit = b }
    }

    let mid = start
    if (bestSplit >= 0) {
      // Partition `order[start, end)` so that bins <= bestSplit come first.
      let i = start, j = end - 1
      while (i <= j) {
        if (binOf(order[i]!) <= bestSplit) i++
        else { const tmp = order[i]!; order[i] = order[j]!; order[j] = tmp; j-- }
      }
      mid = i
    }
    if (mid === start || mid === end) mid = start + (size >> 1) // degenerate: split by count (the order is arbitrary but valid)

    const leftChild = used
    used += 2
    first[node] = leftChild; count[node] = 0
    stack.push(leftChild, start, mid, depth + 1, leftChild + 1, mid, end, depth + 1)
  }

  return {
    triangleCount: n,
    nodeCount: used,
    bounds: bounds.slice(0, used * 6),
    first: first.slice(0, used),
    count: count.slice(0, used),
    order,
    depth: deepest
  }
}

// ---------------------------------------------------------------------------------------------------------- traversal
// One traversal at a time (JavaScript is single threaded and a query never yields), so the stack is shared.
const nodeStack = new Int32Array(MAX_DEPTH * 2 + 8)

/** Slab test; returns the entry distance, or `Infinity` for a miss. `tMax` is the best distance found so far. */
const boxEntry = (b: Float64Array, o: number, ox: number, oy: number, oz: number, ix: number, iy: number, iz: number, tMax: number): number => {
  let t1 = (b[o]! - ox) * ix, t2 = (b[o + 3]! - ox) * ix
  let tmin = t1 < t2 ? t1 : t2, tmax = t1 < t2 ? t2 : t1
  t1 = (b[o + 1]! - oy) * iy; t2 = (b[o + 4]! - oy) * iy
  // NaN (a zero direction component on the slab plane) compares false and leaves the interval alone: conservative.
  if (t1 < t2) { if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2 } else { if (t2 > tmin) tmin = t2; if (t1 < tmax) tmax = t1 }
  t1 = (b[o + 2]! - oz) * iz; t2 = (b[o + 5]! - oz) * iz
  if (t1 < t2) { if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2 } else { if (t2 > tmin) tmin = t2; if (t1 < tmax) tmax = t1 }
  if (tmin < 0) tmin = 0
  // A hair of slack: a ray that grazes a box face must still reach the triangle that lies on it.
  return tmin <= tmax * (1 + 1e-9) + 1e-12 && tmin <= tMax ? tmin : Infinity
}

/**
 * Closest triangle hit by the ray `origin + t * direction`, `t` in `[0, maxT]`. `side` is the material side: a front-only
 * material ignores triangles facing away (three's `FrontSide`), and so on. Returns whether a triangle was hit; the hit goes
 * into `out`. The direction need not be normalised (the distances are in its units).
 */
export const raycastTriangleBvh = (
  bvh: TriangleBvh, positions: ArrayLike<number>, index: ArrayLike<number> | null,
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  maxT: number, side: TriangleSide, out: BvhHit
): boolean => {
  out.triangle = -1; out.t = Infinity
  if (bvh.triangleCount === 0) return false
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz
  const { bounds, first, count, order } = bvh
  let best = maxT, bestTriangle = -1
  let sp = 0
  if (boxEntry(bounds, 0, ox, oy, oz, ix, iy, iz, best) === Infinity) return false
  nodeStack[sp++] = 0
  while (sp > 0) {
    const node = nodeStack[--sp]!
    const c = count[node]!
    if (c > 0) {
      const start = first[node]!
      for (let k = start; k < start + c; k++) {
        const tri = order[k]!
        const t = triangleT(positions, index, tri, ox, oy, oz, dx, dy, dz, side)
        if (t >= 0 && (t < best || (t === best && tri < bestTriangle))) { best = t; bestTriangle = tri }
      }
      continue
    }
    const l = first[node]!, r = l + 1
    const tl = boxEntry(bounds, l * 6, ox, oy, oz, ix, iy, iz, best)
    const tr = boxEntry(bounds, r * 6, ox, oy, oz, ix, iy, iz, best)
    if (tl !== Infinity && tr !== Infinity) {
      // Nearer child last, so it is popped first.
      if (tl <= tr) { nodeStack[sp++] = r; nodeStack[sp++] = l } else { nodeStack[sp++] = l; nodeStack[sp++] = r }
    } else if (tl !== Infinity) nodeStack[sp++] = l
    else if (tr !== Infinity) nodeStack[sp++] = r
  }
  if (bestTriangle < 0) return false
  out.triangle = bestTriangle; out.t = best
  return true
}

/**
 * Ray parameter of the hit on one triangle, or -1. The arithmetic is `THREE.Ray.intersectTriangle`'s, operation for
 * operation, so the answers agree to the last bit.
 */
export const triangleT = (
  positions: ArrayLike<number>, index: ArrayLike<number> | null, tri: number,
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, side: TriangleSide
): number => {
  const ia = vertexOf(index, tri, 0) * 3, ib = vertexOf(index, tri, 1) * 3, ic = vertexOf(index, tri, 2) * 3
  // three.js hands the vertices to the ray as (a, b, c) for front/double and as (c, b, a) for the back side.
  const back = side === "back"
  const a = back ? ic : ia, c = back ? ia : ic
  const ax = positions[a]!, ay = positions[a + 1]!, az = positions[a + 2]!
  const e1x = positions[ib]! - ax, e1y = positions[ib + 1]! - ay, e1z = positions[ib + 2]! - az
  const e2x = positions[c]! - ax, e2y = positions[c + 1]! - ay, e2z = positions[c + 2]! - az
  const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
  let ddn = dx * nx + dy * ny + dz * nz
  let sign: number
  if (ddn > 0) {
    if (side !== "double") return -1 // culled: the ray meets the back of the triangle
    sign = 1
  } else if (ddn < 0) {
    sign = -1
    ddn = -ddn
  } else return -1
  const px = ox - ax, py = oy - ay, pz = oz - az
  // diff x edge2
  const cx = py * e2z - pz * e2y, cy = pz * e2x - px * e2z, cz = px * e2y - py * e2x
  const ddqxe2 = sign * (dx * cx + dy * cy + dz * cz)
  if (ddqxe2 < 0) return -1
  // edge1 x diff
  const fx = e1y * pz - e1z * py, fy = e1z * px - e1x * pz, fz = e1x * py - e1y * px
  const dde1xq = sign * (dx * fx + dy * fy + dz * fz)
  if (dde1xq < 0) return -1
  if (ddqxe2 + dde1xq > ddn) return -1
  const qdn = -sign * (px * nx + py * ny + pz * nz)
  if (qdn < 0) return -1
  return qdn / ddn
}
