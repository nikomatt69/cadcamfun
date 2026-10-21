/**
 * Thin walls made from a centre line: the outline of a rib (a web standing on a body) and of a sheet-metal profile (a bent strip of
 * constant thickness), both a path thickened to a polygon, plus the flat length of a bent strip.
 *
 *   thickenPath          the region between two offset curves of an open polyline: butt ends, mitred corners
 *   roundCorners         the corners of a polyline replaced by tangent arcs, a radius chosen per corner (a sheet's INSIDE radius is
 *                        the same on every bend, so the radius of the line that is drawn depends on which side the bend turns to)
 *   sheetOutline         the closed cross-section of a bent strip: a drawn line, a thickness, the material to its left, right or both
 *   developedLength      the length of the strip before it was bent (the flat pattern), with a K-factor
 *
 * Everything is 2D; the history extrudes the outline along the sketch normal by the flange width.
 */
import { emptyDrawing, type Drawing, type LineEntity } from "./entities.ts"
import { writeDxf } from "./dxf.ts"
import { offsetPolyline, selfIntersects } from "./offset.ts"
import { signedArea } from "./shapes.ts"
import type { Vec2 } from "./vec.ts"

export type SheetSide = "centre" | "left" | "right"

const dist = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y)

/** The polyline without repeated points. */
const dedupe = (pts: ReadonlyArray<Vec2>): Vec2[] => pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]!) > 1e-9)

/** Offset distances (to the right of the direction of travel, positive) of the two faces of a strip of `thickness` on `side`. */
export const faceOffsets = (thickness: number, side: SheetSide): readonly [number, number] =>
  side === "centre" ? [-thickness / 2, thickness / 2] : side === "right" ? [0, thickness] : [-thickness, 0]

/**
 * The polygon between the polyline offset by `a` and by `b` (distances to the right of the direction of travel, `a < b`), counter-
 * clockwise. Throws a `RangeError` when the path is degenerate or the offset curves cross (a strip thicker than the path's tightest
 * bend allows).
 */
export const thickenPath = (path: ReadonlyArray<Vec2>, a: number, b: number): Vec2[] => {
  const pts = dedupe(path)
  if (pts.length < 2) throw new RangeError("A path needs at least two distinct points")
  if (!(b > a)) throw new RangeError("The strip has no thickness")
  const one = (d: number): Vec2[] => {
    if (Math.abs(d) < 1e-12) return [...pts]
    const out = offsetPolyline(pts, d, false, { mitreLimit: 4 })
    if (out.length !== 1) throw new RangeError("The path is too tight for this thickness: its offset curve breaks up")
    return out[0]!
  }
  const first = one(a), second = one(b)
  // `offsetPolyline` keeps the direction of travel, so the two curves run the same way: out along one, back along the other.
  let ring = [...first, ...[...second].reverse()]
  ring = dedupe(ring)
  if (dist(ring[0]!, ring[ring.length - 1]!) < 1e-9) ring.pop()
  if (ring.length < 3 || selfIntersects(ring)) throw new RangeError("The thickened path crosses itself: the strip is thicker than the path's bends allow")
  return signedArea(ring) < 0 ? ring.reverse() : ring
}

/** Whether the corner at `b` turns to the left (counter-clockwise) going a -> b -> c: +1 left, -1 right, 0 straight. */
const turn = (a: Vec2, b: Vec2, c: Vec2): number => Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x))

/**
 * The polyline with each corner that turns more than 5 degrees replaced by a tangent arc (chord error 0.005 mm). `radiusAt` gives the
 * arc radius for a corner from the way it turns (+1 left, -1 right). Throws a `RangeError` naming the run when two bends need more
 * of a straight run than it has.
 */
