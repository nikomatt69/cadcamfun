import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { dimensionsOf, setDimension } from "./history-edit.ts"
import { historyVolume, rebuild, withParameter, type Feature, type History } from "./history.ts"
import { meshBounds, meshVolume } from "./solid.ts"
import type { SketchShape } from "./sketch-shapes.ts"

setDefaultTimeout(60_000)

const history = (features: Feature[], parameters: History["parameters"] = {}): History => ({ parameters, features })
/** A sketch made only of shapes, extruded `depth` mm. */
const slab = (shapes: SketchShape[], depth: number | string = 10, parameters: History["parameters"] = {}, plane: "XY" | "YZ" | "ZX" = "XY"): History =>
  history([{ id: "s", type: "sketch", plane, sketch: { entities: [], constraints: [], shapes } }, { id: "body", type: "extrude", sketch: "s", depth, operation: "new" }], parameters)
const area = (h: History): number => {
  const r = rebuild(h)
  expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
  expect(r.bodies).toHaveLength(1)
  return historyVolume(r) / (typeof h.features[1] === "object" && h.features[1].type === "extrude" && typeof h.features[1].depth === "number" ? h.features[1].depth : 1)
}

describe("parametric sketch shapes", () => {
  test("a rectangle is its width by its height, from a corner or about a centre", () => {
    expect(area(slab([{ id: "r", kind: "rectangle", at: [5, 7], width: 30, height: 12 }]))).toBeCloseTo(360, 3)
    const centred = rebuild(slab([{ id: "r", kind: "rectangle", at: [0, 0], width: 30, height: 12, centered: true }]))
    const b = meshBounds(centred.bodies[0]!.mesh)
    expect([b.minX, b.maxX, b.minY, b.maxY].map((v) => Math.round(v * 1000) / 1000)).toEqual([-15, 15, -6, 6])
    // The sketch is fully constrained: nothing is left to the solver's first guess.
    expect(centred.sketches["s"]!.solve.status).toBe("fully-constrained")
  })

  test("the measures are parameters: one edit reshapes the part", () => {
    const h = slab([{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: "w / 2" }], "t", { w: 40, t: 5 })
    expect(historyVolume(rebuild(h))).toBeCloseTo(40 * 20 * 5, 2)
    expect(historyVolume(rebuild(withParameter(h, "w", 60)))).toBeCloseTo(60 * 30 * 5, 2)
  })

  test("a circle, a regular polygon (by corners or by flats) and an ellipse have their textbook areas", () => {
    expect(area(slab([{ id: "c", kind: "circle", at: [0, 0], diameter: 20 }]))).toBeCloseTo(Math.PI * 100, -1)
    const R = 12
    expect(area(slab([{ id: "p", kind: "polygon", at: [0, 0], sides: 6, radius: R }]))).toBeCloseTo((3 * Math.sqrt(3) / 2) * R * R, 2)
    // `flats` measures to the middle of a side: the apothem of an octagon of apothem 10 gives n r^2 tan(pi / n).
    expect(area(slab([{ id: "p", kind: "polygon", at: [0, 0], sides: 8, radius: 10, flats: true }]))).toBeCloseTo(8 * 100 * Math.tan(Math.PI / 8), 2)
    const a = 20, b = 8
    // Display geometry follows the nominal ellipse within its 0.01 mm chord budget, rather than a fixed 48-gon.
    expect(Math.abs(area(slab([{ id: "e", kind: "ellipse", at: [0, 0], radiusX: a, radiusY: b }])) - Math.PI * a * b)).toBeLessThan(2 * Math.PI * a * 0.01)
  })

  test("a polygon's rotation turns it and its radius can be an expression", () => {
    const flat = rebuild(slab([{ id: "p", kind: "polygon", at: [0, 0], sides: 4, radius: "r", rotation: 45 }], 5, { r: 10 * Math.SQRT2 }))
    const b = meshBounds(flat.bodies[0]!.mesh)
    // A square turned 45 degrees from the corner axis has its sides on the axes: half-width R cos 45 = 10.
    expect(b.maxX).toBeCloseTo(10, 3)
    expect(b.maxY).toBeCloseTo(10, 3)
  })

  test("a slot is a rectangle with a half circle at each end, at any angle", () => {
    const L = 50, W = 10
    const expected = (L - W) * W + Math.PI * (W / 2) ** 2
    expect(area(slab([{ id: "sl", kind: "slot", at: [0, 0], length: L, width: W }]))).toBeCloseTo(expected, 0)
    const turned = rebuild(slab([{ id: "sl", kind: "slot", at: [0, 0], length: "L", width: W, angle: 30 }], 10, { L }))
    expect(historyVolume(turned) / 10).toBeCloseTo(expected, 0)
    const b = meshBounds(turned.bodies[0]!.mesh)
    // The overall length runs along 30 degrees: its tips are at +-25 along that direction, plus the half width across.
    expect(b.maxX).toBeCloseTo(20 * Math.cos(Math.PI / 6) + 5, 1)
  })

  test("a slot shorter than it is wide is refused with the reason", () => {
    const r = rebuild(slab([{ id: "sl", kind: "slot", at: [0, 0], length: 8, width: 10 }]))
    expect(r.bodies).toHaveLength(0)
    expect(r.issues.map((i) => i.message).join(" ")).toContain("length has to exceed the width")
  })

  test("a polyline is any closed outline, here an L section", () => {
    const L: Array<readonly [number | string, number | string]> = [[0, 0], ["a", 0], ["a", "t"], ["t", "t"], ["t", "a"], [0, "a"]]
    const h = slab([{ id: "l", kind: "polyline", points: L }], 4, { a: 40, t: 6 })
    expect(area(h)).toBeCloseTo(40 * 6 + 34 * 6, 3)
    expect(historyVolume(rebuild(withParameter(h, "t", 8)))).toBeCloseTo((40 * 8 + 32 * 8) * 4, 3)
  })

  test("two shapes in one sketch make a ring: the inner loop is a hole", () => {
    const h = slab([{ id: "o", kind: "circle", at: [0, 0], diameter: 40 }, { id: "i", kind: "circle", at: [0, 0], diameter: 30 }], 10)
    expect(area(h)).toBeCloseTo(Math.PI * (400 - 225), -1)
  })

  test("an id that is not the shape's own does not collide: shape ids are namespaced", () => {
    const r = rebuild(slab([{ id: "a", kind: "circle", at: [0, 0], diameter: 10 }, { id: "a", kind: "circle", at: [30, 0], diameter: 10 }]))
    expect(r.bodies).toHaveLength(0)
    expect(r.issues.map((i) => i.message).join(" ")).toContain("already taken")
  })
})

