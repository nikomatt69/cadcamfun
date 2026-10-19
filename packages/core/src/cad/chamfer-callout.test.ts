/**
 * The chamfer's callout (spec 33 C4): "2 x 1" (a setback on each face) and "2 x 30°" (a setback and the angle of the chamfer
 * face to it). The exact kernel and the mesh build their tool from the same numbers, so the B-rep and the viewport agree.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { DimConstraint, Feature, History } from "./history.ts"
import type { SketchEntity } from "./sketch.ts"
import { meshVolume } from "./solid.ts"
import { rebuild } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { blendBrep, blendCandidates, booleanBrep, brepToMesh, extrudeProfile, frame, makeBox, makeCylinder, massProperties, readStepBreps, validateBrep, writeStepBreps } from "./brep/index.ts"
import { blendEdges, findEdges } from "./edge-blend.ts"

setDefaultTimeout(60_000)

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })

/** A 40 x 25 plate 6 mm thick: the chamfer takes its four top edges. */
const plate = (chamfer: Partial<Extract<Feature, { type: "fillet" }>> = {}): History => ({
  parameters: { width: 40, depth: 25, thick: 6 },
  features: [
    {
      id: "s1", type: "sketch", plane: "XY",
      sketch: {
        entities: [pt("p1", 0, 0), pt("p2", 40, 0), pt("p3", 40, 25), pt("p4", 0, 25), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
        constraints: [
          { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" },
          { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
          { type: "length", line: "l1", value: "width" }, { type: "length", line: "l2", value: "depth" }
        ] as DimConstraint[]
      }
    },
    { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" },
    {
      id: "ch", type: "fillet", style: "chamfer", radius: 2,
      // The four top edges: their ends are at z = 6, the vertical edges' are at z = 0 too.
      edges: { within: { min: [0, 0, 5.5], max: [40, 25, 6.5] } },
      ...chamfer
    }
  ]
})

/** The heights of the body's vertices and the extent of the face at each height. */
const levels = (b: { readonly vertices: ReadonlyArray<{ readonly point: { x: number; y: number; z: number } }> }) => {
  const out = new Map<number, { x: [number, number]; y: [number, number] }>()
  for (const v of b.vertices) {
    const z = Math.round(v.point.z * 1e6) / 1e6
    const l = out.get(z) ?? { x: [Infinity, -Infinity], y: [Infinity, -Infinity] }
    l.x = [Math.min(l.x[0], v.point.x), Math.max(l.x[1], v.point.x)]
    l.y = [Math.min(l.y[0], v.point.y), Math.max(l.y[1], v.point.y)]
    out.set(z, l)
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0])
}

/** The extent of a level, compared with a millimetre's tolerance. */
const span = (l: readonly [number, number], expected: readonly [number, number]): void => {
  expect(l[0]).toBeCloseTo(expected[0], 6)
  expect(l[1]).toBeCloseTo(expected[1], 6)
}

const exact = (h: History) => {
  const r = rebuildExact(h)
  expect(r.result.issues.filter((i) => i.severity === "error")).toEqual([])
  const b = r.bodies[0]!
  expect(b.reason).toBeUndefined()
  const rep = validateBrep(b.brep!)
  expect(rep.issues.map((i) => i.message)).toEqual([])
  return b.brep!
}

describe("the chamfer's callout", () => {
  test("an equal chamfer takes the same setback on both faces", () => {
    const b = exact(plate())
    const l = levels(b)
    // The top face is 2 mm short on each side, the sides are 2 mm short at the top.
    expect(l.length).toBe(3)
    expect(l[0]![0]).toBeCloseTo(0, 6)
    expect(l[1]![0]).toBeCloseTo(4, 6)
    expect(l[2]![0]).toBeCloseTo(6, 6)
    span(l[2]![1].x, [2, 38])
    span(l[2]![1].y, [2, 23])
  })

  test("two distances put the first on the horizontal face and the second on the other", () => {
    const b = exact(plate({ secondDistance: 1 }))
    const l = levels(b)
    // The top face is 2 mm short on each side (the first distance), the sides 1 mm (the second).
    span(l[2]![1].x, [2, 38])
    span(l[2]![1].y, [2, 23])
    expect(l[1]![0]).toBeCloseTo(5, 6)
    span(l[1]![1].x, [0, 40])
    span(l[1]![1].y, [0, 25])
  })

  test("a distance and an angle give the same chamfer as the two distances", () => {
    const b = exact(plate({ angle: 30 }))
    const l = levels(b)
    // The second face's setback is 2 * tan(30°) = 1.1547 mm.
    span(l[2]![1].x, [2, 38])
    expect(l[1]![0]).toBeCloseTo(6 - 2 * Math.tan(Math.PI / 6), 6)
    const two = exact(plate({ secondDistance: 2 * Math.tan(Math.PI / 6) }))
    expect(Math.abs(massProperties(b).volume - massProperties(two).volume)).toBeLessThan(1e-6)
  })

  test("the mesh and the exact model cut the same chamfer", () => {
    for (const chamfer of [{}, { secondDistance: 1 }, { angle: 30 }]) {
      const h = plate(chamfer)
      const mesh = rebuild(h).bodies[0]!.mesh
      const exactVolume = massProperties(exact(h)).volume
      expect(Math.abs(meshVolume(mesh) - exactVolume) / exactVolume, JSON.stringify(chamfer)).toBeLessThan(0.01)
    }
  })

  test("expressions retain their callouts through STEP exchange", () => {
    for (const callout of [{ secondDistance: "thick / 6" }, { angle: "thick * 5" }]) {
      const b = exact(plate(callout))
      const imported = readStepBreps(writeStepBreps([{ name: "Chamfered plate", brep: b }]))
      expect(imported.parts).toHaveLength(1)
      expect(validateBrep(imported.parts[0]!.brep).issues).toEqual([])
      expect(massProperties(imported.parts[0]!.brep).volume).toBeCloseTo(massProperties(b).volume, 6)
    }
  })

  test("invalid dimensions or incompatible callouts leave both histories unchanged", () => {
    const unchanged = plate()
    const base = rebuildExact({ ...unchanged, features: unchanged.features.slice(0, -1) })
    for (const callout of [{ secondDistance: 0 }, { secondDistance: -1 }, { angle: 0 }, { angle: 90 }, { angle: -30 }, { secondDistance: 1, angle: 30 }, { style: "fillet" as const, angle: 30 }]) {
      const h = plate(callout)
      const r = rebuildExact(h)
      expect(r.result.issues.some((i) => i.feature === "ch" && i.severity === "error"), JSON.stringify(callout)).toBe(true)
      expect(meshVolume(r.result.bodies[0]!.mesh)).toBeCloseTo(meshVolume(base.result.bodies[0]!.mesh), 6)
      expect(massProperties(r.bodies[0]!.brep!).volume).toBeCloseTo(massProperties(base.bodies[0]!.brep!).volume, 6)
    }
  })

  test("direct mesh and B-rep callers refuse invalid callouts without cutting", () => {
    const b = makeBox(40, 25, 6)
    const mesh = brepToMesh(b)
    for (const callout of [{ secondDistance: -1 }, { secondDistance: Infinity }, { secondDistance: NaN }, { angle: NaN }, { angle: 180 }, { angle: 0 }, { secondDistance: 1, angle: 30 }]) {
      const exactResult = blendBrep(b, blendCandidates(b), 2, "chamfer", { chamfer: callout })
      const meshResult = blendEdges(mesh, findEdges(mesh).edges, 2, "chamfer", callout)
      expect(exactResult.blended, JSON.stringify(callout)).toBe(0)
      expect(meshResult.blended, JSON.stringify(callout)).toBe(0)
      expect(exactResult.rejected.length).toBeGreaterThan(0)
      expect(meshResult.rejected.length).toBeGreaterThan(0)
      expect(exactResult.brep).toBe(b)
      expect(meshResult.mesh).toBe(mesh)
    }
    expect(() => blendBrep(b, [], Infinity, "chamfer")).toThrow(RangeError)
    expect(() => blendEdges(mesh, [], Infinity, "chamfer")).toThrow(RangeError)
    expect(() => blendBrep(b, [], 2, "fillet", { chamfer: { angle: 30 } })).toThrow(RangeError)
    expect(() => blendEdges(mesh, [], 2, "fillet", { angle: 30 })).toThrow(RangeError)
  })

  test("explicitly equal setbacks also blend vertical edges", () => {
    const b = makeBox(40, 25, 6)
    const mesh = brepToMesh(b)
    const edges = blendCandidates(b)
    const plain = blendBrep(b, edges, 1, "chamfer")
    const explicit = blendBrep(b, edges, 1, "chamfer", { chamfer: { secondDistance: 1 } })
    expect(explicit.rejected).toEqual([])
    expect(explicit.failures).toEqual([])
    expect(explicit.blended).toBe(12)
    expect(massProperties(explicit.brep).volume).toBeCloseTo(massProperties(plain.brep).volume, 6)
    const meshed = blendEdges(mesh, findEdges(mesh).edges, 1, "chamfer", { secondDistance: 1 })
    expect(meshed.rejected).toEqual([])
    expect(meshVolume(meshed.mesh)).toBeCloseTo(massProperties(plain.brep).volume, 3)
  })

  test("a 60-degree callout on a 60-degree wedge has finite equal setbacks", () => {
    const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 * Math.sqrt(3) }]
    const b = extrudeProfile({ loops: [points.map((a, i) => ({ kind: "line" as const, a, b: points[(i + 1) % points.length]! }))] }, 30, {
      placement: frame({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    })
    const edges = blendCandidates(b).filter((e) => Math.abs(e.a.y - 20) < 1e-6 && Math.abs(e.b.y - 20) < 1e-6)
    expect(edges).toHaveLength(1)
    const result = blendBrep(b, edges, 2, "chamfer", { chamfer: { angle: Math.PI / 3 } })
    expect(result.rejected).toEqual([])
    expect(result.failures).toEqual([])
    expect(result.blended).toBe(1)
    expect(validateBrep(result.brep).issues).toEqual([])
    const expected = massProperties(b).volume - 30 * 2 * Math.sin(Math.PI / 3)
    expect(massProperties(result.brep).volume).toBeCloseTo(expected, 6)
    const mesh = brepToMesh(b)
    const meshEdges = findEdges(mesh).edges.filter((e) => Math.abs(e.a.y - 20) < 1e-6 && Math.abs(e.b.y - 20) < 1e-6)
    const meshed = blendEdges(mesh, meshEdges, 2, "chamfer", { angle: Math.PI / 3 })
    expect(meshed.rejected).toEqual([])
    expect(meshed.blended).toBe(1)
    expect(meshVolume(meshed.mesh)).toBeCloseTo(expected, 2)
  })

  test("a hole mouth has the specified radial and axial setbacks on its exact cone", () => {
    const b = booleanBrep(makeBox(40, 30, 10), makeCylinder(6, 14, frame({ x: 20, y: 15, z: -2 })), "subtract").brep
    const rim = blendCandidates(b).find((e) => e.curve === "circle" && e.a.z > 5)!
    const result = blendBrep(b, [rim], 2, "chamfer", { chamfer: { secondDistance: 1 } })
    expect(result.rejected).toEqual([])
    expect(result.failures).toEqual([])
    expect(validateBrep(result.brep).issues).toEqual([])
    expect(result.brep.faces.some((f) => f.surface.kind === "cone")).toBe(true)
    // Pappus: the 2 x 1 triangle has area 1 and its centroid is 2/3 mm outside the hole wall.
    expect(massProperties(result.brep).volume).toBeCloseTo(massProperties(b).volume - 2 * Math.PI * (6 + 2 / 3), 6)
  })

  test("an angle beyond what a sloped corner allows is refused in both representations", () => {
    const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 10 * Math.sqrt(3) }]
    const b = extrudeProfile({ loops: [points.map((a, i) => ({ kind: "line" as const, a, b: points[(i + 1) % points.length]! }))] }, 30, {
      placement: frame({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    })
    const edges = blendCandidates(b).filter((e) => Math.abs(e.a.y - 20) < 1e-6 && Math.abs(e.b.y - 20) < 1e-6)
    expect(edges).toHaveLength(1)
    const result = blendBrep(b, edges, 2, "chamfer", { chamfer: { angle: 70 * Math.PI / 180 } })
    expect(result.blended).toBe(0)
    expect(result.rejected[0]).toContain("not possible between these faces")
    expect(result.brep).toBe(b)
    const mesh = brepToMesh(b)
    const meshEdges = findEdges(mesh).edges.filter((e) => Math.abs(e.a.y - 20) < 1e-6 && Math.abs(e.b.y - 20) < 1e-6)
    const meshed = blendEdges(mesh, meshEdges, 2, "chamfer", { angle: 70 * Math.PI / 180 })
    expect(meshed.blended).toBe(0)
    expect(meshed.rejected[0]).toContain("not possible between these faces")
    expect(meshed.mesh).toBe(mesh)
  })

  test("a callout the corner cannot take is refused with a reason", () => {
    // Two vertical faces: neither of them is the first one of the callout.
    const h: History = {
      parameters: { width: 40, depth: 25, thick: 6 },
      features: [
        {
          id: "s1", type: "sketch", plane: "XY",
          sketch: {
            entities: [pt("p1", 0, 0), pt("p2", 40, 0), pt("p3", 40, 25), pt("p4", 0, 25), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
            constraints: [
              { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" },
              { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
              { type: "length", line: "l1", value: "width" }, { type: "length", line: "l2", value: "depth" }
            ] as DimConstraint[]
          }
        },
        { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" },
        // A vertical edge: both its faces are vertical.
        { id: "ch", type: "fillet", style: "chamfer", radius: 2, secondDistance: 1, edges: { parallel: "z" } }
      ]
    }
    const r = rebuildExact(h)
    expect(r.bodies[0]!.reason).toBeUndefined()
    const mesh = rebuild(h)
    expect(mesh.issues.some((i) => i.feature === "ch")).toBe(true)
  })
})
