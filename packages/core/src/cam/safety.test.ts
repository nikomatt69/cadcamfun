import { describe, expect, test } from "bun:test"
import { type CycleMove, type Move, expandCycle, makeProgram } from "./ir.ts"
import { posts } from "./post/index.ts"
import { interpretGcode } from "./testing/gcode-interpreter.ts"

const cycle = (over: Partial<CycleMove> = {}): CycleMove => ({
  _tag: "Cycle", cycle: "peck", to: { x: 10, y: 0, z: -5 },
  feed: 100, peckDepth: 2, dwellSeconds: 0, retractHeight: 2, ...over
})
const start: Move = { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }
const emit = (moves: ReadonlyArray<Move>, id: "generic" | "fanuc" | "grbl" = "generic", decimals = 3): string => {
  const post = posts[id]
  if (!post) throw new Error("Missing test post")
  return post.emit(makeProgram("Safety", [{
    id: "op", name: "Safety", toolId: "1", spindleRpm: 1000, coolant: "off", moves
  }]), { header: false, decimals })
}

describe("drilling safety", () => {
  test("expanded cycles lift before lateral positioning below R", () => {
    const moves = expandCycle(cycle(), { x: 0, y: 0, z: -3 })
    expect(moves.slice(0, 2)).toEqual([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 2 } },
      { _tag: "Rapid", to: { x: 10, y: 0, z: 2 } }
    ])
  })

  for (const id of ["generic", "fanuc", "grbl"] as const) {
    test(`${id} lifts before repositioning a cycle`, () => {
      const text = emit([start, { _tag: "Linear", to: { x: 0, y: 0, z: -3 }, feed: 100 }, cycle()], id)
      const lines = text.split("\n")
      const lift = lines.indexOf("G0 Z2.000")
      expect(lift).toBeGreaterThan(0)
      expect(lines[lift + 1]).toContain(id === "grbl" ? "X10.000" : "G83")
    })
  }

  test("identical successive holes still execute twice", () => {
    const text = emit([start, cycle({ cycle: "drill" }), cycle({ cycle: "drill" })])
    expect(text.split("\n").filter((line) => line.includes("G81"))).toHaveLength(2)
    const result = interpretGcode(text)
    expect(result.errors).toEqual([])
  })

  test("zero dwell resets modal P for each canned dialect", () => {
    for (const id of ["generic", "fanuc"] as const) {
      const text = emit([start, cycle({ cycle: "dwell", dwellSeconds: 1 }),
        cycle({ cycle: "dwell", to: { x: 20, y: 0, z: -5 } })], id)
      expect(text).toContain(id === "fanuc" ? "P1000" : "P1.000")
      expect(text).toContain(id === "fanuc" ? "P0" : "P0.000")
    }
  })

  test("invalid cycles fail both expansion and emission", () => {
    for (const bad of [
      cycle({ feed: 0 }), cycle({ peckDepth: -1 }), cycle({ dwellSeconds: NaN }),
      cycle({ retractHeight: -5 }), cycle({ to: { x: Infinity, y: 0, z: -5 } }),
      cycle({ peckDepth: 1e-10 }), cycle({ retractHeight: 1e20, to: { x: 0, y: 0, z: 0 }, peckDepth: 1 })
    ]) {
      expect(() => expandCycle(bad, { x: 0, y: 0, z: 5 })).toThrow(RangeError)
      for (const id of ["generic", "fanuc", "grbl"] as const) expect(() => emit([start, bad], id)).toThrow(RangeError)
    }
  })

  test("zero peck retains a single feed to bottom", () => {
    expect(expandCycle(cycle({ peckDepth: 0 }), { x: 10, y: 0, z: 2 })
      .filter((move) => move._tag === "Linear")).toEqual([
        { _tag: "Linear", to: { x: 10, y: 0, z: -5 }, feed: 100 }
      ])
  })
})

describe("arc safety", () => {
  const arc: Move = { _tag: "Arc", to: { x: 0, y: 1, z: 5 }, center: { x: 0, y: 0 }, clockwise: false, feed: 100 }
  const arcStart: Move = { _tag: "Rapid", to: { x: 1, y: 0, z: 5 } }

  test("unknown start and inconsistent radii fail closed", () => {
    expect(() => emit([arc])).toThrow(RangeError)
    expect(() => emit([start, arc])).toThrow(RangeError)
    expect(() => emit([arcStart, { ...arc, to: { x: 0, y: 2, z: 5 } }])).toThrow(RangeError)
    expect(() => emit([arcStart, { ...arc, feed: NaN }])).toThrow(RangeError)
  })

  test("a short arc collapsed by precision does not become a full circle", () => {
    const angle = 0.0001
    const text = emit([arcStart, { ...arc, to: { x: Math.cos(angle), y: Math.sin(angle), z: 5 } }])
    expect(text).not.toMatch(/G[23] /)
    expect(interpretGcode(text).errors).toEqual([])
  })

  test("real full circles and helices remain arcs", () => {
    const text = emit([arcStart, { ...arc, to: { x: 1, y: 0, z: 4 } }])
    expect(text).toContain("G3 X1.000 Y0.000 Z4.000 I-1.000 J0.000")
  })
})
