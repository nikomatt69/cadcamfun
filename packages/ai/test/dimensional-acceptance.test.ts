import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { History } from "@cadcamfun/core"
import { acceptPart, type AcceptanceCheck } from "../src/acceptance.ts"
import { parseHistory } from "../src/parametric.ts"

setDefaultTimeout(60_000)

/** A 40 x 25 x 6 plate with one through hole of diameter `d` at (cx, 12.5). */
const plate = (d: number | string, cx = 20, parameters: Record<string, number> = {}): History => parseHistory({
  parameters: { width: 40, height: 25, thick: 6, ...parameters },
  features: [
    { id: "s1", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "width", height: "height" }] } },
    { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" },
    { id: "h1", type: "hole", plane: "XY", offset: "thick", at: [cx, 12.5], diameter: d, depth: "thick" }
  ]
})

const asked: ReadonlyArray<AcceptanceCheck> = [
  { kind: "extent", name: "length", axis: "x", nominal: 40, tolerance: { plus: 0.05, minus: 0.05 } },
  { kind: "extent", name: "thickness", axis: "z", nominal: 6, tolerance: { plus: 0.02, minus: 0.02 } },
  { kind: "hole", name: "bore", feature: "h1", diameter: { nominal: 8, tolerance: { plus: 0.015, minus: 0 } }, through: true },
  { kind: "hole_count", name: "holes", nominal: 1 }
]

describe("dimensional acceptance (AI-11 Step 10)", () => {
  test("the part that was asked for is accepted, with every measure at full precision", () => {
    const report = acceptPart(plate(8.0075), asked)
    expect(report.rebuilt).toBe(true)
    expect(report.accepted).toBe(true)
    const bore = report.checks.find((check) => check.name === "bore")!
    expect(bore).toMatchObject({ status: "pass", method: "recognition", frame: "plane XY", limits: { min: 8, max: 8.015 } })
    // Full value, not a rounded display figure.
    expect(Math.abs(bore.measured! - 8.0075)).toBeLessThan(1e-9)
    expect(Math.abs(bore.measuredDepth! - 6)).toBeLessThan(1e-9)
    expect(report.holes).toEqual({ requested: 1, recognised: 1, genus: [1] })
  })

  test("a part with the right volume but a wrong measure is rejected", () => {
    // Same plate, but the hole is 8.4 mm and the plate a little shorter: the volume matches the asked part within 0.5%.
    const right = acceptPart(plate(8), [{ kind: "volume", name: "volume", nominal: 0, tolerance: { plus: 1e9, minus: 0 } }])
    const target = right.checks[0]!.measured!
    const wrong = plate(8.4, 20, { width: 40.2 })
    const report = acceptPart(wrong, [{ kind: "volume", name: "volume", nominal: target, tolerance: { plus: target * 0.005, minus: target * 0.005 } }, ...asked])
    expect(report.rebuilt).toBe(true)
    expect(report.checks.find((check) => check.name === "volume")!.status).toBe("pass")
    expect(report.accepted).toBe(false)
    expect(report.checks.filter((check) => check.status === "fail").map((check) => check.name).sort()).toEqual(["bore", "length"])
  })

  test("a hole is found only on its feature's axis, and a later move makes that reference unmeasurable", () => {
    // The axis is where the feature put it: a hole elsewhere (another feature's) is not this one.
    const elsewhere = acceptPart(plate(8, 12), [{ kind: "hole", name: "bore", feature: "h1", diameter: { nominal: 8, tolerance: { plus: 0.1, minus: 0.1 } } }])
    expect(elsewhere.checks[0]).toMatchObject({ status: "pass" })
    const moved = parseHistory({ ...plate(8), features: [...plate(8).features, { id: "m", type: "move", translate: [5, 0, 0] }] })
    const report = acceptPart(moved, [{ kind: "hole", name: "bore", feature: "h1", diameter: { nominal: 8, tolerance: { plus: 0.1, minus: 0.1 } } }])
    expect(report.rebuilt).toBe(true)
    expect(report.checks[0]).toMatchObject({ status: "unmeasured", reason: expect.stringContaining("move") })
    expect(report.accepted).toBe(false)
  })

  test("genus is not the hole count: a slot is a through opening but not a hole", () => {
    const slotted = parseHistory({
      parameters: { width: 40, height: 25, thick: 6 },
      features: [
        { id: "s1", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "width", height: "height" }] } },
        { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" },
        { id: "s2", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "slot", kind: "slot", at: [20, 12.5], length: 20, width: 6 }] } },
        { id: "cut", type: "extrude", sketch: "s2", depth: "thick * 3", direction: "symmetric", operation: "subtract" }
      ]
    })
    const report = acceptPart(slotted, [{ kind: "hole_count", name: "holes", nominal: 1 }])
    expect(report.holes.requested).toBe(0)
    expect(report.holes.genus).toEqual([1])
    expect(report.checks[0]).toMatchObject({ status: "fail", measured: 0 })
  })

  test("what cannot be measured is never accepted", () => {
    const report = acceptPart(plate(8), [{ kind: "hole", name: "bore", feature: "nope", diameter: { nominal: 8, tolerance: { plus: 0.1, minus: 0.1 } } }])
    expect(report.checks[0]!.status).toBe("unmeasured")
    expect(report.accepted).toBe(false)
    expect(acceptPart(plate(8), []).accepted).toBe(false)
  })
})