describe("curves: spline, Bezier and NURBS", () => {
  test("a closed NURBS is a smooth profile that extrudes to a solid inside its control polygon", () => {
    const control: Array<readonly [number, number]> = [[0, 0], [30, -10], [60, 0], [60, 30], [30, 40], [0, 30]]
    const r = rebuild(slab([{ id: "n", kind: "curve", curve: "nurbs", points: control, closed: true }], 5))
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    const v = historyVolume(r)
    expect(v).toBeGreaterThan(0)
    // The control polygon (shoelace) bounds a B-spline from outside.
    let polygon = 0
    control.forEach(([x, y], k) => { const [x2, y2] = control[(k + 1) % control.length]!; polygon += x * y2 - x2 * y })
    expect(v / 5).toBeLessThan(Math.abs(polygon) / 2)
    expect(v / 5).toBeGreaterThan(0.5 * (Math.abs(polygon) / 2))
  })

  test("a spline passes through its points", () => {
    const r = rebuild(slab([{ id: "c", kind: "curve", curve: "spline", points: [[0, 0], [20, 15], [40, 18], [60, 10]], chord: true }], 3))
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    const entities = r.sketches["s"]!.solve.sketch.entities.filter((e) => e.kind === "point")
    for (const [x, y] of [[0, 0], [20, 15], [40, 18], [60, 10]] as const) {
      expect(entities.some((e) => e.kind === "point" && Math.hypot(e.x - x, e.y - y) < 1e-6)).toBe(true)
    }
  })

  test("a curve is rebuilt from its evaluated control points, so a parameter reshapes it", () => {
    const make = (lift: number): History => slab([{ id: "c", kind: "curve", curve: "bezier", points: [[0, 0], [20, "h"], [40, "h"], [60, 0]], chord: true }], 2, { h: lift })
    expect(historyVolume(rebuild(make(40)))).toBeGreaterThan(historyVolume(rebuild(make(20))) * 1.8)
  })

  test("a spline is a sweep path: a round wire along it has the volume of its length times the section", () => {
    const h = history([
      { id: "path", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "p", kind: "curve", curve: "spline", points: [[0, 0], [30, 12], [60, -12], [90, 0]], divisions: 120 }] } },
      { id: "wire", type: "sketch", plane: "YZ", sketch: { entities: [], constraints: [], shapes: [{ id: "w", kind: "circle", at: [0, 0], diameter: 4 }] } },
      { id: "swept", type: "sweep", profile: "wire", path: "path", operation: "new" }
    ])
    const r = rebuild(h)
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    const pts = r.sketches["path"]!.solve.sketch.entities.filter((e) => e.kind === "point") as Array<{ x: number; y: number }>
    const ordered = [...pts].sort((a, b) => a.x - b.x)
    const length = ordered.slice(1).reduce((sum, p, k) => sum + Math.hypot(p.x - ordered[k]!.x, p.y - ordered[k]!.y), 0)
    expect(historyVolume(r)).toBeGreaterThan(Math.PI * 4 * length * 0.93)
    expect(historyVolume(r)).toBeLessThan(Math.PI * 4 * length * 1.07)
  })

  test("a spline profile closed by a chord revolves to a solid of revolution (Pappus)", () => {
    // A bulge from (0,0) to (0,40) through (14, 10), (16, 20), (14, 30), closed by the axis: revolve about the sketch's y axis.
    const r = rebuild(history([
      { id: "p", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "c", kind: "curve", curve: "spline", points: [[0, 0], [14, 10], [16, 20], [14, 30], [0, 40]], chord: true }] } },
      { id: "vase", type: "revolve", sketch: "p", axis: "y", operation: "new" }
    ]))
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    // Between a cylinder of radius 14 and one of radius 16 over the same 40 mm.
    const v = historyVolume(r)
    expect(v).toBeGreaterThan(Math.PI * 14 * 14 * 40 * 0.75)
    expect(v).toBeLessThan(Math.PI * 16 * 16 * 40)
  })

  test("a Bezier that closes is refused", () => {
    const r = rebuild(slab([{ id: "c", kind: "curve", curve: "bezier", points: [[0, 0], [10, 10], [20, 0], [10, -10]], closed: true }]))
    expect(r.issues.map((i) => i.message).join(" ")).toContain("cannot be closed")
  })
})

