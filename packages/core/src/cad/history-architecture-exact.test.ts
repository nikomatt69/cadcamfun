import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuild, type Feature, type History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties, validateBrep } from "./brep/index.ts"
import { meshVolume } from "./solid.ts"

setDefaultTimeout(60_000)

const part = (element: string, params: Record<string, number>, options: Record<string, string> = {}, rotation?: [number, number, number]): History => ({
  parameters: {},
  features: [{ id: "p", type: "primitive", element, params, options, at: [5, -7, 3], operation: "new", ...(rotation === undefined ? {} : { rotation }) } as Feature]
})

/** Volume and centroid of the mesh rebuild (signed tetrahedra about the origin). */
const meshMoments = (h: History): { volume: number; centroid: [number, number, number] } => {
  let volume = 0
  const c: [number, number, number] = [0, 0, 0]
  for (const { mesh } of rebuild(h).bodies) {
    const P = mesh.positions, I = mesh.indices
    for (let t = 0; t < I.length; t += 3) {
      const a = [P[I[t]! * 3]!, P[I[t]! * 3 + 1]!, P[I[t]! * 3 + 2]!], b = [P[I[t + 1]! * 3]!, P[I[t + 1]! * 3 + 1]!, P[I[t + 1]! * 3 + 2]!], d = [P[I[t + 2]! * 3]!, P[I[t + 2]! * 3 + 1]!, P[I[t + 2]! * 3 + 2]!]
      const v = (a[0]! * (b[1]! * d[2]! - b[2]! * d[1]!) - a[1]! * (b[0]! * d[2]! - b[2]! * d[0]!) + a[2]! * (b[0]! * d[1]! - b[1]! * d[0]!)) / 6
      volume += v
      for (let k = 0; k < 3; k++) c[k]! += (v * (a[k]! + b[k]! + d[k]!)) / 4
    }
  }
  return { volume, centroid: [c[0]! / volume, c[1]! / volume, c[2]! / volume] }
}

const exactOf = (h: History) => {
  const bodies = rebuildExact(h).bodies
  expect(bodies).toHaveLength(1)
  expect(bodies[0]!.brep, "the element has an exact model").toBeDefined()
  return bodies[0]!.brep!
}

describe("architecture elements are exact solids that sit where the mesh catalogue puts them", () => {
  test("translated capsules keep their centre in every direction, with and without history rotation", () => {
    for (const direction of ["x", "y", "z"]) for (const rotation of [undefined, [20, 30, 40] as [number, number, number]]) {
      const history = part("capsule", { radius: 2, height: 10 }, { direction }, rotation)
      const mass = massProperties(exactOf(history))
      const mesh = meshMoments(history)
      expect(mass.centroid.x).toBeCloseTo(5, 4)
      expect(mass.centroid.y).toBeCloseTo(-7, 4)
      expect(mass.centroid.z).toBeCloseTo(3, 4)
      expect(Math.hypot(mass.centroid.x - mesh.centroid[0], mass.centroid.y - mesh.centroid[1], mass.centroid.z - mesh.centroid[2])).toBeLessThan(0.05)
    }
  })
  // Analytic volumes of the catalogue measures; a column or a knob is round, so the mesh (faceted) is a little under the exact one.
  const cases: ReadonlyArray<{ name: string; element: string; params: Record<string, number>; options?: Record<string, string>; volume: number; tolerance: number }> = [
    { name: "wall", element: "wall", params: { length: 120, thickness: 6, height: 40 }, volume: 120 * 6 * 40, tolerance: 1e-6 },
    { name: "floor (depth falls back to length)", element: "floor", params: { width: 80, length: 60, thickness: 3 }, volume: 80 * 60 * 3, tolerance: 1e-6 },
    { name: "window", element: "window", params: { width: 20, thickness: 1, height: 25 }, volume: 20 * 25, tolerance: 1e-6 },
    { name: "plain column", element: "column", params: { radius: 5, height: 60 }, volume: Math.PI * 25 * 60, tolerance: 1e-6 },
    { name: "gable roof", element: "roof", params: { width: 100, depth: 80, height: 30 }, volume: (100 * 80 * 30) / 2, tolerance: 1e-6 },
    { name: "flat roof", element: "roof", params: { width: 100, depth: 80, height: 30 }, options: { style: "flat" }, volume: (100 * 80 * 30) / 4, tolerance: 1e-6 },
    // 5 steps: the flight is solid down to the base, so each step column is depth/steps wide and (k + 1) height/steps tall.
    { name: "stair", element: "stair", params: { width: 40, height: 30, depth: 50, steps: 5 }, volume: 40 * (50 / 5) * (30 / 5) * (1 + 2 + 3 + 4 + 5), tolerance: 1e-6 }
  ]

  for (const c of cases) {
    test(`${c.name}: analytic volume, valid, and the mesh's own centroid, upright and turned`, () => {
      for (const rotation of [undefined, [20, 30, 40] as [number, number, number]]) {
        const h = part(c.element, c.params, c.options, rotation)
        const brep = exactOf(h)
        const mass = massProperties(brep)
        expect(Math.abs(mass.volume - c.volume) / c.volume).toBeLessThan(c.tolerance)
        expect(validateBrep(brep).valid).toBe(true)
        const mesh = meshMoments(h)
        expect(Math.abs(mesh.volume - c.volume) / c.volume).toBeLessThan(c.element === "column" ? 5e-3 : 1e-6)
        const off = Math.hypot(mass.centroid.x - mesh.centroid[0], mass.centroid.y - mesh.centroid[1], mass.centroid.z - mesh.centroid[2])
        expect(off).toBeLessThan(0.05)
      }
    })
  }

  test("a styled column is a turned profile with a base and a capital, its mesh a faceted copy of it", () => {
    for (const style of ["doric", "ionic", "corinthian"]) {
      const h = part("column", { radius: 5, height: 60 }, { style })
      const brep = exactOf(h)
      const mass = massProperties(brep)
      const plain = Math.PI * 25 * 60
      expect(mass.volume).toBeGreaterThan(plain) // the flare adds material to the shaft
      expect(validateBrep(brep).valid).toBe(true)
      const mesh = meshMoments(h)
      expect(Math.abs(mesh.volume - mass.volume) / mass.volume).toBeLessThan(0.02)
      expect(Math.abs(mesh.centroid[2] - mass.centroid.z)).toBeLessThan(0.3)
    }
  })

  test("a door is its leaf with the knob joined on; a knob that clears the leaf leaves the leaf alone", () => {
    const door = part("door", { width: 30, height: 60, thickness: 3 })
    const brep = exactOf(door)
    const mass = massProperties(brep)
    expect(mass.volume).toBeGreaterThan(30 * 60 * 3)
    expect(validateBrep(brep).valid).toBe(true)
    expect(Math.abs(mass.volume - meshMoments(door).volume)).toBeLessThan(0.01 * mass.volume)
    // Knob radius 0.08 x 10 = 0.8 does not reach back to a 10 mm thick leaf (0.6 x 10 = 6 out of its centre line, 5 from the face).
    const thick = exactOf(part("door", { width: 10, height: 20, thickness: 10 }))
    expect(massProperties(thick).volume).toBeCloseTo(10 * 20 * 10, 6)
  })

  test("an ellipsoid is still refused with its reason, never approximated", () => {
    const r = rebuildExact(part("ellipsoid", { radiusX: 10, radiusY: 6, radiusZ: 4 })).bodies[0]!
    expect(r.brep).toBeUndefined()
    expect(r.reason).toContain("ellipsoid")
  })
})
