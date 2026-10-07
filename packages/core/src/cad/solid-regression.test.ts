import { describe, expect, test } from "bun:test"
import { meshBounds, meshOf, meshVolume, solidBounds, type Solid } from "./solid.ts"
import { triangulateRing } from "./triangulate.ts"

const origin = { x: 17, y: -23, z: 31 }
const axes = ["x", "y", "z"] as const

const expectBounds = (solid: Solid) => {
  const actual = meshBounds(meshOf(solid))
  const expected = solidBounds(solid)
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    expect(actual[key]).toBeCloseTo(expected[key], 4)
  }
}

describe("solid geometry regression", () => {
  test("concave caps cover only the L-shaped profile", () => {
    const profile = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 4 }, { x: 0, y: 4 }]
    for (const ring of [profile, [...profile].reverse()]) {
      const triangles = triangulateRing(ring)
      let area = 0
      for (const [ia, ib, ic] of triangles) {
        const a = ring[ia]!, b = ring[ib]!, c = ring[ic]!
        area += Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2
        const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3
        expect(x <= 1 || y <= 1).toBe(true)
      }
      expect(area).toBe(7)
      expect(meshVolume(meshOf({ _tag: "Extrude", profile: ring, height: 3 }))).toBeCloseTo(21, 5)
    }
  })

  test("partial revolve has tight sweep bounds and outward caps", () => {
    const profile = [{ x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 2, y: 3 }]
    for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI]) {
      for (const ring of [profile, [...profile].reverse()]) {
        const solid: Solid = { _tag: "Revolve", profile: ring, angle, segments: 128 }
        expectBounds(solid)
        expect(Math.abs(meshVolume(meshOf(solid)) / (18 * Math.abs(angle)) - 1)).toBeLessThan(0.001)
      }
    }
  })

  test("curved mesh resolution honors requested tolerance instead of fixed segments", () => {
    const solid: Solid = { _tag: "Cylinder", origin, radius: 100, height: 7, segments: 3 }
    for (const tolerance of [1, 0.1, 0.001]) {
      const mesh = meshOf(solid, tolerance)
      const count = (mesh.positions.length / 3 - 2) / 2
      expect(100 * (1 - Math.cos(Math.PI / count))).toBeLessThanOrEqual(tolerance)
    }
    expect(meshOf(solid, 0.001).indices.length).toBeGreaterThan(meshOf(solid, 1).indices.length)
  })

  test("invalid and unachievable tolerance fails explicitly", () => {
    const solid: Solid = { _tag: "Sphere", center: origin, radius: 100, rings: 2 }
    for (const tolerance of [0, -1, NaN, Infinity, 1e-20]) {
      expect(() => meshOf(solid, tolerance)).toThrow(RangeError)
    }
  })

  for (const axis of axes) {
    test(`cylinder and cone honor ${axis} axis and outward winding`, () => {
      const cylinder: Solid = { _tag: "Cylinder", origin, radius: 3, height: 7, segments: 128, axis }
      expectBounds(cylinder)
      expect(meshVolume(meshOf(cylinder))).toBeCloseTo(Math.PI * 9 * 7, 0)
      const cone: Solid = { _tag: "Cone", origin, baseRadius: 3, topRadius: 1, height: 7, segments: 128, axis }
      expectBounds(cone)
      expect(meshVolume(meshOf(cone))).toBeCloseTo(Math.PI * 7 * 13 / 3, 0)
    })

    test(`torus has tube thickness, analytic bounds and positive volume on ${axis}`, () => {
      const torus: Solid = { _tag: "Torus", center: origin, majorRadius: 8, minorRadius: 2, majorSegments: 128, minorSegments: 64, axis }
      expectBounds(torus)
      const volume = meshVolume(meshOf(torus))
      const analytic = 2 * Math.PI ** 2 * 8 * 4
      expect(Math.abs(volume / analytic - 1)).toBeLessThan(0.003)
      const rotated = { ...torus, rotation: 0.37 }
      expect(solidBounds(rotated)).toEqual(solidBounds(torus))
      expect(Math.abs(meshVolume(meshOf(rotated)) / analytic - 1)).toBeLessThan(0.003)
    })
  }

  for (const height of [-5, 5]) {
    for (const reverse of [false, true]) {
      test(`extrusion height ${height}, reversed ${reverse} stays outward and bounded`, () => {
        const profile = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]
        const solid: Solid = { _tag: "Extrude", profile: reverse ? profile.reverse() : profile, height, origin }
        expectBounds(solid)
        expect(meshVolume(meshOf(solid))).toBeCloseTo(60, 5)
      })
    }
  }
})
