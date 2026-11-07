/**
 * Hole-making cycles beyond drill / tap / ream (spec 72 P2-5, spec 54): each one is a toolpath of its own with the depths, the
 * retract policy and the tool the cycle really needs, and refuses with the reason when the tool or the hole cannot do it.
 *
 *   countersink  a countersink cutter plunged to the cone depth of the finished diameter (`countersinkDepth`), dwelling at the bottom
 *   deep         gun-drill style pecking: the first peck, shrinking pecks, a chip-break lift or a full retract after each,
 *                a full retract every n pecks in chip-break mode (explicit moves, so the policy is visible in the program)
 *   back-bore    a boring bar goes through the pilot hole, is brought onto the axis below the far face, and bores upwards
 *   tilted       holes along other axes than Z: the toolpath is made in the hole's own work frame and carried to the
 *                indexed (3+2) machine (`indexing.ts`), one orientation per hole direction
 *
 * All Z values are work coordinates (zero at the chosen origin); the sites of a tilted cycle are CAD world mm shifted by `origin`.
 * Spindle orientation (M19 / SPOS) of a back-boring bar is the IR move `SpindleOrient` (insert towards +X is angle 0), written by every
 * post with the control's own word or refused; the X shifts are real moves, so the path is the one the machine must make.
 */
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import { optimizedOrder } from "../geometry.ts"
import { CHIP_BREAK_RETRACT, PECK_CLEARANCE, moveTarget, type Coolant, type Move, type Toolpath } from "../ir.ts"
import { anglesFor, frameFromNormal, indexToolpath, type RotaryLayout, type RotaryLimits } from "../indexing.ts"
import { worldToWork } from "../setup.ts"
import { countersinkDepth, pointLength, toothWidth, type Cutter } from "../kernel/cutters.ts"
import type { HoleCycle } from "../kernel/contracts.ts"
import { MoveBuilder } from "./common.ts"

/** Machine data a tilted cycle needs: how the rotaries turn the part and the Z the tool is lifted to between orientations. */
export interface HoleIndexing {
  readonly layout: RotaryLayout
  /** The centre the table turns about, machine (work) coordinates. */
  readonly pivot: Vec3
  readonly limits?: RotaryLimits
  /** Machine Z the tool is raised to before the table turns: above the part in every orientation. */
  readonly safeZ: number
}

export interface HoleCycleInput {
  readonly id: string
  readonly name: string
  readonly cycle: HoleCycle
  readonly tool: Cutter
  /** Hole axes in work XY (not used by a tilted cycle, which carries its own sites). */
  readonly points: ReadonlyArray<Vec2>
  /** Work Z of the surface the holes open in, and of the lowest point of the tool tip. */
  readonly top: number
  readonly bottom: number
  readonly clearanceZ: number
  /** The R plane: where the tool parks between holes and pecks (at or above `top`). */
  readonly retractZ: number
  readonly feed: number
  readonly rpm: number
  readonly coolant: Coolant
  /** Work zero in CAD world (tilted sites are shifted by it). */
  readonly origin?: Vec3
  readonly indexing?: HoleIndexing
  /**
   * Back-boring through a pilot whose `pilotOutline` is not round: which angles the spindle may be oriented to. `"mark"` (the default): only the
   * control's own mark, angle 0 (plain `M19` takes no angle); `"any"`: the post writes an angle (Haas, Siemens, LinuxCNC, Heidenhain), so the bar
   * is turned to whichever angle leaves it the most room.
   */
  readonly orient?: "mark" | "any"
}

const MAX_PECKS = 100_000

const finish = (input: HoleCycleInput, moves: ReadonlyArray<Move>): Toolpath =>
  ({ id: input.id, name: input.name, toolId: input.tool.id, spindleRpm: input.rpm, coolant: input.coolant, moves })

const need = (ok: boolean, message: string): void => {
  if (!ok) throw new RangeError(message)
}

