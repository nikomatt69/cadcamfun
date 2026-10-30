/**
 * Vendor dialects over a base post (spec 72 P4-6): Mitsubishi MELDAS and Brother Speedio. Golden NC for each, the differences table of
 * their header comments asserted line by line against the Fanuc post they are built on, and the replay of every post reading the same cut.
 * DMG MORI is deliberately absent: CELOS is a user interface over a Siemens or Heidenhain control, which already have posts.
 */
import { describe, expect, test } from "bun:test"
import { frameFromNormal } from "../../src/cam/indexing.ts"
import { makeProgram, type Program, type Toolpath } from "../../src/cam/ir.ts"
import { brotherPost, fanucPost, mitsubishiPost, vendorDialectOf, vendorPosts } from "../../src/cam/post/index.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

const program = (): Program => makeProgram("Vendor", [
  { id: "a", name: "Pocket", toolId: "1", spindleRpm: 9000, coolant: "flood", moves: [
    { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 0, y: 0, z: -2 }, feed: 300 }, { _tag: "Linear", to: { x: 20, y: 0, z: -2 }, feed: 600 },
    { _tag: "Arc", to: { x: 30, y: 10, z: -2 }, center: { x: 20, y: 10 }, clockwise: false, feed: 500 }, { _tag: "Rapid", to: { x: 30, y: 10, z: 5 } }] },
  { id: "b", name: "Holes", toolId: "2", spindleRpm: 6000, coolant: "off", moves: [
    { _tag: "Rapid", to: { x: 5, y: 5, z: 5 } },
    { _tag: "Cycle", cycle: "peck", to: { x: 5, y: 5, z: -12 }, feed: 150, peckDepth: 4, dwellSeconds: 0, retractHeight: 2 },
    { _tag: "Cycle", cycle: "peck", to: { x: 15, y: 5, z: -12 }, feed: 150, peckDepth: 4, dwellSeconds: 0, retractHeight: 2 }] }
], { metadata: { programNumber: "2024" } })

const tap: Toolpath = { id: "t", name: "Tap", toolId: "3", spindleRpm: 500, coolant: "off", moves: [
  { _tag: "Rapid", to: { x: 5, y: 5, z: 5 } }, { _tag: "Cycle", cycle: "tap", to: { x: 5, y: 5, z: -10 }, feed: 500, peckDepth: 0, dwellSeconds: 0, retractHeight: 2, pitch: 1 }] }

const mitsubishiGolden = `%
O2024
G21 G90 G17 G94 G40 G49 G80
G54
(OPERATION: POCKET)
T1 M6
G43 H1
M3 S9000
M8
G0 X0.000 Y0.000 Z5.000
G1 Z-2.000 F300
X20.000 F600
G3 X30.000 Y10.000 I0.000 J10.000 F500
G0 Z5.000
(OPERATION: HOLES)
M5
M9
T2 M6
G43 H2
M3 S6000
X5.000 Y5.000
G83 G99 Z-12.000 R2.000 Q4.000 F150
X15.000
G80
G0 Z5.000
M5
M30
%
`
const brotherGolden = mitsubishiGolden.replace("T1 M6", "G100 T1 M6").replace("T2 M6", "G100 T2 M6")

describe("Mitsubishi MELDAS (Fanuc-compatible G-code list)", () => {
  test("golden NC", () => {
    expect(mitsubishiPost.emit(program(), { header: false })).toBe(mitsubishiGolden)
  })

  test("differences from Fanuc: no rigid tap, no AI contour word, no tilted plane; the tip-control word stays", () => {
    const withSmoothing = { header: false, smoothing: 0.02 } as const
    expect(fanucPost.emit(program(), withSmoothing)).toContain("G5.1 Q1")
    expect(mitsubishiPost.emit(program(), withSmoothing)).not.toContain("G5.1")
    expect(() => fanucPost.emit(makeProgram("t", [tap]), {})).not.toThrow()
    expect(() => mitsubishiPost.emit(makeProgram("t", [tap]), {})).toThrow(/rigid tapping/)
    const frame = frameFromNormal({ x: 0, y: 0, z: 0 }, { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 })
    expect(() => mitsubishiPost.emit(program(), { workPlanes: { a: { frame } } })).toThrow(/no tilted-plane words/)
    expect(vendorDialectOf("mitsubishi").tcp).toBe("G43.4")
  })
})

describe("Brother Speedio (CNC-C00)", () => {
  test("golden NC", () => {
    expect(brotherPost.emit(program(), { header: false })).toBe(brotherGolden)
  })

  test("the tool call is the G100 block; a program with rotary moves or a tilted plane is refused", () => {
    expect(brotherPost.emit(program(), { header: false })).not.toMatch(/^T\d+ M6$/m)
    const rotary: Toolpath = { id: "r", name: "Rotary", toolId: "1", spindleRpm: 8000, coolant: "off", moves: [{ _tag: "Rapid", to: { x: 0, y: 0, z: 10 }, rotary: { b: 30, c: 0 } }] }
    expect(() => brotherPost.emit(makeProgram("r", [rotary]), {})).toThrow(/cannot write/)
    expect(() => brotherPost.emit(makeProgram("t", [tap]), {})).toThrow(/rigid tapping/)
  })
})

describe("every post reads the same cut", () => {
  test("the replay of Fanuc, Mitsubishi and Brother output is the same feed path (G100 T M6 selects the tool)", () => {
    const cut = (text: string) => {
      const r = interpretGcode(text, { dwell: "milliseconds" })
      expect(r.errors).toEqual([])
      return { cut: r.cutLength, tools: r.tools, end: r.end }
    }
    const fanuc = cut(fanucPost.emit(program(), {}))
    for (const post of Object.values(vendorPosts)) {
      const got = cut(post.emit(program(), {}))
      expect(got.cut).toBeCloseTo(fanuc.cut, 9)
      expect(got.tools).toEqual([1, 2])
      expect(got.end).toEqual(fanuc.end)
    }
  })

  test("a G100 block without a tool change is not read as one", () => {
    expect(interpretGcode("G21 G90\nG100 X5\nM30").errors.join(" ")).toContain("G100")
  })
})
