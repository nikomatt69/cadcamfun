import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type { Cutter } from "./cutters.ts"
import { applyCalibration, estimateStability, estimateToolMode, minRealReceptance, planToolLife, ProcessCalibrationSchema, receptance, stabilityLobes, taylorFor, toolLifeMinutes, wearFactor, type ProcessCalibration } from "./process.ts"

const mode = { naturalHz: 800, zeta: 0.03, stiffness: 5000 }
const cutter: Cutter = { id: "t", name: "em10", kind: "flat", diameter: 10, flutes: 3, material: "carbide", coating: "altin", fluteLength: 25, shankDiameter: 10, stickout: 45 }

describe("stability lobes (spec 61 Z4)", () => {
  test("the minimum limiting depth is 1 / (2 Ks |Re G|min) and no swept depth is below it", () => {
    const ks = 2000
    const r = stabilityLobes({ mode, ks, flutes: 3, source: "measured", rpmRange: [1, 1e6], lobes: 8 })
    const closed = 1 / (2 * ks * Math.abs(minRealReceptance(mode)))
    expect(r.aLimMin).toBeCloseTo(closed, 12)
    expect(closed).toBeCloseTo((2 * mode.stiffness * mode.zeta * (1 + mode.zeta)) / ks, 12)
    const lowest = Math.min(...r.curve.map((p) => p.aLim))
    expect(lowest).toBeGreaterThanOrEqual(closed * (1 - 1e-9))
    expect(lowest).toBeLessThan(closed * 1.01)
    expect(receptance(mode, Math.sqrt(1 + 2 * mode.zeta)).re).toBeCloseTo(minRealReceptance(mode), 12)
  })
  test("lobe speeds equal 60 f / (N (k + eps / 2pi)) with the phase of the receptance", () => {
    const r = stabilityLobes({ mode, ks: 2000, flutes: 3, source: "measured", rpmRange: [1, 1e6], lobes: 3 })
    const p = r.curve.find((q) => q.lobe === 1)!
    let best = Infinity
    for (let i = 0; i <= 20000; i++) {
      const ratio = 1.0149 + (i / 20000) * 0.4
      const g = receptance(mode, ratio)
      if (g.re >= 0) continue
      const a = -1 / (2 * 2000 * g.re)
      if (Math.abs(a - p.aLim) / p.aLim > 1e-3) continue
      const eps = Math.PI - 2 * Math.atan(g.im / g.re)
      const rpm = (60 * ratio * mode.naturalHz) / (3 * (1 + eps / (2 * Math.PI)))
      best = Math.min(best, Math.abs(rpm - p.rpm) / p.rpm)
    }
    expect(best).toBeLessThan(5e-3)
  })
  test("an estimated transfer function is indicative, never calibrated", () => {
    const r = estimateStability(cutter, 2000)
    expect(r.status).toBe("indicative")
    expect(r.calibrated).toBe(false)
    expect(r.aLimMin).toBeGreaterThan(0)
    const m = estimateToolMode(cutter)
    expect(m.naturalHz).toBeGreaterThan(200)
    expect(m.naturalHz).toBeLessThan(20000)
    expect(stabilityLobes({ mode, ks: 2000, flutes: 3, source: "measured" }).status).toBe("measured")
  })
  test("twice the stiffness allows twice the depth", () => {
    const soft = stabilityLobes({ mode, ks: 2000, flutes: 3, source: "measured" }).aLimMin
    const stiff = stabilityLobes({ mode: { ...mode, stiffness: 10000 }, ks: 2000, flutes: 3, source: "measured" }).aLimMin
    expect(stiff).toBeCloseTo(2 * soft, 9)
  })
})

describe("tool life (spec 61 Z5)", () => {
  test("Taylor identity V1 T1^n = V2 T2^n holds and the constants are labelled uncalibrated", () => {
    const t = taylorFor("carbide", "P")
    expect(t.calibrated).toBe(false)
    const t1 = toolLifeMinutes(t, 200)
    const t2 = toolLifeMinutes(t, 260)
    expect(200 * Math.pow(t1, t.n)).toBeCloseTo(260 * Math.pow(t2, t.n), 9)
    expect(t2).toBeLessThan(t1)
    expect(toolLifeMinutes(t, t.c)).toBeCloseTo(1, 12)
  })
  test("a request override replaces the table; nonsense is refused", () => {
    expect(taylorFor("hss", "P", { n: 0.2, c: 100 }).source).toBe("request")
    expect(() => taylorFor("hss", "P", { n: 1.5, c: 100 })).toThrow()
  })
  test("wear is monotonic in load", () => {
    let prev = -1
    for (const r of [0.1, 0.5, 0.8, 1, 1.4, 2, 5]) {
      const w = wearFactor(r)
      expect(w).toBeGreaterThanOrEqual(prev)
      prev = w
    }
  })
  test("an operation that would pass the life gets a change before it; one that exceeds alone is reported", () => {
    const t = taylorFor("carbide", "P")
    const life = toolLifeMinutes(t, 200)
    const uses = [
      { operation: "a", tool: 1, vc: 200, minutes: life * 0.5 },
      { operation: "b", tool: 1, vc: 200, minutes: life * 0.5 },
      { operation: "c", tool: 2, vc: 200, minutes: life * 2 }
    ]
    const r = planToolLife(uses, () => t)
    expect(r[0]!.status).toBe("change")
    expect(r[0]!.changeBefore).toEqual(["b"])
    expect(r[0]!.lifeUsed).toBeCloseTo(1, 9)
    expect(r[1]!.status).toBe("exceeded")
    expect(planToolLife([{ operation: "a", tool: 1, vc: 200, minutes: life * 0.1 }], () => t)[0]!.status).toBe("ok")
  })
})

describe("calibration record (spec 61 Z6)", () => {
  const record: ProcessCalibration = {
    id: "cal-1", machine: "vf2", tool: "em10", material: "steel-c45", date: "2026-11-01", source: "measured", quantity: "force", predicted: 400, measured: 520, tolerance: 0.1,
    validity: { diameter: [8, 12], ap: [1, 5], rpm: [3000, 9000] }
  }
  const ctx = { machine: "vf2", tool: "em10", material: "steel-c45", quantity: "force" as const, diameter: 10, ap: 3, rpm: 6000 }
  test("the schema decodes the record", () => {
    expect(Schema.decodeUnknownSync(ProcessCalibrationSchema)(record).id).toBe("cal-1")
  })
  test("inside the range the record reproduces its own measurement", () => {
    const v = applyCalibration(400, [record], ctx)
    expect(v.calibrated).toBe(true)
    expect(v.recordId).toBe("cal-1")
    expect(Math.abs(v.value - record.measured) / record.measured).toBeLessThanOrEqual(record.tolerance)
  })
  test("outside the validity range, or for another tool, it stays uncalibrated", () => {
    expect(applyCalibration(400, [record], { ...ctx, rpm: 12000 }).calibrated).toBe(false)
    expect(applyCalibration(400, [record], { ...ctx, ap: undefined }).calibrated).toBe(false)
    expect(applyCalibration(400, [record], { ...ctx, tool: "other" })).toMatchObject({ calibrated: false, value: 400 })
    expect(applyCalibration(400, [], ctx).calibrated).toBe(false)
  })
})
