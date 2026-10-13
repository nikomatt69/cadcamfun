import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { DimConstraint, Feature, History, SketchFeature } from "./history.ts"
import type { SketchEntity } from "./sketch.ts"
import { meshVolume } from "./solid.ts"
import { buildRecipe } from "./recipes.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties, validateBrep } from "./brep/index.ts"

setDefaultTimeout(60_000)

const PI = Math.PI
const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const rectangle = (id: string, plane: SketchFeature["plane"], x: number, y: number, w: number | string, h: number | string, offset?: number): SketchFeature => ({
  id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}),
  sketch: {
    entities: [pt("p1", x + 0.2, y - 0.1), pt("p2", x + 9, y + 0.3), pt("p3", x + 11, y + 6), pt("p4", x - 0.4, y + 5), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
    constraints: [
      { type: "fixed", point: "p1", x, y }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: h }
    ] as DimConstraint[]
  }
})
const circles = (id: string, plane: SketchFeature["plane"], cx: number, cy: number, radii: number[]): SketchFeature => ({
  id, type: "sketch", plane,
  sketch: {
    entities: [pt("c", cx, cy), ...radii.map((_, i): SketchEntity => ({ id: `k${i}`, kind: "circle", center: "c", radius: 1 + i }))],
    constraints: [{ type: "fixed", point: "c" }, ...radii.map((r, i) => ({ type: "radius", circle: `k${i}`, value: r }) as DimConstraint)]
  }
})
const history = (features: Feature[], parameters: History["parameters"] = {}): History => ({ parameters, features })
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

/** The single exact body of a history: valid, and its volume. */
const exactVolume = (h: History, index = 0): number => {
  const r = rebuildExact(h)
  expect(r.result.issues.filter((i) => i.severity === "error")).toEqual([])
  const b = r.bodies[index]!
  expect(b.reason).toBeUndefined()
  const rep = validateBrep(b.brep!)
  expect(rep.issues.map((i) => i.message)).toEqual([])
  return massProperties(b.brep!).volume
}

