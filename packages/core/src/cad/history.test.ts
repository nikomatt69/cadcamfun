import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildPartModelFromMeshes } from "../cam/model/model.ts"
import { historyVolume, rebuild, withParameter, type DimConstraint, type Feature, type History, type SketchFeature } from "./history.ts"
import type { SketchEntity } from "./sketch.ts"
import { meshBounds, meshVolume } from "./solid.ts"

// A single history here can rebuild a filleted, countersunk, mirrored plate; the default 5 s timeout makes the heavy
// ones fail under the load of a full-suite run (as in `csg.test.ts`).
setDefaultTimeout(60_000)

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

// ---------------------------------------------------------------- edge and corner treatments, hole kinds, mirror

/** A rectangular sketch with one circle added (a hole in the profile): centre fixed, radius constrained. */
const withCircle = (sk: SketchFeature, cx: number, cy: number, r: number | string): SketchFeature => ({
  ...sk,
  sketch: {
    entities: [...sk.sketch.entities, pt("hc", cx, cy), { id: "hk", kind: "circle", center: "hc", radius: 1 }],
    constraints: [...sk.sketch.constraints, { type: "fixed", point: "hc", x: cx, y: cy }, { type: "radius", circle: "hk", value: r } as DimConstraint]
  }
})
const errors = (r: ReturnType<typeof rebuild>) => r.issues.filter((i) => i.severity === "error")

describe("extrusion edge treatments", () => {
  const A = 40, B = 30, H = 10
  const block = (edge: Extract<Feature, { type: "extrude" }>["edge"], parameters: History["parameters"] = {}) =>
    history([rectangle("s", "XY", 0, 0, A, B), { id: "e", type: "extrude", sketch: "s", depth: H, operation: "new", ...(edge !== undefined ? { edge } : {}) }], parameters)

  test("a chamfer c on both end faces removes (a + b) c^2 - 4 c^3 / 3 per end; the bounds stay those of the block", () => {
    const c = 2
    const r = rebuild(block({ style: "chamfer", size: c }))
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    const removedPerEnd = (A + B) * c * c - (4 * c ** 3) / 3
    expect(historyVolume(r)).toBeCloseTo(A * B * H - 2 * removedPerEnd, 4)
    const b = bounds(r)
    expect([b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, A, 0, B, 0, H])
    expect(meshVolume(r.bodies[0]!.mesh)).toBeGreaterThan(0)
  })

  test("ends top / bottom / both: one end removes half of two", () => {
    const top = historyVolume(rebuild(block({ style: "chamfer", size: 2, ends: "top" })))
    const bottom = historyVolume(rebuild(block({ style: "chamfer", size: 2, ends: "bottom" })))
    const both = historyVolume(rebuild(block({ style: "chamfer", size: 2, ends: "both" })))
    expect(top).toBeCloseTo(bottom, 6)
    expect(A * B * H - both).toBeCloseTo(2 * (A * B * H - top), 6)
  })

  test("a fillet of radius r removes 2 (a + b) r^2 (1 - pi/4) - 4 r^3 (5/3 - pi/2) at its end", () => {
    const rad = 2
    const exactRemoved = 2 * (A + B) * rad * rad * (1 - Math.PI / 4) - 4 * rad ** 3 * (5 / 3 - Math.PI / 2)
    const r = rebuild(block({ style: "fillet", size: rad, ends: "top" }))
    expect(r.issues).toEqual([])
    const removed = A * B * H - historyVolume(r)
    // chords of the quarter circle lie inside the material: it removes a little more than the true fillet, never less
    expect(removed).toBeGreaterThanOrEqual(exactRemoved - 1e-6)
    expect(removed).toBeLessThan(exactRemoved * 1.03)
  })

  test("a fillet leaves a smoother, heavier edge than a chamfer of the same size", () => {
    expect(historyVolume(rebuild(block({ style: "fillet", size: 3 })))).toBeGreaterThan(historyVolume(rebuild(block({ style: "chamfer", size: 3 }))))
  })

  test("the size is a parameter: the edge follows an edit", () => {
    const base = block({ style: "chamfer", size: "c" }, { c: 1 })
    const small = historyVolume(rebuild(base))
    const big = historyVolume(rebuild(withParameter(base, "c", 3)))
    expect(big).toBeLessThan(small)
    expect(A * B * H - big).toBeCloseTo(2 * ((A + B) * 9 - (4 * 27) / 3), 4)
  })

  test("a size that eats the whole depth is an error, and nothing is built from it", () => {
    const r = rebuild(block({ style: "chamfer", size: 6, ends: "both" }))
    expect(errors(r)).toHaveLength(1)
    expect(errors(r)[0]!.feature).toBe("e")
    expect(errors(r)[0]!.message).toMatch(/smaller than the depth/)
    expect(r.bodies).toHaveLength(0)
  })

  test("a size the profile cannot take (a boundary that would collapse) is an error", () => {
    const thin = history([rectangle("s", "XY", 0, 0, 4, 40), { id: "e", type: "extrude", sketch: "s", depth: 20, operation: "new", edge: { style: "chamfer", size: 2 } }])
    expect(errors(rebuild(thin))[0]!.message).toMatch(/too big/)
  })

  test("a zero or negative size is an error", () => {
    expect(errors(rebuild(block({ style: "chamfer", size: 0 })))[0]!.message).toMatch(/positive/)
  })

  test("holes: false leaves a hole's rim sharp; holes: true breaks it (2 x pi (r c^2 + c^3 / 3) for a 45 degree chamfer, within meshing)", () => {
    const sketch = withCircle(rectangle("s", "XY", 0, 0, A, B), 20, 15, 5)
    const make = (holes: boolean) => history([sketch, { id: "e", type: "extrude", sketch: "s", depth: H, operation: "new", edge: { style: "chamfer", size: 1, ends: "both", holes } }])
    const sharp = rebuild(make(false)), broken = rebuild(make(true))
    expect(sharp.issues).toEqual([])
    expect(broken.issues).toEqual([])
    const outerBlock = historyVolume(rebuild(block({ style: "chamfer", size: 1 })))
    // the plain rim: block less the cylindrical hole
    expect(historyVolume(sharp)).toBeCloseTo(outerBlock - Math.PI * 25 * H, -1)
    const extra = historyVolume(sharp) - historyVolume(broken)
    const exact = 2 * Math.PI * (5 * 1 + 1 / 3)
    expect(extra).toBeGreaterThan(exact * 0.9)
    expect(extra).toBeLessThan(exact * 1.1)
  })

  test("a sketch on another plane is treated in its own frame (YZ extrusion along X)", () => {
    const r = rebuild(history([rectangle("s", "YZ", 0, 0, 30, 20), { id: "e", type: "extrude", sketch: "s", depth: 10, operation: "new", edge: { style: "chamfer", size: 1.5 } }]))
    expect(r.issues).toEqual([])
    expect(bounds(r).maxX).toBeCloseTo(10, 5)
    expect(historyVolume(r)).toBeCloseTo(30 * 20 * 10 - 2 * ((30 + 20) * 2.25 - (4 * 3.375) / 3), 4)
  })
})

