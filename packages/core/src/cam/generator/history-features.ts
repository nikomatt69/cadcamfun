/**
 * The machining features of a parametric part, read from its feature history (`cad/history.ts`) instead of guessed from a
 * bounding box: the holes (with the copies patterns and mirrors make, their kind and their counterbore), the regions the
 * subtracting extrusions open from above (pockets, slots, keyways), the outlines of the material the adding extrusions build,
 * and the profile a revolution turns.
 *
 * One derivation for every operation of the generator, so drilling, contouring, pocketing, thread milling and turning see the
 * same part the kernel built and DFM checked (`cad/dfm.ts` `holeSites` is the shared source of the hole positions).
 * Everything is in the element's world coordinates: the history's own frame moved by the element's `x`, `y`, `z`. A part
 * that is also rotated or scaled in the editor has no feature derivation here; the caller says so and offers the surface path.
 */
import { Schema } from "effect"
import { holeSites } from "../../cad/dfm.ts"
import { dimensionValue, type Dimension } from "../../cad/expr.ts"
import { rebuild, type History, type HoleFeature, type PlaneName } from "../../cad/history.ts"
import { activeHistory } from "../../cad/history-timeline.ts"
import { treatCorners } from "../../cad/profile-shape.ts"
import { signedArea } from "../../cad/shapes.ts"
import { sketchProfiles } from "../../cad/sketch.ts"
import { meshBounds } from "../../cad/solid.ts"
import { METRIC_THREADS } from "../../cad/fasteners.ts"
import type { Vec2 } from "../../cad/vec.ts"
import type { Stock as MachineStock, Tool } from "../tool.ts"
import { PocketParams, generatePocket } from "../operations/pocket.ts"
import { ProfileParams, generateProfile } from "../operations/profile.ts"
import { ThreadParams, generateThread } from "../operations/thread.ts"
import type { DrillPoint } from "./actions.ts"
import { f3 } from "./common.ts"
import type { CadElement, ToolpathSettings } from "./schema.ts"
import { movesToGcode } from "./surface.ts"

type V3 = { readonly x: number; readonly y: number; readonly z: number }

/** The plane frames of the history: `u`, `v` span the plane, `n = u x v` is its normal. */
const FRAMES: Readonly<Record<PlaneName, { readonly u: V3; readonly v: V3; readonly n: V3 }>> = {
  XY: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 } },
  YZ: { u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 }, n: { x: 1, y: 0, z: 0 } },
  ZX: { u: { x: 0, y: 0, z: 1 }, v: { x: 1, y: 0, z: 0 }, n: { x: 0, y: 1, z: 0 } }
}

export interface MachiningHole {
  /** The site: the hole feature, or `<pattern>#<i>` / `<mirror>:<site>` for the copies. */
  readonly id: string
  /** The hole feature it comes from. */
  readonly source: string
  /** Where the drill enters the part, world mm. */
  readonly entry: V3
  /** Unit direction into the material. */
  readonly direction: V3
  readonly diameter: number
  readonly depth: number
  readonly kind: "simple" | "counterbore" | "countersink"
  readonly headDiameter?: number
  readonly headDepth?: number
  /** The cosmetic thread the hole carries (`HoleFeature.thread`): designation, its depth, and its metric size when known. */
  readonly thread?: { readonly designation: string; readonly depth: number; readonly diameter?: number; readonly pitch?: number }
  /** ISO 286 fit of the bore (`HoleFeature.fit`, such as `H7`): a drilled hole is too rough for it, the planner reams it. */
  readonly fit?: string
}

/** A region opened from above: the tool may clear `loop` from `top` down to `floor` (world Z). */
export interface MachiningPocket {
  readonly id: string
  readonly feature: string
  readonly loop: ReadonlyArray<Vec2>
  /** Material standing inside the region (an exact B-rep reads them; a history pocket has none): the tool must not cut them between `floor` and `top`. */
  readonly islands?: ReadonlyArray<ReadonlyArray<Vec2>>
  readonly top: number
  readonly floor: number
}

