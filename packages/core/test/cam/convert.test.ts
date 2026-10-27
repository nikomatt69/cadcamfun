/** The NC conversion kernel: read any supported dialect, write any post, prove the motion by replay, refuse what would change it. */
import { describe, expect, test } from "bun:test"
import { convertNc, fanucPost, genericPost, heidenhainPost, posts, programOfNc, samplePostProgram } from "../../src/cam/post/index.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

/** A hand-written Fanuc program: canned peck drilling, arcs (one rounded so its radii differ), a dwell in ms, two tools, comments. */
const FANUC = `%
O1234 (BRACKET)
G21 G90 G17 G94 G40 G49 G80
G54
(FACE AND PROFILE)
T3 M6
G43 H3
M3 S8000
M8
G0 X-5. Y0. Z5.
G1 Z-1. F200
X40. F600
G3 X50. Y10. I0. J10.
G2 X60. Y20.001 I10. J0.
G4 P500
G0 Z5.
M5
M9
(DRILL)
T7 M6
G43 H7
M3 S3000
G0 X10. Y10. Z10.
G83 G98 X10. Y10. Z-12. R2. Q4. F120
X30.
G80
G0 Z50.
M5
M30
%
`

describe("conversion between controls", () => {
  for (const target of ["generic", "linuxcnc", "fanuc", "haas", "siemens", "heidenhain"] as const) {
    test(`Fanuc -> ${target}: written, replayed and the same feed path within the output's rounding`, () => {
      const r = convertNc(FANUC, { source: "fanuc", target })
      expect(r.errors).toEqual([])
      expect(r.ok).toBe(true)
      expect(r.deviation!).toBeLessThanOrEqual(r.allowed!)
      expect(r.after!.tools).toEqual([3, 7])
      expect(r.after!.minZ).toBeCloseTo(-12, 6)
      // The 0.5 s dwell is read in milliseconds from Fanuc and written in each target's unit.
      expect(r.after!.dwellSeconds).toBeCloseTo(0.5, 9)
      expect(r.after!.cutLength).toBeGreaterThan(0)
      expect(Math.abs(r.after!.cutLength - r.before!.cutLength)).toBeLessThan(0.05)
    })
  }

  test("the figures are measured on both replays, and the notes say what the output does differently", () => {
    const r = convertNc(FANUC, { source: "fanuc", target: "siemens" })
    expect(r.before!.lines).toBe(FANUC.trim().split("\n").length)
    expect(r.before!.dwellSeconds).toBeCloseTo(0.5, 9)
    expect(r.after!.seconds).toBeGreaterThan(r.after!.dwellSeconds)
    expect(r.notes.join("\n")).toMatch(/Canned drilling cycles/)
    expect(r.notes.join("\n")).toMatch(/centres were moved/)
    // G98 returns to the initial plane between holes: the expanded moves keep that clearance.
    const holes = interpretGcode(r.code).segments.filter((s) => s.kind === "rapid" && s.to.x === 30 && s.to.y === 10)
    expect(holes.some((s) => s.kind !== "dwell" && s.from.z >= 10 - 1e-9)).toBe(true)
  })

  test("comments are carried to their place, the program number is kept", () => {
    const r = convertNc(FANUC, { source: "fanuc", target: "haas" })
    expect(r.code).toMatch(/^O1234$/m)
    // The comment opens the drilling operation: after its tool change, before its first move.
    expect(r.code.indexOf("(DRILL)")).toBeGreaterThan(r.code.indexOf("T7 M6"))
    expect(r.code.indexOf("(DRILL)")).toBeLessThan(r.code.indexOf("X10. Y10.") >= 0 ? r.code.indexOf("X10. Y10.") : r.code.indexOf("X10.000 Y10.000"))
    expect(r.code.indexOf("(FACE AND PROFILE)")).toBeLessThan(r.code.indexOf("G1 "))
    expect(convertNc(FANUC, { source: "fanuc", target: "haas", comments: false }).code).not.toContain("(DRILL)")
  })

  test("target options apply: subprograms, smoothing, line numbers", () => {
    const r = convertNc(FANUC, { source: "fanuc", target: "fanuc", post: { smoothing: 0.01, lineNumbers: { start: 10, step: 10 } } })
    expect(r.ok).toBe(true)
    expect(r.code).toMatch(/^N\d+ G5\.1 Q1$/m)
    expect(r.code).toMatch(/^N10 /m)
  })

  test("every post's own output converts back to the same path (round trip through every pair)", () => {
    const sample = samplePostProgram()
    for (const [from, post] of Object.entries(posts)) {
      if (from === "grbl") continue // GRBL has no tool changer: M0 pauses, still convertible but tested apart
      const text = post.emit(sample)
      for (const target of ["generic", "heidenhain"] as const) {
        const r = convertNc(text, { source: post.id, target })
        expect({ from, target, errors: r.errors }).toEqual({ from, target, errors: [] })
      }
    }
  })

  test("Klartext is read too: Heidenhain -> Fanuc", () => {
    const text = heidenhainPost.emit(samplePostProgram())
    const r = convertNc(text, { source: "heidenhain", target: "fanuc" })
    expect(r.errors).toEqual([])
    expect(r.code).toMatch(/^G3 /m)
    expect(interpretGcode(r.code, { dwell: "milliseconds" }).cutLength).toBeCloseTo(interpretGcode(genericPost.emit(samplePostProgram())).cutLength, 1)
  })
})

