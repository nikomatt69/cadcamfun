import { describe, expect, test } from "bun:test"
import type { GSegment } from "../testing/gcode-interpreter.ts"
import { checkNcClearance, type Cutter, type TableGeometry } from "./index.ts"

const flat: Cutter = { id: "t", name: "t", kind: "flat", diameter: 10, flutes: 3, material: "carbide", coating: "altin", fluteLength: 22, shankDiameter: 10, stickout: 40 }
// The table top at z = -30: the shank's lowest sample sits at tip + 22, so the shank clears it while the tip is above z = -47.
const table: TableGeometry = { cx: 0, cy: 0, top: -30, length: 200, width: 200 }
const cutterOf = (): Cutter => flat
const linear = (line: number, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): GSegment =>
  ({ kind: "linear", from, to, feed: 100, line })

describe("machine clearance over the NC", () => {
  test("a plunge that keeps the shank above the table is clear, with a certified margin", () => {
    const r = checkNcClearance([linear(1, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -40 })], cutterOf, table)
    expect(r.first).toBeUndefined()
    expect(r.unresolved).toBe(0)
    // The shank's bottom is 7 mm above the table's surface less its radius (5): 7 mm, the certified value is a little less.
    expect(r.minClearance).toBeGreaterThan(5)
    expect(r.minClearance).toBeLessThanOrEqual(7)
  })

  test("a plunge that drives the shank into the table is found at its NC line", () => {
    const r = checkNcClearance([linear(4, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -40 }), linear(9, { x: 0, y: 0, z: -40 }, { x: 0, y: 0, z: -60 })], cutterOf, table)
    expect(r.first).toBeDefined()
    expect(r.first!.line).toBe(9)
    expect(r.first!.clearance).toBeLessThan(0)
  })

  test("an arc whose chords dip into the table is a collision, and its sagitta is counted", () => {
    const arc: GSegment = { kind: "arc", from: { x: 5, y: 0, z: -60 }, to: { x: -5, y: 0, z: -60 }, center: { x: 0, y: 0 }, clockwise: true, radiusStart: 5, radiusEnd: 5, feed: 100, line: 3 }
    const r = checkNcClearance([arc], cutterOf, table)
    expect(r.checked).toBeGreaterThan(1)
    expect(r.first?.line).toBe(3)
  })

  test("a move with rotary words is counted, never passed as clear", () => {
    const r = checkNcClearance([{ kind: "linear", from: { x: 0, y: 0, z: 10 }, to: { x: 0, y: 0, z: 9 }, feed: 100, line: 2, rotary: { a: 10 } }], cutterOf, table)
    expect(r.rotaryMoves).toBe(1)
  })

  test("a move the tool table does not know is skipped, not checked against the wrong cutter", () => {
    const r = checkNcClearance([linear(1, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -60 })], () => undefined, table)
    expect(r.checked).toBe(0)
    expect(r.first).toBeUndefined()
  })

  test("a move that turns the table is counted and not checked, so the claim cannot read clear", () => {
    const turn = (line: number, a: number): GSegment => ({ kind: "linear", from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, feed: 100, line, rotary: { a, c: 0 } })
    const r = checkNcClearance([turn(1, 0), turn(2, 135)], cutterOf, table)
    expect(r.rotaryMoves).toBe(1)
    expect(r.first).toBeUndefined()
  })
})
