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
  dwellAndUnsupported: "ea28d72a170a9b3a",
  probe: "5a7348242f10f1e2"
}

describe("interpreter characterization (milling replay is bit-identical)", () => {
  for (const [name, text] of Object.entries(MILL_PROGRAMS)) {
    test(name, () => {
      expect(fingerprint(text)).toBe(RECORDED[name]!)
    })
  }
})