describe("what the conversion refuses instead of changing the cut", () => {
  const refused = (text: string, pattern: RegExp) => {
    const r = convertNc(text, { source: "fanuc", target: "generic" })
    expect(r.ok).toBe(false)
    expect(r.code).toBe("")
    expect(r.errors.join("\n")).toMatch(pattern)
  }
  test("rigid tapping, oriented boring, threading, probing", () => {
    refused("G90 T1 M6 M3 S500\nG0 X0 Y0 Z5\nG84 X0 Y0 Z-10 R2 F625\nG80\nM30", /tapping/)
    refused("G90 T1 M6 M3 S500\nG0 X0 Y0 Z5\nG76 X0 Y0 Z-10 R2 Q0.1 F100\nG80\nM30", /boring/)
    refused("G90 G0 X0 Y0 Z5\nG31 Z-10 F100\nM30", /probing/)
  })
  test("a reversed spindle, feed per revolution, several work offsets", () => {
    refused("G90 T1 M6 M4 S500\nG0 X0 Y0 Z5\nG1 Z-1 F100\nM30", /counter-clockwise/)
    refused("G90 T1 M6 M3 S500 G95\nG0 X0 Y0 Z5\nG1 Z-1 F0.1\nM30", /per revolution/)
    refused("G54 G90 G0 X0 Y0 Z5\nG55 G0 X10\nM30", /several work offsets/)
  })
  test("words the replay does not model fail the conversion, never pass silently", () => {
    refused("G90 G0 X0 Y0 Z5\nG1 Z-1 F100\nG12.5 X3\nM30", /unsupported|G12/)
    refused("(nothing)\nM30", /no motion/)
  })
  test("a target that cannot express the program says why", () => {
    const fiveAxis = fanucPost.emit({ ...samplePostProgram(), toolpaths: [{ id: "a", name: "A", toolId: "1", spindleRpm: 1000, coolant: "off", moves: [
      { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 10, y: 0, z: 0 }, feed: 100, rotary: { b: 10 } }] }] })
    const r = convertNc(fiveAxis, { source: "fanuc", target: "grbl" })
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toMatch(/grbl/)
  })
  test("programOfNc keeps tools, speeds and coolant as toolpaths", () => {
    const read = programOfNc(FANUC, { source: "fanuc" })
    expect(read.program!.toolpaths.map((t) => [t.toolId, t.spindleRpm, t.coolant])).toEqual([["3", 8000, "flood"], ["7", 3000, "off"]])
    expect(read.program!.workOffset).toBe("G54")
  })
})
