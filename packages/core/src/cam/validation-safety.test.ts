import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { expandCycle, makeProgram, ProgramSchema, validate, type CycleMove, type MachineProfile, type Move, type Program, type Toolpath } from "./ir.ts"

const machine: MachineProfile = {
  id: "machine",
  travel: { minX: -10, maxX: 10, minY: -10, maxY: 10, minZ: -10, maxZ: 10 },
  maxFeed: 1000,
  maxSpindleRpm: 10000,
  tools: [{ id: "tool" }]
}
const path = (moves: ReadonlyArray<Move>, spindleRpm = 5000): Toolpath => ({
  id: "path", name: "Safety path", toolId: "tool", spindleRpm, coolant: "off", moves
})
const program = (moves: ReadonlyArray<Move>): Program => makeProgram("Safety", [path(moves)])
const rapid: Move = { _tag: "Rapid", to: { x: 1, y: 0, z: 0 } }
const arc: Move = { _tag: "Arc", to: { x: 0, y: 1, z: -1 }, center: { x: 0, y: 0 }, clockwise: false, feed: 100 }
const cycle: CycleMove = {
  _tag: "Cycle", cycle: "peck", to: { x: 2, y: 3, z: -5 },
  feed: 100, peckDepth: 1, dwellSeconds: 0, retractHeight: 2
}
const invalid = (input: Program, profile = machine): void => {
  const issues = validate(input, profile)
  expect(issues.some((issue) => issue._tag === "InvalidInput")).toBe(true)
  for (const issue of issues) {
    expect(issue.message.length).toBeGreaterThan(0)
    if (issue._tag === "InvalidInput") expect(issue.path.length).toBeGreaterThan(0)
  }
}

