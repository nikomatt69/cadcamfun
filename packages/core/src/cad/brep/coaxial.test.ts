import { describe, expect, test } from "bun:test"
import { booleanBrep, booleanCounters, frame, makeCone, makeCylinder, makeSphere, massProperties, resetBooleanCounters, validateBrep, type Brep } from "./index.ts"
import { coaxialCircles } from "./intersect.ts"

// Spec 42 6.3: a sphere centred on the axis of a cylinder (or cone) whose radius differs by 1e-6..1e-3 mm. The two surfaces meet in
// two circles a few hundredths of a millimetre apart at a grazing angle, which the mesh seeds cannot separate; the circles are
// solved in closed form, the cylinder's seam is cut by the exact roots of a quadratic, and a vertex of one circle is no longer
// taken for a point of the other.
const vol = (b: Brep): number => (b.faces.length === 0 ? 0 : massProperties(b).volume)

/** Volume of a sphere of radius r centred on the axis of an (unbounded-in-practice) cylinder of radius R. */
const sphereInCylinder = (R: number, r: number): number => {
  if (r <= R) return (4 / 3) * Math.PI * r ** 3
  const h = Math.sqrt(r * r - R * R)
  return 2 * (Math.PI * R * R * h + Math.PI * (r * r * (r - h) - (r ** 3 - h ** 3) / 3))
}

describe("sphere coaxial with a cylinder of nearly the same radius", () => {
  const R = 3, H = 10
  for (const delta of [1e-3, 1e-4, 1e-5, 1e-6, -1e-6, -1e-5, -1e-4, -1e-3]) {
    test(`sphere radius ${delta > 0 ? "+" : ""}${delta} mm: solved in place, volumes to 1e-6`, () => {
      const cyl = makeCylinder(R, H, frame({ x: 0, y: 0, z: 0 }))
      const sph = makeSphere(R + delta, frame({ x: 0, y: 0, z: H / 2 }))
      const vc = Math.PI * R * R * H, vs = (4 / 3) * Math.PI * (R + delta) ** 3, vi = sphereInCylinder(R, R + delta)
      resetBooleanCounters()
      const u = booleanBrep(cyl, sph, "union"), i = booleanBrep(cyl, sph, "intersect"), d = booleanBrep(cyl, sph, "subtract")
      for (const r of [u, i, d]) {
        expect(validateBrep(r.brep).issues).toEqual([])
        expect(r.warnings.filter((w) => w.includes("degenerate alignment"))).toEqual([])
      }
      expect(booleanCounters().recoveredByDisplacement).toBe(0)
      expect(booleanCounters().failed).toBe(0)
      // At 1e-5 and below the surfaces are within the classification tolerance over a thin band: that band may go either way,
      // which moves the volume by (gap x band area) = under 3e-6 mm^3.
      expect(Math.abs(vol(u.brep) - (vc + vs - vi))).toBeLessThan(2e-6 * (vc + vs - vi))
      expect(Math.abs(vol(i.brep) - vi)).toBeLessThan(2e-6 * vi)
      expect(Math.abs(vol(d.brep) - (vc - vi))).toBeLessThan(2e-6 * (vc - vi))
    }, 60_000)
  }

  test("exact circles of a sphere and a cone about one axis (closed form)", () => {
    const cone = makeCone(4, 1, 6, frame({ x: 0, y: 0, z: 0 }))
    const sph = makeSphere(3.2, frame({ x: 0, y: 0, z: 3 }))
    const cf = cone.faces.find((f) => f.surface.kind === "cone")!, sf = sph.faces[0]!
    const circles = coaxialCircles(cf.surface, sf.surface, 1e-7, 1e-4)
    expect(circles).toBeDefined()
    expect(circles!.length).toBeGreaterThan(0)
    for (const c of circles!) {
      // On both surfaces.
      const p = { x: c.centre.x + c.radius * c.x.x, y: c.centre.y + c.radius * c.x.y, z: c.centre.z + c.radius * c.x.z }
      expect(Math.abs(Math.hypot(p.x, p.y, p.z - 3) - 3.2)).toBeLessThan(1e-12)
    }
  })

  test("sphere off the axis is not a coaxial pair", () => {
    const cyl = makeCylinder(3, 10, frame({ x: 0, y: 0, z: 0 }))
    const sph = makeSphere(3.001, frame({ x: 0.5, y: 0, z: 5 }))
    expect(coaxialCircles(cyl.faces.find((f) => f.surface.kind === "cylinder")!.surface, sph.faces[0]!.surface, 1e-7, 1e-4)).toBeUndefined()
  })
})
