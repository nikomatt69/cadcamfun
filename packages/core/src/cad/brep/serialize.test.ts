import { describe, expect, test } from "bun:test"
import { BREP_JSON_VERSION, BREP_LIMITS, brepFromJson, brepToJson, brepToText, formatPath } from "./serialize.ts"
import { countTopology } from "./topology.ts"
import { makeBox, makeCone, makeCylinder, makeSphere, makeTorus } from "./primitives.ts"
import { massProperties } from "./mass.ts"
import { validateBrep } from "./validate.ts"
import { explodeWithGaps } from "./exploded-fixture.ts"
import { healBrep } from "./heal.ts"
import { writeStepBreps, readStepBreps } from "./step.ts"
import type { Brep } from "./topology.ts"

const maxTol = (b: Brep): number => Math.max(0, ...b.vertices.map((v) => v.tol), ...b.edges.map((e) => e.tol))
const roundTrip = (b: Brep): Brep => {
  const decoded = brepFromJson(JSON.parse(brepToText(b)))
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.problems))
  return decoded.brep
}

describe("the JSON form of a Brep", () => {
  const bodies: ReadonlyArray<readonly [string, () => Brep]> = [
    ["box", () => makeBox(10, 20, 30)],
    ["cylinder", () => makeCylinder(4, 12)],
    ["cone", () => makeCone(5, 2, 9)],
    ["sphere", () => makeSphere(7)],
    ["torus", () => makeTorus(10, 3)],
    ["healed exploded box (loose tolerances)", () => healBrep(explodeWithGaps(makeBox(10, 20, 30), 3e-5)).brep],
    ["a body read back from STEP", () => readStepBreps(writeStepBreps([{ name: "b", brep: makeCylinder(3, 8) }])).parts[0]!.brep]
  ]
  for (const [name, make] of bodies) {
    test(`${name}: volume, area, topology counts, tolerances and validity are identical after a round trip`, () => {
      const original = make()
      const back = roundTrip(original)
      expect(countTopology(back)).toEqual(countTopology(original))
      expect(massProperties(back).volume).toBe(massProperties(original).volume)
      expect(massProperties(back).area).toBe(massProperties(original).area)
      expect(maxTol(back)).toBe(maxTol(original))
      expect(back.vertices.map((v) => v.tol)).toEqual(original.vertices.map((v) => v.tol))
      expect(back.edges.map((e) => e.tol)).toEqual(original.edges.map((e) => e.tol))
      expect(back.faces.map((f) => f.loose === true)).toEqual(original.faces.map((f) => f.loose === true))
      expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify(original)))
      expect(validateBrep(back).issues).toEqual(validateBrep(original).issues)
    })
  }

  test("the form is tagged, and a second encoding of the decoded body is the same text", () => {
    const b = makeBox(1, 2, 3)
    expect(brepToJson(b).version).toBe(BREP_JSON_VERSION)
    expect(brepToText(roundTrip(b))).toBe(brepToText(b))
  })

  test("a body with a non-finite number is not encoded, and the path is named", () => {
    const b = makeBox(1, 2, 3)
    const bad: Brep = { ...b, vertices: b.vertices.map((v, i) => (i === 2 ? { ...v, tol: Number.NaN } : v)) }
    expect(() => brepToJson(bad)).toThrow(/vertices\[2\]\.tol/)
  })

  test("refusals name the field", () => {
    const text = JSON.parse(brepToText(makeCylinder(4, 12)))
    const refused = (mutate: (j: any) => void) => {
      const j = JSON.parse(JSON.stringify(text))
      mutate(j)
      const r = brepFromJson(j)
      expect(r.ok).toBe(false)
      return r.ok ? "" : r.problems.map((p) => `${formatPath(p.path)}: ${p.message}`).join(" | ")
    }
    expect(refused((j) => { j.version = 2 })).toContain("version")
    expect(refused((j) => { delete j.version })).toContain("missing")
    expect(refused((j) => { j.faces[1].loops[0].coedges[0].edge = 999 })).toContain("faces[1].loops[0].coedges[0].edge")
    expect(refused((j) => { j.edges[0].v1 = -1 })).toContain("edges[0].v1")
    expect(refused((j) => { j.vertices[0].point.x = "1" })).toContain("vertices[0].point.x")
    expect(refused((j) => { j.faces[0].surface.kind = "blob" })).toContain("faces[0].surface.kind")
    expect(refused((j) => { j.edges[0].t1 = j.edges[0].t0 })).toContain("edges[0].t1")
    expect(refused((j) => { j.shells[0].faces.push(77) })).toContain("shells[0].faces[")
    expect(refused((j) => { j.faces = [] })).toContain("at least one face")
    expect(brepFromJson("nope").ok).toBe(false)
    expect(brepFromJson(null).ok).toBe(false)
  })

  test("a NURBS surface with the wrong knot count is refused", () => {
    const nurbs = JSON.parse(brepToText(makeBox(1, 1, 1)))
    nurbs.faces[0].surface = { kind: "nurbs", data: { degreeU: 1, degreeV: 1, knotsU: [0, 0, 1], knotsV: [0, 0, 1, 1], points: [[[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 0]]] } }
    const r = brepFromJson(nurbs)
    expect(r.ok).toBe(false)
    expect(r.ok ? "" : formatPath(r.problems[0]!.path)).toBe("faces[0].surface.data.knotsU")
  })

  test("the size limits refuse a body with the reason", () => {
    const j = JSON.parse(brepToText(makeBox(1, 1, 1)))
    const faces = brepFromJson(j, { ...BREP_LIMITS, faces: 5 })
    expect(faces.ok).toBe(false)
    expect(faces.ok ? "" : faces.problems[0]!.message).toContain("above the limit of 5 faces")
    const bytes = brepFromJson(j, { ...BREP_LIMITS, bytes: 500 })
    expect(bytes.ok).toBe(false)
    expect(bytes.ok ? "" : bytes.problems[0]!.message).toContain("above the limit of 500")
    expect(brepFromJson(j).ok).toBe(true)
  })
})