const basics = (i: HoleCycleInput): void => {
  need([i.top, i.bottom, i.clearanceZ, i.retractZ, i.feed, i.rpm].every(Number.isFinite), `${i.id}: the levels, feed and speed must be finite numbers`)
  need(i.feed > 0 && i.rpm > 0, `${i.id}: the feed and the speed must be positive`)
  need(i.top > i.bottom, `${i.id}: the hole must go down (top ${i.top} is not above bottom ${i.bottom})`)
  need(i.retractZ >= i.top - 1e-9 && i.clearanceZ >= i.retractZ - 1e-9, `${i.id}: the heights must satisfy clearance >= retract >= surface`)
}

// ---------------------------------------------------------------- countersink

/**
 * A countersink: the cone is plunged until its flank reaches `cycle.diameter` at the surface and held for two revolutions (a
 * dwell cycle, G82). `bottom` must be the cone depth below the surface; a different `bottom` would cut another diameter, so it refuses.
 */
export const generateCountersink = (i: HoleCycleInput): Toolpath => {
  basics(i)
  const c = i.cycle
  need(c.kind === "countersink", `${i.id}: not a countersink cycle`)
  if (c.kind !== "countersink") throw new Error("unreachable")
  need(i.tool.kind === "countersink", `${i.id}: a countersink cycle needs a countersink cutter, ${i.tool.id} is a ${i.tool.kind}`)
  const depth = countersinkDepth(i.tool, c.diameter)
  need(Math.abs(i.top - i.bottom - depth) <= 1e-4, `${i.id}: the cone of ${i.tool.id} reaches Ø${c.diameter} at ${depth.toFixed(4)} mm, but the operation goes ${(i.top - i.bottom).toFixed(4)} mm deep`)
  const b = new MoveBuilder()
  b.comment(`Countersink Ø${c.diameter}: ${i.name}`)
  optimizedOrder(i.points).forEach((p, k) => {
    if (k === 0) b.rapid({ x: p.x, y: p.y, z: i.clearanceZ })
    b.push({ _tag: "Cycle", cycle: "dwell", to: { x: p.x, y: p.y, z: i.bottom }, feed: i.feed, peckDepth: 0, dwellSeconds: Math.max(0.1, Math.round((2 * 60 / i.rpm) * 1000) / 1000), retractHeight: i.retractZ })
  })
  if (i.points.length === 0) b.comment("nothing to countersink: no hole positions")
  if (b.started) b.rapid({ x: b.pos.x, y: b.pos.y, z: i.clearanceZ })
  return finish(i, b.moves)
}

// ---------------------------------------------------------------- deep-hole

/**
 * Cumulative depths below the surface of the pecks of a deep hole: the first peck is `peck`, each next one `reduction` shorter, none
 * shorter than `minPeck` (default: `peck` without a reduction, a quarter of it with one); the last is clipped to `depth`.
 */
export const peckSchedule = (depth: number, peck: number, reduction = 0, minPeck?: number): ReadonlyArray<number> => {
  need(depth > 0 && peck > 0 && reduction >= 0, `peckSchedule: depth ${depth}, peck ${peck} and reduction ${reduction} must be positive, positive and not negative`)
  const floor = Math.min(peck, minPeck ?? (reduction > 0 ? peck / 4 : peck))
  const out: number[] = []
  let d = 0
  for (let k = 0; d < depth - 1e-9; k++) {
    d = Math.min(depth, d + Math.max(floor, peck - k * reduction))
    out.push(d)
    need(out.length <= MAX_PECKS, "peckSchedule: more than 100000 pecks")
  }
  return out
}

/**
 * Deep-hole pecking with an explicit retract policy. Per hole: the tool goes to the R plane over the hole, then for every peck feeds to
 * its depth and retracts as the policy says: `full` to the R plane (rapid back down to `PECK_CLEARANCE` above the last depth), or
 * `chip-break` by `chipBreakRetract` (default `CHIP_BREAK_RETRACT`), with a full retract every `fullRetractEvery` pecks. Dwell at the
 * bottom, then a full retract. Rapids never move in XY.
 */
