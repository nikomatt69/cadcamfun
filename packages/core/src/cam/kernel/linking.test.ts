import { describe, expect, test } from "bun:test"
import { MAX_SEARCH, inputOrderPlan, planLinks, type LinkChain } from "./linking.ts"

/** Deterministic pseudo-random numbers (mulberry32). */
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

const strokes = (n: number, seed: number, reversible = true): LinkChain[] => {
  const r = rng(seed)
  return Array.from({ length: n }, () => {
    const x = r() * 200, y = r() * 120, a = r() * Math.PI * 2, l = 5 + r() * 15
    return { start: { x, y }, end: { x: x + l * Math.cos(a), y: y + l * Math.sin(a) }, reversible }
  })
}

const loops = (n: number, seed: number): LinkChain[] => {
  const r = rng(seed)
  return Array.from({ length: n }, () => {
    const cx = r() * 200, cy = r() * 120, rad = 2 + r() * 6
    const pts = Array.from({ length: 12 }, (_, i) => ({ x: cx + rad * Math.cos((i * Math.PI) / 6), y: cy + rad * Math.sin((i * Math.PI) / 6) }))
    return { start: pts[0]!, end: pts[0]!, reversible: false, loop: pts }
  })
}

const cuttingLength = (c: LinkChain): number => (c.loop !== undefined ? c.loop.reduce((s, p, i) => s + Math.hypot(p.x - c.loop![(i + 1) % c.loop!.length]!.x, p.y - c.loop![(i + 1) % c.loop!.length]!.y), 0) : Math.hypot(c.end.x - c.start.x, c.end.y - c.start.y))

describe("global linking and ordering (spec 69 F11)", () => {
  const fixtures: ReadonlyArray<readonly [string, LinkChain[]]> = [
    ["40 open strokes", strokes(40, 1)],
    ["60 open strokes", strokes(60, 2)],
    ["25 loops", loops(25, 3)],
    ["mixed 20 strokes + 15 loops", [...strokes(20, 4), ...loops(15, 5)]]
  ]

  for (const [name, chains] of fixtures) {
    test(`${name}: every chain once, non-cut length at least 15 % under the input order and never over the nearest-neighbour tour`, () => {
      const options = { from: { x: 0, y: 0 }, maxStayDown: 12, liftCost: 20 }
      const plan = planLinks(chains, options)
      expect([...plan.steps.map((s) => s.chain)].sort((a, b) => a - b)).toEqual(chains.map((_, i) => i))
      const input = inputOrderPlan(chains, options)
      expect(plan.linkLength).toBeLessThanOrEqual(input.linkLength * 0.85)
      expect(plan.cost).toBeLessThanOrEqual(plan.baseline.cost + 1e-9)
      // The cutting length is that of the chains, untouched by the order.
      const cut = plan.steps.reduce((s, st) => s + cuttingLength(chains[st.chain]!), 0)
      expect(cut).toBeCloseTo(chains.reduce((s, c) => s + cuttingLength(c), 0), 9)
    })
  }

  test("the improvement over the nearest-neighbour tour is measured and positive on the open-stroke fixtures", () => {
    for (const seed of [1, 2, 7, 11]) {
      const plan = planLinks(strokes(50, seed), { from: { x: 0, y: 0 }, maxStayDown: 0, liftCost: 0 })
      expect(plan.linkLength).toBeLessThan(plan.baseline.linkLength)
    }
  })

  test("a chain that cannot be reversed is never reversed", () => {
    const chains = strokes(30, 9, false)
    const plan = planLinks(chains, { from: { x: 0, y: 0 } })
    expect(plan.steps.every((s) => !s.reversed)).toBe(true)
  })

  test("close links stay down and far ones lift, honouring the clearance predicate", () => {
    const row: LinkChain[] = [0, 1, 2, 3].map((i) => ({ start: { x: i * 10, y: 0 }, end: { x: i * 10 + 8, y: 0 }, reversible: false }))
    const down = planLinks(row, { from: { x: 0, y: 0 }, maxStayDown: 3 })
    expect(down.steps.map((s) => s.stayDown)).toEqual([true, true, true, true])
    expect(down.lifts).toBe(0)
    const blocked = planLinks(row, { from: { x: 0, y: 0 }, maxStayDown: 3, stayDown: () => false })
    expect(blocked.steps.map((s) => s.stayDown)).toEqual([true, false, false, false])
    expect(blocked.lifts).toBe(3)
    const far = planLinks(row, { from: { x: 0, y: 0 }, maxStayDown: 1 })
    expect(far.lifts).toBe(3)
  })

  test("a loop is entered at the vertex nearest the previous exit and the plan is deterministic", () => {
    const chains = loops(6, 21)
    const a = planLinks(chains, { from: { x: 0, y: 0 } }), b = planLinks(chains, { from: { x: 0, y: 0 } })
    expect(a).toEqual(b)
    let at = { x: 0, y: 0 }
    for (const s of a.steps) {
      const loop = chains[s.chain]!.loop!
      const nearest = Math.min(...loop.map((p) => Math.hypot(p.x - at.x, p.y - at.y)))
      expect(Math.hypot(loop[s.entry]!.x - at.x, loop[s.entry]!.y - at.y)).toBeCloseTo(nearest, 12)
      at = loop[s.entry]!
    }
  })

  test("past the search limit the tour is the nearest-neighbour one, declared by baseline equal to the plan", () => {
    const plan = planLinks(strokes(MAX_SEARCH + 5, 3), { from: { x: 0, y: 0 } })
    expect(plan.cost).toBeCloseTo(plan.baseline.cost, 9)
    expect(planLinks([], { from: { x: 0, y: 0 } }).steps).toEqual([])
  })
})
