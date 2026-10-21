import { describe, expect, test } from "bun:test"
import { turnMillAxesOf, turnMillCPoint, turnMillToolAxis, validateTurnMillPose } from "../../src/cam/viewer/turn-mill.ts"
import { withTurnMill, type LatheSetup } from "../../src/cam/viewer/machine-setup.ts"
import type { Program } from "../../src/cam/ir.ts"

const program = (moves: Program["toolpaths"][number]["moves"]): Program => ({ name: "tm", toolpaths: [{ id: "t", toolId: "t", moves }], workOffset: "G54" } as unknown as Program)

describe("a 5-axis lathe (mill-turn centre): X/Y/Z, B head, C spindle", () => {
  test("B0 is axial, B90 is radial, B45 between: the head axis follows Ry(B)", () => {
    const a0 = turnMillToolAxis(0)
    expect(a0.x).toBeCloseTo(0, 9); expect(a0.z).toBe(-1)
    const r = turnMillToolAxis(90)
    expect(r.x).toBeCloseTo(-1, 9); expect(r.z).toBeCloseTo(0, 9)
    const d = turnMillToolAxis(45)
    expect(d.x).toBeCloseTo(-Math.SQRT1_2, 9); expect(d.z).toBeCloseTo(-Math.SQRT1_2, 9)
  })

  test("C turns the workpiece about the spindle axis Z", () => {
    const p = turnMillCPoint({ x: 10, y: 0, z: 5 }, 90)
    expect(p.x).toBeCloseTo(0, 9); expect(p.y).toBeCloseTo(10, 9); expect(p.z).toBe(5)
    const full = turnMillCPoint({ x: 3, y: 4, z: 0 }, 360)
    expect(full.x).toBeCloseTo(3, 9); expect(full.y).toBeCloseTo(4, 9)
  })

  test("a turning-only program uses no milling axes; B or Y words make it a mill-turn program", () => {
    const turning = program([{ _tag: "Linear", to: { x: 40, y: 0, z: -20 }, feed: 100 } as never])
    expect(turnMillAxesOf(turning)).toEqual({ milling: false, b: false, y: false, cPositioned: false })
    const milling = program([{ _tag: "Linear", to: { x: 40, y: 5, z: -20 }, feed: 100, rotary: { b: 45, c: 90 } } as never])
    expect(turnMillAxesOf(milling)).toEqual({ milling: true, b: true, y: true, cPositioned: true })
  })

  test("the visualizer setup becomes a mill-turn centre only for a milling lathe program", () => {
    const lathe = { kind: "lathe", stock: { diameter: 50, length: 80, material: "", across: 50 }, workholding: { kind: "lathe-chuck" }, bodies: [] } as unknown as LatheSetup
    const turning = program([{ _tag: "Linear", to: { x: 40, y: 0, z: -20 }, feed: 100 } as never])
    expect((withTurnMill(lathe, turning) as LatheSetup).turnMill).toBeUndefined()
    const milling = program([{ _tag: "Linear", to: { x: 40, y: 5, z: -20 }, feed: 100, rotary: { b: 45, c: 90 } } as never])
    expect((withTurnMill(lathe, milling) as LatheSetup).turnMill).toEqual({ b: [-120, 120] })
  })

  test("poses outside the B range, or non-finite, are refused", () => {
    expect(validateTurnMillPose({ b: 130 })).toEqual(["B 130 is outside -120..120"])
    expect(validateTurnMillPose({ b: 90, c: 720 })).toEqual([])
    expect(validateTurnMillPose({ x: Number.NaN })).toEqual(["X is not finite"])
  })
})
