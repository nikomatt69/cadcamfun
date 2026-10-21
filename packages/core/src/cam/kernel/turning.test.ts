import { describe, expect, test } from "bun:test"
import { planTurning, type TurnPoint } from "./turning.ts"
import { analyseGcode } from "../generator/analysis.ts"

const shaft: TurnPoint[] = [{ diameter: 40, z: 0 }, { diameter: 40, z: -20 }, { diameter: 25, z: -20 }, { diameter: 25, z: -50 }]
const job = { profile: shaft, stock: { diameter: 44, length: 60 }, stepdown: 4, allowance: 0.4 }
const diameterAt = (points: ReadonlyArray<TurnPoint>, z: number): number => {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!
    if (a.z >= z && z >= b.z && a.z !== b.z) return a.diameter + (b.diameter - a.diameter) * (z - a.z) / (b.z - a.z)
  }
  throw new Error(`No profile segment at ${z}`)
}

describe("turning preview on evolving stock", () => {
  test("stepped roughing bounds the cut locally and accounts for the retained tail", () => {
    const plan = planTurning(job)
    expect(plan.issues).toEqual([])
    expect(plan.release).toBe("preview")
    expect(plan.passes.map((p) => p.kind)).toEqual(["face", "rough", "rough", "rough", "rough", "rough", "finish"])
    expect(plan.stockProfiles).toHaveLength(plan.passes.length + 1)
    for (let i = 1; i < plan.stockProfiles.length; i++) {
      for (const z of [-0.5, -19.5, -20.5, -49.5]) {
        const before = diameterAt(plan.stockProfiles[i - 1]!, z), after = diameterAt(plan.stockProfiles[i]!, z)
        expect(after).toBeGreaterThanOrEqual(diameterAt(shaft, z))
        expect(before - after).toBeGreaterThanOrEqual(-1e-9)
        expect(before - after).toBeLessThanOrEqual(4 + 1e-9)
      }
      expect(plan.stockAfter[i]).toBe(Math.max(...plan.stockProfiles[i]!.map((p) => p.diameter)))
    }
    expect(plan.partVolume).toBeCloseTo(Math.PI * (20 ** 2 * 20 + 12.5 ** 2 * 30), 6)
    expect(plan.unmachinedVolume).toBeCloseTo(Math.PI * 22 ** 2 * 10, 6)
    expect(plan.stockVolume).toBeCloseTo(Math.PI * 22 ** 2 * 60, 6)
    expect(plan.partVolume + plan.unmachinedVolume + plan.removedVolume).toBeCloseTo(plan.stockVolume, 6)
    expect(plan.passes.at(-1)!.points).toEqual(shaft)
    expect(plan.passes.every((p) => p.removed >= 0)).toBe(true)
  })

  test("a taper is split at cap crossings instead of overcutting its linear envelope", () => {
    const plan = planTurning({ ...job, profile: [{ diameter: 40, z: 0 }, { diameter: 20, z: -50 }] })
    const first = plan.passes[1]!.points
    expect(first.some((p) => Math.abs(p.z + 1) < 1e-8 && p.diameter === 40)).toBe(true)
    for (let i = 1; i < plan.stockProfiles.length; i++) for (let z = -0.25; z > -50; z -= 0.5) {
      const before = diameterAt(plan.stockProfiles[i - 1]!, z), after = diameterAt(plan.stockProfiles[i]!, z)
      expect(after).toBeGreaterThanOrEqual(40 + 0.4 * z - 1e-9)
      expect(before - after).toBeLessThanOrEqual(4 + 1e-9)
    }
  })

  test("NC declares the feed mode and returns axially only outside the original bar", () => {
    const plan = planTurning(job)
    expect(plan.nc).toContain("G18 G21 G90 G40 G94 G97")
    expect(plan.nc).toContain("M3 S800")
    expect(plan.nc).toContain("G1 X40.000 Z-20.000 F160.000")
    expect(plan.nc).not.toMatch(/\b[BY]-?\d/)
    let x = 0, z = 0
    for (const line of plan.nc.split("\n")) {
      const nx = Number(line.match(/\bX(-?[\d.]+)/)?.[1] ?? x)
      const nz = Number(line.match(/\bZ(-?[\d.]+)/)?.[1] ?? z)
      if (line.startsWith("G0") && nz !== z) expect(Math.min(x, nx)).toBeGreaterThanOrEqual(46)
      x = nx; z = nz
    }
    const parsed = analyseGcode(plan.nc)
    expect(parsed.motion.unsupported).toEqual([])
    expect(parsed.program.toolpaths.some((p) => p.moves.some((m) => m._tag === "Linear"))).toBe(true)
    expect(planTurning(job).nc).toBe(plan.nc)
  })

  test("invalid and unbounded inputs are refused before building passes", () => {
    for (const change of [{ stepdown: Number.MIN_VALUE }, { stepdown: 0.001 }, { rpm: Infinity }, { allowance: NaN }, { feedMmRev: NaN }, { rpm: 0.1 }, { stock: { diameter: Infinity, length: 60 } }, { profile: [{ diameter: 50, z: 0 }, { diameter: 50, z: -10 }] }, { profile: [{ diameter: 30, z: 0 }, { diameter: 30, z: NaN }] }, { profile: [{ diameter: 30, z: 0 }, { diameter: 20, z: 0 }] }, { profile: [{ diameter: 30, z: 0 }, { diameter: 30, z: -10 }, { diameter: 20, z: -5 }] }, { stock: { diameter: 44, length: 30 } }]) {
      const plan = planTurning({ ...job, ...change })
      expect(plan.issues.length).toBeGreaterThan(0)
      expect(plan.nc).toBe("")
      expect(plan.passes).toEqual([])
    }
  })

  test("the turning centre bounds the bar and the spindle: a bar it cannot hold is refused", () => {
    const machine = { id: "mazak-integrex-i200", name: "Mazak INTEGREX i-200 class", maxBarDiameter: 65, maxBarLength: 590, maxRpm: 12000, maxFeed: 40000 }
    const wide = planTurning({ ...job, stock: { diameter: 80, length: 60 }, machine })
    expect(wide.issues.join(" ")).toContain("does not fit the chuck of Mazak INTEGREX i-200 class (max 65 mm)")
    expect(wide.passes).toEqual([])
    const long = planTurning({ ...job, stock: { diameter: 44, length: 900 }, machine })
    expect(long.issues.join(" ")).toContain("longer than Mazak INTEGREX i-200 class takes")
    // The spindle ceiling and the feed ceiling of the machine bound the plan.
    const plan = planTurning({ ...job, rpm: 20000, feedMmRev: 5, machine })
    expect(plan.issues).toEqual([])
    expect(plan.rpm).toBe(12000)
    expect(plan.feed).toBe(40000)
    expect(plan.machine).toEqual({ id: "mazak-integrex-i200", name: "Mazak INTEGREX i-200 class" })
    expect(plan.nc).toContain("M3 S12000")
    expect(plan.nc).toContain("F40000.000")
    // Without the machine the plan keeps the asked-for values.
    const plain = planTurning({ ...job, rpm: 20000, feedMmRev: 5 })
    expect(plain.rpm).toBe(20000)
    expect(plain.feed).toBe(100000)
  })
})
