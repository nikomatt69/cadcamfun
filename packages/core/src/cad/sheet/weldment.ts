/**
 * Weldment profiles and cut list (spec 47 W1, W3): closed-form section properties of the standard structural profiles, their outlines
 * as sketch loops, and the cut list of a set of members (grouped by profile, length and end cuts, with mass).
 *
 * Lengths are "long point" lengths: the length of the stock a saw cuts, measured to the longest point of a mitred end. The volume of a
 * member is then `area * (length - w/2 * (tan(miterStart) + tan(miterEnd)))` with `w` the section width across the mitre, because the
 * two ends are cut symmetrically about the axis: a closed mitred frame has exactly the volume `area * centreline perimeter`.
 */
import type { Vec2 } from "../vec.ts"

export type WeldProfile =
  | { readonly kind: "rectTube"; readonly width: number; readonly height: number; readonly wall: number; readonly outerRadius?: number }
  | { readonly kind: "roundTube"; readonly diameter: number; readonly wall: number }
  | { readonly kind: "flatBar"; readonly width: number; readonly thickness: number }
  | { readonly kind: "angle"; readonly legA: number; readonly legB: number; readonly thickness: number }
  | { readonly kind: "channel"; readonly height: number; readonly flange: number; readonly web: number; readonly flangeThickness: number }
  | { readonly kind: "iBeam"; readonly height: number; readonly flange: number; readonly web: number; readonly flangeThickness: number }

const positive = (...v: number[]): void => { if (!v.every((x) => Number.isFinite(x) && x > 0)) throw new RangeError("profile dimensions must be positive") }

/** Section area, mm^2, closed form. The inside corner radius of a rectangular tube is `outerRadius - wall` (at least 0). */
export const profileArea = (p: WeldProfile): number => {
  switch (p.kind) {
    case "rectTube": {
      positive(p.width, p.height, p.wall)
      if (2 * p.wall >= Math.min(p.width, p.height)) throw new RangeError("wall is too thick for the tube")
      const ro = p.outerRadius ?? 0, ri = Math.max(0, ro - p.wall)
      return p.width * p.height - (4 - Math.PI) * ro * ro - ((p.width - 2 * p.wall) * (p.height - 2 * p.wall) - (4 - Math.PI) * ri * ri)
    }
    case "roundTube": positive(p.diameter, p.wall); if (2 * p.wall >= p.diameter) throw new RangeError("wall is too thick for the tube"); return (Math.PI / 4) * (p.diameter ** 2 - (p.diameter - 2 * p.wall) ** 2)
    case "flatBar": positive(p.width, p.thickness); return p.width * p.thickness
    case "angle": positive(p.legA, p.legB, p.thickness); return p.thickness * (p.legA + p.legB - p.thickness)
    case "channel": positive(p.height, p.flange, p.web, p.flangeThickness); return p.height * p.web + 2 * (p.flange - p.web) * p.flangeThickness
    case "iBeam": positive(p.height, p.flange, p.web, p.flangeThickness); return 2 * p.flange * p.flangeThickness + (p.height - 2 * p.flangeThickness) * p.web
  }
}

/** Width of the section across a mitre in its plane (the dimension that sets the long point), mm. */
export const profileWidth = (p: WeldProfile): number =>
  p.kind === "rectTube" ? p.width : p.kind === "roundTube" ? p.diameter : p.kind === "flatBar" ? p.width : p.kind === "angle" ? p.legA : p.flange

export const profileLabel = (p: WeldProfile): string => {
  const n = (x: number): string => String(Math.round(x * 1000) / 1000)
  switch (p.kind) {
    case "rectTube": return `RHS ${n(p.width)}x${n(p.height)}x${n(p.wall)}`
    case "roundTube": return `CHS ${n(p.diameter)}x${n(p.wall)}`
    case "flatBar": return `FB ${n(p.width)}x${n(p.thickness)}`
    case "angle": return `L ${n(p.legA)}x${n(p.legB)}x${n(p.thickness)}`
    case "channel": return `U ${n(p.height)}x${n(p.flange)}x${n(p.web)}x${n(p.flangeThickness)}`
    case "iBeam": return `I ${n(p.height)}x${n(p.flange)}x${n(p.web)}x${n(p.flangeThickness)}`
  }
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, tol: number): Vec2[] => {
  const step = r > tol ? 2 * Math.acos(1 - tol / r) : Math.PI / 2
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step))
  return Array.from({ length: n + 1 }, (_, k) => ({ x: cx + r * Math.cos(a0 + ((a1 - a0) * k) / n), y: cy + r * Math.sin(a0 + ((a1 - a0) * k) / n) }))
}
const roundedRect = (w: number, h: number, r: number, tol: number): Vec2[] => {
  if (r <= 1e-12) return [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }]
  const hx = w / 2 - r, hy = h / 2 - r
  return [...arc(hx, -hy, r, -Math.PI / 2, 0, tol), ...arc(hx, hy, r, 0, Math.PI / 2, tol), ...arc(-hx, hy, r, Math.PI / 2, Math.PI, tol), ...arc(-hx, -hy, r, Math.PI, 1.5 * Math.PI, tol)]
}