export const generateDeepHole = (i: HoleCycleInput): Toolpath => {
  basics(i)
  const c = i.cycle
  if (c.kind !== "deep") throw new RangeError(`${i.id}: not a deep-hole cycle`)
  need(i.tool.kind === "drill", `${i.id}: a deep-hole cycle needs a drill, ${i.tool.id} is a ${i.tool.kind}`)
  need(c.peck > 0, `${i.id}: the peck must be positive`)
  const lift = c.chipBreakRetract ?? CHIP_BREAK_RETRACT
  need(lift > 0, `${i.id}: the chip-break retract must be positive`)
  const surface = i.top
  const schedule = peckSchedule(i.top - i.bottom, c.peck, c.peckReduction ?? 0, c.minPeck)
  const every = c.fullRetractEvery ?? 0
  const b = new MoveBuilder()
  b.comment(`Deep hole (${schedule.length} pecks, ${c.retract} retract): ${i.name}`)
  optimizedOrder(i.points).forEach((p, k) => {
    if (k === 0) b.rapid({ x: p.x, y: p.y, z: i.clearanceZ })
    b.rapid({ x: p.x, y: p.y, z: i.retractZ })
    schedule.forEach((d, n) => {
      const z = surface - d
      b.linear({ x: p.x, y: p.y, z }, i.feed)
      if (n === schedule.length - 1) return
      const full = c.retract === "full" || (every > 0 && (n + 1) % every === 0)
      if (full) {
        b.rapid({ x: p.x, y: p.y, z: i.retractZ })
        b.rapid({ x: p.x, y: p.y, z: Math.min(i.retractZ, z + PECK_CLEARANCE) })
      } else b.rapid({ x: p.x, y: p.y, z: Math.min(i.retractZ, z + lift) })
    })
    if ((c.dwell ?? 0) > 0) b.dwell(c.dwell!)
    b.rapid({ x: p.x, y: p.y, z: i.retractZ })
  })
  if (i.points.length === 0) b.comment("nothing to drill: no hole positions")
  if (b.started) b.rapid({ x: b.pos.x, y: b.pos.y, z: i.clearanceZ })
  return finish(i, b.moves)
}

// ---------------------------------------------------------------- back-bore

/** Radial room kept between a boring bar and the wall of the pilot hole it passes through, mm. */
export const BACK_BORE_CLEARANCE = 0.2

/**
 * How far from the hole axis a back-boring bar reaches while it passes the pilot shifted by `-Q` along X (oriented so that insert 0 points
 * to +X): the farthest corner of any insert about the shifted spindle axis, or the body (`Q` + body radius), whichever is more, mm.
 * `flutes` inserts stand evenly about the axis, each `insertWidth` wide (a point when absent): a wider insert has corners to either side of
 * its centre line, which reach farther from the hole axis than the tip alone.
 */
export const backBoreReach = (tool: Cutter, q: number): number => {
  const R = tool.diameter / 2
  const body = (tool.neckDiameter ?? 0) / 2
  const teeth = Math.max(1, Math.round(tool.flutes))
  const half = tool.insertWidth === undefined ? 0 : Math.asin(Math.min(1, tool.insertWidth / 2 / R))
  let reach = body + q
  for (let k = 0; k < teeth; k++) {
    const centre = (2 * Math.PI * k) / teeth
    for (const angle of half === 0 ? [centre] : [centre - half, centre + half]) reach = Math.max(reach, Math.hypot(R * Math.cos(angle) - q, R * Math.sin(angle)))
  }
  return reach
}

/** A point of a pilot outline, mm, from the hole axis. */
export interface PilotPoint { readonly x: number; readonly y: number }

/** Signed distance from (x, y) to the closed outline: positive inside, negative outside, mm. */
export const outlineMargin = (outline: ReadonlyArray<PilotPoint>, x: number, y: number): number => {
  let inside = false, best = Infinity
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j]!, b = outline[i]!
    if ((b.y > y) !== (a.y > y) && x < ((a.x - b.x) * (y - b.y)) / (a.y - b.y) + b.x) inside = !inside
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)))
  }
  return inside ? best : -best
}

/**
 * Points along the plan boundary of a bar standing still, oriented `angle` degrees from +X with its axis at (ax, ay): the neck (a circle)
 * and each insert (a strip `toothWidth` wide, at least 1 mm, from the axis to the head radius), sampled every 0.2 mm or so.
 */
