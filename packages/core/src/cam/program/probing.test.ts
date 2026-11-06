import { describe, expect, test } from "bun:test"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings } from "../probing/device.ts"
import { planProbeCycle } from "../probing/cycles.ts"
import { compileActions } from "../probing/actions.ts"
import { runProbeMoves } from "../probing/simulate.ts"
import { boxWorld } from "../probing/world.ts"
import type { ProbeContext } from "../probing/types.ts"
import { kernelProbe, planProbe, runProbeSteps, type ProbeOperation, type ProbeSettings, type ProbeWorld } from "./probing.ts"

const settings: ProbeSettings = { stylusDiameter: 6, feed: 100, search: 8, workOffset: "G54", safeZ: 50 }
const r = 3

/** A block x 10..60, y 5..45 with its top at z = 0.37. */
const block: ProbeWorld = {
  touch: (p, axis, d, rad) => {
    const [x0, x1, y0, y1, top] = [10, 60, 5, 45, 0.37]
    if (axis === "Z") return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p.z + d <= top ? top : undefined
    if (p.z - rad >= top) return undefined
    if (axis === "X") {
      if (p.y < y0 || p.y > y1) return undefined
      if (d > 0 && p.x <= x0 - rad && p.x + d >= x0 - rad) return x0 - rad
      if (d < 0 && p.x >= x1 + rad && p.x + d <= x1 + rad) return x1 + rad
      return undefined
    }
    if (p.x < x0 || p.x > x1) return undefined
    if (d > 0 && p.y <= y0 - rad && p.y + d >= y0 - rad) return y0 - rad
    if (d < 0 && p.y >= y1 + rad && p.y + d <= y1 + rad) return y1 + rad
    return undefined
  }
}

/** A circle of radius `R` at (cx, cy): a bore (ball inside) or a boss (ball outside). */
const circle = (cx: number, cy: number, R: number, bore: boolean): ProbeWorld => ({
  touch: (p, axis, d, rad) => {
    if (axis === "Z") return undefined
    const eff = bore ? R - rad : R + rad
    const [a, c, other, oc] = axis === "X" ? [p.x, cx, p.y, cy] : [p.y, cy, p.x, cx]
    const h = eff * eff - (other - oc) ** 2
    if (h < 0) return undefined
    const hit = c + (d > 0 === bore ? 1 : -1) * Math.sqrt(h)
    const reached = d > 0 ? a <= hit && a + d >= hit : a >= hit && a + d <= hit
    return reached ? hit : undefined
  }
})

describe("probing plans against a modelled part", () => {
  test("a Z surface sets the zero on the real top", () => {
    const plan = planProbe({ cycle: "z-surface", at: { x: 30, y: 20 }, expectedZ: 0 }, settings)
    const out = runProbeSteps(plan.steps, block, settings)
    expect(out.missed).toBeUndefined()
    expect(out.offset.Z).toBeCloseTo(0.37, 9)
  })
  test("an edge adds the stylus radius back", () => {
    const plan = planProbe({ cycle: "edge", axis: "X", direction: 1, at: { x: 0, y: 20 }, depth: 5, expectedEdge: 10, zero: 0 }, settings)
    const out = runProbeSteps(plan.steps, block, settings)
    expect(out.offset.X).toBeCloseTo(10, 9)
    // the other side: the +X wall at 60 approached from +X
    const far = runProbeSteps(planProbe({ cycle: "edge", axis: "X", direction: -1, at: { x: 70, y: 20 }, depth: 5, expectedEdge: 60, zero: 50 }, settings).steps, block, settings)
    expect(far.offset.X).toBeCloseTo(10, 9)
  })
  test("a corner gives both coordinates", () => {
    const plan = planProbe({ cycle: "corner", corner: { x: 10, y: 5 }, sx: 1, sy: 1, depth: 5 }, settings)
    const out = runProbeSteps(plan.steps, block, settings)
    expect(out.offset.X).toBeCloseTo(10, 9)
    expect(out.offset.Y).toBeCloseTo(5, 9)
  })
  test("a bore: centre error and diameter, the stylus radius cancels in the centre", () => {
    const plan = planProbe({ cycle: "bore", centre: { x: 30, y: 20 }, diameter: 12, depth: 4 }, settings)
    const out = runProbeSteps(plan.steps, circle(30.3, 20.2, 6.02, true), settings)
    expect(out.missed).toBeUndefined()
    expect(out.offset.X).toBeCloseTo(0.3, 6)
    expect(out.offset.Y).toBeCloseTo(0.2, 6)
    expect(out.sizes[0]!.value).toBeCloseTo(12.04, 6)
  })
  test("a boss from outside", () => {
    const plan = planProbe({ cycle: "boss", centre: { x: 30, y: 20 }, diameter: 20, depth: 4, top: 0 }, settings)
    const out = runProbeSteps(plan.steps, circle(29.8, 20.1, 10.05, false), settings)
    expect(out.missed).toBeUndefined()
    expect(out.offset.X).toBeCloseTo(-0.2, 6)
    expect(out.offset.Y).toBeCloseTo(0.1, 6)
    expect(out.sizes[0]!.value).toBeCloseTo(20.1, 6)
  })
  test("a missed touch is reported with its step, never a made-up offset", () => {
    const plan = planProbe({ cycle: "z-surface", at: { x: 200, y: 20 }, expectedZ: 0 }, settings)
    const out = runProbeSteps(plan.steps, block, settings)
    expect(out.missed?.axis).toBe("Z")
    expect(out.offset.Z).toBeUndefined()
  })
  test("a stylus that does not fit the bore, and bad settings, are refused", () => {
    expect(() => planProbe({ cycle: "bore", centre: { x: 0, y: 0 }, diameter: 6.5, depth: 3 }, settings)).toThrow(/does not fit/)
    expect(() => planProbe({ cycle: "z-surface", at: { x: 0, y: 0 }, expectedZ: 0 }, { ...settings, feed: 0 })).toThrow(/feed/)
  })
})

