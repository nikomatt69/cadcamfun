import { describe, expect, test } from "bun:test"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

const prog = (...lines: string[]): string => `${lines.join("\n")}\n`

describe("G90 / G91", () => {
  test("incremental words are distances from where the tool is; arc centres always were", () => {
    const r = interpretGcode(prog("G21 G90", "G0 X10 Y10 Z5", "G91", "G1 X5 Y-2 Z-1 F100", "G2 X4 Y0 I2 J0", "G90", "G1 X0 Y0"))
    expect(r.errors).toEqual([])
    const [a, b, c, d] = r.segments
    expect(a).toMatchObject({ kind: "rapid", to: { x: 10, y: 10, z: 5 } })
    expect(b).toMatchObject({ kind: "linear", from: { x: 10, y: 10, z: 5 }, to: { x: 15, y: 8, z: 4 } })
    expect(c).toMatchObject({ kind: "arc", to: { x: 19, y: 8, z: 4 }, center: { x: 17, y: 8 }, clockwise: true })
    expect(d).toMatchObject({ kind: "linear", to: { x: 0, y: 0, z: 4 } })
  })

  test("a canned cycle in incremental mode is refused, not guessed", () => {
    const r = interpretGcode(prog("G90 G0 X0 Y0 Z10", "G91", "G81 X5 Z-5 R2 F50"))
    expect(r.errors.join(" ")).toMatch(/canned cycle in incremental mode/)
  })
})

describe("subprograms", () => {
  const withSub = prog(
    "%", "O1000", "G21 G90", "T1 M6", "G0 X0 Y0 Z5", "G1 Z0 F100",
    "M98 P1001", "G0 X50 Y0", "M98 P1001", "M5", "M30",
    "O1001", "G91", "G1 X10 F200", "G1 Y10", "G90", "M99", "%"
  )
  const inline = prog(
    "%", "O1000", "G21 G90", "T1 M6", "G0 X0 Y0 Z5", "G1 Z0 F100",
    "G91", "G1 X10 F200", "G1 Y10", "G90",
    "G0 X50 Y0",
    "G91", "G1 X10 F200", "G1 Y10", "G90", "M5", "M30", "%"
  )

  test("a call runs the program where the tool stands, and the main program resumes after it", () => {
    const r = interpretGcode(withSub)
    expect(r.errors).toEqual([])
    expect(r.segments.map((s) => (s.kind === "dwell" ? "dwell" : `${s.kind}:${s.to.x},${s.to.y},${s.to.z}`))).toEqual([
      "rapid:0,0,5", "linear:0,0,0", "linear:10,0,0", "linear:10,10,0", "rapid:50,0,0", "linear:60,0,0", "linear:60,10,0"
    ])
    expect(r.ended).toBe(true)
    expect(r.mCodes).toContain("M98")
  })

  test("it replays to the same geometry as the same program written out", () => {
    const a = interpretGcode(withSub), b = interpretGcode(inline)
    expect(a.segments.map((s) => (s.kind === "dwell" ? s : { kind: s.kind, from: s.from, to: s.to, feed: s.feed }))).toEqual(
      b.segments.map((s) => (s.kind === "dwell" ? s : { kind: s.kind, from: s.from, to: s.to, feed: s.feed })))
    expect(a.cutLength).toBeCloseTo(b.cutLength, 9)
    expect(a.end).toEqual(b.end)
  })

  test("motion inside a subprogram reports the line of the call as its line, and its own as subLine", () => {
    const r = interpretGcode(withSub)
    const inside = r.segments.filter((s) => "subLine" in s)
    expect(inside).toHaveLength(4)
    // The calls are on lines 7 and 9; the body is on lines 14 and 15.
    expect(inside.map((s) => s.line)).toEqual([7, 7, 9, 9])
    expect(inside.map((s) => (s as { subLine: number }).subLine)).toEqual([14, 15, 14, 15])
    expect(r.segments.filter((s) => !("subLine" in s)).every((s) => s.line < 12)).toBe(true)
  })

  test("L repeats the call, and a call may nest", () => {
    const r = interpretGcode(prog("O1", "G90 G0 X0 Y0 Z0", "M98 P2 L3", "M30", "O2", "G91 G1 X1 F10", "M98 P3", "G90", "M99", "O3", "G91 G1 Y1 F10", "M99"))
    expect(r.errors).toEqual([])
    expect(r.end).toEqual({ x: 3, y: 3, z: 0 })
    expect(r.segments.every((s) => s.kind === "dwell" || s.line === 3 || s.kind === "rapid")).toBe(true)
  })

  test("M30 ends the whole program: nothing after it runs, and a subprogram is never fallen into", () => {
    const r = interpretGcode(prog("O1", "G90 G0 X1 Y1 Z1", "M30", "G0 X9 Y9 Z9", "O2", "G0 X7 Y7 Z7", "M99"))
    expect(r.end).toEqual({ x: 1, y: 1, z: 1 })
    expect(r.segments).toHaveLength(1)
  })

  test("a call to a program that is not there, and runaway recursion, are errors", () => {
    expect(interpretGcode(prog("O1", "M98 P9", "M30")).errors.join(" ")).toMatch(/O9, which the program does not define/)
    const loop = interpretGcode(prog("O1", "G90 G0 X0 Y0 Z0", "M98 P2", "M30", "O2", "G91 G0 X1", "M98 P2", "M99"))
    expect(loop.errors.join(" ")).toMatch(/nested deeper/)
    expect(interpretGcode(prog("O1", "M98", "M30")).errors.join(" ")).toMatch(/without a program number/)
  })

  test("a program with a single O line is the main program, as before", () => {
    const r = interpretGcode(prog("%", "O1000", "G21 G90", "G0 X1 Y2 Z3", "M30", "%"))
    expect(r.segments).toHaveLength(1)
    expect(r.errors).toEqual([])
  })
})