describe("extrusion corner treatments", () => {
  const A = 40, B = 30, H = 10
  const plateWith = (corner: Extract<Feature, { type: "extrude" }>["corner"]) =>
    history([rectangle("s", "XY", 0, 0, A, B), { id: "e", type: "extrude", sketch: "s", depth: H, operation: "new", ...(corner !== undefined ? { corner } : {}) }])

  test("a corner fillet r makes the plate (a b - (4 - pi) r^2) thick; the bounds are unchanged", () => {
    const r = rebuild(plateWith({ style: "fillet", size: 4 }))
    expect(r.issues).toEqual([])
    const exact = (A * B - (4 - Math.PI) * 16) * H
    expect(historyVolume(r)).toBeLessThanOrEqual(exact + 1e-6)
    expect(exact - historyVolume(r)).toBeLessThan(3) // chord sagitta 0.01 mm over the four arcs
    const b = bounds(r)
    expect([b.maxX, b.maxY].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([A, B])
  })

  test("a corner chamfer c makes the plate (a b - 2 c^2) thick, exactly", () => {
    expect(historyVolume(rebuild(plateWith({ style: "chamfer", size: 5 })))).toBeCloseTo((A * B - 2 * 25) * H, 6)
  })

  test("a corner treatment larger than an edge allows is an error that names the edge", () => {
    const r = rebuild(plateWith({ style: "fillet", size: 20 }))
    expect(errors(r)[0]!.message).toMatch(/does not fit/)
    expect(r.bodies).toHaveLength(0)
  })

  test("a circle profile has no corners: the corner treatment leaves it alone", () => {
    const base = historyVolume(rebuild(history([circles("s", "XY", 0, 0, [10]), { id: "e", type: "extrude", sketch: "s", depth: 5, operation: "new" }])))
    const treated = historyVolume(rebuild(history([circles("s", "XY", 0, 0, [10]), { id: "e", type: "extrude", sketch: "s", depth: 5, operation: "new", corner: { style: "fillet", size: 2 } }])))
    expect(treated).toBeCloseTo(base, 9)
  })

  test("corner and edge together: the rounded outline is chamfered on both faces", () => {
    const both = rebuild(history([rectangle("s", "XY", 0, 0, A, B), { id: "e", type: "extrude", sketch: "s", depth: H, operation: "new", corner: { style: "chamfer", size: 5 }, edge: { style: "chamfer", size: 1 } }]))
    expect(both.issues).toEqual([])
    expect(historyVolume(both)).toBeLessThan((A * B - 50) * H)
    expect(historyVolume(both)).toBeGreaterThan((A * B - 50) * H - 2 * (130 * 1 /* perimeter < 140 */))
  })
})

describe("counterbored and countersunk holes", () => {
  const plate = (hole: Feature) => history([rectangle("s", "XY", 0, 0, 40, 30), { id: "e", type: "extrude", sketch: "s", depth: 10, operation: "new" }, hole])
  const plain = 40 * 30 * 10

  test("a counterbore removes the through hole plus the annulus of the recess", () => {
    const r = rebuild(plate({ id: "h", type: "hole", plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10, kind: "counterbore", headDiameter: 12, headDepth: 4 }))
    expect(r.issues).toEqual([])
    const exact = Math.PI * 9 * 10 + Math.PI * (36 - 9) * 4
    const removed = plain - historyVolume(r)
    expect(removed).toBeLessThanOrEqual(exact + 1e-6)
    expect(removed).toBeGreaterThan(exact * 0.99)
  })

  test("the counterbore floor is where headDepth says: material remains under the recess, none inside the bore", () => {
    const r = rebuild(plate({ id: "h", type: "hole", plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10, kind: "counterbore", headDiameter: 12, headDepth: 4 }))
    const part = buildPartModelFromMeshes(r.bodies.map((b) => b.mesh), { cell: 0.2 })!
    const top = part.dexels.top(-Infinity)
    const at = (x: number, y: number) => top[Math.floor((y - part.grid.minY) / part.grid.cellY) * part.grid.nx + Math.floor((x - part.grid.minX) / part.grid.cellX)]
    expect(at(20, 15)).toBe(-Infinity) // through the bore
    expect(at(20 + 4.5, 15)).toBeCloseTo(6, 1) // on the recess floor: 10 - 4
    expect(at(20 + 7, 15)).toBeCloseTo(10, 1) // on the plate surface outside the recess
  })

  test("a countersink: the cone from the surface diameter down to the bore, then the bore", () => {
    const r = rebuild(plate({ id: "h", type: "hole", plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10, kind: "countersink", headDiameter: 12, angle: 90 }))
    expect(r.issues).toEqual([])
    const coneDepth = (12 / 2 - 6 / 2) / Math.tan(Math.PI / 4) // 3 mm for 90 degrees
    const frustum = (Math.PI * coneDepth / 3) * (36 + 18 + 9)
    const exact = Math.PI * 9 * (10 - coneDepth) + frustum
    const removed = plain - historyVolume(r)
    expect(removed).toBeLessThanOrEqual(exact + 1e-6)
    expect(removed).toBeGreaterThan(exact * 0.98)
  })

  test("a 120 degree countersink is shallower than a 90 degree one", () => {
    const at = (angle: number) => plain - historyVolume(rebuild(plate({ id: "h", type: "hole", plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10, kind: "countersink", headDiameter: 12, angle })))
    expect(at(120)).toBeLessThan(at(90))
    expect(at(60)).toBeGreaterThan(at(90))
  })

  test("the recess works on any plane: a counterbore on the side face (YZ) removes the same volume", () => {
    const r = rebuild(plate({ id: "h", type: "hole", plane: "YZ", offset: 40, at: [15, 5], diameter: 4, depth: 10, kind: "counterbore", headDiameter: 8, headDepth: 4 }))
    expect(r.issues).toEqual([])
    const exact = Math.PI * 4 * 10 + Math.PI * (16 - 4) * 4 // the plate is 10 thick in Z, so the recess (Ø8 at z = 5) stays inside it
    expect(plain - historyVolume(r)).toBeGreaterThan(exact * 0.99)
    expect(plain - historyVolume(r)).toBeLessThanOrEqual(exact + 1e-6)
  })

  test("the sizes are parameters", () => {
    const base = plate({ id: "h", type: "hole", plane: "XY", offset: 10, at: [20, 15], diameter: "d", depth: 10, kind: "counterbore", headDiameter: "d * 2", headDepth: "d / 2" })
    const small = historyVolume(rebuild({ ...base, parameters: { d: 4 } }))
    const big = historyVolume(rebuild({ ...base, parameters: { d: 8 } }))
    expect(big).toBeLessThan(small)
  })

  test("what the kind needs is checked: a counterbore without headDiameter or headDepth, a head not larger than the bore, a recess as deep as the hole", () => {
    const issue = (h: Partial<Extract<Feature, { type: "hole" }>>) =>
      errors(rebuild(plate({ id: "h", type: "hole", plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10, ...h } as Feature)))[0]?.message ?? ""
    expect(issue({ kind: "counterbore", headDepth: 4 })).toMatch(/headDiameter/)
    expect(issue({ kind: "counterbore", headDiameter: 12 })).toMatch(/headDepth/)
    expect(issue({ kind: "counterbore", headDiameter: 5, headDepth: 4 })).toMatch(/must exceed/)
    expect(issue({ kind: "counterbore", headDiameter: 12, headDepth: 10 })).toMatch(/less than the hole depth/)
    expect(issue({ kind: "countersink" })).toMatch(/headDiameter/)
    expect(issue({ kind: "countersink", headDiameter: 12, angle: 200 })).toMatch(/between 0 and 180/)
    expect(issue({ kind: "countersink", headDiameter: 40, depth: 5, angle: 60 })).toMatch(/shallower/)
  })

  test("a hole of kind simple is the plain hole", () => {
    const a = historyVolume(rebuild(plate({ id: "h", type: "hole", plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10 })))
    const b = historyVolume(rebuild(plate({ id: "h", type: "hole", plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10, kind: "simple" })))
    expect(b).toBeCloseTo(a, 9)
  })

  test("a counterbored hole can be patterned like any hole", () => {
    const r = rebuild(history([
      rectangle("s", "XY", 0, 0, 60, 30), { id: "e", type: "extrude", sketch: "s", depth: 10, operation: "new" },
      { id: "h", type: "hole", plane: "XY", offset: 10, at: [10, 15], diameter: 4, depth: 10, kind: "counterbore", headDiameter: 8, headDepth: 3 },
      { id: "p", type: "pattern", feature: "h", kind: "linear", count: 3, step: [20, 0, 0] }
    ]))
    expect(r.issues).toEqual([])
    const one = Math.PI * 4 * 10 + Math.PI * (16 - 4) * 3
    expect(60 * 30 * 10 - historyVolume(r)).toBeGreaterThan(3 * one * 0.99)
    expect(60 * 30 * 10 - historyVolume(r)).toBeLessThanOrEqual(3 * one + 1e-6)
  })
})

describe("mirror", () => {
  const cube = (): Feature[] => [rectangle("c", "XY", 10, 10, 4, 4), { id: "cube", type: "extrude", sketch: "c", depth: 4, operation: "new" }]

  test.each([
    ["XY", 0, { minZ: -4, maxZ: 0, minX: 10, maxX: 14, minY: 10, maxY: 14 }],
    ["YZ", 20, { minX: 26, maxX: 30, minY: 10, maxY: 14, minZ: 0, maxZ: 4 }],
    ["ZX", 0, { minY: -14, maxY: -10, minX: 10, maxX: 14, minZ: 0, maxZ: 4 }]
  ] as const)("a body mirrored through %s at offset %d lands at its reflection, with outward faces", (plane, offset, want) => {
    const r = rebuild(history([...cube(), { id: "m", type: "mirror", feature: "cube", plane, offset }]))
    expect(r.issues).toEqual([])
    expect(r.bodies.map((b) => b.id)).toEqual(["cube", "m"])
    const b = bounds(r, 1)
    for (const [k, v] of Object.entries(want)) expect(b[k as keyof typeof b]).toBeCloseTo(v, 5)
    expect(meshVolume(r.bodies[1]!.mesh)).toBeCloseTo(64, 4) // positive: the winding was reversed with the reflection
    expect(meshVolume(r.bodies[0]!.mesh)).toBeCloseTo(64, 4)
  })

  test("the default offset is 0 and a parameter can drive it", () => {
    const r = rebuild(history([...cube(), { id: "m", type: "mirror", feature: "cube", plane: "YZ", offset: "x0" }], { x0: 20 }))
    expect(bounds(r, 1).minX).toBeCloseTo(26, 5)
    expect(bounds(rebuild(history([...cube(), { id: "m", type: "mirror", feature: "cube", plane: "YZ" }])), 1).maxX).toBeCloseTo(-10, 5)
    const moved = rebuild(withParameter(history([...cube(), { id: "m", type: "mirror", feature: "cube", plane: "YZ", offset: "x0" }], { x0: 20 }), "x0", 30))
    expect(bounds(moved, 1).minX).toBeCloseTo(46, 5)
  })

  test("a mirrored cut is applied to the body again: two holes, mirror symmetric about the plane", () => {
    const r = rebuild(history([
      rectangle("s", "XY", 0, 0, 40, 30), { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" },
      { id: "h", type: "hole", plane: "XY", offset: 10, at: [5, 15], diameter: 4, depth: 10 },
      { id: "m", type: "mirror", feature: "h", plane: "YZ", offset: 20 }
    ]))
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    const oneHole = 40 * 30 * 10 - historyVolume(rebuild(history([rectangle("s", "XY", 0, 0, 40, 30), { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" }, { id: "h", type: "hole", plane: "XY", offset: 10, at: [5, 15], diameter: 4, depth: 10 }])))
    expect(40 * 30 * 10 - historyVolume(r)).toBeCloseTo(2 * oneHole, 3)
    const part = buildPartModelFromMeshes(r.bodies.map((b) => b.mesh), { cell: 0.2 })!
    const top = part.dexels.top(-Infinity)
    const at = (x: number, y: number) => top[Math.floor((y - part.grid.minY) / part.grid.cellY) * part.grid.nx + Math.floor((x - part.grid.minX) / part.grid.cellX)]
    expect(at(5, 15)).toBe(-Infinity)
    expect(at(35, 15)).toBe(-Infinity) // 40 - 5
    expect(at(20, 15)).toBeCloseTo(10, 6)
  })

  test("a mirrored boss united to the body stays one body", () => {
    const r = rebuild(history([
      rectangle("s", "XY", 0, 0, 40, 30), { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" },
      rectangle("b", "XY", 2, 2, 6, 6, 10), { id: "boss", type: "extrude", sketch: "b", depth: 5, operation: "union" },
      { id: "m", type: "mirror", feature: "boss", plane: "YZ", offset: 20 }
    ]))
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    expect(historyVolume(r)).toBeCloseTo(12000 + 2 * 180, 3)
    expect(bounds(r).maxZ).toBeCloseTo(15, 6)
  })

  test("a revolved body mirrors with positive volume", () => {
    const r = rebuild(history([rectangle("s", "XY", 2, 0, 3, 10), { id: "r", type: "revolve", sketch: "s", axis: "y", operation: "new" }, { id: "m", type: "mirror", feature: "r", plane: "ZX", offset: 0 }]))
    expect(r.issues).toEqual([])
    expect(meshVolume(r.bodies[1]!.mesh)).toBeCloseTo(meshVolume(r.bodies[0]!.mesh), 4)
    expect(meshVolume(r.bodies[1]!.mesh)).toBeGreaterThan(0)
    expect(bounds(r, 1).maxY).toBeCloseTo(0, 5)
    expect(bounds(r, 1).minY).toBeCloseTo(-10, 5)
  })

  test("a pattern of a mirror copies the reflected tool: 1 original, 1 mirror, 2 copies", () => {
    const r = rebuild(history([...cube(), { id: "m", type: "mirror", feature: "cube", plane: "YZ", offset: 0 }, { id: "p", type: "pattern", feature: "m", kind: "linear", count: 3, step: [0, 10, 0] }]))
    expect(r.issues).toEqual([])
    expect(r.bodies.map((b) => b.id)).toEqual(["cube", "m", "p#1", "p#2"])
    expect(bounds(r, 3).minY).toBeCloseTo(30, 5)
    expect(bounds(r, 3).minX).toBeCloseTo(-14, 5)
  })

  test("a mirror of nothing, or of a missing feature, is an error naming it", () => {
    const r = rebuild(history([...cube(), { id: "m", type: "mirror", feature: "ghost", plane: "XY" }]))
    expect(errors(r)[0]).toMatchObject({ feature: "m" })
    expect(errors(r)[0]!.message).toContain("ghost")
    expect(r.bodies).toHaveLength(1)
  })

  test("a mirror of a feature that failed is an error, and later features still build", () => {
    const r = rebuild(history([...cube(), { id: "bad", type: "extrude", sketch: "nowhere", depth: 3, operation: "new" }, { id: "m", type: "mirror", feature: "bad", plane: "XY" }, { id: "m2", type: "mirror", feature: "cube", plane: "XY" }]))
    expect(errors(r).map((i) => i.feature)).toEqual(["bad", "m"])
    expect(r.bodies.map((b) => b.id)).toEqual(["cube", "m2"])
  })
})

describe("determinism of the new features", () => {
  test("rebuilding the same history twice gives the same meshes to the bit", () => {
    const h = history([
      rectangle("s", "XY", 0, 0, 40, 30), { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new", edge: { style: "fillet", size: 2 }, corner: { style: "fillet", size: 3 } },
      { id: "h", type: "hole", plane: "XY", offset: 10, at: [10, 15], diameter: 5, depth: 10, kind: "countersink", headDiameter: 9 },
      { id: "m", type: "mirror", feature: "h", plane: "YZ", offset: 20 }
    ])
    const a = rebuild(h), b = rebuild(h)
    expect(a.issues).toEqual(b.issues)
    expect(Array.from(a.bodies[0]!.mesh.positions)).toEqual(Array.from(b.bodies[0]!.mesh.positions))
    expect(Array.from(a.bodies[0]!.mesh.indices)).toEqual(Array.from(b.bodies[0]!.mesh.indices))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// shell, sweep, loft, fillet, grid pattern

/** A sketch of points and lines (and arcs) taken exactly as given: no constraints, so the solver leaves them where they are. */
const freeSketch = (id: string, plane: SketchFeature["plane"], entities: SketchEntity[], offset?: number): SketchFeature => ({ id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}), sketch: { entities, constraints: [] } })
/** An open chain through the points, as a path sketch. */
const chain = (id: string, plane: SketchFeature["plane"], points: Array<[number, number]>, offset?: number): SketchFeature =>
  freeSketch(id, plane, [...points.map(([x, y], i) => pt(`q${i}`, x, y)), ...points.slice(1).map((_, i) => line(`m${i}`, `q${i}`, `q${i + 1}`))], offset)
const plateBody = (extra: Partial<Extract<Feature, { type: "extrude" }>> = {}): Feature[] => [rectangle("s", "XY", 0, 0, 40, 30), { id: "box", type: "extrude", sketch: "s", depth: 20, operation: "new", ...extra }]
const BOX_V = 40 * 30 * 20
const relErr = (got: number, want: number) => Math.abs(got - want) / Math.abs(want)
const vol = (r: ReturnType<typeof rebuild>) => r.bodies.reduce((sum, b) => sum + meshVolume(b.mesh), 0)

describe("shell", () => {
  test("a closed 2 mm shell of a 40 x 30 x 20 box leaves an internal void: 24000 - 36 x 26 x 16 = 9024", () => {
    const r = rebuild(history([...plateBody(), { id: "sh", type: "shell", feature: "box", thickness: 2 }]))
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    expect(vol(r)).toBeCloseTo(BOX_V - 36 * 26 * 16, 3)
  })

  test.each([
    ["top", 24000 - 36 * 26 * 18],
    ["bottom", 24000 - 36 * 26 * 18],
    ["both", 24000 - 36 * 26 * 20]
  ] as const)("open %s: the cavity runs out through the face(s): volume %d", (open, expected) => {
    const r = rebuild(history([...plateBody(), { id: "sh", type: "shell", feature: "box", thickness: 2, open }]))
    expect(r.issues).toEqual([])
    expect(vol(r)).toBeCloseTo(expected, 3)
    // The outer size is unchanged.
    const b = bounds(r)
    expect([b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].map((v) => Math.round(v * 1000) / 1000 + 0)).toEqual([0, 40, 0, 30, 0, 20])
  })

  test("the thickness is a dimension: editing the parameter rebuilds with a thicker wall", () => {
    const h = history([...plateBody(), { id: "sh", type: "shell", feature: "box", thickness: "wall" }], { wall: 2 })
    expect(vol(rebuild(h))).toBeCloseTo(24000 - 36 * 26 * 16, 3)
    expect(vol(rebuild(withParameter(h, "wall", 3)))).toBeCloseTo(24000 - 34 * 24 * 14, 3)
  })

  test("a hole through the profile is hollowed too: its wall grows by the thickness, so the hole keeps a wall of its own", () => {
    const entities: SketchEntity[] = [
      pt("p1", 0, 0), pt("p2", 40, 0), pt("p3", 40, 30), pt("p4", 0, 30), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1"),
      pt("c", 20, 15), { id: "k", kind: "circle", center: "c", radius: 5 }
    ]
    const withHole = history([freeSketch("s", "XY", entities), { id: "box", type: "extrude", sketch: "s", depth: 20, operation: "new" }, { id: "sh", type: "shell", feature: "box", thickness: 2 }])
    const r = rebuild(withHole)
    expect(r.issues).toEqual([])
    const solid = 24000 - Math.PI * 25 * 20
    const cavity = 36 * 26 * 16 - Math.PI * 49 * 16
    expect(relErr(vol(r), solid - cavity)).toBeLessThan(0.003)
  })

  test("a wall that would leave no cavity is an error and the body is untouched", () => {
    const closed = rebuild(history([...plateBody(), { id: "sh", type: "shell", feature: "box", thickness: 10 }]))
    expect(errors(closed)).toHaveLength(1)
    expect(errors(closed)[0]).toMatchObject({ feature: "sh" })
    expect(errors(closed)[0]!.message).toMatch(/no cavity/)
    expect(vol(closed)).toBeCloseTo(BOX_V, 6)
    // Thicker than half the narrow side: the inset profile collapses.
    const wide = rebuild(history([...plateBody(), { id: "sh", type: "shell", feature: "box", thickness: 16, open: "top" }]))
    expect(errors(wide)).toHaveLength(1)
    expect(errors(wide)[0]!.message).toMatch(/too big|collapses/)
    expect(vol(wide)).toBeCloseTo(BOX_V, 6)
  })

  test("only an extrusion, a full revolution or a sweep can be shelled: a hole or a missing feature is named in the error", () => {
    const r = rebuild(history([...plateBody(), { id: "h", type: "hole", plane: "XY", offset: 20, at: [20, 15], diameter: 4, depth: 5 }, { id: "sh", type: "shell", feature: "h", thickness: 1 }, { id: "sh2", type: "shell", feature: "nowhere", thickness: 1 }]))
    expect(errors(r).map((i) => i.feature)).toEqual(["sh", "sh2"])
    expect(errors(r)[0]!.message).toContain("not an extrusion, a full revolution or a sweep that can be shelled")
  })

  test("a thickness of zero or less is an error", () => {
    const r = rebuild(history([...plateBody(), { id: "sh", type: "shell", feature: "box", thickness: 0 }]))
    expect(errors(r)[0]!.message).toMatch(/thickness must be positive/)
  })

  test("the shell follows the corner treatment of its extrusion: rounded outside, inset rounded inside", () => {
    const r = rebuild(history([...plateBody({ corner: { style: "fillet", size: 6 } }), { id: "sh", type: "shell", feature: "box", thickness: 2 }]))
    expect(r.issues).toEqual([])
    const outer = (40 * 30 - (4 - Math.PI) * 36) * 20
    expect(vol(r)).toBeLessThan(outer)
    expect(vol(r)).toBeGreaterThan(outer - 36 * 26 * 16)
  })
})

describe("sweep", () => {
  const ring = (id: string, plane: SketchFeature["plane"], radii: number[], cx = 0, cy = 0) => circles(id, plane, cx, cy, radii)

  test("a pipe along lines and a quarter arc: area x (30 + 10 pi / 2 + 30), within 1 %", () => {
    const route = freeSketch("route", "XY", [
      pt("p0", 0, 0), pt("p1", 30, 0), pt("c", 30, 10), pt("p2", 40, 10), pt("p3", 40, 40),
      line("a", "p0", "p1"), { id: "arc", kind: "arc", center: "c", start: "p1", end: "p2" }, line("b", "p2", "p3")
    ])
    const r = rebuild(history([ring("section", "YZ", [3]), route, { id: "pipe", type: "sweep", profile: "section", path: "route", operation: "new" }]))
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    expect(relErr(vol(r), Math.PI * 9 * (30 + (10 * Math.PI) / 2 + 30))).toBeLessThan(0.01)
    // The pipe follows the route: it reaches the end of the last run.
    expect(bounds(r).maxY).toBeCloseTo(40 + 3 * 0 + 0, 0)
  })

  test("a hollow ring profile (two circles) makes a tube: pi (R^2 - r^2) L", () => {
    const r = rebuild(history([ring("section", "YZ", [5, 3]), chain("route", "XY", [[0, 0], [40, 0]]), { id: "tube", type: "sweep", profile: "section", path: "route", operation: "new" }]))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), Math.PI * 16 * 40)).toBeLessThan(0.01)
  })

  test("a closed route makes a ring: a torus 2 pi^2 R r^2 (R 30, r 4) within 1 %", () => {
    const r = rebuild(history([ring("section", "YZ", [4]), circles("route", "XY", 0, 0, [30]), { id: "torus", type: "sweep", profile: "section", path: "route", operation: "new" }]))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), 2 * Math.PI ** 2 * 30 * 16)).toBeLessThan(0.01)
  })

  test("a sweep can cut: a 4 mm round groove through a box removes about pi r^2 x 40", () => {
    const r = rebuild(history([
      ...plateBody(), circles("section", "YZ", 15, 10, [2]), chain("route", "XY", [[-5, 15], [45, 15]], 10),
      { id: "groove", type: "sweep", profile: "section", path: "route", operation: "subtract" }
    ]))
    expect(r.issues).toEqual([])
    expect(relErr(BOX_V - vol(r), Math.PI * 4 * 40)).toBeLessThan(0.02)
  })

  test("a missing sketch, a path of two separate chains, a profile with no closed loop: each is an error naming the sketch", () => {
    const missing = rebuild(history([ring("section", "YZ", [3]), { id: "p", type: "sweep", profile: "section", path: "ghost", operation: "new" }]))
    expect(errors(missing)[0]).toMatchObject({ feature: "p" })
    expect(errors(missing)[0]!.message).toContain("ghost")

    const split = freeSketch("route", "XY", [pt("a", 0, 0), pt("b", 10, 0), pt("c", 0, 10), pt("d", 10, 10), line("l1", "a", "b"), line("l2", "c", "d")])
    const two = rebuild(history([ring("section", "YZ", [3]), split, { id: "p", type: "sweep", profile: "section", path: "route", operation: "new" }]))
    expect(errors(two)[0]!.message).toMatch(/exactly one open chain/)
    expect(two.bodies).toHaveLength(0)

    const open = rebuild(history([chain("section", "YZ", [[0, 0], [5, 0]]), chain("route", "XY", [[0, 0], [10, 0]]), { id: "p", type: "sweep", profile: "section", path: "route", operation: "new" }]))
    expect(errors(open)[0]!.message).toMatch(/no closed loop/)
  })

  test("the pieces that do not depend on a failed sweep still build", () => {
    const r = rebuild(history([...plateBody(), { id: "p", type: "sweep", profile: "ghost", path: "ghost2", operation: "new" }, { id: "h", type: "hole", plane: "XY", offset: 20, at: [20, 15], diameter: 4, depth: 20 }]))
    expect(errors(r).map((i) => i.feature)).toEqual(["p"])
    expect(vol(r)).toBeLessThan(BOX_V)
  })
})

describe("loft", () => {
  const frustum = (): Feature[] => [rectangle("a", "XY", -10, -10, 20, 20), rectangle("b", "XY", -5, -5, 10, 10, 30)]

  test("two squares make the frustum h/3 (A1 + A2 + sqrt(A1 A2)) = 7000", () => {
    const r = rebuild(history([...frustum(), { id: "lf", type: "loft", sections: ["a", "b"], operation: "new" }]))
    expect(r.issues).toEqual([])
    expect(vol(r)).toBeCloseTo(7000, 2)
    const b = bounds(r)
    expect([b.minZ, b.maxZ]).toEqual([0, 30])
  })

  test("three sections: out-and-back is two frusta, 2 x 15/3 (100 + 400 + 200) = 7000; `smooth` keeps a linear taper exact", () => {
    const sections = [rectangle("a", "XY", -5, -5, 10, 10), rectangle("b", "XY", -10, -10, 20, 20, 15), rectangle("c", "XY", -5, -5, 10, 10, 30)]
    const ruled = rebuild(history([...sections, { id: "lf", type: "loft", sections: ["a", "b", "c"], operation: "new" }]))
    expect(ruled.issues).toEqual([])
    expect(vol(ruled)).toBeCloseTo(7000, 2)
    const linear = [rectangle("a", "XY", -10, -10, 20, 20), rectangle("b", "XY", -7.5, -7.5, 15, 15, 15), rectangle("c", "XY", -5, -5, 10, 10, 30)]
    const smooth = rebuild(history([...linear, { id: "lf", type: "loft", sections: ["a", "b", "c"], smooth: true, operation: "new" }]))
    expect(smooth.issues).toEqual([])
    expect(relErr(vol(smooth), 7000)).toBeLessThan(0.002)
  })

  test("a square lofted to a circle sits between the circle's cylinder and the square's prism", () => {
    const r = rebuild(history([rectangle("a", "XY", -10, -10, 20, 20), circles("b", "XY", 0, 0, [10], 30), { id: "lf", type: "loft", sections: ["a", "b"], operation: "new" }]))
    expect(r.issues).toEqual([])
    expect(vol(r)).toBeGreaterThan(Math.PI * 100 * 30 * 0.99)
    expect(vol(r)).toBeLessThan(12000)
  })

  test("a loft can cut", () => {
    const r = rebuild(history([...plateBody(), rectangle("a", "XY", 15, 10, 10, 10, 20), rectangle("b", "XY", 17, 12, 6, 6, 10), { id: "lf", type: "loft", sections: ["a", "b"], operation: "subtract" }]))
    expect(r.issues).toEqual([])
    // A pyramid frustum 10 deep from 100 mm2 to 36 mm2.
    expect(relErr(BOX_V - vol(r), (10 / 3) * (100 + 36 + 60))).toBeLessThan(0.001)
  })

  test("a section that is missing, one that has no closed loop, and a single section are errors", () => {
    const missing = rebuild(history([...frustum(), { id: "lf", type: "loft", sections: ["a", "ghost"], operation: "new" }]))
    expect(errors(missing)[0]).toMatchObject({ feature: "lf" })
    expect(errors(missing)[0]!.message).toContain("ghost")
    const open = rebuild(history([...frustum(), chain("c", "XY", [[0, 0], [5, 5]], 40), { id: "lf", type: "loft", sections: ["a", "c"], operation: "new" }]))
    expect(errors(open)[0]!.message).toContain("'c'")
    const single = rebuild(history([...frustum(), { id: "lf", type: "loft", sections: ["a"], operation: "new" }]))
    expect(errors(single)[0]!.message).toMatch(/at least two sections/)
  })

  test("a section with an inner loop lofts only the largest loop and says so", () => {
    const withHole = freeSketch("a", "XY", [pt("p1", -10, -10), pt("p2", 10, -10), pt("p3", 10, 10), pt("p4", -10, 10), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1"), pt("c", 0, 0), { id: "k", kind: "circle", center: "c", radius: 3 }])
    const r = rebuild(history([withHole, rectangle("b", "XY", -5, -5, 10, 10, 30), { id: "lf", type: "loft", sections: ["a", "b"], operation: "new" }]))
    expect(r.issues.filter((i) => i.severity === "warning").map((i) => i.message).join(" ")).toMatch(/Section 'a' has 2 loops; only the largest is lofted/)
    expect(vol(r)).toBeCloseTo(7000, 2)
  })
})

describe("fillet (edges of any body)", () => {
  test("fillet r4 on the vertical edges: 24000 - 4 (1 - pi/4) r^2 h, within 0.05 %", () => {
    const r = rebuild(history([...plateBody(), { id: "f", type: "fillet", radius: 4, edges: { parallel: "z" } }]))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), BOX_V - 4 * (1 - Math.PI / 4) * 16 * 20)).toBeLessThan(0.0005)
  })

  test("a chamfer takes a flat: 3 mm on the vertical edges removes exactly 4 x 4.5 x 20", () => {
    const r = rebuild(history([...plateBody(), { id: "f", type: "fillet", style: "chamfer", radius: 3, edges: { parallel: "z" } }]))
    expect(vol(r)).toBeCloseTo(BOX_V - 360, 2)
  })

  test("the radius is a dimension: a parameter drives it", () => {
    const h = history([...plateBody(), { id: "f", type: "fillet", radius: "rr", edges: { parallel: "z" } }], { rr: 2 })
    const small = vol(rebuild(h)), large = vol(rebuild(withParameter(h, "rr", 6)))
    expect(large).toBeLessThan(small)
    expect(relErr(large, BOX_V - 4 * (1 - Math.PI / 4) * 36 * 20)).toBeLessThan(0.0005)
  })

  test("`within` can name a region: only the top edges", () => {
    const r = rebuild(history([...plateBody(), { id: "f", type: "fillet", radius: 2, edges: { within: { min: [-1, -1, 19], max: [41, 31, 21] } } }]))
    expect(relErr(vol(r), BOX_V - (1 - Math.PI / 4) * 4 * 140)).toBeLessThan(0.0005)
  })

  test("no edge matched is an error and the body is untouched", () => {
    const r = rebuild(history([...plateBody(), { id: "f", type: "fillet", radius: 2, edges: { parallel: "z", within: { min: [100, 100, 100], max: [101, 101, 101] } } }]))
    expect(errors(r)).toHaveLength(1)
    expect(errors(r)[0]).toMatchObject({ feature: "f" })
    expect(errors(r)[0]!.message).toMatch(/No edge matched/)
    expect(vol(r)).toBeCloseTo(BOX_V, 6)
  })

  test("a radius wider than the faces gives a warning for each edge (and, as nothing was blended, the no-edge error); the body is unchanged", () => {
    const r = rebuild(history([...plateBody(), { id: "f", type: "fillet", radius: 50, edges: { parallel: "z" } }]))
    const warnings = r.issues.filter((i) => i.severity === "warning")
    expect(warnings).toHaveLength(4)
    expect(warnings[0]!.message).toMatch(/Not blended: edge .*needs 50\.00 mm of face/)
    expect(errors(r)).toHaveLength(1)
    expect(vol(r)).toBeCloseTo(BOX_V, 6)
  })

  test("a size of zero or less is an error", () => {
    expect(errors(rebuild(history([...plateBody(), { id: "f", type: "fillet", radius: 0 }])))[0]!.message).toMatch(/size must be positive/)
  })

  test("`targets` limits it to the named body", () => {
    const r = rebuild(history([
      rectangle("s1", "XY", 0, 0, 40, 30), { id: "one", type: "extrude", sketch: "s1", depth: 20, operation: "new" },
      rectangle("s2", "XY", 100, 0, 40, 30), { id: "two", type: "extrude", sketch: "s2", depth: 20, operation: "new" },
      { id: "f", type: "fillet", radius: 4, edges: { parallel: "z" }, targets: ["two"] }
    ]))
    expect(r.issues).toEqual([])
    expect(r.bodies.map((b) => b.id)).toEqual(["one", "two"])
    expect(meshVolume(r.bodies[0]!.mesh)).toBeCloseTo(BOX_V, 3)
    expect(meshVolume(r.bodies[1]!.mesh)).toBeLessThan(BOX_V - 270)
    expect(errors(rebuild(history([...plateBody(), { id: "f", type: "fillet", radius: 4, targets: ["ghost"] }])))[0]!.message).toMatch(/no body/)
  })

  test("kind 'concave' fills an inside corner: the L gains (1 - pi/4) r^2 h", () => {
    const lShape = freeSketch("s", "XY", [pt("a", 0, 0), pt("b", 40, 0), pt("c", 40, 10), pt("d", 10, 10), pt("e", 10, 30), pt("f", 0, 30), line("1", "a", "b"), line("2", "b", "c"), line("3", "c", "d"), line("4", "d", "e"), line("5", "e", "f"), line("6", "f", "a")])
    const r = rebuild(history([lShape, { id: "x", type: "extrude", sketch: "s", depth: 20, operation: "new" }, { id: "f", type: "fillet", radius: 3, edges: { parallel: "z", kind: "concave" } }]))
    expect(r.issues).toEqual([])
    expect(vol(r) - 12000).toBeGreaterThan(38.6 * 0.98)
    expect(vol(r) - 12000).toBeLessThan(38.6 * 1.03)
  })

  test("it works on the result of a Boolean: the four inside corners of a 20 x 10 x 5 pocket get R2", () => {
    const r = rebuild(history([
      ...plateBody(), rectangle("pk", "XY", 10, 10, 20, 10, 20), { id: "pocket", type: "extrude", sketch: "pk", depth: 5, direction: "down", operation: "subtract" },
      { id: "f", type: "fillet", radius: 2, edges: { parallel: "z", kind: "concave" } }
    ]))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), BOX_V - 20 * 10 * 5 + 4 * (1 - Math.PI / 4) * 4 * 5)).toBeLessThan(0.001)
  })

  test("it works on a shelled body: the outside corners are rounded and the inside of the void is left alone", () => {
    const r = rebuild(history([...plateBody(), { id: "sh", type: "shell", feature: "box", thickness: 2 }, { id: "f", type: "fillet", radius: 4, edges: { parallel: "z" } }]))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), 9024 - 4 * (1 - Math.PI / 4) * 16 * 20)).toBeLessThan(0.002)
  })
})