/** The block of `block` as the kernel's world: the legacy operation through the real cycle, action and executor. */
describe("a legacy operation in the kernel", () => {
  const device = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: settings.stylusDiameter })
  const ctx: ProbeContext = { probe: device, safeZ: settings.safeZ, clearance: 3, search: settings.search, prefix: "p" }
  const world = boxWorld({ x: 10, y: 5, z: -20 }, { x: 60, y: 45, z: 0.37 })
  const offsetOf = (op: ProbeOperation) => {
    const { cycle, actions } = kernelProbe(op, settings)
    const routine = planProbeCycle(cycle, ctx)
    if ("refused" in routine) throw new Error(routine.refused)
    const out = runProbeMoves(compileActions(routine, actions, ctx), world, { offsets: { entries: {} }, active: { kind: "g5x", code: "G54" }, probe: device, start: { x: 0, y: 0, z: settings.safeZ } }, { results: routine.results, units: routine.units })
    expect(out.alarms).toEqual([])
    return out.offsets["G54"] ?? { x: 0, y: 0, z: 0 }
  }
  // The zero lands where the neutral steps put it: these are the same figures `runProbeSteps` finds on the same block.
  test("a surface, an edge and a corner set the zero the steps set", () => {
    const z: ProbeOperation = { cycle: "z-surface", at: { x: 30, y: 25 }, expectedZ: 0 }
    expect(offsetOf(z).z).toBeCloseTo(runProbeSteps(planProbe(z, settings).steps, block, settings).offset.Z!, 6)
    const edge: ProbeOperation = { cycle: "edge", axis: "X", direction: 1, at: { x: 0, y: 25 }, depth: 4, expectedEdge: 10 }
    expect(offsetOf(edge).x).toBeCloseTo(runProbeSteps(planProbe(edge, settings).steps, block, settings).offset.X!, 6)
    const corner: ProbeOperation = { cycle: "corner", corner: { x: 10, y: 5 }, sx: 1, sy: 1, depth: 4 }
    const steps = runProbeSteps(planProbe(corner, settings).steps, block, settings).offset
    expect(offsetOf(corner).x).toBeCloseTo(steps.X!, 6)
    expect(offsetOf(corner).y).toBeCloseTo(steps.Y!, 6)
  })
  test("`zero` is what the surface reads afterwards, and the action says so", () => {
    expect(offsetOf({ cycle: "z-surface", at: { x: 30, y: 25 }, expectedZ: 0, zero: 0.37 }).z).toBeCloseTo(0, 6)
    expect(offsetOf({ cycle: "z-surface", at: { x: 30, y: 25 }, expectedZ: 0.37 }).z).toBeCloseTo(0.37, 6)
  })
})
