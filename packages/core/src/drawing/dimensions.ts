/**
 * What a drawing says about a part, read from its feature history rather than guessed from the mesh:
 *
 *   hole groups   every `hole` (with the copies its patterns make) grouped by what is drilled, counted as `N x`, and written as the
 *                 callout a drawing carries: `2 x Ø8.1 ±0.1` / `⌵ 10.0 x 90°` (countersink), `2 x Ø8.0 THRU ALL` / `⌴ Ø13.5 ↧ 8.5`
 *                 (counterbore), `6 x Ø3.3 ↧ 12.0`, `M4 - 6H ↧ 8.0` (cosmetic thread), `G1/2" - 6H ↧ 18.0`
 *   threads       modelled internal `thread` features at a hole, named by `designation` (default `M<d>`)
 *   radii         the corner fillet of an extrusion and `fillet` features, as `R10.0`
 *   circles       circular hole patterns: pitch circle diameter and the angle between copies
 *
 * Tolerances: an explicit `tolerance` {upper, lower}, or an ISO 286 `fit` such as `H7` (deviation from the IT grade, fasteners.ts).
 * Numbers are written with one decimal (`120.0`), the way the reference sheet does.
 */
import { dimensionValue, type Dimension } from "../cad/expr.ts"
import { toleranceGrade } from "../cad/fasteners.ts"
import type { History, RebuildResult } from "../cad/history.ts"
import { meshBounds } from "../cad/solid.ts"
import type { V3 } from "./project.ts"

export type HoleAxis = "x" | "y" | "z"

export interface HoleGroup {
  /** The ids of the features that made these holes (the hole and its patterns). */
  readonly features: ReadonlyArray<string>
  readonly count: number
  readonly kind: "simple" | "counterbore" | "countersink"
  readonly diameter: number
  readonly tolerance: { readonly upper: number; readonly lower: number } | undefined
  readonly depth: number
  readonly through: boolean
  readonly headDiameter: number | undefined
  readonly headDepth: number | undefined
  readonly angle: number | undefined
  readonly thread: { readonly designation: string; readonly depth: number; readonly fit: string } | undefined
  /** The way the hole points: its axis, and `+1` when it enters against `-` (from the +axis face). */
  readonly axis: HoleAxis
  /** Where each hole starts on its entry face, world coordinates. */
  readonly positions: ReadonlyArray<V3>
  /**
   * The points a position chain is dimensioned from: the holes of the group, except that a ring of holes round a centre counts as that
   * centre (the ring's own size is the pitch circle and the angle).
   */
  readonly anchors: ReadonlyArray<V3>
  /** The callout, one string per line. */
  readonly lines: ReadonlyArray<string>
}

export interface RadiusNote { readonly feature: string; readonly radius: number; readonly text: string }
export interface CircleNote {
  readonly feature: string
  readonly count: number
  readonly centre: V3
  /** Diameter of the circle through the hole centres. */
  readonly diameter: number
  readonly angle: number
  readonly axis: HoleAxis
}

export interface DimensionPlan {
  readonly holes: ReadonlyArray<HoleGroup>
  readonly radii: ReadonlyArray<RadiusNote>
  readonly circles: ReadonlyArray<CircleNote>
  /** Bounds of the whole part. */
  readonly bounds: { readonly min: V3; readonly max: V3 }
  /** Things that were left out, said once. */
  readonly notes: ReadonlyArray<string>
}

/** `120.0`, `8.1`, `18.63`: two decimals when the second is not zero, otherwise one. */
export const fmt = (n: number): string => {
  if (Math.abs(n) < 5e-10) return "0.0"
  const s = n.toFixed(2)
  return s.endsWith("0") ? s.slice(0, -1) : s
}

const trimmed = (n: number): string => (Math.abs(n) < 5e-10 ? "0" : String(Number(n.toFixed(3))))

