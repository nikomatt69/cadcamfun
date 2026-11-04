/**
 * Cycle time with machine dynamics (spec 61 Z7, spec 69 G2): acceleration, jerk and a look-ahead that blends the blocks, instead of
 * length over feed.
 *
 * Each motion block is a straight run or an arc with a speed limit (its feed, and for an arc the centripetal limit sqrt(a r)).
 * Between two blocks the control may keep a junction speed that depends on the corner (full speed when tangent, zero for a reversal).
 * A look-ahead of `lookAhead` blocks forward and backward limits the junction speeds to what the accelerations can reach; without
 * look-ahead every block starts and ends at rest (exact stop). A ramp between two speeds is S-curved when `jerk` is finite:
 * t = 2 sqrt(dv / j) for dv <= a^2 / j, else dv / a + a / j, and its length is the mean speed times t. With infinite jerk the
 * profile is the plain trapezoid.
 *
 * The number is `uncalibrated` until it is compared with a recorded run of the machine (`calibrated: false` in the result).
 * Units: mm, mm/s, mm/s^2, mm/s^3, seconds; feeds arrive in mm/min.
 */
import { expandMoves, moveTarget, SPINDLE_ORIENT_SECONDS, type Move, type Program, type Toolpath } from "../ir.ts"
import type { GSegment } from "../testing/gcode-interpreter.ts"
import type { Vec3 } from "../../cad/vec.ts"

export interface MachineDynamics {
  /** Axis acceleration along the path, mm/s^2. */
  readonly acceleration: number
  /** Jerk limit, mm/s^3; `Infinity` (default) = a trapezoid. */
  readonly jerk?: number
  /** Blocks the control looks ahead; 0 = exact stop at every block end (default 0). */
  readonly lookAhead?: number
  /** Rapid traverse, mm/min. */
  readonly rapidFeed: number
  /** Corner angle (degrees) above which the path is taken at rest (default 135: shallow corners are blended, sharp ones stop). */
  readonly stopAngle?: number
}

/** Class presets: starting figures for a controller family, not a measurement of any machine. */
export const DYNAMICS_PRESETS: Readonly<Record<"economy" | "standard" | "high-speed", Omit<MachineDynamics, "rapidFeed">>> = {
  economy: { acceleration: 800, jerk: 8_000, lookAhead: 0 },
  standard: { acceleration: 2_500, jerk: 40_000, lookAhead: 20 },
  "high-speed": { acceleration: 6_000, jerk: 200_000, lookAhead: 200 }
}

interface Block {
  /** Path length, mm; 0 for a dwell. */
  readonly length: number
  /** Speed limit of the block, mm/s. */
  readonly vmax: number
  readonly dir0: Vec3
  readonly dir1: Vec3
  readonly dwell: number
}

export interface CycleTimeResult {
  readonly seconds: number
  /** The same program as length over feed (no dynamics). */
  readonly kinematicSeconds: number
  readonly blocks: number
  readonly calibrated: false
  readonly basis: string
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z)
  return l < 1e-12 ? { x: 0, y: 0, z: 0 } : { x: v.x / l, y: v.y / l, z: v.z / l }
}
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

/** Time to change speed from `v0` to `v1` (mm/s) and the distance covered. */
export const ramp = (v0: number, v1: number, a: number, jerk: number): { readonly t: number; readonly d: number } => {
  const dv = Math.abs(v1 - v0)
  if (dv < 1e-12) return { t: 0, d: 0 }
  const t = !Number.isFinite(jerk) || jerk <= 0 ? dv / a : dv <= (a * a) / jerk ? 2 * Math.sqrt(dv / jerk) : dv / a + a / jerk
  return { t, d: ((v0 + v1) / 2) * t }
}

/** The highest speed reachable from `v0` within `length` (rising) or from which `v0` is reachable (it is symmetric). */
const reach = (v0: number, length: number, a: number, jerk: number, cap: number): number => {
  if (ramp(v0, cap, a, jerk).d <= length) return cap
  let lo = v0
  let hi = cap
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (ramp(v0, mid, a, jerk).d <= length) lo = mid
    else hi = mid
  }
  return lo
}

