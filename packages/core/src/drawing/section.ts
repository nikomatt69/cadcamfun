/**
 * Section views and detail views.
 *
 *   sectionView   a body cut by an axis-aligned plane: the retained half (the side away from the viewer) is a closed, capped mesh made
 *                 by a Boolean, projected like any view; the section loops are the plane's intersection with the original mesh; the
 *                 hatch is a family of parallel lines clipped to the loops by the even-odd rule, so it lies only in the cut material.
 *   detailView    a circular part of a view, enlarged: edges clipped to the circle, then scaled about its centre.
 */
import { booleanMesh } from "../cad/csg.ts"
import { cleanMesh } from "../cad/mesh-clean.ts"
import { meshBounds, meshOf, type Mesh } from "../cad/solid.ts"
import type { Vec2 } from "../cad/vec.ts"
import { edgesOf, projectView, viewFrame, type ProjectedView, type Seg2, type ViewName } from "./project.ts"

export type Axis = "x" | "y" | "z"

export interface SectionSpec {
  /** The axis the cutting plane is square to. */
  readonly axis: Axis
  /** Where the plane cuts along that axis, mm. */
  readonly at: number
  /** The side the viewer stands on: the material on that side is removed (default `+`). */
  readonly from?: "+" | "-"
  /** Hatch line spacing, mm of model (default a fortieth of the body's largest size). */
  readonly spacing?: number
  /** Hatch angle in the view, degrees (default 45). */
  readonly angle?: number
}

export interface SectionView {
  readonly view: ProjectedView
  /** The cut outline in view coordinates: outer loops and holes (even-odd). */
  readonly loops: ReadonlyArray<ReadonlyArray<Vec2>>
  readonly hatch: ReadonlyArray<Seg2>
  /** The view name of the section's frame (`front`, `top`, ...). */
  readonly looking: ViewName
}

const VIEW_OF: Readonly<Record<string, ViewName>> = { "x+": "right", "x-": "left", "y-": "front", "y+": "back", "z+": "top", "z-": "bottom" }
const AXIS_INDEX: Readonly<Record<Axis, number>> = { x: 0, y: 1, z: 2 }

