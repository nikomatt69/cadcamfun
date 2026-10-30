import { describe, expect, test } from "bun:test"
import { assemblyProfile, assemblyVolume } from "./assembly.ts"
import { DEFAULT_CUTTERS, countersinkDepth, cutterIssues, findCutter, legacyTool, pointLength, verifyTool, type Cutter } from "./cutters.ts"
import { cuttingData } from "./cutting-data.ts"
import { requireMaterial } from "./materials.ts"
import { TriDexel, toolSolid } from "./tridexel.ts"
import { toolModelFromCutter } from "../tool-model.ts"

const csk = (over: Partial<Cutter> = {}): Cutter => ({ id: "csk", name: "Countersink", kind: "countersink", diameter: 12, flutes: 3, material: "carbide", coating: "tin", angle: 90, tipDiameter: 1.2, fluteLength: 8, shankDiameter: 8, stickout: 40, ...over })
const tslot = (over: Partial<Cutter> = {}): Cutter => ({ id: "ts", name: "T-slot", kind: "tslot", diameter: 12, flutes: 4, material: "carbide", coating: "altin", neckDiameter: 5, headHeight: 4, fluteLength: 12, shankDiameter: 6, stickout: 30, ...over })
const dovetail = (over: Partial<Cutter> = {}): Cutter => ({ id: "dt", name: "Dovetail", kind: "dovetail", diameter: 12, flutes: 4, material: "carbide", coating: "altin", angle: 60, neckDiameter: 6, headHeight: 4, fluteLength: 10, shankDiameter: 8, stickout: 30, ...over })

/** Plate x -20..20, y -15..15, z 0..20, `cell` mm rays. */
const plate = (cell = 0.2): TriDexel => TriDexel.box({ x: -20, y: -15, z: 0 }, { x: 20, y: 15, z: 20 }, cell)

describe("countersink cutter", () => {
  test("the cone depth to a finished diameter is the analytic cone height from the flat tip", () => {
    // 90 degrees included: 45 degree flanks, so the radius grows 1 mm per mm of depth from the 0.6 mm flat radius.
    expect(countersinkDepth(csk(), 12)).toBeCloseTo(5.4, 12)
    expect(countersinkDepth(csk({ angle: 82 }), 10)).toBeCloseTo((5 - 0.6) / Math.tan((41 * Math.PI) / 180), 12)
    expect(countersinkDepth(csk({ angle: 120, tipDiameter: 0 }), 6)).toBeCloseTo(3 / Math.tan((60 * Math.PI) / 180), 12)
    // The cone's own point length is the depth to its full diameter.
    expect(pointLength(csk())).toBeCloseTo(countersinkDepth(csk(), 12), 12)
  })

  test("a diameter the tool cannot make is refused with the reason", () => {
    expect(() => countersinkDepth(csk(), 13)).toThrow(/Ø12 at most/)
    expect(() => countersinkDepth(csk(), 1.2)).toThrow(/not wider than the Ø1.2 flat/)
    expect(() => countersinkDepth(csk({ angle: undefined }), 8)).toThrow(/included angle/)
  })

  test("plunged to the depth for a diameter it removes exactly the analytic frustum", () => {
    const s = plate(0.1)
    const before = s.volume()
    const depth = countersinkDepth(csk(), 10)
    s.cut(toolSolid(csk()), { x: 0, y: 0, z: 20 - depth })
    const removed = before - s.volume()
    // Frustum from radius 0.6 to 5 over `depth` (the flat tip's disc included) plus nothing above the surface.
    const expected = (Math.PI / 3) * depth * (0.6 * 0.6 + 0.6 * 5 + 25)
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.02)
    // The cutter reaches exactly Ø10 at the surface: a point 0.3 mm inside is gone, 0.3 mm outside is still material.
    expect(s.has({ x: 4.7, y: 0, z: 19.95 })).toBe(false)
    expect(s.has({ x: 5.3, y: 0, z: 19.95 })).toBe(true)
  })

  test("it drills at drilling data and is not called a wrong tool", () => {
    const data = cuttingData({ material: requireMaterial("6061"), cutter: csk(), cut: "spot", machine: { maxRpm: 12000, maxFeed: 5000 }, depth: 5 })
    expect(data.warnings.some((w) => /not a drill/.test(w))).toBe(false)
    expect(data.rpm).toBeGreaterThan(0)
    // The replay sees it as the cone it is.
    expect(verifyTool(csk())).toMatchObject({ kind: "vbit", angle: 90, diameter: 12 })
    expect(legacyTool(csk())).toMatchObject({ kind: "vbit", angle: 90 })
    expect(toolModelFromCutter(csk()).shape).toBe("chamfer")
  })
})

