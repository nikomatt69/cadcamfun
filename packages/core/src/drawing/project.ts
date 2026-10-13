/**
 * Orthographic projection of a closed triangle mesh to the 2D edges of a drawing view, with hidden-line removal.
 *
 *   edgesOf       the edges a drawing is made of: creased edges (dihedral angle over `creaseDegrees`), boundary edges, and every other
 *                 edge between two triangles as a silhouette candidate. THE seam: an exact B-rep kernel replaces this function and
 *                 nothing after it changes.
 *   projectView   for a named view: silhouette edges (a front-facing and a back-facing triangle meet), visibility of every edge
 *                 sampled along its length against the projected triangles (uniform grid), runs merged, ends bisected.
 *
 * View space: x to the right, y up, depth towards the viewer; `right x up = toViewer`. Distances are millimetres.
 */
import { cleanMesh } from "../cad/mesh-clean.ts"
import type { Mesh } from "../cad/solid.ts"
import type { Vec2 } from "../cad/vec.ts"

export interface V3 { readonly x: number; readonly y: number; readonly z: number }

export type ViewName = "front" | "back" | "top" | "bottom" | "right" | "left" | "iso"

export interface ViewFrame { readonly right: V3; readonly up: V3; readonly toViewer: V3 }

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const unit = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l } }

const X: V3 = { x: 1, y: 0, z: 0 }, Y: V3 = { x: 0, y: 1, z: 0 }, Z: V3 = { x: 0, y: 0, z: 1 }
const neg = (a: V3): V3 => ({ x: -a.x, y: -a.y, z: -a.z })

/** The frame of a named view: Z is up in the world; `front` looks along +Y (the viewer stands at -Y). */
export const viewFrame = (name: ViewName): ViewFrame => {
  switch (name) {
    case "front": return { right: X, up: Z, toViewer: neg(Y) }
    case "back": return { right: neg(X), up: Z, toViewer: Y }
    case "top": return { right: X, up: Y, toViewer: Z }
    case "bottom": return { right: X, up: neg(Y), toViewer: neg(Z) }
    case "right": return { right: Y, up: Z, toViewer: X }
    case "left": return { right: neg(Y), up: Z, toViewer: neg(X) }
    case "iso": {
      const toViewer = unit({ x: 1, y: -1, z: 1 })
      const up = unit(sub(Z, { x: toViewer.x * toViewer.z, y: toViewer.y * toViewer.z, z: toViewer.z * toViewer.z }))
      return { right: cross(up, toViewer), up, toViewer }
    }
  }
}

/** A frame with its x axis along the given world direction (for a section: the cut plane's own view). */
export const frameLookingAlong = (toViewer: V3, upHint: V3 = Z): ViewFrame => {
  const t = unit(toViewer)
  const hint = Math.abs(dot(t, upHint)) > 0.999 ? Y : upHint
  const up = unit(sub(hint, { x: t.x * dot(hint, t), y: t.y * dot(hint, t), z: t.z * dot(hint, t) }))
  return { right: cross(up, t), up, toViewer: t }
}

export interface Edge3 {
  readonly a: V3
  readonly b: V3
  /** Normals of the two triangles that share the edge; `n2` is undefined for a boundary edge. */
  readonly n1: V3
  readonly n2: V3 | undefined
  /** `crease` and `boundary` edges are always drawn; `smooth` ones only where they are a silhouette. */
  readonly kind: "crease" | "boundary" | "smooth"
}

export interface EdgeOptions {
  /** Dihedral angle above which an edge is drawn, degrees (default 30). */
  readonly creaseDegrees?: number
}