/** Time of one block entered at `vin`, left at `vout`, cruising at most at `vmax`. */
const blockTime = (length: number, vin: number, vout: number, vmax: number, a: number, jerk: number): number => {
  if (length <= 1e-12) return 0
  const up = ramp(vin, vmax, a, jerk)
  const down = ramp(vmax, vout, a, jerk)
  if (up.d + down.d <= length) return up.t + down.t + (length - up.d - down.d) / vmax
  // The block is too short to reach vmax: find the peak speed vp with ramp(vin, vp) + ramp(vp, vout) = length.
  const floor = Math.max(vin, vout)
  let lo = floor
  let hi = vmax
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (ramp(vin, mid, a, jerk).d + ramp(mid, vout, a, jerk).d <= length) lo = mid
    else hi = mid
  }
  const r1 = ramp(vin, lo, a, jerk)
  const r2 = ramp(lo, vout, a, jerk)
  // When even the floor does not fit (vin and vout differ more than the block allows) the block runs at the nearer feasible speed.
  return r1.t + r2.t + Math.max(0, length - r1.d - r2.d) / Math.max(lo, 1e-9)
}

const junctionLimit = (a: Block, b: Block, stopAngle: number): number => {
  const cos = Math.max(-1, Math.min(1, dot(a.dir1, b.dir0)))
  const angle = (Math.acos(cos) * 180) / Math.PI
  if (angle >= stopAngle || (a.dir1.x === 0 && a.dir1.y === 0 && a.dir1.z === 0)) return 0
  // Tangent: the lower of the two limits; a corner scales it by the cosine so a right angle is slow and a gentle bend nearly full.
  return Math.min(a.vmax, b.vmax) * Math.max(0, cos)
}

/** Time of a block list under the dynamics. */
const timeBlocks = (blocks: ReadonlyArray<Block>, d: MachineDynamics): number => {
  const a = d.acceleration
  const jerk = d.jerk ?? Infinity
  const look = d.lookAhead ?? 0
  const stopAngle = d.stopAngle ?? 135
  let seconds = 0
  // A run of consecutive motion blocks is one look-ahead window; a dwell breaks it (the control stops).
  let run: Block[] = []
  const flush = (): void => {
    if (run.length === 0) return
    const n = run.length
    const v = new Array<number>(n + 1).fill(0)
    for (let i = 1; i < n; i++) v[i] = look > 0 ? junctionLimit(run[i - 1]!, run[i]!, stopAngle) : 0
    if (look > 0) {
      // The window is `look` blocks: a junction further than that from the block being run cannot be planned for, so it is taken at rest.
      for (let i = look; i < n; i += look + 1) v[i] = 0
      for (let i = 1; i < n; i++) v[i] = Math.min(v[i]!, reach(v[i - 1]!, run[i - 1]!.length, a, jerk, v[i]!))
      for (let i = n - 1; i >= 1; i--) v[i] = Math.min(v[i]!, reach(v[i + 1]!, run[i]!.length, a, jerk, v[i]!))
    }
    for (let i = 0; i < n; i++) seconds += blockTime(run[i]!.length, v[i]!, v[i + 1]!, run[i]!.vmax, a, jerk)
    run = []
  }
  for (const b of blocks) {
    if (b.dwell > 0 && b.length === 0) {
      flush()
      seconds += b.dwell
    } else run.push(b)
  }
  flush()
  return seconds
}

const basis = (d: MachineDynamics): string =>
  `Trapezoid/S-curve with acceleration ${d.acceleration} mm/s², jerk ${d.jerk ?? "unlimited"}, look-ahead ${d.lookAhead ?? 0} blocks; uncalibrated until compared with a recorded run of the machine`

const arcLimit = (radius: number, d: MachineDynamics, vmax: number): number => Math.min(vmax, Math.sqrt(d.acceleration * Math.max(radius, 1e-6)))

