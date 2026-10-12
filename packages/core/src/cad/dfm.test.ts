import { describe, expect, test } from "bun:test"
import { DFM_LIMITS, MIN_WALL, analyzeManufacturability, freeSpaceCorners, overhangArea, wallThickness, type DfmIssue, type DfmOptions } from "./dfm.ts"
import type { DimConstraint, Feature, History, SketchFeature } from "./history.ts"
import { rebuild } from "./history.ts"
import { treatCorners, loftRings } from "./profile-shape.ts"
import type { SketchEntity } from "./sketch.ts"
import type { Vec2 } from "./vec.ts"

const pt = (id: string, x: number, y: number): SketchEntity => ({ id, kind: "point", x, y })
const line = (id: string, p1: string, p2: string): SketchEntity => ({ id, kind: "line", p1, p2 })
const rect = (id: string, plane: SketchFeature["plane"], x: number, y: number, w: number | string, h: number | string, offset?: number | string): SketchFeature => ({
  id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}),
  sketch: {
    entities: [pt("p1", x + 0.2, y - 0.1), pt("p2", x + 9, y + 0.3), pt("p3", x + 11, y + 6), pt("p4", x - 0.4, y + 5), line("l1", "p1", "p2"), line("l2", "p2", "p3"), line("l3", "p3", "p4"), line("l4", "p4", "p1")],
    constraints: [
      { type: "fixed", point: "p1", x, y }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
      { type: "length", line: "l1", value: w }, { type: "length", line: "l2", value: h }
    ] as DimConstraint[]
  }
})
const rings = (id: string, plane: SketchFeature["plane"], cx: number, cy: number, radii: number[], offset?: number): SketchFeature => ({
  id, type: "sketch", plane, ...(offset !== undefined ? { offset } : {}),
  sketch: {
    entities: [pt("c", cx, cy), ...radii.map((r, i): SketchEntity => ({ id: `k${i}`, kind: "circle", center: "c", radius: r }))],
    constraints: [{ type: "fixed", point: "c", x: cx, y: cy }, ...radii.map((r, i) => ({ type: "radius", circle: `k${i}`, value: r }) as DimConstraint)]
  }
})
const history = (features: Feature[], parameters: History["parameters"] = {}): History => ({ parameters, features })
const codes = (issues: ReadonlyArray<DfmIssue>) => issues.map((i) => i.code)
const find = (issues: ReadonlyArray<DfmIssue>, code: string) => issues.filter((i) => i.code === code)
const run = (h: History, options: DfmOptions = {}) => analyzeManufacturability(h, options)

const circle = (r: number, n: number): Vec2[] => Array.from({ length: n }, (_, k) => ({ x: r * Math.cos((2 * Math.PI * k) / n), y: r * Math.sin((2 * Math.PI * k) / n) }))
const square = (a: number): Vec2[] => [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: a, y: a }, { x: 0, y: a }]