describe("validate fails closed", () => {
  test("rejects non-finite positions, arc centres, feeds and spindle speeds", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      for (const axis of ["x", "y", "z"] as const) {
        invalid(program([{ _tag: "Rapid", to: { x: 0, y: 0, z: 0, [axis]: value } }]))
      }
      for (const move of [
        { _tag: "Linear", to: { x: 0, y: 0, z: 0 }, feed: value },
        { ...arc, feed: value },
        { ...cycle, feed: value },
        { ...arc, center: { x: value, y: 0 } }
      ] as ReadonlyArray<Move>) invalid(program([rapid, move]))
      invalid(makeProgram("Safety", [path([], value)]))
    }
  })

  test("rejects non-positive feed, negative spindle and invalid dwell", () => {
    for (const feed of [0, -1]) invalid(program([{ _tag: "Linear", to: { x: 0, y: 0, z: 0 }, feed }]))
    invalid(makeProgram("Safety", [path([], -1)]))
    for (const seconds of [NaN, Infinity, -1]) invalid(program([{ _tag: "Dwell", seconds }]))
  })

  test("validates ProgramSchema compatibility, including malformed runtime input", () => {
    for (const input of [
      null, {}, { ...program([]), units: "metres" },
      { ...program([]), workOffset: "G60" },
      makeProgram("Safety", [{ ...path([]), coolant: "unknown" } as unknown as Toolpath]),
      program([{ _tag: "Unknown" } as unknown as Move])
    ]) {
      expect(() => Schema.decodeUnknownSync(ProgramSchema)(input)).toThrow()
      invalid(input as Program)
    }
    expect(validate(Schema.decodeUnknownSync(ProgramSchema)(program([rapid, arc, cycle])), machine)).toEqual([])
  })

  test("rejects non-finite and inverted machine travel even for empty programs", () => {
    for (const field of ["minX", "maxX", "minY", "maxY", "minZ", "maxZ"] as const) {
      for (const value of [NaN, Infinity, -Infinity]) invalid(program([]), { ...machine, travel: { ...machine.travel, [field]: value } })
    }
    for (const axis of ["X", "Y", "Z"] as const) invalid(program([]), { ...machine, travel: { ...machine.travel, [`min${axis}`]: 20 } })
    invalid(program([]), null as unknown as MachineProfile)
    invalid(program([]), {} as MachineProfile)
    for (const maxFeed of [NaN, Infinity, -1, 0]) invalid(program([]), { ...machine, maxFeed })
    for (const maxSpindleRpm of [NaN, Infinity, -1]) invalid(program([]), { ...machine, maxSpindleRpm })
  })

  test("rejects arcs with unknown starts, zero/mismatched/overflowing radii", () => {
    invalid(program([{ _tag: "Comment", text: "No position" }, arc]))
    invalid(program([rapid, { ...arc, center: { x: 1, y: 0 } }]))
    invalid(program([rapid, { ...arc, to: { x: 0, y: 2, z: 0 } }]))
    invalid(program([
      { _tag: "Rapid", to: { x: Number.MAX_VALUE, y: 0, z: 0 } },
      { ...arc, center: { x: -Number.MAX_VALUE, y: 0 } }
    ]))
    const issues = validate(program([arc]), machine)
    expect(issues).toContainEqual(expect.objectContaining({ _tag: "InvalidInput", toolpathId: "path", moveIndex: 0 }))
  })

  test("accepts full circles, helices and radius noise within 1e-6 mm", () => {
    expect(validate(program([rapid, arc]), machine)).toEqual([])
    expect(validate(program([rapid, { ...arc, to: { x: 1, y: 0, z: -1 } }]), machine)).toEqual([])
    expect(validate(program([rapid, { ...arc, to: { x: 0, y: 1 + 5e-7, z: 0 } }]), machine)).toEqual([])
  })

  test("rejects unsafe cycles as issues rather than expansion exceptions", () => {
    for (const change of [
      { to: { ...cycle.to, z: 2 } }, { to: { ...cycle.to, z: 3 } },
      { peckDepth: -1 }, { peckDepth: NaN }, { peckDepth: 1e-12 },
      { dwellSeconds: -1 }, { dwellSeconds: Infinity }, { retractHeight: NaN },
      { retractHeight: 1e16, to: { ...cycle.to, z: -1e16 }, peckDepth: 1 },
      { cycle: "unknown" }
    ]) invalid(program([{ ...cycle, ...change } as CycleMove]))
    expect(validate(program([{ ...cycle, peckDepth: 0 }]), machine)).toEqual([])
  })

  test("checks cycle travel analytically, including bottom, R plane and protective lift", () => {
    for (const change of [{ to: { ...cycle.to, z: -20 } }, { retractHeight: 20 }, { to: { ...cycle.to, x: 20 } }]) {
      expect(validate(program([{ ...cycle, ...change }]), machine).some((issue) => issue._tag === "TravelLimit")).toBe(true)
    }
    const start = { x: 0, y: 0, z: -8 }
    const moves = [{ _tag: "Rapid", to: start } as const, cycle]
    expect(validate(program(moves), machine)).toEqual([])
    for (const move of expandCycle(cycle, start)) expect(validate(program([move]), machine)).toEqual([])
    // A maximum-sized valid cycle must not allocate hundreds of thousands of moves.
    expect(validate(program([{ ...cycle, to: { ...cycle.to, z: 0 }, peckDepth: 2 / 100000 }]), machine)).toEqual([])
  })

  test("preserves limit issues and arc extrema checks", () => {
    const input = makeProgram("Safety", [{ ...path([
      rapid,
      { ...arc, to: { x: 1, y: 0, z: 0 }, center: { x: -5, y: 0 }, feed: 2000 },
      { _tag: "Rapid", to: { x: 20, y: 0, z: 0 } }
    ], 20000), toolId: "missing" }])
    const tags = validate(input, machine).map((issue) => issue._tag)
    expect(tags).toContain("TravelLimit")
    expect(tags).toContain("FeedLimit")
    expect(tags).toContain("SpindleLimit")
    expect(tags).toContain("MissingTool")
    expect(tags).not.toContain("InvalidInput")
    expect(validate(makeProgram("Empty", []), machine)).toEqual([])
    expect(validate(program([]), { ...machine, maxSpindleRpm: 0 }).map((issue) => issue._tag)).toEqual(["SpindleLimit"])
  })
})
