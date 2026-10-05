import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  type Toolpath,
  arcSweepBetween,
  decodeProgram,
  encodeProgram,
  estimateTime,
  expandCycle,
  makeProgram,
  toolpathBounds,
  toolpathLength,
  toolpathPathLength,
  validate
} from "../../src/cam/ir.ts"

const tp = (moves: Toolpath["moves"]): Toolpath => ({
  id: "t",
  name: "t",
  toolId: "1",
  spindleRpm: 10000,
  coolant: "off",
  moves
})

describe("arcSweepBetween", () => {
  test("quarter turns in both directions", () => {
    const c = { x: 0, y: 0 }
    expect(arcSweepBetween({ x: 1, y: 0 }, { x: 0, y: 1 }, c, false)).toBeCloseTo(Math.PI / 2, 12)
    expect(arcSweepBetween({ x: 1, y: 0 }, { x: 0, y: 1 }, c, true)).toBeCloseTo((3 * Math.PI) / 2, 12)
  })

  test("a wrap across the -pi/pi seam is positive (regression: JS % keeps the sign)", () => {
    const c = { x: 0, y: 0 }
    const from = { x: Math.cos(3), y: Math.sin(3) }
    const to = { x: Math.cos(-3), y: Math.sin(-3) }
    expect(arcSweepBetween(from, to, c, false)).toBeCloseTo(2 * Math.PI - 6, 12)
  })

  test("identical endpoints are a full circle", () => {
    expect(arcSweepBetween({ x: 2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 0 }, false)).toBeCloseTo(2 * Math.PI, 12)
  })
})

describe("toolpath analysis", () => {
  const path = tp([
    { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
    { _tag: "Linear", to: { x: 10, y: 0, z: 5 }, feed: 600 },
    { _tag: "Arc", to: { x: 10, y: 0, z: 5 }, center: { x: 5, y: 0 }, clockwise: false, feed: 600 }
  ])

  test("length counts feed moves only; a full circle contributes 2 pi r", () => {
    expect(toolpathLength(path)).toBeCloseTo(10 + 2 * Math.PI * 5, 9)
    // The first target is the start point, so the leading rapid has no length.
    expect(toolpathPathLength(path)).toBeCloseTo(10 + 2 * Math.PI * 5, 9)
  })

  test("a helical arc adds its rise to the length", () => {
    const helix = tp([
      { _tag: "Rapid", to: { x: 5, y: 0, z: 0 } },
      { _tag: "Arc", to: { x: 5, y: 0, z: -1 }, center: { x: 0, y: 0 }, clockwise: false, feed: 100 }
    ])
    expect(toolpathLength(helix)).toBeCloseTo(Math.hypot(2 * Math.PI * 5, 1), 9)
  })

  test("bounds include arc extrema inside the sweep", () => {
    const quarter = tp([
      { _tag: "Rapid", to: { x: 5, y: 0, z: 0 } },
      { _tag: "Arc", to: { x: 0, y: 5, z: 0 }, center: { x: 0, y: 0 }, clockwise: false, feed: 100 }
    ])
    const b = toolpathBounds(quarter)
    expect(b.maxX).toBeCloseTo(5, 12)
    expect(b.maxY).toBeCloseTo(5, 12)
    expect(b.minX).toBeCloseTo(0, 12)
    const half = tp([
      { _tag: "Rapid", to: { x: 5, y: 0, z: 0 } },
      { _tag: "Arc", to: { x: -5, y: 0, z: 0 }, center: { x: 0, y: 0 }, clockwise: false, feed: 100 }
    ])
    expect(toolpathBounds(half).maxY).toBeCloseTo(5, 12)
    expect(toolpathBounds(half).minY).toBeCloseTo(0, 12)
  })

  test("estimateTime sums rapids, feeds and dwells", () => {
    const t = tp([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 0 } },
      { _tag: "Rapid", to: { x: 6000, y: 0, z: 0 } },
      { _tag: "Linear", to: { x: 6600, y: 0, z: 0 }, feed: 600 },
      { _tag: "Dwell", seconds: 2 }
    ])
    expect(estimateTime(t, 6000)).toBeCloseTo(60 + 60 + 2, 9)
  })
})