/** The outline loops of the section centred on the origin: the outer loop counter-clockwise, a hole clockwise. Arcs within `tolerance` mm. */
export const profileOutline = (p: WeldProfile, tolerance = 0.005): ReadonlyArray<ReadonlyArray<Vec2>> => {
  profileArea(p)
  const cw = (loop: Vec2[]): Vec2[] => [...loop].reverse()
  switch (p.kind) {
    case "rectTube": {
      const ro = p.outerRadius ?? 0
      return [roundedRect(p.width, p.height, ro, tolerance), cw(roundedRect(p.width - 2 * p.wall, p.height - 2 * p.wall, Math.max(0, ro - p.wall), tolerance))]
    }
    case "roundTube": {
      const ring = (r: number): Vec2[] => arc(0, 0, r, 0, 2 * Math.PI, tolerance).slice(0, -1)
      return [ring(p.diameter / 2), cw(ring(p.diameter / 2 - p.wall))]
    }
    case "flatBar": return [roundedRect(p.width, p.thickness, 0, tolerance)]
    case "angle": return [[{ x: 0, y: 0 }, { x: p.legA, y: 0 }, { x: p.legA, y: p.thickness }, { x: p.thickness, y: p.thickness }, { x: p.thickness, y: p.legB }, { x: 0, y: p.legB }]]
    case "channel": {
      const { height: h, flange: b, web: tw, flangeThickness: tf } = p
      return [[{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: tf }, { x: tw, y: tf }, { x: tw, y: h - tf }, { x: b, y: h - tf }, { x: b, y: h }, { x: 0, y: h }]]
    }
    case "iBeam": {
      const { height: h, flange: b, web: tw, flangeThickness: tf } = p
      const x0 = -b / 2, x1 = b / 2, w0 = -tw / 2, w1 = tw / 2
      return [[{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: tf }, { x: w1, y: tf }, { x: w1, y: h - tf }, { x: x1, y: h - tf }, { x: x1, y: h }, { x: x0, y: h }, { x: x0, y: h - tf }, { x: w0, y: h - tf }, { x: w0, y: tf }, { x: x0, y: tf }]]
    }
  }
}

export interface WeldMember {
  readonly id: string
  readonly profile: WeldProfile
  /** Stock length to the long point of the ends, mm. */
  readonly length: number
  /** End cuts, degrees from square (0 = square cut, 45 = mitre of a right-angle corner). */
  readonly miterStart?: number
  readonly miterEnd?: number
}

export interface CutListRow {
  readonly item: number
  readonly profile: string
  readonly length: number
  readonly miterStart: number
  readonly miterEnd: number
  readonly quantity: number
  readonly members: ReadonlyArray<string>
  /** Volume of one member, mm^3. */
  readonly volume: number
  /** Mass of one member, g (when a density is given, g/cm^3). */
  readonly mass?: number
}

export interface CutList { readonly rows: ReadonlyArray<CutListRow>; readonly totalLength: number; readonly totalVolume: number; readonly totalMass?: number }

export const memberVolume = (m: WeldMember): number => {
  const w = profileWidth(m.profile), rad = Math.PI / 180
  const net = m.length - (w / 2) * (Math.tan((m.miterStart ?? 0) * rad) + Math.tan((m.miterEnd ?? 0) * rad))
  if (!(net > 0)) throw new RangeError(`Member '${m.id}': the end cuts consume the whole length`)
  return profileArea(m.profile) * net
}

/** Groups members of one profile, length and pair of end cuts into rows (to 0.01 mm and 0.01 degree), in order of first appearance. */
export const weldmentCutList = (members: ReadonlyArray<WeldMember>, density?: number): CutList => {
  const rows = new Map<string, { profile: string; length: number; ms: number; me: number; members: string[]; volume: number }>()
  for (const m of members) {
    if (!(m.length > 0)) throw new RangeError(`Member '${m.id}' needs a positive length`)
    const ms = m.miterStart ?? 0, me = m.miterEnd ?? 0
    // A member sawn the other way round is the same piece: order the end cuts.
    const [a, b] = ms <= me ? [ms, me] : [me, ms]
    const key = `${profileLabel(m.profile)}|${m.length.toFixed(2)}|${a.toFixed(2)}|${b.toFixed(2)}`
    const row = rows.get(key)
    if (row !== undefined) row.members.push(m.id)
    else rows.set(key, { profile: profileLabel(m.profile), length: m.length, ms: a, me: b, members: [m.id], volume: memberVolume({ ...m, miterStart: a, miterEnd: b }) })
  }
  const list = [...rows.values()].map((r, k): CutListRow => ({
    item: k + 1, profile: r.profile, length: r.length, miterStart: r.ms, miterEnd: r.me, quantity: r.members.length, members: r.members, volume: r.volume,
    ...(density !== undefined ? { mass: (r.volume * density) / 1000 } : {})
  }))
  return {
    rows: list, totalLength: list.reduce((s, r) => s + r.length * r.quantity, 0), totalVolume: list.reduce((s, r) => s + r.volume * r.quantity, 0),
    ...(density !== undefined ? { totalMass: list.reduce((s, r) => s + (r.mass ?? 0) * r.quantity, 0) } : {})
  }
}

/** The four members of a rectangular frame mitred at 45 degrees, from the centreline rectangle `width` x `height` of a rectangular tube. */
export const mitredFrame = (width: number, height: number, profile: Extract<WeldProfile, { kind: "rectTube" }>): WeldMember[] => {
  const w = profile.width
  return [
    { id: "bottom", profile, length: width + w, miterStart: 45, miterEnd: 45 }, { id: "top", profile, length: width + w, miterStart: 45, miterEnd: 45 },
    { id: "left", profile, length: height + w, miterStart: 45, miterEnd: 45 }, { id: "right", profile, length: height + w, miterStart: 45, miterEnd: 45 }
  ]
}