/** The edges of a mesh for drawing (see the module comment). The mesh is welded first. */
export const edgesOf = (mesh: Mesh, options: EdgeOptions = {}): Edge3[] => {
  const welded = cleanMesh(mesh, { mergeCoplanar: false })
  const p = welded.positions, ix = welded.indices
  const cosCrease = Math.cos(((options.creaseDegrees ?? 30) * Math.PI) / 180)
  const count = Math.floor(ix.length / 3)
  const vert = (i: number): V3 => ({ x: p[i * 3]!, y: p[i * 3 + 1]!, z: p[i * 3 + 2]! })
  const normals: Array<V3 | undefined> = []
  for (let t = 0; t < count; t++) {
    const a = vert(ix[t * 3]!), b = vert(ix[t * 3 + 1]!), c = vert(ix[t * 3 + 2]!)
    const n = cross(sub(b, a), sub(c, a))
    const l = Math.hypot(n.x, n.y, n.z)
    normals.push(l < 1e-18 ? undefined : { x: n.x / l, y: n.y / l, z: n.z / l })
  }
  const key = (a: number, b: number): number => (a < b ? a * 0x4000000 + b : b * 0x4000000 + a)
  const owners = new Map<number, number[]>()
  for (let t = 0; t < count; t++) {
    if (normals[t] === undefined) continue
    for (let k = 0; k < 3; k++) {
      const a = ix[t * 3 + k]!, b = ix[t * 3 + ((k + 1) % 3)]!
      if (a === b) continue
      const kk = key(a, b)
      const list = owners.get(kk)
      if (list === undefined) owners.set(kk, [t]); else list.push(t)
    }
  }
  const out: Edge3[] = []
  for (const [kk, list] of owners) {
    const a = Math.floor(kk / 0x4000000), b = kk - a * 0x4000000
    const n1 = normals[list[0]!]!
    if (list.length === 1) { out.push({ a: vert(a), b: vert(b), n1, n2: undefined, kind: "boundary" }); continue }
    const n2 = normals[list[1]!]!
    const kind = list.length > 2 || dot(n1, n2) < cosCrease ? "crease" : "smooth"
    out.push({ a: vert(a), b: vert(b), n1, n2, kind })
  }
  return out
}

export interface Seg2 { readonly a: Vec2; readonly b: Vec2 }

export interface ProjectedView {
  readonly name: string
  readonly frame: ViewFrame
  readonly visible: ReadonlyArray<Seg2>
  readonly hidden: ReadonlyArray<Seg2>
  /** Extent of every drawn edge (visible and hidden), view coordinates. */
  readonly bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
  /** The projected origin of the world: the offset to turn a world point into this view's coordinates is `toView`. */
  readonly toView: (p: V3) => Vec2
}

export interface ProjectOptions extends EdgeOptions {
  /** Draw hidden edges too (default true). */
  readonly hidden?: boolean
  /** Edges already extracted by `edgesOf` (so several views of one body weld it once). */
  readonly edges?: ReadonlyArray<Edge3>
}

/** A uniform grid over the projected triangles for the occlusion query. */
interface Grid {
  readonly x0: number; readonly y0: number; readonly cell: number; readonly nx: number; readonly ny: number
  readonly start: Int32Array; readonly items: Int32Array
}

const buildGrid = (tri: Float64Array, count: number): Grid => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let t = 0; t < count; t++) for (let k = 0; k < 3; k++) {
    const x = tri[t * 9 + k * 3]!, y = tri[t * 9 + k * 3 + 1]!
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  const w = Math.max(x1 - x0, 1e-9), h = Math.max(y1 - y0, 1e-9)
  const side = Math.max(1, Math.min(256, Math.ceil(Math.sqrt(count))))
  const cell = Math.max(w, h) / side
  const nx = Math.max(1, Math.ceil(w / cell)), ny = Math.max(1, Math.ceil(h / cell))
  const counts = new Int32Array(nx * ny + 1)
  const range = (t: number): [number, number, number, number] => {
    let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity
    for (let k = 0; k < 3; k++) { const x = tri[t * 9 + k * 3]!, y = tri[t * 9 + k * 3 + 1]!; ax = Math.min(ax, x); bx = Math.max(bx, x); ay = Math.min(ay, y); by = Math.max(by, y) }
    return [Math.max(0, Math.floor((ax - x0) / cell)), Math.min(nx - 1, Math.floor((bx - x0) / cell)), Math.max(0, Math.floor((ay - y0) / cell)), Math.min(ny - 1, Math.floor((by - y0) / cell))]
  }
  for (let t = 0; t < count; t++) { const [i0, i1, j0, j1] = range(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) counts[j * nx + i + 1]!++ }
  for (let c = 0; c < nx * ny; c++) counts[c + 1]! += counts[c]!
  const fill = counts.slice(0, nx * ny)
  const items = new Int32Array(counts[nx * ny]!)
  for (let t = 0; t < count; t++) { const [i0, i1, j0, j1] = range(t); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) items[fill[j * nx + i]!++] = t }
  return { x0, y0, cell, nx, ny, start: counts, items }
}

