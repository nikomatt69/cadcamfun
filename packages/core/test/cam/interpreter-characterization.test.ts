/**
 * Characterization of the reference interpreter on milling programs (spec 31 §9.1). The interpreter is the replay behind the
 * evidence, the verifier and the cost measure: teaching it lathe and printer words must leave every milling replay
 * bit-identical. Each fingerprint hashes the complete result (segments, errors, end, lengths, M codes, tools).
 */
import { describe, expect, test } from "bun:test"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"
import { MILL_PROGRAMS } from "./interpreter-fixtures.ts"

const fingerprint = (text: string): string => {
  const r = interpretGcode(text)
  return Bun.hash(JSON.stringify([r.segments, r.errors, r.end, r.cutLength, r.rapidLength, r.minZ, r.mCodes, r.tools, r.ended])).toString(16)
}

/** Recorded on main @ 7f38b6b, before spec 31 touched the interpreter. */
const RECORDED: Readonly<Record<string, string>> = {
  contour: "3b5f028df03cf521",
  arcsIJ: "6644f6a67263277e",
  arcsR: "a49c61ce3e6f443d",
  incremental: "feef60165b723e1e",
  cycles: "60ef3e6e0f8ae59d",
  inch: "a1b5f9ee43985c52",
  rotary: "c1acf5ca65d47daf",
  subprograms: "e9e111e5e7cac0f6",
  // Re-recorded for spec 32 P2: G64 is accepted and G41 without a known radius says why it is drawn uncompensated; the
  // geometry is unchanged (asserted below against its fingerprint recorded before the change).
  dwellAndUnsupported: "d2451e6a7bc84d3",
  probe: "5a7348242f10f1e2"
}

describe("interpreter characterization (milling replay is bit-identical)", () => {
  for (const [name, text] of Object.entries(MILL_PROGRAMS)) {
    test(name, () => {
      expect(fingerprint(text)).toBe(RECORDED[name]!)
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
