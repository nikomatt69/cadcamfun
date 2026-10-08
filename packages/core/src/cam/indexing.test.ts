import { describe, expect, test } from "bun:test"
import { genericPost } from "./post/generic.ts"
import { anglesFor, frameFromNormal, indexToolpath, partToMachine, tableRotation, type RotaryLayout } from "./indexing.ts"
import { makeProgram, type ArcMove, type Toolpath } from "./ir.ts"
import { workToWorld } from "./setup.ts"

const dir = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l } }
const apply = (m: ReturnType<typeof tableRotation>, v: { x: number; y: number; z: number }) => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z, y: m[3] * v.x + m[4] * v.y + m[5] * v.z, z: m[6] * v.x + m[7] * v.y + m[8] * v.z
})

describe("rotary angles for a work plane", () => {
  const layouts: RotaryLayout[] = ["table-AC", "table-BC"]
  // A spread of directions, including the poles and axes.
  const normals = [
    dir(0, 0, 1), dir(0, 0, -1), dir(1, 0, 0), dir(-1, 0, 0), dir(0, 1, 0), dir(0, -1, 0), dir(1, 1, 1), dir(-2, 3, 5), dir(0.3, -0.8, -0.2),
    ...Array.from({ length: 40 }, (_, i) => dir(Math.sin(i * 1.7) + 0.1, Math.cos(i * 2.3) - 0.2, Math.sin(i * 0.9) * 2))
  ]

  test("every solution turns the part direction onto machine +Z, for both layouts and both solutions", () => {
    for (const layout of layouts) {
      for (const n of normals) {
        const solutions = anglesFor(n, layout, { tiltMin: -180, tiltMax: 180 })
        expect(solutions.length).toBe(2)
        for (const s of solutions) {
          const z = apply(tableRotation(s, layout), n)
          expect(z.x).toBeCloseTo(0, 9)
          expect(z.y).toBeCloseTo(0, 9)
          expect(z.z).toBeCloseTo(1, 9)
        }
      }
    }
  })

  test("known cases: +Z needs no tilt; +X needs a quarter-turn tilt", () => {
    expect(anglesFor(dir(0, 0, 1), "table-AC")[0]).toMatchObject({ a: expect.closeTo(0, 9), c: 0 })
    const ac = anglesFor(dir(1, 0, 0), "table-AC")[0]!
    expect(ac.a).toBeCloseTo(90, 9)
    expect(ac.c).toBeCloseTo(90, 9)
    const bc = anglesFor(dir(1, 0, 0), "table-BC")[0]!
    expect(bc.b).toBeCloseTo(-90, 9)
    expect(anglesFor(dir(0, 0, -1), "table-AC", { tiltMin: -180, tiltMax: 180 })[0]!.a).toBeCloseTo(180, 9)
  })

  test("the smaller tilt comes first, and the limits drop a solution or all of them", () => {
    const n = dir(0.5, 0.2, -0.4)
    const both = anglesFor(n, "table-AC", { tiltMin: -180, tiltMax: 180 })
    expect(Math.abs(both[0]!.a!)).toBeLessThanOrEqual(Math.abs(both[1]!.a!))
    const positiveOnly = anglesFor(n, "table-AC", { tiltMin: 0, tiltMax: 180 })
    expect(positiveOnly).toHaveLength(1)
    expect(positiveOnly[0]!.a!).toBeGreaterThanOrEqual(0)
    expect(anglesFor(dir(1, 0, 0), "table-AC", { tiltMin: -45, tiltMax: 45 })).toHaveLength(0)
    expect(() => anglesFor({ x: 0, y: 0, z: 0 }, "table-AC")).toThrow(RangeError)
  })
})

