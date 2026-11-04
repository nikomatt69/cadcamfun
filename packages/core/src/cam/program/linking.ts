/**
 * Linking optimisation (spec 72 P3-4): the air between cuts.
 *
 *  - `minimiseRetracts`: a link (the rapids between two cutting moves) that climbs to the clearance plane, crosses and drops
 *    again is rewritten to climb only to the *lowest safe* level (`lowSafeZ`: the highest obstacle plus a margin, supplied by the
 *    caller who knows the stock and fixtures). Cutting moves are untouched; only links whose horizontal travel is entirely above
 *    `lowSafeZ` are rewritten, so a link that stays low on purpose (a stay-down link the operation proved safe) is never raised or lowered.
 *  - `orderForLinking`: operations that use the same tool and are declared reorderable are sequenced to shorten the travel between
 *    the end of one and the start of the next (nearest neighbour, then insertion moves until no insertion helps). Operations with
 *    a fixed order (roughing before finishing) are barriers and never move.
 *  - `airTime` / `linkReport`: the measured rapid time before and after, so a claim such as "-15 % air time" is a number, not a hope.
 */
import { distance } from "../../cad/vec.ts"
import type { Move, Toolpath } from "../ir.ts"

export interface LinkOptions {
  /** Lowest Z at which a rapid may cross the work: highest obstacle (stock, clamps, fixtures) plus a margin. */
  readonly lowSafeZ: number
  /** Rapid traverse rate, mm/min, for the time figures (default 10 000). */
  readonly rapidRate?: number
}

interface P3 { x: number; y: number; z: number }

