import { describe, expect, test } from "bun:test"
import type { Move } from "../ir.ts"
import { contactArc, cuttingDataClaim, engagementAlong, moveLoads, radialOf, stepLoad, stockBlock } from "./engagement.ts"
import { cuttingData, millingLoad, type MachineLimits } from "./cutting-data.ts"
import type { Cutter } from "./cutters.ts"
import { findMaterial } from "./materials.ts"

const endmill = (d: number, flutes = 3): Cutter => ({ id: "t", name: "em", kind: "flat", diameter: d, flutes, material: "carbide", coating: "altin", fluteLength: 25, shankDiameter: d, stickout: 45 })
const line = (x: number, y: number, z: number, feed = 1000): Move => ({ _tag: "Linear", to: { x, y, z }, feed })
const rapid = (x: number, y: number, z: number): Move => ({ _tag: "Rapid", to: { x, y, z } })
const machine: MachineLimits = { maxRpm: 12000, maxFeed: 8000, powerKw: 11, torqueNm: 60 }

/** Median contact arc over the steps of a move, leaving out its first and last 8 mm (entry and exit effects). */
const midPhi = (r: ReturnType<typeof engagementAlong>, move: number): number => {
  const m = r.perMove[move]!
  const values: number[] = []
  for (let k = m.from; k < m.to; k++) if (k - m.from > 32 && m.to - k > 32) values.push(r.steps.phi[k]!)
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)]!
}

describe("engagement along a program (spec 61 Z1)", () => {
  const cell = 0.25
  const D = 10

  test("a full-width slot has ae = D and phi = pi, within the declared bound", () => {
    const stock = stockBlock(-20, -20, 80, 20, -10, 0, cell)
    const r = engagementAlong([rapid(-5, 0, 5), line(-5, 0, -3), line(60, 0, -3)], stock, endmill(D))
    const slot = r.perMove[2]!
    expect(slot.status).toBe("resolved")
    expect(Math.abs(slot.aeMean - D)).toBeLessThanOrEqual(r.bound.ae)
    expect(Math.abs(slot.phiMax - Math.PI)).toBeLessThanOrEqual(r.bound.phiAt(D) + 0.05)
    expect(slot.apMax).toBeCloseTo(3, 6)
    // The plunge: nothing is to the side of the cutter that is not stock, so the contact arc is the whole periphery.
    expect(r.perMove[1]!.phiMax).toBeCloseTo(2 * Math.PI, 6)
    // The caller's stock is untouched (the run works on a copy).
    expect(stock.top.every((v) => v === 0)).toBe(true)
  })

  test("a shoulder cut at ae has phi = acos(1 - 2 ae / D) and a cut area of ae x ap", () => {
    for (const ae of [1.5, 3, 5]) {
      const stock = stockBlock(-20, -20, 80, 20, -10, 0, cell)
      const r = engagementAlong([rapid(-5, 0, 5), line(-5, 0, -3), line(60, 0, -3), line(60, ae, -3), line(-5, ae, -3)], stock, endmill(D))
      const pass = r.perMove[4]!
      const expected = contactArc(ae, D)
      expect(Math.abs(pass.aeMean - ae)).toBeLessThanOrEqual(r.bound.ae)
      expect(Math.abs(midPhi(r, 4) - expected)).toBeLessThanOrEqual(r.bound.phiAt(ae) + 0.05)
      // The chip cross-section is ae x ap (3 mm deep): the volume removed over the path length.
      expect(Math.abs(pass.removed / pass.cutLength - ae * 3)).toBeLessThan(0.15 * ae * 3 + cell * 3)
      expect(radialOf(expected, D)).toBeCloseTo(ae, 12)
    }
  })

  test("the error of the engagement falls with the stock cell", () => {
    const error = (c: number): number => {
      const stock = stockBlock(-20, -20, 80, 20, -10, 0, c)
      const r = engagementAlong([rapid(-5, 0, 5), line(-5, 0, -3), line(60, 0, -3), line(60, 3, -3), line(-5, 3, -3)], stock, endmill(D))
      return Math.abs(r.perMove[4]!.aeMean - 3)
    }
    expect(error(0.1)).toBeLessThanOrEqual(error(0.5) + 1e-9)
  })

  test("an inside corner of radius r peaks at the closed form acos((rp^2 + R^2 - b^2) / (2 rp R))", () => {
    // Spiral-in on a circular path: the previous pass (full circle at radius rp + ae) leaves a core of radius b = rp + ae - R.
    const R = D / 2, rp = 12, ae = 2
    const stock = stockBlock(-30, -30, 30, 30, -10, 0, cell)
    const circle = (r: number): Move[] => [rapid(r, 0, 5), line(r, 0, -3), { _tag: "Arc", to: { x: r, y: 0, z: -3 }, center: { x: 0, y: 0 }, clockwise: false, feed: 1000 }]
    const r = engagementAlong([...circle(rp + ae), ...circle(rp)], stock, endmill(D))
    const second = r.perMove[5]!
    const b = rp + ae - R
    const gamma = Math.acos((rp * rp + R * R - b * b) / (2 * rp * R))
    expect(Math.abs(second.phiMax - gamma)).toBeLessThanOrEqual(r.bound.phiAt(ae) + 0.08)
    expect(second.aeMax).toBeGreaterThan(ae - r.bound.ae)
  })

  test("a move with rotary words and every move after a turned Orient is unresolved with the reason, never extrapolated", () => {
    const stock = stockBlock(-20, -20, 40, 20, -10, 0, 0.5)
    const r = engagementAlong([rapid(0, 0, 5), { _tag: "Linear", to: { x: 10, y: 0, z: -1 }, feed: 800, rotary: { a: 15 } }, { _tag: "Orient", a: 30 }, line(20, 0, -1)], stock, endmill(6))
    expect(r.perMove[1]!.status).toBe("unresolved")
    expect(r.perMove[3]!.status).toBe("unresolved")
    expect(r.perMove[3]!.reason).toMatch(/rotary/)
    expect(cuttingDataClaim(moveLoads(r, { material: findMaterial("steel-c45")!, cutter: endmill(6), machine, rpm: 5000 }, 800)).status).toBe("unresolved")
  })

  test("a cancelled run throws instead of finishing", () => {
    const stock = stockBlock(-20, -20, 80, 20, -10, 0, 0.25)
    const ctl = new AbortController()
    ctl.abort()
    expect(() => engagementAlong([rapid(0, 0, 5), line(0, 0, -2), line(60, 0, -2)], stock, endmill(D), { signal: ctl.signal })).toThrow()
  })
})