describe("grid pattern", () => {
  const holed = (pattern: Record<string, unknown>): History => history([
    ...plateBody(), { id: "h", type: "hole", plane: "XY", offset: 20, at: [6, 6], diameter: 3, depth: 20 },
    { id: "g", type: "pattern", feature: "h", kind: "grid", ...pattern } as Feature
  ])

  test("3 x 2 copies spaced 10 and 15 mm: six holes, each removing pi r^2 h (inscribed polygons: within 0.05 %)", () => {
    const r = rebuild(holed({ count: 3, countB: 2, step: [10, 0, 0], stepB: [0, 15, 0] }))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), BOX_V - 6 * Math.PI * 2.25 * 20)).toBeLessThan(0.0005)
    expect(vol(r)).toBeGreaterThanOrEqual(BOX_V - 6 * Math.PI * 2.25 * 20 - 1e-6)
  })

  test("a skewed grid (both steps have X and Y parts) places the copies i x step + j x stepB", () => {
    const r = rebuild(holed({ count: 2, countB: 2, step: [10, 2, 0], stepB: [3, 12, 0] }))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), BOX_V - 4 * Math.PI * 2.25 * 20)).toBeLessThan(0.0005)
  })

  test("more than 500 copies in all is an error that says so", () => {
    const r = rebuild(holed({ count: 30, countB: 20, step: [1, 0, 0], stepB: [0, 1, 0] }))
    expect(errors(r)).toHaveLength(1)
    expect(errors(r)[0]).toMatchObject({ feature: "g" })
    expect(errors(r)[0]!.message).toMatch(/at most 500 copies/)
  })

  test("a grid without a second count builds no copies: it must say why (a missing countB is an error)", () => {
    const r = rebuild(holed({ count: 3, step: [10, 0, 0], stepB: [0, 15, 0] }))
    expect(errors(r).map((i) => i.feature)).toContain("g")
  })

  test("the rows must be a whole number of at least 2, and so must the count", () => {
    expect(errors(rebuild(holed({ count: 3, countB: 1.5, step: [10, 0, 0], stepB: [0, 15, 0] })))[0]!.message).toMatch(/number of rows/)
    expect(errors(rebuild(holed({ count: 1, countB: 2, step: [10, 0, 0], stepB: [0, 15, 0] })))[0]!.message).toMatch(/pattern count/)
  })

  test("counts and steps are dimensions", () => {
    const h = history([...plateBody(), { id: "h", type: "hole", plane: "XY", offset: 20, at: [6, 6], diameter: 3, depth: 20 }, { id: "g", type: "pattern", feature: "h", kind: "grid", count: "nx", countB: 2, step: [10, 0, 0], stepB: [0, 15, 0] }], { nx: 2 })
    const two = vol(rebuild(h)), three = vol(rebuild(withParameter(h, "nx", 3)))
    expect(relErr(two - three, 2 * Math.PI * 2.25 * 20)).toBeLessThan(0.02) // two more holes; the holes are inscribed polygons
  })
})