export const roundCorners = (path: ReadonlyArray<Vec2>, radiusAt: (turnSign: number) => number): Vec2[] => {
  const pts = dedupe(path)
  const n = pts.length
  if (n < 3) return pts
  interface Corner { readonly setback: number; readonly radius: number; readonly u1: Vec2; readonly u2: Vec2; readonly phi: number }
  const corners = new Map<number, Corner>()
  const unit = (from: Vec2, to: Vec2): Vec2 => { const l = dist(from, to); return { x: (to.x - from.x) / l, y: (to.y - from.y) / l } }
  for (let i = 1; i < n - 1; i++) {
    const u1 = unit(pts[i]!, pts[i - 1]!), u2 = unit(pts[i]!, pts[i + 1]!)
    const phi = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)))
    if (Math.PI - phi < (5 * Math.PI) / 180) continue
    if (phi < 1e-3) throw new RangeError("The path doubles back on itself")
    const radius = radiusAt(turn(pts[i - 1]!, pts[i]!, pts[i + 1]!))
    if (!(radius > 0)) throw new RangeError(`A bend radius must be positive (it is ${radius})`)
    corners.set(i, { setback: radius / Math.tan(phi / 2), radius, u1, u2, phi })
  }
  for (let i = 0; i < n - 1; i++) {
    const need = (corners.get(i)?.setback ?? 0) + (corners.get(i + 1)?.setback ?? 0)
    const run = dist(pts[i]!, pts[i + 1]!)
    if (need > run + 1e-9) throw new RangeError(`The bends need ${need.toFixed(2)} mm of the ${run.toFixed(2)} mm straight run ${i + 1}`)
  }
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const c = corners.get(i)
    if (c === undefined) { out.push(pts[i]!); continue }
    const b = pts[i]!
    const t1 = { x: b.x + c.u1.x * c.setback, y: b.y + c.u1.y * c.setback }, t2 = { x: b.x + c.u2.x * c.setback, y: b.y + c.u2.y * c.setback }
    const bis = { x: c.u1.x + c.u2.x, y: c.u1.y + c.u2.y }
    const bl = Math.hypot(bis.x, bis.y)
    const reach = c.radius / Math.sin(c.phi / 2)
    const centre = { x: b.x + (bis.x / bl) * reach, y: b.y + (bis.y / bl) * reach }
    const a1 = Math.atan2(t1.y - centre.y, t1.x - centre.x)
    let da = Math.atan2(t2.y - centre.y, t2.x - centre.x) - a1
    while (da > Math.PI) da -= 2 * Math.PI
    while (da < -Math.PI) da += 2 * Math.PI
    const step = 2 * Math.acos(Math.max(0, 1 - 0.005 / c.radius))
    const steps = Math.min(96, Math.max(4, Math.ceil(Math.abs(da) / Math.max(step, 1e-3))))
    out.push(t1)
    for (let k = 1; k < steps; k++) { const ang = a1 + (da * k) / steps; out.push({ x: centre.x + c.radius * Math.cos(ang), y: centre.y + c.radius * Math.sin(ang) }) }
    out.push(t2)
  }
  return out
}

/**
 * The cross-section of a bent strip: the drawn `path` thickened to `thickness` on `side` (the side the material lies, looking along the
 * drawn line), its corners bent with the given INSIDE radius (`0` or `undefined` keeps them sharp, mitred). Returns the closed outline.
 */
export const sheetOutline = (path: ReadonlyArray<Vec2>, thickness: number, side: SheetSide, insideRadius = 0): Vec2[] => {
  if (!(thickness > 0)) throw new RangeError(`The sheet thickness must be positive (it is ${thickness})`)
  if (insideRadius < 0) throw new RangeError(`The bend radius cannot be negative (it is ${insideRadius})`)
  const [a, b] = faceOffsets(thickness, side)
  if (insideRadius === 0) return thickenPath(path, a, b)
  // The drawn line sits `reference` from the inside face: a left turn has its inside on the left, a right turn on the right.
  // Offsets are measured to the right, so the left face is at `a` and the right face at `b` (a < b).
  const radiusAt = (turnSign: number): number => insideRadius + (turnSign > 0 ? -a : b)
  return thickenPath(roundCorners(path, radiusAt), a, b)
}

