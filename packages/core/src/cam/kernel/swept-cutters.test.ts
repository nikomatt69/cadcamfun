import { describe, expect, test } from "bun:test"
import { DEFAULT_CUTTERS, cutterIssues, legacyTool, sweptProfile, verifyTool, type Cutter } from "./cutters.ts"
import { TriDexel, toolSolid } from "./tridexel.ts"
import { cutterProfile } from "./engagement.ts"
import { cutterOf } from "../operations/surface-field.ts"
import { toolModel } from "../verify/tool-model.ts"
import { toolModelFromCutter } from "../tool-model.ts"
import { CutterSchema } from "./schema.ts"
import { Schema } from "effect"

const base = { flutes: 4, material: "carbide", coating: "altin", shankDiameter: 8, stickout: 40 } as const
const taperedBall = (over: Partial<Cutter> = {}): Cutter => ({ ...base, id: "tb", name: "Tapered ball", kind: "tapered", diameter: 8, tipDiameter: 2, angle: 6, fluteLength: 40, ...over })
const lollipop = (over: Partial<Cutter> = {}): Cutter => ({ ...base, id: "lp", name: "Lollipop", kind: "lollipop", diameter: 10, neckDiameter: 4, fluteLength: 20, ...over })
const barrel = (over: Partial<Cutter> = {}): Cutter => ({ ...base, id: "br", name: "Barrel", kind: "barrel", diameter: 10, formRadius: 30, headHeight: 8, fluteLength: 12, ...over })
const lens = (over: Partial<Cutter> = {}): Cutter => ({ ...base, id: "ln", name: "Lens", kind: "lens", diameter: 10, headHeight: 16, neckDiameter: 4, fluteLength: 20, ...over })

const UM = 1e-3

/** Radius of the outer surface of a cutter at height z above the tip, from the closed forms of each kind (independent of the polyline). */
const analyticRadius = (c: Cutter, z: number): number => {
  const R = c.diameter / 2
  switch (c.kind) {
    case "tapered": {
      const rt = (c.tipDiameter ?? 0) / 2, rc = Math.min(c.cornerRadius ?? rt, rt), a = ((c.angle ?? 3) * Math.PI) / 360
      const tr = rt - rc + rc * Math.cos(a), tz = rc - rc * Math.sin(a)
      if (z < tz) return rt - rc + Math.sqrt(Math.max(0, rc * rc - (rc - z) * (rc - z)))
      return Math.min(R, tr + (z - tz) * Math.tan(a))
    }
    case "lollipop": return Math.sqrt(Math.max(0, R * R - (R - z) * (R - z)))
    case "barrel": {
      const Rf = c.formRadius!, h = c.headHeight!
      return R - Rf + Math.sqrt(Rf * Rf - (z - h / 2) * (z - h / 2))
    }
    case "lens": {
      const h = c.headHeight!, Rf = (R * R + (h / 2) ** 2) / (2 * R)
      return R - Rf + Math.sqrt(Rf * Rf - (z - h / 2) * (z - h / 2))
    }
    default: throw new Error("not a swept kind")
  }
}

/** Distance from a point to the closed-form outer curve of a cutter over heights z0..z1 (densely sampled; the sample step is 0.1 um). */
const distanceToCurve = (c: Cutter, p: { r: number; z: number }, z0: number, z1: number): number => {
  let best = Infinity
  const n = 40000
  for (let i = 0; i <= n; i++) {
    // Dense at both ends: near a pole the radius changes as sqrt(z), which a uniform z step would under-sample.
    const z = z0 + ((z1 - z0) * (1 - Math.cos((Math.PI * i) / n))) / 2
    best = Math.min(best, Math.hypot(p.r - analyticRadius(c, z), p.z - z))
  }
  return best
}

