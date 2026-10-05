import { describe, expect, test } from "bun:test"
import { circle, line } from "../../src/cad/testing.ts"
import type { Vec2 } from "../../src/cad/vec.ts"
import { DrillParams, generateDrill, holePoints } from "../../src/cam/operations/drill.ts"
import { EngraveParams, generateEngrave } from "../../src/cam/operations/engrave.ts"
import { FaceParams, generateFace } from "../../src/cam/operations/face.ts"
import { toolpathLength } from "../../src/cam/ir.ts"
import { cuttingSegments, invariantViolations, run } from "./helpers.ts"
import { drill5, pointSeg, stock100, tool6 } from "./fixtures.ts"

describe("Drill", () => {
  const holes: Vec2[] = [{ x: 90, y: 90 }, { x: 10, y: 10 }, { x: 90, y: 10 }, { x: 10, y: 90 }]

  test("orders holes by nearest neighbour from the origin", () => {
    const tp = generateDrill(new DrillParams({ totalDepth: 8 }), holes, drill5, stock100)
    const order = tp.moves.flatMap((m) => (m._tag === "Cycle" ? [[m.to.x, m.to.y]] : []))
    expect(order).toEqual([[10, 10], [90, 10], [90, 90], [10, 90]])
  })

  test("picks circle and arc centres from entities and ignores the rest", () => {
    const pts = holePoints([circle("a", { x: 5, y: 6 }, 2), line("l", { x: 0, y: 0 }, { x: 1, y: 1 }), { x: 7, y: 8 }])
    expect(pts).toEqual([{ x: 5, y: 6 }, { x: 7, y: 8 }])
  })

  test("chooses the cycle from peck, chipBreak and dwell", () => {
    const kind = (over: Record<string, unknown>) =>
      generateDrill(new DrillParams({ totalDepth: 8, ...over } as never), holes, drill5, stock100).moves.find((m) => m._tag === "Cycle")
    expect(kind({})).toMatchObject({ cycle: "drill" })
    expect(kind({ dwell: 0.5 })).toMatchObject({ cycle: "dwell", dwellSeconds: 0.5 })
    expect(kind({ peck: 3 })).toMatchObject({ cycle: "peck", peckDepth: 3 })
    expect(kind({ peck: 3, chipBreak: true })).toMatchObject({ cycle: "chipBreak" })
  })

  test("the bottom is -totalDepth and the R plane is the retract height", () => {
    const tp = generateDrill(new DrillParams({ totalDepth: 8, retractHeight: 3 }), holes, drill5, stock100)
    const c = tp.moves.find((m) => m._tag === "Cycle")
    expect(c).toMatchObject({ to: { z: -8 }, retractHeight: 3 })
  })

  test("expanded cycles drill the same depth as the canned ones replay", () => {
    const tp = generateDrill(new DrillParams({ totalDepth: 8, peck: 3 }), holes, drill5, stock100)
    const canned = run(tp, "generic", { useCannedCycles: true })
    const expanded = run(tp, "generic", { useCannedCycles: false })
    expect(canned.text).toContain("G83")
    expect(expanded.text).not.toContain("G83")
    expect(canned.result.errors).toEqual([])
    expect(expanded.result.errors).toEqual([])
    expect(canned.result.minZ).toBeCloseTo(-8, 6)
    expect(expanded.result.minZ).toBeCloseTo(-8, 6)
    expect(canned.result.cutLength).toBeCloseTo(expanded.result.cutLength, 6)
    expect(expanded.result.cutLength).toBeCloseTo(toolpathLength(tp), 6)
  })

  test("grbl never gets canned cycles", () => {
    const tp = generateDrill(new DrillParams({ totalDepth: 8, peck: 3 }), holes, drill5, stock100)
    expect(run(tp, "grbl").text).not.toMatch(/G8[123]|G73/)
  })

  test("no holes produces a harmless toolpath", () => {
    const tp = generateDrill(new DrillParams({ totalDepth: 8 }), [], drill5, stock100)
    expect(tp.moves.every((m) => m._tag === "Comment")).toBe(true)
  })
})

describe("Face", () => {
  const params = (over: Record<string, unknown> = {}) => new FaceParams({ totalDepth: 1, stepdown: 0.5, ...over } as never)

  test("is a sound program that ends at the requested depth", () => {
    const tp = generateFace(params(), undefined, tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 1 })).toEqual([])
    expect(run(tp).result.minZ).toBeCloseTo(-1, 6)
  })

  test("rows cover the whole stock top", () => {
    const tp = generateFace(params({ totalDepth: 0.5, stepdown: 0.5 }), undefined, tool6, stock100)
    const segs = cuttingSegments(run(tp).result, -1e-9)
    for (let x = 0; x <= 100; x += 7) {
      for (let y = 0; y <= 100; y += 3) {
        let best = Infinity
        for (const s of segs) if (s.kind !== "dwell") best = Math.min(best, pointSeg({ x, y }, s.from, s.to))
        expect(best).toBeLessThanOrEqual(3 + 1e-6)
      }
    }
  })

  test("plunges and stepovers happen in air outside the stock", () => {
    const tp = generateFace(params(), undefined, tool6, stock100)
    const { result } = run(tp)
    for (const s of result.segments) {
      if (s.kind !== "linear") continue
      const vertical = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) < 1e-9
      if (vertical && s.to.z < s.from.z) {
        const outside = s.from.x < -3 || s.from.x > 103 || s.from.y < -3 || s.from.y > 103
        expect(outside).toBe(true)
      }
    }
  })

  test("rows can run along Y and over a custom area", () => {
    const tp = generateFace(params({ alongX: false }), { minX: 20, minY: 20, maxX: 60, maxY: 50 }, tool6, stock100)
    const { result } = run(tp)
    expect(result.errors).toEqual([])
    const xs = result.segments.flatMap((s) => (s.kind === "linear" ? [s.to.x] : []))
    expect(Math.min(...xs)).toBeCloseTo(20, 6)
    expect(Math.max(...xs)).toBeCloseTo(60, 6)
  })
})

describe("Engrave", () => {
  const params = (over: Record<string, unknown> = {}) => new EngraveParams({ totalDepth: 0.4, stepdown: 0.2, ...over } as never)

  test("a circle is one exact arc per lap at constant depth", () => {
    const tp = generateEngrave(params({ totalDepth: 0.4, stepdown: 0.4 }), circle("c", { x: 50, y: 50 }, 10), tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 0.4 })).toEqual([])
    const arcs = tp.moves.filter((m) => m._tag === "Arc")
    expect(arcs).toHaveLength(1)
    expect(arcs[0]).toMatchObject({ to: { z: -0.4 } })
  })

  test("an open path is run back and forth between depth passes, with no rapid at depth", () => {
    const tp = generateEngrave(params({ totalDepth: 0.6, stepdown: 0.2 }), line("l", { x: 10, y: 10 }, { x: 40, y: 10 }), tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 0.6 })).toEqual([])
    const xs = tp.moves.flatMap((m) => (m._tag === "Linear" && m.to.z < 0 && m.to.y === 10 ? [m.to.x] : []))
    const distinct = xs.filter((x, i) => i === 0 || x !== xs[i - 1])
    expect(distinct).toEqual([10, 40, 10, 40])
  })

  test("no geometry gives a harmless toolpath", () => {
    const tp = generateEngrave(params(), [], tool6, stock100)
    expect(tp.moves.every((m) => m._tag === "Comment")).toBe(true)
  })
})
