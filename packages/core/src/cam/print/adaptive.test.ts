import { describe, expect, test } from "bun:test"
import { adaptiveStack } from "./adaptive.ts"
import { printBodies } from "./bodies.ts"
import { slicePrint } from "./index.ts"
import type { Mesh64 } from "../model/element-mesh.ts"

const sphere = (nu: number, nv: number, r: number, cz = 0): Mesh64 => {
  const pos: number[] = [0, 0, cz - r]
  for (let j = 1; j < nv; j++) for (let i = 0; i < nu; i++) {
    const phi = (Math.PI * j) / nv, th = (2 * Math.PI * i) / nu
    pos.push(r * Math.sin(phi) * Math.cos(th), r * Math.sin(phi) * Math.sin(th), cz - r * Math.cos(phi))
  }
  pos.push(0, 0, cz + r)
  const ring = (j: number, i: number) => 1 + (j - 1) * nu + (i % nu)
  const idx: number[] = []
  for (let i = 0; i < nu; i++) idx.push(0, ring(1, i + 1), ring(1, i))
  for (let j = 1; j < nv - 1; j++) for (let i = 0; i < nu; i++) {
    const a = ring(j, i), b = ring(j, i + 1), c = ring(j + 1, i), d = ring(j + 1, i + 1)
    idx.push(a, b, d, a, d, c)
  }
  const top = 1 + (nv - 1) * nu
  for (let i = 0; i < nu; i++) idx.push(top, ring(nv - 1, i), ring(nv - 1, i + 1))
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) }
}

const settings = { layerHeight: 0.2, printSpeed: 60, printTemperature: 200, bedTemperature: 60, extrusionWidth: 0.4, filamentDiameter: 1.75, infillDensity: 10, infillPattern: "lines", shellCount: 2, supportType: "none", nozzleDiameter: 0.4, bedWidth: 220, bedDepth: 220 }

describe("adaptive layer height", () => {
  const ball = sphere(96, 64, 20, 20)

  test("a sphere gets thick layers at the equator and thin ones at the poles, inside the tolerance", () => {
    const s = adaptiveStack([ball], 40, 0.2, { min: 0.08, max: 0.28, tolerance: 0.04 })
    const mid = s.heights.filter((_, i) => Math.abs(s.tops[i]! - 20) < 2)
    const pole = s.heights.filter((_, i) => s.tops[i]! > 1 && s.tops[i]! < 3)
    expect(Math.min(...mid)).toBeGreaterThan(0.2)
    expect(Math.max(...pole)).toBeLessThanOrEqual(0.12)
    // The layers add up to the height, rise strictly, and the stair-step error is held to the tolerance (plus quantisation).
    expect(s.tops[s.tops.length - 1]).toBe(40)
    expect(s.tops.every((t, i) => i === 0 || t > s.tops[i - 1]!)).toBe(true)
    expect(s.heights.reduce((a, b) => a + b, 0)).toBeCloseTo(40, 9)
    expect(s.worstDeviation).toBeLessThan(0.04 * 1.25)
    // Only the polar caps, where even the thinnest layer is too coarse, exceed it - and they are reported as such.
    expect(s.minLimited).toBeGreaterThan(0)
    expect(s.worstMinLimitedDeviation).toBeGreaterThan(0.04)
    // A uniform 0.08 stack would take 500 layers; the adaptive one takes far fewer, and more than a uniform 0.28 one.
    expect(s.tops.length).toBeLessThan(500)
    expect(s.tops.length).toBeGreaterThan(40 / 0.28)
  })

  test("a straight-walled part gets the thickest layer and ends exactly on its flat top", () => {
    const cube = printBodies([{ id: "c", type: "cube", x: 0, y: 0, z: 5, width: 20, height: 20, depth: 10 }] as never).meshes[0]!
    const s = adaptiveStack([cube], 10, 0.2, { min: 0.08, max: 0.28 })
    expect(s.heights.slice(1, -2).every((h) => Math.abs(h - 0.28) < 1e-9)).toBe(true)
    expect(s.tops[s.tops.length - 1]).toBe(10)
    expect(s.worstDeviation).toBe(0)
  })

  test("a flat shelf in the middle of a part is a layer boundary", () => {
    const stepped = printBodies([
      { id: "a", type: "cube", x: 0, y: 0, z: 3.65, width: 20, height: 20, depth: 7.3 },
      { id: "b", type: "cube", x: 0, y: 0, z: 9.15, width: 10, height: 10, depth: 5.5 }
    ] as never).meshes[0]!
    const s = adaptiveStack([stepped], 11.9, 0.2, { min: 0.08, max: 0.28 })
    // The shelf of the wide block is at z = 7.3 on the flat top that is not hidden under the narrow one.
    expect(s.tops.some((t) => Math.abs(t - 7.3) < 1e-9)).toBe(true)
  })

  test("bad bounds are refused", () => {
    expect(() => adaptiveStack([ball], 40, 0.2, { min: 0.3, max: 0.1 })).toThrow()
    expect(() => adaptiveStack([ball], 0, 0.2)).toThrow()
  })

  test("the slicer prints an adaptive stack: the layers it reports, no failed check, fewer layers than the finest uniform one", () => {
    const uniform = slicePrint([ball], { ...settings, layerHeight: 0.1, firstLayerHeight: 0.2 } as never)
    const adaptive = slicePrint([ball], settings as never, { adaptive: { min: 0.1, max: 0.28, tolerance: 0.05 } })
    expect(adaptive.layers.length).toBeLessThan(uniform.layers.length)
    expect(new Set(adaptive.layers.map((l) => l.height.toFixed(2))).size).toBeGreaterThan(3)
    expect(adaptive.checks.filter((c) => c.status !== "passed")).toEqual([])
    expect(adaptive.gcode).toContain("Adaptive layers")
    expect(adaptive.stats.size.z).toBeCloseTo(40, 1)
  }, 120_000)
})