const plainRapid = (m: Move): m is Extract<Move, { _tag: "Rapid" }> => m._tag === "Rapid" && m.rotary === undefined && m.expr === undefined && m.comp === undefined
const moves = (m: Move): boolean => m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Arc" || m._tag === "Cycle"
const endOf = (m: Move): P3 | undefined => {
  if (m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Arc") return { x: m.to.x, y: m.to.y, z: m.to.z }
  if (m._tag === "Cycle") return { x: m.to.x, y: m.to.y, z: m.retractHeight }
  return undefined
}

/** Seconds spent in rapid moves of a toolpath (a first rapid from an unknown position counts nothing). */
export const airTime = (tp: Toolpath, rapidRate = 10_000): number => {
  let pos: P3 | undefined
  let mm = 0
  for (const m of tp.moves) {
    const e = endOf(m)
    if (e === undefined) continue
    if (m._tag === "Rapid" && pos !== undefined) mm += Math.hypot(e.x - pos.x, e.y - pos.y, e.z - pos.z)
    pos = e
  }
  return (mm / rapidRate) * 60
}

/** The cutting moves of a toolpath, in order (everything that is not a rapid, a comment-like record is kept as is). Used to prove a rewrite left them alone. */
export const cuttingMoves = (tp: Toolpath): ReadonlyArray<Move> => tp.moves.filter((m) => m._tag !== "Rapid" && m._tag !== "Comment")

export interface MinimiseResult { readonly toolpath: Toolpath; readonly rewritten: number; readonly savedSeconds: number }

/** Rewrites over-high links to climb only to `lowSafeZ`. See the module comment for the exact rule. */
export const minimiseRetracts = (tp: Toolpath, options: LinkOptions): MinimiseResult => {
  const rate = options.rapidRate ?? 10_000
  const out: Move[] = []
  let pos: P3 | undefined
  let rewritten = 0
  let i = 0
  while (i < tp.moves.length) {
    const m = tp.moves[i]!
    if (!plainRapid(m) || pos === undefined) {
      out.push(m)
      const e = endOf(m)
      if (e !== undefined) pos = e
      i++
      continue
    }
    // a run of plain rapids (comments inside a link stay in place relative to the run's start)
    let j = i
    const run: Array<Extract<Move, { _tag: "Rapid" }>> = []
    while (j < tp.moves.length) {
      const q = tp.moves[j]!
      if (q._tag === "Comment") break
      if (!plainRapid(q)) break
      run.push(q)
      j++
    }
    const start = pos
    const end = run[run.length - 1]!.to
    const horizontal = run.some((q, k) => { const a = k === 0 ? start : run[k - 1]!.to; return Math.hypot(q.to.x - a.x, q.to.y - a.y) > 1e-9 })
    const crossesHigh = (() => {
      let a = start
      for (const q of run) {
        if (Math.hypot(q.to.x - a.x, q.to.y - a.y) > 1e-9 && Math.min(a.z, q.to.z) < options.lowSafeZ - 1e-9) return false
        a = q.to
      }
      return true
    })()
    const peak = Math.max(start.z, ...run.map((q) => q.to.z))
    const level = Math.max(options.lowSafeZ, start.z, end.z)
    if (horizontal && crossesHigh && peak > level + 1e-9) {
      const before = run.reduce((acc, q, k) => acc + Math.hypot(q.to.x - (k === 0 ? start : run[k - 1]!.to).x, q.to.y - (k === 0 ? start : run[k - 1]!.to).y, q.to.z - (k === 0 ? start : run[k - 1]!.to).z), 0)
      const rewrite: Move[] = []
      if (start.z < level - 1e-9) rewrite.push({ _tag: "Rapid", to: { x: start.x, y: start.y, z: level } })
      rewrite.push({ _tag: "Rapid", to: { x: end.x, y: end.y, z: level } })
      if (end.z < level - 1e-9) rewrite.push({ _tag: "Rapid", to: { x: end.x, y: end.y, z: end.z } })
      const after = (level - start.z) + Math.hypot(end.x - start.x, end.y - start.y) + (level - end.z)
      if (after < before - 1e-9) {
        out.push(...rewrite)
        rewritten++
        pos = { x: end.x, y: end.y, z: end.z }
        i = j
        continue
      }
    }
    out.push(...run)
    pos = { x: end.x, y: end.y, z: end.z }
    i = j
  }
  void moves
  const toolpath = { ...tp, moves: out }
  return { toolpath, rewritten, savedSeconds: airTime(tp, rate) - airTime(toolpath, rate) }
}

/* ------------------------------------------------------------------------------------------------------------ ordering */

export interface LinkItem {
  readonly id: string
  readonly tool: string
  /** Where the operation starts cutting and where it leaves off (XY of the first approach and the last retract). */
  readonly start: { readonly x: number; readonly y: number }
  readonly end: { readonly x: number; readonly y: number }
  /** `false`: a fixed-order operation (roughing before finishing); it is a barrier no neighbour crosses. Default `true`. */
  readonly reorderable?: boolean
}

export interface LinkOrder {
  readonly order: ReadonlyArray<string>
  /** Total XY distance of the links before and after, mm. */
  readonly before: number
  readonly after: number
}

const total = (items: ReadonlyArray<LinkItem>, from: { x: number; y: number } | undefined): number => {
  let sum = 0
  let at = from
  for (const it of items) { if (at !== undefined) sum += distance(at, it.start); at = it.end }
  return sum
}

/** Sequences each block of consecutive reorderable operations of one tool to shorten the links; everything else keeps its place. */
export const orderForLinking = (items: ReadonlyArray<LinkItem>, from?: { readonly x: number; readonly y: number }): LinkOrder => {
  const result: LinkItem[] = []
  let block: LinkItem[] = []
  let at = from === undefined ? undefined : { x: from.x, y: from.y }
  const flush = (): void => {
    if (block.length === 0) return
    const ordered = block.length > 1 ? improve(block, at) : block
    result.push(...ordered)
    at = ordered[ordered.length - 1]!.end
    block = []
  }
  for (const it of items) {
    const free = it.reorderable !== false
    if (!free) { flush(); result.push(it); at = it.end; continue }
    if (block.length > 0 && block[0]!.tool !== it.tool) flush()
    block.push(it)
  }
  flush()
  return { order: result.map((r) => r.id), before: total(items, from), after: total(result, from) }
}

const improve = (block: ReadonlyArray<LinkItem>, from: { x: number; y: number } | undefined): LinkItem[] => {
  // nearest neighbour from the entry point (the first item's start when there is none)
  const left = [...block]
  const order: LinkItem[] = []
  let at = from ?? left[0]!.start
  while (left.length > 0) {
    let best = 0
    for (let k = 1; k < left.length; k++) if (distance(at, left[k]!.start) < distance(at, left[best]!.start) - 1e-12) best = k
    const [pick] = left.splice(best, 1)
    order.push(pick!)
    at = pick!.end
  }
  // insertion moves while the total shortens (bounded: each accepted move lowers the total strictly)
  let cost = total(order, from)
  for (let pass = 0; pass < 50; pass++) {
    let improved = false
    for (let a = 0; a < order.length; a++) {
      const [item] = order.splice(a, 1)
      let bestPos = a
      let bestCost = Infinity
      for (let b = 0; b <= order.length; b++) {
        order.splice(b, 0, item!)
        const c = total(order, from)
        if (c < bestCost - 1e-12) { bestCost = c; bestPos = b }
        order.splice(b, 1)
      }
      order.splice(bestPos, 0, item!)
      if (bestCost < cost - 1e-9) { cost = bestCost; improved = true }
    }
    if (!improved) break
  }
  return order
}

export interface LinkReport {
  readonly airBefore: number
  readonly airAfter: number
  /** Fraction of the rapid time removed, 0..1. */
  readonly reduction: number
  readonly rewrittenLinks: number
}

/** Measured effect of `minimiseRetracts` over a set of toolpaths. */
export const linkReport = (paths: ReadonlyArray<Toolpath>, options: LinkOptions): { readonly toolpaths: ReadonlyArray<Toolpath>; readonly report: LinkReport } => {
  const rate = options.rapidRate ?? 10_000
  let before = 0, after = 0, n = 0
  const toolpaths = paths.map((tp) => {
    const r = minimiseRetracts(tp, options)
    before += airTime(tp, rate); after += airTime(r.toolpath, rate); n += r.rewritten
    return r.toolpath
  })
  return { toolpaths, report: { airBefore: before, airAfter: after, reduction: before === 0 ? 0 : (before - after) / before, rewrittenLinks: n } }
}
