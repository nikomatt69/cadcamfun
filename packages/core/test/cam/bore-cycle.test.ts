import { describe, expect, test } from "bun:test"
import type { Vec2 } from "../../src/cad/vec.ts"
import { DrillParams, generateDrill } from "../../src/cam/operations/drill.ts"
import { expandMoves } from "../../src/cam/ir.ts"
import { run } from "./helpers.ts"
import { drill5, stock100 } from "./fixtures.ts"

describe("boring cycle (M2, G86)", () => {
  const holes: Vec2[] = [{ x: 10, y: 10 }, { x: 30, y: 10 }]

  test("mode bore emits a bore cycle that feeds in and rapids out", () => {
    const tp = generateDrill(new DrillParams({ totalDepth: 8, mode: "bore" }), holes, drill5, stock100)
    const cycle = tp.moves.find((m) => m._tag === "Cycle")
    expect(cycle).toMatchObject({ cycle: "bore", to: { z: -8 } })
    const expanded = expandMoves(tp.moves.filter((m) => m._tag === "Cycle"), { x: 10, y: 10, z: 5 })
    const kinds = expanded.map((m) => m._tag)
    // One feed to the bottom per hole, then only rapids: the spindle-stop exit of a boring cycle.
    expect(expanded.filter((m) => m._tag === "Linear").length).toBe(2)
    expect(expanded.filter((m) => m._tag === "Linear").every((m) => m._tag === "Linear" && m.to.z === -8)).toBe(true)
    expect(kinds[kinds.length - 1]).toBe("Rapid")
  })

  test("the generic post emits G86 with canned cycles and expands it without them", () => {
    const tp = generateDrill(new DrillParams({ totalDepth: 8, mode: "bore" }), holes, drill5, stock100)
    const canned = run(tp, "generic", { useCannedCycles: true })
    expect(canned.text).toContain("G86")
    expect(canned.result.errors).toEqual([])
    const expanded = run(tp, "generic", { useCannedCycles: false })
    expect(expanded.text).not.toContain("G86")
    expect(expanded.result.minZ).toBeCloseTo(-8, 6)
    expect(run(tp, "grbl").text).not.toContain("G86")
  })

  test("fanuc and haas emit G86, and the interpreter replays it", () => {
    const tp = generateDrill(new DrillParams({ totalDepth: 8, mode: "bore" }), holes, drill5, stock100)
    for (const post of ["fanuc", "haas"] as const) {
      const out = run(tp, post, { useCannedCycles: true })
      expect(out.text).toContain("G86")
      expect(out.result.errors).toEqual([])
      expect(out.result.minZ).toBeCloseTo(-8, 6)
    }
  })
})
