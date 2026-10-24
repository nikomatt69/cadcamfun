import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { brepLocator } from "./classify.ts"
import { surfaceNormal, surfacePoint } from "./geom.ts"
import { faceByName } from "./naming.ts"
import { tessellatedVolume } from "./nurbs-edit.ts"
import { draftNurbsFace, offsetNurbsFace } from "./nurbs-offset.ts"
import { surfacePatch, thickenSurfacePatch } from "./surface-patch.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(200_000)
const volume = tessellatedVolume
const ok = <T,>(r: T | string): T => { if (typeof r === "string") throw new Error(r); return r }

/** A flat 10 x 10 patch in z = 0, thickened 2 mm along +Z. */
const flat = () => thickenSurfacePatch(surfacePatch({ degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], points: [[[0, 0, 0], [0, 10, 0]], [[10, 0, 0], [10, 10, 0]]] }), 2, { x: 0, y: 0, z: 1 })
const bumpData = {
  degreeU: 2, degreeV: 2, knotsU: [0, 0, 0, 1, 1, 1], knotsV: [0, 0, 0, 1, 1, 1],
  points: [0, 5, 10].map((x) => [0, 5, 10].map((y) => [x, y, x === 5 && y === 5 ? 3 : x === 5 || y === 5 ? 1 : 0]))
}
const bump = () => thickenSurfacePatch(surfacePatch(bumpData), 4, { x: 0, y: 0, z: 1 })

describe("the approximate offset of a free-form face", () => {
  test("a flat face offset along its normal is the flat face moved: the volume grows by 100 d, the fit deviates by nothing", () => {
    const b = flat()
    const top = faceByName(b, "thicken.top")!
    const r = ok(offsetNurbsFace(b, top, 1.5))
    expect(r.deviation).toBeLessThan(1e-6)
    expect(validateBrep(r.brep).valid).toBe(true)
    expect(volume(r.brep)).toBeCloseTo(200 + 150, 1)
    const pulled = ok(offsetNurbsFace(b, top, -1))
    expect(volume(pulled.brep)).toBeCloseTo(100, 1)
  })

  test("a curved face: the new face is at distance d from the old one everywhere (checked against the original surface), within the declared deviation", () => {
    const b = bump()
    const top = faceByName(b, "thicken.top")!
    const d = 0.8
    const r = ok(offsetNurbsFace(b, top, d, 0.01))
    expect(r.deviation).toBeLessThanOrEqual(0.01)
    expect(validateBrep(r.brep).valid).toBe(true)
    // The exact offset points of the original face lie on the new solid's boundary, to the deviation.
    const face = b.faces[top]!
    const locator = brepLocator(r.brep)
    let worst = 0
    for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
      const u = i / 6, v = j / 6
      const p = surfacePoint(face.surface, u, v), n = surfaceNormal(face.surface, u, v)
      const exact = { x: p.x + d * n.x, y: p.y + d * n.y, z: p.z + d * n.z }
      worst = Math.max(worst, locator.closest(exact).distance)
    }
    expect(worst).toBeLessThan(0.02)
    // Between moving the face by d along Z (the slab d x 100) and by d along the normals (a little more, the surface being tilted).
    const grown = volume(r.brep) - volume(b)
    expect(grown).toBeGreaterThan(0.8 * 100 - 1)
    expect(grown).toBeLessThan(0.8 * 100 * 1.12)
  })

  test("a deviation the net cannot reach is refused with the reason, and a zero distance too", () => {
    const b = bump()
    const top = faceByName(b, "thicken.top")!
    expect(offsetNurbsFace(b, top, 0.5, 1e-14)).toMatch(/cannot be fitted/)
    expect(offsetNurbsFace(b, top, 0)).toMatch(/non-zero/)
    expect(offsetNurbsFace(b, 99, 1)).toMatch(/not a NURBS face/)
  })
})

describe("the approximate draft of a free-form face", () => {
  /** A flat wall 10 wide, 10 high in the plane y = 0, thickened 4 mm towards -y: the wall looks along +y and a draft about z = 0 leans it. */
  const wall = () => thickenSurfacePatch(surfacePatch({ degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], points: [[[0, 0, 0], [0, 0, 10]], [[10, 0, 0], [10, 0, 10]]] }), 4, { x: 0, y: -1, z: 0 })
  test("a flat wall drafted 5 degrees about its foot loses the wedge 1/2 tan(a) h^2 w (closed form)", () => {
    const b = wall()
    const face = faceByName(b, "thicken.bottom")!
    const r = ok(draftNurbsFace(b, face, { pull: { x: 0, y: 0, z: 1 }, neutral: 0, angle: 5 }))
    expect(validateBrep(r.brep).valid).toBe(true)
    expect(volume(b)).toBeCloseTo(4 * 10 * 10, 4)
    expect(volume(r.brep)).toBeCloseTo(400 - 0.5 * Math.tan((5 * Math.PI) / 180) * 100 * 10, 1)
  })
  test("a draft angle of zero is refused", () => {
    const b = wall()
    expect(draftNurbsFace(b, faceByName(b, "thicken.bottom")!, { pull: { x: 0, y: 0, z: 1 }, neutral: 0, angle: 0 })).toMatch(/non-zero/)
  })
})