/** `±0.1`, `+0.3/-0`. */
export const toleranceText = (t: { readonly upper: number; readonly lower: number }): string =>
  Math.abs(t.upper + t.lower) < 1e-9 && t.upper > 0 ? ` ±${trimmed(t.upper)}` : ` +${trimmed(t.upper)}/-${trimmed(Math.abs(t.lower))}`

/** The deviation of an `H` fit, from the IT grade of the nominal size: lower 0, upper IT. */
export const fitDeviation = (fit: string, nominal: number): { upper: number; lower: number } | undefined => {
  const m = /^H(5|6|7|8|9|10|11)$/.exec(fit)
  return m === null ? undefined : { upper: toleranceGrade(Number(m[1]) as 5, nominal) / 1000, lower: 0 }
}

/** `M4`, `M8x1`, `G1/2"` as written before `- 6H`. */
const threadLine = (designation: string, fit: string, depth: number): string => `${designation} - ${fit} ↧ ${fmt(depth)}`

const FRAME_AXES: Readonly<Record<string, { u: V3; v: V3; n: V3; axis: HoleAxis }>> = {
  XY: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 }, axis: "z" },
  YZ: { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 }, n: { x: 1, y: 0, z: 0 }, axis: "x" },
  ZX: { u: { x: 0, y: 0, z: 1 }, v: { x: 1, y: 0, z: 0 }, n: { x: 0, y: 1, z: 0 }, axis: "y" }
}

const add = (a: V3, b: V3, s = 1): V3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s })

