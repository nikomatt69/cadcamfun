/**
 * Global linking and ordering of cutting chains (spec 69 F11, spec 54 Q1): the order in which an operation visits its chains
 * (pocket loops, contour passes, drill-free engraving strokes), which way each open chain is run, where each closed loop is
 * entered, and which links stay down (a feed move at depth) instead of lifting.
 *
 * The sequence starts as a nearest-neighbour tour from the start point and is improved by 2-opt (reverse a stretch, which also
 * flips the direction of its reversible chains) and or-opt (move a run of 1-3 chains elsewhere, optionally reversed) until no move
 * shortens the non-cutting length by more than `epsilon`. The cost of a link is its length when the tool may stay down
 * (`stayDown(a, b)` and the link is no longer than `maxStayDown`) and its length plus `liftCost` when it must retract, so the tour
 * trades a few long feed links against lifts. Everything is deterministic: ties break by input order.
 *
 * Closed loops are searched as a point at the loop vertex nearest their centroid; the final pass rotates every loop to the
 * vertex nearest the previous exit, and the reported figures are measured on the final tour. The cutting length never changes:
 * every chain appears exactly once and is cut in full, so the safety claims of the operation (engagement, stock, collisions)
 * are those of its chains; only the links between them change.
 */
import type { Vec2 } from "../../cad/vec.ts"

export interface LinkChain {
  /** Where the chain is entered when run forward. */
  readonly start: Vec2
  /** Where it ends when run forward. */
  readonly end: Vec2
  /** The chain may be run end to start (open contours: yes; climb / conventional milling, ordered pockets: no). */
  readonly reversible: boolean
  /** A closed loop: any vertex may be its entry, and it ends where it started. `start` / `end` are ignored. */
  readonly loop?: ReadonlyArray<Vec2>
}

export interface LinkOptions {
  /** Where the tool is before the first chain. */
  readonly from: Vec2
  /** Longest link, mm, that may stay down when `stayDown` allows it (default 0: every link lifts). */
  readonly maxStayDown?: number
  /** Whether a straight link between two points is clear of material to keep (default: always). */
  readonly stayDown?: (a: Vec2, b: Vec2) => boolean
  /** Extra length, mm, charged to a link that lifts (the retract and plunge time as distance; default 20). */
  readonly liftCost?: number
  /** Improvement below which the search stops, mm (default 1e-9). */
  readonly epsilon?: number
  /** Passes of improvement at most (default 50). */
  readonly maxPasses?: number
}

export interface LinkStep {
  /** Index of the chain in the input. */
  readonly chain: number
  /** Run end to start. */
  readonly reversed: boolean
  /** Entry vertex index of a closed loop (0 for an open chain). */
  readonly entry: number
  /** The link from the previous exit (or `from`) stays down. */
  readonly stayDown: boolean
}

export interface LinkPlan {
  readonly steps: ReadonlyArray<LinkStep>
  /** Total length of the links, mm (feed and lifted), and the cost the search minimised (links plus lift charges). */
  readonly linkLength: number
  readonly cost: number
  /** Number of links that lift. */
  readonly lifts: number
  /** Same figures for the nearest-neighbour tour the search started from, for comparison. */
  readonly baseline: { readonly linkLength: number; readonly cost: number; readonly lifts: number }
}

/** Most chains the improvement search handles (about a second at the limit). */
export const MAX_SEARCH = 120

const d2 = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Link length and cost of a tour given as (chain, reversed) pairs, from the exact per-loop entries. */
const evaluate = (chains: ReadonlyArray<LinkChain>, order: ReadonlyArray<{ chain: number; reversed: boolean }>, o: Required<Pick<LinkOptions, "from" | "maxStayDown" | "stayDown" | "liftCost">>): { steps: LinkStep[]; linkLength: number; cost: number; lifts: number } => {
  const steps: LinkStep[] = []
  let at = o.from, linkLength = 0, cost = 0, lifts = 0
  for (const { chain, reversed } of order) {
    const c = chains[chain]!
    let entryPoint: Vec2, exitPoint: Vec2, entry = 0
    if (c.loop !== undefined && c.loop.length > 0) {
      let best = Infinity
      c.loop.forEach((p, i) => { const d = d2(at, p); if (d < best) { best = d; entry = i } })
      entryPoint = exitPoint = c.loop[entry]!
    } else {
      entryPoint = reversed ? c.end : c.start
      exitPoint = reversed ? c.start : c.end
    }
    const len = d2(at, entryPoint)
    const down = len <= o.maxStayDown && len > 0 ? o.stayDown(at, entryPoint) : len === 0
    linkLength += len
    cost += down ? len : len + o.liftCost
    if (!down) lifts++
    steps.push({ chain, reversed: c.loop === undefined ? reversed : false, entry, stayDown: down })
    at = exitPoint
  }
  return { steps, linkLength, cost, lifts }
}

