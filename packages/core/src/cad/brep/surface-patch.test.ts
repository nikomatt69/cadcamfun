import { expect, test, setDefaultTimeout } from "bun:test"
import { surfacePatch, trimSurfacePatch, thickenSurfacePatch, stitchSurfacePatches, massProperties, tessellateBrep, validateBrep, writeStepBreps, readStepBreps, type NurbsSurfaceData } from "./index.ts"

setDefaultTimeout(120_000)

const plane = (x = 0): NurbsSurfaceData => ({ degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], points: [[[x, 0, 0], [x, 10, 0]], [[x + 10, 0, 0], [x + 10, 10, 0]]] })
const curved: NurbsSurfaceData = { ...plane(), degreeU: 2, knotsU: [0, 0, 0, 1, 1, 1], points: [[[0, 0, 0], [0, 10, 0]], [[5, 0, 3], [5, 10, 3]], [[10, 0, 0], [10, 10, 0]]] }

test("an open rational patch trims by exact isoparametric curves and stays an open surface", () => {
  const patch = surfacePatch({ ...curved, weights: [[1, 1], [0.8, 0.8], [1, 1]] })
  const trimmed = trimSurfacePatch(patch, { u0: 0.2, u1: 0.8, v0: 0.1, v1: 0.9 })
  expect(trimmed.kind).toBe("surface")
  expect(validateBrep(trimmed.brep)).toMatchObject({ valid: true, manifoldSolid: false })
  expect(tessellateBrep(trimmed.brep).indices.length).toBeGreaterThan(0)
  expect(() => trimSurfacePatch(trimmed, { u0: 0, u1: 1, v0: 0, v1: 1 })).toThrow("extend")
  expect(() => surfacePatch({ ...plane(), weights: [[1, 0], [1, 1]] })).toThrow("weights")
  expect(() => surfacePatch({ ...plane(), knotsU: [0, 1, 0, 1] })).toThrow("knot")
})

test("stitch welds common edges, preserves open boundaries, and refuses inconsistent orientation", () => {
  const stitched = stitchSurfacePatches([surfacePatch(plane()), surfacePatch(plane(10))])
  expect(stitched).toMatchObject({ kind: "surface", boundaryEdges: 6 })
  expect(stitched.brep.shells).toHaveLength(1)
  expect(validateBrep(stitched.brep).valid).toBe(true)
  expect(() => stitchSurfacePatches([surfacePatch(plane()), surfacePatch(plane())])).toThrow()
})

test("planar normal thickening and curved axial thickening produce closed exact solids and exchange through STEP", () => {
  const planar = thickenSurfacePatch(surfacePatch(plane()), 2)
  expect(validateBrep(planar)).toMatchObject({ valid: true, manifoldSolid: true })
  expect(massProperties(planar).volume).toBeCloseTo(200, 6)
  const body = thickenSurfacePatch(surfacePatch(curved), 2, { x: 0, y: 0, z: 1 })
  expect(validateBrep(body)).toMatchObject({ valid: true, manifoldSolid: true })
  expect(massProperties(body).volume).toBeCloseTo(200, 5)
  const step = writeStepBreps([{ name: "Thickened patch", brep: body }])
  const reread = readStepBreps(step).parts[0]!
  expect(validateBrep(reread.brep).valid).toBe(true)
  expect(massProperties(reread.brep).volume).toBeCloseTo(200, 5)
  expect(() => thickenSurfacePatch(surfacePatch(curved), 2)).toThrow("normal offset")
  expect(() => thickenSurfacePatch(surfacePatch(curved), 2, { x: 1, y: 0, z: 0 })).toThrow("folds")
})
