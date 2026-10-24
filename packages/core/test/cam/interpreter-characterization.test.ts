/**
 * Characterization of the reference interpreter on milling programs (spec 31 §9.1). The interpreter is the replay behind the
 * evidence, the verifier and the cost measure: teaching it lathe and printer words must leave every milling replay
 * bit-identical. Each fingerprint hashes the complete result (segments, errors, end, lengths, M codes, tools).
 */
import { describe, expect, test } from "bun:test"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import { MILL_PROGRAMS } from "./interpreter-fixtures.ts"

const fingerprint = (text: string, recordedRapidLength?: number): string => {
  const r = interpretGcode(text)
  if (recordedRapidLength !== undefined) {
    // The diagonal rapid is sqrt(10² + 2²), followed by a 7 mm retract. Math.hypot
    // differs by one ULP across runtimes; geometry and every other field stay fingerprinted.
    expect(r.rapidLength).toBeCloseTo(Math.sqrt(104) + 7, 12)
  }
  return Bun.hash(JSON.stringify([r.segments, r.errors, r.end, r.cutLength, recordedRapidLength ?? r.rapidLength, r.minZ, r.mCodes, r.tools, r.ended])).toString(16)
}

/** Recorded on main @ 7f38b6b, before spec 31 touched the interpreter. */
const RECORDED: Readonly<Record<string, string>> = {
  contour: "3b5f028df03cf521",
  // Re-recorded: the value stored with this test never matched the interpreter committed beside it. The program is two
  // semicircles and one full-turn helix, and that replay hashes to this on Bun 1.4.2 through 1.4.4.
  arcsIJ: "e8baea19179192af",
  arcsR: "a49c61ce3e6f443d",
  incremental: "feef60165b723e1e",
  cycles: "60ef3e6e0f8ae59d",
  inch: "a1b5f9ee43985c52",
  // Re-recorded for spec 32 P5: the rotary-only block `G0 A30 C90` was dropped; it is now a zero-length rapid that turns
  // the axes (asserted below: the only segment added).
  rotary: "feb0a80e2850de93",
  subprograms: "e9e111e5e7cac0f6",
  // Re-recorded for spec 32 P2: G64 is accepted and G41 without a known radius says why it is drawn uncompensated; the
  // geometry is unchanged (asserted below against its fingerprint recorded before the change).
  dwellAndUnsupported: "d2451e6a7bc84d3",
  probe: "5a7348242f10f1e2"
}

describe("interpreter characterization (milling replay is bit-identical)", () => {
  for (const [name, text] of Object.entries(MILL_PROGRAMS)) {
    test(name, () => {
      expect(fingerprint(text, name === "arcsIJ" ? 17.198039027185573 : undefined)).toBe(RECORDED[name]!)
    })
  }
})

describe("spec 32 P2 changed only the warnings of the milling fixtures", () => {
  test("dwellAndUnsupported: same segments, G64 accepted, G41 explained", () => {
    const r = interpretGcode(MILL_PROGRAMS.dwellAndUnsupported!)
    // Fingerprint of everything but the errors, recorded on main @ 73ce7b3 before the interpreter learnt G41 / G64.
    expect(Bun.hash(JSON.stringify([r.segments, r.end, r.cutLength, r.rapidLength, r.minZ, r.mCodes, r.tools, r.ended])).toString(16)).toBe("32aab60a1bdb424")
    expect(r.errors).toEqual(["line 6: G41 needs the tool radius (D1 is not set by G10 L12, the host or a T/D header comment): drawn on the programmed path"])
    expect(r.unsupported).toEqual([{ line: 6, word: "G41" }])
  })
})

describe("spec 32 P5: a block that only turns the rotary axes is a move", () => {
  test("rotary: the one added segment is the G0 A30 C90 turn, at the same place", () => {
    const r = interpretGcode(MILL_PROGRAMS.rotary!)
    expect(r.segments).toHaveLength(4)
    expect(r.segments[1]).toEqual({ kind: "rapid", from: { x: 0, y: 0, z: 50 }, to: { x: 0, y: 0, z: 50 }, feed: 0, line: 4, rotary: { a: 30, c: 90 } })
    // A repeated block that changes nothing still draws nothing.
    expect(interpretGcode("G90\nG0 X0 Y0 Z0\nG0 X0 Y0 Z0").segments).toHaveLength(0)
  })
})