const barBoundary = (tool: Cutter, angle: number, ax: number, ay: number): ReadonlyArray<PilotPoint> => {
  const R = tool.diameter / 2, neck = (tool.neckDiameter ?? 0) / 2
  const out: PilotPoint[] = []
  const n = Math.max(24, Math.ceil((2 * Math.PI * neck) / 0.2))
  for (let k = 0; k < n; k++) out.push({ x: ax + neck * Math.cos((2 * Math.PI * k) / n), y: ay + neck * Math.sin((2 * Math.PI * k) / n) })
  const teeth = Math.max(1, Math.round(tool.flutes)), hw = toothWidth(tool) / 2
  const xe = Math.sqrt(Math.max(R * R - hw * hw, 0)), edge = Math.max(2, Math.ceil(xe / 0.2)), arc = Math.max(2, Math.ceil((2 * hw) / 0.2))
  for (let t = 0; t < teeth; t++) {
    const a = (angle * Math.PI) / 180 + (2 * Math.PI * t) / teeth
    const c = Math.cos(a), s = Math.sin(a)
    const put = (u: number, v: number): void => { out.push({ x: ax + u * c - v * s, y: ay + u * s + v * c }) }
    for (let k = 0; k <= edge; k++) { const u = (xe * k) / edge; put(u, -hw); put(u, hw) }
    // The rim of the head between the two corners is an arc of radius R about the axis.
    const half = Math.asin(Math.min(1, hw / R))
    for (let k = 0; k <= arc; k++) { const phi = -half + (2 * half * k) / arc; put(R * Math.cos(phi), R * Math.sin(phi)) }
  }
  return out
}

/** How far the oriented bar, its axis moved `q` mm against the direction of its first insert, stands inside the outline everywhere, mm (negative: it touches). */
export const barMargin = (tool: Cutter, outline: ReadonlyArray<PilotPoint>, angle: number, q: number): number => {
  const a = (angle * Math.PI) / 180
  let margin = Infinity
  for (const p of barBoundary(tool, angle, -q * Math.cos(a), -q * Math.sin(a))) margin = Math.min(margin, outlineMargin(outline, p.x, p.y))
  return margin
}

/**
 * The pilot is not round (a slot, a hexagon, a keyway): the bar is turned to the angle and moved back by the shift that leave its teeth and body
 * the most room inside the outline, found by a search over the angle (5 degrees, then half a degree) and the shift (0.05 mm, then 0.01 mm).
 * Refused with the room it did have when that is under `BACK_BORE_CLEARANCE`.
 */
const backBoreThroughOutline = (tool: Cutter, outline: ReadonlyArray<PilotPoint>, orient: "mark" | "any"): { readonly shift: number; readonly angle: number } | { readonly reason: string } => {
  const R = tool.diameter / 2
  let best = { margin: -Infinity, angle: 0, q: 0 }
  const scan = (angles: ReadonlyArray<number>, qs: ReadonlyArray<number>): void => {
    for (const angle of angles) for (const q of qs) {
      const margin = barMargin(tool, outline, angle, q)
      if (margin > best.margin + 1e-12) best = { margin, angle, q }
    }
  }
  const steps = (from: number, to: number, step: number): number[] => { const out: number[] = []; for (let v = from; v <= to + 1e-9; v += step) out.push(v); return out }
  // A control that orients the spindle only to its own mark leaves the angle 0: the shift alone is searched.
  scan(orient === "any" ? steps(0, 355, 5) : [0], steps(0, R, 0.05))
  const a0 = best.angle, q0 = best.q
  scan(orient === "any" ? steps(a0 - 5, a0 + 5, 0.5).map((a) => ((a % 360) + 360) % 360) : [0], steps(Math.max(0, q0 - 0.1), q0 + 0.1, 0.01))
  if (best.margin < BACK_BORE_CLEARANCE - 1e-9) {
    const teeth = Math.round(tool.flutes)
    return { reason: `the Ø${tool.diameter} bar with ${teeth} insert${teeth > 1 ? "s" : ""}${tool.insertWidth !== undefined ? ` ${tool.insertWidth} mm wide` : ""} on a Ø${tool.neckDiameter} body does not pass the pilot outline${orient === "mark" ? " with the spindle oriented to the control's mark only (angle 0)" : ""}: at its best angle (${best.angle.toFixed(1)}°) and shift (${best.q.toFixed(2)} mm) it keeps ${best.margin.toFixed(2)} mm from the wall, ${BACK_BORE_CLEARANCE} mm clearance needed` }
  }
  return { shift: best.q, angle: Math.round(best.angle * 1e4) / 1e4 }
}

