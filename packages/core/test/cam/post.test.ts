import { describe, expect, test } from "bun:test"
import { type Toolpath, makeProgram } from "../../src/cam/ir.ts"
import { type PostId, type PostOptions, formatNumber, posts, sanitizeComment, toolNumbers } from "../../src/cam/post/index.ts"
import { interpretGcode } from "../../src/cam/testing/gcode-interpreter.ts"

const tp = (moves: Toolpath["moves"], over: Partial<Toolpath> = {}): Toolpath => ({
  id: "t",
  name: "Test",
  toolId: "1",
  spindleRpm: 9000,
  coolant: "off",
  moves,
  ...over
})

const emit = (id: PostId, toolpaths: Toolpath[], options: Partial<PostOptions> = {}, program: Partial<{ units: "mm" | "inch" }> = {}): string =>
  posts[id]!.emit({ ...makeProgram("prog", toolpaths), ...program }, options)

const body = (text: string): string[] => text.split("\n").filter((l) => l !== "" && !l.startsWith("("))

const circleMoves: Toolpath["moves"] = [
  { _tag: "Rapid", to: { x: 15, y: 10, z: 2 } },
  { _tag: "Arc", to: { x: 15, y: 10, z: 2 }, center: { x: 10, y: 10 }, clockwise: true, feed: 250 }
]

describe("number formatting", () => {
  test("fixed decimals, no negative zero", () => {
    expect(formatNumber(1.23456, 3)).toBe("1.235")
    expect(formatNumber(-0.0001, 3)).toBe("0.000")
    expect(formatNumber(5, 0)).toBe("5.")
    expect(formatNumber(2, 4)).toBe("2.0000")
  })

  test("comments are ASCII and cannot close themselves early", () => {
    expect(sanitizeComment("Tool (6 mm) ä", false)).toBe("Tool 6 mm ?")
    expect(sanitizeComment("abc", true)).toBe("ABC")
  })
})

describe("prologue, epilogue and header", () => {
  const text = emit("generic", [tp([{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 4, y: 0, z: 5 }, feed: 300 }])])

  test("generic structure", () => {
    const lines = body(text)
    expect(lines.slice(0, 5)).toEqual(["G21 G90 G17 G94", "G54", "T1 M6", "M3 S9000", "G0 X0.000 Y0.000 Z5.000"])
    expect(lines.slice(-2)).toEqual(["M5", "M30"])
  })

  test("header can be switched off and lists the operations", () => {
    expect(text).toContain("(PROGRAM: prog)")
    expect(text).toContain("(OP 1: Test | T1 [1] | S9000 | F300)")
    expect(emit("generic", [tp([])], { header: false })).not.toContain("(PROGRAM")
  })

  test("fanuc wraps the program in % and an O number with a safe start block and G43", () => {
    const lines = emit("fanuc", [tp([{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }])]).split("\n")
    expect(lines[0]).toBe("%")
    expect(lines[1]).toBe("O1000")
    expect(lines.at(-2)).toBe("%")
    expect(lines).toContain("G21 G90 G17 G94 G40 G49 G80")
    expect(lines).toContain("G43 H1")
    expect(lines).toContain("(PROGRAM: PROG)")
  })

  test("fanuc honours metadata.programNumber", () => {
    const program = { ...makeProgram("p", [tp([])], { metadata: { programNumber: "42" } }) }
    expect(posts.fanuc!.emit(program, {}).split("\n")[1]).toBe("O0042")
  })

  test("grbl ends with M2 and has no M6", () => {
    const g = emit("grbl", [tp([{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }])])
    expect(body(g).at(-1)).toBe("M2")
    expect(g).not.toContain("M6")
  })

  test("metadata (material) appears in the header, sorted by key", () => {
    const program = makeProgram("p", [tp([])], { metadata: { material: "alu", stock: "100x100" } })
    const t = posts.generic!.emit(program, {})
    expect(t.indexOf("(material: alu)")).toBeLessThan(t.indexOf("(stock: 100x100)"))
  })
})

