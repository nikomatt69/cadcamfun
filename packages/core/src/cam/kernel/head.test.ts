import { describe, expect, test } from "bun:test"
import { headABFor, headAxis, headFor, headTip, type HeadKinematic } from "./head.ts"

const head = (over: Partial<HeadKinematic> = {}): HeadKinematic => ({ pivot: { x: 0, y: 0, z: 200 }, gauge: 120, tilt: [-90, 90], ...over })
const unit = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l } }

describe("tilting head", () => {
  test("at zero tilt the tool points down and its tip is the gauge below the pivot", () => {
    expect(headAxis(0)).toEqual({ x: -0, y: 0, z: -1 })
    expect(headTip(0, head())).toEqual({ x: 0, y: 0, z: 80 })
  })

  test("the tip moves with the tilt: it stays one gauge length from the pivot at every angle", () => {
    const k = head()
    for (const b of [-60, -20, 0, 15, 45, 80]) {
      const t = headTip(b, k)
      expect(Math.hypot(t.x - k.pivot.x, t.y - k.pivot.y, t.z - k.pivot.z)).toBeCloseTo(k.gauge, 9)
    }
    expect(headTip(45, k).x).not.toBeCloseTo(0, 3)
  })

  test("a direction in the XZ plane is reached exactly: the tool axis equals it", () => {
    for (const d of [unit(0.5, 0, -1), unit(-0.3, 0, -1), unit(0.9, 0, -0.2)]) {
      const s = headFor(d, head())
      expect(s).toBeDefined()
      expect(s!.residual).toBeLessThan(1e-12)
      expect(Math.hypot(s!.axis.x - d.x, s!.axis.y - d.y, s!.axis.z - d.z)).toBeLessThan(1e-9)
    }
  })

  test("a direction with a Y component is not reachable by the B tilt alone: the residual is that component", () => {
    const d = unit(0.4, 0.6, -0.7)
    const s = headFor(d, head())!
    expect(s.residual).toBeCloseTo(Math.abs(d.y), 9)
    expect(s.axis.y).toBeCloseTo(0, 12)
  })

  test("a tilt outside the head's range is refused", () => {
    expect(headFor(unit(1, 0, -0.05), head({ tilt: [-30, 30] }))).toBeUndefined()
    expect(headFor(unit(0.3, 0, -1), head({ tilt: [-30, 30] }))).toBeDefined()
  })
})

describe("tilting head with two tilts (AB)", () => {
  const ab = { pivot: { x: 0, y: 0, z: 200 }, gauge: 120, tiltA: [-110, 110] as const, tiltB: [-180, 180] as const }
  const sphere = (n: number) => Array.from({ length: n }, (_, k) => {
    const z = 1 - 2 * ((k + 0.5) / n)
    const r = Math.sqrt(1 - z * z), phi = k * 2.399963
    return { x: r * Math.cos(phi), y: r * Math.sin(phi), z }
  })
  test("every reachable direction is reached by the (A, B) solutions: the tool axis equals it", () => {
    for (const d of sphere(300)) {
      const sols = headABFor(d, ab)
      if (sols.length === 0) continue
      for (const s of sols) {
        expect(s.residual).toBeLessThan(1e-9)
      }
    }
    // Most directions with dz < 0 (tool into the part) are reachable with these ranges.
    const reachable = sphere(300).filter((d) => headABFor(d, ab).length > 0).length
    expect(reachable).toBeGreaterThan(150)
  })

  test("the second branch reaches the same direction: A to 180 - A, B to B + 180", () => {
    const d = { x: 0.3, y: 0.4, z: -Math.sqrt(1 - 0.25) }
    // A = 156 degrees on the second branch: the range must allow it for both branches to exist.
    const sols = headABFor(d, { ...ab, tiltA: [-180, 180] })
    expect(sols.length).toBe(2)
    expect(sols[0]!.residual).toBeLessThan(1e-9)
    expect(sols[1]!.residual).toBeLessThan(1e-9)
    expect(sols[0]!.branch).toBe(0)
    expect(sols[1]!.branch).toBe(1)
  })

  test("a tool straight along Y is the singular case: A at 90 degrees, B undetermined", () => {
    const s = headABFor({ x: 0, y: 1, z: 0 }, ab)
    expect(s.length).toBeGreaterThan(0)
    expect(s[0]!.singularity).toBe(1)
    expect(s[0]!.residual).toBeLessThan(1e-9)
  })

  test("the A range refuses a direction that needs a larger tilt", () => {
    const d = { x: 0, y: 0.95, z: -Math.sqrt(1 - 0.95 * 0.95) }
    expect(headABFor(d, { ...ab, tiltA: [-30, 30] })).toEqual([])
  })
})