/**
 * The oriented shift of a back-boring bar, mm: with insert 0 pointing to +X the bar is moved by -Q so that its reach about the hole axis
 * (`backBoreReach`) is as small as it can be, then it clears the pilot wall by `BACK_BORE_CLEARANCE`. For one point insert that is
 * Q = (R - body radius) / 2 (the insert side R - Q and the body side Q + body radius get the same room); more inserts or a wider insert
 * reach farther and the shift is searched (the reach is convex in Q). Undefined, with the reason, when the bar cannot pass the pilot at all.
 */
export const backBoreShift = (tool: Cutter, pilotDiameter: number, outline?: ReadonlyArray<PilotPoint>, orient: "mark" | "any" = "mark"): { readonly shift: number; readonly angle?: number } | { readonly reason: string } => {
  const R = tool.diameter / 2
  const body = (tool.neckDiameter ?? 0) / 2
  if (!(body > 0)) return { reason: `${tool.id} has no body diameter (neckDiameter)` }
  if (outline !== undefined && outline.length >= 3) return backBoreThroughOutline(tool, outline, orient)
  const room = pilotDiameter / 2 - BACK_BORE_CLEARANCE
  const simple = Math.round(tool.flutes) <= 1 && tool.insertWidth === undefined
  let q = (R - body) / 2
  if (!simple) {
    let lo = 0, hi = R
    for (let i = 0; i < 80; i++) {
      const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3
      if (backBoreReach(tool, a) <= backBoreReach(tool, b)) hi = b; else lo = a
    }
    q = (lo + hi) / 2
  }
  const reach = simple ? (R + body) / 2 : backBoreReach(tool, q)
  if (reach > room + 1e-9) {
    const what = simple ? `the Ø${tool.diameter} bar on a Ø${tool.neckDiameter} body (needs ${(R + body).toFixed(2)} mm of pilot width` : `the Ø${tool.diameter} bar with ${Math.round(tool.flutes)} insert${Math.round(tool.flutes) > 1 ? "s" : ""}${tool.insertWidth !== undefined ? ` ${tool.insertWidth} mm wide` : ""} on a Ø${tool.neckDiameter} body (reaches ${(2 * reach).toFixed(2)} mm about the hole axis at its best shift`
    return { reason: `${what} plus ${(2 * BACK_BORE_CLEARANCE).toFixed(1)} mm clearance) does not pass the Ø${pilotDiameter} pilot hole` }
  }
  return { shift: q }
}

/**
 * Back-boring (G87-style, as explicit moves): over the pilot hole the bar is oriented (insert towards +X, or towards the angle that fits a
 * non-round `pilotOutline`) and shifted by `-Q` against the insert, goes
 * down through the pilot to `bottom` below the far face, is shifted back onto the axis, started (the post restarts the stopped spindle
 * before the first feed move), and fed upwards until the top of the insert is at `top` (the ceiling of the new bore), dwells, is
 * stopped and oriented again (`SpindleOrient`), shifted again, and withdrawn through the pilot.
 * `face` is the work Z of the far (under) face the bore starts at; the insert is wholly below it at the start.
 */
