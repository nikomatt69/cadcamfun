import { describe, expect, test } from "bun:test"
import { planBoring, planTurning, type BoringJob, type TurnPoint } from "./turning.ts"
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

  test("the external NC of the reference fixture is pinned byte for byte", () => {
    // K6 adds internal boring beside the external plan; the external NC must not move a byte.
    expect(planTurning(job).nc).toBe([
      "(TURNING PREVIEW - IDEAL POINT TOOL - X DIAMETER)",
      "G18 G21 G90 G40 G94 G97",
      "M3 S800",
      "(FACE)",
      "G0 X46.000",
      "G0 Z1.000",
      "G0 X46.000",
      "G1 Z0.000 F160.000",
      "G1 X46.000 Z0.000 F160.000",
      "G1 X0.000 Z0.000 F160.000",
      "G0 X46.000",
      "G0 Z1.000",
      "(ROUGH)",
      "G0 X46.000",
      "G0 Z1.000",
      "G0 X40.400",
      "G1 Z0.000 F160.000",
      "G1 X40.400 Z0.000 F160.000",
      "G1 X40.400 Z-20.000 F160.000",
      "G1 X40.000 Z-20.000 F160.000",
      "G1 X40.000 Z-20.000 F160.000",
      "G1 X40.000 Z-50.000 F160.000",
      "G0 X46.000",
      "G0 Z1.000",
      "(ROUGH)",
      "G0 X46.000",
      "G0 Z1.000",
      "G0 X40.400",
      "G1 Z0.000 F160.000",
      "G1 X40.400 Z0.000 F160.000",
      "G1 X40.400 Z-20.000 F160.000",
      "G1 X36.000 Z-20.000 F160.000",
      "G1 X36.000 Z-20.000 F160.000",
      "G1 X36.000 Z-50.000 F160.000",
      "G0 X46.000",
      "G0 Z1.000",
      "(ROUGH)",
      "G0 X46.000",
      "G0 Z1.000",
      "G0 X40.400",
      "G1 Z0.000 F160.000",
      "G1 X40.400 Z0.000 F160.000",
      "G1 X40.400 Z-20.000 F160.000",
      "G1 X32.000 Z-20.000 F160.000",
      "G1 X32.000 Z-20.000 F160.000",
      "G1 X32.000 Z-50.000 F160.000",
      "G0 X46.000",
      "G0 Z1.000",
      "(ROUGH)",
      "G0 X46.000",
      "G0 Z1.000",
      "G0 X40.400",
      "G1 Z0.000 F160.000",
      "G1 X40.400 Z0.000 F160.000",
      "G1 X40.400 Z-20.000 F160.000",
      "G1 X28.000 Z-20.000 F160.000",
      "G1 X28.000 Z-20.000 F160.000",
      "G1 X28.000 Z-50.000 F160.000",
      "G0 X46.000",
      "G0 Z1.000",
      "(ROUGH)",
      "G0 X46.000",
      "G0 Z1.000",
      "G0 X40.400",
      "G1 Z0.000 F160.000",
      "G1 X40.400 Z0.000 F160.000",
      "G1 X40.400 Z-20.000 F160.000",
      "G1 X25.400 Z-20.000 F160.000",
      "G1 X25.400 Z-50.000 F160.000",
      "G0 X46.000",
      "G0 Z1.000",
      "(FINISH)",
      "G0 X46.000",
      "G0 Z1.000",
      "G0 X40.000",
      "G1 Z0.000 F160.000",
      "G1 X40.000 Z0.000 F160.000",
      "G1 X40.000 Z-20.000 F160.000",
      "G1 X25.000 Z-20.000 F160.000",
      "G1 X25.000 Z-50.000 F160.000",
      "G0 X46.000",
      "G0 Z1.000",
      "M5",
      "M30",
      ""
    ].join("\n"))
  })
})

