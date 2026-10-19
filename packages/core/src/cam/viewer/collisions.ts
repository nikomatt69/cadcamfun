/**
 * Collisions on the playback timeline (spec 32 §4.6, P7), the same clock the preview draws:
 *
 *   RAPID_INTO_STOCK   a rapid that goes down or across below the stock top inside the stock (a straight retract is not one)
 *   SHANK_IN_STOCK     the tool goes deeper into the stock than its cutting length: the shank rubs
 *   HOLDER_IN_STOCK    deeper than its stickout: the holder hits the part
 *   MACHINE_COLLISION  a head-side body of the machine model (ram, spindle housing, fork) meets a part-side one (table,
 *                      cradle, platter, workholding, stock) at a move's end or middle
 *
 * The stock is the raw box (its top, not the material left by earlier moves): the stock checks are conservative inside a
 * pocket that has already been opened, and say so. Bodies are compared by their axis-aligned bounds after the pose, also
 * conservative; every event says what was compared.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { ToolModel } from "../tool-model.ts"
import type { MachineSetup } from "./machine-setup.ts"
import { machineBodies } from "./machine-bodies.ts"
import { apply4, machinePose, type MachineModel, type Mat4, type ModelBody } from "./machine-model.ts"
import type { RotarySetup } from "./rotary.ts"
import { pointOn, type Timeline } from "./timeline.ts"

export type CollisionCode = "RAPID_INTO_STOCK" | "SHANK_IN_STOCK" | "HOLDER_IN_STOCK" | "MACHINE_COLLISION"

export interface CollisionEvent {
  readonly code: CollisionCode
  readonly severity: "error" | "warning"
  /** Playback time of the first contact, the move (timeline index) and its source line. */
  readonly seconds: number
  readonly move: number
  readonly line?: number
  /** How many moves have this contact. */
  readonly count: number
  /** How deep (stock checks, mm) or which bodies (machine). */
  readonly depth?: number
  readonly bodies?: readonly [string, string]
  readonly message: string
}

/** The reach of a tool: cutting length and stickout from the tip, radii of shank and holder. */
export interface ToolReach { readonly flute: number; readonly stickout: number; readonly shank: number; readonly holder: number }

export const toolReachOf = (model: ToolModel | undefined): ToolReach | undefined => {
  if (model === undefined || model.family !== "mill") return undefined
  return { flute: model.fluteLength, stickout: model.stickout, shank: model.shankDiameter / 2, holder: (model.holder?.diameter ?? Math.max(model.shankDiameter * 1.6 + 12, 22)) / 2 }
}

interface Box { readonly min: Vec3; readonly max: Vec3 }
const overlap = (a: Box, b: Box, margin = 0): boolean =>
  a.min.x < b.max.x - margin && a.max.x > b.min.x + margin && a.min.y < b.max.y - margin && a.max.y > b.min.y + margin && a.min.z < b.max.z - margin && a.max.z > b.min.z + margin

/** Bounds of a model body after a link transform. */
const boundsOf = (body: ModelBody, m: Mat4): Box => {
  const pts: Vec3[] = []
  if (body.shape.type === "box") {
    const { min, max } = body.shape
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) pts.push(apply4(m, { x, y, z }))
  } else {
    const { axis, center, radius, length } = body.shape
    const h = length / 2
    const ends = axis === "x" ? [{ x: center.x - h, y: center.y, z: center.z }, { x: center.x + h, y: center.y, z: center.z }]
      : axis === "y" ? [{ x: center.x, y: center.y - h, z: center.z }, { x: center.x, y: center.y + h, z: center.z }]
      : [{ x: center.x, y: center.y, z: center.z - h }, { x: center.x, y: center.y, z: center.z + h }]
    const a = apply4(m, ends[0]!), b = apply4(m, ends[1]!)
    // The end discs: along each coordinate a disc of normal d reaches r·sqrt(1 - d_i²), not r along the axis itself.
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len, z: (b.z - a.z) / len }
    const e = { x: radius * Math.sqrt(Math.max(0, 1 - d.x * d.x)), y: radius * Math.sqrt(Math.max(0, 1 - d.y * d.y)), z: radius * Math.sqrt(Math.max(0, 1 - d.z * d.z)) }
    for (const p of [a, b]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push({ x: p.x + sx * e.x, y: p.y + sy * e.y, z: p.z + sz * e.z })
  }
  return { min: { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)), z: Math.min(...pts.map((p) => p.z)) }, max: { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)), z: Math.max(...pts.map((p) => p.z)) } }
}
const moved = (b: Box, m: Mat4): Box => {
  const pts: Vec3[] = []
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(apply4(m, { x, y, z }))
  return { min: { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)), z: Math.min(...pts.map((p) => p.z)) }, max: { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)), z: Math.max(...pts.map((p) => p.z)) } }
}

export interface CollisionInput {
  readonly setup: MachineSetup
  readonly timeline: Timeline
  /** Each toolpath's tool (the preview's models). */
  readonly reachOf: (path: number) => ToolReach | undefined
  /** The machine drawn round the part, its rotary set-up and each toolpath's tip-to-nose length. */
  readonly model?: MachineModel
  readonly rotary?: RotarySetup
  readonly gaugeOf?: (path: number) => number
}