/** The plane's intersection with the triangles of a welded mesh, chained into closed loops of 3D points. */
const crossSection = (mesh: Mesh, axis: Axis, at: number): Array<Array<[number, number, number]>> => {
  const p = mesh.positions, ix = mesh.indices
  const a = AXIS_INDEX[axis]
  let extent = 0
  for (const v of p) extent = Math.max(extent, Math.abs(v))
  const tol = 1e-7 * Math.max(extent, 1)
  const segs: Array<[[number, number, number], [number, number, number]]> = []
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const v = [0, 1, 2].map((k) => [p[ix[t + k]! * 3]!, p[ix[t + k]! * 3 + 1]!, p[ix[t + k]! * 3 + 2]!] as [number, number, number])
    const d = v.map((q) => q[a]! - at)
    // A triangle lying in the plane contributes nothing: its neighbours across the edge give the loop.
    if (d.every((x) => Math.abs(x) <= tol)) continue
    const pts: Array<[number, number, number]> = []
    for (let k = 0; k < 3; k++) {
      const i = k, j = (k + 1) % 3
      const di = d[i]!, dj = d[j]!
      if (Math.abs(di) <= tol) { pts.push(v[i]!); continue }
      if ((di < -tol && dj > tol) || (di > tol && dj < -tol)) {
        const u = di / (di - dj)
        pts.push([v[i]![0] + (v[j]![0] - v[i]![0]) * u, v[i]![1] + (v[j]![1] - v[i]![1]) * u, v[i]![2] + (v[j]![2] - v[i]![2]) * u])
      }
    }
    // Vertices on the plane are listed once per triangle that touches them: keep two distinct points.
    const uniq = pts.filter((q, i) => pts.findIndex((o) => Math.hypot(o[0] - q[0], o[1] - q[1], o[2] - q[2]) <= tol) === i)
    if (uniq.length === 2) segs.push([uniq[0]!, uniq[1]!])
  }
  // Chain by matching end points. Two triangles on either side of an edge in the plane give the same segment: drop duplicates.
  const key = (q: [number, number, number]): string => `${Math.round(q[0] / (tol * 10))},${Math.round(q[1] / (tol * 10))},${Math.round(q[2] / (tol * 10))}`
  const seen = new Set<string>()
  const unique = segs.filter(([s, e]) => {
    const k1 = `${key(s)}|${key(e)}`, k2 = `${key(e)}|${key(s)}`
    if (seen.has(k1) || seen.has(k2)) return false
    seen.add(k1)
    return true
  })
  const ends = new Map<string, number[]>()
  unique.forEach(([s, e], i) => { for (const q of [s, e]) { const k = key(q); const l = ends.get(k); if (l === undefined) ends.set(k, [i]); else l.push(i) } })
  const used = new Set<number>()
  const loops: Array<Array<[number, number, number]>> = []
  for (let i = 0; i < unique.length; i++) {
    if (used.has(i)) continue
    used.add(i)
    const loop = [unique[i]![0], unique[i]![1]]
    const start = key(unique[i]![0])
    let head = key(unique[i]![1])
    for (let guard = 0; guard < unique.length + 2 && head !== start; guard++) {
      const next = (ends.get(head) ?? []).find((s) => !used.has(s))
      if (next === undefined) break
      used.add(next)
      const [s, e] = unique[next]!
      const forward = key(s) === head
      const far = forward ? e : s
      loop.push(far)
      head = key(far)
    }
    if (head === start && loop.length >= 4) { loop.pop(); loops.push(loop) }
  }
  return loops
}

/** Whether a point lies inside the loops by the even-odd rule. */
export const insideLoops = (x: number, y: number, loops: ReadonlyArray<ReadonlyArray<Vec2>>): boolean => {
  let inside = false
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i]!, b = loop[j]!
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
  }
  return inside
}

/** Parallel lines at `angle` degrees every `spacing`, clipped to the loops (even-odd). */
export const hatchLoops = (loops: ReadonlyArray<ReadonlyArray<Vec2>>, spacing: number, angle = 45): Seg2[] => {
  if (!(spacing > 0) || loops.length === 0) return []
  const c = Math.cos((angle * Math.PI) / 180), s = Math.sin((angle * Math.PI) / 180)
  // Rotate so that the hatch lines are horizontal, scan, and rotate back.
  const rot = (q: Vec2): Vec2 => ({ x: q.x * c + q.y * s, y: -q.x * s + q.y * c })
  const back = (q: Vec2): Vec2 => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c })
  const r = loops.map((l) => l.map(rot))
  let lo = Infinity, hi = -Infinity
  for (const l of r) for (const q of l) { lo = Math.min(lo, q.y); hi = Math.max(hi, q.y) }
  const out: Seg2[] = []
  // Offset the scan lines by a hair so that none runs along a horizontal edge of the loops.
  for (let y = Math.ceil(lo / spacing) * spacing + spacing * 1e-3; y < hi; y += spacing) {
    const xs: number[] = []
    for (const l of r) for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const a = l[i]!, b = l[j]!
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1]! - xs[k]! > 1e-9) out.push({ a: back({ x: xs[k]!, y }), b: back({ x: xs[k + 1]!, y }) })
  }
  return out
}

