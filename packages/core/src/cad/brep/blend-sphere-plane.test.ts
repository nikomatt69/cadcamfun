import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { blendBrep, blendCandidates, selectBlendEdges } from "./blend.ts"
import { booleanBrep } from "./boolean.ts"
import { curvePoint, surfaceNormal, surfacePoint, surfaceProject } from "./geom.ts"
import { massProperties } from "./mass.ts"
import { dot3, frame, length3, sub3 } from "./math.ts"
import { makeBox, makeSphere } from "./primitives.ts"
import { edgeUses, transformBrep, type Brep } from "./topology.ts"
import { compose, rotation, translation } from "./math.ts"
import { readStepBreps, writeStepBreps } from "./step.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(180_000)

const plate = (height = 0, halfWidth = 20): Brep => booleanBrep(makeBox(2 * halfWidth, 2 * halfWidth, 12, frame({ x: -halfWidth, y: -halfWidth, z: -12 })), makeSphere(8, frame({ x: 0, y: 0, z: height })), "union").brep
const rims = (b: Brep) => selectBlendEdges(blendCandidates(b), { kind: "concave", curved: true }).filter((edge) => edge.curved)

/** Closed-form volume of the meridian arcs, via V=pi integral(rho² dz); independent of kernel integration. */
const capVolume = (R: number, h: number, r: number): number => {
  const q = Math.sqrt((R + r) ** 2 - (r - h) ** 2), alpha = Math.atan2(r - h, q)
  const ball = (t: number) => q * q * r * Math.sin(t) + q * r * r * (t + Math.sin(2 * t) / 2) + r ** 3 * (Math.sin(t) - Math.sin(t) ** 3 / 3)
  return Math.PI * (ball(alpha - Math.PI) - ball(-Math.PI / 2) + R ** 3 * (2 / 3 - Math.sin(alpha) + Math.sin(alpha) ** 3 / 3))
}

const checkContacts = (b: Brep, radius: number): void => {
  expect(validateBrep(b).issues).toEqual([])
  const torus = b.faces.findIndex((face) => face.surface.kind === "torus")
  expect(torus).toBeGreaterThanOrEqual(0)
  const surface = b.faces[torus]!.surface
  if (surface.kind !== "torus") throw new Error("Missing torus")
  expect(surface.minor).toBeCloseTo(radius, 10)
  const uses = edgeUses(b)
  const contacts = b.edges.flatMap((edge, ei) => {
    const adjacent = uses[ei]!
    return adjacent.length === 2 && adjacent.some((use) => use.face === torus) && adjacent[0]!.face !== adjacent[1]!.face ? [{ edge, adjacent }] : []
  })
  expect(contacts).toHaveLength(2)
  for (const { edge, adjacent } of contacts) for (let k = 0; k <= 12; k++) {
    const point = curvePoint(edge.curve, edge.t0 + (edge.t1 - edge.t0) * k / 12)
    const normals = adjacent.map((use) => {
      const face = b.faces[use.face]!, uv = surfaceProject(face.surface, point)
      expect(length3(sub3(surfacePoint(face.surface, uv.u, uv.v), point))).toBeLessThan(1e-7)
      const normal = surfaceNormal(face.surface, uv.u, uv.v)
      return face.reversed ? { x: -normal.x, y: -normal.y, z: -normal.z } : normal
    })
    expect(dot3(normals[0]!, normals[1]!)).toBeCloseTo(1, 9)
  }
}

describe("rolling-ball fillet of a spherical cap on a plane", () => {
  test("the previously omitted rim is selected and receives exact tangent contact circles", () => {
    const body = plate(), candidates = rims(body)
    expect(candidates).toHaveLength(1)
    const result = blendBrep(body, candidates, 1)
    expect(result.blended).toBe(1)
    expect(result.failures).toEqual([])
    expect(result.rejected).toEqual([])
    checkContacts(result.brep, 1)
    const source = body.faces[candidates[0]!.faceB]!.surface
    if (source.kind !== "sphere") throw new Error("Missing sphere")
    const h = dot3(sub3(source.frame.origin, candidates[0]!.axis!.origin), candidates[0]!.nA)
    expect(massProperties(result.brep).volume).toBeCloseTo(40 * 40 * 12 + capVolume(8, h, 1), 6)
    expect(massProperties(result.brep).volume).toBeGreaterThan(massProperties(body).volume)
    const imported = readStepBreps(writeStepBreps([{ name: "Spherical foot", brep: result.brep }])).parts[0]!.brep
    checkContacts(imported, 1)
    expect(massProperties(imported).volume).toBeCloseTo(massProperties(result.brep).volume, 6)
  })

  test("cap depth and fillet radius follow the analytic section under arbitrary rigid placement", () => {
    const tr = compose(translation({ x: 17, y: -11, z: 8 }), rotation({ x: 1, y: 2, z: 3 }, 0.7))
    for (const height of [-2, 2]) {
      const body = transformBrep(plate(height), tr), candidates = rims(body)
      expect(candidates).toHaveLength(1)
      const source = body.faces[candidates[0]!.faceB]!.surface
      if (source.kind !== "sphere") throw new Error("Missing sphere")
      const h = dot3(sub3(source.frame.origin, candidates[0]!.axis!.origin), candidates[0]!.nA)
      const result = blendBrep(body, candidates, 0.5)
      expect(result.rejected).toEqual([])
      expect(result.failures).toEqual([])
      expect(result.blended).toBe(1)
      checkContacts(result.brep, 0.5)
      expect(massProperties(result.brep).volume).toBeCloseTo(40 * 40 * 12 + capVolume(8, h, 0.5), 6)
    }
  })

  test("oversized rims, chamfers and interacting blends leave the original shell with an explicit reason", () => {
    const body = plate(0, 9), candidates = rims(body)
    const large = blendBrep(body, candidates, 4)
    expect(large.blended).toBe(0)
    expect(large.rejected.join(" ")).toContain("another boundary")
    expect(large.brep).toBe(body)
    const chamfer = blendBrep(body, candidates, 1, "chamfer")
    expect(chamfer.rejected.join(" ")).toContain("curved setback")
    const other = blendCandidates(body).find((edge) => !edge.curved && (edge.faceA === candidates[0]!.faceA || edge.faceB === candidates[0]!.faceA))!
    const mixed = blendBrep(body, [...candidates, other], 0.2)
    expect(mixed.rejected.join(" ")).toContain("junction law")
  })
})
