import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuild, type Feature, type History, type SketchFeature } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties, validateBrep } from "./brep/index.ts"
import { meshVolume } from "./solid.ts"
import type { SketchEntity } from "./sketch.ts"

setDefaultTimeout(60_000)

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })

const rectangle = (id: string, x: number, y: number, w: number, h: number): SketchFeature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [pt("p1", x, y), pt("p2", x + w, y), pt("p3", x + w, y + h), pt("p4", x, y + h), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
    constraints: [
      { type: "fixed", point: "p1", x, y }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: h }
    ]
  }
})

const openLine = (id: string, x1: number, y1: number, x2: number, y2: number): SketchFeature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [pt("a", x1, y1), pt("b", x2, y2), line("c", "a", "b")],
    constraints: [{ type: "fixed", point: "a", x: x1, y: y1 }, { type: "fixed", point: "b", x: x2, y: y2 }]
  }
})

const history = (features: Feature[]): History => ({ parameters: {}, features })
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe("exact rib (C2)", () => {
  const ribbed = (extra: Feature[] = []): History => history([
    rectangle("s1", 0, 0, 40, 25),
    { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" },
    openLine("s2", 5, 12.5, 35, 12.5),
    { id: "rib1", type: "rib", sketch: "s2", thickness: 4, depth: 10 },
    ...extra
  ])

  test("a rib united with a plate has an exact model with the mesh's volume", () => {
    const h = ribbed()
    const r = rebuildExact(h)
    expect(r.result.issues.filter((i) => i.severity === "error")).toEqual([])
    const b = r.bodies[0]!
    expect(b.reason).toBeUndefined()
    expect(validateBrep(b.brep!).issues.map((i) => i.message)).toEqual([])
    // Plate 40x25x6 plus the rib standing 4 mm proud of it: 30 x 4 x (10 - 6).
    expect(rel(massProperties(b.brep!).volume, 6000 + 30 * 4 * 4)).toBeLessThan(1e-9)
    const mesh = rebuild(h).bodies[0]!
    expect(rel(massProperties(b.brep!).volume, meshVolume(mesh.mesh))).toBeLessThan(1e-6)
  })

  test("a rib on its own is an exact web", () => {
    const h = history([openLine("s2", 5, 12.5, 35, 12.5), { id: "rib1", type: "rib", sketch: "s2", thickness: 4, depth: 10, operation: "new" }])
    const r = rebuildExact(h)
    const b = r.bodies[0]!
    expect(b.reason).toBeUndefined()
    expect(rel(massProperties(b.brep!).volume, 30 * 4 * 10)).toBeLessThan(1e-9)
  })

  test("a symmetric rib is centred on the sketch plane", () => {
    const h = history([openLine("s2", 5, 12.5, 35, 12.5), { id: "rib1", type: "rib", sketch: "s2", thickness: 4, depth: 10, direction: "symmetric", operation: "new" }])
    const b = rebuildExact(h).bodies[0]!
    expect(b.reason).toBeUndefined()
    const mp = massProperties(b.brep!)
    expect(rel(mp.volume, 30 * 4 * 10)).toBeLessThan(1e-9)
    expect(Math.abs(mp.centroid.z)).toBeLessThan(1e-9)
  })
})