describe("exact replay of a parametric history", () => {
  const plate = (extra: Feature[] = [], parameters: History["parameters"] = {}) =>
    history([rectangle("s1", "XY", 0, 0, "width", "height"), { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" }, ...extra], { width: 40, height: 25, thick: 6, ...parameters })

  test("an extruded sketch is the exact plate and follows its parameters", () => {
    expect(rel(exactVolume(plate()), 6000)).toBeLessThan(1e-9)
    expect(rel(exactVolume(plate([], { width: 60 })), 60 * 25 * 6)).toBeLessThan(1e-9)
    const b = rebuildExact(plate()).bodies[0]!.brep!
    expect(b.faces.map((f) => f.name)).toContain("plate.top")
  })

  test("a hole is an exact cylinder cut", () => {
    const v = exactVolume(plate([{ id: "h1", type: "hole", plane: "XY", offset: 6, at: [20, 12.5], diameter: 8, depth: 6 }]))
    expect(rel(v, 6000 - PI * 16 * 6)).toBeLessThan(1e-9)
  })

  test("a pattern and its mirror of holes", () => {
    const v = exactVolume(plate([
      { id: "h1", type: "hole", plane: "XY", offset: 6, at: [6, 6], diameter: 4, depth: 6 },
      { id: "row", type: "pattern", feature: "h1", kind: "linear", count: 3, step: [10, 0, 0] },
      { id: "m", type: "mirror", feature: "h1", plane: "ZX", offset: 12.5 }
    ]))
    // The hole, its two pattern copies and its mirror image.
    const holes = 4
    expect(rel(v, 6000 - holes * PI * 4 * 6)).toBeLessThan(1e-9)
  })

  test("nested circles extrude to an exact ring", () => {
    const v = exactVolume(history([circles("s", "XY", 0, 0, [10, 6]), { id: "ring", type: "extrude", sketch: "s", depth: 5, operation: "new" }]))
    expect(rel(v, PI * (100 - 36) * 5)).toBeLessThan(1e-9)
  })

  test("a revolved rectangle is an exact ring of rectangular section", () => {
    const v = exactVolume(history([rectangle("s", "XY", 5, 0, 3, 10), { id: "r", type: "revolve", sketch: "s", axis: "y", operation: "new" }]))
    expect(rel(v, PI * (64 - 25) * 10)).toBeLessThan(1e-9)
  })

  test("a turned catalogue cylinder subtracted across the plate", () => {
    const v = exactVolume(plate([
      { id: "bar", type: "primitive", element: "cylinder", params: { radius: 2, height: 60 }, at: [20, 12.5, 3], rotation: [0, 90, 0], operation: "subtract" }
    ]))
    expect(rel(v, 6000 - PI * 4 * 40)).toBeLessThan(1e-9)
  })

  test("a split keeps the volume on both sides", () => {
    const r = rebuildExact(plate([{ id: "cut", type: "split", plane: "YZ", offset: 15, keep: "both" }]))
    const vols = r.bodies.map((b) => massProperties(b.brep!).volume)
    expect(vols.length).toBe(2)
    expect(rel(vols[0]! + vols[1]!, 6000)).toBeLessThan(1e-9)
    expect(rel(Math.min(...vols), 15 * 25 * 6)).toBeLessThan(1e-9)
  })

  test("rounded and bevelled profile corners are exact arcs and lines", () => {
    const filleted = plate([], {}).features.map((f) => (f.id === "plate" ? { ...f, corner: { style: "fillet" as const, size: 5 } } : f))
    const vf = exactVolume({ parameters: { width: 40, height: 25, thick: 6 }, features: filleted })
    expect(rel(vf, (1000 - (4 - PI) * 25) * 6)).toBeLessThan(1e-9)
    const r = rebuildExact({ parameters: { width: 40, height: 25, thick: 6 }, features: filleted })
    // Four quarter-round walls, exact cylinders of radius 5.
    const cylinders = r.bodies[0]!.brep!.faces.filter((f) => f.surface.kind === "cylinder")
    expect(cylinders.length).toBe(4)
    expect(cylinders.every((f) => f.surface.kind === "cylinder" && Math.abs(f.surface.radius - 5) < 1e-12)).toBe(true)
    const chamfered = plate([], {}).features.map((f) => (f.id === "plate" ? { ...f, corner: { style: "chamfer" as const, size: 3 } } : f))
    expect(rel(exactVolume({ parameters: { width: 40, height: 25, thick: 6 }, features: chamfered }), (1000 - 2 * 9) * 6)).toBeLessThan(1e-9)
  })

  test("a corner treatment that does not fit is reported, not approximated", () => {
    const tooBig = plate([], {}).features.map((f) => (f.id === "plate" ? { ...f, corner: { style: "fillet" as const, size: 30 } } : f))
    const r = rebuildExact({ parameters: { width: 40, height: 25, thick: 6 }, features: tooBig })
    expect(r.bodies.every((b) => b.brep === undefined)).toBe(true)
  })

  test("a feature without an exact counterpart is reported per body, the mesh stays", () => {
    const r = rebuildExact(plate([{ id: "round", type: "fillet", radius: 1 }]))
    expect(r.bodies[0]!.brep).toBeUndefined()
    expect(r.bodies[0]!.reason).toContain("fillet")
    expect(r.result.bodies[0]!.mesh.indices.length).toBeGreaterThan(0)
  })

  test("recipes: the exact solid agrees with the mesh within the meshing error", () => {
    for (const [name, input] of [["mounting_plate", {}], ["flange", {}], ["l_bracket", {}], ["stepped_shaft", { sections: [{ diameter: 20, length: 30 }, { diameter: 14, length: 40 }] }]] as const) {
      const r = rebuildExact(buildRecipe(name, input).history)
      for (const b of r.bodies) {
        if (b.brep === undefined) continue
        expect(validateBrep(b.brep).valid).toBe(true)
        const mesh = meshVolume(r.result.bodies.find((m) => m.id === b.id)!.mesh)
        expect(rel(massProperties(b.brep).volume, mesh)).toBeLessThan(2e-3)
      }
      expect(r.bodies.some((b) => b.brep !== undefined)).toBe(true)
    }
  })
})

describe("exact replay on work planes", () => {
  const centroidOf = (positions: Float32Array) => {
    let x = 0, y = 0, z = 0
    for (let i = 0; i < positions.length; i += 3) { x += positions[i]!; y += positions[i + 1]!; z += positions[i + 2]! }
    const n = positions.length / 3
    return { x: x / n, y: y / n, z: z / n }
  }

  test("a sketch on an offset work plane is extruded from that plane", () => {
    const h = history([
      { id: "w", type: "plane", from: { kind: "offset", base: "XY", distance: 10 } },
      rectangle("s1", "w", 0, 0, 40, 25),
      { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" }
    ])
    expect(rel(exactVolume(h), 6000)).toBeLessThan(1e-9)
    const c = massProperties(rebuildExact(h).bodies[0]!.brep!).centroid
    expect(c.z).toBeCloseTo(13, 6)
  })

  test("a sketch on a tilted work plane sits where the mesh rebuild puts it", () => {
    const h = history([
      { id: "w", type: "plane", from: { kind: "angle", base: "XY", angle: 30, about: "u" } },
      rectangle("s1", "w", 0, 0, 40, 25),
      { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" }
    ])
    const r = rebuildExact(h)
    expect(rel(exactVolume(h), 6000)).toBeLessThan(1e-9)
    expect(rel(meshVolume(r.result.bodies[0]!.mesh), 6000)).toBeLessThan(1e-6)
    // A box: the mean of its eight corners is its centroid, so the exact and mesh bodies must coincide.
    const exact = massProperties(r.bodies[0]!.brep!).centroid
    const mesh = centroidOf(r.result.bodies[0]!.mesh.positions)
    expect(Math.hypot(exact.x - mesh.x, exact.y - mesh.y, exact.z - mesh.z)).toBeLessThan(1e-3)
  })

  test("a hole on a work plane says it has no exact model and adds no body", () => {
    const h = history([
      rectangle("s1", "XY", 0, 0, 40, 25),
      { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" },
      { id: "w", type: "plane", from: { kind: "offset", base: "XY", distance: 6 } },
      { id: "h1", type: "hole", plane: "w", at: [20, 12.5], diameter: 8, depth: 6 }
    ])
    const r = rebuildExact(h)
    expect(r.bodies.length).toBe(1)
    expect(r.bodies[0]!.reason).toContain("work plane 'w'")
  })
})