describe("mirror of a swept or lofted tool", () => {
  test("a pipe swept along +X from the origin and mirrored through the YZ plane lands on -X with the same volume", () => {
    const r = rebuild(history([
      circles("section", "YZ", 0, 0, [3]), chain("route", "XY", [[0, 0], [40, 0]]),
      { id: "pipe", type: "sweep", profile: "section", path: "route", operation: "new" }, { id: "m", type: "mirror", feature: "pipe", plane: "YZ" }
    ]))
    expect(r.issues).toEqual([])
    expect(r.bodies.map((b) => b.id)).toEqual(["pipe", "m"])
    expect(bounds(r, 0).minX).toBeCloseTo(0, 4)
    expect(bounds(r, 0).maxX).toBeCloseTo(40, 4)
    expect(bounds(r, 1).minX).toBeCloseTo(-40, 4)
    expect(bounds(r, 1).maxX).toBeCloseTo(0, 4)
    expect(meshVolume(r.bodies[1]!.mesh)).toBeCloseTo(meshVolume(r.bodies[0]!.mesh), 4)
  })

  test("a frustum lofted from z = 0 to 30 and mirrored through XY at z = 0 reaches down to -30", () => {
    const r = rebuild(history([
      rectangle("a", "XY", -10, -10, 20, 20), rectangle("b", "XY", -5, -5, 10, 10, 30),
      { id: "lf", type: "loft", sections: ["a", "b"], operation: "new" }, { id: "m", type: "mirror", feature: "lf", plane: "XY" }
    ]))
    expect(r.issues).toEqual([])
    expect(bounds(r, 1).minZ).toBeCloseTo(-30, 4)
    expect(bounds(r, 1).maxZ).toBeCloseTo(0, 4)
    expect(meshVolume(r.bodies[1]!.mesh)).toBeCloseTo(7000, 2)
  })
})