/** A 60 x 40 x 10 plate (parameter-free, so no literal-dimension noise). */
const PLATE: Feature[] = [rect("s", "XY", 0, 0, 60, 40), { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" }]

describe("freeSpaceCorners", () => {
  test("a square pocket: four sharp inside corners, radius 0", () => {
    const c = freeSpaceCorners(square(20), true)
    expect(c.sharp).toBe(4)
    expect(c.minRadius).toBe(0)
  })

  test("a pocket with R4 corners: no sharp corner, tightest radius is 4 within 2 %", () => {
    const c = freeSpaceCorners(treatCorners(square(20), "fillet", 4), true)
    expect(c.sharp).toBe(0)
    expect(c.minRadius).toBeGreaterThan(4 * 0.98)
    expect(c.minRadius).toBeLessThan(4 * 1.02)
  })

  test("a circular pocket: the radius of curvature is the circle's", () => {
    const c = freeSpaceCorners(circle(5, 90), true)
    expect(c.sharp).toBe(0)
    expect(c.minRadius).toBeCloseTo(5, 6)
  })

  test("the same circle seen from outside (a round boss) has no inside corner at all", () => {
    const c = freeSpaceCorners(circle(5, 90), false)
    expect(c.minRadius).toBe(Infinity)
    expect(c.sharp).toBe(0)
  })

  test("an outer contour with a reflex corner: the reflex vertex is an inside corner only for the cutter outside the loop", () => {
    const l: Vec2[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }]
    const outside = freeSpaceCorners(l, false)
    expect(outside.sharp).toBe(1)
    expect(outside.at).toEqual({ x: 10, y: 10 })
    expect(freeSpaceCorners(l, true).sharp).toBe(5)
  })

  test("the winding of the loop does not matter", () => {
    const l = treatCorners(square(20), "fillet", 4)
    expect(freeSpaceCorners([...l].reverse(), true).minRadius).toBeCloseTo(freeSpaceCorners(l, true).minRadius, 9)
    expect(freeSpaceCorners(square(20).reverse(), true).sharp).toBe(4)
  })
})

describe("wallThickness", () => {
  const plate = (t: number) => loftRings([square(20), square(20)], [0, t])

  test("a 2 mm plate is 2 mm thick", () => {
    const w = wallThickness(plate(2), 0.8)!
    expect(w.min).toBeGreaterThan(2 * 0.97)
    expect(w.min).toBeLessThan(2 * 1.03)
    expect(w.thinShare).toBe(0)
  })

  test("a box with 0.5 mm walls reports about 0.5 mm, and says where", () => {
    const r = rebuild(history([
      rect("o", "XY", 0, 0, 20, 20), { id: "box", type: "extrude", sketch: "o", depth: 10, operation: "new" },
      rect("i", "XY", 0.5, 0.5, 19, 19, 2), { id: "cavity", type: "extrude", sketch: "i", depth: 10, operation: "subtract" }
    ]))
    expect(r.issues).toEqual([])
    const w = wallThickness(r.bodies[0]!.mesh, 0.8)!
    expect(w.min).toBeGreaterThan(0.5 * 0.95)
    expect(w.min).toBeLessThan(0.5 * 1.05)
    expect(w.thinShare).toBeGreaterThan(0.3)
    expect(w.samples).toBeGreaterThan(10)
  })

  test("an empty mesh has no wall", () => {
    expect(wallThickness({ positions: new Float32Array(0), indices: new Uint32Array(0) }, 1)).toBeUndefined()
  })

  test("the sample count is capped but the thin spot is still found when the wall is everywhere", () => {
    const w = wallThickness(plate(1), 0.8, 4)!
    expect(w.samples).toBeLessThanOrEqual(4)
    expect(w.min).toBeLessThan(1.05)
  })
})

describe("overhangArea", () => {
  test("a block standing on the bed has no overhang; its area is 2 (ab + bc + ac)", () => {
    const block = loftRings([square(20), square(20)], [0, 10])
    const o = overhangArea(block, 45)
    expect(o.total).toBeCloseTo(2 * 400 + 4 * 200, 6)
    expect(o.overhang).toBe(0)
  })

  test("a T shape overhangs under its bar: the two flat undersides, (30 - 10) x 10 each side summed = 200", () => {
    const t = rebuild(history([
      rect("stem", "XY", 0, 0, 10, 10), { id: "stem1", type: "extrude", sketch: "stem", depth: 10, operation: "new" },
      rect("bar", "XY", -10, 0, 30, 10, 10), { id: "bar1", type: "extrude", sketch: "bar", depth: 10, operation: "union" }
    ]))
    expect(t.issues).toEqual([])
    const o = overhangArea(t.bodies[0]!.mesh, 45)
    expect(o.overhang).toBeCloseTo(200, 3)
    expect(o.overhang / o.total).toBeGreaterThan(0.1)
  })

  test("the angle is a threshold: at 90 degrees from vertical nothing overhangs", () => {
    const t = rebuild(history([
      rect("stem", "XY", 0, 0, 10, 10), { id: "stem1", type: "extrude", sketch: "stem", depth: 10, operation: "new" },
      rect("bar", "XY", -10, 0, 30, 10, 10), { id: "bar1", type: "extrude", sketch: "bar", depth: 10, operation: "union" }
    ]))
    expect(overhangArea(t.bodies[0]!.mesh, 90).overhang).toBe(0)
  })
})

describe("analyzeManufacturability: the plain plate", () => {
  test("a plain plate is makeable and the metrics are the plate's", () => {
    const r = run(history(PLATE))
    expect(r.issues).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.process).toBe("mill")
    expect(r.toolDiameter).toBe(6)
    expect(r.metrics.bodies).toBe(1)
    expect(r.metrics.volumeMm3).toBeCloseTo(24000, 1)
    expect(r.metrics.surfaceMm2).toBeCloseTo(2 * (2400 + 600 + 400), 1)
    expect(r.metrics.size).toEqual({ x: 60, y: 40, z: 10 })
    expect(r.metrics.minWallMm!).toBeGreaterThan(9.7)
    expect(r.metrics.minWallMm!).toBeLessThan(10.3)
  })

  test("the limits and wall table are the shop-floor numbers", () => {
    expect(DFM_LIMITS).toMatchObject({ pocketDepthRatio: 4, pocketDepthHard: 8, drillRatio: 5, drillHard: 10, turnRatio: 8, turnHard: 12, overhangAngle: 45 })
    expect(MIN_WALL.mill.metal).toBe(0.8)
    expect(MIN_WALL.print.plastic).toBe(1.2)
    expect(MIN_WALL.turn.metal).toBe(1)
  })
})

