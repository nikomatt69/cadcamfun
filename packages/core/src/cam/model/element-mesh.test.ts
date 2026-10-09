import { describe, expect, test } from "bun:test"
import { elementMesh, meshBounds, volumeOf } from "./element-mesh.ts"

const near = (a: number, b: number, rel = 0.01): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-9)
const vol = (e: Record<string, unknown>, tol = 0.005) => volumeOf(elementMesh(e, tol)!)

describe("element meshes are closed, outward and the right size", () => {
  test("cube, cylinder, cone, sphere, torus match their formulas", () => {
    near(vol({ type: "cube", width: 20, height: 30, depth: 40 }), 24000, 1e-9)
    near(vol({ type: "cylinder", radius: 10, height: 25 }), Math.PI * 100 * 25, 0.002)
    near(vol({ type: "cone", radius: 10, height: 30 }), (Math.PI * 100 * 30) / 3, 0.002)
    near(vol({ type: "sphere", radius: 12 }), (4 / 3) * Math.PI * 1728, 0.002)
    near(vol({ type: "torus", radius: 20, tubeRadius: 4 }), 2 * Math.PI * Math.PI * 20 * 16, 0.004)
  })

  test("pyramid, prism, hemisphere, ellipsoid, capsule", () => {
    near(vol({ type: "pyramid", baseWidth: 20, baseDepth: 30, height: 15 }), (20 * 30 * 15) / 3, 1e-9)
    near(vol({ type: "prism", radius: 10, sides: 6, height: 5 }), 6 * 0.5 * 100 * Math.sin(Math.PI / 3) * 5, 1e-9)
    near(vol({ type: "hemisphere", radius: 10 }), (2 / 3) * Math.PI * 1000, 0.006)
    near(vol({ type: "ellipsoid", radiusX: 10, radiusY: 6, radiusZ: 4 }), (4 / 3) * Math.PI * 240, 0.004)
    near(vol({ type: "capsule", radius: 5, height: 20, direction: "z" }), Math.PI * 25 * 20 + (4 / 3) * Math.PI * 125, 0.006)
  })

  test("orientation: cylinder and cone stand on Z, hemisphere points where direction says, capsule lies along its direction", () => {
    const b = (e: Record<string, unknown>) => meshBounds(elementMesh(e)!)
    expect(b({ type: "cylinder", radius: 3, height: 10, z: 5 })).toMatchObject({ min: [expect.anything(), expect.anything(), 0], max: [expect.anything(), expect.anything(), 10] })
    const cone = elementMesh({ type: "cone", radius: 6, height: 10 })!
    const top = meshBounds(cone).max[2]
    expect(top).toBeCloseTo(5, 9)
    const up = b({ type: "hemisphere", radius: 4 }), down = b({ type: "hemisphere", radius: 4, direction: "down" })
    expect(up.min[2]).toBeCloseTo(0, 9); expect(up.max[2]).toBeCloseTo(4, 9)
    expect(down.min[2]).toBeCloseTo(-4, 9); expect(down.max[2]).toBeCloseTo(0, 9)
    const cx = b({ type: "capsule", radius: 2, height: 10, direction: "x" })
    expect(cx.max[0]! - cx.min[0]!).toBeCloseTo(14, 6); expect(cx.max[1]! - cx.min[1]!).toBeCloseTo(4, 2)
    const cy = b({ type: "capsule", radius: 2, height: 10 })
    expect(cy.max[1]! - cy.min[1]!).toBeCloseTo(14, 6); expect(cy.max[2]! - cy.min[2]!).toBeCloseTo(4, 2)
  })

  test("extrusion grows from its z; rect, circle and profile; a revolution closes against its axis", () => {
    near(vol({ type: "extrusion", shape: "rect", width: 20, height: 10, depth: 7, z: 3 }), 1400, 1e-9)
    expect(meshBounds(elementMesh({ type: "extrusion", shape: "rect", width: 20, height: 10, depth: 7, z: 3 })!).min[2]).toBe(3)
    near(vol({ type: "extrusion", shape: "circle", radius: 8, depth: 5 }), Math.PI * 64 * 5, 0.003)
    near(vol({ type: "extrusion", profile: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], depth: 2 }), 200, 1e-9)
    // L profile (concave) keeps its area.
    near(vol({ type: "extrusion", profile: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }], depth: 4 }), 500 * 4, 1e-9)
    // A cup: open profile from r=10 at the bottom, wall up to h=20.
    const lathe = { type: "revolution", axis: "y", profile: [{ x: 10, y: 0 }, { x: 10, y: 20 }] }
    near(vol(lathe), Math.PI * 100 * 20, 0.003)
    const stood = meshBounds(elementMesh(lathe)!)
    expect(stood.min[2]).toBeCloseTo(0, 9); expect(stood.max[2]).toBeCloseTo(20, 9)
    const lying = meshBounds(elementMesh({ ...lathe, axis: "x" })!)
    expect(lying.min[0]).toBeCloseTo(0, 9); expect(lying.max[0]).toBeCloseTo(20, 9)
    expect(lying.max[1]).toBeCloseTo(10, 2); expect(lying.max[2]).toBeCloseTo(10, 2)
  })

  test("the gizmo transform turns about the bounding-box centre; scale and translate act too", () => {
    const turned = meshBounds(elementMesh({ type: "cube", width: 20, height: 10, depth: 4, rotation: { x: 0, y: 0, z: 90 } })!)
    expect(turned.max[0]! - turned.min[0]!).toBeCloseTo(10, 9)
    expect(turned.max[1]! - turned.min[1]!).toBeCloseTo(20, 9)
    const scaled = elementMesh({ type: "cube", width: 10, height: 10, depth: 10, scale: { x: 2, y: 1, z: 1 }, translateZ: 5 })!
    near(volumeOf(scaled), 2000, 1e-9)
    expect(meshBounds(scaled).min[2]).toBeCloseTo(0, 9)
    near(volumeOf(elementMesh({ type: "cube", width: 10, height: 10, depth: 10, scale: { x: -1, y: 1, z: 1 } })!), 1000, 1e-9)
  })

  test("a tolerance gives a rounder cylinder; shapes that are not plain solids are not faked", () => {
    const coarse = vol({ type: "cylinder", radius: 50, height: 1 }, 0.5)
    const fine = vol({ type: "cylinder", radius: 50, height: 1 }, 0.001)
    expect(Math.abs(fine - Math.PI * 2500)).toBeLessThan(Math.abs(coarse - Math.PI * 2500))
    for (const type of ["spring", "bolt", "text3d", "sweep", "loft", "wall"]) expect(elementMesh({ type })).toBeUndefined()
    expect(elementMesh({ type: "revolution", profile: [{ x: -3, y: 0 }, { x: 3, y: 4 }] })).toBeUndefined()
  })
})

