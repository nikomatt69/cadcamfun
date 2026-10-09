import { describe, expect, test } from "bun:test"
import { gearDimensions, gearOutline, MIN_GEAR_TEETH } from "./gear.ts"
import { signedArea } from "./shapes.ts"

const radii = (ring: ReadonlyArray<{ x: number; y: number }>) => ring.map((p) => Math.hypot(p.x, p.y))

describe("spur gear outline", () => {
  const spec = { moduleValue: 2, teeth: 20, pressureAngle: 20 }

  test("dimensions follow the standard: pitch m z / 2, tip + m, root - 1.25 m, base rp cos(alpha)", () => {
    const d = gearDimensions(spec)
    expect(d.pitchRadius).toBeCloseTo(20, 9)
    expect(d.tipRadius).toBeCloseTo(22, 9)
    expect(d.rootRadius).toBeCloseTo(17.5, 9)
    expect(d.baseRadius).toBeCloseTo(20 * Math.cos(Math.PI / 9), 9)
  })

  test("the outline is a counter-clockwise ring that reaches the tip and the root circles and nothing beyond", () => {
    const ring = gearOutline(spec)
    expect(signedArea(ring)).toBeGreaterThan(0)
    const r = radii(ring)
    expect(Math.max(...r)).toBeCloseTo(22, 6)
    expect(Math.min(...r)).toBeCloseTo(17.5, 6)
  })

  test("it has 20 identical teeth: rotating by one pitch gives the same ring", () => {
    const ring = gearOutline(spec)
    const per = ring.length / 20
    expect(Number.isInteger(per)).toBe(true)
    const a = (2 * Math.PI) / 20
    for (let k = 0; k < per; k++) {
      const p = ring[k]!, q = ring[k + per]!
      expect(q.x).toBeCloseTo(p.x * Math.cos(a) - p.y * Math.sin(a), 9)
      expect(q.y).toBeCloseTo(p.x * Math.sin(a) + p.y * Math.cos(a), 9)
    }
  })

  test("the tooth is half a pitch wide on the pitch circle, and its area sits between the root and tip discs", () => {
    const ring = gearOutline(spec, 24)
    const area = signedArea(ring)
    expect(area).toBeGreaterThan(Math.PI * 17.5 * 17.5)
    expect(area).toBeLessThan(Math.PI * 22 * 22)
    // Thickness on the pitch circle: the chord of the tooth at r = 20 is close to half the circular pitch (pi m / 2).
    const near = ring.filter((p) => Math.abs(Math.hypot(p.x, p.y) - 20) < 0.25 && p.y > -4 && p.y < 4 && p.x > 0)
    expect(near.length).toBeGreaterThan(1)
    const ys = near.map((p) => p.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo((Math.PI * 2) / 2, 0)
  })

  test("a pinion with few teeth pulls the tip in instead of making needles, and bad specs are refused", () => {
    const pinion = gearOutline({ moduleValue: 2, teeth: MIN_GEAR_TEETH, pressureAngle: 25 })
    expect(Math.max(...radii(pinion))).toBeLessThanOrEqual(gearDimensions({ moduleValue: 2, teeth: MIN_GEAR_TEETH, pressureAngle: 25 }).tipRadius + 1e-9)
    expect(() => gearOutline({ moduleValue: 2, teeth: 4 })).toThrow()
    expect(() => gearOutline({ moduleValue: 0, teeth: 20 })).toThrow()
    expect(() => gearOutline({ moduleValue: 2, teeth: 20, pressureAngle: 60 })).toThrow()
  })
})