describe("swept-profile cutters (spec 69 D1): the profile is the analytic envelope within 1 um", () => {
  // [name, cutter, curve height range]: the range stops where the closed form ends (the neck / shoulder step above it is a plane).
  const cases: ReadonlyArray<readonly [string, Cutter, number, number]> = [
    ["tapered ball", taperedBall({ angle: 12 }), 0.0, 30],
    ["tapered flat with corner radius", taperedBall({ id: "tf", angle: 12, cornerRadius: 0.4 }), 0.0, 30],
    ["tapered, sharp corner", taperedBall({ id: "ts", angle: 12, cornerRadius: 0 }), 0.0, 30],
    ["lollipop", lollipop(), 0.0, 9.5],
    ["barrel", barrel(), 0.0, 8],
    ["lens", lens(), 0.0, 16]
  ]
  for (const [name, c, z0, z1] of cases) {
    test(`${name}: the polyline vertices and the chord midpoints are within 1 um of the closed form`, () => {
      expect(cutterIssues(c)).toEqual([])
      const pts = sweptProfile(c)
      let worst = 0, checked = 0
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!, b = pts[i + 1]!
        // Flat faces (the tip face, a shoulder step) are planes, not part of the curve.
        if (Math.abs(a.z - b.z) < 1e-12 || a.z > z1 + 1e-9 || b.z > z1 + 1e-9) continue
        if (Math.abs(a.r - b.r) < 1e-12 && Math.abs(a.r - c.diameter / 2) > 1e-9 && c.kind !== "lollipop") continue
        for (const p of [a, { r: (a.r + b.r) / 2, z: (a.z + b.z) / 2 }]) { worst = Math.max(worst, distanceToCurve(c, p, z0, z1)); checked++ }
      }
      expect(checked).toBeGreaterThanOrEqual(2)
      expect(worst).toBeLessThan(UM)
    })
  }

  test("the height-field replay of a tapered ball is the sphere at the tip and the cone above it", () => {
    const c = taperedBall({ angle: 12 })
    const m = toolModel(verifyTool(c))
    const rt = 1, a = (12 * Math.PI) / 360
    // On the sphere: z = rt - sqrt(rt^2 - r^2) up to the tangent radius.
    for (const r of [0, 0.2, 0.5, 0.8]) expect(Math.abs(m.profile(r) - (rt - Math.sqrt(rt * rt - r * r)))).toBeLessThan(UM)
    // On the cone: z = tz + (r - tr) / tan(a).
    const tr = rt * Math.cos(a), tz = rt - rt * Math.sin(a)
    for (const r of [1.2, 2, 3, 3.9]) expect(Math.abs(m.profile(r) - (tz + (r - tr) / Math.tan(a)))).toBeLessThan(UM * 2)
    expect(m.flat).toBe(false)
    expect(m.radius).toBeCloseTo(4, 9)
  })

  test("the height-field replay of a lollipop is the lower hemisphere, not the cylinder of its diameter", () => {
    const m = toolModel(verifyTool(lollipop()))
    for (const r of [0, 1, 2.5, 4, 4.9]) expect(Math.abs(m.profile(r) - (5 - Math.sqrt(25 - r * r)))).toBeLessThan(UM * 2)
  })

  test("a lens is a point at the tip and a barrel is flat there", () => {
    expect(toolModel(verifyTool(lens())).profile(0)).toBeCloseTo(0, 9)
    const b = toolModel(verifyTool(barrel()))
    expect(b.profile(0)).toBeCloseTo(0, 9)
    // The barrel face is flat out to where its arc meets z = 0, then climbs.
    const r0 = 5 - 30 + Math.sqrt(900 - 16)
    expect(b.profile(r0 * 0.9)).toBeCloseTo(0, 9)
    expect(b.profile(5)).toBeCloseTo(4, 6)
  })

  test("the dexel solid of a lollipop removes the sphere up to the neck plus the neck, within 1 %", () => {
    const c = lollipop()
    const R = 5, n = 2
    const s = TriDexel.box({ x: -12, y: -12, z: 0 }, { x: 12, y: 12, z: 30 }, 0.2)
    const before = s.volume()
    s.cut(toolSolid(c), { x: 0, y: 0, z: 4 })
    const removed = before - s.volume()
    const cap = R - Math.sqrt(R * R - n * n)
    const sphere = (4 / 3) * Math.PI * R ** 3 - (Math.PI * cap * cap * (3 * R - cap)) / 3
    const z1 = R + Math.sqrt(R * R - n * n)
    const expected = sphere + Math.PI * n * n * (c.fluteLength - z1)
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.01)
  })

  test("the lollipop undercuts: a sideways pass at the neck cuts under an overhang a flat mill cannot reach", () => {
    // A plate with a 4 mm wide slot opened at the top; the sphere (Ø10) cannot enter it, a Ø4 neck can, and the sphere then
    // reaches beneath the slot's lip. Cut the slot first with the neck-sized tool, then undercut with the sphere below the lip.
    const s = TriDexel.box({ x: -15, y: -10, z: 0 }, { x: 15, y: 10, z: 20 }, 0.2)
    const c = lollipop()
    s.cut(toolSolid({ ...c, kind: "flat", diameter: 3.8, neckDiameter: undefined, fluteLength: 20 } as Cutter), { x: 0, y: 0, z: 5 })
    const lip = { x: 3.5, y: 0, z: 14 }
    expect(s.has(lip)).toBe(true)
    // The sphere centre 5 above its tip at z = 6: the sphere reaches r = 5 about the centre height 11, under the lip at z 14 (centre + 3).
    s.cut(toolSolid(c), { x: 0, y: 0, z: 6 })
    expect(s.has({ x: 4.5, y: 0, z: 11 })).toBe(false)
    expect(s.has({ x: 5.6, y: 0, z: 11 })).toBe(true)
  })

  test("legacy and preview views follow the profile", () => {
    expect(legacyTool(lollipop())).toMatchObject({ kind: "ballnose", tipRadius: 5 })
    expect(toolModelFromCutter(taperedBall()).shape).toBe("tapered")
    expect(toolModelFromCutter(lollipop()).shape).toBe("lollipop")
    const p = sweptProfile(lollipop())
    expect(Math.max(...p.map((q) => q.r))).toBeCloseTo(5, 3)
  })

  test("a swept cutter the geometry cannot make is refused with the reason", () => {
    expect(cutterIssues(taperedBall({ tipDiameter: undefined }))[0]).toMatch(/tip diameter/)
    expect(cutterIssues(taperedBall({ angle: undefined }))[0]).toMatch(/taper angle/)
    expect(cutterIssues(taperedBall({ angle: 12, fluteLength: 10, stickout: 40 }))[0]).toMatch(/beyond the cutting length/)
    expect(cutterIssues(lollipop({ neckDiameter: 12 }))[0]).toMatch(/neck narrower/)
    expect(cutterIssues(lollipop({ fluteLength: 6 }))[0]).toMatch(/shorter than the sphere/)
    expect(cutterIssues(barrel({ formRadius: 2 }))[0]).toMatch(/form radius/)
    expect(cutterIssues(barrel({ headHeight: undefined }))[0]).toMatch(/head height/)
    expect(cutterIssues(lens({ headHeight: 30 }))[0]).toMatch(/head height/)
    expect(cutterIssues(lens({ headHeight: 8 }))[0]).toMatch(/at least its diameter/)
  })

  test("the contract schema carries the new kinds and the form radius", () => {
    const decoded = Schema.decodeUnknownSync(CutterSchema)(barrel())
    expect(decoded.kind).toBe("barrel")
    expect(decoded.formRadius).toBe(30)
  })

  test("the legacy tool, the surface strategies, the engagement replay and the default library all see the swept profile", () => {
    const c = lollipop()
    const legacy = legacyTool(c)
    expect(legacy.profile?.length).toBeGreaterThan(10)
    const f = cutterOf(legacy)
    expect(f.radius).toBeCloseTo(5, 3)
    for (const r of [0, 2, 4]) expect(Math.abs(f.profile(r) - (5 - Math.sqrt(25 - r * r)))).toBeLessThan(2 * UM)
    // Stock to leave: a grown body stays at least `a` clear (never lower than the exact one shifted out).
    const grown = cutterOf(legacy, 0.5)
    expect(grown.radius).toBeCloseTo(5.5, 3)
    expect(grown.lift).toBe(0.5)
    expect(cutterProfile(c).profile(3)).toBeCloseTo(5 - 4, 2)
    expect(cutterProfile(c).flat).toBe(false)
    for (const d of DEFAULT_CUTTERS) expect(cutterIssues(d)).toEqual([])
    expect(DEFAULT_CUTTERS.filter((d) => ["tapered", "lollipop", "barrel", "lens"].includes(d.kind)).length).toBe(4)
  })
})
