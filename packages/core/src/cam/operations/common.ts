/**
 * Building blocks shared by the operations: a position-tracking move builder,
 * approach/retract sequences, ramped and helical descents, and tab handling.
 *
 * Invariants every operation inherits from here (they are what the legacy bugs
 * 4-6 violated, and the tests assert them on the emitted G-code):
 *  - a `Rapid` never moves in XY while the tool is below the stock top and never
 *    ends below it;
 *  - descents into material are feed moves whose slope is limited by `rampAngle`
 *    (helices advance at most `pitch` per revolution).
 */
import { distance, type Vec2, type Vec3 } from "../../cad/vec.ts"
import type { Move } from "../ir.ts"
import { type Levels } from "../params.ts"
import { type Path, type Seg, pathLength, reversePath, segLength, segStarts, sliceSeg } from "../path.ts"

/** Moves one operation may write (about the size a controller can still load); past it the operation stops with the reason. */
export const MAX_OPERATION_MOVES = 4_000_000

/** An operation that would be larger than the kernel can write or check: carries what to change. */
export class OperationBudgetError extends RangeError {
  override readonly name = "OperationBudgetError"
}

/** Position-tracking move builder; skips moves that would not move. */
export class MoveBuilder {
  readonly moves: Move[] = []
  private current: Vec3 | undefined

  constructor(private readonly limit: number = MAX_OPERATION_MOVES) {}

  private add(move: Move): void {
    if (this.moves.length >= this.limit) {
      throw new OperationBudgetError(`The operation passed ${this.limit.toLocaleString("en-US")} moves: raise the stepover, stepdown or tolerance, or split the work into regions`)
    }
    this.moves.push(move)
  }

  get pos(): Vec3 {
    if (this.current === undefined) throw new Error("MoveBuilder has no position yet; start with rapid()")
    return this.current
  }

  get started(): boolean {
    return this.current !== undefined
  }

  comment(text: string): void {
    this.add({ _tag: "Comment", text })
  }

  rapid(to: Vec3): void {
    const c = this.current
    if (c !== undefined && same(c, to)) return
    this.add({ _tag: "Rapid", to: { x: to.x, y: to.y, z: to.z } })
    this.current = { x: to.x, y: to.y, z: to.z }
  }

  linear(to: Vec3, feed: number): void {
    const c = this.current
    if (c !== undefined && same(c, to)) return
    this.add({ _tag: "Linear", to: { x: to.x, y: to.y, z: to.z }, feed })
    this.current = { x: to.x, y: to.y, z: to.z }
  }

  arc(to: Vec3, center: Vec2, clockwise: boolean, feed: number): void {
    this.add({
      _tag: "Arc",
      to: { x: to.x, y: to.y, z: to.z },
      center: { x: center.x, y: center.y },
      clockwise,
      feed
    })
    this.current = { x: to.x, y: to.y, z: to.z }
  }

  /** Emits one path segment at height `z` (so a helical arc when `z` differs from the current Z). */
  seg(seg: Seg, z: number, feed: number): void {
    if (seg.kind === "Line") this.linear({ x: seg.to.x, y: seg.to.y, z }, feed)
    else this.arc({ x: seg.to.x, y: seg.to.y, z }, seg.center, seg.clockwise, feed)
  }

  dwell(seconds: number): void {
    this.add({ _tag: "Dwell", seconds })
  }

  push(move: Move): void {
    this.add(move)
    if (move._tag === "Rapid" || move._tag === "Linear" || move._tag === "Arc") {
      this.current = { x: move.to.x, y: move.to.y, z: move.to.z }
    } else if (move._tag === "Cycle") {
      this.current = { x: move.to.x, y: move.to.y, z: move.retractHeight }
    }
  }
}

const same = (a: Vec3, b: Vec3): boolean =>
  Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9

// ---------------------------------------------------------------- approach / retract

/**
 * Brings the tool over `xy` at the retract plane. Starts with a rapid to the
 * clearance plane when nothing has been emitted yet; otherwise lifts to the safe
 * plane first, so that no horizontal rapid happens inside the stock.
 */
export const approach = (b: MoveBuilder, xy: Vec2, levels: Levels): void => {
  if (!b.started) {
    b.rapid({ x: xy.x, y: xy.y, z: levels.clearanceZ })
  } else {
    const p = b.pos
    if (distance(p, xy) > 1e-9) {
      if (p.z < levels.safeZ) b.rapid({ x: p.x, y: p.y, z: levels.safeZ })
      b.rapid({ x: xy.x, y: xy.y, z: b.pos.z })
    }
  }
  if (b.pos.z > levels.safeZ) b.rapid({ x: xy.x, y: xy.y, z: levels.safeZ })
  b.rapid({ x: xy.x, y: xy.y, z: levels.retractZ })
}

/** Lifts vertically to the clearance plane (end of an operation). */
export const finish = (b: MoveBuilder, levels: Levels): void => {
  if (!b.started) return
  const p = b.pos
  b.rapid({ x: p.x, y: p.y, z: levels.clearanceZ })
}

/** Vertical rapid up to `z` (a lift never moves in XY, so it is safe at any depth). */
export const liftTo = (b: MoveBuilder, z: number): void => {
  const p = b.pos
  if (p.z < z - 1e-9) b.rapid({ x: p.x, y: p.y, z })
}

