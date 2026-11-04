import { describe, expect, test } from "bun:test"
import { HOLDER_LIBRARY, heldIn, holdersFor, minimumStickout, shortestHolder } from "./holders.ts"
import type { Cutter } from "./cutters.ts"
import { TriDexel, toolSolid } from "./tridexel.ts"

const endmill = (over: Partial<Cutter> = {}): Cutter => ({ id: "em", name: "End mill Ø6", kind: "flat", diameter: 6, flutes: 3, material: "carbide", coating: "altin", fluteLength: 12, shankDiameter: 6, stickout: 80, ...over })
const er16 = HOLDER_LIBRARY.find((h) => h.id === "er16-std")!
const slim = HOLDER_LIBRARY.find((h) => h.id === "shrink-slim-3-6")!

/** A 20 x 20 square pocket of the given depth in a 60 x 60 x 80 block, the tool on its centre line. */
const pocket = (depth: number, cell = 0.25): TriDexel =>
  TriDexel.fromTop({ x: -30, y: -30, z: 0 }, { x: 30, y: 30, z: 80 }, cell, (x, y) => (Math.abs(x) < 10 && Math.abs(y) < 10 ? 80 - depth : 80))

/** Penetration of the shank and holder when the tip rests on the pocket floor with the holder face at `stickout`. */
const overlap = (depth: number, cutter: Cutter, holder: (typeof HOLDER_LIBRARY)[number], stickout: number): number =>
  pocket(depth).probe(toolSolid(heldIn(cutter, holder, stickout), ["shank", "holder"]), { x: 0, y: 0, z: 80 - depth }).overlap

describe("holder library and minimum stick-out (spec 69 D2)", () => {
  test("holders are found by the shank they grip, slimmest first", () => {
    expect(holdersFor(6).map((h) => h.id).sort()).toEqual(["er11-std", "er16-std", "er20-std", "er25-std", "er32-std", "hyd-6-20", "shrink-slim-3-6", "sidelock-6-20"].sort())
    expect(holdersFor(6)[0]!.diameter).toBe(Math.min(...holdersFor(6).map((h) => h.diameter)))
    expect(holdersFor(25)).toEqual([])
    expect(holdersFor(2.5).every((h) => h.shankMin <= 2.5)).toBe(true)
  })

  test("a holder wider than the pocket needs depth + margin of stick-out, and the replay agrees to within the dexel cell", () => {
    const depth = 15, margin = 1
    const r = minimumStickout(endmill(), er16, { obstacles: [{ distance: 10, height: depth }], margin })
    expect(r.minimum).toBeCloseTo(depth + margin, 9)
    expect(r.feasible).toBe(true)
    expect(r.limitedBy).toMatch(/Ø28/)
    // At the minimum the holder clears the walls by the margin; 1.5 mm shorter it is inside the pocket and collides.
    expect(overlap(depth, endmill(), er16, r.minimum)).toBe(0)
    expect(overlap(depth, endmill(), er16, r.minimum - margin - 0.5)).toBeGreaterThan(0.25)
  })

  test("a deeper pocket raises the minimum stick-out one for one", () => {
    const at = (d: number) => minimumStickout(endmill(), er16, { obstacles: [{ distance: 10, height: d }] }).minimum
    expect(at(25) - at(15)).toBeCloseTo(10, 9)
    expect(at(40) - at(25)).toBeCloseTo(15, 9)
  })

  test("a slim holder that fits the pocket needs only the flutes, and the shortest-holder search picks it", () => {
    const request = { obstacles: [{ distance: 10, height: 30 }] }
    const slimResult = minimumStickout(endmill(), slim, request)
    expect(slimResult.minimum).toBe(12)
    expect(slimResult.limitedBy).toBe("flutes")
    const best = shortestHolder(endmill(), request)!
    expect(best.holder.id).toBe("shrink-slim-3-6")
    expect(overlap(30, endmill(), slim, best.minimum)).toBe(0)
    // The wide ER nut needs 31 mm of the cutter: shorter tool, still feasible; at 80 mm everything is.
    expect(minimumStickout(endmill(), er16, request).minimum).toBe(31)
  })

  test("a cutter too short for the pocket is reported infeasible with the length it would need", () => {
    const short = endmill({ stickout: 20 })
    const r = shortestHolder(short, { obstacles: [{ distance: 5, height: 25 }] })!
    // Every holder is wider than the 5 mm free radius: the least infeasible one is returned.
    expect(r.feasible).toBe(false)
    expect(r.minimum).toBeGreaterThan(short.stickout)
    expect(shortestHolder(endmill({ shankDiameter: 30 }), { obstacles: [] })).toBeUndefined()
  })

  test("a stepped holder is cleared section by section: a wide second step above the obstacle does not count", () => {
    const wide = { ...slim, id: "wide-step", steps: [{ diameter: 40, length: 10 }] }
    // Section 2 (Ø40) starts 40 mm above the holder face (slim first section is 40 long): with height 30 it is clear at stickout 12.
    expect(minimumStickout(endmill(), wide, { obstacles: [{ distance: 10, height: 30 }] }).minimum).toBe(12)
    // With height 60 it must clear the Ø40 section too: stickout + 40 >= 61.
    expect(minimumStickout(endmill(), wide, { obstacles: [{ distance: 10, height: 60 }] }).minimum).toBe(21)
  })
})
