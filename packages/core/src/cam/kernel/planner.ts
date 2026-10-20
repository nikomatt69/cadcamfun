/**
 * Feature-based planning (spec 29 §7): from the part the CAD built to an ordered chain of operations with the cutter of
 * each, the way a CAM programmer sequences a prismatic part:
 *
 *   face the stock top  ->  rough around the outlines and inside the pockets (adaptive / contour, wall allowance)
 *   ->  counterbores, spot drilling, drilling (or helical boring), reaming of fitted bores, countersinks, tapping or thread milling
 *   ->  finish the walls  ->  break the top edges (2D chamfer, when `deburr` is asked)  ->  3D roughing and finishing of the freeform bodies
 *
 * The features come from the parametric history (`generator/history-features.ts`, the same derivation the generator and
 * DFM use), so the operations machine the holes, pockets and outlines the CAD model really has. A body without a feature
 * history (a mesh, a Boolean of primitives, a sculpted part) is machined with the 3D surface strategies.
 *
 * Planning chooses tools and regions only; cutting data is computed per operation when the job runs. Everything here is
 * in CAD world coordinates.
 */
import { offsetPolyline } from "../../cad/offset.ts"
import { signedArea } from "../../cad/shapes.ts"
import type { Vec2 } from "../../cad/vec.ts"
import { distanceToChain, pointInRing } from "../geometry.ts"
import { threadMinorDiameter } from "../operations/thread.ts"
import { setupTransform, type SetupOrientation } from "../setup.ts"
import { exactFeatures } from "../brep-part.ts"
import { historyFeatures, type HistoryFeatures, type MachiningHole } from "../generator/history-features.ts"
import type { CadElement } from "../generator/schema.ts"
import type { OperationSpec, StockBox } from "./contracts.ts"
import { pointLength, reamDrill, type Cutter } from "./cutters.ts"
import { suitability, type Rigidity } from "./cutting-data.ts"
import type { WorkpieceMaterial } from "./materials.ts"

export interface PlanInput {
  readonly setupOrientation?: SetupOrientation
  readonly elements: ReadonlyArray<CadElement> | undefined
  /** Part bounds, world mm. */
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }
  readonly stock: StockBox
  readonly tools: ReadonlyArray<Cutter>
  readonly material: WorkpieceMaterial
  readonly rigidity: Rigidity
  readonly finishAllowance: number
  readonly scallop: number
  /** Chamfer width that breaks the top edges of outlines, pockets and holes, mm (no deburring when absent). */
  readonly deburr?: number
  /** The machine's control taps rigidly (G84): tapped holes are tapped, otherwise their threads are milled. */
  readonly rigidTap?: boolean
  /** Upward horizontal faces of the part, by height (`horizontalFaces`): a freeform part with some gets a flat-area finish. */
  readonly flats?: ReadonlyArray<{ readonly z: number; readonly area: number }>
}

/**
 * Upward-facing horizontal faces of triangle meshes, grouped by height (within 1 micron) with their area, highest first: the
 * floors, ledges and tops a flat-area finish can leave exactly at size. A triangle counts when its normal is within half a degree
 * of +Z.
 */
export const horizontalFaces = (meshes: ReadonlyArray<{ readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }>): Array<{ readonly z: number; readonly area: number }> => {
  const cos = Math.cos((0.5 * Math.PI) / 180)
  const found: Array<{ z: number; area: number }> = []
  for (const m of meshes) {
    const p = m.positions, ix = m.indices
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = ix[t]! * 3, b = ix[t + 1]! * 3, c = ix[t + 2]! * 3
      const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!
      const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz)
      if (!(len > 0) || nz < cos * len) continue
      const z = (p[a + 2]! + p[b + 2]! + p[c + 2]!) / 3
      const group = found.find((f) => Math.abs(f.z - z) <= 1e-3)
      if (group === undefined) found.push({ z, area: len / 2 })
      else group.area += len / 2
    }
  }
  return found.sort((x, y) => y.z - x.z)
}

export interface Plan {
  readonly operations: ReadonlyArray<OperationSpec>
  readonly notes: ReadonlyArray<string>
  /** Features of the part the plan does not machine (no tool fits, not reachable from above, unsupported). */
  readonly unmachined: ReadonlyArray<string>
  /**
   * Places where the cutter legitimately goes below the modelled part: the cone of a drill at the bottom of a blind hole.
   * The replay does not count them as gouges.
   */
  readonly allowances: ReadonlyArray<{ readonly center: Vec2; readonly radius: number; readonly floor: number; readonly depth: number }>
}