describe("boring bar, T-slot and dovetail profiles", () => {
  const bar = DEFAULT_CUTTERS.find((c) => c.kind === "boringbar")!

  test("the boring bar sweeps a disc of its cutting diameter and insert height on a narrow body", () => {
    const p = assemblyProfile(bar)
    const R = bar.diameter / 2, n = bar.neckDiameter! / 2, h = bar.headHeight!
    const cutting = p.points.filter((_, i) => p.parts[i] === "cutting" || i === 0)
    expect(Math.max(...cutting.map((q) => q.r))).toBeCloseTo(R, 12)
    // Pappus on the cutting zone: the insert disc plus the body above it.
    const segments = p.parts.filter((part) => part === "cutting").length
    const top = p.points.slice(0, segments + 1).reduce((m, q) => Math.max(m, q.z), 0)
    expect(assemblyVolume(p, "cutting")).toBeCloseTo(Math.PI * R * R * h + Math.PI * n * n * (bar.fluteLength - h), 6)
    expect(top).toBeCloseTo(bar.fluteLength, 12)
    // The body goes through a hole the swept diameter cannot: its radius is the neck.
    expect(n * 2).toBeLessThan(bar.diameter)
  })

  test("a T-slot cutter cuts a disc and leaves the neck: swept slot volume is analytic", () => {
    const L = 10, R = 6, n = 2.5, h = 4, tip = 8
    const s = plate(0.1)
    // The neck hole the cutter enters through (Ø5 from the top down to the slot level).
    const neckHole: Cutter = { id: "n", name: "n", kind: "flat", diameter: 5, flutes: 2, material: "carbide", coating: "none", fluteLength: 30, shankDiameter: 5, stickout: 40 }
    s.cut(toolSolid(neckHole), { x: 0, y: 0, z: tip })
    const before = s.volume()
    s.removePath(toolSolid(tslot()), [{ x: 0, y: 0, z: tip }, { x: L, y: 0, z: tip }])
    const removed = before - s.volume()
    // Disc strip (stadium) less the neck hole already cut inside it, then the neck strip above the disc up to the stock top.
    const expected = (2 * R * L + Math.PI * R * R - Math.PI * n * n) * h + 2 * n * L * (20 - tip - h)
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.03)
    // Material stays above and below the disc plane where the disc has not been.
    expect(s.has({ x: 8, y: 5, z: tip + h + 0.5 })).toBe(true)
    expect(s.has({ x: 8, y: 5, z: tip - 0.5 })).toBe(true)
    expect(s.has({ x: 8, y: 5, z: tip + h / 2 })).toBe(false)
  })

  test("a dovetail undercuts: widest at the tip, flank at half the included angle, swept volume is the analytic integral", () => {
    const L = 10, R = 6, n = 3, h = 4, tip = 8, t = Math.tan((30 * Math.PI) / 180)
    const s = plate(0.1)
    const neckHole: Cutter = { id: "n", name: "n", kind: "flat", diameter: 6, flutes: 2, material: "carbide", coating: "none", fluteLength: 30, shankDiameter: 6, stickout: 40 }
    s.cut(toolSolid(neckHole), { x: 0, y: 0, z: tip })
    const before = s.volume()
    s.removePath(toolSolid(dovetail()), [{ x: 0, y: 0, z: tip }, { x: L, y: 0, z: tip }])
    const removed = before - s.volume()
    // r(z) = R - z tan(30 deg) for z in [0, h]; stadium area 2 r L + pi r^2 minus the neck hole pi n^2; the neck strip above.
    const area = 2 * L * (R * h - (t * h * h) / 2) + (Math.PI * (R ** 3 - (R - h * t) ** 3)) / (3 * t) - Math.PI * n * n * h
    // The cutting zone ends at the flute length (10 mm above the tip, below the stock top): the shank above it is not modelled as cutting.
    const expected = area + 2 * n * L * (Math.min(20 - tip, dovetail().fluteLength) - h)
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.03)
    // The undercut: at the head's top the slot is narrower than at its bottom, so a point under the shoulder is cut, over it is not.
    const wide = R - 0.4, narrow = R - h * t + 0.4
    expect(s.has({ x: L, y: wide, z: tip + 0.3 })).toBe(false)
    expect(s.has({ x: L, y: wide, z: tip + h - 0.3 })).toBe(true)
    expect(s.has({ x: L, y: narrow - 0.8, z: tip + h - 0.3 })).toBe(false)
  })

  test("library cutters of the new kinds are valid, and bad ones are named", () => {
    for (const c of DEFAULT_CUTTERS.filter((k) => ["countersink", "boringbar", "tslot", "dovetail"].includes(k.kind))) expect(cutterIssues(c)).toEqual([])
    expect(findCutter(DEFAULT_CUTTERS, "csk-12-90")?.tipDiameter).toBeCloseTo(1.2, 12)
    expect(cutterIssues(tslot({ neckDiameter: 12 }))[0]).toMatch(/neck narrower/)
    expect(cutterIssues(tslot({ headHeight: 20 }))[0]).toMatch(/head height/)
    expect(cutterIssues(csk({ angle: undefined }))[0]).toMatch(/included angle/)
    expect(cutterIssues(dovetail({ headHeight: 9 })).join(" ")).toMatch(/flanks run into the neck/)
    // The replay never sees less than the head: a boring bar, a T-slot and a dovetail are swept as their full cylinder.
    expect(verifyTool(tslot())).toMatchObject({ kind: "endmill", diameter: 12 })
  })
})
