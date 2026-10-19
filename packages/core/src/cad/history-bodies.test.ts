import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { DimConstraint, Feature, History, SketchFeature } from "./history.ts"
import { rebuild } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties, validateBrep } from "./brep/index.ts"
import { cleanMesh } from "./mesh-clean.ts"
import { meshTopology } from "./mesh-topology.ts"
import type { SketchEntity } from "./sketch.ts"
import { meshBounds, meshVolume } from "./solid.ts"

setDefaultTimeout(60_000)

const PI = Math.PI
const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
/** A w x h rectangle with its lower left corner at (x, y), fully constrained. */
const rectangle = (id: string, x: number, y: number, w: number, h: number): SketchFeature => ({
  id, type: "sketch", plane: "XY",
  sketch: {
    entities: [pt("p1", x, y), pt("p2", x + w, y), pt("p3", x + w, y + h), pt("p4", x, y + h), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
    constraints: [
      { type: "fixed", point: "p1", x, y }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: h }
    ] as DimConstraint[]
  }
})
/** Half of a symmetric plate: 40 x 25 x 6 at x >= 0, one Ø8 through hole at (30, 12.5). */
const half = (extra: Feature[]): History => ({
  parameters: {},
  features: [
    rectangle("s1", 0, 0, 40, 25),
    { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" },
    { id: "h1", type: "hole", plane: "XY", offset: 6, at: [30, 12.5], diameter: 8, depth: 6 },
    ...extra
  ]
})
const HALF = 40 * 25 * 6 - PI * 16 * 6
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe("mirror of whole bodies", () => {
  test("joined, half a symmetric plate becomes the whole plate: one closed body with both holes, exact and mesh alike", () => {
    const h = half([{ id: "m", type: "mirror", bodies: ["plate"], plane: "YZ", join: true }])
    const r = rebuild(h)
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(r.bodies.map((b) => b.id)).toEqual(["plate"])
    const mesh = r.bodies[0]!.mesh
    expect(rel(meshVolume(mesh), 2 * HALF)).toBeLessThan(5e-3)
    const bb = meshBounds(mesh)
    expect([bb.minX, bb.maxX, bb.minY, bb.maxY]).toEqual([-40, 40, 0, 25])
    const topo = meshTopology(cleanMesh(mesh, { mergeCoplanar: false }))
    expect(topo.closed).toBe(true)
    expect(topo.genus).toBe(2)
    const ex = rebuildExact(h)
    expect(ex.bodies.map((b) => b.id)).toEqual(["plate"])
    const brep = ex.bodies[0]!.brep!
    expect(ex.bodies[0]!.reason).toBeUndefined()
    expect(validateBrep(brep).issues.map((i) => i.message)).toEqual([])
    expect(rel(massProperties(brep).volume, 2 * HALF)).toBeLessThan(1e-9)
  })

  test("not joined, the image is a new body reflected through the plane (offset included), the original untouched", () => {
    const h = half([{ id: "m", type: "mirror", bodies: ["plate"], plane: "YZ", offset: -5 }])
    const r = rebuild(h)
    expect(r.bodies.map((b) => b.id)).toEqual(["plate", "m"])
    const image = meshBounds(r.bodies[1]!.mesh)
    // x -> 2 * (-5) - x: [0, 40] maps to [-50, -10].
    expect([image.minX, image.maxX]).toEqual([-50, -10])
    expect(rel(meshVolume(r.bodies[1]!.mesh), HALF)).toBeLessThan(5e-3)
    const ex = rebuildExact(h)
    expect(ex.bodies.map((b) => b.id)).toEqual(["plate", "m"])
    const props = massProperties(ex.bodies[1]!.brep!)
    expect(rel(props.volume, HALF)).toBeLessThan(1e-9)
    expect(validateBrep(ex.bodies[1]!.brep!).issues).toEqual([])
    // A reflection keeps the solid outward: the hole's centroid shift mirrors too.
    expect(props.centroid.x).toBeCloseTo(-10 - (massProperties(ex.bodies[0]!.brep!).centroid.x - 0), 9)
  })
})

describe("pattern of whole bodies", () => {
  test("linear: each copy a new body at its offset, ids shared by the mesh and the exact replay", () => {
    const h = half([{ id: "row", type: "pattern", bodies: ["plate"], kind: "linear", count: 3, step: [0, 40, 0] }])
    const r = rebuild(h)
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(r.bodies.map((b) => b.id)).toEqual(["plate", "row#1", "row#2"])
    expect(r.bodies.map((b) => meshBounds(b.mesh).minY)).toEqual([0, 40, 80])
    const ex = rebuildExact(h)
    expect(ex.bodies.map((b) => b.id)).toEqual(r.bodies.map((b) => b.id))
    for (const b of ex.bodies) expect(rel(massProperties(b.brep!).volume, HALF)).toBeLessThan(1e-9)
  })

  test("circular: four copies about the Z axis, each a quarter turn on", () => {
    const h = half([{ id: "ring", type: "pattern", bodies: ["plate"], kind: "circular", count: 4, centre: [0, 0] }])
    const ex = rebuildExact(h)
    expect(ex.bodies.length).toBe(4)
    const c = ex.bodies.map((b) => massProperties(b.brep!).centroid)
    for (let k = 1; k < 4; k++) {
      const a = (k * PI) / 2
      expect(c[k]!.x).toBeCloseTo(c[0]!.x * Math.cos(a) - c[0]!.y * Math.sin(a), 6)
      expect(c[k]!.y).toBeCloseTo(c[0]!.x * Math.sin(a) + c[0]!.y * Math.cos(a), 6)
    }
  })

  test("a mirror or pattern names a feature or bodies, and only bodies that exist", () => {
    const both = rebuild(half([{ id: "m", type: "mirror", feature: "h1", bodies: ["plate"], plane: "YZ" }]))
    expect(both.issues.some((i) => i.feature === "m" && i.severity === "error" && /not both or neither/.test(i.message))).toBe(true)
    const none = rebuild(half([{ id: "p", type: "pattern", kind: "linear", count: 2, step: [50, 0, 0] }]))
    expect(none.issues.some((i) => i.feature === "p" && /not both or neither/.test(i.message))).toBe(true)
    const missing = rebuild(half([{ id: "p", type: "pattern", bodies: ["nope"], kind: "linear", count: 2, step: [50, 0, 0] }]))
    expect(missing.issues.some((i) => i.feature === "p" && /no body nope/.test(i.message))).toBe(true)
  })
})