const MAX_ROUGH: Readonly<Record<Rigidity, number>> = { hobby: 6, light: 10, standard: 16, heavy: 20 }

const ccw = (ring: ReadonlyArray<Vec2>): Vec2[] => (signedArea(ring) >= 0 ? [...ring] : [...ring].reverse())

/** Grows (d > 0) or shrinks (d < 0) a ring; the largest resulting loop, or undefined when it collapses. */
export const offsetRing = (ring: ReadonlyArray<Vec2>, d: number): Vec2[] | undefined => {
  if (Math.abs(d) < 1e-9) return ccw(ring)
  const loops = offsetPolyline(ccw(ring), d, true)
  let best: Vec2[] | undefined
  for (const l of loops) if (best === undefined || Math.abs(signedArea(l)) > Math.abs(signedArea(best))) best = l
  return best === undefined ? undefined : ccw(best)
}

/** Radius of the largest circle that fits in a region (sampled on a grid, then refined around the best node). */
export const inscribedRadius = (boundary: ReadonlyArray<Vec2>, islands: ReadonlyArray<ReadonlyArray<Vec2>> = []): number => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of boundary) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
  const clearance = (p: Vec2): number => {
    if (!pointInRing(p, boundary) || islands.some((i) => pointInRing(p, i))) return -1
    let d = distanceToChain(p, boundary, true)
    for (const i of islands) d = Math.min(d, distanceToChain(p, i, true))
    return d
  }
  let best = { p: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, d: -1 }
  const n = 40
  const sx = (maxX - minX) / n, sy = (maxY - minY) / n
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const p = { x: minX + i * sx, y: minY + j * sy }
    const d = clearance(p)
    if (d > best.d) best = { p, d }
  }
  let step = Math.max(sx, sy) / 2
  for (let k = 0; k < 20 && step > 1e-4; k++) {
    let moved = false
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const p = { x: best.p.x + dx * step, y: best.p.y + dy * step }
      const d = clearance(p)
      if (d > best.d) { best = { p, d }; moved = true }
    }
    if (!moved) step /= 2
  }
  return Math.max(0, best.d)
}

const circleRing = (c: Vec2, r: number, n = 64): Vec2[] =>
  Array.from({ length: n }, (_, k) => ({ x: c.x + r * Math.cos((2 * Math.PI * k) / n), y: c.y + r * Math.sin((2 * Math.PI * k) / n) }))

const isDown = (h: MachiningHole): boolean => Math.abs(h.direction.x) < 1e-9 && Math.abs(h.direction.y) < 1e-9 && h.direction.z < 0

const r3 = (v: number): number => Math.round(v * 1000) / 1000