/** One stretch of the flat strip: a straight run or a bend, with where it starts and ends along the developed length. */
export interface DevelopedSegment {
  readonly kind: "flat" | "bend"
  readonly from: number
  readonly to: number
  /** Bends only: the angle turned, radians. */
  readonly angle?: number
}

export interface Developed {
  /** The straight runs between bends, mm. */
  readonly straight: number
  readonly bends: ReadonlyArray<{ readonly angle: number; readonly allowance: number }>
  /** The strip's length before it was bent, mm. */
  readonly length: number
  /** Straight runs and bends in order along the strip. */
  readonly segments: ReadonlyArray<DevelopedSegment>
  /** End notches, measured along the developed length and inset equally from both width edges. */
  readonly reliefs?: ReadonlyArray<{ readonly from: number; readonly to: number; readonly inset: number }>
}

/**
 * The strip's length before bending: the straight runs plus, for each bend of `angle` radians with inside radius `r`, the bend
 * allowance `angle (r + k t)` (k, the K-factor, is where the neutral line lies as a fraction of the thickness, 0.33 to 0.5; steel
 * is usually 0.44). The straight runs are what is left of the drawn line once the tangent length of each bend (round the drawn line's
 * own radius) is taken off both its ends.
 */
export const developedLength = (path: ReadonlyArray<Vec2>, thickness: number, insideRadius: number, side: SheetSide = "centre", kFactor = 0.44): Developed => {
  const pts = dedupe(path)
  const [a, b] = faceOffsets(thickness, side)
  const n = pts.length
  // For each interior corner: the turn angle and the tangent length taken off both neighbouring runs (none for a corner under 5 degrees).
  const corner: Array<{ angle: number; setback: number } | undefined> = pts.map((_, i) => {
    if (i === 0 || i === n - 1) return undefined
    const u1 = { x: pts[i - 1]!.x - pts[i]!.x, y: pts[i - 1]!.y - pts[i]!.y }, u2 = { x: pts[i + 1]!.x - pts[i]!.x, y: pts[i + 1]!.y - pts[i]!.y }
    const phi = Math.acos(Math.max(-1, Math.min(1, (u1.x * u2.x + u1.y * u2.y) / (Math.hypot(u1.x, u1.y) * Math.hypot(u2.x, u2.y)))))
    const angle = Math.PI - phi
    if (angle < (5 * Math.PI) / 180) return undefined
    const reference = insideRadius + (turn(pts[i - 1]!, pts[i]!, pts[i + 1]!) > 0 ? -a : b)
    return { angle, setback: reference * Math.tan(angle / 2) }
  })
  const segments: DevelopedSegment[] = []
  const bends: Array<{ angle: number; allowance: number }> = []
  let at = 0, straight = 0
  for (let i = 0; i + 1 < n; i++) {
    const run = Math.max(0, dist(pts[i]!, pts[i + 1]!) - (corner[i]?.setback ?? 0) - (corner[i + 1]?.setback ?? 0))
    if (run > 0) { segments.push({ kind: "flat", from: at, to: at + run }); at += run; straight += run }
    const next = corner[i + 1]
    if (next !== undefined) {
      const allowance = next.angle * (insideRadius + kFactor * thickness)
      segments.push({ kind: "bend", from: at, to: at + allowance, angle: next.angle })
      bends.push({ angle: next.angle, allowance })
      at += allowance
    }
  }
  return { straight, bends, length: at, segments }
}

/** An edge flange on either exposed width edge of an existing sheet profile. Angle is a signed turn in radians. */
export interface EdgeFlangeSpec {
  readonly end: "start" | "end"
  /** Length from the virtual bend corner to the tip, measured on the drawn reference line, mm. */
  readonly length: number
  readonly angle: number
  /** Rectangular bend-end notches: inset from each width edge and depth back past the bend tangent. */
  readonly relief?: { readonly width: number; readonly depth: number }
}

