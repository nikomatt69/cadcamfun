import { describe, expect, test } from "bun:test"
import { brep } from "@cadcamfun/core"
import { betweenRows, bodyOf, entityRows, nextTargets, rowsText, runMeasure, type MeasureFormat, type MeasureTarget } from "./measure.ts"

const fmt: MeasureFormat = {
  length: (mm) => `${mm.toFixed(3)} mm`,
  area: (a) => `${a.toFixed(3)} mm²`,
  volume: (v) => `${v.toFixed(3)} mm³`,
  angle: (d) => `${d.toFixed(2)}°`,
  point: (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`
}

/** A 10 x 20 x 30 exact box drawn at (x, 0, 0), and a primitive cube the kernel builds exactly too. */
const box = (id: string, x: number) => ({ id, type: "brep", x, y: 0, z: 0, brep: brep.makeBox(10, 20, 30) })
const faceWithNormal = (b: brep.Brep, n: [number, number, number]) => b.faces.findIndex((f) => f.surface.kind === "plane" && Math.abs(
  (f.reversed ? -1 : 1) * f.surface.frame.z.x - n[0]) + Math.abs((f.reversed ? -1 : 1) * f.surface.frame.z.y - n[1]) + Math.abs((f.reversed ? -1 : 1) * f.surface.frame.z.z - n[2]) < 1e-9)

describe("what the picks measure", () => {
  test("one face of an exact part: its area and outward normal, in model coordinates", () => {
    const a = box("a", 0)
    const top = faceWithNormal(a.brep, [0, 0, 1])
    const outcome = runMeasure([{ elementId: "a", kind: "face", index: top }], [a])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok || outcome.single?.kind !== "face") throw new Error("face")
    expect(outcome.single.area).toBeCloseTo(200, 9)
    const rows = entityRows(outcome.single, fmt)
    expect(rows[0]).toEqual({ label: "cad.measure.area", value: "200.000 mm²", emphasis: true })
    expect(rows.find((row) => row.label === "cad.measure.normal")?.value).toBe("0.00,0.00,1.00")
  })

  test("faces of two parts placed apart: the gap comes from each element's placement, with the angle and parallel gap", () => {
    const a = box("a", 0), b = box("b", 25)
    const outcome = runMeasure([
      { elementId: "a", kind: "face", index: faceWithNormal(a.brep, [1, 0, 0]) },
      { elementId: "b", kind: "face", index: faceWithNormal(b.brep, [-1, 0, 0]) }
    ], [a, b])
    if (!outcome.ok || outcome.between === undefined) throw new Error(outcome.ok ? "no pair" : outcome.reason)
    expect(outcome.between.distance).toBeCloseTo(15, 9)
    expect(outcome.between.perpendicularGap).toBeCloseTo(15, 9)
    const rows = betweenRows(outcome.between, fmt)
    expect(rows[0]).toEqual({ label: "cad.measure.distance", value: "15.000 mm", emphasis: true })
    expect(rows.find((row) => row.label === "cad.measure.angle")?.value).toBe("180.00°")
    expect(rows.find((row) => row.label === "cad.measure.dx")?.value).toBe("15.000 mm")
    expect(outcome.first?.kind).toBe("face")
    expect(outcome.second?.kind).toBe("face")
  })

  test("a whole primitive part: the kernel's exact solid gives volume and size", () => {
    const cube = { id: "c", type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }
    const outcome = runMeasure([{ elementId: "c", kind: "body", index: 0 }], [cube])
    if (!outcome.ok || outcome.single?.kind !== "body") throw new Error(outcome.ok ? "body" : outcome.reason)
    expect(outcome.single.volume).toBeCloseTo(1000, 3)
    expect(entityRows(outcome.single, fmt).find((row) => row.label === "cad.measure.size")?.value).toBe("10.000 mm × 10.000 mm × 10.000 mm")
  })

  test("a part with no exact solid, a missing part and a stale index are refused with a reason", () => {
    const sketch = { id: "s", type: "line", x1: 0, y1: 0, x2: 5, y2: 0 }
    const refused = runMeasure([{ elementId: "s", kind: "body", index: 0 }], [sketch])
    expect(refused.ok).toBe(false)
    expect(runMeasure([{ elementId: "nope", kind: "body", index: 0 }], [])).toMatchObject({ ok: false, reason: "part 'nope' is not in the drawing" })
    const stale = runMeasure([{ elementId: "a", kind: "face", index: 99 }], [box("a", 0)])
    expect(stale).toMatchObject({ ok: false })
    expect(runMeasure([], [])).toMatchObject({ ok: false, reason: "nothing picked" })
  })

  test("the exact body is computed once per element object", () => {
    const a = box("a", 0)
    expect(bodyOf(a, [a])).toBe(bodyOf(a, [a]))
    const moved = { ...a, x: 5 }
    expect(bodyOf(moved, [moved])).not.toBe(bodyOf(a, [a]))
  })
})

describe("the pick list", () => {
  const face = (index: number): MeasureTarget => ({ elementId: "a", kind: "face", index })
  test("adds up to two, toggles a repeated pick off, and restarts the pair on a third", () => {
    expect(nextTargets([], face(1))).toEqual([face(1)])
    expect(nextTargets([face(1)], face(2))).toEqual([face(1), face(2)])
    expect(nextTargets([face(1), face(2)], face(2))).toEqual([face(1)])
    expect(nextTargets([face(1), face(2)], face(3))).toEqual([face(3)])
    const body: MeasureTarget = { elementId: "a", kind: "body", index: 7 }
    expect(nextTargets([body], { elementId: "a", kind: "body", index: 0 })).toEqual([])
  })
  test("rows as clipboard text", () => {
    expect(rowsText([{ label: "cad.measure.length", value: "5 mm" }], (key) => key.toUpperCase())).toBe("CAD.MEASURE.LENGTH: 5 mm")
  })
})