// A Ø60 bar with a declared Ø20 pilot, bored out to Ø30 for 40 mm then Ø36 for the last 20 mm.
const boreProfile: TurnPoint[] = [{ diameter: 30, z: 0 }, { diameter: 30, z: -40 }, { diameter: 36, z: -40 }, { diameter: 36, z: -60 }]
const boreJob = (change: Partial<BoringJob> = {}): BoringJob => ({
  profile: boreProfile, pilot: 20, stock: { diameter: 60, length: 100 }, stepdown: 2, allowance: 0.4, ...change
})
const annulus = (rOuter: number, rInner: number, length: number): number => Math.PI * (rOuter ** 2 - rInner ** 2) * length

describe("internal boring preview from a declared pilot", () => {
  test("the cavity opens inward from the pilot and the volumes partition against the bar", () => {
    const plan = planBoring(boreJob())
    expect(plan.issues).toEqual([])
    expect(plan.release).toBe("preview")
    // Analytic: bar 60 x 100, pilot hole 20 over the 60 mm profile, bore 30 x 40 + 36 x 20, tail 60 x 40.
    const bar = annulus(30, 0, 100)
    expect(plan.barVolume).toBeCloseTo(bar, 6)
    expect(plan.pilotVolume).toBeCloseTo(annulus(10, 0, 60), 6)
    expect(plan.boreVolume).toBeCloseTo(annulus(15, 0, 40) + annulus(18, 0, 20), 6)
    expect(plan.unmachinedVolume).toBeCloseTo(annulus(30, 0, 40), 6)
    expect(plan.stockVolume).toBeCloseTo(bar - plan.pilotVolume, 6)
    // Boring removes exactly the difference between the finished cavity and the pilot it started from.
    expect(plan.removedVolume).toBeCloseTo(plan.boreVolume - plan.pilotVolume, 6)
    // Conservation in the external plan's style: worked stock = removed + bar left in the span + tail past the profile.
    expect(plan.removedVolume + plan.remainingVolume + plan.unmachinedVolume).toBeCloseTo(plan.stockVolume, 6)
    expect(plan.remainingVolume).toBeCloseTo(annulus(30, 0, 60) - plan.boreVolume, 6)
    // Every pass accounts for its share, and the passes sum to the whole removal.
    expect(plan.passes.every((p) => p.removed >= 0)).toBe(true)
    expect(plan.passes.reduce((sum, p) => sum + p.removed, 0)).toBeCloseTo(plan.removedVolume, 6)
  })

  test("the bore grows outward from the pilot and the finish takes the last allowance", () => {
    const plan = planBoring(boreJob())
    // The pilot is the declared starting cavity, then every pass opens the bore further.
    expect(plan.boreProfiles).toHaveLength(plan.passes.length + 1)
    expect(plan.boreProfiles[0]).toEqual([{ diameter: 20, z: 0 }, { diameter: 20, z: -60 }])
    expect(plan.boreAfter[0]).toBe(20)
    for (let i = 1; i < plan.boreProfiles.length; i++) {
      expect(plan.boreProfiles[i]!.every((p) => p.diameter >= 20)).toBe(true)
      expect(plan.boreAfter[i]).toBeGreaterThanOrEqual(plan.boreAfter[i - 1]!)
      expect(plan.boreAfter[i]).toBe(Math.max(...plan.boreProfiles[i]!.map((p) => p.diameter)))
    }
    // The roughing ceiling is the profile less the allowance: it leaves material on the finished wall, not bore past it.
    expect(plan.passes.at(-1)!.kind).toBe("bore-finish")
    expect(plan.passes.at(-1)!.points).toEqual(boreProfile)
    const roughed = plan.passes.filter((p) => p.kind === "bore-rough")
    for (const pass of roughed) for (const p of pass.points) expect(p.diameter).toBeLessThanOrEqual(Math.max(...boreProfile.map((q) => q.diameter)))
    // The finish opens out to the profile, so it removes what the roughing left standing.
    expect(plan.passes.at(-1)!.removed).toBeGreaterThan(0)
    expect(plan.removedVolume).toBeGreaterThan(plan.passes.at(-1)!.removed)
  })

  test("a taper is split at the cap crossings and keeps its analytic frustum volume", () => {
    const taper: TurnPoint[] = [{ diameter: 26, z: 0 }, { diameter: 40, z: -30 }]
    const plan = planBoring(boreJob({ profile: taper, pilot: 20 }))
    expect(plan.issues).toEqual([])
    const frustum = Math.PI / 12 * (26 ** 2 + 26 * 40 + 40 ** 2) * 30
    expect(plan.boreVolume).toBeCloseTo(frustum, 6)
    expect(plan.removedVolume).toBeCloseTo(frustum - annulus(10, 0, 30), 6)
    expect(plan.passes.reduce((sum, p) => sum + p.removed, 0)).toBeCloseTo(plan.removedVolume, 6)
    // A pass that only reaches part of the taper is split there instead of following its straight envelope.
    const split = plan.passes.find((p) => p.kind === "bore-rough" && p.diameter > 26 && p.diameter < 40)!
    expect(split.points.length).toBeGreaterThan(2)
    expect(split.points.some((p) => Math.abs(p.z) < 1e-9)).toBe(true)
  })

  test("the NC plunges through the open pilot and retracts axially out of the face", () => {
    const plan = planBoring(boreJob({ stepdown: 4, allowance: 0.5, rpm: 900, feedMmRev: 0.2 }))
    expect(plan.nc).toContain("(BORING PREVIEW - IDEAL POINT TOOL - X DIAMETER - FROM PILOT)")
    expect(plan.nc).toContain("G18 G21 G90 G40 G94 G97")
    expect(plan.nc).toContain("M3 S900")
    expect(plan.rpm).toBe(900)
    expect(plan.feed).toBeCloseTo(180, 6)
    expect(plan.nc).not.toMatch(/\b[BY]-?\d/)
    // Every feed move stays inside the pilot void on the way in and the tool leaves axially, never radially through the bar.
    let x = 0, z = 0, sawPilotPlunge = false, deepestRapid = 0
    for (const line of plan.nc.split("\n")) {
      const nx = Number(line.match(/\bX(-?[\d.]+)/)?.[1] ?? x)
      const nz = Number(line.match(/\bZ(-?[\d.]+)/)?.[1] ?? z)
      if (/^G1\b/.test(line) && nz === 0 && Math.abs(nx) <= 20) sawPilotPlunge = true
      // Z is only ever moved by rapid on the way OUT of the bore (towards the face), never driven deeper by a rapid.
      if (line.startsWith("G0") && nz < z) deepestRapid = Math.min(deepestRapid, nz - z)
      expect(nx).toBeLessThanOrEqual(60)
      x = nx; z = nz
    }
    expect(sawPilotPlunge).toBe(true)
    expect(deepestRapid).toBe(0)
    const parsed = analyseGcode(plan.nc)
    expect(parsed.motion.unsupported).toEqual([])
    expect(parsed.program.toolpaths.some((p) => p.moves.some((m) => m._tag === "Linear"))).toBe(true)
    expect(planBoring(boreJob({ stepdown: 4, allowance: 0.5, rpm: 900, feedMmRev: 0.2 })).nc).toBe(plan.nc)
  })

  test("a bore that cannot be cut is refused with its reason and emits no NC", () => {
    // A finished diameter below the pilot: boring opens the hole, it does not close it.
    const closes = planBoring(boreJob({ profile: [{ diameter: 18, z: 0 }, { diameter: 18, z: -20 }] }))
    expect(closes.issues.join(" ")).toContain("smaller than the pilot 20")
    expect(closes.nc).toBe("")
    expect(closes.passes).toEqual([])
    // Breakout: the bore reaches the bar's outer wall.
    const through = planBoring(boreJob({ profile: [{ diameter: 60, z: 0 }, { diameter: 60, z: -20 }] }))
    expect(through.issues.join(" ")).toContain("the bore breaks out")
    expect(through.nc).toBe("")
    const pilotThrough = planBoring(boreJob({ pilot: 60 }))
    expect(pilotThrough.issues.join(" ")).toContain("breaks out")
    expect(pilotThrough.nc).toBe("")
    // An unordered profile: the bore must run from the face towards the chuck, in order.
    const unordered = planBoring(boreJob({ profile: [{ diameter: 30, z: 0 }, { diameter: 30, z: -20 }, { diameter: 34, z: -10 }] }))
    expect(unordered.issues.join(" ")).toContain("profile z increases at point 2")
    expect(unordered.nc).toBe("")
    const offFace = planBoring(boreJob({ profile: [{ diameter: 30, z: -1 }, { diameter: 30, z: -20 }] }))
    expect(offFace.issues.join(" ")).toContain("must start at the finished face")
    expect(offFace.nc).toBe("")
    const tooLong = planBoring(boreJob({ profile: [{ diameter: 30, z: 0 }, { diameter: 30, z: -120 }] }))
    expect(tooLong.issues.join(" ")).toContain("the profile is 120 mm long but the bar is 100 mm")
    expect(tooLong.nc).toBe("")
  })

  test("invalid inputs are refused before any pass is built", () => {
    for (const change of [
      { pilot: 0 }, { pilot: Number.NaN }, { pilot: Number.POSITIVE_INFINITY }, { stepdown: Number.MIN_VALUE },
      { stepdown: 0.001 }, { rpm: Infinity }, { allowance: Number.NaN }, { feedMmRev: Number.NaN }, { rpm: 0.1 },
      { stock: { diameter: Infinity, length: 100 } }, { profile: [{ diameter: 30, z: 0 }] },
      { profile: [{ diameter: 0, z: 0 }, { diameter: 30, z: -20 }] },
      { profile: [{ diameter: 30, z: Number.NaN }, { diameter: 30, z: -20 }] },
      { profile: [{ diameter: 30, z: 0 }, { diameter: 34, z: 0 }] }
    ]) {
      const plan = planBoring(boreJob(change as Partial<BoringJob>))
      expect(plan.issues.length).toBeGreaterThan(0)
      expect(plan.nc).toBe("")
      expect(plan.passes).toEqual([])
    }
  })

  test("the turning centre bounds the bar and the spindle, and a chuck it cannot hold is refused", () => {
    const machine = { id: "mazak-integrex-i200", name: "Mazak INTEGREX i-200 class", maxBarDiameter: 65, maxBarLength: 590, maxRpm: 12000, maxFeed: 40000 }
    const wide = planBoring(boreJob({ stock: { diameter: 80, length: 100 }, machine }))
    expect(wide.issues.join(" ")).toContain("does not fit the chuck of Mazak INTEGREX i-200 class (max 65 mm)")
    expect(wide.passes).toEqual([])
    expect(wide.nc).toBe("")
    const long = planBoring(boreJob({ stock: { diameter: 60, length: 900 }, machine }))
    expect(long.issues.join(" ")).toContain("longer than Mazak INTEGREX i-200 class takes")
    expect(long.nc).toBe("")
    const bounded = planBoring(boreJob({ rpm: 20000, feedMmRev: 5, machine }))
    expect(bounded.issues).toEqual([])
    expect(bounded.rpm).toBe(12000)
    expect(bounded.feed).toBe(40000)
    expect(bounded.machine).toEqual({ id: "mazak-integrex-i200", name: "Mazak INTEGREX i-200 class" })
    expect(bounded.nc).toContain("M3 S12000")
    expect(bounded.nc).toContain("F40000.000")
    // Without the machine the plan keeps the asked-for values.
    expect(planBoring(boreJob({ rpm: 20000, feedMmRev: 5 })).rpm).toBe(20000)
  })
})