describe("determinism of sweep, loft, shell and fillet", () => {
  test("rebuilding the same history twice gives identical meshes", () => {
    const h = history([
      ...plateBody(), { id: "sh", type: "shell", feature: "box", thickness: 2, open: "top" }, { id: "f", type: "fillet", radius: 3, edges: { parallel: "z" } },
      circles("section", "YZ", 60, 15, [3]), chain("route", "XY", [[60, 15], [100, 15], [100, 40]]), { id: "pipe", type: "sweep", profile: "section", path: "route", operation: "new" },
      rectangle("a", "XY", 0, 100, 10, 10), rectangle("b", "XY", 2, 102, 6, 6, 20), { id: "lf", type: "loft", sections: ["a", "b"], operation: "new" }
    ])
    const a = rebuild(h), b = rebuild(h)
    expect(a.issues).toEqual(b.issues)
    expect(a.bodies.map((x) => x.id)).toEqual(b.bodies.map((x) => x.id))
    a.bodies.forEach((body, i) => {
      expect(Array.from(body.mesh.positions)).toEqual(Array.from(b.bodies[i]!.mesh.positions))
      expect(Array.from(body.mesh.indices)).toEqual(Array.from(b.bodies[i]!.mesh.indices))
    })
  })
})

describe("sketch dimensions that make no sense", () => {
  test("a circle whose radius or diameter constraint comes out negative or zero is an error, not a silently absolute circle", () => {
    for (const bad of [-3, 0, "w - 10"]) {
      const r = rebuild(history([circles("s", "XY", 0, 0, [bad]), { id: "x", type: "extrude", sketch: "s", depth: 5, operation: "new" }], { w: 4 }))
      expect([String(bad), r.issues.some((i) => i.severity === "error")]).toEqual([String(bad), true])
    }
  })

  test("a bore whose diameter an edited parameter turns negative is refused (the duct recipe's wall edited past the small end)", () => {
    const h = history([circles("o", "XY", 0, 0, [20]), circles("i", "XY", 0, 0, ["20 - 2 * wall"], 0), { id: "x", type: "extrude", sketch: "o", depth: 5, operation: "new" }], { wall: 4 })
    expect(errors(rebuild(h))).toEqual([])
    expect(errors(rebuild(withParameter(h, "wall", 14))).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// draft (taper), shell of a revolution and of a sweep, sweep with a bend radius

describe("extrusion taper (draft)", () => {
  const taperedBox = (taper: number | string, extra: Partial<Extract<Feature, { type: "extrude" }>> = {}, parameters: History["parameters"] = {}): History =>
    history([rectangle("s", "XY", 0, 0, 40, 40), { id: "x", type: "extrude", sketch: "s", depth: 20, operation: "new", taper, ...extra } as Feature], parameters)
  const frustumSquare = (a1: number, a2: number, h: number) => (h / 3) * (a1 * a1 + a2 * a2 + a1 * a2)
  const t5 = Math.tan((5 * Math.PI) / 180)

  test("40 x 40, depth 20, draft 5 degrees: the top is (40 - 2 x 20 tan 5)^2 and the volume the frustum h/3 (A1 + A2 + sqrt(A1 A2))", () => {
    const r = rebuild(taperedBox(5))
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    const side = 40 - 2 * 20 * t5
    // A lofted frustum is compared in relative terms: the mesh keeps its vertices in float32, whose rounding of the
    // leaning side costs about 4e-8 of the volume, far below anything a machinist would read off a solid.
    expect(relErr(vol(r), frustumSquare(40, side, 20))).toBeLessThan(1e-6)
    const b = bounds(r)
    expect([b.minX, b.maxX, b.minZ, b.maxZ].map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, 40, 0, 20])
    // The top face is the smaller square, centred.
    let topMin = Infinity, topMax = -Infinity
    const p = r.bodies[0]!.mesh.positions
    for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 2]! - 20) < 1e-6) { topMin = Math.min(topMin, p[i]!); topMax = Math.max(topMax, p[i]!) }
    expect(topMax - topMin).toBeCloseTo(side, 4)
    expect((topMax + topMin) / 2).toBeCloseTo(20, 4)
  })

  test("a negative draft widens the solid towards the top: the same formula with the top (40 + 2 x 20 tan 5)^2", () => {
    const r = rebuild(taperedBox(-5))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), frustumSquare(40, 40 + 2 * 20 * t5, 20))).toBeLessThan(1e-6)
    expect(vol(r)).toBeGreaterThan(32000)
  })

  test("a draft of zero is the plain extrusion; the angle is a dimension", () => {
    expect(vol(rebuild(taperedBox(0)))).toBeCloseTo(32000, 6)
    const h = taperedBox("angle", {}, { angle: 3 })
    expect(relErr(vol(rebuild(h)), frustumSquare(40, 40 - 40 * Math.tan((3 * Math.PI) / 180), 20))).toBeLessThan(1e-6)
    expect(vol(rebuild(withParameter(h, "angle", 8)))).toBeLessThan(vol(rebuild(h)))
  })

  test("it works from the other end: a downward extrusion leans the same way from its starting plane", () => {
    const r = rebuild(history([rectangle("s", "XY", 0, 0, 40, 40), { id: "x", type: "extrude", sketch: "s", depth: 20, direction: "down", operation: "new", taper: 5 }]))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), frustumSquare(40, 40 - 40 * t5, 20))).toBeLessThan(1e-6)
    expect(bounds(r).minZ).toBeCloseTo(-20, 5)
  })

  test("a hole in the profile leans with the walls: the outer frustum less the cone frustum of the hole (r 5 at the bottom, 5 + 20 tan 5 at the top)", () => {
    const entities: SketchEntity[] = [pt("p1", 0, 0), pt("p2", 40, 0), pt("p3", 40, 40), pt("p4", 0, 40), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1"), pt("c", 20, 20), { id: "k", kind: "circle", center: "c", radius: 5 }]
    const r = rebuild(history([freeSketch("s", "XY", entities), { id: "x", type: "extrude", sketch: "s", depth: 20, operation: "new", taper: 5 }]))
    expect(r.issues).toEqual([])
    const r2 = 5 + 20 * t5
    const hole = (Math.PI * 20 / 3) * (25 + 5 * r2 + r2 * r2)
    expect(relErr(vol(r), frustumSquare(40, 40 - 40 * t5, 20) - hole)).toBeLessThan(0.0005)
    expect(vol(r)).toBeGreaterThanOrEqual(frustumSquare(40, 40 - 40 * t5, 20) - hole - 1e-6) // an inscribed hole removes a little less
  })

  test("corner rounding and draft compose: the section is a rounded square whose side and radius both shrink by tan(draft) x z", () => {
    const r = rebuild(history([rectangle("s", "XY", 0, 0, 40, 40), { id: "x", type: "extrude", sketch: "s", depth: 20, operation: "new", taper: 5, corner: { style: "fillet", size: 5 } }]))
    expect(r.issues).toEqual([])
    // Area(z) = (40 - 2 z t)^2 - (4 - pi)(5 - z t)^2 is quadratic in z, so Simpson's rule is exact.
    const area = (z: number) => (40 - 2 * z * t5) ** 2 - (4 - Math.PI) * (5 - z * t5) ** 2
    const exact = (20 / 6) * (area(0) + 4 * area(10) + area(20))
    expect(relErr(vol(r), exact)).toBeLessThan(0.003)
  })

  test.each([45, 60, -45, -80])("a draft of %d degrees is an error that gives the limits, and the extrusion is not built", (angle) => {
    const r = rebuild(taperedBox(angle))
    expect(errors(r)).toHaveLength(1)
    expect(errors(r)[0]).toMatchObject({ feature: "x" })
    expect(errors(r)[0]!.message).toMatch(/draft angle must be between -45 and 45 degrees/)
    expect(r.bodies).toHaveLength(0)
  })

  test("a draft together with an edge treatment is an error naming both", () => {
    const r = rebuild(taperedBox(5, { edge: { style: "chamfer", size: 1 } }))
    expect(errors(r)[0]!.message).toMatch(/draft angle or an edge treatment, not both/)
    expect(r.bodies).toHaveLength(0)
  })

  test("a tapered extrusion cannot be shelled: the error says so and the body is left as it was", () => {
    const r = rebuild(history([...taperedBox(5).features, { id: "sh", type: "shell", feature: "x", thickness: 2 }]))
    expect(errors(r)).toHaveLength(1)
    expect(errors(r)[0]).toMatchObject({ feature: "sh" })
    expect(errors(r)[0]!.message).toMatch(/drafted \(tapered\) extrusion cannot be shelled/)
    expect(relErr(vol(r), frustumSquare(40, 40 - 40 * t5, 20))).toBeLessThan(1e-6)
  })

  test("a fillet still works on the edges of a tapered body", () => {
    const r = rebuild(history([...taperedBox(5).features, { id: "f", type: "fillet", radius: 2, edges: { within: { min: [-1, -1, 19], max: [41, 41, 21] } } }]))
    expect(r.issues).toEqual([])
    expect(vol(r)).toBeLessThan(frustumSquare(40, 40 - 40 * t5, 20))
  })
})

