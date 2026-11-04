/**
 * Drawing view kinds beyond the principal views (spec 72 P4-2), built on `drawing/project.ts`:
 *
 *  - `auxiliaryView`: the part seen square-on along any direction (the normal of an inclined face), so the face shows true size.
 *  - `halfView`: a symmetric part drawn on one side of its axis of symmetry only, with the symmetry (centre) line marked.
 *  - `brokenView`: a long part with a uniform middle cut out and the two ends drawn closer, with break lines; the removed length is
 *    reported so dimensions keep the true value (`trueCoordinate`).
 *
 * All outputs are 2D segment lists in view coordinates (mm), the same `Seg2` the SVG/PDF writers already take.
 */
import { frameLookingAlong, projectView, type ProjectedView, type ProjectOptions, type Seg2, type V3 } from "../../drawing/project.ts"
import type { Mesh } from "../solid.ts"
import type { Vec2 } from "../vec.ts"

export type ViewAxis = "x" | "y"

export interface AuxiliaryView {
  readonly view: ProjectedView
  /** Direction the projection lines run in on a parent view that is given a `parent` frame (direction of the viewing normal as seen there). */
  readonly direction: V3
}

/** The part seen along `normal` (towards the viewer). `normal` must be non-zero. */
export const auxiliaryView = (mesh: Mesh, normal: V3, options: ProjectOptions = {}): AuxiliaryView => {
  if (!(Math.hypot(normal.x, normal.y, normal.z) > 1e-12)) throw new RangeError("An auxiliary view needs a non-zero viewing direction")
  const frame = frameLookingAlong(normal)
  return { view: projectView(mesh, frame, options), direction: frame.toViewer }
}

const coord = (p: Vec2, axis: ViewAxis): number => (axis === "x" ? p.x : p.y)
const cross = (p: Vec2, axis: ViewAxis): number => (axis === "x" ? p.y : p.x)
const make = (axis: ViewAxis, a: number, ca: number): Vec2 => (axis === "x" ? { x: a, y: ca } : { x: ca, y: a })
const point = (s: Seg2, t: number): Vec2 => ({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t })

/** The parts of a segment with `coordinate(axis)` within [lo, hi]. */
const clipBand = (s: Seg2, axis: ViewAxis, lo: number, hi: number): Seg2[] => {
  const a = coord(s.a, axis), b = coord(s.b, axis)
  if (Math.abs(b - a) < 1e-12) return a >= lo - 1e-9 && a <= hi + 1e-9 ? [s] : []
  const t0 = Math.max(0, Math.min((lo - a) / (b - a), (hi - a) / (b - a)))
  const t1 = Math.min(1, Math.max((lo - a) / (b - a), (hi - a) / (b - a)))
  return t1 - t0 < 1e-9 ? [] : [{ a: point(s, t0), b: point(s, t1) }]
}

export interface HalfView {
  readonly visible: ReadonlyArray<Seg2>
  readonly hidden: ReadonlyArray<Seg2>
  /** The symmetry line with its short end marks, drawn as a centre line. */
  readonly centreLine: Seg2
  /** The two short marks (a pair of parallel strokes) that tell the reader the other half is not drawn. */
  readonly symmetryMarks: ReadonlyArray<Seg2>
}

/** Keeps the half of a view on one side of the line `axis = at` (`axis: "x"` is a vertical line). */
export const halfView = (view: { readonly visible: ReadonlyArray<Seg2>; readonly hidden: ReadonlyArray<Seg2>; readonly bounds: ProjectedView["bounds"] }, axis: ViewAxis, at: number, keep: "low" | "high", markLength = 3): HalfView => {
  const lo = keep === "low" ? -Infinity : at, hi = keep === "low" ? at : Infinity
  const take = (list: ReadonlyArray<Seg2>): Seg2[] => list.flatMap((s) => clipBand(s, axis, lo, hi))
  const b = view.bounds
  const c0 = axis === "x" ? b.minY : b.minX, c1 = axis === "x" ? b.maxY : b.maxX
  const over = markLength
  const centreLine = { a: make(axis, at, c0 - over), b: make(axis, at, c1 + over) }
  const mark = (cc: number): Seg2[] => {
    const d = markLength / 2
    return [{ a: make(axis, at - d, cc), b: make(axis, at - d, cc + (cc < (c0 + c1) / 2 ? -1 : 1) * markLength / 2) }, { a: make(axis, at + d, cc), b: make(axis, at + d, cc + (cc < (c0 + c1) / 2 ? -1 : 1) * markLength / 2) }]
  }
  return { visible: take(view.visible), hidden: take(view.hidden), centreLine, symmetryMarks: [...mark(c0), ...mark(c1)] }
}

export interface BrokenView {
  readonly visible: ReadonlyArray<Seg2>
  readonly hidden: ReadonlyArray<Seg2>
  /** Zig-zag break lines at the two cut edges. */
  readonly breakLines: ReadonlyArray<Seg2>
  /** Length taken out, mm: a dimension across the break reads `drawn + removed`. */
  readonly removed: number
  /** Real model coordinate of a drawn coordinate on the break axis (`undefined` inside the gap, where there is no model). */
  readonly trueCoordinate: (drawn: number) => number | undefined
}

/**
 * Removes the band `axis in [from, to]` from a view and closes it up leaving `gap` mm. Edges in the band vanish, edges across it
 * are cut at its borders, everything beyond is shifted by `to - from - gap`.
 */
export const brokenView = (view: { readonly visible: ReadonlyArray<Seg2>; readonly hidden: ReadonlyArray<Seg2>; readonly bounds: ProjectedView["bounds"] }, axis: ViewAxis, from: number, to: number, gap = 4): BrokenView => {
  if (!(to > from)) throw new RangeError("A broken view needs from < to")
  if (gap < 0 || gap >= to - from) throw new RangeError("The gap must be smaller than the removed band")
  const b = view.bounds
  const lo = axis === "x" ? b.minX : b.minY, hi = axis === "x" ? b.maxX : b.maxY
  if (from <= lo || to >= hi) throw new RangeError("The band must lie inside the view so both ends remain")
  const removed = to - from - gap
  const shift = (p: Vec2): Vec2 => (coord(p, axis) >= to - 1e-9 ? make(axis, coord(p, axis) - removed, cross(p, axis)) : p)
  const take = (list: ReadonlyArray<Seg2>): Seg2[] => list.flatMap((s) => [...clipBand(s, axis, -Infinity, from), ...clipBand(s, axis, to, Infinity)].map((c) => ({ a: shift(c.a), b: shift(c.b) })))
  const c0 = axis === "x" ? b.minY : b.minX, c1 = axis === "x" ? b.maxY : b.maxX
  const zig = (at: number): Seg2[] => {
    const n = 8, amp = Math.max(0.5, (c1 - c0) / 40)
    const out: Seg2[] = []
    for (let i = 0; i < n; i++) {
      const t0 = c0 + ((c1 - c0) * i) / n, t1 = c0 + ((c1 - c0) * (i + 1)) / n
      out.push({ a: make(axis, at + (i % 2 === 0 ? -amp : amp), t0), b: make(axis, at + (i % 2 === 0 ? amp : -amp), t1) })
    }
    return out
  }
  return {
    visible: take(view.visible), hidden: take(view.hidden),
    breakLines: [...zig(from), ...zig(from + gap)], removed,
    trueCoordinate: (d) => (d <= from + 1e-9 ? d : d >= from + gap - 1e-9 ? d + removed : undefined)
  }
}