/** The 3D vertices of the mesh, as a flat list of the triangles in view space: (x, y, depth) per corner. */
const projectTriangles = (mesh: Mesh, frame: ViewFrame): { tri: Float64Array; count: number } => {
  const p = mesh.positions, ix = mesh.indices
  const count = Math.floor(ix.length / 3)
  const tri = new Float64Array(count * 9)
  for (let t = 0; t < count; t++) for (let k = 0; k < 3; k++) {
    const i = ix[t * 3 + k]! * 3
    const v = { x: p[i]!, y: p[i + 1]!, z: p[i + 2]! }
    tri[t * 9 + k * 3] = dot(v, frame.right); tri[t * 9 + k * 3 + 1] = dot(v, frame.up); tri[t * 9 + k * 3 + 2] = dot(v, frame.toViewer)
  }
  return { tri, count }
}

/** Projects the edges of `mesh` into the view `name` (or the explicit `frame`), see the module comment. */
export const projectView = (mesh: Mesh, view: ViewName | ViewFrame, options: ProjectOptions = {}): ProjectedView => {
  const frame = typeof view === "string" ? viewFrame(view) : view
  const name = typeof view === "string" ? view : "custom"
  const edges = options.edges ?? edgesOf(mesh, options)
  const welded = cleanMesh(mesh, { mergeCoplanar: false })
  const { tri, count } = projectTriangles(welded, frame)
  const grid = count > 0 ? buildGrid(tri, count) : undefined
  let extent = 0
  for (const v of welded.positions) extent = Math.max(extent, Math.abs(v))
  extent = Math.max(extent, 1e-6)
  const depthBias = 1e-5 * extent + 1e-7
  const inside = 1e-9 * extent

  const toView = (p: V3): Vec2 => ({ x: dot(p, frame.right), y: dot(p, frame.up) })
  const depthOf = (p: V3): number => dot(p, frame.toViewer)

  /** Whether the point (view x, y at the given depth) has a triangle between it and the viewer. */
  const occluded = (x: number, y: number, depth: number): boolean => {
    if (grid === undefined) return false
    const i = Math.floor((x - grid.x0) / grid.cell), j = Math.floor((y - grid.y0) / grid.cell)
    if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) return false
    const c = j * grid.nx + i
    for (let s = grid.start[c]!; s < grid.start[c + 1]!; s++) {
      const t = grid.items[s]!, o = t * 9
      const ax = tri[o]!, ay = tri[o + 1]!, az = tri[o + 2]!, bx = tri[o + 3]!, by = tri[o + 4]!, bz = tri[o + 5]!, cx = tri[o + 6]!, cy = tri[o + 7]!, cz = tri[o + 8]!
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
      if (Math.abs(d) < 1e-18) continue
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d
      const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d
      const l3 = 1 - l1 - l2
      const e = inside / Math.sqrt(Math.abs(d))
      if (l1 < -e || l2 < -e || l3 < -e) continue
      if (l1 * az + l2 * bz + l3 * cz > depth + depthBias) return true
    }
    return false
  }

  const visible: Seg2[] = [], hidden: Seg2[] = []
  const wantHidden = options.hidden !== false
  const t = frame.toViewer
  for (const e of edges) {
    if (e.kind === "smooth") {
      // Only a silhouette: the two faces look different ways at the viewer.
      const d1 = dot(e.n1, t), d2 = e.n2 === undefined ? 0 : dot(e.n2, t)
      if (!((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9))) continue
    }
    const pa = toView(e.a), pb = toView(e.b)
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y)
    if (len < 1e-9) continue
    const da = depthOf(e.a), db = depthOf(e.b)
    const at = (u: number) => ({ x: pa.x + (pb.x - pa.x) * u, y: pa.y + (pb.y - pa.y) * u, depth: da + (db - da) * u })
    const hiddenAt = (u: number): boolean => { const q = at(u); return occluded(q.x, q.y, q.depth) }
    const n = Math.max(2, Math.min(160, Math.ceil(len / (extent / 160))))
    let prevU = 0, prev = hiddenAt(0)
    let runStart = 0
    const emit = (u0: number, u1: number, isHidden: boolean): void => {
      if (u1 - u0 < 1e-9) return
      const seg = { a: { x: pa.x + (pb.x - pa.x) * u0, y: pa.y + (pb.y - pa.y) * u0 }, b: { x: pa.x + (pb.x - pa.x) * u1, y: pa.y + (pb.y - pa.y) * u1 } }
      if (isHidden) { if (wantHidden) hidden.push(seg) } else visible.push(seg)
    }
    for (let k = 1; k <= n; k++) {
      const u = k / n
      const h = hiddenAt(u)
      if (h !== prev) {
        // Bisect the change between the two samples.
        let lo = prevU, hi = u
        for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (hiddenAt(mid) === prev) lo = mid; else hi = mid }
        const cut = (lo + hi) / 2
        emit(runStart, cut, prev)
        runStart = cut; prev = h
      }
      prevU = u
    }
    emit(runStart, 1, prev)
  }
  const all = [...visible, ...hidden]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of all) for (const q of [s.a, s.b]) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y) }
  if (all.length === 0) { minX = minY = maxX = maxY = 0 }
  return { name, frame, visible: mergeCollinear(visible), hidden: mergeCollinear(subtractCovered(hidden, visible)), bounds: { minX, minY, maxX, maxY }, toView }
}