describe("an indexed toolpath", () => {
  const pivot = { x: 100, y: 50, z: -20 }
  const frame = frameFromNormal({ x: 10, y: 5, z: 3 }, dir(1, 1, 1.5))
  /** A square pocket outline at work Z = -2 with an arc and a hole cycle, in the tilted frame. */
  const toolpath: Toolpath = {
    id: "t", name: "tilted", toolId: "1", spindleRpm: 8000, coolant: "off",
    moves: [
      { _tag: "Rapid", to: { x: 0, y: 0, z: 10 } },
      { _tag: "Rapid", to: { x: 5, y: 5, z: 2 } },
      { _tag: "Linear", to: { x: 5, y: 5, z: -2 }, feed: 100 },
      { _tag: "Linear", to: { x: 15, y: 5, z: -2 }, feed: 300 },
      { _tag: "Arc", to: { x: 20, y: 10, z: -2 }, center: { x: 15, y: 10 }, clockwise: false, feed: 300 },
      { _tag: "Linear", to: { x: 20, y: 20, z: -2 }, feed: 300 },
      { _tag: "Cycle", cycle: "drill", to: { x: 8, y: 8, z: -12 }, feed: 80, peckDepth: 0, dwellSeconds: 0, retractHeight: 2 }
    ]
  }

  test("an Orient move comes first, and every carried point is the table rotation of the part point", () => {
    const { toolpath: out, angles } = indexToolpath(toolpath, { frame, layout: "table-AC", pivot })
    expect(out.moves[1]).toMatchObject({ _tag: "Orient", a: angles.a, c: angles.c })
    const second = out.moves[3]! // the rapid to (5, 5, 2)
    const expected = partToMachine(workToWorld(frame, { x: 5, y: 5, z: 2 }), angles, "table-AC", pivot)
    expect(second).toMatchObject({ _tag: "Rapid", to: { x: expect.closeTo(expected.x, 9), y: expect.closeTo(expected.y, 9), z: expect.closeTo(expected.z, 9) } })
  })

  test("the work plane lies horizontal in the machine: constant work Z stays constant machine Z, and lengths are kept", () => {
    const { toolpath: out } = indexToolpath(toolpath, { frame, layout: "table-AC", pivot })
    const cuts = out.moves.filter((m) => m._tag === "Linear" || m._tag === "Arc") as Array<{ _tag: string; to: { x: number; y: number; z: number } }>
    const atDepth = cuts.slice(1) // after the plunge, all at work z = -2
    for (const m of atDepth) expect(m.to.z).toBeCloseTo(atDepth[0]!.to.z, 9)
    const linear = out.moves.filter((m) => m._tag === "Linear") as Array<{ to: { x: number; y: number; z: number } }>
    // (5,5,-2) -> (15,5,-2) is 10 mm in the work frame and stays 10 mm.
    expect(Math.hypot(linear[1]!.to.x - linear[0]!.to.x, linear[1]!.to.y - linear[0]!.to.y, linear[1]!.to.z - linear[0]!.to.z)).toBeCloseTo(10, 9)
  })

  test("an arc stays an arc in G17: same radius, the centre carried with it, the same sense", () => {
    const { toolpath: out } = indexToolpath(toolpath, { frame, layout: "table-AC", pivot })
    const arc = out.moves.find((m) => m._tag === "Arc") as ArcMove
    expect(arc.clockwise).toBe(false)
    expect(Math.hypot(arc.to.x - arc.center.x, arc.to.y - arc.center.y)).toBeCloseTo(Math.hypot(20 - 15, 10 - 10), 9)
    const from = out.moves[out.moves.indexOf(arc) - 1] as { to: { x: number; y: number } }
    expect(Math.hypot(from.to.x - arc.center.x, from.to.y - arc.center.y)).toBeCloseTo(5, 9)
  })

  test("a drilling cycle still runs straight down machine Z, to the same depth below its retract plane", () => {
    const { toolpath: out } = indexToolpath(toolpath, { frame, layout: "table-AC", pivot })
    const cycle = out.moves.find((m) => m._tag === "Cycle") as { to: { x: number; y: number; z: number }; retractHeight: number }
    expect(cycle.retractHeight - cycle.to.z).toBeCloseTo(14, 9)
  })

  test("it reaches the emitter as rotary words, and the second table solution is used when only it is within the limits", () => {
    const { toolpath: out, angles } = indexToolpath(toolpath, { frame, layout: "table-AC", pivot })
    const text = genericPost.emit(makeProgram("indexed", [out]))
    expect(text).toMatch(new RegExp(`G0 A${angles.a!.toFixed(3)} C${angles.c.toFixed(3)}`))
    const both = anglesFor(frame.zAxis, "table-AC", { tiltMin: -180, tiltMax: 180 })
    const negativeOnly = indexToolpath(toolpath, { frame, layout: "table-AC", pivot, limits: { tiltMin: -180, tiltMax: Math.min(0, both[0]!.a! - 1e-6) } })
    expect(negativeOnly.angles.a!).toBeLessThan(0)
    expect(() => indexToolpath(toolpath, { frame, layout: "table-AC", pivot, limits: { tiltMin: -1, tiltMax: 1 } })).toThrow("cannot reach")
  })

  test("a work plane with no tilt is a turn about Z only, and is carried as a rigid motion", () => {
    const flat = frameFromNormal({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
    const { toolpath: out, angles } = indexToolpath(toolpath, { frame: flat, layout: "table-AC", pivot: { x: 0, y: 0, z: 0 } })
    expect(angles.a).toBeCloseTo(0, 9)
    const cut = out.moves.filter((m) => m._tag === "Linear") as Array<{ to: { x: number; y: number; z: number } }>
    expect(cut[1]!.to).toMatchObject({ x: expect.closeTo(15, 9), y: expect.closeTo(5, 9), z: expect.closeTo(-2, 9) })
  })
})