describe("a spur gear is a real solid", () => {
  test("it is meshed from its involute outline with its bore cut through, standing on Z and centred on its thickness", () => {
    const gear = { type: "gear", moduleValue: 2, teeth: 20, thickness: 10, pressureAngle: 20, holeDiameter: 10 }
    const mesh = elementMesh(gear)!
    expect(mesh).toBeDefined()
    const b = meshBounds(mesh)
    expect(b.min[2]).toBeCloseTo(-5, 9); expect(b.max[2]).toBeCloseTo(5, 9)
    expect(b.max[0]).toBeCloseTo(22, 1); expect(b.min[0]).toBeCloseTo(-22, 1)
    const solid = elementMesh({ ...gear, holeDiameter: 0 })!
    // The bore removes about pi r^2 t of material (the cylinder is a polygon, so a little less).
    const removed = volumeOf(solid) - volumeOf(mesh)
    expect(removed).toBeGreaterThan(Math.PI * 25 * 10 * 0.97)
    expect(removed).toBeLessThan(Math.PI * 25 * 10 * 1.01)
    // Between the root and the tip disc.
    expect(volumeOf(solid)).toBeGreaterThan(Math.PI * 17.5 * 17.5 * 10)
    expect(volumeOf(solid)).toBeLessThan(Math.PI * 22 * 22 * 10)
  })

  test("a bore wider than the root circle, or too few teeth, is no gear", () => {
    expect(elementMesh({ type: "gear", moduleValue: 2, teeth: 20, holeDiameter: 40 })).toBeUndefined()
    expect(elementMesh({ type: "gear", moduleValue: 2, teeth: 3 })).toBeUndefined()
  })
})