/** Joins segments that continue each other on one line (the many pieces a mesh edge is cut into). */
export const mergeCollinear = (segs: ReadonlyArray<Seg2>): Seg2[] => {
  const tol = 1e-7
  const groups = new Map<string, Array<{ s: number; e: number; ox: number; oy: number; dx: number; dy: number }>>()
  for (const g of segs) {
    let dx = g.b.x - g.a.x, dy = g.b.y - g.a.y
    const l = Math.hypot(dx, dy)
    if (l < 1e-12) continue
    dx /= l; dy /= l
    if (dx < -1e-12 || (Math.abs(dx) <= 1e-12 && dy < 0)) { dx = -dx; dy = -dy }
    // Signed distance of the line from the origin and its direction (rounded) key one line.
    const off = -dy * g.a.x + dx * g.a.y
    const k = `${Math.round(Math.atan2(dy, dx) * 1e6)}|${Math.round(off * 1e4)}`
    const s = g.a.x * dx + g.a.y * dy, e = g.b.x * dx + g.b.y * dy
    const list = groups.get(k) ?? []
    list.push({ s: Math.min(s, e), e: Math.max(s, e), ox: g.a.x - s * dx, oy: g.a.y - s * dy, dx, dy })
    groups.set(k, list)
  }
  const out: Seg2[] = []
  for (const list of groups.values()) {
    list.sort((p, q) => p.s - q.s)
    let cur = { ...list[0]! }
    const flush = (c: typeof cur) => out.push({ a: { x: c.ox + c.s * c.dx, y: c.oy + c.s * c.dy }, b: { x: c.ox + c.e * c.dx, y: c.oy + c.e * c.dy } })
    for (const next of list.slice(1)) {
      if (next.s <= cur.e + tol) cur.e = Math.max(cur.e, next.e)
      else { flush(cur); cur = { ...next } }
    }
    flush(cur)
  }
  return out
}

/** The parts of `hidden` that no segment of `covering` lies over (hidden edges behind a drawn visible edge are not drawn twice). */
export const subtractCovered = (hidden: ReadonlyArray<Seg2>, covering: ReadonlyArray<Seg2>): Seg2[] => {
  const out: Seg2[] = []
  const tol = 1e-6
  for (const h of hidden) {
    const dx = h.b.x - h.a.x, dy = h.b.y - h.a.y
    const l = Math.hypot(dx, dy)
    if (l < 1e-12) continue
    const ux = dx / l, uy = dy / l
    const cuts: Array<[number, number]> = []
    for (const c of covering) {
      const ca = (c.a.x - h.a.x) * -uy + (c.a.y - h.a.y) * ux, cb = (c.b.x - h.a.x) * -uy + (c.b.y - h.a.y) * ux
      if (Math.abs(ca) > tol || Math.abs(cb) > tol) continue
      const s0 = (c.a.x - h.a.x) * ux + (c.a.y - h.a.y) * uy, s1 = (c.b.x - h.a.x) * ux + (c.b.y - h.a.y) * uy
      cuts.push([Math.min(s0, s1), Math.max(s0, s1)])
    }
    cuts.sort((p, q) => p[0] - q[0])
    let at = 0
    const piece = (s0: number, s1: number) => { if (s1 - s0 > tol) out.push({ a: { x: h.a.x + ux * s0, y: h.a.y + uy * s0 }, b: { x: h.a.x + ux * s1, y: h.a.y + uy * s1 } }) }
    for (const [s0, s1] of cuts) { if (s0 > at) piece(at, Math.min(s0, l)); at = Math.max(at, s1) }
    if (at < l) piece(at, l)
  }
  return out
}