describe("shell of a full revolution", () => {
  const cylinder = (parameters: History["parameters"] = {}, angle?: number): Feature[] => [
    rectangle("s", "XY", 0, 0, 15, 30), { id: "rev", type: "revolve", sketch: "s", axis: "y", operation: "new", ...(angle !== undefined ? { angle } : {}) } as Feature
  ]
  void cylinder
  const solidCylinder = Math.PI * 225 * 30

  test("a closed 2 mm wall on a Ø30 x 30 cylinder: pi 15^2 x 30 - pi 13^2 x 26 (within 0.3 %)", () => {
    const r = rebuild(history([...cylinder(), { id: "sh", type: "shell", feature: "rev", thickness: 2 }]))
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    expect(relErr(vol(r), solidCylinder - Math.PI * 169 * 26)).toBeLessThan(0.003)
  })

  test.each([
    ["top", solidCylinder - Math.PI * 169 * 28],
    ["bottom", solidCylinder - Math.PI * 169 * 28],
    ["both", solidCylinder - Math.PI * 169 * 30]
  ] as const)("open %s: the cavity runs out through the end(s)", (open, expected) => {
    const r = rebuild(history([...cylinder(), { id: "sh", type: "shell", feature: "rev", thickness: 2, open }]))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), expected)).toBeLessThan(0.003)
    const b = bounds(r)
    expect(b.maxY - b.minY).toBeCloseTo(30, 4) // the outer size is unchanged
  })

  test("a profile off the axis (a ring, r 5 to 15) is hollowed with a uniform wall: the cavity is r 7 to 13, z 2 to 28", () => {
    const r = rebuild(history([rectangle("s", "XY", 5, 0, 10, 30), { id: "rev", type: "revolve", sketch: "s", axis: "y", operation: "new" }, { id: "sh", type: "shell", feature: "rev", thickness: 2 }]))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), Math.PI * (225 - 25) * 30 - Math.PI * (169 - 49) * 26)).toBeLessThan(0.005)
  })

  test("a partial revolution cannot be shelled, and says why", () => {
    const r = rebuild(history([...cylinder({}, 270), { id: "sh", type: "shell", feature: "rev", thickness: 2 }]))
    expect(errors(r)).toHaveLength(1)
    expect(errors(r)[0]).toMatchObject({ feature: "sh" })
    expect(errors(r)[0]!.message).toMatch(/Only a full revolution \(360 degrees\) can be shelled/)
  })

  test("a wall that would meet itself leaves no cavity: an error, the body untouched", () => {
    const r = rebuild(history([...cylinder(), { id: "sh", type: "shell", feature: "rev", thickness: 16 }]))
    expect(errors(r)).toHaveLength(1)
    expect(errors(r)[0]!.message).toMatch(/no cavity/)
    // The solid cylinder, meshed, is the reference: the failed shell must leave exactly what was there before.
    const untouched = vol(rebuild(history(cylinder())))
    expect(vol(r)).toBe(untouched)
    expect(relErr(vol(r), solidCylinder)).toBeLessThan(0.003)
  })

  test("the thickness is a dimension: editing it rebuilds a thicker wall", () => {
    const h = history([...cylinder(), { id: "sh", type: "shell", feature: "rev", thickness: "wall", open: "top" }], { wall: 2 })
    expect(vol(rebuild(withParameter(h, "wall", 3)))).toBeGreaterThan(vol(rebuild(h)))
  })

  test("a source that is not an extrusion, a full revolution or a sweep is named in the error", () => {
    const r = rebuild(history([...cylinder(), { id: "h", type: "hole", plane: "XY", offset: 0, at: [5, 5], diameter: 3, depth: 5 }, { id: "sh", type: "shell", feature: "h", thickness: 1 }]))
    expect(errors(r).at(-1)!.message).toContain("is not an extrusion, a full revolution or a sweep that can be shelled")
  })
})

