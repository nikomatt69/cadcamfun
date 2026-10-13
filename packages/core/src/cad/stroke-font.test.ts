import { describe, expect, test } from "bun:test"
import { hasGlyph, STROKE_CAP_HEIGHT, textStrokes } from "./stroke-font.ts"

const extent = (strokes: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>) => {
  const all = strokes.flat()
  return { minX: Math.min(...all.map((p) => p.x)), maxX: Math.max(...all.map((p) => p.x)), minY: Math.min(...all.map((p) => p.y)), maxY: Math.max(...all.map((p) => p.y)) }
}

describe("stroke font", () => {
  test("every capital and digit has a glyph that stays inside its 4 x 6 cell", () => {
    for (const char of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
      expect(hasGlyph(char)).toBe(true)
      const laid = textStrokes(char, STROKE_CAP_HEIGHT)
      expect(laid.strokes.length).toBeGreaterThan(0)
      const box = extent(laid.strokes)
      expect(box.minX).toBeGreaterThanOrEqual(0)
      expect(box.maxX).toBeLessThanOrEqual(4)
      expect(box.minY).toBeGreaterThanOrEqual(0)
      expect(box.maxY).toBeLessThanOrEqual(6)
      expect(laid.strokes.every((s) => s.length >= 2)).toBe(true)
    }
  })

  test("the text scales with its height and lower case is drawn as upper case", () => {
    const small = textStrokes("Cad", 6)
    const big = textStrokes("CAD", 12)
    expect(big.width).toBeCloseTo(small.width * 2, 9)
    expect(big.strokes.length).toBe(small.strokes.length)
    expect(extent(big.strokes).maxY).toBeCloseTo(12, 9)
  })

  test("letters advance along x and a new line steps down", () => {
    const one = textStrokes("I", 6)
    const two = textStrokes("II", 6)
    expect(two.width).toBeCloseTo(one.width + 5, 9)
    const lines = textStrokes("A\nA", 6)
    expect(lines.height).toBeCloseTo(6 + 9, 9)
    expect(extent(lines.strokes).minY).toBeCloseTo(-9, 9)
  })

  test("a character with no glyph is named once and not drawn", () => {
    const laid = textStrokes("A§§B", 6)
    expect(laid.unsupported).toEqual(["§"])
    expect(laid.strokes.length).toBe(textStrokes("AB", 6).strokes.length)
    expect(textStrokes("", 6).strokes).toEqual([])
    expect(textStrokes("   ", 6).width).toBe(0)
  })
})
