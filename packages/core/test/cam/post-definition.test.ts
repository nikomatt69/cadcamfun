import { describe, expect, test } from "bun:test"
import { type Toolpath, makeProgram } from "../../src/cam/ir.ts"
import { BUILTIN_DEFINITIONS, compileDefinition, definitionIssues, posts } from "../../src/cam/post/index.ts"

const tp = (moves: Toolpath["moves"], over: Partial<Toolpath> = {}): Toolpath => ({ id: "t", name: "Test", toolId: "1", spindleRpm: 9000, coolant: "off", moves, ...over })
const cyc = (over: Record<string, unknown> = {}) => ({ _tag: "Cycle" as const, cycle: "peck" as const, to: { x: 10, y: 10, z: -8 }, feed: 150, peckDepth: 3, dwellSeconds: 0, retractHeight: 2, ...over })

const flat: Toolpath["moves"] = [
  { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
  { _tag: "Linear", to: { x: 4, y: 0, z: -1 }, feed: 300 },
  { _tag: "Arc", to: { x: 8, y: 4, z: -1 }, center: { x: 4, y: 4 }, clockwise: true, feed: 250 },
  { _tag: "Arc", to: { x: 4, y: 8, z: -2 }, center: { x: 4, y: 4 }, clockwise: false, feed: 250 },
  { _tag: "Dwell", seconds: 1.5 },
  { _tag: "Comment", text: "Finish (pass) 1" },
  { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }
]
const drilling: Toolpath["moves"] = [
  { _tag: "Rapid", to: { x: 10, y: 10, z: 10 } },
  cyc(), { ...cyc(), to: { x: 30, y: 10, z: -8 } },
  cyc({ cycle: "dwell", dwellSeconds: 0.5, peckDepth: 0, to: { x: 40, y: 10, z: -5 } }),
  cyc({ cycle: "tap", peckDepth: 0, to: { x: 50, y: 10, z: -6 } }),
  cyc({ cycle: "chipBreak", to: { x: 60, y: 10, z: -8 } }),
  { _tag: "Rapid", to: { x: 60, y: 10, z: 10 } }
]
const fiveAxis: Toolpath["moves"] = [
  { _tag: "Rapid", to: { x: 0, y: 0, z: 20 }, rotary: { a: 10, c: 0 } },
  { _tag: "Linear", to: { x: 5, y: 0, z: 10 }, feed: 800, rotary: { a: 25, c: 30 } },
  { _tag: "Linear", to: { x: 9, y: 2, z: 8 }, feed: 800, rotary: { a: 40, c: 60 } }
]
const indexed: Toolpath["moves"] = [{ _tag: "Orient", a: 0, c: 0 }, { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 5, y: 0, z: 0 }, feed: 300 }, { _tag: "Orient", a: 90, c: 0 }, { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }]

const corpus: ReadonlyArray<readonly [string, ReturnType<typeof makeProgram>]> = [
  ["3-axis moves, arcs, dwell, comment", makeProgram("flat", [tp(flat)])],
  ["drilling cycles", makeProgram("drilling", [tp(drilling)])],
  ["two tools and coolant", makeProgram("two tools", [tp(flat, { toolId: "1", coolant: "flood" }), tp(flat, { toolId: "7", name: "B", coolant: "mist", spindleRpm: 12000 })])],
  ["simultaneous five axis", makeProgram("five axis", [tp(fiveAxis)])],
  ["indexed rotary positions", makeProgram("indexed", [tp(indexed)])],
  ["a program number and metadata", makeProgram("with number", [tp(flat)], { metadata: { programNumber: "42", material: "alu" } })],
  ["a name with spaces and symbols", makeProgram("Part #7 / rev (B)", [tp(flat)])]
]

describe("post definitions", () => {
  for (const [id, definition] of Object.entries(BUILTIN_DEFINITIONS)) {
    describe(`the built-in ${id} written as data`, () => {
      const compiled = compileDefinition(definition)
      test("is a valid definition", () => {
        expect(definitionIssues(definition)).toEqual([])
        expect(compiled.ok).toBe(true)
      })
      for (const [name, program] of corpus) {
        for (const options of [{}, { header: false }, { useCannedCycles: false }, { subprograms: true }, { units: "inch" as const }] as const) {
          test(`writes the same program as the post: ${name} ${JSON.stringify(options)}`, () => {
            if (!compiled.ok) throw new Error("not compiled")
            const o = options as never
            const original = posts[id as keyof typeof posts]!
            // A program the post refuses (rotary motion on a control with no rotary axes) is refused with the same words.
            const written = (emit: () => string) => { try { return emit() } catch (cause) { return `refused: ${cause instanceof Error ? cause.message : String(cause)}` } }
            expect(written(() => compiled.post.emit(program, o))).toBe(written(() => original.emit(program, o)))
          })
        }
      }
    })
  }

  test("a definition changes what it says and nothing else", () => {
    const compiled = compileDefinition({ ...BUILTIN_DEFINITIONS.generic, name: "Shop", end: "M30 (done)", toolChange: ["M5", "T{tool} M6", "G43 H{tool}"], setup: ["G90", "G17", "G94", "G49"] })
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues))
    const text = compiled.post.emit(makeProgram("p", [tp(flat)]), {})
    expect(text).toContain("G49")
    expect(text).toContain("T1 M6\nG43 H1")
    expect(text.trimEnd().split("\n").at(-1)).toBe("M30 (done)")
  })

  test("a definition on a built-in base keeps that base's rules and changes the words it names", () => {
    const compiled = compileDefinition({ schemaVersion: 1, name: "Siemens shop", base: "siemens", end: "M30" })
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues))
    expect(compiled.post.emit(makeProgram("my program", [tp(flat)]), {})).toBe(posts.siemens!.emit(makeProgram("my program", [tp(flat)]), {}))
  })

  test("a mistake is reported at its place", () => {
    const issues = (v: unknown) => definitionIssues(v).map((i) => `${i.path}: ${i.message}`)
    expect(issues({ ...BUILTIN_DEFINITIONS.generic, toolChange: ["T{toool} M6"] }).join("\n")).toContain("toolChange[0]")
    expect(issues({ ...BUILTIN_DEFINITIONS.generic, begin: ["O1\u0007"] }).join("\n")).toContain("begin")
    expect(issues({ ...BUILTIN_DEFINITIONS.generic, name: "" }).join("\n")).toContain("name")
    expect(issues({ ...BUILTIN_DEFINITIONS.generic, base: "mach9" }).join("\n")).toContain("base")
    expect(issues({ ...BUILTIN_DEFINITIONS.grbl, tcp: { kind: "offset", code: "G43.4" } }).join("\n")).toContain("tcp")
    const { toolChange: _unused, ...withoutChange } = BUILTIN_DEFINITIONS.generic
    expect(issues({ ...withoutChange, firstToolChange: ["T{tool}"] }).join("\n")).toContain("firstToolChange")
    expect(issues({ ...BUILTIN_DEFINITIONS.generic, schemaVersion: 2 }).join("\n")).toContain("schemaVersion")
    const bad = compileDefinition({ ...BUILTIN_DEFINITIONS.generic, end: "M{rpm}x{nope}" })
    expect(bad.ok).toBe(false)
  })
})