export const generateBackBore = (i: HoleCycleInput): Toolpath => {
  basics(i)
  const c = i.cycle
  if (c.kind !== "back-bore") throw new RangeError(`${i.id}: not a back-bore cycle`)
  const bar = i.tool
  need(bar.kind === "boringbar", `${i.id}: back-boring needs a boring bar, ${bar.id} is a ${bar.kind}`)
  need(Math.abs(bar.diameter - c.diameter) <= 0.01, `${i.id}: ${bar.id} is set to Ø${bar.diameter}, the back bore is Ø${c.diameter}`)
  need(c.diameter > c.pilotDiameter + 1e-9, `${i.id}: a Ø${c.diameter} back bore is not wider than the Ø${c.pilotDiameter} pilot hole`)
  const h = bar.headHeight ?? 0
  need(h > 0, `${i.id}: ${bar.id} has no insert height (headHeight)`)
  need(i.top > c.face + 1e-9, `${i.id}: the bore ceiling ${i.top} is not above the face ${c.face}`)
  need(i.bottom + h <= c.face - 0.1 + 1e-9, `${i.id}: the lowest tip ${i.bottom} leaves the insert (${h} mm) inside the face at ${c.face}`)
  need(bar.fluteLength >= i.retractZ - i.bottom - 1e-9, `${i.id}: the reach of ${bar.id} (${bar.fluteLength} mm) does not span the ${(i.retractZ - i.bottom).toFixed(1)} mm from the lowest tip to the R plane`)
  const shifted = backBoreShift(bar, c.pilotDiameter, c.pilotOutline, i.orient)
  if ("reason" in shifted) throw new RangeError(`${i.id}: ${shifted.reason}`)
  // The bar is moved back against its first insert: with the spindle oriented to `angle` the shift is -Q along that direction.
  const angle = shifted.angle ?? 0
  const sx = -shifted.shift * Math.cos((angle * Math.PI) / 180), sy = -shifted.shift * Math.sin((angle * Math.PI) / 180)
  const tipEnd = i.top - h
  const b = new MoveBuilder()
  b.comment(`Back bore Ø${c.diameter} from the face at Z${c.face} up to Z${i.top}: ${i.name}`)
  optimizedOrder(i.points).forEach((p) => {
    b.rapid({ x: p.x, y: p.y, z: i.clearanceZ })
    b.push({ _tag: "SpindleOrient", angle })
    b.rapid({ x: p.x + sx, y: p.y + sy, z: i.clearanceZ })
    b.rapid({ x: p.x + sx, y: p.y + sy, z: i.bottom })
    b.rapid({ x: p.x, y: p.y, z: i.bottom })
    b.linear({ x: p.x, y: p.y, z: tipEnd }, i.feed)
    b.dwell(Math.max(0.2, Math.round((2 * 60 / i.rpm) * 1000) / 1000))
    b.push({ _tag: "SpindleOrient", angle })
    b.rapid({ x: p.x + sx, y: p.y + sy, z: tipEnd })
    b.rapid({ x: p.x + sx, y: p.y + sy, z: i.clearanceZ })
    b.rapid({ x: p.x, y: p.y, z: i.clearanceZ })
  })
  if (i.points.length === 0) b.comment("nothing to bore: no hole positions")
  return finish(i, b.moves)
}

// ---------------------------------------------------------------- tilted drilling

const key = (d: Vec3): string => `${d.x.toFixed(6)},${d.y.toFixed(6)},${d.z.toFixed(6)}`

const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z)
  need(l > 1e-9, "a hole direction must not be zero")
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

/**
 * Drilling along the feature's own axis on an indexed (3+2) machine. Sites with the same direction share one orientation: their
 * toolpath is made in a work frame whose z axis points out of the material along the hole (`frameFromNormal`), as a plain drill
 * cycle there, and carried to the machine by `indexToolpath`. Between orientations the tool is raised to `indexing.safeZ`. A direction
 * the rotary axes cannot reach within their limits refuses the whole operation (no site is dropped).
 */
