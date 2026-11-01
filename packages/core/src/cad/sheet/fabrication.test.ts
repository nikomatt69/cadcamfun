import { describe, expect, test } from "bun:test"
import { polygonArea } from "../sketch.ts"
import { memberVolume, mitredFrame, profileArea, profileOutline, sheetMetalDfm, weldmentCutList, type WeldProfile } from "./index.ts"

const outlineArea = (p: WeldProfile): number => profileOutline(p, 0.0005).reduce((s, loop) => s + polygonArea(loop), 0)

describe("sheet-metal DFM (SM7)", () => {
  const part = { thickness: 2, bendRadius: 3 }

  test("each rule flags its violation with the rule id, the measured and the required value", () => {
    const r = sheetMetalDfm({
      ...part,
      flanges: [{ id: "short", length: 10.9 }, { id: "ok", length: 11 }],
      holes: [{ id: "near", diameter: 4, distanceToBend: 7.9, distanceToEdge: 3.9 }, { id: "tiny", diameter: 1.5, distanceToBend: 20, distanceToEdge: 20 }, { id: "good", diameter: 5, distanceToBend: 8, distanceToEdge: 4 }],
      reliefs: [{ id: "r1", depth: 4.9, width: 1.9 }, { id: "r2", depth: 5, width: 2 }]
    })
    expect(r.ok).toBe(false)
    const byFeature = (rule: string) => r.findings.filter((f) => f.rule === rule).map((f) => [f.feature, f.measured, f.required])
    // 4 T + R = 11, 2.5 T + R = 8, 2 T = 4, T + R = 5, T = 2.
    expect(byFeature("SM-FLANGE-MIN")).toEqual([["short", 10.9, 11]])
    expect(byFeature("SM-HOLE-BEND")).toEqual([["near", 7.9, 8]])
    expect(byFeature("SM-HOLE-EDGE")).toEqual([["near", 3.9, 4]])
    expect(byFeature("SM-HOLE-MIN")).toEqual([["tiny", 1.5, 2]])
    expect(byFeature("SM-RELIEF-DEPTH")).toEqual([["r1", 4.9, 5]])
    expect(byFeature("SM-RELIEF-WIDTH")).toEqual([["r1", 1.9, 2]])
    expect(r.findings).toHaveLength(6)
    expect(r.checked).toBe(2 + 9 + 4)
    expect(sheetMetalDfm({ ...part, flanges: [{ id: "f", length: 11 }], holes: [{ id: "h", diameter: 2, distanceToBend: 8, distanceToEdge: 4 }], reliefs: [{ id: "r", depth: 5, width: 2 }] }).ok).toBe(true)
    expect(() => sheetMetalDfm({ thickness: 0, bendRadius: 1 })).toThrow(/thickness/)
  })
})

describe("profile library (W1)", () => {
  test("20 x 20 x 2 square tube: closed form with and without corner radii equals the outline area", () => {
    const sharp: WeldProfile = { kind: "rectTube", width: 20, height: 20, wall: 2 }
    expect(profileArea(sharp)).toBeCloseTo(400 - 256, 12)
    // Outer radius 3 (inner 1): outer 400 - (4 - pi) 9, inner 256 - (4 - pi) 1.
    const round: WeldProfile = { kind: "rectTube", width: 20, height: 20, wall: 2, outerRadius: 3 }
    const exact = 400 - (4 - Math.PI) * 9 - (256 - (4 - Math.PI) * 1)
    expect(profileArea(round)).toBeCloseTo(exact, 12)
    expect(outlineArea(round)).toBeCloseTo(exact, 2)
    expect(outlineArea(round)).toBeLessThan(exact) // an inscribed polygon never exceeds the arcs
  })

  test("round tube, flat bar, angle, channel and I-beam areas match their outlines", () => {
    const cases: Array<[WeldProfile, number]> = [
      [{ kind: "roundTube", diameter: 30, wall: 2 }, (Math.PI / 4) * (900 - 676)],
      [{ kind: "flatBar", width: 40, thickness: 5 }, 200],
      [{ kind: "angle", legA: 40, legB: 30, thickness: 4 }, 4 * (40 + 30 - 4)],
      [{ kind: "channel", height: 100, flange: 50, web: 6, flangeThickness: 8.5 }, 100 * 6 + 2 * 44 * 8.5],
      [{ kind: "iBeam", height: 100, flange: 55, web: 4.1, flangeThickness: 5.7 }, 2 * 55 * 5.7 + (100 - 11.4) * 4.1]
    ]
    for (const [p, expected] of cases) {
      expect(profileArea(p)).toBeCloseTo(expected, 9)
      expect(outlineArea(p)).toBeCloseTo(expected, p.kind === "roundTube" ? 1 : 9)
    }
  })

  test("impossible sections are refused", () => {
    expect(() => profileArea({ kind: "rectTube", width: 20, height: 20, wall: 10 })).toThrow(/too thick/)
    expect(() => profileArea({ kind: "flatBar", width: -1, thickness: 2 })).toThrow(/positive/)
  })
})

describe("cut list (W3)", () => {
  const tube: Extract<WeldProfile, { kind: "rectTube" }> = { kind: "rectTube", width: 20, height: 20, wall: 2 }

  test("a mitred rectangular frame: cut lengths are the analytic long points and the volume is area x centreline perimeter", () => {
    const members = mitredFrame(500, 300, tube)
    const list = weldmentCutList(members, 7.85)
    expect(list.rows).toHaveLength(2)
    expect(list.rows.map((r) => [r.length, r.quantity, r.miterStart, r.miterEnd])).toEqual([[520, 2, 45, 45], [320, 2, 45, 45]])
    const area = profileArea(tube)
    expect(list.totalVolume).toBeCloseTo(area * 2 * (500 + 300), 6)
    expect(list.totalMass).toBeCloseTo((area * 1600 * 7.85) / 1000, 6)
    expect(list.totalLength).toBe(2 * 520 + 2 * 320)
    // Each member alone is the trapezoid prism: its volume lies between the short and long point lengths.
    for (const m of members) expect(memberVolume(m)).toBeCloseTo(area * (m.length - 20), 9)
  })

  test("members that differ only in direction of sawing are one row; different end cuts or profiles are not", () => {
    const flat: WeldProfile = { kind: "flatBar", width: 30, thickness: 4 }
    const list = weldmentCutList([
      { id: "a", profile: tube, length: 400, miterStart: 0, miterEnd: 30 }, { id: "b", profile: tube, length: 400, miterStart: 30, miterEnd: 0 },
      { id: "c", profile: tube, length: 400 }, { id: "d", profile: flat, length: 400 }
    ])
    expect(list.rows.map((r) => [r.profile, r.quantity, r.members])).toEqual([["RHS 20x20x2", 2, ["a", "b"]], ["RHS 20x20x2", 1, ["c"]], ["FB 30x4", 1, ["d"]]])
    expect(() => weldmentCutList([{ id: "x", profile: tube, length: 0 }])).toThrow(/positive length/)
    expect(() => weldmentCutList([{ id: "y", profile: tube, length: 15, miterStart: 45, miterEnd: 45 }])).toThrow(/consume/)
  })
})