/** The outline of material an adding extrusion builds on the XY plane, with the inner loops it leaves open. */
export interface MachiningOutline {
  readonly id: string
  readonly feature: string
  readonly outer: ReadonlyArray<Vec2>
  readonly inner: ReadonlyArray<ReadonlyArray<Vec2>>
  readonly top: number
  readonly bottom: number
}

/** The outside envelope a revolution turns: radius against the axial position, both mm, `t` increasing along `axis`. */
export interface TurnedProfile {
  readonly feature: string
  readonly axis: "x" | "y" | "z"
  /** Points of the envelope, `t` non-decreasing; a step has two points at one `t`. */
  readonly points: ReadonlyArray<{ readonly t: number; readonly r: number }>
  readonly start: number
  readonly end: number
  readonly maxDiameter: number
}

export interface HistoryFeatures {
  readonly holes: ReadonlyArray<MachiningHole>
  readonly pockets: ReadonlyArray<MachiningPocket>
  readonly outlines: ReadonlyArray<MachiningOutline>
  readonly turned: ReadonlyArray<TurnedProfile>
  readonly bounds: { readonly min: V3; readonly max: V3 } | undefined
  /** Holes along other axes than Z that the exact recognition left to their own setup (it plugged them to read this one). */
  readonly sideHoles?: number
  /** Faces of the solid hidden from above (under a roof, sideways, facing down) that the exact recognition left to other setups. */
  readonly hiddenFaces?: number
  /** What the derivation left out and why (a feature it does not machine, a hole that is not reachable from above). */
  readonly notes: ReadonlyArray<string>
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0)
const isHistory = (value: unknown): value is History =>
  typeof value === "object" && value !== null && Array.isArray((value as { features?: unknown }).features)

/** Whether the editor also turned or scaled the element: then its world geometry is not the history moved. */
const transformed = (e: CadElement): boolean => {
  const r = typeof e["rotation"] === "object" && e["rotation"] !== null ? (e["rotation"] as Record<string, unknown>) : {}
  const s = typeof e["scale"] === "object" && e["scale"] !== null ? (e["scale"] as Record<string, unknown>) : {}
  return num(r["x"]) !== 0 || num(r["y"]) !== 0 || num(r["z"]) !== 0
    || (s["x"] !== undefined && num(s["x"]) !== 1) || (s["y"] !== undefined && num(s["y"]) !== 1) || (s["z"] !== undefined && num(s["z"]) !== 1)
    || num(e["translateX"]) !== 0 || num(e["translateY"]) !== 0 || num(e["translateZ"]) !== 0
}

const valueOf = (d: Dimension | undefined, parameters: Readonly<Record<string, number>>): number | undefined => {
  if (d === undefined) return undefined
  try { return dimensionValue(d, parameters) } catch { return undefined }
}

const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
// `+ 0` turns a negative zero into zero, so a direction reads (0, 0, -1) and compares equal.
const scale = (a: V3, k: number): V3 => ({ x: a.x * k + 0, y: a.y * k + 0, z: a.z * k + 0 })
const ccw = (ring: ReadonlyArray<Vec2>): Vec2[] => (signedArea(ring) >= 0 ? [...ring] : [...ring].reverse())

/** The span an extrusion of `depth` from a sketch at `offset` occupies along the plane normal. */
const extent = (offset: number, depth: number, direction: "up" | "down" | "symmetric" | undefined): readonly [number, number] =>
  direction === "down" ? [offset - depth, offset] : direction === "symmetric" ? [offset - depth / 2, offset + depth / 2] : [offset, offset + depth]

/**
 * The radius envelope of a revolution's profile loops: at every vertex position along the axis, the largest distance from the
 * axis of the loop boundary there (both one-sided limits, so a shoulder gives two points).
 */