describe("internal corners against the cutter", () => {
  const pocketed = (pocket: Partial<Extract<Feature, { type: "extrude" }>> = {}) => history([
    ...PLATE,
    rect("pk", "XY", 10, 10, 20, 20, 10),
    { id: "pocket", type: "extrude", sketch: "pk", depth: 3, direction: "down", operation: "subtract", ...pocket }
  ])

  test("a pocket with sharp corners cannot be cut by a 6 mm cutter: error INTERNAL_CORNER, measured 0, required 3", () => {
    const r = run(pocketed())
    const issue = find(r.issues, "INTERNAL_CORNER")
    expect(issue).toHaveLength(1)
    expect(issue[0]).toMatchObject({ severity: "error", feature: "pocket", measured: 0, required: 3 })
    expect(issue[0]!.message).toMatch(/4 sharp inside corner/)
    expect(r.ok).toBe(false)
  })

  test("the boss's own convex outline corners are not inside corners", () => {
    expect(find(run(history(PLATE)).issues, "INTERNAL_CORNER")).toEqual([])
  })

  test("a corner fillet of the cutter's radius on the extrusion clears it (the fix the message suggests)", () => {
    // BUG CHECK: dfm.ts reads the raw sketch loops and ignores the extrude `corner` treatment, so the recommended fix never clears the error.
    const r = run(pocketed({ corner: { style: "fillet", size: 3 } }))
    expect(find(r.issues, "INTERNAL_CORNER")).toEqual([])
  })

  test("a fillet smaller than the cutter radius still fails, reporting the radius it has", () => {
    // BUG CHECK: same cause as above; measured should be ~1.5.
    const issue = find(run(pocketed({ corner: { style: "fillet", size: 1.5 } })).issues, "INTERNAL_CORNER")
    expect(issue).toHaveLength(1)
    expect(issue[0]!.measured!).toBeGreaterThan(1.4)
    expect(issue[0]!.measured!).toBeLessThan(1.6)
  })

  test("a smaller cutter accepts what a larger one cannot: a 2 mm cutter leaves R1, a sharp corner is still out", () => {
    const round = pocketed({ corner: { style: "fillet", size: 1 } })
    expect(find(run(round, { toolDiameter: 2 }).issues, "INTERNAL_CORNER")).toEqual([])
    expect(find(run(pocketed(), { toolDiameter: 2 }).issues, "INTERNAL_CORNER")).toHaveLength(1)
  })

  test("a circular pocket smaller than the cutter fails, a larger one passes", () => {
    const circ = (r: number) => history([...PLATE, rings("pk", "XY", 30, 20, [r], 10), { id: "pocket", type: "extrude", sketch: "pk", depth: 3, direction: "down", operation: "subtract" }])
    expect(find(run(circ(2)).issues, "INTERNAL_CORNER")[0]).toMatchObject({ measured: 2, required: 3 })
    expect(find(run(circ(8)).issues, "INTERNAL_CORNER")).toEqual([])
  })

  test("only the milling process cares: turning and printing do not report cutter corners", () => {
    expect(find(run(pocketed(), { process: "turn" }).issues, "INTERNAL_CORNER")).toEqual([])
    expect(find(run(pocketed(), { process: "print" }).issues, "INTERNAL_CORNER")).toEqual([])
  })

  test("an outer contour with a reflex corner (an L plate) needs the radius on the outside", () => {
    const l: SketchFeature = {
      id: "l", type: "sketch", plane: "XY",
      sketch: {
        entities: [pt("a", 0, 0), pt("b", 30, 0), pt("c", 30, 10), pt("d", 10, 10), pt("e", 10, 30), pt("f", 0, 30), line("1", "a", "b"), line("2", "b", "c"), line("3", "c", "d"), line("4", "d", "e"), line("5", "e", "f"), line("6", "f", "a")],
        constraints: [{ type: "fixed", point: "a", x: 0, y: 0 }, { type: "fixed", point: "b", x: 30, y: 0 }, { type: "fixed", point: "c", x: 30, y: 10 }, { type: "fixed", point: "d", x: 10, y: 10 }, { type: "fixed", point: "e", x: 10, y: 30 }, { type: "fixed", point: "f", x: 0, y: 30 }]
      }
    }
    const issue = find(run(history([l, { id: "e", type: "extrude", sketch: "l", depth: 8, operation: "new" }])).issues, "INTERNAL_CORNER")
    expect(issue).toHaveLength(1)
    expect(issue[0]!.message).toMatch(/1 sharp inside corner/)
  })
})