const HEAD_SIDE = new Set(["head", "spindle", "fork"])
const PART_SIDE = new Set(["table", "cradle", "platter"])

export const checkCollisions = (input: CollisionInput): ReadonlyArray<CollisionEvent> => {
  const { setup, timeline } = input
  if (setup.kind !== "mill") return []
  const stock = setup.stock
  const top = stock.max.z
  const events = new Map<string, CollisionEvent>()
  const add = (key: string, event: Omit<CollisionEvent, "count">) => {
    const was = events.get(key)
    events.set(key, was === undefined ? { ...event, count: 1 } : { ...was, count: was.count + 1, ...(event.depth !== undefined && (was.depth ?? 0) < event.depth ? { depth: event.depth } : {}) })
  }
  const inside = (p: Vec3, r: number) => p.x > stock.min.x - r && p.x < stock.max.x + r && p.y > stock.min.y - r && p.y < stock.max.y + r
  const workholding = machineBodies(setup).filter((b) => b.obstacle && b.role !== "table" && b.shape.type === "box").map((b) => ({ id: `${b.role}:${b.id}`, box: b.shape as Box }))
  const partBoxes: Array<{ id: string; box: Box }> = [{ id: "stock", box: stock }, ...workholding]
  timeline.moves.forEach((m, i) => {
    if (m.kind === "dwell" || m.state.probe) return
    const line = m.state.line
    const at = { seconds: m.start, move: i, ...(line !== undefined ? { line } : {}) }
    const reach = input.reachOf(m.path)
    // A rapid below the top inside the stock: sampled along the move (the stock is a box, the rapid a line).
    // The deepest sampled point of the move that lies over the stock (within `r` of it).
    const deepest = (r: number): number | undefined => {
      let low: number | undefined
      for (let k = 0; k <= 16; k++) { const p = pointOn(m, k / 16); if (inside(p, r) && p.z > stock.min.z - 1e-6 && (low === undefined || p.z < low)) low = p.z }
      return low
    }
    // A straight retract out of where the tool just cut is not a crash: only rapids that go down or across are checked.
    const retract = m.to.z > m.from.z && Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y) < 1e-6
    if (m.kind === "rapid" && !retract) {
      const low = deepest(0)
      if (low !== undefined && low < top - 1e-6) add(`rapid:${i}`, { code: "RAPID_INTO_STOCK", severity: "error", ...at, depth: top - low, message: `rapid ${Math.round((top - low) * 100) / 100} mm into the stock at line ${line ?? "?"}` })
    }
    // Shank / holder deeper than the cutting length / stickout, over the stock.
    if (reach !== undefined && m.kind === "feed") {
      const underHolder = deepest(reach.holder), underShank = deepest(reach.shank)
      if (underHolder !== undefined && top - underHolder > reach.stickout + 1e-6) add("holder", { code: "HOLDER_IN_STOCK", severity: "error", ...at, depth: top - underHolder, message: `the holder is ${Math.round((top - underHolder - reach.stickout) * 100) / 100} mm into the stock (stickout ${reach.stickout} mm, against the stock top)` })
      else if (underShank !== undefined && top - underShank > reach.flute + 1e-6) add("shank", { code: "SHANK_IN_STOCK", severity: "warning", ...at, depth: top - underShank, message: `the shank is ${Math.round((top - underShank - reach.flute) * 100) / 100} mm below the stock top (cutting length ${reach.flute} mm; against the raw top, an opened pocket may clear it)` })
    }
  })
  // The machine: head-side bodies against part-side ones at each move's end and middle.
  if (input.model !== undefined) {
    const model = input.model
    const heads = model.bodies.filter((b) => HEAD_SIDE.has(b.link))
    const parts = model.bodies.filter((b) => PART_SIDE.has(b.link))
    timeline.moves.forEach((m, i) => {
      if (m.kind === "dwell") return
      for (const f of [0.5, 1]) {
        const angles = f === 1 ? m.angles : Object.fromEntries((["a", "b", "c"] as const).filter((k) => m.anglesFrom[k] !== undefined || m.angles[k] !== undefined).map((k) => [k, ((m.anglesFrom[k] ?? 0) + (m.angles[k] ?? 0)) / 2]))
        const pose = machinePose(model, pointOn(m, f), angles, input.rotary, input.gaugeOf?.(m.path) ?? 60, "machine")
        const headBoxes = heads.map((b) => ({ id: b.id, box: boundsOf(b, pose.links[b.link]) }))
        const others = [...parts.map((b) => ({ id: b.id, box: boundsOf(b, pose.links[b.link]) })), ...partBoxes.map((p) => ({ id: p.id, box: moved(p.box, pose.part) }))]
        for (const h of headBoxes) for (const o of others) {
          if (!overlap(h.box, o.box, 0.01)) continue
          add(`machine:${h.id}:${o.id}`, { code: "MACHINE_COLLISION", severity: model.assumed.length > 0 ? "warning" : "error", seconds: m.start + m.duration * f, move: i, ...(m.state.line !== undefined ? { line: m.state.line } : {}), bodies: [h.id, o.id], message: `the ${h.id} meets the ${o.id}${model.assumed.length > 0 ? " (machine sizes assumed)" : ""}` })
          return
        }
      }
    })
  }
  return [...events.values()].sort((a, b) => a.seconds - b.seconds)
}
