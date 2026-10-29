import { describe, expect, test } from "bun:test"
import { caretPosition, tokenizeGcodeLine } from "../src/features/cam/lib/gcode-tokens.ts"

describe("gcode tokens", () => {
  test("classifies words and keeps the line intact", () => {
    const line = "N10 G01 X-1.5 Y2 F300 S12000 M3 T2 (rough) ; tail"
    const tokens = tokenizeGcodeLine(line)
    expect(tokens.map(t => t.text).join("")).toBe(line)
    const kinds = Object.fromEntries(tokens.filter(t => t.kind !== "text").map(t => [t.text, t.kind]))
    expect(kinds).toMatchObject({ N10: "seq", G01: "g", F300: "feed", S12000: "feed", M3: "m", T2: "tool", "(rough)": "comment", "; tail": "comment" })
  })
  test("an unclosed parenthesis and bare letters stay plain", () => {
    const tokens = tokenizeGcodeLine("G0 (open")
    expect(tokens.map(t => t.text).join("")).toBe("G0 (open")
    expect(tokenizeGcodeLine("G")[0]?.kind).toBe("text")
  })
  test("caret position is 1-based", () => {
    expect(caretPosition("G0 X1\nG1 Y2", 0)).toEqual({ line: 1, column: 1 })
    expect(caretPosition("G0 X1\nG1 Y2", 9)).toEqual({ line: 2, column: 4 })
    expect(caretPosition("a", 99)).toEqual({ line: 1, column: 2 })
  })
})
