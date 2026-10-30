import { describe, expect, test } from "bun:test"
import { slicePrint } from "./index.ts"

const box = (w: number, d: number, h: number) => ({
  positions: Float64Array.from([0, 0, 0, w, 0, 0, w, d, 0, 0, d, 0, 0, 0, h, w, 0, h, w, d, h, 0, d, h]),
  indices: Uint32Array.from([0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7])
})
const soup = (m: { positions: Float64Array; indices: Uint32Array }) => {
  const positions = new Float64Array(m.indices.length * 3)
  m.indices.forEach((v, i) => positions.set(m.positions.subarray(v * 3, v * 3 + 3), i * 3))
  return { positions, indices: Uint32Array.from({ length: m.indices.length }, (_, i) => i) }
}
const settings = { layerHeight: 0.2, printSpeed: 60, printTemperature: 200, bedTemperature: 60, extrusionWidth: 0.4, filamentDiameter: 1.75, infillDensity: 20, infillPattern: "grid", shellCount: 2, supportType: "none", nozzleDiameter: 0.4, bedWidth: 220, bedDepth: 220 }

describe("slicing a damaged mesh", () => {
  test("a box with a missing quad and soup vertices is refused as it is and printed once repaired", () => {
    const whole = box(20, 20, 8)
    // Drop the two triangles of the +X face (triangles 6 and 7), then explode into soup.
    const damaged = soup({ positions: whole.positions, indices: Uint32Array.from(Array.from(whole.indices).filter((_, i) => Math.floor(i / 3) !== 6 && Math.floor(i / 3) !== 7)) })
    expect(() => slicePrint([damaged], settings)).toThrow("not a closed orientable manifold")
    const result = slicePrint([damaged], settings, { repair: true })
    expect(result.repairs[0]!.holesFilled).toBe(1)
    expect(result.warnings.join(" ")).toContain("repaired before slicing")
    expect(result.stats.size.x).toBeCloseTo(20 - 0.4, 0)
    expect(result.stats.size.z).toBeCloseTo(8, 1)
    expect(result.checks.every((c) => c.status === "passed")).toBe(true)
  })

  test("a mesh that cannot be repaired still stops the slice with the reason", () => {
    const m = box(10, 10, 10)
    const fin = { positions: Float64Array.from([...m.positions, 5, -10, 5]), indices: Uint32Array.from([...m.indices, 0, 1, 8]) }
    expect(() => slicePrint([fin], settings, { repair: true })).toThrow("cannot be repaired")
  })
})