describe("one Kienzle chain for the nominal cut and every move (spec 61 Z2)", () => {
  const material = findMaterial("steel-c45")!
  const cutter = endmill(10)

  test("a worked example from the handbook formula: Pc = ap ae vf kc / 60e6 with kc = kc11 hm^-mc", () => {
    // Kienzle's relation as printed in Tabellenbuch Metall (Europa-Lehrmittel), chapter "Zerspantechnik": kc = kc1.1 * h^-mc and
    // Pc = ap * ae * vf * kc / (60 * 10^6) kW; the mean chip of a side cut is hm = 2 ae fz sin(kappa) / (D phi).
    const ae = 4, ap = 6, fz = 0.08, rpm = 4000
    const feed = fz * 3 * rpm
    const phi = Math.acos(1 - (2 * ae) / 10)
    const hm = (2 * ae * fz) / (10 * phi)
    const kc = material.kc11 * Math.pow(hm, -material.mc)
    const hand = (ap * ae * feed * kc) / 60e6
    const load = millingLoad(material, cutter, 10, ap, ae, fz, feed, rpm, (Math.PI * 10 * rpm) / 1000)
    expect(load.powerKw).toBeCloseTo(hand, 12)
    expect(load.hm).toBeCloseTo(hm, 12)
  })

  test("the per-move load at the nominal engagement is the nominal load (cuttingData reproduced)", () => {
    const d = cuttingData({ material, cutter, cut: "rough-side", machine })
    const l = stepLoad({ material, cutter, machine, rpm: d.rpm }, d.ae, d.ap, d.feed)
    // `cuttingData` rounds its answer to 3 decimals; the factored function gives the same number.
    expect(l.powerKw / 0.8).toBeCloseTo(d.powerKw, 2)
    expect(l.torqueNm).toBeCloseTo(d.torqueNm, 2)
    expect(Math.round(l.forceN)).toBe(d.forceN)
  })

  test("the load rises with the feed and with the engagement", () => {
    const s = { material, cutter, machine, rpm: 5000 }
    expect(stepLoad(s, 3, 5, 1500).powerKw).toBeGreaterThan(stepLoad(s, 3, 5, 800).powerKw)
    expect(stepLoad(s, 6, 5, 1000).powerKw).toBeGreaterThan(stepLoad(s, 3, 5, 1000).powerKw)
    expect(stepLoad(s, 3, 5, 1000).chipMax).toBeGreaterThan(0)
  })
})