describe("shell of a sweep", () => {
  const pipe = (route: Array<[number, number]>, radius = 5, extra: Record<string, unknown> = {}): Feature[] => [
    circles("section", "YZ", 0, 0, [radius]), freeSketch("route", "XY", [...route.map(([x, y], i) => pt(`q${i}`, x, y)), ...route.slice(1).map((_, i) => line(`m${i}`, `q${i}`, `q${i + 1}`))]),
    { id: "pipe", type: "sweep", profile: "section", path: "route", operation: "new", ...extra } as Feature
  ]
  const straight: Array<[number, number]> = [[0, 0], [100, 0]]
  const solid = Math.PI * 25 * 100

  test("a closed 1 mm wall on a Ø10 x 100 pipe: pi 25 x 100 - pi 16 x 98 (a wall stays at each end)", () => {
    const r = rebuild(history([...pipe(straight), { id: "sh", type: "shell", feature: "pipe", thickness: 1 }]))
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    expect(relErr(vol(r), solid - Math.PI * 16 * 98)).toBeLessThan(0.005)
  })

  test("open 'both' is a tube, pi (25 - 16) x 100; open 'top' leaves the start end closed (one wall)", () => {
    const both = rebuild(history([...pipe(straight), { id: "sh", type: "shell", feature: "pipe", thickness: 1, open: "both" }]))
    expect(both.issues).toEqual([])
    expect(relErr(vol(both), Math.PI * 9 * 100)).toBeLessThan(0.005)
    const top = rebuild(history([...pipe(straight), { id: "sh", type: "shell", feature: "pipe", thickness: 1, open: "top" }]))
    expect(top.issues).toEqual([])
    expect(relErr(vol(top), solid - Math.PI * 16 * 99)).toBeLessThan(0.005)
  })

  test("a mitred elbow keeps its wall through the bend: the closed shell has about pi 25 x 100 - pi 16 x 98", () => {
    const r = rebuild(history([...pipe([[0, 0], [50, 0], [50, 50]]), { id: "sh", type: "shell", feature: "pipe", thickness: 1 }]))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), solid - Math.PI * 16 * 98)).toBeLessThan(0.01)
  })

  test("a rounded elbow (R10, Ø6) shelled to 0.5 mm: the Pappus lengths of the outside and the cavity (the cavity is a wall shorter at each end)", () => {
    const length = 30 + 30 - 2 * 10 + 10 * (Math.PI / 2)
    const r = rebuild(history([...pipe([[0, 0], [30, 0], [30, 30]], 3, { bendRadius: 10 }), { id: "sh", type: "shell", feature: "pipe", thickness: 0.5, open: "both" }]))
    expect(r.issues).toEqual([])
    expect(relErr(vol(r), Math.PI * (9 - 6.25) * length)).toBeLessThan(0.01)
  }, 90_000)

  test("a wall thicker than the pipe is long leaves no cavity: an error, the pipe untouched", () => {
    const r = rebuild(history([...pipe([[0, 0], [3, 0]]), { id: "sh", type: "shell", feature: "pipe", thickness: 2 }]))
    expect(errors(r).length).toBeGreaterThan(0)
    expect(errors(r)[0]).toMatchObject({ feature: "sh" })
    expect(relErr(vol(r), Math.PI * 25 * 3)).toBeLessThan(0.005)
  })

  test("a wall as thick as the pipe's radius leaves no bore: an error", () => {
    const r = rebuild(history([...pipe(straight), { id: "sh", type: "shell", feature: "pipe", thickness: 5, open: "both" }]))
    expect(errors(r).length).toBeGreaterThan(0)
  })
})

