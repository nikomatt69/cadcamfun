import { describe, expect, test } from "bun:test"
import { drawBalloon, drawDatumFeature, drawFeatureFrame, drawFrameLeader, drawGdtSymbol, fmtTol, validateGdt, type GdtKind, type Pen } from "./gdt.ts"

/** A pen that records what it was asked to draw. */
const recorder = () => {
  const log: string[] = []
  const pen: Pen = {
    line: () => log.push("line"), circle: () => log.push("circle"), arc: () => log.push("arc"), poly: (_p, closed, fill) => log.push(`poly${closed ? "c" : ""}${fill === true ? "f" : ""}`),
    rect: () => log.push("rect"), text: (_a, t) => log.push(`text:${t}`)
  }
  return { pen, log }
}

describe("tolerance text and validation", () => {
  test("the zone text carries Ø and the modifier", () => {
    expect(fmtTol({ kind: "position", value: 0.1, diameter: true, modifier: "M" })).toBe("Ø0.1 (M)")
    expect(fmtTol({ kind: "flatness", value: 0.02 })).toBe("0.02")
    expect(fmtTol({ kind: "flatness", value: 0.005 })).toBe("0.005")
  })
  test("a kind that needs a datum without one, bad letters, a zone of zero and a cylindrical flatness are refused", () => {
    expect(validateGdt({ kind: "perpendicularity", value: 0.05 })).toContain("needs a datum")
    expect(validateGdt({ kind: "perpendicularity", value: 0.05, datums: ["a"] })).toContain("capital")
    expect(validateGdt({ kind: "perpendicularity", value: 0.05, datums: ["A", "A"] })).toContain("once")
    expect(validateGdt({ kind: "flatness", value: 0 })).toContain("positive")
    expect(validateGdt({ kind: "flatness", value: 0.1, diameter: true })).toContain("cylindrical")
    expect(validateGdt({ kind: "position", value: 0.1, diameter: true, datums: ["A", "B"] })).toBeUndefined()
  })
})

describe("drawing", () => {
  test("every characteristic draws a symbol of its own", () => {
    const kinds: GdtKind[] = ["straightness", "flatness", "circularity", "cylindricity", "profile-line", "profile-surface", "parallelism", "perpendicularity", "angularity", "position", "concentricity", "symmetry", "runout", "total-runout"]
    const seen = new Set<string>()
    for (const k of kinds) {
      const { pen, log } = recorder()
      drawGdtSymbol(pen, k, { x: 0, y: 0 })
      expect(log.length).toBeGreaterThan(0)
      seen.add(log.join(","))
    }
    // Position and total runout, parallelism and perpendicularity etc. differ in strokes.
    expect(seen.size).toBeGreaterThanOrEqual(10)
  })
  test("a frame is symbol | zone | datums, its width follows the cells, and it reads back as text", () => {
    const { pen, log } = recorder()
    const f = drawFeatureFrame(pen, { x: 10, y: 20 }, { kind: "position", value: 0.1, diameter: true, modifier: "M", datums: ["A", "B"] })
    expect(f.text).toBe("position | Ø0.1 (M) | A | B")
    expect(f.height).toBe(7)
    expect(f.width).toBeCloseTo(7 + Math.max(9.8, "Ø0.1 (M)".length * 2.1 + 4) + 14, 9)
    expect(log).toContain("text:Ø0.1 (M)")
    expect(log).toContain("text:A")
    expect(log.filter((x) => x === "rect").length).toBe(1)
    expect(() => drawFeatureFrame(recorder().pen, { x: 0, y: 0 }, { kind: "parallelism", value: 0.1 })).toThrow("datum")
  })
  test("datum feature, frame leader and balloon", () => {
    const d = recorder()
    drawDatumFeature(d.pen, { x: 0, y: 0 }, { x: 0, y: -1 }, "A")
    expect(d.log).toContain("text:A")
    expect(d.log).toContain("polycf")
    expect(() => drawDatumFeature(d.pen, { x: 0, y: 0 }, { x: 0, y: -1 }, "AB")).toThrow("capital")
    const l = recorder()
    drawFrameLeader(l.pen, { x: 0, y: 0 }, { x: 10, y: 5 })
    expect(l.log).toEqual(["line", "polycf"])
    const b = recorder()
    drawBalloon(b.pen, { x: 0, y: 0 }, { x: 20, y: 10 }, "12")
    expect(b.log).toEqual(["circle", "text:12", "line", "polycf"])
  })
})