// ---------------------------------------------------------------- following paths

/** Follows `path` at constant `z`; the builder must already be at `path.start`. */
export const followPath = (b: MoveBuilder, path: Path, z: number, feed: number): void => {
  for (const seg of path.segs) b.seg(seg, z, feed)
}

/**
 * One traversal of `path` descending linearly (by cumulative XY length) from `z0`
 * to `z1`. Lines become sloped `Linear`s, arcs become helical `Arc`s.
 */
const rampTraversal = (b: MoveBuilder, path: Path, z0: number, z1: number, feed: number): void => {
  const total = pathLength(path)
  let cum = 0
  const starts = segStarts(path)
  path.segs.forEach((seg, i) => {
    cum += segLength(starts[i]!, seg)
    const z = total === 0 ? z1 : z0 + ((z1 - z0) * cum) / total
    b.seg(seg, z, feed)
  })
}

/**
 * Descends from `zFrom` to `zTo` along `path`, never steeper than `angleDeg`
 * (legacy bug 6). A closed path is lapped as often as needed; an open path is
 * traversed back and forth (zig-zag) an even number of times so the tool ends at
 * the start again. Returns with the tool at `path.start` at `zTo`.
 */
export const descendAlong = (
  b: MoveBuilder,
  path: Path,
  zFrom: number,
  zTo: number,
  angleDeg: number,
  feed: number
): void => {
  const drop = zFrom - zTo
  if (drop < 1e-9) return
  const length = pathLength(path)
  const slope = Math.tan((angleDeg * Math.PI) / 180)
  if (length < 1e-9) {
    b.linear({ x: path.start.x, y: path.start.y, z: zTo }, feed)
    return
  }
  let count = Math.max(1, Math.ceil(drop / (length * slope) - 1e-9))
  if (!path.closed && count % 2 === 1) count += 1
  const back = path.closed ? path : reversePath(path)
  for (let i = 0; i < count; i++) {
    const za = zFrom - (drop * i) / count
    const zb = i === count - 1 ? zTo : zFrom - (drop * (i + 1)) / count
    rampTraversal(b, path.closed || i % 2 === 0 ? path : back, za, zb, feed)
  }
}

/**
 * Real multi-revolution helix (legacy bug 5): `ceil(depth / pitch)` full circles
 * about `center`, each a full-circle `Arc` with proportional Z, ending at the
 * start point at `zTo`. The builder must be at the helix start point.
 */
export const helixDown = (
  b: MoveBuilder,
  center: Vec2,
  clockwise: boolean,
  zFrom: number,
  zTo: number,
  pitch: number,
  feed: number
): number => {
  const drop = zFrom - zTo
  const start = b.pos
  if (drop < 1e-9) return 0
  const revolutions = Math.max(1, Math.ceil(drop / pitch - 1e-9))
  for (let i = 1; i <= revolutions; i++) {
    const z = i === revolutions ? zTo : zFrom - (drop * i) / revolutions
    b.arc({ x: start.x, y: start.y, z }, center, clockwise, feed)
  }
  return revolutions
}

// ---------------------------------------------------------------- tabs

export interface TabWindow {
  /** XY distance along the path where the tab starts, mm. */
  readonly s0: number
  readonly s1: number
  /** Z of the top of the material left standing. */
  readonly z: number
}

/**
 * One lap of `path` at depth `z`, rising over any tab whose top is above `z`.
 * Vertical moves at the tab edges use `plungeFeed`.
 */
export const lapWithTabs = (
  b: MoveBuilder,
  path: Path,
  z: number,
  feed: number,
  plungeFeed: number,
  tabs: ReadonlyArray<TabWindow>
): void => {
  const active = tabs.filter((t) => t.z > z + 1e-9 && t.s1 > t.s0).sort((a, c) => a.s0 - c.s0)
  if (active.length === 0) {
    followPath(b, path, z, feed)
    return
  }
  const starts = segStarts(path)
  let cum = 0
  const zAt = (s: number): number => {
    for (const t of active) if (s > t.s0 + 1e-9 && s < t.s1 - 1e-9) return t.z
    return z
  }
  path.segs.forEach((seg, i) => {
    const len = segLength(starts[i]!, seg)
    const cuts: number[] = [0, len]
    for (const t of active) {
      for (const edge of [t.s0, t.s1]) {
        const local = edge - cum
        if (local > 1e-9 && local < len - 1e-9) cuts.push(local)
      }
    }
    cuts.sort((x, y) => x - y)
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = cuts[k]!
      const c = cuts[k + 1]!
      if (c - a < 1e-9) continue
      const target = zAt(cum + (a + c) / 2)
      const p = b.pos
      if (Math.abs(p.z - target) > 1e-9) b.linear({ x: p.x, y: p.y, z: target }, plungeFeed)
      const piece = c >= len - 1e-9 ? seg : sliceSeg(starts[i]!, seg, 0, c)
      b.seg(piece, target, feed)
    }
    cum += len
  })
  const p = b.pos
  if (Math.abs(p.z - z) > 1e-9) b.linear({ x: p.x, y: p.y, z }, plungeFeed)
}
