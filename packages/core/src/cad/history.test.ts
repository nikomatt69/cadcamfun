import { describe, expect, test } from "bun:test"
import { buildPartModelFromMeshes } from "../cam/model/model.ts"
import { historyVolume, rebuild, withParameter, type DimConstraint, type Feature, type History, type SketchFeature } from "./history.ts"
import type { SketchEntity } from "./sketch.ts"
import { meshBounds, meshVolume } from "./solid.ts"

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })

/** A rectangle from the corner (x, y), `w` by `h` (numbers or expressions), as a sketch feature. */
const rectangle = (id: string, plane: SketchFeature["plane"], x: number, y: number, w: number | string, h: number | string, offset?: number | string): SketchFeature => ({
  id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}),
  sketch: {
    entities: [pt("p1", x + 0.2, y - 0.1), pt("p2", x + 9, y + 0.3), pt("p3", x + 11, y + 6), pt("p4", x - 0.4, y + 5), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
    constraints: [
      { type: "fixed", point: "p1", x, y }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: h }
    ] as DimConstraint[]
  }
})
const circles = (id: string, plane: SketchFeature["plane"], cx: number, cy: number, radii: Array<number | string>, offset?: number): SketchFeature => ({
  id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}),
  sketch: {
    entities: [pt("c", cx, cy), ...radii.map((_, i): SketchEntity => ({ id: `k${i}`, kind: "circle", center: "c", radius: 1 + i }))],
    constraints: [{ type: "fixed", point: "c" }, ...radii.map((r, i) => ({ type: "radius", circle: `k${i}`, value: r }) as DimConstraint)]
  }
})
const history = (features: Feature[], parameters: History["parameters"] = {}): History => ({ parameters, features })
const bounds = (r: ReturnType<typeof rebuild>, i = 0) => meshBounds(r.bodies[i]!.mesh)