describe("expandCycle", () => {
  const cycle = {
    _tag: "Cycle" as const,
    cycle: "peck" as const,
    to: { x: 10, y: 10, z: -8 },
    feed: 200,
    peckDepth: 4,
    dwellSeconds: 0,
    retractHeight: 2
  }

  test("a peck cycle retracts to R between pecks and ends at R", () => {
    const moves = expandCycle(cycle, { x: 10, y: 10, z: 10 })
    const zs = moves.flatMap((m) => (m._tag === "Linear" ? [m.to.z] : []))
    expect(zs).toEqual([-2, -6, -8])
    expect(moves.at(-1)).toEqual({ _tag: "Rapid", to: { x: 10, y: 10, z: 2 } })
  })

  test("a dwell cycle waits at the bottom", () => {
    const moves = expandCycle({ ...cycle, cycle: "dwell", dwellSeconds: 1.5, peckDepth: 0 }, { x: 10, y: 10, z: 2 })
    expect(moves.map((m) => m._tag)).toEqual(["Linear", "Dwell", "Rapid"])
  })

  test("cycle length for toolpathLength is the expanded feed travel", () => {
    const path = tp([{ _tag: "Rapid", to: { x: 10, y: 10, z: 10 } }, cycle])
    // R=2: 4 down (to -2), then 0.5 above -2 to -6 = 4.5, then 0.5 above -6 to -8 = 2.5.
    expect(toolpathLength(path)).toBeCloseTo(4 + 4.5 + 2.5, 9)
  })
})

describe("validate", () => {
  const machine = { id: "m", travel: { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: -50, maxZ: 50 }, maxFeed: 1000 }

  test("reports travel, feed and missing-tool issues", () => {
    const program = makeProgram("p", [
      tp([
        { _tag: "Rapid", to: { x: 0, y: 0, z: 10 } },
        { _tag: "Linear", to: { x: 150, y: 0, z: 10 }, feed: 2000 }
      ])
    ])
    const issues = validate(program, { ...machine, tools: [{ id: "other" }] })
    expect(issues.map((i) => i._tag).sort()).toEqual(["FeedLimit", "MissingTool", "TravelLimit"])
  })

  test("a program inside the limits has no issues, arcs included", () => {
    const program = makeProgram("p", [
      tp([
        { _tag: "Rapid", to: { x: 90, y: 50, z: 10 } },
        { _tag: "Arc", to: { x: 90, y: 50, z: 10 }, center: { x: 60, y: 50 }, clockwise: false, feed: 500 }
      ])
    ])
    expect(validate(program, machine)).toEqual([])
    // The same arc with a larger radius pokes out at X = 130 even though its endpoints are inside.
    const wide = makeProgram("p", [
      tp([
        { _tag: "Rapid", to: { x: 90, y: 50, z: 10 } },
        { _tag: "Arc", to: { x: 90, y: 50, z: 10 }, center: { x: 50, y: 50 }, clockwise: false, feed: 500 }
      ])
    ])
    expect(validate(wide, machine)).toEqual([])
    const out = makeProgram("p", [
      tp([
        { _tag: "Rapid", to: { x: 80, y: 50, z: 10 } },
        { _tag: "Arc", to: { x: 80, y: 50, z: 10 }, center: { x: 50, y: 50 }, clockwise: false, feed: 500 },
        { _tag: "Rapid", to: { x: 120, y: 50, z: 10 } }
      ])
    ])
    expect(validate(out, machine).some((i) => i._tag === "TravelLimit")).toBe(true)
  })
})

describe("Program schema", () => {
  test("round-trips through encode/decode", async () => {
    const program = makeProgram("p", [
      tp([
        { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
        { _tag: "Comment", text: "hello" },
        { _tag: "Dwell", seconds: 1 }
      ])
    ])
    const encoded = await Effect.runPromise(encodeProgram(program))
    const decoded = await Effect.runPromise(decodeProgram(encoded))
    expect(decoded).toEqual(program)
  })

  test("rejects a non-positive feed", async () => {
    const result = await Effect.runPromise(
      Effect.exit(
        decodeProgram({
          name: "p",
          units: "mm",
          workOffset: "G54",
          toolpaths: [
            {
              id: "t",
              name: "t",
              toolId: "1",
              spindleRpm: 1000,
              coolant: "off",
              moves: [{ _tag: "Linear", to: { x: 0, y: 0, z: 0 }, feed: 0 }]
            }
          ]
        })
      )
    )
    expect(result._tag).toBe("Failure")
  })
})
