import { describe, expect, test } from "bun:test"
import { highlightCode, highlightLine, languageOf } from "../lib/code-highlight"

const join = (tokens: readonly { text: string }[]) => tokens.map((token) => token.text).join("")

describe("language", () => {
  test("tags and aliases", () => {
    expect(languageOf("gcode", "")).toBe("gcode")
    expect(languageOf("NC", "")).toBe("gcode")
    expect(languageOf("json", "")).toBe("json")
    expect(languageOf("python", "G21")).toBe("plain")
  })

  test("an untagged fence is G-code when it opens like a program", () => {
    // The first line decides: a program that opens with a bare "%" is not claimed.
    expect(languageOf("", "\n%\nG21 G90")).toBe("plain")
    expect(languageOf("", "G21 G90\nG0 X0")).toBe("gcode")
    expect(languageOf("", "N10 M3 S12000")).toBe("gcode")
    expect(languageOf("", "Hello there")).toBe("plain")
  })
})

describe("g-code", () => {
  test("words get their roles and the line still joins back to itself", () => {
    const line = "N10 G1 X-10.5 Y3 F800 S12000 M3 ; cut"
    const tokens = highlightLine("gcode", line)
    expect(join(tokens)).toBe(line)
    const kinds = Object.fromEntries(tokens.filter((t) => t.text.trim()).map((t) => [t.text, t.kind]))
    expect(kinds["N10"]).toBe("punct")
    expect(kinds["G1"]).toBe("command")
    expect(kinds["M3"]).toBe("motion")
    expect(kinds["F800"]).toBe("feed")
    expect(kinds["; cut"]).toBe("comment")
  })

  test("parameters, parenthesis comments and an unclosed comment", () => {
    const line = "G2 X1.5 I-0.25 (arc) (open"
    const tokens = highlightLine("gcode", line)
    expect(join(tokens)).toBe(line)
    expect(tokens.filter((t) => t.kind === "comment").map((t) => t.text)).toEqual(["(arc)", "(open"])
    expect(tokens.some((t) => t.kind === "param" && t.text.includes("X1.5"))).toBe(true)
  })

  test("odd characters survive", () => {
    const line = "G1 X1 =~ #5 [ ] é"
    expect(join(highlightLine("gcode", line))).toBe(line)
  })
})

describe("json", () => {
  test("keys, strings, numbers and keywords", () => {
    const line = '  "radius": 2.5, "name": "bolt", "ok": true, "x": null'
    const tokens = highlightLine("json", line)
    expect(join(tokens)).toBe(line)
    const kind = (text: string) => tokens.find((t) => t.text === text)?.kind
    expect(kind('"radius"')).toBe("key")
    expect(kind('"bolt"')).toBe("string")
    expect(kind("2.5")).toBe("number")
    expect(kind("true")).toBe("keyword")
    expect(kind("null")).toBe("keyword")
  })

  test("an unterminated string keeps its text", () => {
    const line = '"name": "bo'
    expect(join(highlightLine("json", line))).toBe(line)
  })
})

test("plain code is one run, blank lines are empty and every line is kept", () => {
  expect(highlightLine("plain", "anything")).toEqual([{ text: "anything", kind: "plain" }])
  expect(highlightCode("gcode", "G0 X0\n\nG1 X1")).toHaveLength(3)
  expect(highlightCode("gcode", "G0 X0\n\nG1 X1")[1]).toEqual([])
})