/** Build the relief cutting profiles and their developed lengths from the original sheet, before adding the flange. */
export const edgeFlangeReliefs = (path: ReadonlyArray<Vec2>, thickness: number, width: number, radius: number, side: SheetSide, flanges: ReadonlyArray<EdgeFlangeSpec>): ReadonlyArray<{ readonly outline: ReadonlyArray<Vec2>; readonly inset: number; readonly flatLength: number; readonly end: "start" | "end" }> => {
  const [a, b] = faceOffsets(thickness, side)
  return flanges.flatMap((flange) => {
    if (flange.relief === undefined) return []
    const { width: inset, depth } = flange.relief
    if (!(inset > 0 && 2 * inset < width && depth > 0) || !Number.isFinite(inset + depth)) throw new RangeError("A bend relief needs positive finite width/depth and must leave flange width")
    if (Math.abs(flange.angle) > Math.PI / 2 + 1e-9) throw new RangeError("Bend-end relief currently supports flange turns up to 90 degrees")
    const oriented = flange.end === "end" ? path : [...path].reverse()
    const p = oriented[oriented.length - 1]!, q = oriented[oriented.length - 2]!, l = dist(p, q)
    const d = { x: (p.x - q.x) / l, y: (p.y - q.y) / l }, n = { x: -d.y, y: d.x }
    const angle = Math.abs(flange.angle), sign = Math.sign(flange.angle) * (flange.end === "end" ? 1 : -1)
    const setback = (radius + (sign > 0 ? -a : b)) * Math.tan(angle / 2)
    if (setback + depth >= l || setback >= flange.length) throw new RangeError("Bend relief or radius consumes a straight run")
    const reach = 2 * (l + flange.length + thickness + radius + depth)
    const point = (u: number, v: number): Vec2 => ({ x: p.x + u * d.x + v * n.x, y: p.y + u * d.y + v * n.y })
    return [{ outline: [point(-setback - depth, -reach), point(reach, -reach), point(reach, reach), point(-setback - depth, reach)], inset, end: flange.end,
      flatLength: flange.length - setback + angle * (radius + 0.44 * thickness) + depth }]
  })
}

/** Extend the existing sheet profile at an exposed edge; the same outline and development functions then include the bend. */
export const withEdgeFlanges = (path: ReadonlyArray<Vec2>, flanges: ReadonlyArray<EdgeFlangeSpec>): Vec2[] => {
  let pts = dedupe(path)
  if (pts.length < 2) throw new RangeError("An edge flange needs an existing sheet profile")
  if (new Set(flanges.map((f) => f.end)).size !== flanges.length) throw new RangeError("Only one edge flange is allowed at each exposed edge")
  for (const flange of flanges) {
    if (!(flange.length > 0) || !Number.isFinite(flange.length)) throw new RangeError("An edge flange needs a finite positive length")
    if (!Number.isFinite(flange.angle) || Math.abs(flange.angle) < 1e-6 || Math.abs(flange.angle) >= Math.PI - 1e-6) throw new RangeError("An edge flange angle must be nonzero and strictly between -pi and pi")
    const oriented = flange.end === "end" ? pts : [...pts].reverse()
    const p = oriented[oriented.length - 1]!, q = oriented[oriented.length - 2]!
    const l = dist(p, q), x = (p.x - q.x) / l, y = (p.y - q.y) / l
    const c = Math.cos(flange.angle), s = Math.sin(flange.angle)
    const tip = { x: p.x + flange.length * (c * x - s * y), y: p.y + flange.length * (s * x + c * y) }
    const extended = [...oriented, tip]
    pts = flange.end === "end" ? extended : extended.reverse()
  }
  return pts
}

/**
 * Where a hem is added to a sheet profile: `end` of the drawn line, `length` of the folded-back flange (measured on the centre line of
 * the strip), `gap` between the two layers (0 closes it), turning to the `fold` side of the direction of travel. A hem is two 90 degree
 * bends, so with a bend radius the gap must be at least twice the inside radius (a teardrop hem), or the bends do not fit.
 */
