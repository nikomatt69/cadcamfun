import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { blendBrep, blendCandidates, extrudeProfile, massProperties, roundedRectangleLoop, selectBlendEdges, validateBrep } from "./index.ts"

setDefaultTimeout(120_000)

// Spec 72 P2-7: the arcs of a rim (the rounded corners of a plate's outline) are blend candidates, so one fillet runs round the whole
// top outline: straight edges and corner arcs meet tangent, the corner is an exact torus.
describe("fillet along a tangent chain of lines and rim arcs", () => {
  const plate = extrudeProfile({ loops: [roundedRectangleLoop(0, 0, 40, 30, 5)] }, 10)
  const topEdges = (b: typeof plate) => selectBlendEdges(blendCandidates(b), { within: { min: [-1, -1, 9.9], max: [41, 31, 10.1] } })

  test("arcs of a rim are candidates", () => {
    const top = topEdges(plate)
    expect(top.filter((c) => c.arc !== undefined).length).toBe(4)
    expect(top.filter((c) => c.curve === "line").length).toBe(4)
  })

  test("fillet r = 1.5 round the whole top outline: exact torus corners, Pappus volume", () => {
    const r = 1.5, R = 5
    const out = blendBrep(plate, topEdges(plate), r)
    expect(out.failures).toEqual([])
    expect(out.rejected).toEqual([])
    expect(validateBrep(out.brep).valid).toBe(true)
    expect(out.brep.faces.filter((f) => f.surface.kind === "torus").length).toBe(4)
    const a = (1 - Math.PI / 4) * r * r
    const xc = (r * (10 - 3 * Math.PI)) / (3 * (4 - Math.PI))
    const removed = a * (100 + 2 * Math.PI * (R - xc))
    const expected = massProperties(plate).volume - removed
    expect(Math.abs(massProperties(out.brep).volume - expected) / expected).toBeLessThan(1e-6)
  })

  test("a chamfer round the outline", () => {
    const out = blendBrep(plate, topEdges(plate), 1, "chamfer")
    expect(out.failures).toEqual([])
    expect(out.rejected).toEqual([])
    expect(validateBrep(out.brep).valid).toBe(true)
    expect(out.brep.faces.filter((f) => f.surface.kind === "cone").length).toBe(4)
  })

  test("the bottom and top outlines together", () => {
    const all = selectBlendEdges(blendCandidates(plate), {}).filter((c) => c.arc !== undefined || c.curve === "line" && Math.abs(c.a.z - c.b.z) < 1e-9)
    expect(all.length).toBe(16)
    const out = blendBrep(plate, all, 1)
    expect(out.failures).toEqual([])
    expect(validateBrep(out.brep).valid).toBe(true)
  })
})
