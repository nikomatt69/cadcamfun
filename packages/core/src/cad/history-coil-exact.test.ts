import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuild, type Feature, type History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties, validateBrep } from "./brep/index.ts"
import { meshVolume } from "./solid.ts"

setDefaultTimeout(60_000)

const history = (features: Feature[]): History => ({ parameters: {}, features })
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe("exact coil (C2)", () => {
  test("a round-wire coil is an exact solid close to the mesh", () => {
    const h = history([{ id: "spring", type: "coil", radius: 10, pitch: 8, turns: 3, wireDiameter: 3, operation: "new" }])
    const r = rebuildExact(h)
    expect(r.result.issues.filter((i) => i.severity === "error")).toEqual([])
    const b = r.bodies[0]!
    expect(b.reason).toBeUndefined()
    expect(validateBrep(b.brep!).issues.map((i) => i.message)).toEqual([])
    const mesh = rebuild(h).bodies[0]!
    expect(rel(massProperties(b.brep!).volume, meshVolume(mesh.mesh))).toBeLessThan(0.01)
    expect(massProperties(b.brep!).volume).toBeGreaterThan(1000)
  })

  test("a square-wire coil is an exact solid close to the mesh", () => {
    const h = history([{ id: "spring", type: "coil", radius: 10, pitch: 9, turns: 2, wireDiameter: 3, section: "square", operation: "new" }])
    const b = rebuildExact(h).bodies[0]!
    expect(b.reason).toBeUndefined()
    expect(validateBrep(b.brep!).issues.map((i) => i.message)).toEqual([])
    const mesh = rebuild(h).bodies[0]!
    expect(rel(massProperties(b.brep!).volume, meshVolume(mesh.mesh))).toBeLessThan(0.01)
  })

  test("a left-handed coil keeps its exact model", () => {
    const h = history([{ id: "spring", type: "coil", radius: 8, pitch: 7, turns: 2, wireDiameter: 2.5, handedness: "left", operation: "new" }])
    const b = rebuildExact(h).bodies[0]!
    expect(b.reason).toBeUndefined()
    const mesh = rebuild(h).bodies[0]!
    expect(rel(massProperties(b.brep!).volume, meshVolume(mesh.mesh))).toBeLessThan(0.01)
  })
})