const envelope = (loops: ReadonlyArray<ReadonlyArray<Vec2>>, along: (p: Vec2) => number, radius: (p: Vec2) => number): Array<{ t: number; r: number }> => {
  const ts = [...new Set(loops.flatMap((loop) => loop.map((p) => Number(along(p).toFixed(6)))))].sort((a, b) => a - b)
  const at = (t: number, side: -1 | 1): number => {
    let best = 0
    for (const loop of loops) for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!, b = loop[(i + 1) % loop.length]!
      const ta = along(a), tb = along(b)
      const lo = Math.min(ta, tb), hi = Math.max(ta, tb)
      if (hi - lo < 1e-9) continue
      // The edge covers the side of `t` we look at.
      if (side < 0 ? !(lo < t - 1e-9 && hi >= t - 1e-9) : !(lo <= t + 1e-9 && hi > t + 1e-9)) continue
      const k = (t - ta) / (tb - ta)
      best = Math.max(best, Math.abs(radius(a) + (radius(b) - radius(a)) * k))
    }
    return best
  }
  const points: Array<{ t: number; r: number }> = []
  ts.forEach((t, index) => {
    const left = index === 0 ? undefined : at(t, -1)
    const right = index === ts.length - 1 ? undefined : at(t, 1)
    if (left !== undefined) points.push({ t, r: left })
    if (right !== undefined && (left === undefined || Math.abs(right - left) > 1e-6)) points.push({ t, r: right })
  })
  return points
}

const cache = new Map<string, HistoryFeatures | null>()

/** The machining features of a `parametric` element, or undefined when it is not one (or the editor rotated / scaled it). */
export const historyFeatures = (e: CadElement): HistoryFeatures | undefined => {
  if (e["type"] !== "parametric" || !isHistory(e["history"]) || transformed(e)) return undefined
  const history = e["history"]
  const key = JSON.stringify(history)
  let local = cache.get(key)
  if (local === undefined) {
    try { local = derive(history) } catch { local = null }
    if (cache.size >= 32) cache.delete(cache.keys().next().value as string)
    cache.set(key, local)
  }
  if (local === null) return undefined
  const shift: V3 = { x: num(e["x"]), y: num(e["y"]), z: num(e["z"]) }
  const move2 = (p: Vec2): Vec2 => ({ x: p.x + shift.x, y: p.y + shift.y })
  return {
    holes: local.holes.map((h) => ({ ...h, entry: add(h.entry, shift) })),
    pockets: local.pockets.map((p) => ({ ...p, loop: p.loop.map(move2), ...(p.islands !== undefined ? { islands: p.islands.map((i) => i.map(move2)) } : {}), top: p.top + shift.z, floor: p.floor + shift.z })),
    outlines: local.outlines.map((o) => ({ ...o, outer: o.outer.map(move2), inner: o.inner.map((l) => l.map(move2)), top: o.top + shift.z, bottom: o.bottom + shift.z })),
    turned: local.turned.map((t) => {
      const by = t.axis === "x" ? shift.x : t.axis === "y" ? shift.y : shift.z
      return { ...t, start: t.start + by, end: t.end + by, points: t.points.map((p) => ({ t: p.t + by, r: p.r })) }
    }),
    bounds: local.bounds === undefined ? undefined : { min: add(local.bounds.min, shift), max: add(local.bounds.max, shift) },
    notes: local.notes
  }
}