export const planJob = (input: PlanInput): Plan => {
  const { stock, tools, material, rigidity } = input
  const notes: string[] = []
  const unmachined: string[] = []
  const ops: OperationSpec[] = []
  const allowances: Plan["allowances"][number][] = []
  const partTop = input.bounds.max[2]
  const partBottom = input.bounds.min[2]
  const allowance = input.finishAllowance
  const maxRough = MAX_ROUGH[rigidity]

  // Largest first; at equal size the cutter whose material and coating suit the workpiece best.
  const fit = (t: Cutter): number => Math.round(suitability(t, material) * 100)
  const bySize = (a: Cutter, b: Cutter): number => b.diameter - a.diameter || fit(b) - fit(a) || a.id.localeCompare(b.id)
  const millers = tools.filter((t) => t.kind === "flat" || t.kind === "bull").sort(bySize)
  const balls = tools.filter((t) => t.kind === "ball").sort(bySize)
  const drills = tools.filter((t) => t.kind === "drill").sort((a, b) => fit(b) - fit(a) || a.id.localeCompare(b.id))
  /** Largest end mill that fits `maxDiameter`, preferring one whose flutes reach `depth` (the shank would rub the wall). */
  const endMill = (maxDiameter: number, depth: number): Cutter | undefined => {
    const fitting = millers.filter((t) => t.diameter <= maxDiameter + 1e-9 && t.stickout >= depth + 2)
    return fitting.find((t) => t.fluteLength >= depth - 1e-9) ?? fitting[0]
  }
  const reachNote = (t: Cutter, depth: number, what: string): void => {
    if (t.fluteLength < depth - 1e-9) notes.push(`${what}: ${t.name} has ${t.fluteLength} mm of flutes for a ${r3(depth)} mm wall; the shank may rub the finished wall (use a longer or necked cutter)`)
  }

  // ------------------------------------------------------------ features
  const features: HistoryFeatures[] = []
  const freeform: CadElement[] = []
  const byId = new Map((input.elements ?? []).map((e) => [String(e["id"] ?? ""), e] as const))
  const transform = input.setupOrientation !== undefined && input.setupOrientation !== "+Z" ? setupTransform(input.setupOrientation) : undefined
  for (const e of input.elements ?? []) {
    if (e["type"] === "workpiece") continue
    let f = transform !== undefined ? undefined : historyFeatures(e)
    if (f === undefined) {
      // No walkable history (a STEP solid, a part the editor rotated): the features come from the exact B-rep, or the reason it is a surface job.
      const exact = exactFeatures(e, byId, transform)
      if (exact?.features !== undefined) f = exact.features
      else if (exact !== undefined) notes.push(`${exact.reason}; machined with the 3D surface strategies`)
    }
    if (f !== undefined && (f.outlines.length > 0 || f.pockets.length > 0 || f.holes.length > 0)) {
      features.push(f)
      for (const n of f.notes) (/not reachable|requires|not a turned|only a revolution/.test(n) ? unmachined : notes).push(n)
    } else freeform.push(e)
  }
  const prismatic = features.length > 0
  const surfaceOnly = !prismatic || freeform.length > 0

  // ------------------------------------------------------------ facing
  const faceDepth = stock.max.z - partTop
  if (faceDepth > 0.005) {
    const tool = tools.find((t) => t.kind === "facemill" && t.diameter <= Math.max(stock.max.x - stock.min.x, stock.max.y - stock.min.y) * 1.5) ?? endMill(maxRough, faceDepth)
    if (tool === undefined) unmachined.push("No face mill or end mill to face the stock top")
    else ops.push({ id: "face", name: "Face stock top", strategy: "face", tool: tool.id, bottom: partTop })
  }

  // ------------------------------------------------------------ roughing
  const finishes: OperationSpec[] = []
  const outlines = features.flatMap((f) => f.outlines).sort((a, b) => b.top - a.top)
  const pocketRegions: Array<{ id: string; loop: ReadonlyArray<Vec2>; top: number; floor: number }> = []
  for (const f of features) for (const p of f.pockets) pocketRegions.push({ id: p.id, loop: p.loop, top: Math.min(p.top, partTop), floor: p.floor })
  for (const o of outlines) o.inner.forEach((loop, i) => pocketRegions.push({ id: `${o.id}-opening${i}`, loop, top: o.top, floor: o.bottom }))

  const stockRing = (grow: number): Vec2[] => [
    { x: stock.min.x - grow, y: stock.min.y - grow }, { x: stock.max.x + grow, y: stock.min.y - grow },
    { x: stock.max.x + grow, y: stock.max.y + grow }, { x: stock.min.x - grow, y: stock.max.y + grow }
  ]
  for (const o of outlines) {
    const depth = o.top - o.bottom
    if (depth <= 1e-6) continue
    // Material outside the outline down to its bottom: everything above `o.bottom` around every outline that reaches it.
    const tool = endMill(maxRough, depth)
    if (tool === undefined) { unmachined.push(`Outline ${o.id}: no end mill in the library reaches ${r3(depth)} mm`); continue }
    // Every outline with material inside the slab being cleared (its top above this bottom) is protected, this one included.
    const islands = outlines.filter((x) => x.top > o.bottom + 1e-9).flatMap((x) => { const g = offsetRing(x.outer, allowance); return g === undefined ? [] : [g] })
    const sideRoom = Math.min(...o.outer.map((p) => Math.min(p.x - stock.min.x, stock.max.x - p.x, p.y - stock.min.y, stock.max.y - p.y)))
    if (sideRoom > -1e-6) {
      // Widest stock outside the outline: the farthest stock-boundary point from it.
      const ring = stockRing(0)
      let margin = 0
      for (let k = 0; k < 4; k++) {
        const a = ring[k]!, b = ring[(k + 1) % 4]!
        for (let t = 0; t <= 32; t++) {
          const p = { x: a.x + ((b.x - a.x) * t) / 32, y: a.y + ((b.y - a.y) * t) / 32 }
          if (!pointInRing(p, o.outer)) margin = Math.max(margin, distanceToChain(p, o.outer, true))
        }
      }
      const step = Math.max(0.1, material.sideAe * tool.diameter)
      if (margin <= 1.5 * tool.diameter) {
        // A narrow band: contour-parallel side passes, outermost first, each taking at most the material's radial engagement.
        const passes = Math.max(1, Math.ceil((margin - allowance) / step - 1e-9))
        for (let k = passes - 1; k >= 0; k--) {
          const left = allowance + k * step
          const ae = Math.min(step, margin - left)
          if (ae <= 1e-3) continue
          ops.push({ id: `rough-${o.id}-${passes - k}`, name: `Rough side pass ${passes - k}/${passes} around ${o.id}`, strategy: "profile", tool: tool.id, loop: ccw(o.outer), side: "outside", top: o.top, bottom: o.bottom, allowance: r3(left), radialEngagement: r3(ae) })
        }
      } else {
        ops.push({ id: `rough-${o.id}`, name: `Adaptive rough around ${o.id}`, strategy: "adaptive", tool: tool.id, region: { boundary: stockRing(tool.diameter + 1), islands }, top: o.top, bottom: o.bottom })
      }
    } else unmachined.push(`Outline ${o.id} reaches past the stock: the stock is smaller than the part`)
    if (o.bottom <= stock.min.z + 1e-6) notes.push(`Outline ${o.id} is cut through the full stock height: hold the part by tabs, a vacuum table or a sacrificial plate`)
    reachNote(tool, depth, `Outline ${o.id}`)
    finishes.push({ id: `finish-${o.id}`, name: `Finish walls of ${o.id}`, strategy: "profile", tool: tool.id, loop: ccw(o.outer), side: "outside", top: o.top, bottom: o.bottom, allowance: 0, finish: true })
  }

  for (const p of pocketRegions) {
    const depth = p.top - p.floor
    if (depth <= 1e-6) continue
    const loop = ccw(p.loop)
    const radius = inscribedRadius(loop)
    const tool = endMill(Math.min(maxRough, 1.6 * radius), depth)
    if (tool === undefined) { unmachined.push(`Pocket ${p.id}: no end mill fits its ${r3(2 * radius)} mm width`); continue }
    reachNote(tool, depth, `Pocket ${p.id}`)
    const through = p.floor <= partBottom + 1e-6
    const floor = through ? p.floor - 0.3 : p.floor
    if (through) notes.push(`Pocket ${p.id} is open at the bottom: cut 0.3 mm into the fixture plate`)
    const shrunk = offsetRing(loop, -allowance)
    if (2 * radius >= 3 * tool.diameter && shrunk !== undefined) {
      ops.push({ id: `rough-${p.id}`, name: `Adaptive rough ${p.id}`, strategy: "adaptive", tool: tool.id, region: { boundary: shrunk }, top: p.top, bottom: floor })
    } else {
      ops.push({ id: `rough-${p.id}`, name: `Rough ${p.id}`, strategy: "pocket", tool: tool.id, region: { boundary: loop }, top: p.top, bottom: floor, allowance })
    }
    finishes.push({ id: `finish-${p.id}`, name: `Finish walls of ${p.id}`, strategy: "profile", tool: tool.id, loop, side: "inside", top: p.top, bottom: floor, allowance: 0, finish: true })
  }

  // ------------------------------------------------------------ holes
  const holes = features.flatMap((f) => f.holes)
  const spot = tools.filter((t) => t.kind === "spot").sort((a, b) => a.diameter - b.diameter)
  const chamfers = tools.filter((t) => t.kind === "chamfer" || t.kind === "spot").sort((a, b) => a.diameter - b.diameter)
  type HoleCut = "drill" | "spot" | "ream" | "tap"
  type DrillGroup = { tool: Cutter; top: number; bottom: number; points: Vec2[]; cut: HoleCut; label?: string }
  const groups = new Map<string, DrillGroup>()
  const group = (tool: Cutter, top: number, bottom: number, at: Vec2, cut: HoleCut, label?: string): void => {
    const key = `${cut}|${tool.id}|${r3(top)}|${r3(bottom)}`
    const g = groups.get(key)
    if (g === undefined) groups.set(key, { tool, top, bottom, points: [at], cut, ...(label !== undefined ? { label } : {}) })
    else g.points.push(at)
  }
  const threads: OperationSpec[] = []
  const bores: OperationSpec[] = []
  for (const h of holes) {
    if (!isDown(h)) { unmachined.push(`Hole ${h.id} is not drilled from above: it needs another setup or 3+2 indexing`); continue }
    const at = { x: h.entry.x, y: h.entry.y }
    let top = h.entry.z
    if (h.kind === "counterbore" && h.headDiameter !== undefined && h.headDepth !== undefined && h.headDepth > 0) {
      const tool = endMill(Math.min(0.8 * h.headDiameter, maxRough), h.headDepth)
      if (tool === undefined) unmachined.push(`Counterbore of ${h.id}: no end mill below Ø${r3(0.8 * h.headDiameter)}`)
      else bores.push({ id: `cbore-${h.id}`, name: `Counterbore ${h.id} Ø${r3(h.headDiameter)}`, strategy: "bore", tool: tool.id, center: at, diameter: h.headDiameter, top, bottom: top - h.headDepth })
      top -= h.headDepth
    }
    const bottomOfHole = h.entry.z - h.depth
    const through = bottomOfHole <= partBottom + 1e-6
    // A fitted bore (H7 ...) is drilled under size and reamed, when the library has the reamer and its pre-drill.
    const reamer = h.fit !== undefined && h.thread === undefined
      ? tools.filter((t) => t.kind === "reamer" && Math.abs(t.diameter - h.diameter) <= 0.005 && t.fluteLength >= top - bottomOfHole).sort((a, b) => fit(b) - fit(a))[0]
      : undefined
    const preDrill = reamer === undefined ? undefined : drills.find((d) => Math.abs(d.diameter - reamDrill(h.diameter)) <= 0.02)
    if (h.fit !== undefined && h.thread === undefined && (reamer === undefined || preDrill === undefined)) {
      notes.push(`Hole ${h.id} Ø${r3(h.diameter)} ${h.fit}: ${reamer === undefined ? `no Ø${r3(h.diameter)} reamer` : `no Ø${reamDrill(h.diameter)} pre-drill`} in the library; it is drilled or bored, which does not hold ${h.fit}`)
    }
    const reaming = reamer !== undefined && preDrill !== undefined
    const drill = reaming ? preDrill : drills.find((d) => Math.abs(d.diameter - h.diameter) <= 0.02)
    if (drill !== undefined) {
      const tip = pointLength(drill)
      const bottom = through ? bottomOfHole - tip - 0.5 : bottomOfHole - tip
      if (!through) allowances.push({ center: at, radius: drill.diameter / 2, floor: bottomOfHole, depth: tip })
      const s = spot.find((t) => t.diameter >= Math.min(h.diameter, 6)) ?? spot[spot.length - 1]
      if (s !== undefined && h.diameter <= 20) {
        const target = Math.min(h.diameter - 0.2, s.diameter - 0.5)
        const depth = (target / 2) / Math.tan(((s.angle ?? 90) * Math.PI) / 360)
        if (depth > 0.05) group(s, top, top - depth, at, "spot")
      }
      group(drill, top, bottom, at, "drill")
      if (reaming) group(reamer!, top, through ? bottomOfHole - 0.5 : bottomOfHole, at, "ream", `Ream Ø${r3(h.diameter)} ${h.fit}`)
    } else {
      const tool = endMill(Math.min(0.75 * h.diameter, maxRough), top - bottomOfHole)
      if (tool === undefined || tool.diameter < 0.3 * h.diameter) {
        unmachined.push(`Hole ${h.id} Ø${r3(h.diameter)}: no drill of that size and no end mill to bore it`)
      } else {
        bores.push({ id: `bore-${h.id}`, name: `Helical bore ${h.id} Ø${r3(h.diameter)}`, strategy: "bore", tool: tool.id, center: at, diameter: h.diameter, top, bottom: through ? bottomOfHole - 0.3 : bottomOfHole })
      }
    }
    if (h.kind === "countersink" && h.headDiameter !== undefined) {
      const tool = chamfers.find((t) => t.diameter >= h.headDiameter! + 0.5 && (t.angle ?? 90) === 90)
      if (tool === undefined) unmachined.push(`Countersink of ${h.id}: no 90° spot / chamfer tool larger than Ø${r3(h.headDiameter)}`)
      else group(tool, h.entry.z, h.entry.z - (h.headDiameter / 2 - (tool.tipDiameter ?? 0) / 2), at, "spot")
    }
    if (h.thread !== undefined) {
      const { diameter, pitch } = h.thread
      if (diameter === undefined || pitch === undefined) { unmachined.push(`Hole ${h.id}: thread ${h.thread.designation} is not a metric size the kernel mills`); continue }
      // Rigid tapping when the control taps, the library has the tap, the material does not break it, and a blind hole leaves room
      // under the thread for the tap's lead (2.5 pitches of form C); otherwise the thread is milled.
      const threadLength = Math.min(h.thread.depth, h.depth)
      const tapTip = top - threadLength - 2.5 * pitch
      const tapTool = input.rigidTap === true && material.iso !== "H"
        ? tools.filter((t) => t.kind === "tap" && Math.abs(t.diameter - diameter) < 1e-6 && t.pitch !== undefined && Math.abs(t.pitch - pitch) < 1e-9 && t.fluteLength >= threadLength).sort((a, b) => fit(b) - fit(a))[0]
        : undefined
      if (tapTool !== undefined && (through || tapTip >= bottomOfHole - 1e-6)) {
        group(tapTool, top, tapTip, at, "tap", `Tap ${h.thread.designation}`)
        if (through) notes.push(`Tap ${h.thread.designation} in ${h.id}: the lead runs ${r3(2.5 * pitch)} mm below the part; the parallels must leave that room`)
        continue
      }
      if (tapTool !== undefined) notes.push(`Hole ${h.id}: ${tapTool.name} needs ${r3(threadLength + 2.5 * pitch)} mm for the thread and its lead, the hole is ${r3(h.depth)} mm deep: the thread is milled`)
      const mill = tools.filter((t) => t.kind === "threadmill" && t.pitch !== undefined && Math.abs(t.pitch - pitch) < 1e-9 && t.diameter < Math.min(h.diameter, threadMinorDiameter(diameter, pitch, true)) - 0.1)
        .sort((a, b) => b.diameter - a.diameter)[0]
      if (mill === undefined) unmachined.push(`Hole ${h.id}: no thread mill for ${h.thread.designation} (P${pitch}) that fits the Ø${r3(threadMinorDiameter(diameter, pitch, true))} minor diameter`)
      else threads.push({ id: `thread-${h.id}`, name: `Thread mill ${h.thread.designation} in ${h.id}`, strategy: "thread", tool: mill.id, center: at, diameter, pitch, internal: true, top, length: Math.min(h.thread.depth, h.depth) })
    } else if (drills.some((d) => Math.abs(d.diameter - h.diameter) <= 0.02) && [3.3, 4.2, 5, 6.8, 8.5, 10.2].some((t) => Math.abs(t - h.diameter) < 0.051)) {
      notes.push(`Hole ${h.id} Ø${r3(h.diameter)} is a tap-drill size but has no thread note: it is drilled, not threaded`)
    }
  }
  ops.push(...bores)
  const ORDER: Readonly<Record<HoleCut, number>> = { spot: 0, drill: 1, ream: 2, tap: 3 }
  const sortedGroups = [...groups.values()].sort((a, b) => (a.cut === b.cut ? a.tool.diameter - b.tool.diameter : ORDER[a.cut] - ORDER[b.cut]))
  let counter = 0
  for (const g of sortedGroups) {
    counter++
    ops.push({
      id: `${g.cut}-${g.tool.id}-${counter}`,
      name: g.cut === "spot" ? `Spot / chamfer with ${g.tool.name}` : g.cut === "drill" ? `Drill Ø${g.tool.diameter} (${g.points.length} holes)` : `${g.label ?? g.tool.name} (${g.points.length} holes)`,
      strategy: "drill", tool: g.tool.id, points: g.points, top: g.top, bottom: g.bottom, cut: g.cut
    })
  }
  ops.push(...threads)
  ops.push(...finishes)

  // ------------------------------------------------------------ deburring
  if (input.deburr !== undefined && input.deburr > 0 && prismatic) {
    const w = input.deburr
    // Edges by the height of their top face: one chamfer operation per level.
    const levels = new Map<number, Array<{ points: ReadonlyArray<Vec2>; side: "outside" | "inside" }>>()
    const add = (top: number, points: ReadonlyArray<Vec2>, side: "outside" | "inside"): void => {
      const key = r3(top)
      const list = levels.get(key) ?? (levels.set(key, []), levels.get(key)!)
      list.push({ points: ccw(points), side })
    }
    for (const o of outlines) add(o.top, o.outer, "outside")
    for (const p of pocketRegions) add(p.top, p.loop, "inside")
    for (const h of holes) {
      if (!isDown(h) || h.kind === "countersink") continue
      const d = h.kind === "counterbore" && h.headDiameter !== undefined ? h.headDiameter : h.diameter
      add(h.entry.z, circleRing({ x: h.entry.x, y: h.entry.y }, d / 2), "inside")
    }
    // The smallest 90° cone whose top radius reaches the chamfer: small holes need a small cone.
    const cones = tools.filter((t) => t.kind === "chamfer" || t.kind === "spot").sort((a, b) => a.diameter - b.diameter)
    const reach = (t: Cutter): number => (t.kind === "spot" ? 0 : (t.tipDiameter ?? 0) / 2) + (w / Math.tan(((t.angle ?? 90) * Math.PI) / 360) + 0.2) * Math.tan(((t.angle ?? 90) * Math.PI) / 360)
    const cone = cones.find((t) => reach(t) <= t.diameter / 2 + 1e-9)
    if (cone === undefined) unmachined.push(`Deburring ${w} mm: no chamfer mill or spot drill reaches that width`)
    else {
      let n = 0
      for (const [top, loops] of [...levels.entries()].sort((a, b) => b[0] - a[0])) {
        n++
        ops.push({ id: `chamfer-${n}`, name: `Chamfer ${w} mm, edges at Z${top}`, strategy: "chamfer", tool: cone.id, loops, top, width: w })
      }
    }
  }

  // ------------------------------------------------------------ freeform bodies
  if (surfaceOnly) {
    const depth = stock.max.z - partBottom
    const rough = endMill(maxRough, Math.min(depth, 3 * maxRough))
    const dims = [input.bounds.max[0] - input.bounds.min[0], input.bounds.max[1] - input.bounds.min[1]]
    const ball = balls.find((b) => b.diameter <= Math.max(1, Math.min(10, Math.min(...dims) / 4)))
    if (rough === undefined) unmachined.push("No end mill for 3D roughing")
    else {
      ops.push({ id: "surface-rough", name: "3D adaptive roughing", strategy: "surface", mode: "roughing", clearing: "adaptive", tool: rough.id, allowance })
      if (rough.fluteLength < depth) notes.push(`3D roughing: ${rough.name} has ${rough.fluteLength} mm flutes for ${r3(depth)} mm of stock; deep walls rely on the shank clearance check`)
    }
    // Flat faces (the top only when it is not faced): finished at their exact height by a flat end mill before the ball runs over
    // them, so a floor or ledge is left flat instead of with the ball's cusps.
    const ledges = (input.flats ?? []).filter((f) => f.z > partBottom + 1e-6 && (f.z < partTop - 1e-6 || faceDepth <= 0.005))
    const flatMill = millers.find((t) => t.kind === "flat" && t.diameter <= (rough?.diameter ?? maxRough) + 1e-9 && ledges.some((f) => f.area >= Math.PI * (t.diameter / 2) ** 2))
    if (flatMill !== undefined) ops.push({ id: "surface-flats", name: "3D flat-area finishing", strategy: "surface", mode: "flat", tool: flatMill.id, allowance: 0 })
    if (ball === undefined) unmachined.push("No ball mill for 3D finishing")
    else {
      // One finish: waterline on the walls, raster on the flats (each where it keeps the cusp; no pass repeated over the other).
      ops.push({ id: "surface-finish", name: "3D steep and shallow finishing", strategy: "surface", mode: "steep-shallow", tool: ball.id, allowance: 0, scallop: input.scallop, angle: 45 })
    }
    if (prismatic) notes.push(`Elements without a feature history are machined with the 3D strategies: ${freeform.map((e) => String(e["name"] ?? e["type"])).join(", ")}`)
  }
  if (material.iso === "H" && ops.some((o) => o.strategy === "pocket")) notes.push(`${material.name}: contour pocketing at full width is hard on the cutter; adaptive clearing is preferred`)
  return { operations: ops, notes, unmachined, allowances }
}