describe("depth ratios", () => {
  const circlePocket = (depth: number) => history([
    rect("s", "XY", 0, 0, 100, 100), { id: "plate", type: "extrude", sketch: "s", depth: 60, operation: "new" },
    rings("pk", "XY", 50, 50, [20], 60), { id: "pocket", type: "extrude", sketch: "pk", depth, direction: "down", operation: "subtract" }
  ])

  test("a pocket up to 4 cutter diameters deep is fine", () => {
    expect(find(run(circlePocket(24)).issues, "DEEP_POCKET")).toEqual([])
  })

  test("beyond 4 diameters (5.0 here) it is a warning that names the deflection", () => {
    const issue = find(run(circlePocket(30)).issues, "DEEP_POCKET")
    expect(issue).toHaveLength(1)
    expect(issue[0]).toMatchObject({ severity: "warning", feature: "pocket", measured: 5, required: 4 })
  })

  test("beyond 8 diameters it is an error", () => {
    const r = run(circlePocket(54))
    const issue = find(r.issues, "DEEP_POCKET")
    expect(issue[0]).toMatchObject({ severity: "error", measured: 9, required: 8 })
    expect(r.ok).toBe(false)
  })

  test("a bigger cutter, or a relaxed limit, removes it", () => {
    expect(find(run(circlePocket(30), { toolDiameter: 12 }).issues, "DEEP_POCKET")).toEqual([])
    expect(find(run(circlePocket(30), { limits: { pocketDepthRatio: 6 } }).issues, "DEEP_POCKET")).toEqual([])
    expect(find(run(circlePocket(54), { limits: { pocketDepthHard: 10 } }).issues, "DEEP_POCKET")[0]!.severity).toBe("warning")
  })

  test("only subtractions are pockets: a deep boss is not", () => {
    const boss = history([rect("s", "XY", 0, 0, 30, 30), { id: "tower", type: "extrude", sketch: "s", depth: 100, operation: "new" }])
    expect(find(run(boss).issues, "DEEP_POCKET")).toEqual([])
  })

  const drilled = (depth: number, d = 6) => history([
    rect("s", "XY", 0, 0, 100, 100), { id: "plate", type: "extrude", sketch: "s", depth: 70, operation: "new" },
    { id: "h", type: "hole", plane: "XY", offset: 70, at: [50, 50], diameter: d, depth }
  ])

  test("a hole up to 5 diameters deep needs no special drilling", () => {
    expect(find(run(drilled(30)).issues, "DEEP_HOLE")).toEqual([])
  })

  test("6 diameters is a warning that asks for peck drilling; 11 is an error that asks for gun drilling", () => {
    const peck = find(run(drilled(36)).issues, "DEEP_HOLE")
    expect(peck[0]).toMatchObject({ severity: "warning", feature: "h", measured: 6, required: 5 })
    expect(peck[0]!.message).toMatch(/peck/)
    const gun = find(run(drilled(66)).issues, "DEEP_HOLE")
    expect(gun[0]).toMatchObject({ severity: "error", measured: 11, required: 10 })
    expect(gun[0]!.message).toMatch(/deep-hole/)
  })

  test("the drill ratio is not a printing concern", () => {
    expect(find(run(drilled(66), { process: "print" }).issues, "DEEP_HOLE")).toEqual([])
  })
})

