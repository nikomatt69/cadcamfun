import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { DimConstraint, Feature, History, SketchEntity, SketchFeature } from "@cadcamfun/core"
import { flatPatternSource, flatPatternView, flatPatternViews, formatMm, hasSheetMetal, layoutFlatPattern } from "./flat-pattern.ts"

setDefaultTimeout(60_000)

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const bent = (id: string, leg: number | string): SketchFeature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [pt("a", 0, 0), pt("b", 20, 0), pt("c", 20, 20), line("l1", "a", "b"), line("l2", "b", "c")],
    constraints: [
      { type: "fixed", point: "a", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" },
      { type: "length", line: "l1", value: leg }, { type: "length", line: "l2", value: 20 }
    ] as DimConstraint[]
  }
})
/** An L-shaped sheet: a leg of `leg` mm, a bend of radius 3 and a flange of 20 mm, 20 mm wide, 2 mm thick. */
const bracket = (parameters: Record<string, number> = { leg: 20, w: 20 }, extra: Partial<Feature> = {}): History => ({
  parameters, features: [bent("s1", "leg"), { id: "sheet", type: "sheet", sketch: "s1", thickness: 2, width: "w", bendRadius: 3, operation: "new", ...extra } as Feature]
})

describe("the flat pattern of a sheet-metal history", () => {
  test("a sheet gives its unfolded blank: outline, one bend line, dimensions of the developed length", () => {
    const [view] = flatPatternViews(bracket())
    expect(view).toBeDefined()
    expect(view!.featureId).toBe("sheet")
    expect(view!.bends).toBe(1)
    expect(view!.width).toBe(20)
    // the blank is the developed length long and the flange width wide
    const xs = view!.cut.flatMap((s) => [s.x1, s.x2]), ys = view!.cut.flatMap((s) => [s.y1, s.y2])
    expect(Math.min(...xs)).toBeCloseTo(0, 9)
    expect(Math.max(...xs)).toBeCloseTo(view!.length, 9)
    expect(Math.min(...ys)).toBeCloseTo(0, 9)
    expect(Math.max(...ys)).toBeCloseTo(20, 9)
    expect(view!.cut).toHaveLength(4)
    // one bend line, across the whole width, in the middle of the bend allowance
    expect(view!.bend).toHaveLength(1)
    const bend = view!.bend[0]!
    expect(bend.x1).toBeCloseTo(bend.x2, 9)
    expect(Math.abs(bend.y2 - bend.y1)).toBeCloseTo(20, 9)
    // 20 + 20 less the two setbacks, plus the allowance: shorter than the 40 of the drawn line plus the bend's arc
    expect(view!.length).toBeGreaterThan(30)
    expect(view!.length).toBeLessThan(42)
    const length = view!.dimensions.find((d) => d.kind === "length")!
    expect(length.text).toBe(formatMm(view!.length))
    expect(view!.dimensions.find((d) => d.kind === "width")!.text).toBe("20")
    // two straight runs and the bend, in order, adding up to the developed length
    const runs = view!.dimensions.filter((d) => d.kind !== "length" && d.kind !== "width")
    expect(runs.map((d) => d.kind)).toEqual(["flat", "bend", "flat"])
    expect(runs.reduce((sum, d) => sum + (d.to.x - d.from.x), 0)).toBeCloseTo(view!.length, 9)
    expect(runs[1]!.text).toMatch(/^90° · \d/)
  })

  test("the unfolded outline follows the parameters of the history", () => {
    const base = flatPatternViews(bracket())[0]!
    const longer = flatPatternViews(bracket({ leg: 35, w: 20 }))[0]!
    expect(longer.length).toBeCloseTo(base.length + 15, 6)
    const wider = flatPatternViews(bracket({ leg: 20, w: 33.5 }))[0]!
    expect(wider.width).toBe(33.5)
    expect(wider.length).toBeCloseTo(base.length, 9)
    expect(Math.max(...wider.cut.flatMap((s) => [s.y1, s.y2]))).toBeCloseTo(33.5, 9)
  })

  test("a suppressed sheet, a history without one and a failed width show nothing", () => {
    expect(hasSheetMetal(bracket())).toBe(true)
    expect(hasSheetMetal(bracket({ leg: 20, w: 20 }, { suppressed: true }))).toBe(false)
    expect(flatPatternViews(bracket({ leg: 20, w: 20 }, { suppressed: true }))).toEqual([])
    const plain: History = { parameters: {}, features: [bent("s1", 20)] }
    expect(hasSheetMetal(plain)).toBe(false)
    expect(flatPatternViews(plain)).toEqual([])
    expect(hasSheetMetal(undefined)).toBe(false)
    expect(hasSheetMetal({ features: "no" })).toBe(false)
    expect(flatPatternViews(bracket({ leg: 20, w: -4 }))).toEqual([])
  })

  test("edge-flange relief notches are part of the outline", () => {
    const straight: SketchFeature = { id: "s1", type: "sketch", plane: "XY", sketch: { entities: [pt("a", 0, 0), pt("b", 30, 0), line("c", "a", "b")], constraints: [{ type: "fixed", point: "a", x: 0, y: 0 }, { type: "fixed", point: "b", x: 30, y: 0 }] } }
    const h: History = { parameters: {}, features: [straight, { id: "sheet", type: "sheet", sketch: "s1", thickness: 2, width: 20, bendRadius: 3, operation: "new", flanges: [{ end: "end", length: 12, angle: 90, relief: { width: 2, depth: 2 } }] } as Feature] }
    const [view] = flatPatternViews(h)
    expect(view).toBeDefined()
    // a rectangle has four sides; the notch makes the outline longer than that
    expect(view!.cut.length).toBeGreaterThan(4)
  })

  test("the layout fits the blank into the box, with the dimensions outside it", () => {
    const view = flatPatternViews(bracket())[0]!
    const box = { width: 320, height: 200 }
    const layout = layoutFlatPattern(view, box)
    expect(layout.scale).toBeGreaterThan(0)
    const inside = (v: number, max: number) => v >= -1e-6 && v <= max + 1e-6
    for (const l of layout.lines) { expect(inside(l.x1, box.width) && inside(l.x2, box.width) && inside(l.y1, box.height) && inside(l.y2, box.height)).toBe(true) }
    for (const t of layout.texts) { expect(inside(t.x, box.width)).toBe(true); expect(inside(t.y, box.height)).toBe(true) }
    // y is flipped: the width dimension spans the blank's height in pixels
    const cutYs = layout.lines.filter((l) => l.kind === "cut").flatMap((l) => [l.y1, l.y2])
    expect((Math.max(...cutYs) - Math.min(...cutYs)) / layout.scale).toBeCloseTo(20, 6)
    // the length label is always there; the narrow run labels are dropped on a tiny box
    expect(layout.texts.some((t) => t.kind === "length" && t.text === formatMm(view.length))).toBe(true)
    const tiny = layoutFlatPattern(view, { width: 140, height: 120 })
    expect(tiny.texts.filter((t) => t.kind === "bend").length).toBeLessThanOrEqual(layout.texts.filter((t) => t.kind === "bend").length)
    expect(layoutFlatPattern(flatPatternView("x", { straight: 10, bends: [], length: 10, segments: [{ kind: "flat", from: 0, to: 10 }] }, 5), box).scale).toBeGreaterThan(0)
  })

  test("the source is the selected sheet part, else the first one", () => {
    const sheetA = { id: "a", type: "parametric", history: bracket() }
    const plate = { id: "p", type: "parametric", history: { parameters: {}, features: [] } }
    const cube = { id: "c", type: "cube" }
    const sheetB = { id: "b", type: "parametric", history: bracket() }
    const all = [cube, plate, sheetA, sheetB]
    expect(flatPatternSource(all, ["b"])?.id).toBe("b")
    expect(flatPatternSource(all, ["p"])?.id).toBe("a")
    expect(flatPatternSource(all, [])?.id).toBe("a")
    expect(flatPatternSource([cube, plate], ["c"])).toBeUndefined()
  })
})