describe("Fusion-style body features", () => {
  const box = (id: string, w: number, d: number, h: number, x = 0, y = 0, operation: "new" | "union" = "new"): Feature[] => [
    { id: `${id}_s`, type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [x, y], width: w, height: d }] } },
    { id, type: "extrude", sketch: `${id}_s`, depth: h, operation }
  ]

  test("coil: the volume of a round wire of a helix is the section times the length of the wire", () => {
    const R = 20, wire = 3, pitch = 8, turns = 5
    const r = rebuild(history([{ id: "spring", type: "coil", radius: "R", pitch, turns, wireDiameter: wire, operation: "new" }], { R }))
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    const length = turns * Math.hypot(2 * Math.PI * R, pitch)
    expect(historyVolume(r)).toBeGreaterThan(Math.PI * (wire / 2) ** 2 * length * 0.95)
    expect(historyVolume(r)).toBeLessThan(Math.PI * (wire / 2) ** 2 * length * 1.05)
    const b = meshBounds(r.bodies[0]!.mesh)
    expect(b.maxZ - b.minZ).toBeCloseTo(pitch * turns + wire, 0)
  })

  test("coil: a left hand and a right hand wind opposite ways but weigh the same; a square wire fills more", () => {
    const base = { type: "coil", radius: 15, pitch: 6, turns: 3, wireDiameter: 2, operation: "new" } as const
    const right = historyVolume(rebuild(history([{ id: "c", ...base }])))
    const left = historyVolume(rebuild(history([{ id: "c", ...base, handedness: "left" }])))
    const square = historyVolume(rebuild(history([{ id: "c", ...base, section: "square" }])))
    expect(left).toBeCloseTo(right, 0)
    expect(square / right).toBeCloseTo(4 / Math.PI, 1)
  })

  test("coil: a pitch that overlaps the turns and a wire as wide as the coil are refused", () => {
    const tight = rebuild(history([{ id: "c", type: "coil", radius: 15, pitch: 2, turns: 3, wireDiameter: 3, operation: "new" }]))
    expect(tight.bodies).toHaveLength(0)
    expect(tight.issues.map((i) => i.message).join(" ")).toContain("must exceed the wire diameter")
    const fat = rebuild(history([{ id: "c", type: "coil", radius: 1, pitch: 8, turns: 3, wireDiameter: 3, operation: "new" }]))
    expect(fat.issues.map((i) => i.message).join(" ")).toContain("wire crosses the axis")
  })

  test("move: translating, turning and copying bodies", () => {
    const base = box("a", 20, 10, 5)
    const moved = rebuild(history([...base, { id: "m", type: "move", translate: [100, 0, 3] }]))
    expect(meshBounds(moved.bodies[0]!.mesh).minX).toBeCloseTo(100, 3)
    expect(meshBounds(moved.bodies[0]!.mesh).minZ).toBeCloseTo(3, 3)
    const turned = rebuild(history([...base, { id: "m", type: "move", rotate: { axis: "z", angle: 90 } }]))
    const tb = meshBounds(turned.bodies[0]!.mesh)
    expect([tb.minX, tb.maxX, tb.minY, tb.maxY].map((v) => Math.round(v) + 0)).toEqual([-10, 0, 0, 20])
    const copied = rebuild(history([...base, { id: "m", type: "move", translate: [50, 0, 0], copy: true }]))
    expect(copied.bodies.map((b) => b.id)).toEqual(["a", "m"])
    expect(meshVolume(copied.bodies[0]!.mesh)).toBeCloseTo(meshVolume(copied.bodies[1]!.mesh), 3)
  })

  test("scale: a uniform factor multiplies the volume by its cube, three factors by their product", () => {
    const base = box("a", 10, 10, 10)
    expect(historyVolume(rebuild(history([...base, { id: "k", type: "scale", factor: 2 }])))).toBeCloseTo(8000, 1)
    expect(historyVolume(rebuild(history([...base, { id: "k", type: "scale", factor: [1, 2, "f"] }], { f: 3 })))).toBeCloseTo(6000, 1)
    const bad = rebuild(history([...base, { id: "k", type: "scale", factor: 0 }]))
    expect(bad.issues.map((i) => i.message).join(" ")).toContain("must be positive")
  })

  test("split: a plane cuts a body in two (or keeps one side) and the volumes add up", () => {
    const base = box("a", 20, 20, 20)
    const both = rebuild(history([...base, { id: "sp", type: "split", plane: "XY", offset: 5, keep: "both" }]))
    expect(both.bodies).toHaveLength(2)
    expect(meshVolume(both.bodies[0]!.mesh)).toBeCloseTo(20 * 20 * 15, 0)
    expect(meshVolume(both.bodies[1]!.mesh)).toBeCloseTo(20 * 20 * 5, 0)
    const above = rebuild(history([...base, { id: "sp", type: "split", plane: "YZ", offset: 8, keep: "above" }]))
    expect(above.bodies).toHaveLength(1)
    expect(meshVolume(above.bodies[0]!.mesh)).toBeCloseTo(12 * 20 * 20, 0)
    const missed = rebuild(history([...base, { id: "sp", type: "split", plane: "XY", offset: 50, keep: "above" }]))
    expect(missed.issues.map((i) => i.message).join(" ")).toContain("leaves nothing")
  })

  test("combine: join, cut and intersect whole bodies by id, consuming the tools", () => {
    const two = [...box("a", 20, 20, 20), ...box("b", 20, 20, 20, 10, 0)]
    const joined = rebuild(history([...two, { id: "j", type: "combine", target: "a", tools: ["b"], operation: "join" }]))
    expect(joined.bodies.map((b) => b.id)).toEqual(["a"])
    expect(historyVolume(joined)).toBeCloseTo(30 * 20 * 20, 0)
    const cut = rebuild(history([...two, { id: "j", type: "combine", target: "a", tools: ["b"], operation: "cut" }]))
    expect(historyVolume(cut)).toBeCloseTo(10 * 20 * 20, 0)
    const common = rebuild(history([...two, { id: "j", type: "combine", target: "a", tools: ["b"], operation: "intersect", keepTools: true }]))
    expect(common.bodies.map((b) => b.id)).toEqual(["a", "b"])
    expect(meshVolume(common.bodies[0]!.mesh)).toBeCloseTo(10 * 20 * 20, 0)
    const missing = rebuild(history([...two, { id: "j", type: "combine", target: "a", tools: ["nope"], operation: "join" }]))
    expect(missing.issues.map((i) => i.message).join(" ")).toContain("'nope'")
  })
})