/** Cycle time of the IR toolpaths (cycles expanded), tool changes not included. */
export const dynamicCycleTime = (toolpaths: ReadonlyArray<Toolpath> | Program, d: MachineDynamics): CycleTimeResult => {
  const list = Array.isArray(toolpaths) ? (toolpaths as ReadonlyArray<Toolpath>) : (toolpaths as Program).toolpaths
  const blocks: Block[] = []
  let kinematic = 0
  for (const tp of list) {
    let from: Vec3 = tp.moves.length > 0 ? firstPoint(tp) : { x: 0, y: 0, z: 0 }
    for (const m of expandMoves(tp.moves, from)) {
      if (m._tag === "Dwell") {
        blocks.push({ length: 0, vmax: 1, dir0: { x: 0, y: 0, z: 0 }, dir1: { x: 0, y: 0, z: 0 }, dwell: m.seconds })
        kinematic += m.seconds
        continue
      }
      if (m._tag === "SpindleOrient") {
        blocks.push({ length: 0, vmax: 1, dir0: { x: 0, y: 0, z: 0 }, dir1: { x: 0, y: 0, z: 0 }, dwell: SPINDLE_ORIENT_SECONDS })
        kinematic += SPINDLE_ORIENT_SECONDS
        continue
      }
      const to = moveTarget(m as Move)
      if (to === undefined) continue
      const feed = m._tag === "Rapid" ? d.rapidFeed : (m as { feed: number }).feed
      const vmax = feed / 60
      if (m._tag === "Arc") {
        const r = Math.hypot(from.x - m.center.x, from.y - m.center.y)
        const a0 = Math.atan2(from.y - m.center.y, from.x - m.center.x)
        const a1 = Math.atan2(to.y - m.center.y, to.x - m.center.x)
        let sweep = m.clockwise ? a0 - a1 : a1 - a0
        sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        if (sweep < 1e-12 || Math.abs(from.x - to.x) + Math.abs(from.y - to.y) < 1e-9) sweep = 2 * Math.PI
        const length = Math.hypot(r * sweep, to.z - from.z)
        const sgn = m.clockwise ? -1 : 1
        const t0 = norm({ x: -sgn * (from.y - m.center.y), y: sgn * (from.x - m.center.x), z: 0 })
        const t1 = norm({ x: -sgn * (to.y - m.center.y), y: sgn * (to.x - m.center.x), z: 0 })
        blocks.push({ length, vmax: arcLimit(r, d, vmax), dir0: t0, dir1: t1, dwell: 0 })
        kinematic += length / vmax
      } else {
        const dir = norm({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z })
        const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
        blocks.push({ length, vmax, dir0: dir, dir1: dir, dwell: 0 })
        kinematic += length / vmax
      }
      from = { ...to }
    }
  }
  return { seconds: timeBlocks(blocks, d), kinematicSeconds: kinematic, blocks: blocks.length, calibrated: false, basis: basis(d) }
}

const firstPoint = (tp: Toolpath): Vec3 => {
  for (const m of tp.moves) {
    const t = moveTarget(m)
    if (t !== undefined) return t
  }
  return { x: 0, y: 0, z: 0 }
}

/** Cycle time of an interpreted NC program: the same model over the segments the interpreter read from the bytes. */
export const dynamicCycleTimeOfSegments = (segments: ReadonlyArray<GSegment>, d: MachineDynamics): CycleTimeResult => {
  const blocks: Block[] = []
  let kinematic = 0
  for (const s of segments) {
    if (s.kind === "dwell") {
      blocks.push({ length: 0, vmax: 1, dir0: { x: 0, y: 0, z: 0 }, dir1: { x: 0, y: 0, z: 0 }, dwell: s.seconds })
      kinematic += s.seconds
      continue
    }
    const feed = s.kind === "rapid" ? d.rapidFeed : s.feed
    const vmax = Math.max(feed, 1e-6) / 60
    if (s.kind === "arc") {
      const r = s.radiusStart
      const a0 = Math.atan2(s.from.y - s.center.y, s.from.x - s.center.x)
      const a1 = Math.atan2(s.to.y - s.center.y, s.to.x - s.center.x)
      let sweep = s.clockwise ? a0 - a1 : a1 - a0
      sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      if (sweep < 1e-12) sweep = 2 * Math.PI
      const length = Math.hypot(r * sweep, s.to.z - s.from.z)
      const sgn = s.clockwise ? -1 : 1
      blocks.push({
        length, vmax: arcLimit(r, d, vmax),
        dir0: norm({ x: -sgn * (s.from.y - s.center.y), y: sgn * (s.from.x - s.center.x), z: 0 }),
        dir1: norm({ x: -sgn * (s.to.y - s.center.y), y: sgn * (s.to.x - s.center.x), z: 0 }), dwell: 0
      })
      kinematic += length / vmax
    } else {
      const dir = norm({ x: s.to.x - s.from.x, y: s.to.y - s.from.y, z: s.to.z - s.from.z })
      const length = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y, s.to.z - s.from.z)
      blocks.push({ length, vmax, dir0: dir, dir1: dir, dwell: 0 })
      kinematic += length / vmax
    }
  }
  return { seconds: timeBlocks(blocks, d), kinematicSeconds: kinematic, blocks: blocks.length, calibrated: false, basis: basis(d) }
}
