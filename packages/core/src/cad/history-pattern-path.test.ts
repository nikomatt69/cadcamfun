import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuild, type Feature, type History, type SketchFeature } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties, validateBrep } from "./brep/index.ts"
import { meshBounds, meshVolume } from "./solid.ts"
import type { SketchEntity } from "./sketch.ts"

setDefaultTimeout(60_000)

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })

const block = (id: string): SketchFeature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [pt("p1", 0, 0), pt("p2", 4, 0), pt("p3", 4, 2), pt("p4", 0, 2), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
    constraints: [
      { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: 4 }, { type: "length", line: "l2", value: 2 }
    ]
  }
})

const route = (id: string): SketchFeature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [pt("a", 2, 1), pt("b", 22, 1), pt("c", 22, 21), line("r1", "a", "b"), line("r2", "b", "c")],
    constraints: [{ type: "fixed", point: "a", x: 2, y: 1 }, { type: "fixed", point: "b", x: 22, y: 1 }, { type: "fixed", point: "c", x: 22, y: 21 }]
  }
})

const history = (features: Feature[]): History => ({ parameters: {}, features })

describe("pattern along a path (C9)", () => {
  const patterned = (): History => history([
    block("s1"),
    { id: "block", type: "extrude", sketch: "s1", depth: 4, operation: "new" },
    route("route"),
    { id: "pat", type: "pattern", bodies: ["block"], kind: "path", path: "route", count: 3 }
  ])

  test("copies ride the path at equal arc length and turn with it", () => {
    const r = rebuild(patterned())
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(r.bodies.length).toBe(3)
    const volumes = r.bodies.map((b) => meshVolume(b.mesh))
    for (const v of volumes) expect(Math.abs(v - 32) / 32).toBeLessThan(1e-9)
    // The middle copy sits at the corner (half the 40 mm path); the last at the end, turned 90 degrees.
    const mid = meshBounds(r.bodies[1]!.mesh)
    expect(mid.minX).toBeGreaterThan(18)
    expect(mid.minY).toBeLessThan(4)
    const last = meshBounds(r.bodies[2]!.mesh)
    // Turned: the 4 mm side now runs along Y, the 2 mm side along X.
    expect(last.maxX - last.minX).toBeCloseTo(2, 6)
    expect(last.maxY - last.minY).toBeCloseTo(4, 6)
    expect(last.minY).toBeGreaterThan(17)
  })

  test("the exact replay places the same copies", () => {
    const r = rebuildExact(patterned())
    expect(r.bodies.length).toBe(3)
    for (const b of r.bodies) {
      expect(b.reason).toBeUndefined()
      expect(validateBrep(b.brep!).issues.map((i) => i.message)).toEqual([])
      expect(Math.abs(massProperties(b.brep!).volume - 32) / 32).toBeLessThan(1e-9)
    }
  })

  test("a path pattern of a feature tool applies the copies like the mesh", () => {
    const h = history([
      block("s1"),
      { id: "plate", type: "extrude", sketch: "s1", depth: 4, operation: "new" },
      route("route"),
      { id: "boss", type: "extrude", sketch: "s1", depth: 3, operation: "union" },
      { id: "pat", type: "pattern", feature: "boss", kind: "path", path: "route", count: 2 }
    ])
    const r = rebuild(h)
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    const exact = rebuildExact(h)
    expect(exact.bodies[0]!.reason).toBeUndefined()
    expect(Math.abs(massProperties(exact.bodies[0]!.brep!).volume - meshVolume(r.bodies[0]!.mesh)) / meshVolume(r.bodies[0]!.mesh)).toBeLessThan(1e-6)
  })
})
