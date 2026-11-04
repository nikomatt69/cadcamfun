import { describe, expect, test } from "bun:test"
import { emitProbeSteps, planProbe, runProbeSteps, type ProbeAxis, type ProbeSettings, type ProbeWorld } from "./probing.ts"

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

describe("probing emission", () => {
  const plan = planProbe({ cycle: "bore", centre: { x: 30, y: 20 }, diameter: 12, depth: 4 }, settings)
  const axes: ProbeAxis[] = ["X", "Y"]
  test("Fanuc uses G31 and writes the work offset variable", () => {
    const nc = emitProbeSteps(plan.steps, settings, "fanuc")
    expect(nc).toContain("G91 G31 X-")
    // The midpoint is bracketed as a whole: `[a+b]/2 - 30` would be read as a half of the sum less 30 only by luck of precedence.
    expect(nc).toMatch(/#5221 = #5221 \+ \[\[#524\+#525\]\/2\] - 30\.000/)
    expect(nc).not.toMatch(/\[#524 \+ #525\] \/ 2/)
    // A touch that finds nothing is an alarm, and the descent near the part is armed.
    expect(nc).toMatch(/IF \[ABS\[#5061-\[#530\+/)
    expect(nc).toContain("THEN #3000=191 (PROBE MISS)")
    expect(nc).toMatch(/G31 Z-4\.000 F100\nIF \[ABS\[#5063-\[-4\.000\]\] GT 0\.002\] THEN #3000=192/)
    expect(nc).not.toMatch(/\nG0 Z-4\.000/)
    // The size is in a register, not only a comment.
    expect(nc).toMatch(/#540 = ABS\[#525 - #524\] \+ 6\.000 ; bore diameter X/)
    expect(nc).toContain("M5")
    expect(nc).not.toMatch(/\bM3\b/)
    expect(axes.length).toBe(2)
  })
  test("LinuxCNC uses G38.2 and G10 L2; Siemens uses MEAS=1 and the frame", () => {
    expect(emitProbeSteps(plan.steps, settings, "linuxcnc")).toMatch(/G38\.2 X-/)
    expect(emitProbeSteps(plan.steps, settings, "linuxcnc")).toMatch(/G10 L2 P1 X\[#5221 \+/)
    const s = emitProbeSteps(plan.steps, settings, "siemens")
    expect(s).toContain("MEAS=1 G91 G1")
    expect(s).toContain("$P_UIFR[1,X,TR]=$P_UIFR[1,X,TR]+(R14+R15)/2-30.000")
    expect(s).toMatch(/\$P_UIFR\[1,Y,TR\]=[^\n]*\nG54/)
    expect(s).not.toContain("$P_UIFR[1]:X")
    expect(s).toContain("G0 X=(R10+R11)/2")
    expect(s).toContain("PROBEMISS")
  })
})