export interface HemSpec {
  readonly end: "start" | "end"
  readonly length: number
  readonly gap: number
  readonly fold: "left" | "right"
}

/** The drawn line with hems added: each end that has one gets a U-turn (out by `thickness + gap`, then back by `length`). */
export const withHems = (path: ReadonlyArray<Vec2>, thickness: number, hems: ReadonlyArray<HemSpec>): Vec2[] => {
  let pts = dedupe(path)
  if (pts.length < 2) throw new RangeError("A path needs at least two distinct points")
  for (const hem of hems) {
    if (!(hem.length > 0)) throw new RangeError(`A hem needs a positive length (it is ${hem.length})`)
    if (!(hem.gap >= 0)) throw new RangeError(`A hem gap cannot be negative (it is ${hem.gap})`)
    const forward = hem.end === "end"
    const oriented = forward ? pts : [...pts].reverse()
    const p = oriented[oriented.length - 1]!, q = oriented[oriented.length - 2]!
    const l = dist(p, q)
    const d = { x: (p.x - q.x) / l, y: (p.y - q.y) / l }
    // Left of the direction of travel is (-dy, dx).
    const side = hem.fold === "left" ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x }
    const h = thickness + hem.gap
    const turnPoint = { x: p.x + side.x * h, y: p.y + side.y * h }
    const tip = { x: turnPoint.x - d.x * hem.length, y: turnPoint.y - d.y * hem.length }
    const extended = [...oriented, turnPoint, tip]
    pts = forward ? extended : extended.reverse()
  }
  return pts
}

/**
 * The flat pattern as a drawing, ready for a laser or a press brake: the blank outline (developed length x flange width) on layer
 * `CUT`, one bend line across the middle of every bend on layer `BEND`. Millimetres, the blank's lower-left corner at the origin,
 * length along x.
 */
export const flatPatternDrawing = (developed: Developed, width: number, name = "flat pattern"): Drawing => {
  if (!(width > 0)) throw new RangeError(`The flange width must be positive (it is ${width})`)
  const base = emptyDrawing("flat-pattern", name, "mm")
  const layers = [
    { id: "cut", name: "CUT", visible: true, locked: false, color: "#d32f2f" },
    { id: "bend", name: "BEND", visible: true, locked: false, color: "#1e88e5" }
  ]
  let n = 0
  const line = (layerId: string, x0: number, y0: number, x1: number, y1: number): LineEntity => ({
    _tag: "Line", id: `line-${++n}`, layerId, visible: true, locked: false, start: { x: x0, y: y0 }, end: { x: x1, y: y1 }
  })
  const L = developed.length
  const reliefs = developed.reliefs ?? []
  const breaks = [...new Set([0, L, ...reliefs.flatMap((r) => [r.from, r.to])])].sort((a, b) => a - b)
  const insetAt = (x: number) => Math.max(0, ...reliefs.filter((r) => x >= r.from && x <= r.to).map((r) => r.inset))
  const bottom: Vec2[] = []
  for (let i = 0; i + 1 < breaks.length; i++) {
    const from = breaks[i]!, to = breaks[i + 1]!, inset = insetAt((from + to) / 2)
    bottom.push({ x: from, y: inset }, { x: to, y: inset })
  }
  const outline = [...bottom, ...[...bottom].reverse().map((p) => ({ x: p.x, y: width - p.y }))]
  const entities = outline.flatMap((p, i) => { const q = outline[(i + 1) % outline.length]!; return dist(p, q) < 1e-9 ? [] : [line("cut", p.x, p.y, q.x, q.y)] })
  for (const s of developed.segments) if (s.kind === "bend") { const m = (s.from + s.to) / 2, inset = insetAt(m); entities.push(line("bend", m, inset, m, width - inset)) }
  return { ...base, layers, entities }
}

/** The flat pattern as DXF text. */
export const flatPatternDxf = (developed: Developed, width: number, name?: string): string => writeDxf(flatPatternDrawing(developed, width, name))
