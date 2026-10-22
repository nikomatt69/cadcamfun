import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { massProperties, meshEdgeDefects } from "./brep/index.ts"
import { rebuildExact } from "./history-brep.ts"
import { rebuild } from "./history.ts"
import { model } from "./script.ts"
import { meshVolume } from "./solid.ts"

setDefaultTimeout(120_000)

/** A 40 x 40 x 12 plate with a spherical cap of radius 8 on its top face, then the concave fillet of its rim. */
const capWithFillet = (): ReturnType<ReturnType<typeof model>["build"]> => {
  const m = model()
  m.primitive({ element: "cube", params: { width: 40, height: 40, depth: 12 }, at: [0, 0, -6] })
  m.primitive({ element: "sphere", params: { radius: 8 }, at: [0, 0, 0] })
  m.fillet({ radius: 1, edges: { kind: "concave", curved: true } })
  return m.build()
}

describe("a curved fillet in the parametric history", () => {
  test("the concave rim of a spherical cap is blended, not reported as an unmatched selection", () => {
    const history = capWithFillet()
    const result = rebuild(history)
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([])
    expect(result.bodies).toHaveLength(1)
    // The derived mesh is the blended solid: the rolling ball fills the concave foot between plate and cap.
    const volume = meshVolume(result.bodies[0]!.mesh)
    const hemisphere = (2 / 3) * Math.PI * 8 ** 3
    expect(volume).toBeGreaterThan(40 * 40 * 12 + hemisphere)
    const defects = meshEdgeDefects(result.bodies[0]!.mesh.indices)
    expect(defects.open).toBe(0)
    expect(defects.nonManifold).toBe(0)
    expect(defects.misoriented).toBe(0)
  })

  test("the mesh is the tessellation of the same exact body, within its chord tolerance", () => {
    const history = capWithFillet()
    const result = rebuild(history)
    const exact = rebuildExact(history, result)
    const body = exact.bodies[0]!.brep
    expect(body).toBeDefined()
    expect(body!.faces.some((face) => face.surface.kind === "torus")).toBe(true)
    const exactVolume = Math.abs(massProperties(body!).volume)
    const mesh = Math.abs(meshVolume(result.bodies[0]!.mesh))
    expect(Math.abs(mesh - exactVolume) / exactVolume).toBeLessThan(0.002)
  })

  test("the concave foot of a cone on the plate uses the same exact torus", () => {
    const m = model()
    m.primitive({ element: "cube", params: { width: 40, height: 40, depth: 12 }, at: [0, 0, -6] })
    m.primitive({ element: "cone", params: { radius: 10, height: 12 }, at: [0, 0, 6] })
    m.fillet({ radius: 1, edges: { kind: "concave", curved: true } })
    const history = m.build()
    const result = rebuild(history)
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([])
    const exact = rebuildExact(history, result)
    const body = exact.bodies[0]!.brep
    expect(body).toBeDefined()
    expect(body!.faces.some((face) => face.surface.kind === "torus")).toBe(true)
    const exactVolume = Math.abs(massProperties(body!).volume)
    const mesh = Math.abs(meshVolume(result.bodies[0]!.mesh))
    expect(Math.abs(mesh - exactVolume) / exactVolume).toBeLessThan(0.002)
    const alpha = Math.atan(-10 / 12)
    const radius = 1
    const q = 10 + radius * (1 + Math.sin(alpha)) / Math.cos(alpha)
    const arc = (z: number): number => {
      const u = z - radius
      const span = Math.sqrt(radius * radius - u * u)
      return (q * q + radius * radius) * u - u ** 3 / 3 - q * (u * span + radius * radius * Math.asin(u / radius))
    }
    const contactZ = radius * (1 + Math.sin(alpha))
    const slope = Math.tan(alpha)
    const contactRho = 10 + contactZ * slope
    const added = Math.PI * (arc(contactZ) - arc(0) - (contactRho ** 3 - 1000) / (3 * slope))
    expect(exactVolume).toBeCloseTo(40 * 40 * 12 + Math.PI * 100 * 12 / 3 + added, 5)
  })

  test("a history without a curved rim keeps the previous mesh blend path", () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 40, 25), { depth: 10 })
    m.fillet({ radius: 1 })
    const history = m.build()
    const result = rebuild(history)
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([])
    // The mesh path still rounds the twelve edges: less material than the sharp box, and the same solid as the exact model.
    const mesh = Math.abs(meshVolume(result.bodies[0]!.mesh))
    expect(mesh).toBeLessThan(10_000)
    const exact = rebuildExact(history, result)
    const body = exact.bodies[0]!.brep
    expect(body).toBeDefined()
    const exactVolume = Math.abs(massProperties(body!).volume)
    expect(Math.abs(mesh - exactVolume) / exactVolume).toBeLessThan(0.002)
  })
})