export const generateTiltedDrill = (i: HoleCycleInput): Toolpath => {
  const c = i.cycle
  if (c.kind !== "tilted") throw new RangeError(`${i.id}: not a tilted cycle`)
  need(i.tool.kind === "drill", `${i.id}: tilted drilling needs a drill, ${i.tool.id} is a ${i.tool.kind}`)
  need(i.indexing !== undefined, `${i.id}: drilling along another axis than Z needs the rotary layout and pivot of the machine (indexing)`)
  const ix = i.indexing!
  need([i.clearanceZ, i.retractZ, i.top, i.feed, i.rpm].every(Number.isFinite) && i.feed > 0 && i.rpm > 0, `${i.id}: the heights, feed and speed must be finite and positive`)
  const gap = i.retractZ - i.top
  const clearGap = i.clearanceZ - i.top
  need(gap >= -1e-9 && clearGap >= gap - 1e-9, `${i.id}: the heights must satisfy clearance >= retract >= surface`)
  const o = i.origin ?? { x: 0, y: 0, z: 0 }
  const groups = new Map<string, { direction: Vec3; sites: Array<{ entry: Vec3; depth: number }> }>()
  for (const s of c.sites) {
    const direction = unit(s.direction)
    const g = groups.get(key(direction))
    const site = { entry: { x: s.entry.x - o.x, y: s.entry.y - o.y, z: s.entry.z - o.z }, depth: s.depth }
    if (g === undefined) groups.set(key(direction), { direction, sites: [site] })
    else g.sites.push(site)
  }
  const tip = pointLength(i.tool)
  const cycle = (c.peck ?? 0) > 0 ? (c.chipBreak === true ? "chipBreak" : "peck") : "drill"
  const out: Move[] = [{ _tag: "Comment", text: `Tilted drilling: ${i.name}` }]
  for (const g of groups.values()) {
    const normal = { x: -g.direction.x, y: -g.direction.y, z: -g.direction.z }
    if (anglesFor(normal, ix.layout, ix.limits).length === 0) {
      throw new RangeError(`${i.id}: the rotary axes cannot reach the hole direction (${g.direction.x.toFixed(3)}, ${g.direction.y.toFixed(3)}, ${g.direction.z.toFixed(3)}) within their limits`)
    }
    const frame = frameFromNormal(g.sites[0]!.entry, normal)
    const local = g.sites.map((s) => ({ at: worldToWork(frame, s.entry), depth: s.depth }))
    // The sites of one direction may lie at different heights along the axis: each carries its own R plane and bottom.
    const b = new MoveBuilder()
    const ordered = optimizedOrder(local.map((s) => ({ x: s.at.x, y: s.at.y })))
    const topMost = Math.max(...local.map((s) => s.at.z))
    const used = new Set<number>()
    for (const [k, p] of ordered.entries()) {
      const at = local.findIndex((l, n) => !used.has(n) && Math.abs(l.at.x - p.x) < 1e-9 && Math.abs(l.at.y - p.y) < 1e-9)
      used.add(at)
      const s = local[at]!
      if (k === 0) b.rapid({ x: p.x, y: p.y, z: topMost + clearGap })
      b.push({
        _tag: "Cycle", cycle, to: { x: p.x, y: p.y, z: s.at.z - s.depth - tip }, feed: i.feed, peckDepth: c.peck ?? 0, dwellSeconds: 0, retractHeight: s.at.z + gap
      })
    }
    b.rapid({ x: b.pos.x, y: b.pos.y, z: topMost + clearGap })
    const indexed = indexToolpath(finish(i, b.moves), { frame, layout: ix.layout, pivot: ix.pivot, ...(ix.limits !== undefined ? { limits: ix.limits } : {}) })
    // After the table has turned the tool is brought over the first hole at the safe height and only then goes down: a diagonal rapid
    // from the safe height would cut across the turned table.
    const turned = indexed.toolpath.moves
    const at = turned.findIndex((m) => m._tag === "Orient")
    const firstHole = at < 0 ? undefined : turned.slice(at + 1).map(moveTarget).find((t): t is Vec3 => t !== undefined)
    if (at >= 0 && firstHole !== undefined) {
      out.push(...turned.slice(0, at + 1), { _tag: "Rapid", to: { x: firstHole.x, y: firstHole.y, z: Math.max(ix.safeZ, firstHole.z) } }, ...turned.slice(at + 1))
    } else out.push(...turned)
    const last = out.map(moveTarget).filter((t): t is Vec3 => t !== undefined).pop()
    if (last !== undefined) out.push({ _tag: "Rapid", to: { x: last.x, y: last.y, z: Math.max(ix.safeZ, last.z) } })
  }
  return finish(i, out)
}

// ---------------------------------------------------------------- dispatch

/** The toolpath of an operation's hole cycle; refuses (throws a `RangeError` with the reason) what the tool or the hole cannot do. */
export const generateHoleCycle = (i: HoleCycleInput): Toolpath => {
  switch (i.cycle.kind) {
    case "countersink": return generateCountersink(i)
    case "deep": return generateDeepHole(i)
    case "back-bore": return generateBackBore(i)
    case "tilted": return generateTiltedDrill(i)
  }
}
