import { describe, expect, test } from "bun:test"
import { type Toolpath, makeProgram } from "../../src/cam/ir.ts"
import { type PostId, type PostOptions, posts, toolNumbers } from "../../src/cam/post/index.ts"

const tp = (moves: Toolpath["moves"], over: Partial<Toolpath> = {}): Toolpath => ({
  id: "t",
  name: "Test",
  toolId: "1",
  spindleRpm: 9000,
  coolant: "off",
  moves,
  ...over
})

const emit = (id: PostId, toolpaths: Toolpath[], options: Partial<PostOptions> = {}): string =>
  posts[id]!.emit(makeProgram("prog", toolpaths), options)

const lines = (text: string): string[] => text.split("\n").filter((line) => line !== "" && !line.startsWith("("))

/** Two operations with two different tools: the first one cuts at Z-2, the second works at Z5. */
const twoTools = (): Toolpath[] => [
  tp([{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 5, y: 0, z: -2 }, feed: 300 }]),
  tp([{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 5, y: 0, z: 5 }, feed: 300 }], { id: "t2", toolId: "2", spindleRpm: 6000 })
]

describe("tool numbers", () => {
  test("numeric tool ids are used as they are, otherwise first use", () => {
    expect(toolNumbers(makeProgram("p", [tp([], { toolId: "7" })]))).toEqual(new Map([["7", 7]]))
    expect(toolNumbers(makeProgram("p", [tp([], { toolId: "endmill-6" }), tp([], { id: "u", toolId: "drill-3" })])))
      .toEqual(new Map([["endmill-6", 1], ["drill-3", 2]]))
  })

  test("an override wins over first-use numbering", () => {
    expect(toolNumbers(makeProgram("p", [tp([], { toolId: "endmill-6" })]), { "endmill-6": 4 })).toEqual(new Map([["endmill-6", 4]]))
    const program = makeProgram("p", [tp([], { toolId: "b" }), tp([], { id: "u", toolId: "a" })])
    expect(toolNumbers(program, { a: 5, b: 3 })).toEqual(new Map([["b", 3], ["a", 5]]))
  })

  test("ids the override does not cover take the first free number, never a taken pocket", () => {
    // `drill` keeps its hand-set pocket 5; the unnamed end mill must not also become 5.
    const program = makeProgram("p", [tp([], { toolId: "drill" }), tp([], { id: "u", toolId: "em" })])
    expect(toolNumbers(program, { drill: 5 })).toEqual(new Map([["drill", 5], ["em", 1]]))
  })

  test("an unusable override entry falls back to first use", () => {
    const program = makeProgram("p", [tp([], { toolId: "em" })])
    expect(toolNumbers(program, { em: 0 })).toEqual(new Map([["em", 1]]))
    expect(toolNumbers(program, { em: 2.5 })).toEqual(new Map([["em", 1]]))
  })

  test("the emitted program uses the override for T, G43 H and the header", () => {
    const text = emit("fanuc", twoTools(), { toolNumbers: { "1": 5, "2": 2 } })
    expect(text).toContain("T5 M6")
    expect(text).toContain("G43 H5")
    expect(text).toContain("T2 M6")
    expect(text).toContain("G43 H2")
    expect(text).toContain("(OP 1: TEST | T5 [1] | S9000 | F300)")
    expect(text).toContain("(OP 2: TEST | T2 [2] | S6000 | F300)")
  })

  test("without an override the numbering is unchanged", () => {
    const text = emit("generic", twoTools())
    expect(text).toContain("T1 M6")
    expect(text).toContain("T2 M6")
  })
})

describe("retract before a tool change", () => {
  test("off by default: the tool change happens where the tool is", () => {
    const text = lines(emit("generic", twoTools()))
    const change = text.indexOf("T2 M6")
    expect(text[change - 1]).toBe("M5")
  })

  test("on: Z is raised to the highest point reached before M5 and the change", () => {
    const text = lines(emit("generic", twoTools(), { retractBeforeToolChange: true }))
    const change = text.indexOf("T2 M6")
    expect(text.slice(change - 2, change)).toEqual(["G0 Z5.000", "M5"])
  })

  test("on: no extra move when the tool is already at the highest point of the program", () => {
    const sameHeight: Toolpath[] = [
      tp([{ _tag: "Rapid", to: { x: 0, y: 0, z: -2 } }, { _tag: "Linear", to: { x: 5, y: 0, z: -2 }, feed: 300 }], { id: "a", toolId: "1" }),
      tp([{ _tag: "Linear", to: { x: 8, y: 0, z: -2 }, feed: 300 }], { id: "b", toolId: "2" })
    ]
    expect(lines(emit("generic", sameHeight, { retractBeforeToolChange: true }))).not.toContain("G0 Z0.000")
  })
})