describe("hole edge distance and spacing", () => {
  const withHoles = (...holes: Array<[string, number, number, number]>) => history([
    rect("s", "XY", 0, 0, 80, 60), { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" },
    ...holes.map(([id, u, v, d]): Feature => ({ id, type: "hole", plane: "XY", offset: 10, at: [u, v], diameter: d, depth: 10 }))
  ])

  test("a hole 5 mm from the edge is closer than 1.5 d = 12: a warning with the measured distance", () => {
    const issue = find(run(withHoles(["h", 5, 30, 8])).issues, "HOLE_EDGE_DISTANCE")
    expect(issue).toHaveLength(1)
    expect(issue[0]).toMatchObject({ severity: "warning", feature: "h", measured: 5, required: 12 })
  })

  test("a hole whose rim breaks out of the edge is an error", () => {
    expect(find(run(withHoles(["h", 3, 30, 8])).issues, "HOLE_EDGE_DISTANCE")[0]!.severity).toBe("error")
  })

  test("a hole 12 mm or more from every edge is fine", () => {
    expect(find(run(withHoles(["h", 12, 30, 8])).issues, "HOLE_EDGE_DISTANCE")).toEqual([])
    expect(find(run(withHoles(["h", 40, 30, 8])).issues, "HOLE_EDGE_DISTANCE")).toEqual([])
  })

  test("cast parts and plastics need 2 d", () => {
    expect(find(run(withHoles(["h", 14, 30, 8])).issues, "HOLE_EDGE_DISTANCE")).toEqual([])
    expect(find(run(withHoles(["h", 14, 30, 8]), { material: "cast" }).issues, "HOLE_EDGE_DISTANCE")).toHaveLength(1)
  })

  test("holes closer than twice the larger diameter (centre to centre) are a spacing warning", () => {
    const issue = find(run(withHoles(["a", 30, 30, 6], ["b", 38, 30, 6])).issues, "HOLE_SPACING")
    expect(issue).toHaveLength(1)
    expect(issue[0]).toMatchObject({ severity: "warning", measured: 8, required: 12 })
    expect(issue[0]!.message).toContain("'a'")
    expect(issue[0]!.message).toContain("'b'")
  })

  test("holes that overlap are an error; far holes are fine", () => {
    expect(find(run(withHoles(["a", 30, 30, 6], ["b", 34, 30, 6])).issues, "HOLE_SPACING")[0]!.severity).toBe("error")
    expect(find(run(withHoles(["a", 20, 30, 6], ["b", 50, 30, 6])).issues, "HOLE_SPACING")).toEqual([])
  })

  test("the copies of a linear pattern are checked too: 4 holes 5 mm apart", () => {
    const h = history([
      rect("s", "XY", 0, 0, 80, 60), { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" },
      { id: "h", type: "hole", plane: "XY", offset: 10, at: [30, 30], diameter: 4, depth: 10 },
      { id: "p", type: "pattern", feature: "h", kind: "linear", count: 4, step: [5, 0, 0] }
    ])
    const issues = find(run(h).issues, "HOLE_SPACING")
    // 4 holes 5 mm apart: the three neighbour pairs are closer than 2 x 4 = 8 mm; the pairs two steps apart (10 mm) are not
    expect(issues).toHaveLength(3)
    expect(issues.every((i) => i.measured === 5)).toBe(true)
    expect(issues.map((i) => i.message.match(/'([^']+)' and '([^']+)'/)!.slice(1, 3).join("+")).sort()).toEqual(["h+p#1", "p#1+p#2", "p#2+p#3"])
  })

  test("a circular pattern puts twelve holes on a circle: neighbours are 2 R sin(15 degrees) apart", () => {
    const h = history([
      rect("s", "XY", 0, 0, 80, 80), { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" },
      { id: "h", type: "hole", plane: "XY", offset: 10, at: [50, 40], diameter: 3, depth: 10 },
      { id: "p", type: "pattern", feature: "h", kind: "circular", count: 12, centre: [40, 40] }
    ])
    const issues = find(run(h).issues, "HOLE_SPACING")
    const chord = 2 * 10 * Math.sin(Math.PI / 12)
    expect(issues.length).toBeGreaterThanOrEqual(12) // 12 neighbour pairs at 5.18 mm < 6
    for (const i of issues.filter((x) => x.measured! < 6)) expect(i.measured!).toBeCloseTo(Math.round(chord * 1000) / 1000, 2)
  }, 30_000) // twelve Boolean cuts: slow under machine load

  test("holes on a pattern keep the edge-distance rule: copies that walk off toward the edge are flagged", () => {
    const h = history([
      rect("s", "XY", 0, 0, 80, 60), { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" },
      { id: "h", type: "hole", plane: "XY", offset: 10, at: [30, 30], diameter: 8, depth: 10 },
      { id: "p", type: "pattern", feature: "h", kind: "linear", count: 3, step: [20, 0, 0] }
    ])
    // copies at x = 30, 50, 70; the last is 10 mm from the edge at 80 and a Ø8 hole needs 12
    const edge = find(run(h).issues, "HOLE_EDGE_DISTANCE")
    expect(edge.map((i) => i.feature)).toEqual(["p#2"])
    expect(edge[0]).toMatchObject({ measured: 10, required: 12 })
  })

  test("holes on different planes do not interact", () => {
    const h = history([
      ...PLATE,
      { id: "a", type: "hole", plane: "XY", offset: 10, at: [30, 20], diameter: 6, depth: 10 },
      { id: "b", type: "hole", plane: "YZ", offset: 60, at: [20, 5], diameter: 6, depth: 10 }
    ])
    expect(find(run(h).issues, "HOLE_SPACING")).toEqual([])
  })
})

describe("drill sizes", () => {
  const drilled = (d: number) => history([...PLATE, { id: "h", type: "hole", plane: "XY", offset: 10, at: [30, 20], diameter: d, depth: 10 }])

  test("a standard size (steps of 0.1 mm below 14) raises nothing; 5.55 is an info; above 14 mm there is no rule", () => {
    expect(find(run(drilled(5.5)).issues, "NON_STANDARD_DRILL")).toEqual([])
    const odd = find(run(drilled(5.55)).issues, "NON_STANDARD_DRILL")
    expect(odd).toHaveLength(1)
    expect(odd[0]!.severity).toBe("info")
    expect(find(run(drilled(16.3)).issues, "NON_STANDARD_DRILL")).toEqual([])
  })
})

describe("thin walls", () => {
  const tube = (outer: number, inner: number) => history([rings("s", "XY", 0, 0, [outer, inner]), { id: "tube", type: "extrude", sketch: "s", depth: 20, operation: "new" }])

  test("a 0.3 mm wall in a tube is below half the 0.8 mm minimum: an error that says where and how thin", () => {
    const r = run(tube(10, 9.7))
    const issue = find(r.issues, "THIN_WALL")
    expect(issue).toHaveLength(1)
    expect(issue[0]).toMatchObject({ severity: "error", required: 0.8 })
    expect(issue[0]!.measured!).toBeGreaterThan(0.27)
    expect(issue[0]!.measured!).toBeLessThan(0.33)
    expect(issue[0]!.at).toBeDefined()
    expect(r.ok).toBe(false)
    expect(r.metrics.minWallMm!).toBeLessThan(0.33)
  })

  test("0.6 mm is a warning, 2 mm is fine", () => {
    expect(find(run(tube(10, 9.4)).issues, "THIN_WALL")[0]!.severity).toBe("warning")
    const ok = run(tube(10, 8))
    expect(find(ok.issues, "THIN_WALL")).toEqual([])
    expect(ok.metrics.minWallMm!).toBeGreaterThan(1.9)
  })

  test("the minimum wall follows the process and material, and can be overridden", () => {
    // 0.9 mm: enough for milled metal (0.8), not for milled plastic (1.5)
    expect(find(run(tube(10, 9.1)).issues, "THIN_WALL")).toEqual([])
    expect(find(run(tube(10, 9.1), { material: "plastic" }).issues, "THIN_WALL")).toHaveLength(1)
    expect(find(run(tube(10, 9.1), { minWall: 1 }).issues, "THIN_WALL")).toHaveLength(1)
  })

  test("a printer needs 1.2 mm of plastic; an explicit minWall wins over the table", () => {
    const t = tube(10, 8.5) // 1.5 mm
    expect(find(run(t, { process: "print", material: "plastic" }).issues, "THIN_WALL")).toEqual([])
    expect(find(run(t, { process: "print", material: "plastic", minWall: 2 }).issues, "THIN_WALL")).toHaveLength(1)
    expect(find(run(t, { process: "mill", material: "cast" }).issues, "THIN_WALL")).toHaveLength(1) // cast: 3 mm
  })
})

describe("machine envelope", () => {
  test("a part longer than the travel is an error per axis, with the numbers", () => {
    const r = run(history(PLATE), { envelope: { x: 50, y: 80, z: 5 } })
    const issues = find(r.issues, "EXCEEDS_ENVELOPE")
    expect(issues).toHaveLength(2)
    expect(issues.map((i) => [i.measured, i.required])).toEqual([[60, 50], [10, 5]])
    expect(r.ok).toBe(false)
  })

  test("a part that fits is not flagged", () => {
    expect(find(run(history(PLATE), { envelope: { x: 60, y: 40, z: 10 } }).issues, "EXCEEDS_ENVELOPE")).toEqual([])
  })
})

describe("printing", () => {
  const tShape = history([
    rect("stem", "XY", 0, 0, 10, 10), { id: "stem1", type: "extrude", sketch: "stem", depth: 10, operation: "new" },
    rect("bar", "XY", -10, 0, 30, 10, 10), { id: "bar1", type: "extrude", sketch: "bar", depth: 10, operation: "union" }
  ])

  test("a T shape needs support under its bar; a plain block does not", () => {
    const issue = find(run(tShape, { process: "print", material: "plastic" }).issues, "OVERHANG")
    expect(issue).toHaveLength(1)
    expect(issue[0]).toMatchObject({ severity: "warning", required: 0.05 })
    expect(issue[0]!.measured!).toBeGreaterThan(0.05)
    expect(find(run(history(PLATE), { process: "print", material: "plastic" }).issues, "OVERHANG")).toEqual([])
  })

  test("the overhang share limit can be relaxed", () => {
    expect(find(run(tShape, { process: "print", limits: { overhangShare: 0.9 } }).issues, "OVERHANG")).toEqual([])
  })

  test("a hole below the printer's resolution is a warning", () => {
    const h = history([...PLATE, { id: "pin", type: "hole", plane: "XY", offset: 10, at: [30, 20], diameter: 0.5, depth: 10 }])
    expect(find(run(h, { process: "print" }).issues, "SMALL_HOLE")).toHaveLength(1)
    expect(find(run(h, { process: "mill" }).issues, "SMALL_HOLE")).toEqual([])
  })
})

describe("turning", () => {
  const shaft = (length: number) => history([rect("s", "XY", 0, 0, 5, length), { id: "r", type: "revolve", sketch: "s", axis: "y", operation: "new" }])

  test("10 diameters long wants the tailstock (warning); 13 wants a steady rest too (error); 6 is fine", () => {
    expect(find(run(shaft(60), { process: "turn" }).issues, "SLENDER_TURNING")).toEqual([])
    const warn = find(run(shaft(100), { process: "turn" }).issues, "SLENDER_TURNING")
    expect(warn[0]).toMatchObject({ severity: "warning", required: 8 })
    expect(warn[0]!.measured!).toBeGreaterThan(9.8)
    expect(warn[0]!.measured!).toBeLessThan(10.2)
    expect(warn[0]!.message).toMatch(/tailstock/)
    const hard = find(run(shaft(130), { process: "turn" }).issues, "SLENDER_TURNING")
    expect(hard[0]).toMatchObject({ severity: "error", required: 12 })
    expect(hard[0]!.message).toMatch(/steady rest/)
  })

  test("the slenderness rule belongs to turning only", () => {
    expect(find(run(shaft(130), { process: "mill" }).issues, "SLENDER_TURNING")).toEqual([])
  })
})

describe("design intent", () => {
  test("a sketch with freedom left is an info with the degrees of freedom; a fully constrained one is not", () => {
    const loose: SketchFeature = {
      id: "loose", type: "sketch", plane: "XY",
      sketch: { entities: [pt("a", 0, 0), pt("b", 10, 0), pt("c", 10, 10), pt("d", 0, 10), line("1", "a", "b"), line("2", "b", "c"), line("3", "c", "d"), line("4", "d", "a")], constraints: [{ type: "fixed", point: "a" }] }
    }
    const r = run(history([loose, { id: "e", type: "extrude", sketch: "loose", depth: 5, operation: "new" }]))
    const issue = find(r.issues, "UNDER_CONSTRAINED")
    expect(issue).toHaveLength(1)
    expect(issue[0]).toMatchObject({ severity: "info", feature: "loose", required: 0 })
    expect(issue[0]!.measured!).toBeGreaterThan(0)
    expect(find(run(history(PLATE)).issues, "UNDER_CONSTRAINED")).toEqual([])
  })

  test("literal key dimensions in a history that has parameters are an info; with no parameters there is nothing to prefer", () => {
    const literal = history([rect("s", "XY", 0, 0, "w", 40), { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" }, { id: "h", type: "hole", plane: "XY", offset: 10, at: [30, 20], diameter: 6, depth: 10 }], { w: 60 })
    const issue = find(run(literal).issues, "LITERAL_DIMENSION")
    expect(issue).toHaveLength(1)
    expect(issue[0]).toMatchObject({ severity: "info", measured: 3 })
    expect(issue[0]!.message).toContain("plate.depth")
    expect(issue[0]!.message).toContain("h.diameter")
    expect(find(run(history(PLATE)).issues, "LITERAL_DIMENSION")).toEqual([])
    const named = history([rect("s", "XY", 0, 0, "w", 40), { id: "plate", type: "extrude", sketch: "s", depth: "t", operation: "new" }], { w: 60, t: 10 })
    expect(find(run(named).issues, "LITERAL_DIMENSION")).toEqual([])
  })

  test("infos and warnings do not stop a part: ok is false only when an error exists", () => {
    const warnOnly = run(history([...PLATE, { id: "h", type: "hole", plane: "XY", offset: 10, at: [5, 20], diameter: 8, depth: 10 }]))
    expect(warnOnly.issues.some((i) => i.severity === "warning")).toBe(true)
    expect(warnOnly.issues.some((i) => i.severity === "error")).toBe(false)
    expect(warnOnly.ok).toBe(true)
    const infoOnly = run(history([...PLATE, { id: "h", type: "hole", plane: "XY", offset: 10, at: [30, 20], diameter: 5.55, depth: 10 }]))
    expect(infoOnly.issues.map((i) => i.severity)).toEqual(["info"])
    expect(infoOnly.ok).toBe(true)
    const broken = run(history([...PLATE, { id: "h", type: "hole", plane: "XY", offset: 10, at: [1, 20], diameter: 8, depth: 10 }]))
    expect(broken.ok).toBe(false)
    for (const r of [warnOnly, infoOnly, broken]) expect(r.ok).toBe(!r.issues.some((i) => i.severity === "error"))
  })

  test("a history that does not rebuild reports the rebuild problem as an error and does not throw", () => {
    const r = run(history([...PLATE, { id: "bad", type: "extrude", sketch: "nowhere", depth: 5, operation: "new" }]))
    expect(codes(r.issues)).toContain("REBUILD")
    expect(find(r.issues, "REBUILD")[0]).toMatchObject({ severity: "error", feature: "bad" })
    expect(r.ok).toBe(false)
  })

  test("an empty result has no size and no wall", () => {
    const r = run(history([rect("s", "XY", 0, 0, 5, 5)]))
    expect(r.metrics).toMatchObject({ bodies: 0, volumeMm3: 0, size: null, minWallMm: null })
  })
})

describe("grid patterns are checked hole by hole", () => {
  const gridded = (pattern: Record<string, unknown>, at: [number, number] = [10, 10]): History => history([
    ...PLATE, { id: "h", type: "hole", plane: "XY", offset: 10, at, diameter: 5, depth: 10 },
    { id: "g", type: "pattern", feature: "h", kind: "grid", ...pattern } as Feature
  ])

  test("3 x 2 holes 8 mm apart along X: the four neighbour pairs in the rows are closer than 2 x 5 = 10 mm; the rows (12 mm apart) are fine", () => {
    const issues = find(run(gridded({ count: 3, countB: 2, step: [8, 0, 0], stepB: [0, 12, 0] })).issues, "HOLE_SPACING")
    expect(issues).toHaveLength(4)
    expect(issues.every((i) => i.measured === 8 && i.required === 10 && i.severity === "warning")).toBe(true)
    const pairs = issues.map((i) => i.message.match(/'([^']+)' and '([^']+)'/)!.slice(1, 3).join("+")).sort()
    expect(pairs).toEqual(["g#0.1+g#1.1", "g#1.0+g#2.0", "g#1.1+g#2.1", "h+g#1.0"].sort())
  })

  test("a grid spaced 12 and 14 mm is clean", () => {
    expect(find(run(gridded({ count: 3, countB: 2, step: [12, 0, 0], stepB: [0, 14, 0] })).issues, "HOLE_SPACING")).toEqual([])
  })

  test("the rows go along the second step: holes 6 mm apart along Y are flagged, with the diagonal pairs (7.2 mm) too", () => {
    const issues = find(run(gridded({ count: 2, countB: 2, step: [6, 0, 0], stepB: [0, 6, 0] })).issues, "HOLE_SPACING")
    // 4 holes on a 6 mm square: 4 sides at 6 mm and 2 diagonals at 8.49 mm, all under 10 mm.
    expect(issues).toHaveLength(6)
    expect(issues.filter((i) => i.measured === 6)).toHaveLength(4)
    expect(issues.filter((i) => Math.abs(i.measured! - 8.49) < 0.01)).toHaveLength(2)
  })

  test("a copy that walks off towards the edge is a HOLE_EDGE_DISTANCE on that copy: 58 mm along a 60 mm plate is 2 mm from the edge (error, under half a hole)", () => {
    const issues = find(run(gridded({ count: 3, countB: 2, step: [24, 0, 0], stepB: [0, 12, 0] })).issues, "HOLE_EDGE_DISTANCE")
    expect(issues.map((i) => i.feature).sort()).toEqual(["g#2.0", "g#2.1"])
    expect(issues.every((i) => i.measured === 2 && i.required === 7.5 && i.severity === "error")).toBe(true)
  })

  test("the step is a world vector projected into the hole's plane: on a YZ hole plane a step along Y moves the hole along u", () => {
    const h = history([
      ...PLATE, rect("w", "XY", 0, 0, 10, 10, 0),
      { id: "h", type: "hole", plane: "YZ", offset: 60, at: [20, 5], diameter: 3, depth: 10 },
      { id: "g", type: "pattern", feature: "h", kind: "grid", count: 3, countB: 2, step: [0, 4, 0], stepB: [0, 0, 3] }
    ])
    // Holes 4 mm apart in Y and 3 mm in Z with d = 3: centre distance 3 < 6 (error: under (3 + 3) / 2 = 3 is not reached, so a warning).
    const issues = find(run(h).issues, "HOLE_SPACING")
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some((i) => i.measured === 3)).toBe(true)
    expect(issues.some((i) => i.measured === 4)).toBe(true)
  })

  test("a grid with a missing or fractional row count is skipped by the check without raising", () => {
    expect(() => run(gridded({ count: 3, step: [8, 0, 0], stepB: [0, 12, 0] }))).not.toThrow()
    expect(find(run(gridded({ count: 3, countB: 1.5, step: [8, 0, 0], stepB: [0, 12, 0] })).issues, "HOLE_SPACING")).toEqual([])
  })
})