describe("modal emission", () => {
  test("motion words, axis words and F are not repeated", () => {
    const lines = body(
      emit("generic", [
        tp([
          { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
          { _tag: "Rapid", to: { x: 10, y: 0, z: 5 } },
          { _tag: "Linear", to: { x: 10, y: 10, z: 5 }, feed: 200 },
          { _tag: "Linear", to: { x: 0, y: 10, z: 5 }, feed: 200 },
          { _tag: "Linear", to: { x: 0, y: 10, z: 4 }, feed: 100 }
        ])
      ])
    )
    const start = lines.indexOf("G0 X0.000 Y0.000 Z5.000")
    expect(lines.slice(start, start + 5)).toEqual(["G0 X0.000 Y0.000 Z5.000", "X10.000", "G1 Y10.000 F200", "X0.000", "Z4.000 F100"])
  })

  test("moves that do not move after rounding are skipped", () => {
    const lines = body(
      emit("generic", [
        tp([
          { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
          { _tag: "Rapid", to: { x: 0.0001, y: 0, z: 5 } }
        ])
      ])
    )
    // 0.0001 rounds to 0.000 at three decimals: nothing to move, nothing to emit.
    expect(lines.filter((l) => l.startsWith("G0"))).toHaveLength(1)
  })

  test("a zero-length rapid after a feed move does not change the modal mode", () => {
    const lines = body(
      emit("generic", [
        tp([
          { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
          { _tag: "Linear", to: { x: 5, y: 0, z: 5 }, feed: 100 },
          { _tag: "Rapid", to: { x: 5, y: 0, z: 5 } },
          { _tag: "Linear", to: { x: 6, y: 0, z: 5 }, feed: 100 }
        ])
      ])
    )
    expect(lines).toContain("X6.000")
  })

  test("line numbers go on blocks, not on comments or % lines", () => {
    const text = emit("fanuc", [tp([{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }])], { lineNumbers: { start: 10, step: 5 } })
    const lines = text.split("\n").filter((l) => l !== "")
    expect(lines[0]).toBe("%")
    expect(lines.filter((l) => l.startsWith("N")).slice(0, 3)).toEqual(["N10 G21 G90 G17 G94 G40 G49 G80", "N15 G54", "N20 T1 M6"])
    expect(lines.filter((l) => l.startsWith("("))).not.toHaveLength(0)
  })

  test("decimals option controls every coordinate", () => {
    const text = emit("generic", [tp([{ _tag: "Rapid", to: { x: 1.23456, y: 0, z: 5 } }])], { decimals: 4 })
    expect(text).toContain("X1.2346 Y0.0000 Z5.0000")
  })
})

describe("units", () => {
  test("inch programs convert coordinates, arc offsets and feeds at the post", () => {
    const text = emit(
      "generic",
      [
        tp([
          { _tag: "Rapid", to: { x: 25.4, y: 0, z: 25.4 } },
          { _tag: "Arc", to: { x: 0, y: 25.4, z: 25.4 }, center: { x: 0, y: 0 }, clockwise: false, feed: 254 }
        ])
      ],
      {},
      { units: "inch" }
    )
    expect(text).toContain("G20")
    expect(text).toContain("G0 X1.000 Y0.000 Z1.000")
    expect(text).toContain("G3 X0.000 Y1.000 I-1.000 J0.000 F10")
    const replay = interpretGcode(text)
    expect(replay.end.y).toBeCloseTo(25.4, 6)
  })
})

describe("arcs", () => {
  test("a full circle in ijk mode is one G2 with identical start and end", () => {
    const lines = body(emit("generic", [tp(circleMoves)]))
    expect(lines).toContain("G2 X15.000 Y10.000 I-5.000 J0.000 F250")
    const r = interpretGcode(emit("generic", [tp(circleMoves)]))
    const arc = r.segments.find((s) => s.kind === "arc")!
    expect(arc.kind === "arc" && arc.radiusStart).toBeCloseTo(5, 9)
    expect(r.cutLength).toBeCloseTo(2 * Math.PI * 5, 9)
  })

  test("radius mode splits a full circle into two half circles with R", () => {
    const text = emit("generic", [tp(circleMoves)], { arcMode: "radius" })
    const arcs = body(text).filter((l) => /^G[23]|^X/.test(l) && l.includes("R"))
    expect(arcs).toHaveLength(2)
    expect(text).toContain("G2 X5.000 Y10.000 R5.000 F250")
    const r = interpretGcode(text)
    expect(r.errors).toEqual([])
    expect(r.cutLength).toBeCloseTo(2 * Math.PI * 5, 9)
    expect(r.segments.filter((s) => s.kind === "arc")).toHaveLength(2)
  })

  test("radius mode uses a negative R for sweeps above 180 degrees and replays to the same centre", () => {
    const moves: Toolpath["moves"] = [
      { _tag: "Rapid", to: { x: 5, y: 0, z: 1 } },
      { _tag: "Arc", to: { x: 0, y: -5, z: 1 }, center: { x: 0, y: 0 }, clockwise: false, feed: 100 }
    ]
    const text = emit("generic", [tp(moves)], { arcMode: "radius" })
    expect(text).toContain("R-5.000")
    const arc = interpretGcode(text).segments.find((s) => s.kind === "arc")!
    expect(arc.kind === "arc" && arc.center.x).toBeCloseTo(0, 9)
    expect(arc.kind === "arc" && arc.center.y).toBeCloseTo(0, 9)
  })

  test("linearize flattens arcs within the tolerance and ends exactly on target", () => {
    const text = emit("generic", [tp(circleMoves)], { arcMode: "linearize", tolerance: 0.01, decimals: 6 })
    expect(text).not.toMatch(/G[23]\b/)
    const r = interpretGcode(text)
    expect(r.end).toEqual({ x: 15, y: 10, z: 2 })
    for (const s of r.segments) {
      if (s.kind !== "linear") continue
      const mx = (s.from.x + s.to.x) / 2 - 10
      const my = (s.from.y + s.to.y) / 2 - 10
      expect(5 - Math.hypot(mx, my)).toBeLessThanOrEqual(0.01 + 1e-9)
    }
  })

  test("a helical arc keeps its Z in every mode", () => {
    const moves: Toolpath["moves"] = [
      { _tag: "Rapid", to: { x: 5, y: 0, z: 0 } },
      { _tag: "Arc", to: { x: 5, y: 0, z: -2 }, center: { x: 0, y: 0 }, clockwise: false, feed: 100 }
    ]
    for (const arcMode of ["ijk", "radius", "linearize"] as const) {
      const r = interpretGcode(emit("generic", [tp(moves)], { arcMode, decimals: 6 }))
      expect(r.errors).toEqual([])
      expect(r.minZ).toBeCloseTo(-2, 6)
    }
  })

  test("a request the dialect cannot satisfy falls back instead of emitting nonsense", () => {
    // All three bundled dialects accept ijk and radius; linearize is always available.
    for (const id of ["generic", "fanuc", "grbl"] as const) {
      const r = interpretGcode(emit(id, [tp(circleMoves)], { arcMode: "linearize" }), { dwell: id === "fanuc" ? "milliseconds" : "seconds" })
      expect(r.errors).toEqual([])
    }
  })
})

describe("tool, spindle and coolant handling", () => {
  const a = tp([{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }], { toolId: "1", coolant: "flood", name: "A" })
  const b = tp([{ _tag: "Rapid", to: { x: 1, y: 1, z: 5 } }], { toolId: "2", spindleRpm: 12000, name: "B" })

  test("numeric tool ids are used as tool numbers, others follow first use", () => {
    expect([...toolNumbers(makeProgram("p", [a, b])).entries()]).toEqual([["1", 1], ["2", 2]])
    expect([...toolNumbers(makeProgram("p", [{ ...a, toolId: "endmill-x" }, { ...b, toolId: "drill-y" }])).entries()]).toEqual([["endmill-x", 1], ["drill-y", 2]])
  })

  test("a tool change stops the spindle and coolant first and restarts with the new speed", () => {
    const lines = body(emit("generic", [a, b]))
    const i = lines.indexOf("M8")
    expect(i).toBeGreaterThan(0)
    const m5 = lines.indexOf("M5")
    expect(lines.slice(m5, m5 + 4)).toEqual(["M5", "M9", "T2 M6", "M3 S12000"])
  })

  test("grbl pauses with M0 for later tools instead of M6", () => {
    const lines = body(emit("grbl", [a, b]))
    expect(lines).toContain("M0")
    expect(lines.some((l) => l.includes("M6"))).toBe(false)
  })

  test("the spindle is not restarted when nothing changed", () => {
    const lines = body(emit("generic", [a, { ...a, id: "t2" }]))
    expect(lines.filter((l) => l.startsWith("M3 "))).toHaveLength(1)
    expect(lines.filter((l) => l.startsWith("T1"))).toHaveLength(1)
  })
})

describe("canned cycles", () => {
  const cyc = (z: number, over: Record<string, unknown> = {}) => ({
    _tag: "Cycle" as const,
    cycle: "peck" as const,
    to: { x: 10, y: 10, z },
    feed: 150,
    peckDepth: 3,
    dwellSeconds: 0,
    retractHeight: 2,
    ...over
  })

  test("generic/fanuc emit G83 once and repeat only X/Y for the next hole, then G80", () => {
    const moves: Toolpath["moves"] = [
      { _tag: "Rapid", to: { x: 10, y: 10, z: 10 } },
      cyc(-8),
      { ...cyc(-8), to: { x: 30, y: 10, z: -8 } },
      { _tag: "Rapid", to: { x: 30, y: 10, z: 10 } }
    ]
    const lines = body(emit("generic", [tp(moves)]))
    expect(lines).toContain("G83 G99 Z-8.000 R2.000 Q3.000 F150")
    expect(lines).toContain("X30.000")
    expect(lines.indexOf("G80")).toBeGreaterThan(lines.indexOf("X30.000"))
    expect(lines.filter((l) => l.includes("G83"))).toHaveLength(1)
  })

  test("G82 carries the dwell: seconds on generic, milliseconds on fanuc", () => {
    const moves: Toolpath["moves"] = [{ _tag: "Rapid", to: { x: 10, y: 10, z: 10 } }, cyc(-5, { cycle: "dwell", dwellSeconds: 0.5, peckDepth: 0 })]
    expect(emit("generic", [tp(moves)])).toContain("G82 G99 Z-5.000 R2.000 P0.500 F150")
    expect(emit("fanuc", [tp(moves)])).toContain("G82 G99 Z-5.000 R2.000 P500 F150")
  })

  test("a chip-break cycle is G73", () => {
    const moves: Toolpath["moves"] = [{ _tag: "Rapid", to: { x: 10, y: 10, z: 10 } }, cyc(-8, { cycle: "chipBreak" })]
    expect(emit("generic", [tp(moves)])).toContain("G73")
  })

  test("useCannedCycles: false expands to plain moves with the same depth", () => {
    const moves: Toolpath["moves"] = [{ _tag: "Rapid", to: { x: 10, y: 10, z: 10 } }, cyc(-8)]
    const text = emit("generic", [tp(moves)], { useCannedCycles: false })
    expect(text).not.toMatch(/G8[123]|G73/)
    expect(interpretGcode(text).minZ).toBeCloseTo(-8, 9)
  })
})
