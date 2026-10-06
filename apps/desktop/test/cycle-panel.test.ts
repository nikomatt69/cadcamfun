import { describe, expect, test } from "bun:test"
import { panelCycles } from "../src/cam/lib/cyclePanel.ts"

describe("panelCycles", () => {
  test("lists the G81 lines of a program with their parameters", () => {
    const cycles = panelCycles("G90\nG81 X10.5 Y-2 Z-5 R2 F100\nG0 X0\nG81 X1 Y2 Z-3 R2 F80\nG80")
    expect(cycles).toEqual([
      { x: 10.5, y: -2, z: -5, r: 2, f: 100 },
      { x: 1, y: 2, z: -3, r: 2, f: 80 }
    ])
  })

  test("ignores other cycles, plain moves and empty programs", () => {
    expect(panelCycles("")).toEqual([])
    expect(panelCycles("G1 X1 Y1 F100\nG83 X1 Y1 Z-9 R2 Q2 F100")).toEqual([])
  })
})