describe("a plate driven by parameters", () => {
  const plate = (extra: Feature[] = [], parameters: History["parameters"] = {}) =>
    history([rectangle("s1", "XY", 0, 0, "width", "height"), { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" }, ...extra], { width: 40, height: 25, thick: 6, ...parameters })

  test("the sketch is solved to its dimensions and extruded: volume and bounds are the plate's", () => {
    const r = rebuild(plate())
    expect(r.issues).toEqual([])
    expect(r.sketches["s1"]!.solve.status).toBe("fully-constrained")
    expect(r.bodies).toHaveLength(1)
    expect(historyVolume(r)).toBeCloseTo(6000, 2)
    const b = bounds(r)
    const got = [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ]
    ;[0, 40, 0, 25, 0, 6].forEach((want, i) => expect(got[i]!).toBeCloseTo(want, 5))
  })

  test("changing one parameter rebuilds everything that depends on it", () => {
    const base = plate([], { thick: "width / 10" })
    expect(historyVolume(rebuild(base))).toBeCloseTo(40 * 25 * 4, 2)
    const wide = rebuild(withParameter(base, "width", 60))
    expect(wide.issues).toEqual([])
    expect(historyVolume(wide)).toBeCloseTo(60 * 25 * 6, 2)
    expect(bounds(wide).maxX).toBeCloseTo(60, 6)
    expect(wide.parameters["thick"]).toBe(6)
  })

  test("a hole on the top face is subtracted: the volume falls by the cylinder, and the CAM model has no material there", () => {
    const r = rebuild(plate([{ id: "h1", type: "hole", plane: "XY", offset: "thick", at: [20, 12.5], diameter: 8, depth: "thick" }]))
    expect(r.issues).toEqual([])
    const removed = 6000 - historyVolume(r)
    expect(removed).toBeGreaterThan(Math.PI * 16 * 6 * 0.995)
    expect(removed).toBeLessThanOrEqual(Math.PI * 16 * 6 + 1e-6)
    const part = buildPartModelFromMeshes(r.bodies.map((b) => b.mesh), { cell: 0.2 })!
    const top = part.dexels.top(-Infinity)
    const idx = (x: number, y: number) => Math.floor((y - part.grid.minY) / part.grid.cellY) * part.grid.nx + Math.floor((x - part.grid.minX) / part.grid.cellX)
    expect(top[idx(20, 12.5)]).toBe(-Infinity) // through the hole
    expect(top[idx(5, 5)]).toBeCloseTo(6, 6) // on the plate
    expect(part.dexels.volume()).toBeGreaterThan(0.98 * historyVolume(r))
    expect(part.dexels.volume()).toBeLessThan(1.02 * historyVolume(r))
  })

  test("a pocket (a second sketch on the top face, extruded down and subtracted), a boss (up and united), and a cut by intersection", () => {
    const pocket = rebuild(plate([rectangle("s2", "XY", 5, 5, 10, 10, "thick"), { id: "pocket", type: "extrude", sketch: "s2", depth: 3, direction: "down", operation: "subtract" }]))
    expect(pocket.issues).toEqual([])
    expect(historyVolume(pocket)).toBeCloseTo(6000 - 300, 2)
    const boss = rebuild(plate([rectangle("s2", "XY", 5, 5, 10, 10, "thick"), { id: "boss", type: "extrude", sketch: "s2", depth: 4, operation: "union" }]))
    expect(boss.bodies).toHaveLength(1)
    expect(historyVolume(boss)).toBeCloseTo(6000 + 400, 2)
    expect(bounds(boss).maxZ).toBeCloseTo(10, 6)
    const half = rebuild(plate([rectangle("s2", "XY", 0, 0, 20, 25), { id: "cut", type: "extrude", sketch: "s2", depth: 6, operation: "intersect" }]))
    expect(historyVolume(half)).toBeCloseTo(3000, 2)
  })

  test("a symmetric extrusion straddles the sketch plane", () => {
    const r = rebuild(history([rectangle("s", "XY", 0, 0, 10, 10), { id: "e", type: "extrude", sketch: "s", depth: 8, direction: "symmetric", operation: "new" }]))
    expect(bounds(r)).toMatchObject({ minZ: expect.closeTo(-4, 6), maxZ: expect.closeTo(4, 6) })
  })
})

describe("profiles and planes", () => {
  test("two circles are a ring: the inner one is a hole", () => {
    const r = rebuild(history([circles("s", "XY", 0, 0, [15, 6]), { id: "ring", type: "extrude", sketch: "s", depth: 10, operation: "new" }]))
    expect(r.issues).toEqual([])
    const exact = Math.PI * (225 - 36) * 10
    expect(historyVolume(r)).toBeGreaterThan(exact * 0.995)
    expect(historyVolume(r)).toBeLessThanOrEqual(exact + 1e-6)
  })

  test("a sketch on the YZ plane extrudes along X, and one on ZX along Y; an offset moves the plane along its normal", () => {
    const yz = rebuild(history([rectangle("s", "YZ", 0, 0, 10, 4), { id: "e", type: "extrude", sketch: "s", depth: 7, operation: "new" }]))
    expect(bounds(yz)).toMatchObject({ minX: expect.closeTo(0, 6), maxX: expect.closeTo(7, 6), minY: expect.closeTo(0, 6), maxY: expect.closeTo(10, 6), minZ: expect.closeTo(0, 6), maxZ: expect.closeTo(4, 6) })
    expect(historyVolume(yz)).toBeCloseTo(280, 2)
    const zx = rebuild(history([rectangle("s", "ZX", 0, 0, 10, 4, 5), { id: "e", type: "extrude", sketch: "s", depth: 2, operation: "new" }]))
    expect(bounds(zx)).toMatchObject({ minY: expect.closeTo(5, 6), maxY: expect.closeTo(7, 6), minZ: expect.closeTo(0, 6), maxZ: expect.closeTo(10, 6), minX: expect.closeTo(0, 6), maxX: expect.closeTo(4, 6) })
    expect(historyVolume(zx)).toBeCloseTo(80, 2)
  })

  test("a revolution about the plane's own axis makes a cylinder; about a line of the sketch, a ring", () => {
    const cyl = rebuild(history([rectangle("s", "XY", 0, 0, 5, 10), { id: "r", type: "revolve", sketch: "s", axis: "y", operation: "new" }]))
    expect(cyl.issues).toEqual([])
    const exact = Math.PI * 25 * 10
    expect(historyVolume(cyl)).toBeGreaterThan(exact * 0.995)
    expect(historyVolume(cyl)).toBeLessThanOrEqual(exact * 1.0001)
    // Turned about the sketch plane's y axis (world Y): the cylinder is 10 long in Y and 10 across in X and Z, to the facets.
    const b = bounds(cyl)
    expect(b.maxY - b.minY).toBeCloseTo(10, 4)
    expect(b.maxX - b.minX).toBeGreaterThan(9.9)
    expect(b.maxX - b.minX).toBeLessThanOrEqual(10 + 1e-4)
    expect(b.maxZ - b.minZ).toBeGreaterThan(9.9)
    // The rectangle x in [1, 6] turned about the vertical line x = -1: radii 2 to 7.
    const sketch = rectangle("s", "XY", 1, 0, 5, 10)
    const withAxis: SketchFeature = { ...sketch, sketch: { entities: [...sketch.sketch.entities, pt("a1", -1, -5), pt("a2", -1, 15), line("axis", "a1", "a2")], constraints: [...sketch.sketch.constraints, { type: "fixed", point: "a1" }, { type: "fixed", point: "a2" }] } }
    const ring = rebuild(history([withAxis, { id: "r", type: "revolve", sketch: "s", axis: { line: "axis" }, operation: "new" }]))
    expect(ring.issues).toEqual([])
    const ringExact = Math.PI * (49 - 4) * 10
    expect(historyVolume(ring)).toBeGreaterThan(ringExact * 0.99)
    expect(historyVolume(ring)).toBeLessThanOrEqual(ringExact * 1.0001)
  })

  test("a half revolution is half the volume", () => {
    const half = rebuild(history([rectangle("s", "XY", 0, 0, 5, 10), { id: "r", type: "revolve", sketch: "s", axis: "y", angle: 180, operation: "new" }]))
    const full = rebuild(history([rectangle("s", "XY", 0, 0, 5, 10), { id: "r", type: "revolve", sketch: "s", axis: "y", operation: "new" }]))
    expect(historyVolume(half)).toBeCloseTo(historyVolume(full) / 2, 0)
  })

  test("a profile on the wrong side of the axis is turned about to the right side, not mirrored inside out", () => {
    const left = rebuild(history([rectangle("s", "XY", -6, 0, 5, 10), { id: "r", type: "revolve", sketch: "s", axis: "y", operation: "new" }]))
    expect(left.issues).toEqual([])
    expect(historyVolume(left)).toBeGreaterThan(0)
    expect(meshVolume(left.bodies[0]!.mesh)).toBeGreaterThan(0)
  })
})

describe("patterns", () => {
  const plate = (extra: Feature[]) => history([rectangle("s1", "XY", 0, 0, 60, 60), { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" }, { id: "h", type: "hole", plane: "XY", offset: 6, at: [5, 30], diameter: 4, depth: 6 }, ...extra])

  test("a linear pattern of a hole makes as many holes as the count", () => {
    const single = historyVolume(rebuild(plate([])))
    const four = rebuild(plate([{ id: "p", type: "pattern", feature: "h", kind: "linear", count: 4, step: [15, 0, 0] }]))
    expect(four.issues).toEqual([])
    const holeVolume = 60 * 60 * 6 - single
    expect(60 * 60 * 6 - historyVolume(four)).toBeCloseTo(4 * holeVolume, 1)
  })

  test("a circular pattern turns the tool about the Z axis through the centre: four holes a quarter turn apart", () => {
    const single = historyVolume(rebuild(plate([])))
    const ring = rebuild(history([
      rectangle("s1", "XY", 0, 0, 60, 60), { id: "plate", type: "extrude", sketch: "s1", depth: 6, operation: "new" },
      { id: "h", type: "hole", plane: "XY", offset: 6, at: [40, 30], diameter: 4, depth: 6 },
      { id: "p", type: "pattern", feature: "h", kind: "circular", count: 4, centre: [30, 30] }
    ]))
    expect(ring.issues).toEqual([])
    const holeVolume = 60 * 60 * 6 - single
    expect(60 * 60 * 6 - historyVolume(ring)).toBeCloseTo(4 * holeVolume, 1)
    // The holes are at (40,30) (30,40) (20,30) (30,20): material is gone at each, present between them.
    const part = buildPartModelFromMeshes(ring.bodies.map((b) => b.mesh), { cell: 0.25 })!
    const top = part.dexels.top(-Infinity)
    const at = (x: number, y: number) => top[Math.floor((y - part.grid.minY) / part.grid.cellY) * part.grid.nx + Math.floor((x - part.grid.minX) / part.grid.cellX)]
    for (const [x, y] of [[40, 30], [30, 40], [20, 30], [30, 20]] as const) expect(at(x, y)).toBe(-Infinity)
    expect(at(35, 35)).toBeCloseTo(6, 6)
  })

  test("the count is a parameter too, and a bad one is an error", () => {
    const base = plate([{ id: "p", type: "pattern", feature: "h", kind: "linear", count: "n", step: [10, 0, 0] }])
    const three = rebuild({ ...base, parameters: { n: 3 } })
    const five = rebuild({ ...base, parameters: { n: 5 } })
    expect(historyVolume(three)).toBeGreaterThan(historyVolume(five))
    expect(rebuild({ ...base, parameters: { n: 1.5 } }).issues.some((i) => i.feature === "p" && i.message.includes("integer"))).toBe(true)
  })
})

describe("what goes wrong is reported, and the rest still builds", () => {
  test("a bad parameter, a conflicting sketch and a missing sketch are issues; an independent feature still builds", () => {
    const bad: SketchFeature = {
      id: "bad", type: "sketch", plane: "XY",
      sketch: { entities: [pt("a", 0, 0), pt("b", 10, 0), line("l", "a", "b")], constraints: [{ type: "fixed", point: "a" }, { type: "horizontal", line: "l" }, { type: "length", line: "l", value: 10 }, { type: "length", line: "l", value: 12 }] }
    }
    const r = rebuild(history([
      bad,
      { id: "e-bad", type: "extrude", sketch: "bad", depth: 5, operation: "new" },
      { id: "e-missing", type: "extrude", sketch: "nowhere", depth: 5, operation: "new" },
      rectangle("ok", "XY", 0, 0, 10, 10),
      { id: "e-ok", type: "extrude", sketch: "ok", depth: "ghost", operation: "new" },
      { id: "e-fine", type: "extrude", sketch: "ok", depth: 3, operation: "new" }
    ], { unused: "1 +" }))
    const byFeature = (f: string) => r.issues.filter((i) => i.feature === f)
    expect(byFeature("bad")[0]!.severity).toBe("error")
    expect(byFeature("e-bad")).toHaveLength(1)
    expect(byFeature("e-missing")).toHaveLength(1)
    expect(byFeature("e-ok")[0]!.message).toContain("ghost")
    expect(byFeature("parameter unused")).toHaveLength(1)
    expect(r.bodies.map((b) => b.id)).toEqual(["e-fine"])
    expect(historyVolume(r)).toBeCloseTo(300, 2)
  })

  test("an operation with nothing to act on, a revolution that crosses its axis, and a non-positive depth are errors", () => {
    const lonely = rebuild(history([rectangle("s", "XY", 0, 0, 5, 5), { id: "e", type: "extrude", sketch: "s", depth: 2, operation: "subtract" }]))
    expect(lonely.issues[0]!.message).toContain("no body")
    const crossing = rebuild(history([rectangle("s", "XY", -3, 0, 6, 5), { id: "r", type: "revolve", sketch: "s", axis: "y", operation: "new" }]))
    expect(crossing.issues[0]!.message).toContain("crosses the axis")
    const flat = rebuild(history([rectangle("s", "XY", 0, 0, 5, 5), { id: "e", type: "extrude", sketch: "s", depth: 0, operation: "new" }]))
    expect(flat.issues[0]!.message).toContain("positive")
  })

  test("an over-constrained sketch is a warning, not an error: the solid is still built", () => {
    const sketch = rectangle("s", "XY", 0, 0, 10, 10)
    const redundant: SketchFeature = { ...sketch, sketch: { ...sketch.sketch, constraints: [...sketch.sketch.constraints, { type: "horizontalPoints", a: "p3", b: "p4" } as DimConstraint] } }
    const r = rebuild(history([redundant, { id: "e", type: "extrude", sketch: "s", depth: 2, operation: "new" }]))
    expect(r.issues.map((i) => i.severity)).toEqual(["warning"])
    expect(historyVolume(r)).toBeCloseTo(200, 2)
  })
})