const derive = (source: History): HistoryFeatures => {
  // A suppressed or rolled-back feature is not machined: the walk reads the model the person sees (spec 58).
  const history = activeHistory(source)
  // Whole bodies mirrored or patterned carry their holes and pockets along; the walk below follows feature tools only, so such a
  // part is left to the exact recognition of the planner (`exactFeatures`), which reads the real geometry.
  if (history.features.some((f) => (f.type === "mirror" || f.type === "pattern") && f.bodies !== undefined)) throw new Error("body copies")
  const built = rebuild(history)
  const parameters = built.parameters
  const notes: string[] = []
  const features = new Map(history.features.map((f) => [f.id, f] as const))

  let bounds: HistoryFeatures["bounds"]
  for (const body of built.bodies) {
    const b = meshBounds(body.mesh)
    bounds = bounds === undefined
      ? { min: { x: b.minX, y: b.minY, z: b.minZ }, max: { x: b.maxX, y: b.maxY, z: b.maxZ } }
      : { min: { x: Math.min(bounds.min.x, b.minX), y: Math.min(bounds.min.y, b.minY), z: Math.min(bounds.min.z, b.minZ) }, max: { x: Math.max(bounds.max.x, b.maxX), y: Math.max(bounds.max.y, b.maxY), z: Math.max(bounds.max.z, b.maxZ) } }
  }

  // Holes: the sites DFM measures (patterns included), carried to world coordinates, then the copies mirrors make.
  const holes: MachiningHole[] = []
  for (const site of holeSites(history, parameters, built.planes)) {
    const f = features.get(site.source) as HoleFeature | undefined
    const frame = site.frame
    if (f === undefined) continue
    const head = f.kind === "counterbore" || f.kind === "countersink" ? valueOf(f.headDiameter, parameters) : undefined
    const headDepth = f.kind === "counterbore" ? valueOf(f.headDepth, parameters) : undefined
    holes.push({
      id: site.feature, source: site.source,
      entry: add(add(add(frame.origin, scale(frame.n, site.offset)), scale(frame.u, site.u)), scale(frame.v, site.v)),
      direction: scale(frame.n, -1), diameter: site.diameter, depth: site.depth, kind: f.kind ?? "simple",
      ...(head !== undefined ? { headDiameter: head } : {}), ...(headDepth !== undefined ? { headDepth } : {}),
      ...threadOf(f, parameters, site.depth), ...(f.fit !== undefined ? { fit: f.fit } : {})
    })
  }
  for (const f of history.features) {
    if (f.type !== "mirror") continue
    const at = valueOf(f.offset ?? 0, parameters)
    if (at === undefined) continue
    const axis = f.plane === "XY" ? "z" : f.plane === "YZ" ? "x" : "y"
    const mirrored = holes.filter((h) => h.id === f.feature || h.source === f.feature || h.id.startsWith(`${f.feature}#`))
    for (const h of mirrored) {
      const flip = (p: V3): V3 => ({ ...p, [axis]: 2 * at - p[axis] })
      holes.push({ ...h, id: `${f.id}:${h.id}`, entry: flip(h.entry), direction: { ...h.direction, [axis]: -h.direction[axis] } })
    }
  }

  const pockets: MachiningPocket[] = []
  const outlines: MachiningOutline[] = []
  const turned: TurnedProfile[] = []
  /** Boxes of the cuts made so far: material added later inside one of them is a boss standing in a pocket. */
  const cuts: Array<{ minX: number; minY: number; maxX: number; maxY: number; bottom: number; top: number }> = []
  const box = (loops: ReadonlyArray<ReadonlyArray<Vec2>>) => {
    const xs = loops.flat().map((p) => p.x), ys = loops.flat().map((p) => p.y)
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
  }
  for (const f of history.features) {
    if (f.type === "extrude") {
      const sketch = built.sketches[f.sketch]
      const depth = valueOf(f.depth, parameters)
      if (sketch === undefined || depth === undefined || sketch.solve.status === "failed" || sketch.solve.status === "conflicting") continue
      if (sketch.plane !== "XY") {
        if (f.operation === "subtract") notes.push(`${f.id}: a cut on the ${sketch.plane} plane is not reachable from above (3+2 or the surface path)`)
        continue
      }
      const cornerSize = f.corner === undefined ? undefined : valueOf(f.corner.size, parameters)
      const loops = sketchProfiles(sketch.solve.sketch).loops.map((loop) => (f.corner !== undefined && cornerSize !== undefined && cornerSize > 0 ? treatCorners(loop, f.corner.style, cornerSize) : loop))
      const [bottom, top] = extent(sketch.offset, depth, f.direction)
      if (f.taper !== undefined || f.edge !== undefined) notes.push(`${f.id}: draft and edge breaks are not followed by the 2.5D paths (the surface path machines them)`)
      // This walk reads every extrusion as a tool of its own, in no order: material that stands in a pocket cut earlier (an island on
      // the pocket floor) is not an outline over the stock. The exact recognition of the planner (`exactFeatures`) reads that part.
      if ((f.operation === "new" || f.operation === "union") && loops.length > 0) {
        const b = box(loops)
        if (cuts.some((c) => Math.min(top, c.top) - Math.max(bottom, c.bottom) > 1e-6 && b.minX < c.maxX - 1e-6 && b.maxX > c.minX + 1e-6 && b.minY < c.maxY - 1e-6 && b.maxY > c.minY + 1e-6)) throw new Error("material added inside a pocket")
      }
      if (f.operation === "subtract" && loops.length > 0) cuts.push({ ...box(loops), bottom, top })
      if (f.operation === "subtract") {
        loops.forEach((loop, i) => pockets.push({ id: loops.length > 1 ? `${f.id}#${i}` : f.id, feature: f.id, loop: ccw(loop), top, floor: bottom }))
      } else if (f.operation === "new" || f.operation === "union") {
        // Nested loops: the largest are the outlines, a loop inside another is an opening of it.
        const sorted = [...loops].sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))
        const outers: Array<{ outer: Vec2[]; inner: Vec2[][] }> = []
        for (const loop of sorted) {
          const host = outers.find((o) => inside(loop[0]!, o.outer))
          if (host !== undefined) host.inner.push(ccw(loop))
          else outers.push({ outer: ccw(loop), inner: [] })
        }
        outers.forEach((o, i) => outlines.push({ id: outers.length > 1 ? `${f.id}#${i}` : f.id, feature: f.id, outer: o.outer, inner: o.inner, top, bottom }))
      }
    } else if (f.type === "revolve" && (f.operation === "new" || f.operation === "union")) {
      const sketch = built.sketches[f.sketch]
      if (sketch === undefined || typeof f.axis !== "string") { notes.push(`${f.id}: only a revolution about the sketch's own x or y axis is turned`); continue }
      const angle = f.angle === undefined ? 360 : valueOf(f.angle, parameters)
      if (angle === undefined || angle < 360 - 1e-6) { notes.push(`${f.id}: a partial revolution is not a turned part`); continue }
      const frame = sketch.plane === "XY" ? FRAMES.XY : sketch.plane === "YZ" ? FRAMES.YZ : sketch.plane === "ZX" ? FRAMES.ZX : undefined
      if (frame === undefined) { notes.push(`${f.id}: turning on a custom work plane requires the surface path or an indexed setup`); continue }
      const axisVec = f.axis === "x" ? frame.u : frame.v
      const axis = axisVec.x !== 0 ? "x" : axisVec.y !== 0 ? "y" : "z"
      const loops = sketchProfiles(sketch.solve.sketch).loops
      const points = envelope(loops, (p) => (f.axis === "x" ? p.x : p.y), (p) => (f.axis === "x" ? p.y : p.x))
      if (points.length < 2) continue
      turned.push({ feature: f.id, axis, points, start: points[0]!.t, end: points[points.length - 1]!.t, maxDiameter: 2 * Math.max(...points.map((p) => p.r)) })
    }
  }
  return { holes, pockets, outlines, turned, bounds, notes }
}