describe("catalogue solids in a history", () => {
  const solid = (feature: Partial<Extract<Feature, { type: "primitive" }>> & { element: Extract<Feature, { type: "primitive" }>["element"] }, parameters: History["parameters"] = {}): History =>
    history([{ id: "p", type: "primitive", operation: "new", ...feature }], parameters)

  test("every solid takes parametric measures", () => {
    expect(historyVolume(rebuild(solid({ element: "cube", params: { width: "a", height: "a", depth: "a / 2" } }, { a: 20 })))).toBeCloseTo(20 * 20 * 10, 2)
    expect(historyVolume(rebuild(solid({ element: "cylinder", params: { radius: 10, height: "h" } }, { h: 30 })))).toBeGreaterThan(Math.PI * 100 * 30 * 0.99)
    const sphere = historyVolume(rebuild(solid({ element: "sphere", params: { radius: 15, segments: 64 } })))
    expect(Math.abs(sphere / ((4 / 3) * Math.PI * 15 ** 3) - 1)).toBeLessThan(0.02)
    expect(historyVolume(rebuild(solid({ element: "torus", params: { radius: 30, tubeRadius: 5 } })))).toBeGreaterThan(2 * Math.PI ** 2 * 30 * 25 * 0.97)
    expect(historyVolume(rebuild(solid({ element: "pyramid", params: { baseWidth: 30, baseDepth: 30, height: 30 } })))).toBeCloseTo(30 * 30 * 30 / 3, 1)
  })

  test("a parameter edit reshapes the solid, and position and rotation are dimensions too", () => {
    const h = solid({ element: "cube", params: { width: "w", height: 10, depth: 10 }, at: ["w", 0, 0] }, { w: 10 })
    expect(meshBounds(rebuild(h).bodies[0]!.mesh).maxX).toBeCloseTo(15, 3)
    expect(meshBounds(rebuild(withParameter(h, "w", 30)).bodies[0]!.mesh).maxX).toBeCloseTo(45, 3)
    const turned = rebuild(solid({ element: "cube", params: { width: 20, height: 10, depth: 10 }, rotation: [0, 0, 90] }))
    const b = meshBounds(turned.bodies[0]!.mesh)
    expect(b.maxX - b.minX).toBeCloseTo(10, 2)
    expect(b.maxY - b.minY).toBeCloseTo(20, 2)
  })

  test("a catalogue solid is a tool like any other: it cuts, and a pattern copies it", () => {
    const r = rebuild(history([
      { id: "plate", type: "primitive", element: "cube", params: { width: 100, height: 20, depth: 10 }, operation: "new" },
      { id: "bore", type: "primitive", element: "cylinder", params: { radius: 3, height: 40 }, at: [-30, 0, 0], operation: "subtract" },
      { id: "bores", type: "pattern", feature: "bore", kind: "linear", count: 4, step: [20, 0, 0] }
    ]))
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(historyVolume(r)).toBeLessThan(100 * 20 * 10 - 4 * Math.PI * 9 * 10 * 0.95)
    expect(historyVolume(r)).toBeGreaterThan(100 * 20 * 10 - 4 * Math.PI * 9 * 10 * 1.05)
  })

  test("a gear, an extruded outline and a revolved outline are catalogue solids as well", () => {
    expect(rebuild(solid({ element: "gear", params: { moduleValue: 2, teeth: 20, thickness: 8, holeDiameter: 10 } })).bodies).toHaveLength(1)
    const extruded = rebuild(solid({ element: "extrusion", options: { shape: "profile" }, profile: [[0, 0], ["w", 0], ["w", 10], [0, 10]], params: { depth: 5 } }, { w: 30 }))
    expect(historyVolume(extruded)).toBeCloseTo(30 * 10 * 5, 2)
    const lathe = rebuild(solid({ element: "revolution", options: { axis: "y" }, profile: [[0, 0], [10, 0], [10, 20], [0, 20]] }))
    expect(historyVolume(lathe)).toBeGreaterThan(Math.PI * 100 * 20 * 0.97)
  })

  test("a size that is not positive is refused instead of silently using a default", () => {
    const r = rebuild(solid({ element: "sphere", params: { radius: "r" } }, { r: -3 }))
    expect(r.bodies).toHaveLength(0)
    expect(r.issues.map((i) => i.message).join(" ")).toContain("sphere.radius must be positive")
  })
})

describe("editing what the new features expose", () => {
  test("every measure of a shape is a named dimension a person or the assistant can change", () => {
    const h = slab([{ id: "r", kind: "rectangle", at: [1, 2], width: 30, height: 10 }, { id: "s", kind: "slot", at: [0, 40], length: 50, width: 8 }])
    const labels = dimensionsOf(h.features[0]!).map((d) => d.label)
    expect(labels).toContain("rectangle r width")
    expect(labels).toContain("slot s overall length")
    const edited = setDimension(h, "s", "sketch.shapes.0.width", 45)
    expect(historyVolume(rebuild(edited))).toBeCloseTo((45 * 10 + (50 - 8) * 8 + Math.PI * 16) * 10, -1)
  })
})