/** The plan of a drawing from a history and its rebuild (the rebuild gives the resolved parameters and the bodies). */
export const planDimensions = (history: History, result: RebuildResult): DimensionPlan => {
  const values = result.parameters
  const notes: string[] = []
  const num = (d: Dimension | undefined): number | undefined => {
    if (d === undefined) return undefined
    try { return dimensionValue(d, values) } catch { return undefined }
  }
  // The part's bounds.
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const b of result.bodies) {
    const m = meshBounds(b.mesh)
    min.x = Math.min(min.x, m.minX); min.y = Math.min(min.y, m.minY); min.z = Math.min(min.z, m.minZ)
    max.x = Math.max(max.x, m.maxX); max.y = Math.max(max.y, m.maxY); max.z = Math.max(max.z, m.maxZ)
  }

  interface Site { readonly feature: string; readonly group: string; readonly positions: V3[]; readonly anchors: Map<string, V3>; readonly proto: Omit<HoleGroup, "features" | "count" | "positions" | "anchors" | "lines"> }
  const sites = new Map<string, Site>()
  const owner = new Map<string, Site>()
  /** The ids of the features behind each group, and the entry point of each hole feature (a pattern copies that one). */
  const groupFeatures = new Map<string, string[]>()
  const featurePosition = new Map<string, V3>()
  const circles: CircleNote[] = []
  for (const f of history.features) {
    if (f.type === "hole") {
      const frame = FRAME_AXES[f.plane]
      if (frame === undefined) { notes.push(`Hole '${f.id}' lies on a work plane: it is not dimensioned`); continue }
      const offset = num(f.offset) ?? 0, u = num(f.at[0]), v = num(f.at[1]), diameter = num(f.diameter), depth = num(f.depth)
      if (u === undefined || v === undefined || diameter === undefined || depth === undefined) continue
      const kind = f.kind ?? "simple"
      const headDiameter = num(f.headDiameter), headDepth = num(f.headDepth), angle = kind === "countersink" ? (num(f.angle) ?? 90) : undefined
      let tolerance: { upper: number; lower: number } | undefined
      if (f.tolerance !== undefined) { const upper = num(f.tolerance.upper), lower = num(f.tolerance.lower); if (upper !== undefined && lower !== undefined) tolerance = { upper, lower } }
      else if (f.fit !== undefined) {
        tolerance = fitDeviation(f.fit, diameter)
        if (tolerance === undefined) notes.push(`Hole '${f.id}': fit '${f.fit}' is not an H fit, no tolerance written`)
      }
      const thread = f.thread === undefined ? undefined : { designation: f.thread.designation, depth: num(f.thread.depth) ?? depth, fit: f.thread.fit ?? "6H" }
      const start = add(add({ x: 0, y: 0, z: 0 }, frame.n, offset), add(add({ x: 0, y: 0, z: 0 }, frame.u, u), frame.v, v))
      // Through all: the hole's far end reaches the lowest face of the part along its axis (it enters at the +axis side, going -axis).
      const through = start[frame.axis] - depth <= min[frame.axis] + 1e-6
      const group = [kind, diameter, depth, headDiameter, headDepth, angle, thread?.designation, thread?.depth, tolerance?.upper, tolerance?.lower, frame.axis, through].join("|")
      let site = sites.get(group)
      if (site === undefined) {
        site = { feature: f.id, group, positions: [], anchors: new Map(), proto: { kind, diameter, tolerance, depth, through, headDiameter, headDepth, angle, thread, axis: frame.axis } }
        sites.set(group, site)
      }
      site.positions.push(start)
      featurePosition.set(f.id, start)
      site.anchors.set(f.id, start)
      owner.set(f.id, site)
      groupFeatures.set(group, [...(groupFeatures.get(group) ?? []), f.id])
    } else if (f.type === "thread" && f.kind === "internal") {
      const diameter = num(f.diameter), length = num(f.length), pitch = num(f.pitch)
      if (diameter === undefined || length === undefined || pitch === undefined) continue
      const cx = f.at === undefined ? 0 : num(f.at[0]) ?? 0, cy = f.at === undefined ? 0 : num(f.at[1]) ?? 0, z0 = num(f.offset) ?? 0
      // A modelled thread belongs to the hole that starts above it at the same place: the note is added to that hole.
      for (const site of sites.values()) {
        if (site.proto.axis !== "z") continue
        const p = site.positions.find((q) => Math.hypot(q.x - cx, q.y - cy) < 1e-6 && z0 <= q.z + 1e-6 && z0 + length >= q.z - site.proto.depth - 1e-6)
        if (p === undefined || site.proto.thread !== undefined) continue
        const named = f.designation ?? `M${trimmed(diameter)}`
        const upgraded: Site = { ...site, proto: { ...site.proto, thread: { designation: named, depth: p.z - z0 > length ? length : Math.min(length, p.z - z0), fit: "6H" } } }
        sites.set(site.group, upgraded)
        for (const [id, o] of owner) if (o === site) owner.set(id, upgraded)
        break
      }
    } else if (f.type === "pattern") {
      const base = owner.get(f.feature)
      if (base === undefined) continue
      const count = num(f.count)
      if (count === undefined || !Number.isInteger(count) || count < 2) continue
      const first = featurePosition.get(f.feature)
      if (first === undefined) continue
      groupFeatures.set(base.group, [...(groupFeatures.get(base.group) ?? []), f.id])
      if (f.kind === "linear" && f.step !== undefined) {
        const st = f.step.map((d) => num(d)) as number[]
        if (st.some((x) => x === undefined)) continue
        for (let i = 1; i < count; i++) { const q = { x: first.x + st[0]! * i, y: first.y + st[1]! * i, z: first.z + st[2]! * i }; base.positions.push(q); base.anchors.set(`${f.id}#${i}`, q) }
      } else if (f.kind === "grid" && f.step !== undefined && f.stepB !== undefined && f.countB !== undefined) {
        const a = f.step.map((d) => num(d)) as number[], b = f.stepB.map((d) => num(d)) as number[], rows = num(f.countB)
        if (rows === undefined || a.some((x) => x === undefined) || b.some((x) => x === undefined)) continue
        const p = first
        for (let i = 0; i < count; i++) for (let j = 0; j < rows; j++) if (i + j > 0) { const q = { x: p.x + a[0]! * i + b[0]! * j, y: p.y + a[1]! * i + b[1]! * j, z: p.z + a[2]! * i + b[2]! * j }; base.positions.push(q); base.anchors.set(`${f.id}#${i}.${j}`, q) }
      } else if (f.kind === "circular") {
        if (base.proto.axis !== "z") { notes.push(`Circular pattern '${f.id}' of a hole that is not along Z is not dimensioned`); continue }
        const c = (f.centre ?? [0, 0]).map((d) => num(d)) as number[]
        const span = f.span === undefined ? 360 : num(f.span)
        if (c.some((x) => x === undefined) || span === undefined) continue
        const each = span >= 360 - 1e-9 ? span / count : span / (count - 1)
        const p0 = first
        for (let i = 1; i < count; i++) {
          const t = (each * i * Math.PI) / 180
          const dx = p0.x - c[0]!, dy = p0.y - c[1]!
          base.positions.push({ x: c[0]! + dx * Math.cos(t) - dy * Math.sin(t), y: c[1]! + dx * Math.sin(t) + dy * Math.cos(t), z: p0.z })
        }
        // The ring is dimensioned from its centre: the source hole stops being an anchor of its own.
        base.anchors.delete(f.feature)
        base.anchors.set(f.id, { x: c[0]!, y: c[1]!, z: first.z })
        circles.push({ feature: f.id, count, centre: { x: c[0]!, y: c[1]!, z: p0.z }, diameter: 2 * Math.hypot(p0.x - c[0]!, p0.y - c[1]!), angle: each, axis: "z" })
      }
    }
  }
  const holes: HoleGroup[] = [...sites.values()].map((s) => {
    const p = s.proto
    const d = `Ø${fmt(p.diameter)}${p.tolerance === undefined ? "" : toleranceText(p.tolerance)}`
    const n = s.positions.length
    const lead = n > 1 ? `${n} x ` : ""
    const depthText = p.through ? "THRU ALL" : `↧ ${fmt(p.depth)}`
    const lines: string[] = []
    if (p.kind === "countersink") {
      // The countersink callout, as on the reference sheet: the diameter, then the cone (a through hole is not said to be through).
      lines.push(`${lead}${d}${p.through ? "" : ` ${depthText}`}`, `⌵ ${fmt(p.headDiameter ?? 0)} x ${fmt(p.angle ?? 90).replace(/\.0$/, "")}°`)
    } else if (p.kind === "counterbore") {
      lines.push(`${lead}${d} ${depthText}`, `⌴ Ø${fmt(p.headDiameter ?? 0)} ↧ ${fmt(p.headDepth ?? 0)}`)
    } else lines.push(`${lead}${d} ${depthText}`)
    if (p.thread !== undefined) lines.push(threadLine(p.thread.designation, p.thread.fit, p.thread.depth))
    return { ...p, features: groupFeatures.get(s.group) ?? [s.feature], count: n, positions: s.positions, anchors: [...s.anchors.values()], lines }
  })
  // Radii: the corner fillet of an extrusion, and fillet features.
  const radii: RadiusNote[] = []
  for (const f of history.features) {
    if (f.type === "extrude" && f.corner?.style === "fillet") { const r = num(f.corner.size); if (r !== undefined && r > 0) radii.push({ feature: f.id, radius: r, text: `R${fmt(r)}` }) }
    else if (f.type === "fillet" && (f.style ?? "fillet") === "fillet") { const r = num(f.radius); if (r !== undefined && r > 0) radii.push({ feature: f.id, radius: r, text: `R${fmt(r)}` }) }
  }
  if (result.bodies.length === 0) notes.push("The history builds no body: nothing to dimension")
  return { holes, radii, circles, bounds: { min: result.bodies.length === 0 ? { x: 0, y: 0, z: 0 } : min, max: result.bodies.length === 0 ? { x: 0, y: 0, z: 0 } : max }, notes }
}