/** The body cut and seen as a section view (see the module comment). Throws a `RangeError` when the plane misses the body. */
export const sectionView = (mesh: Mesh, spec: SectionSpec): SectionView => {
  const welded = cleanMesh(mesh, { mergeCoplanar: false })
  const b = meshBounds(welded)
  const lo = [b.minX, b.minY, b.minZ], hi = [b.maxX, b.maxY, b.maxZ]
  const a = AXIS_INDEX[spec.axis]
  if (!(spec.at > lo[a]! + 1e-9 && spec.at < hi[a]! - 1e-9)) throw new RangeError(`The ${spec.axis} = ${spec.at} plane does not cut the body (it spans ${lo[a]!.toFixed(2)} to ${hi[a]!.toFixed(2)})`)
  const from = spec.from ?? "+"
  const size = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!)
  const pad = size * 0.1 + 1
  // The box that keeps the half away from the viewer.
  const boxLo = [lo[0]! - pad, lo[1]! - pad, lo[2]! - pad], boxSize = [hi[0]! - lo[0]! + 2 * pad, hi[1]! - lo[1]! + 2 * pad, hi[2]! - lo[2]! + 2 * pad]
  if (from === "+") boxSize[a] = spec.at - boxLo[a]!
  else { boxSize[a] = hi[a]! + pad - spec.at; boxLo[a] = spec.at }
  const box = meshOf({ _tag: "Box", origin: { x: boxLo[0]!, y: boxLo[1]!, z: boxLo[2]! }, size: { x: boxSize[0]!, y: boxSize[1]!, z: boxSize[2]! } } as never, 0.01)
  const kept = booleanMesh(welded, box, "intersect")
  const looking = VIEW_OF[`${spec.axis}${from}`]!
  const view = projectView(kept, looking, { hidden: false, edges: edgesOf(kept) })
  const frame = viewFrame(looking)
  const loops3 = crossSection(welded, spec.axis, spec.at)
  const loops = loops3.map((l) => l.map((q) => view.toView({ x: q[0], y: q[1], z: q[2] })))
  const spacing = spec.spacing ?? size / 40
  void frame
  return { view, loops, hatch: hatchLoops(loops, spacing, spec.angle ?? 45), looking }
}

export interface DetailView {
  readonly visible: ReadonlyArray<Seg2>
  readonly hidden: ReadonlyArray<Seg2>
  /** The circle on the parent view and its enlarged copy (centre at the origin of the detail's own coordinates). */
  readonly centre: Vec2
  readonly radius: number
  readonly factor: number
}

/** The part of a segment inside the circle (centre `c`, radius `r`), or undefined. */
const clipToCircle = (s: Seg2, c: Vec2, r: number): Seg2 | undefined => {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y
  const fx = s.a.x - c.x, fy = s.a.y - c.y
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r
  if (A < 1e-18) return C <= 0 ? s : undefined
  const disc = B * B - 4 * A * C
  if (disc <= 0) return undefined
  const q = Math.sqrt(disc)
  const t0 = Math.max(0, (-B - q) / (2 * A)), t1 = Math.min(1, (-B + q) / (2 * A))
  if (t1 - t0 < 1e-9) return undefined
  return { a: { x: s.a.x + dx * t0, y: s.a.y + dy * t0 }, b: { x: s.a.x + dx * t1, y: s.a.y + dy * t1 } }
}

/** A circular detail of a view, `factor` times larger, centred on the origin of its own coordinates. */
export const detailView = (view: { readonly visible: ReadonlyArray<Seg2>; readonly hidden: ReadonlyArray<Seg2> }, centre: Vec2, radius: number, factor: number): DetailView => {
  if (!(radius > 0 && factor > 0)) throw new RangeError("A detail needs a positive radius and enlargement")
  const take = (list: ReadonlyArray<Seg2>): Seg2[] => list.flatMap((s) => {
    const c = clipToCircle(s, centre, radius)
    return c === undefined ? [] : [{ a: { x: (c.a.x - centre.x) * factor, y: (c.a.y - centre.y) * factor }, b: { x: (c.b.x - centre.x) * factor, y: (c.b.y - centre.y) * factor } }]
  })
  return { visible: take(view.visible), hidden: take(view.hidden), centre, radius, factor }
}