/** Order, orient and enter the chains so that the links between them are as short as the local search can make them. */
export const planLinks = (chains: ReadonlyArray<LinkChain>, options: LinkOptions): LinkPlan => {
  const o = { from: options.from, maxStayDown: options.maxStayDown ?? 0, stayDown: options.stayDown ?? (() => true), liftCost: options.liftCost ?? 20 }
  const eps = options.epsilon ?? 1e-9
  const n = chains.length
  // Search representation: a loop is a point at the vertex nearest its centroid.
  const rep = chains.map((c): { s: Vec2; e: Vec2; rev: boolean } => {
    if (c.loop !== undefined && c.loop.length > 0) {
      const cx = c.loop.reduce((s, p) => s + p.x, 0) / c.loop.length, cy = c.loop.reduce((s, p) => s + p.y, 0) / c.loop.length
      let best = c.loop[0]!, bd = Infinity
      for (const p of c.loop) { const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = p } }
      return { s: best, e: best, rev: false }
    }
    return { s: c.start, e: c.end, rev: c.reversible }
  })
  const link = (a: Vec2, b: Vec2): number => {
    const len = d2(a, b)
    return len <= o.maxStayDown && (len === 0 || o.stayDown(a, b)) ? len : len + o.liftCost
  }
  type Item = { chain: number; reversed: boolean }
  const entryOf = (it: Item): Vec2 => (it.reversed ? rep[it.chain]!.e : rep[it.chain]!.s)
  const exitOf = (it: Item): Vec2 => (it.reversed ? rep[it.chain]!.s : rep[it.chain]!.e)

  // Nearest-neighbour start, trying the reversed end of a reversible chain.
  const left = new Set<number>(Array.from({ length: n }, (_, i) => i))
  let tour: Item[] = []
  let at = o.from
  while (left.size > 0) {
    let bi = -1, bRev = false, bc = Infinity
    for (const i of left) {
      const r = rep[i]!
      const f = link(at, r.s)
      if (f < bc - 1e-12) { bc = f; bi = i; bRev = false }
      if (r.rev) { const b = link(at, r.e); if (b < bc - 1e-12) { bc = b; bi = i; bRev = true } }
    }
    left.delete(bi)
    const item = { chain: bi, reversed: bRev }
    tour.push(item)
    at = exitOf(item)
  }
  const tourCost = (t: ReadonlyArray<Item>): number => {
    let c = 0, p = o.from
    for (const it of t) { c += link(p, entryOf(it)); p = exitOf(it) }
    return c
  }
  const baseline = evaluate(chains, tour, o)

  const flip = (it: Item): Item => ({ chain: it.chain, reversed: !it.reversed })
  const canFlip = (it: Item): boolean => rep[it.chain]!.rev
  let current = tourCost(tour)
  // The exhaustive 2-opt / or-opt scan is cubic; past this many chains the nearest-neighbour tour is kept (declared, not silent: `baseline` equals the plan).
  const passes = n > MAX_SEARCH ? 0 : options.maxPasses ?? 50
  for (let pass = 0; pass < passes; pass++) {
    let improved = false
    // 2-opt: reverse tour[i..j] (the order, and the direction of each chain in it).
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ok = true
        for (let k = i; k <= j; k++) if (!canFlip(tour[k]!)) { ok = false; break }
        if (!ok) continue
        const cand = [...tour.slice(0, i), ...tour.slice(i, j + 1).reverse().map(flip), ...tour.slice(j + 1)]
        const c = tourCost(cand)
        if (c < current - eps) { tour = cand; current = c; improved = true }
      }
    }
    // or-opt: move a run of 1..3 chains to another position, forward or reversed.
    for (let len = 1; len <= 3; len++) {
      for (let i = 0; i + len <= n; i++) {
        const run = tour.slice(i, i + len)
        const rest = [...tour.slice(0, i), ...tour.slice(i + len)]
        let bestCost = current, best: Item[] | undefined
        for (let p = 0; p <= rest.length; p++) {
          if (p === i) continue
          for (const reverse of [false, true]) {
            if (reverse && !run.every(canFlip)) continue
            const ins = reverse ? [...run].reverse().map(flip) : run
            const cand = [...rest.slice(0, p), ...ins, ...rest.slice(p)]
            const c = tourCost(cand)
            if (c < bestCost - eps) { bestCost = c; best = cand }
          }
        }
        if (best !== undefined) { tour = best; current = bestCost; improved = true }
      }
    }
    if (!improved) break
  }
  const final = evaluate(chains, tour, o)
  return { steps: final.steps, linkLength: final.linkLength, cost: final.cost, lifts: final.lifts, baseline: { linkLength: baseline.linkLength, cost: baseline.cost, lifts: baseline.lifts } }
}

/** The links of the plan as lengths, for a caller that holds the chains itself: input order kept, for the comparison a gate needs. */
export const inputOrderPlan = (chains: ReadonlyArray<LinkChain>, options: LinkOptions): { readonly linkLength: number; readonly cost: number; readonly lifts: number } => {
  const o = { from: options.from, maxStayDown: options.maxStayDown ?? 0, stayDown: options.stayDown ?? (() => true), liftCost: options.liftCost ?? 20 }
  const { linkLength, cost, lifts } = evaluate(chains, chains.map((_, i) => ({ chain: i, reversed: false })), o)
  return { linkLength, cost, lifts }
}