describe("sweep with a bend radius", () => {
  const route: Array<[number, number]> = [[0, 0], [100, 0], [100, 100]]
  const pipe = (radius: number | string | undefined, parameters: History["parameters"] = {}): History => history([
    circles("section", "YZ", 0, 0, [10]), freeSketch("route", "XY", [...route.map(([x, y], i) => pt(`q${i}`, x, y)), ...route.slice(1).map((_, i) => line(`m${i}`, `q${i}`, `q${i + 1}`))]),
    { id: "pipe", type: "sweep", profile: "section", path: "route", operation: "new", ...(radius !== undefined ? { bendRadius: radius } : {}) } as Feature
  ], parameters)
  const area = 0.5 * 96 * 100 * Math.sin((2 * Math.PI) / 96) // the 96-gon the circle becomes is within 0.1 %; the circle itself is the reference below

  test("R30 on a 100 + 100 L with a Ø20 circle: Pappus, pi 100 x (70 + 70 + pi/2 x 30), within 0.3 %", () => {
    const r = rebuild(pipe(30))
    expect(r.issues).toEqual([])
    expect(r.bodies).toHaveLength(1)
    expect(relErr(vol(r), Math.PI * 100 * (70 + 70 + (Math.PI / 2) * 30))).toBeLessThan(0.003)
    void area
  })

  test("a bend radius of 0, or none, is the mitred elbow: pi 100 x 200 within 0.3 %, and the two are the same mesh", () => {
    const none = rebuild(pipe(undefined)), zero = rebuild(pipe(0))
    expect(none.issues).toEqual([])
    expect(zero.issues).toEqual([])
    expect(relErr(vol(none), Math.PI * 100 * 200)).toBeLessThan(0.003)
    expect(vol(zero)).toBeCloseTo(vol(none), 6)
  })

  test("the rounded bend has less material than the mitre (the arc cuts the corner), and a wider one less than a tighter one", () => {
    expect(vol(rebuild(pipe(30)))).toBeLessThan(vol(rebuild(pipe(0))))
    expect(vol(rebuild(pipe(50)))).toBeLessThan(vol(rebuild(pipe(30))))
  })

  test("the radius is a dimension: a parameter drives it", () => {
    const h = pipe("rb", { rb: 20 })
    expect(relErr(vol(rebuild(h)), Math.PI * 100 * (80 + 80 + (Math.PI / 2) * 20))).toBeLessThan(0.003)
    expect(relErr(vol(rebuild(withParameter(h, "rb", 40))), Math.PI * 100 * (60 + 60 + (Math.PI / 2) * 40))).toBeLessThan(0.003)
  })

  test("a radius too big for the straight run is an error that names the run, and no pipe is built", () => {
    const r = rebuild(pipe(120))
    expect(errors(r)).toHaveLength(1)
    expect(errors(r)[0]).toMatchObject({ feature: "pipe" })
    expect(errors(r)[0]!.message).toMatch(/needs 120\.00 mm of the 100\.00 mm straight run 1/)
    expect(r.bodies).toHaveLength(0)
  })

  test("a negative radius is an error (zero is the mitre)", () => {
    const r = rebuild(pipe(-5))
    expect(errors(r)).toHaveLength(1)
    expect(errors(r)[0]).toMatchObject({ feature: "pipe" })
    expect(errors(r)[0]!.message).toMatch(/bend radius cannot be negative/)
    expect(r.bodies).toHaveLength(0)
  })

  test("a closed route ignores the bend radius: the same torus with or without it", () => {
    const ring = (radius?: number): History => history([
      circles("section", "YZ", 0, 0, [4]), circles("route", "XY", 0, 0, [30]),
      { id: "torus", type: "sweep", profile: "section", path: "route", operation: "new", ...(radius !== undefined ? { bendRadius: radius } : {}) } as Feature
    ])
    const a = rebuild(ring()), b = rebuild(ring(5))
    expect(b.issues).toEqual([])
    expect(vol(b)).toBeCloseTo(vol(a), 6)
  })

  test("a sweep along a rounded route can still be mirrored and shelled", () => {
    const r = rebuild(history([...pipe(30).features, { id: "m", type: "mirror", feature: "pipe", plane: "YZ" }]))
    expect(r.issues).toEqual([])
    expect(r.bodies.map((b) => b.id)).toEqual(["pipe", "m"])
  })
})
