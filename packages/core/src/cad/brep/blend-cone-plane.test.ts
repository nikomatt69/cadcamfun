import { describe, expect, test } from "bun:test"
import { blendBrep, blendCandidates, selectBlendEdges } from "./blend.ts"
import { booleanBrep } from "./boolean.ts"
import { curvePoint, surfaceNormal, surfacePoint, surfaceProject } from "./geom.ts"
import { massProperties } from "./mass.ts"
import { dot3, frame, length3, sub3 } from "./math.ts"
import { makeBox, makeCone } from "./primitives.ts"
import { edgeUses } from "./topology.ts"
import { readStepBreps, writeStepBreps } from "./step.ts"
import { validateBrep } from "./validate.ts"

/** Plate 40 x 40 x 12 with a coaxial frustum (base radius 10, top radius 4, height 12) standing on its top face. */
const boss = (): ReturnType<typeof booleanBrep>["brep"] =>
  booleanBrep(makeBox(40, 40, 12, frame({ x: -20, y: -20, z: -12 }, { x: 0, y: 0, z: 1 })), makeCone(10, 4, 12), "union").brep

const foot = (b: ReturnType<typeof boss>) => selectBlendEdges(blendCandidates(b), { kind: "concave", curved: true })

/**
 * Volume the rolling ball adds at a cone foot. The cone narrows upward: semi-angle is atan((top - base) / height),
 * negative. The section is the plane, the cone and the circle of radius `radius` tangent to both.
 */
const addedVolume = (base: number, height: number, top: number, radius: number): number => {
  const alpha = Math.atan((top - base) / height)
  const slope = Math.tan(alpha)
  const contactZ = radius * (1 + Math.sin(alpha))
  const q = base + radius * (1 + Math.sin(alpha)) / Math.cos(alpha)
  const arc = (z: number): number => {
    const u = z - radius
    const span = Math.sqrt(radius * radius - u * u)
    return (q * q + radius * radius) * u - u ** 3 / 3 - q * (u * span + radius * radius * Math.asin(u / radius))
  }
  const contactRho = base + contactZ * slope
  const cone = (contactRho ** 3 - base ** 3) / (3 * slope)
  return Math.PI * (arc(contactZ) - arc(0) - cone)
}

const checkContacts = (b: ReturnType<typeof boss>, radius: number): void => {
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
  for (const { edge, adjacent } of contacts) for (let k = 0; k <= 8; k++) {
    const point = curvePoint(edge.curve, edge.t0 + (edge.t1 - edge.t0) * k / 8)
    const normals = adjacent.map((use) => {
      const face = b.faces[use.face]!, uv = surfaceProject(face.surface, point)
      expect(length3(sub3(surfacePoint(face.surface, uv.u, uv.v), point))).toBeLessThan(1e-7)
      const normal = surfaceNormal(face.surface, uv.u, uv.v)
      return face.reversed ? { x: -normal.x, y: -normal.y, z: -normal.z } : normal
    })
    expect(dot3(normals[0]!, normals[1]!)).toBeCloseTo(1, 8)
  }
}

describe("rolling-ball fillet of a cone standing on a plane", () => {
  test("the foot is an exact torus and the added volume is the analytic section", () => {
    const body = boss()
    const edges = foot(body)
    expect(edges).toHaveLength(1)
    const sharp = massProperties(body).volume
    const cone = Math.PI * 12 / 3 * (100 + 40 + 16)
    expect(sharp).toBeCloseTo(40 * 40 * 12 + cone, 6)
    const result = blendBrep(body, edges, 1)
    expect(result.blended).toBe(1)
    expect(result.failures).toEqual([])
    expect(result.rejected).toEqual([])
    checkContacts(result.brep, 1)
    expect(massProperties(result.brep).volume).toBeCloseTo(sharp + addedVolume(10, 12, 4, 1), 6)
    const imported = readStepBreps(writeStepBreps([{ name: "Cone foot", brep: result.brep }])).parts[0]!.brep
    expect(massProperties(imported).volume).toBeCloseTo(massProperties(result.brep).volume, 6)
  })

  test("a fillet wider than the cone face is refused and the body is unchanged", () => {
    const body = booleanBrep(makeBox(16, 16, 8, frame({ x: -8, y: -8, z: -8 }, { x: 0, y: 0, z: 1 })), makeCone(6, 2, 3), "union").brep
    const result = blendBrep(body, selectBlendEdges(blendCandidates(body), { kind: "concave", curved: true }), 20)
    expect(result.blended).toBe(0)
    expect(result.rejected.join(" ")).toContain("the faces reach only")
    expect(result.brep).toBe(body)
  })
})
