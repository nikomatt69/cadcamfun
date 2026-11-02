import { expect, test, setDefaultTimeout } from "bun:test"
import { booleanStrict } from "./boolean.ts"
import { frame, makeCylinder, makeSphere, massProperties, validateBrep } from "./index.ts"
import { fromFrame } from "./math.ts"
import { coaxialSphereCylinderRings } from "./intersect.ts"

setDefaultTimeout(120_000)

for (const delta of [1e-6, 1e-5, 1e-4, 1e-3, 0.1]) {
  test(`coaxial sphere/cylinder delta ${delta}: strict results match sectional integrals in both orders`, () => {
    const radius = 3 + delta
    const cylinder = makeCylinder(3, 10)
    const sphere = makeSphere(radius, frame({ x: 0, y: 0, z: 5 }))
    // Integrate pi * min(3^2, R^2-z^2) over the sphere's height.
    const sphereVolume = 4 * Math.PI * radius ** 3 / 3
    const outside = 4 * Math.PI * ((radius - 3) * (radius + 3)) ** 1.5 / 3
    const intersection = sphereVolume - outside
    const cylinderVolume = 90 * Math.PI
    for (const reverse of [false, true]) {
      const [a, b] = reverse ? [sphere, cylinder] : [cylinder, sphere]
      for (const op of ["union", "intersect", "subtract"] as const) {
        const result = booleanStrict(a!, b!, op)
        const expected = op === "union" ? cylinderVolume + outside : op === "intersect" ? intersection : reverse ? outside : cylinderVolume - intersection
        expect(result.warnings).toEqual([])
        expect(validateBrep(result.brep).issues).toEqual([])
        expect(Math.abs(massProperties(result.brep).volume - expected)).toBeLessThan(2e-6)
      }
    }
  })
}

test("coaxial rings preserve rigid placement and independent sphere seam orientation", () => {
  const placement = frame({ x: 12, y: -4, z: 8 }, { x: 1, y: 2, z: 3 })
  const cylinder = makeCylinder(3, 10, placement)
  const radius = 3.001
  const sphere = makeSphere(radius, frame(fromFrame(placement, 0, 0, 5), placement.x, placement.z))
  const result = booleanStrict(cylinder, sphere, "intersect")
  const expected = 4 * Math.PI * (radius ** 3 - ((radius - 3) * (radius + 3)) ** 1.5) / 3
  expect(validateBrep(result.brep).issues).toEqual([])
  expect(result.warnings).toEqual([])
  expect(Math.abs(massProperties(result.brep).volume - expected)).toBeLessThan(2e-6)
})

test("analytic ring recognition refuses an off-axis sphere and tangency, separates contained surfaces", () => {
  const cylinder = makeCylinder(3, 10).faces[0]!.surface
  const sphere = (r: number, x = 0) => makeSphere(r, frame({ x, y: 0, z: 5 })).faces[0]!.surface
  expect(coaxialSphereCylinderRings(cylinder, sphere(3.001, 1e-7))).toBeUndefined()
  expect(coaxialSphereCylinderRings(cylinder, sphere(3))).toBeUndefined()
  expect(coaxialSphereCylinderRings(cylinder, sphere(2.99))).toEqual([])
})

test("a sphere outside the cylinder's axial span does not inject untrimmed rings", () => {
  const cylinder = makeCylinder(3, 10)
  const sphere = makeSphere(3.001, frame({ x: 0, y: 0, z: 15 }))
  const result = booleanStrict(cylinder, sphere, "intersect")
  expect(result.brep.faces).toHaveLength(0)
})