/** The thread note of a hole with its metric size: `M8` takes the coarse pitch of the ISO table, `M8x1` the given one. */
const threadOf = (f: HoleFeature, parameters: Readonly<Record<string, number>>, holeDepth: number): Pick<MachiningHole, "thread"> => {
  if (f.thread === undefined) return {}
  const depth = Math.min(valueOf(f.thread.depth, parameters) ?? holeDepth, holeDepth)
  const m = /^M\s*(\d+(?:\.\d+)?)(?:\s*[xX×]\s*(\d+(?:\.\d+)?))?$/.exec(f.thread.designation.trim())
  const diameter = m ? Number(m[1]) : undefined
  const pitch = m ? (m[2] !== undefined ? Number(m[2]) : METRIC_THREADS.find((t) => t.d === diameter)?.pitch) : undefined
  return { thread: { designation: f.thread.designation, depth, ...(diameter !== undefined ? { diameter } : {}), ...(pitch !== undefined ? { pitch } : {}) } }
}

const inside = (p: Vec2, ring: ReadonlyArray<Vec2>): boolean => {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

// ---------------------------------------------------------------- operations on a placed parametric part

const DOWN = (d: V3): boolean => Math.abs(d.x) < 1e-9 && Math.abs(d.y) < 1e-9 && d.z < 0

/** The holes a 3-axis mill reaches from above, as drill points with the hole's own depth below its entry (`top`). */
export const parametricDrillPoints = (e: CadElement): { readonly points: ReadonlyArray<DrillPoint>; readonly notes: ReadonlyArray<string> } | undefined => {
  const features = historyFeatures(e)
  if (features === undefined) return undefined
  const notes = [...features.notes]
  const points: DrillPoint[] = []
  for (const h of features.holes) {
    if (!DOWN(h.direction)) { notes.push(`hole ${h.id} is drilled along (${f3(h.direction.x)}, ${f3(h.direction.y)}, ${f3(h.direction.z)}), not from above: it needs another setup`); continue }
    points.push({ x: h.entry.x, y: h.entry.y, z: h.entry.z, top: h.entry.z, depth: h.depth, diameter: h.diameter, source: h.id })
  }
  return { points, notes }
}

const toolOf = (s: ToolpathSettings): Tool => ({ id: "1", name: `${s.toolType} ${s.toolDiameter}`, kind: s.toolType === "ballnose" ? "ballnose" : "endmill", diameter: s.toolDiameter, flutes: s.flutes, maxRpm: Math.max(s.rpm, 1) })

const heightsAbove = (top: number) => ({ clearanceHeight: top + 10, safeHeight: top + 5, retractHeight: top + 2 })

const machineStock = (features: HistoryFeatures, top: number, s: ToolpathSettings): MachineStock => {
  const b = features.bounds
  const reach = s.toolDiameter + 2
  return b === undefined
    ? { x: 1, y: 1, z: 1, origin: { x: 0, y: 0, z: top }, material: s.material }
    : { x: b.max.x - b.min.x + 2 * reach, y: b.max.y - b.min.y + 2 * reach, z: Math.max(1e-3, top - b.min.z), origin: { x: b.min.x - reach, y: b.min.y - reach, z: top }, material: s.material }
}

const common = (s: ToolpathSettings, name: string, top: number, totalDepth: number) => ({
  id: name, name, ...heightsAbove(top), totalDepth, stepdown: Math.min(s.stepdown, totalDepth), feed: s.feedrate, plungeFeed: s.plungerate,
  spindleRpm: s.rpm, coolant: s.coolant ? "flood" : "off", climb: s.direction === "climb", tolerance: Math.max(s.tolerance, 0.001)
})

/**
 * Contour, pocket or thread milling of a placed parametric part from its features, or undefined when the element is not one
 * (the caller keeps its own path). The requested depth is the contour's depth; a pocket and a counterbore stop at the floor the
 * model gives them (cutting deeper would cut the part), and a requested depth shallower than that floor stops there instead.
 */
export const parametricOperation = (e: CadElement, s: ToolpathSettings): string | undefined => {
  const features = historyFeatures(e)
  if (features === undefined) return undefined
  const tool = toolOf(s)
  const partTop = features.bounds?.max.z ?? num(e["z"])
  let gcode = `; Parametric part: ${features.holes.length} hole(s), ${features.pockets.length} pocket(s), ${features.outlines.length} outline(s) from its feature history\n`
  for (const note of features.notes) gcode += `; Note: ${note}\n`
  const run = (label: string, make: () => { moves: Parameters<typeof movesToGcode>[0] }): void => {
    try { gcode += movesToGcode(make().moves) } catch (cause) { gcode += `; Warning: ${label} skipped: ${cause instanceof Error ? cause.message : String(cause)}\n` }
  }
  switch (s.operationType) {
    case "contour":
    case "profile": {
      if (features.outlines.length === 0) return gcode + "; Warning: the part has no outline on the XY plane to contour; use 3d_surface\n"
      for (const o of features.outlines) {
        const depth = s.depth
        gcode += `; Contour ${o.id}: ${o.outer.length} points, outside, ${f3(depth)}mm below Z${f3(o.top)}\n`
        const params = Schema.decodeUnknownSync(ProfileParams)({ ...common(s, `contour ${o.id}`, o.top, depth), side: s.offset === "inside" ? "inside" : s.offset === "center" ? "onLine" : "outside", leadIn: "arc", leadRadius: Math.max(1, s.toolDiameter / 2), arcFit: true })
        run(o.id, () => generateProfile(params, o.outer, tool, machineStock(features, o.top, s)))
      }
      return gcode
    }
    case "pocket": {
      const regions: Array<{ id: string; loop: ReadonlyArray<Vec2>; top: number; floor: number }> = features.pockets.map((p) => ({ ...p, top: Math.min(p.top, partTop) }))
      for (const h of features.holes) {
        if (h.kind !== "counterbore" || h.headDiameter === undefined || h.headDepth === undefined || !DOWN(h.direction)) continue
        const n = 48
        regions.push({ id: `${h.id} counterbore`, top: h.entry.z, floor: h.entry.z - h.headDepth, loop: Array.from({ length: n }, (_, k) => ({ x: h.entry.x + (h.headDiameter! / 2) * Math.cos((2 * Math.PI * k) / n), y: h.entry.y + (h.headDiameter! / 2) * Math.sin((2 * Math.PI * k) / n) })) })
      }
      if (regions.length === 0) return gcode + "; Warning: the part has no pocket or counterbore opened from above\n"
      for (const r of regions) {
        const modelled = r.top - r.floor
        if (modelled <= 1e-6) continue
        const depth = Math.min(modelled, s.depth)
        const top = Math.max(r.top, partTop)
        const total = depth + (top - r.top)
        gcode += `; Pocket ${r.id}: floor Z${f3(r.top - depth)}${depth < modelled - 1e-6 ? ` (requested ${f3(s.depth)}mm, the model's floor is ${f3(modelled)}mm down)` : ""}\n`
        const params = Schema.decodeUnknownSync(PocketParams)({ ...common(s, `pocket ${r.id}`, top, total), stepover: Math.min(100, Math.max(1, s.stepover)), entry: "helix" })
        run(r.id, () => generatePocket(params, r.loop, tool, machineStock(features, top, s)))
      }
      return gcode
    }
    case "threading": {
      const tapped = features.holes.flatMap((h) => {
        const thread = METRIC_THREADS.find((m) => Math.abs(m.tapDrill - h.diameter) < 0.051)
        return thread !== undefined && DOWN(h.direction) ? [{ h, thread }] : []
      })
      if (tapped.length === 0) return gcode + "; Warning: no hole of the part has a metric tap-drill diameter (the thread mill needs the tapped holes)\n"
      for (const { h, thread } of tapped) {
        gcode += `; Thread ${thread.name}x${thread.pitch} in hole ${h.id} (tap drill Ø${f3(h.diameter)}), ${f3(h.depth)}mm deep\n`
        const params = Schema.decodeUnknownSync(ThreadParams)({
          ...common(s, `thread ${h.id}`, h.entry.z, h.depth), stepdown: 1_000_000, x: h.entry.x, y: h.entry.y, diameter: thread.d, pitch: thread.pitch,
          internal: true, rightHand: s.threadHand === "right", passes: s.threadPasses, springPasses: s.threadSpringPasses
        })
        run(h.id, () => generateThread(params, tool, machineStock(features, h.entry.z, s)).toolpath)
      }
      return gcode
    }
    default: return undefined
  }
}

/** The turned profile of the selection (the first revolution of a parametric part), for the lathe. */
export const turnedProfileOf = (elements: ReadonlyArray<CadElement>): TurnedProfile | undefined => {
  for (const e of elements) {
    const t = historyFeatures(e)?.turned[0]
    if (t !== undefined) return t
  }
  return undefined
}
