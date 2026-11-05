import { describe, expect, test } from "bun:test"
import { interpretGcode } from "./gcode-interpreter.ts"

/** Interpreter words of probing without the macro host (spec 73 §5.11); nothing changes without the new options. */
describe("probing in the plain interpreter", () => {
  test("G31 and G38.2 are probe segments with probeMoves, nothing without", () => {
    const text = "G21 G90\nG0 X0 Y0 Z10\nG31 Z-5 F100\nG91\nG38.2 X5 F50\nG90\nG1 Z10 F500\n"
    const on = interpretGcode(text, { probeMoves: true })
    expect(on.segments.filter((s) => s.kind === "linear" && s.probe === true).map((s) => s.line)).toEqual([3, 5])
    const off = interpretGcode(text)
    expect(off.segments.some((s) => s.kind === "linear" && s.probe === true)).toBe(false)
  })

  test("Siemens MEAS and Klartext TCH PROBE 0 read as probing moves", () => {
    const siemens = interpretGcode("G71 G90\nG0 X0 Y0 Z10\nMEAS=1 G1 Z-5 F100\nG0 Z10\n", { probeMoves: true })
    const m = siemens.segments.find((s) => s.kind === "linear" && s.probe === true)!
    expect(m.kind !== "dwell" && m.to.z).toBeCloseTo(-5, 9)
    const k = interpretGcode("0 BEGIN PGM P MM\n1 L X+0 Y+0 Z+10 R0 FMAX\n2 TCH PROBE 0.0 REF. PLANE Q94 Z-\n3 TCH PROBE 0.1 Z-5.000 F100\n4 END PGM P MM\n", { probeMoves: true })
    expect(k.errors).toEqual([])
    const t = k.segments.find((s) => s.kind === "linear" && s.probe === true)!
    expect(t.kind !== "dwell" && t.to.z).toBeCloseTo(-5, 9)
    expect(interpretGcode("0 BEGIN PGM P MM\n1 TCH PROBE 0.0 REF. PLANE Q94 Z-\n2 END PGM P MM\n").errors.length).toBeGreaterThan(0)
  })

  test("frame machine carries each segment through the offset it was made in", () => {
    const text = "G21 G90\nG54\nG0 X10 Y0 Z5\nG55\nG0 X20 Y0 Z5\nG54.1 P3\nG0 X1 Y0 Z0\n"
    const t = Math.PI / 2
    const r = interpretGcode(text, { frame: "machine", workOffsets: { G54: { x: 100, y: 0, z: 0 }, G55: { x: 0, y: 200, z: -50, rotation: t }, "G54.1 P3": { x: 7, y: 8, z: 9 } } })
    const ends = r.segments.flatMap((s) => (s.kind === "dwell" ? [] : [s.to]))
    expect(ends[0]).toEqual({ x: 110, y: 0, z: 5 })
    expect(ends[1]!.x).toBeCloseTo(0, 9)
    expect(ends[1]!.y).toBeCloseTo(220, 9)
    expect(ends[1]!.z).toBe(-45)
    expect(ends[ends.length - 1]).toEqual({ x: 8, y: 8, z: 9 })
    const plain = interpretGcode(text)
    const same = interpretGcode(text, { frame: "program", workOffsets: { G54: { x: 100, y: 0, z: 0 } } })
    expect(same.segments).toEqual(plain.segments)
  })
})
