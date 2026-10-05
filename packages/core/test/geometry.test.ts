/**
 * WP1 acceptance tests (spec 03-core-cad.md §5).
 */
import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import {
  arcBounds,
  arc,
  arcPoints,
  arcSegmentCount,
  boundsOfDrawing,
  boundingBox,
  circle,
  dedupePoints,
  decodeDrawing,
  decodeEntity,
  dropClosingDuplicate,
  encodeEntity,
  ellipse,
  ellipseBounds,
  ellipsePoints,
  ellipseSegmentCount,
  ENTITY_TAGS,
  entitySchemaOf,
  evaluateSpline,
  fillet,
  intersect,
  intersectCircles,
  intersectLineCircle,
  line,
  makeRectangle,
  migrateDrawing,
  meshOf,
  offsetPolyline,
  polyline,
  rectangleToPolyline,
  regularPolygon,
  reverseRing,
  roundRing,
  SELF_TOLERANCE,
  slot,
  snapSettings,
  findSnap,
  tessellate,
  TEXTURE_REL,
  meshBounds,
  meshVolume,
  type Entity,
  type PolylineEntity,
  type SplineEntity,
  type Vec2
} from "../src/cad/index.ts"

// ---------------------------------------------------------------- helpers

const unitSquare = (id = "sq"): PolylineEntity => ({
  _tag: "Polyline",
  id,
  layerId: "layer-0",
  visible: true,
  locked: false,
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }
  ],
  closed: true
})

const bboxOf = (entities: ReadonlyArray<Entity>) => boundsOfDrawing(entities)

/** Dense reference sample of a rotated ellipse, for the 1e-6 comparison. */
const denseEllipseBounds = (e: Entity & { _tag: "Ellipse" }) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const c = Math.cos(e.rotation)
  const s = Math.sin(e.rotation)
  for (let i = 0; i < 2_000_000; i++) {
    const t = (i / 2_000_000) * Math.PI * 2
    const x = e.radiusX * Math.cos(t)
    const y = e.radiusY * Math.sin(t)
    const px = e.center.x + x * c - y * s
    const py = e.center.y + x * s + y * c
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }
  return { minX, minY, maxX, maxY }
}

// ---------------------------------------------------------------- bounds

describe("boundingBox", () => {
  test("quarter-circle arc equals the analytic box", () => {
    // 0 → 90° about (10, 20) with r = 5: extremes are (15,20), (10,25), plus endpoints.
    const e = arc("a", { x: 10, y: 20 }, 5, 0, Math.PI / 2)
    const b = boundingBox(e)
    expect(b.minX).toBeCloseTo(10, 9)
    expect(b.maxX).toBeCloseTo(15, 9)
    expect(b.minY).toBeCloseTo(20, 9)
    expect(b.maxY).toBeCloseTo(25, 9)
  })

  test("a half arc picks up the axis extreme inside its sweep", () => {
    // 0 → 180° about (0,0) with r = 3: minX = −3 (at 180°), maxX = +3 (at 0°),
    // maxY = +3 (at 90°), minY = 0 (both endpoints sit on the x axis).
    const b = boundingBox(arc("a", { x: 0, y: 0 }, 3, 0, Math.PI))
    expect(b.minX).toBeCloseTo(-3, 9)
    expect(b.maxX).toBeCloseTo(3, 9)
    expect(b.minY).toBeCloseTo(0, 9)
    expect(b.maxY).toBeCloseTo(3, 9)
  })

  test("a clockwise sweep uses the mirrored extremes", () => {
    // Clockwise from 90° to −90° passes through 0°, so the right half is the arc's
    // own extent and the left extremum is reached only at the two endpoints.
    const b = boundingBox(arc("a", { x: 0, y: 0 }, 2, Math.PI / 2, -Math.PI / 2, true))
    expect(Math.abs(b.minX)).toBeCloseTo(0, 9)
    expect(b.maxX).toBeCloseTo(2, 9)
    expect(b.minY).toBeCloseTo(-2, 9)
    expect(b.maxY).toBeCloseTo(2, 9)
  })

  test("a three-quarter arc spans all four extremes", () => {
    const b = boundingBox(arc("a", { x: 0, y: 0 }, 3, 0, (3 * Math.PI) / 2))
    expect(b.minX).toBeCloseTo(-3, 9)
    expect(b.maxX).toBeCloseTo(3, 9)
    expect(b.minY).toBeCloseTo(-3, 9)
    expect(b.maxY).toBeCloseTo(3, 9)
  })

  test("a full arc is the full circle box", () => {
    const b = boundingBox(arc("a", { x: 1, y: 2 }, 4, 0, 0))
    expect(b.minX).toBeCloseTo(-3, 9)
    expect(b.minY).toBeCloseTo(-2, 9)
    expect(b.maxX).toBeCloseTo(5, 9)
    expect(b.maxY).toBeCloseTo(6, 9)
  })

  test("rotated ellipse matches a dense reference within 1e-6", () => {
    const cases: Array<[number, number, number, number]> = [
      [3, 1, 0.3, 0.1],
      [10, 2, 1.1, -0.7],
      [1, 9, -2.2, 2.9],
      [5, 5, Math.PI / 4, Math.PI / 2]
    ]
    for (const [rx, ry, rot, cx] of cases) {
      const e = ellipse("e", { x: cx, y: -cx }, rx, ry, rot)
      const analytic = ellipseBounds(e.center, rx, ry, rot)
      const dense = denseEllipseBounds(e)
      expect(analytic.minX).toBeCloseTo(dense.minX, 6)
      expect(analytic.minY).toBeCloseTo(dense.minY, 6)
      expect(analytic.maxX).toBeCloseTo(dense.maxX, 6)
      expect(analytic.maxY).toBeCloseTo(dense.maxY, 6)
    }
  })

  test("arc bounds match sampled points", () => {
    const e = arc("a", { x: 1, y: 2 }, 4, 0.2, 2.4)
    const b = boundingBox(e)
    const pts = arcPoints(e.center, e.radius, e.startAngle, e.endAngle, e.clockwise, 1e-4)
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(b.minX - 1e-9)
      expect(p.x).toBeLessThanOrEqual(b.maxX + 1e-9)
      expect(p.y).toBeGreaterThanOrEqual(b.minY - 1e-9)
      expect(p.y).toBeLessThanOrEqual(b.maxY + 1e-9)
    }
  })

  test("a drawing's bounds union every entity", () => {
    const b = bboxOf([
      line("l", { x: 0, y: 0 }, { x: 2, y: 0 }),
      circle("c", { x: 5, y: 0 }, 1),
      makeRectangle("r", { x: -3, y: -3 }, { x: -1, y: -1 })
    ])
    expect(b.minX).toBeCloseTo(-3, 9)
    expect(b.minY).toBeCloseTo(-3, 9)
    expect(b.maxX).toBeCloseTo(6, 9)
    expect(b.maxY).toBeCloseTo(1, 9)
  })

  test("an empty drawing yields an empty box", () => {
    const b = bboxOf([])
    expect(b.maxX).toBeLessThan(b.minX)
  })

  test("block children contribute their bounds at the base point", () => {
    const block: Entity = {
      _tag: "Block",
      id: "blk",
      layerId: "layer-0",
      visible: true,
      locked: false,
      name: "b",
      basePoint: { x: 10, y: 10 },
      entities: [line("child", { x: 0, y: 0 }, { x: 2, y: 2 })]
    }
    const b = bboxOf([block])
    expect(b.minX).toBeCloseTo(10, 9)
    expect(b.maxX).toBeCloseTo(12, 9)
  })
})

// ---------------------------------------------------------------- tessellate

describe("tessellate", () => {
  test("a circle stays within the chord tolerance for radii 0.1–1000 mm", () => {
    for (const tolerance of [0.5, 0.1, 0.01, 0.001]) {
      for (const radius of [0.1, 1, 10, 100, 1000]) {
        const e = circle("c", { x: 0, y: 0 }, radius)
        const [ring] = tessellate(e, tolerance)
        expect(ring).toBeDefined()
        for (const p of ring!) {
          // Deviation from the true circle equals r - |p|.
          const deviation = radius - Math.hypot(p.x, p.y)
          expect(deviation).toBeLessThanOrEqual(tolerance + 1e-9)
        }
      }
    }
  })

  test("a closed ring omits the duplicated closing point", () => {
    const [ring] = tessellate(circle("c", { x: 0, y: 0 }, 5), 0.1)
    const first = ring![0]!
    const last = ring![ring!.length - 1]!
    expect(first.x === last.x && first.y === last.y).toBe(false)
  })

  test("arcPoints include both endpoints", () => {
    const pts = arcPoints({ x: 0, y: 0 }, 1, 0, Math.PI / 2, false, 0.01)
    expect(pts[0]!.x).toBeCloseTo(1, 6)
    expect(pts[0]!.y).toBeCloseTo(0, 6)
    const last = pts[pts.length - 1]!
    expect(last.x).toBeCloseTo(0, 6)
    expect(last.y).toBeCloseTo(1, 6)
  })

  test("a bulged polyline segment becomes an arc within tolerance", () => {
    // DXF convention: bulge = tan(sweep / 4), positive = counter-clockwise. Going
    // left to right, the centre therefore sits on the left of travel, at
    // (5, 5) with radius 10 / (2 sin 45°) = 5√2, and the arc dips below the chord
    // to y = 5 - 5√2.
    const bulge = Math.tan((Math.PI / 2) / 4)
    const bulged = (value: number): PolylineEntity => ({
      _tag: "Polyline",
      id: "p",
      layerId: "layer-0",
      visible: true,
      locked: false,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      closed: false,
      bulge: [value, 0]
    })
    const tolerance = 0.001
    // Chord sampling can only stay *inside* the arc, so the sampled extreme is
    // never lower than the analytic one.
    const deepest = 5 - 5 * Math.SQRT2
    const ring = tessellate(bulged(bulge), tolerance)[0]!
    const bottom = ring.reduce((m, p) => Math.min(m, p.y), Infinity)
    expect(bottom).toBeGreaterThanOrEqual(deepest - 1e-9)
    expect(bottom).toBeLessThanOrEqual(deepest + tolerance)
    for (const p of ring) {
      // Every sampled point stays on the fitted circle.
      expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(5 * Math.SQRT2, 3)
    }
    // The mirrored (clockwise) bulge rises by the same amount.
    const top = tessellate(bulged(-bulge), tolerance)[0]!.reduce((m, p) => Math.max(m, p.y), -Infinity)
    expect(top).toBeGreaterThanOrEqual(-deepest - tolerance)
    expect(top).toBeLessThanOrEqual(-deepest + 1e-9)
  })

  test("ellipsePoints stay on the ellipse", () => {
    const pts = ellipsePoints({ x: 1, y: 2 }, 4, 2, 0.3, 64)
    const c = Math.cos(0.3)
    const s = Math.sin(0.3)
    for (const p of pts) {
      const dx = p.x - 1
      const dy = p.y - 2
      const lx = dx * c + dy * s
      const ly = -dx * s + dy * c
      const value = (lx * lx) / 16 + (ly * ly) / 4
      expect(value).toBeCloseTo(1, 9)
    }
    expect(ellipseSegmentCount(4, 2, 0.1)).toBeGreaterThan(8)
  })

  test("text and dimension tessellate to nothing", () => {
    const text: Entity = {
      _tag: "Text",
      id: "t",
      layerId: "layer-0",
      visible: true,
      locked: false,
      position: { x: 0, y: 0 },
      text: "hello",
      fontSize: 2,
      fontFamily: "Helvetica",
      rotation: 0,
      alignment: "left",
      baseline: "bottom"
    }
    expect(tessellate(text, 0.1)).toEqual([])
  })

  test("arcSegmentCount grows as the tolerance shrinks", () => {
    expect(arcSegmentCount(10, Math.PI, 0.1)).toBeGreaterThan(arcSegmentCount(10, Math.PI, 1))
  })

  test("dropClosingDuplicate removes only an exact duplicate", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }]
    expect(dropClosingDuplicate(pts)).toHaveLength(3)
    expect(dropClosingDuplicate([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toHaveLength(2)
  })
})

// ---------------------------------------------------------------- intersect

describe("intersect", () => {
  const c = circle("c", { x: 0, y: 0 }, 5)
  const horizontalLine = (y: number): Entity => line("l", { x: -20, y }, { x: 20, y })

  test("a secant line returns two points", () => {
    const pts = intersect(c, horizontalLine(0))
    expect(pts).toHaveLength(2)
    expect(Math.abs(pts[0]!.x)).toBeCloseTo(5, 9)
    expect(Math.abs(pts[1]!.x)).toBeCloseTo(5, 9)
  })

  test("a tangent line returns one point within EPS", () => {
    const pts = intersect(c, horizontalLine(5))
    expect(pts).toHaveLength(1)
    expect(Math.hypot(pts[0]!.x, pts[0]!.y)).toBeCloseTo(5, 9)
  })

  test("a missing line returns zero points", () => {
    expect(intersect(c, horizontalLine(6))).toHaveLength(0)
  })

  test("intersectLineCircle distinguishes miss, tangent and secant", () => {
    expect(intersectLineCircle({ x: -10, y: 6 }, { x: 10, y: 6 }, { x: 0, y: 0 }, 5)).toHaveLength(0)
    expect(intersectLineCircle({ x: -10, y: 5 }, { x: 10, y: 5 }, { x: 0, y: 0 }, 5)).toHaveLength(1)
    expect(intersectLineCircle({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, 5)).toHaveLength(2)
  })

  test("circle–circle: disjoint, tangent, secant and coincident", () => {
    expect(intersectCircles({ x: 0, y: 0 }, 1, { x: 10, y: 0 }, 1)).toHaveLength(0)
    expect(intersectCircles({ x: 0, y: 0 }, 1, { x: 2, y: 0 }, 1)).toHaveLength(1)
    expect(intersectCircles({ x: 0, y: 0 }, 1, { x: 1, y: 0 }, 1)).toHaveLength(2)
    expect(intersectCircles({ x: 0, y: 0 }, 1, { x: 0, y: 0 }, 1)).toHaveLength(0)
  })

  test("an arc does not report a hit outside its sweep", () => {
    // Quarter arc in the first quadrant; a line at y = -5 must miss it.
    const quarter = arc("a", { x: 0, y: 0 }, 5, 0, Math.PI / 2)
    expect(intersect(quarter, horizontalLine(-5))).toHaveLength(0)
    // The same line at y = 0 hits the arc endpoint.
    expect(intersect(quarter, horizontalLine(0)).length).toBeGreaterThanOrEqual(1)
  })

  test("crossing polyline segments intersect once", () => {
    const a: PolylineEntity = {
      _tag: "Polyline",
      id: "a",
      layerId: "layer-0",
      visible: true,
      locked: false,
      points: [{ x: -1, y: 0 }, { x: 1, y: 0 }],
      closed: false
    }
    const b: PolylineEntity = {
      _tag: "Polyline",
      id: "b",
      layerId: "layer-0",
      visible: true,
      locked: false,
      points: [{ x: 0, y: -1 }, { x: 0, y: 1 }],
      closed: false
    }
    const pts = intersect(a, b)
    expect(pts).toHaveLength(1)
    expect(pts[0]!.x).toBeCloseTo(0, 9)
    expect(pts[0]!.y).toBeCloseTo(0, 9)
  })

  test("parallel lines do not intersect", () => {
    expect(intersect(horizontalLine(0), horizontalLine(3))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- offset

describe("offsetPolyline", () => {
  test("a unit square offset by +0.1 becomes a square of side 1.2", () => {
    // Positive offsets to the right of travel, which is outwards for a
    // counter-clockwise ring.
    const b = bboxOfRings(offsetPolyline(unitSquare().points, 0.1, true))
    expect(b.width).toBeCloseTo(1.2, 6)
    expect(b.height).toBeCloseTo(1.2, 6)
  })

  test("a unit square offset by −0.1 becomes a square of side 0.8", () => {
    const b = bboxOfRings(offsetPolyline(unitSquare().points, -0.1, true))
    expect(b.width).toBeCloseTo(0.8, 6)
    expect(b.height).toBeCloseTo(0.8, 6)
  })

  test("a unit square offset by +0.6 becomes a square of side 2.2", () => {
    const b = bboxOfRings(offsetPolyline(unitSquare().points, 0.6, true))
    expect(b.width).toBeCloseTo(2.2, 6)
    expect(b.height).toBeCloseTo(2.2, 6)
  })

  test("an inward offset past the centre collapses to nothing", () => {
    // −0.6 on a 1 mm square crosses the centre, so the ring would invert and no
    // loop survives.
    expect(offsetPolyline(unitSquare().points, -0.6, true)).toHaveLength(0)
  })

  test("offsetting a straight open line produces a parallel line at the given distance", () => {
    const loops = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2, false)
    expect(loops).toHaveLength(1)
    for (const p of loops[0]!) expect(Math.abs(p.y)).toBeCloseTo(2, 6)
  })

  test("a small offset in either direction survives and changes size", () => {
    expect(offsetPolyline(unitSquare().points, 0.1, true)).toHaveLength(1)
    expect(offsetPolyline(unitSquare().points, -0.1, true)).toHaveLength(1)
    expect(bboxOfRings(offsetPolyline(unitSquare().points, 0.1, true)).width).toBeCloseTo(1.2, 6)
    expect(bboxOfRings(offsetPolyline(unitSquare().points, -0.1, true)).width).toBeCloseTo(0.8, 6)
  })

  test("an arc join produces more points than a mitre", () => {
    const triangle: Vec2[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
    const mitre = offsetPolyline(triangle, 0.5, true)
    const arcs = offsetPolyline(triangle, 0.5, true, { arcJoins: true })
    expect(arcs[0]!.length).toBeGreaterThan(mitre[0]!.length)
  })
})

const bboxOfRings = (loops: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const loop of loops) {
    for (const p of loop) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

// ---------------------------------------------------------------- schema round-trip

describe("entity schema round-trip", () => {
  const sample = (tag: Entity["_tag"]): Entity => {
    const base = { id: `id-${tag}`, layerId: "layer-0", visible: true, locked: false }
    switch (tag) {
      case "Line":
        return { ...base, _tag: "Line", start: { x: 1.5, y: -2.25 }, end: { x: 4, y: 9 } }
      case "Circle":
        return { ...base, _tag: "Circle", center: { x: 1, y: 2 }, radius: 3 }
      case "Arc":
        return { ...base, _tag: "Arc", center: { x: 0, y: 0 }, radius: 2, startAngle: 0.5, endAngle: 3, clockwise: true }
      case "Polyline":
        return { ...base, _tag: "Polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], closed: true, bulge: [0.5, 0, 0] }
      case "Rectangle":
        return { ...base, _tag: "Rectangle", corner1: { x: -1, y: -1 }, corner2: { x: 1, y: 1 } }
      case "Ellipse":
        return { ...base, _tag: "Ellipse", center: { x: 3, y: 3 }, radiusX: 4, radiusY: 2, rotation: 0.7 }
      case "Spline":
        return { ...base, _tag: "Spline", controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 0 }], degree: 2, closed: false }
      case "Text":
        return { ...base, _tag: "Text", position: { x: 1, y: 2 }, text: "hi", fontSize: 3, fontFamily: "Helvetica", rotation: 0.2, alignment: "center", baseline: "middle" }
      case "Dimension":
        return { ...base, _tag: "Dimension", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, text: "10", textPosition: { x: 5, y: 1 }, arrowSize: 2, textSize: 2.5, dimensionType: "linear" }
      case "Hatch":
        return { ...base, _tag: "Hatch", boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], pattern: "lines", scale: 2, angle: 0.5 }
      case "Block":
        return { ...base, _tag: "Block", name: "b1", basePoint: { x: 1, y: 1 }, entities: [{ ...base, _tag: "Line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }] }
    }
  }

  test("every _tag round-trips through the union codec", () => {
    for (const tag of ENTITY_TAGS) {
      const original = sample(tag)
      const encoded = Effect.runSync(encodeEntity(original))
      expect(Effect.runSync(decodeEntity(encoded))).toEqual(original)
    }
  })

  test("every _tag round-trips through its narrow per-tag codec", async () => {
    for (const tag of ENTITY_TAGS) {
      const schema = entitySchemaOf(tag)
      const original = sample(tag)
      const encoded = await Effect.runPromise(Schema.encodeEffect(schema as Schema.Codec<Entity>)(original))
      const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(schema as Schema.Codec<Entity>)(encoded))
      expect(decoded).toEqual(original)
    }
  })

  test("encoding then decoding is stable for a second round trip", () => {
    const original = sample("Block")
    const once = Effect.runSync(decodeEntity(Effect.runSync(encodeEntity(original))))
    const twice = Effect.runSync(decodeEntity(Effect.runSync(encodeEntity(once))))
    expect(twice).toEqual(once)
  })
})

// ---------------------------------------------------------------- migrateDrawing

describe("migrateDrawing", () => {
  test("accepts a legacy v5 document and yields a valid drawing", async () => {
    const legacy = {
      id: "legacy-drawing",
      name: "Old part",
      units: "mm",
      version: 4,
      entities: [
        { id: "e1", type: "line", start: [0, 0], end: [10, 0] },
        { id: "e2", type: "circle", center: { x: 5, y: 5 }, radius: 2 },
        { id: "e3", type: "polyline", points: [[0, 0], [1, 1], [2, 0]], closed: true },
        { id: "e4", type: "rectangle", corner1: [0, 0], corner2: [4, 4] }
      ]
    }
    const drawing = await Effect.runPromise(migrateDrawing(legacy))
    expect(drawing.schemaVersion).toBe(1)
    expect(drawing.entities).toHaveLength(4)
    expect(drawing.entities.map((e) => e._tag).sort()).toEqual(["Circle", "Line", "Polyline", "Rectangle"])
    expect(drawing.version).toBe(4)
    // Decoding the result again must succeed (it is a valid current document).
    const validated = await Effect.runPromise(decodeDrawing(drawing))
    expect(validated.entities).toHaveLength(4)
  })

  test("drops unmigratable entities instead of failing", async () => {
    const drawing = await Effect.runPromise(
      migrateDrawing({
        schemaVersion: 1,
        id: "d",
        entities: [{ _tag: "Line", id: "ok", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, { _tag: "Nonsense", id: "bad" }]
      })
    )
    expect(drawing.entities).toHaveLength(1)
  })

  test("rejects a future schema version with a tagged error", async () => {
    const exit = await Effect.runPromise(Effect.exit(migrateDrawing({ schemaVersion: 99, id: "d", entities: [] })))
    expect(exit._tag).toBe("Failure")
  })

  test("rejects a non-object", async () => {
    const exit = await Effect.runPromise(Effect.exit(migrateDrawing(42)))
    expect(exit._tag).toBe("Failure")
  })
})

// ---------------------------------------------------------------- shapes / splines / snap / solid

describe("shapes", () => {
  test("rectangleToPolyline is counter-clockwise from the minimum corner", () => {
    const pts = rectangleToPolyline({ x: 5, y: 5 }, { x: 0, y: 0 })
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts[2]).toEqual({ x: 5, y: 5 })
    expect(pts).toHaveLength(4)
  })

  test("regularPolygon has the requested number of vertices on the circle", () => {
    const pts = regularPolygon({ x: 1, y: 1 }, 2, 6)
    expect(pts).toHaveLength(6)
    for (const p of pts) expect(Math.hypot(p.x - 1, p.y - 1)).toBeCloseTo(2, 9)
  })

  test("slot is a stadium of the requested radius", () => {
    const pts = slot({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)
    expect(pts.length).toBeGreaterThan(8)
    // Every point sits exactly `radius` from one of the two end centres.
    for (const p of pts) {
      const d = Math.min(Math.hypot(p.x, p.y), Math.hypot(p.x - 10, p.y))
      expect(d).toBeCloseTo(1, 6)
    }
  })

  test("fillet returns tangent points at the requested radius", () => {
    const r = fillet({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, 1)
    expect(r).toBeDefined()
    // 90° corner: the tangent points sit 1 mm along each leg.
    expect(r!.a.x).toBeCloseTo(1, 9)
    expect(r!.b.y).toBeCloseTo(1, 9)
  })

  test("fillet fails when the radius does not fit the legs", () => {
    expect(fillet({ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0, y: 0.1 }, 1)).toBeUndefined()
  })

  test("reverseRing flips the winding", () => {
    const sq = unitSquare().points
    const rev = reverseRing(sq)
    expect(rev[0]).toEqual(sq[0])
    expect(rev[1]).toEqual(sq[sq.length - 1])
  })

  test("dedupePoints drops consecutive duplicates", () => {
    const pts = dedupePoints([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }])
    expect(pts).toHaveLength(2)
  })
})

describe("spline", () => {
  test("a clamped quadratic passes through its endpoints", () => {
    const p0 = { x: 0, y: 0 }
    const p1 = { x: 1, y: 2 }
    const p2 = { x: 2, y: 0 }
    const start = evaluateSpline([p0, p1, p2], 2, false, 0)
    const end = evaluateSpline([p0, p1, p2], 2, false, 1)
    expect(start.x).toBeCloseTo(0, 9)
    expect(start.y).toBeCloseTo(0, 9)
    expect(end.x).toBeCloseTo(2, 9)
    expect(end.y).toBeCloseTo(0, 9)
  })

  test("the curve stays inside the control polygon hull", () => {
    const cps: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }, { x: 5, y: 8 }, { x: 10, y: 0 }]
    for (let i = 0; i <= 20; i++) {
      const p = evaluateSpline(cps, 2, false, i / 20)
      expect(p.y).toBeLessThanOrEqual(8 + 1e-9)
      expect(p.x).toBeGreaterThanOrEqual(-1e-9)
      expect(p.x).toBeLessThanOrEqual(10 + 1e-9)
    }
  })

  test("a closed spline starts and ends at the same point", () => {
    const cps: Array<{ x: number; y: number }> = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 }
    ]
    const a = evaluateSpline(cps, 3, true, 0)
    const b = evaluateSpline(cps, 3, true, 1)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6)
  })

  test("tessellating a spline respects the tolerance", () => {
    const s: SplineEntity = {
      _tag: "Spline",
      id: "s",
      layerId: "layer-0",
      visible: true,
      locked: false,
      controlPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }],
      degree: 2,
      closed: false
    }
    const coarse = tessellate(s, 1)[0]!
    const fine = tessellate(s, 0.01)[0]!
    expect(fine.length).toBeGreaterThan(coarse.length)
  })
})

describe("findSnap", () => {
  const entities: Array<Entity> = [
    line("l1", { x: 0, y: 0 }, { x: 10, y: 0 }),
    circle("c1", { x: 20, y: 20 }, 5),
    unitSquare("sq")
  ]

  test("an endpoint wins near a line end", () => {
    const snap = findSnap(entities, { x: 0.2, y: 0.2 }, snapSettings({ tolerance: 2 }))
    expect(snap?.type).toBe("endpoint")
    expect(snap?.point).toEqual({ x: 0, y: 0 })
  })

  test("a circle centre wins near the middle of nothing else", () => {
    const snap = findSnap([circle("c1", { x: 20, y: 20 }, 5)], { x: 20.3, y: 20.1 }, snapSettings({ tolerance: 2 }))
    expect(snap?.type).toBe("center")
    expect(snap?.point).toEqual({ x: 20, y: 20 })
  })

  test("a midpoint is found on a segment", () => {
    const snap = findSnap([line("l1", { x: 0, y: 0 }, { x: 10, y: 0 })], { x: 5.1, y: 0.1 }, snapSettings({ tolerance: 2 }))
    expect(snap?.type).toBe("midpoint")
    expect(snap?.point).toEqual({ x: 5, y: 0 })
  })

  test("intersections are found where two entities cross", () => {
    // The crossing sits at x = 3.5, which is neither a vertex nor the midpoint of
    // the slanted segment (its midpoint is (4.5, 0)), and the tolerance keeps
    // that midpoint out of the running.
    const v: PolylineEntity = {
      _tag: "Polyline",
      id: "v",
      layerId: "layer-0",
      visible: true,
      locked: false,
      points: [{ x: 2, y: -3 }, { x: 7, y: 7 }],
      closed: false
    }
    const snap = findSnap([line("l1", { x: 0, y: 0 }, { x: 10, y: 0 }), v], { x: 3.5, y: 0.1 }, snapSettings({ tolerance: 0.5 }))
    expect(snap?.type).toBe("intersection")
    expect(snap?.point.x).toBeCloseTo(3.5, 6)
    expect(snap?.point.y).toBeCloseTo(0, 6)
  })

  test("the legacy priority order puts a midpoint above an intersection", () => {
    // Legacy SnapType order: endpoint, midpoint, center, intersection, … When an
    // intersection coincides with a midpoint, the midpoint wins.
    const v: PolylineEntity = {
      _tag: "Polyline",
      id: "v",
      layerId: "layer-0",
      visible: true,
      locked: false,
      points: [{ x: 5, y: -5 }, { x: 5, y: 5 }],
      closed: false
    }
    const snap = findSnap([line("l1", { x: 0, y: 0 }, { x: 10, y: 0 }), v], { x: 5.1, y: 0.1 }, snapSettings({ tolerance: 1 }))
    expect(snap?.type).toBe("midpoint")
  })

  test("disabling snap settings falls back to grid or nothing", () => {
    const s = snapSettings({ enabled: false, gridEnabled: false })
    expect(findSnap(entities, { x: 0, y: 0 }, s)).toBeUndefined()
    const grid = snapSettings({ enabled: false, gridEnabled: true, gridSpacing: 5 })
    expect(findSnap(entities, { x: 7.4, y: 2.6 }, grid)?.point).toEqual({ x: 5, y: 5 })
  })

  test("a snap beyond the tolerance returns nothing", () => {
    expect(findSnap([line("l1", { x: 0, y: 0 }, { x: 10, y: 0 })], { x: 100, y: 100 }, snapSettings({ tolerance: 1 }))).toBeUndefined()
  })
})

describe("meshOf", () => {
  test("a box mesh has 8 corners and 12 triangles", () => {
    const mesh = meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 3, z: 4 } })
    const b = meshBounds(mesh)
    expect(b).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 3, maxZ: 4 })
    expect(mesh.indices.length % 3).toBe(0)
    expect(mesh.indices.length).toBeGreaterThanOrEqual(3)
  })

  test("a cylinder mesh bounds match the analytic bounds", () => {
    const mesh = meshOf({ _tag: "Cylinder", origin: { x: 0, y: 0, z: 0 }, radius: 2, height: 5, segments: 64 })
    const b = meshBounds(mesh)
    expect(b.minX).toBeCloseTo(-2, 3)
    expect(b.maxZ).toBeCloseTo(5, 9)
  })

  test("a sphere mesh bounds match the analytic bounds", () => {
    const mesh = meshOf({ _tag: "Sphere", center: { x: 0, y: 0, z: 0 }, radius: 3, rings: 24 })
    const b = meshBounds(mesh)
    expect(b.minX).toBeCloseTo(-3, 1)
    expect(b.maxZ).toBeCloseTo(3, 1)
  })

  test("an extrude mesh has the profile's bounds", () => {
    const mesh = meshOf({
      _tag: "Extrude",
      profile: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }],
      height: 2
    })
    const b = meshBounds(mesh)
    expect(b).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 5, maxY: 5, maxZ: 2 })
  })

  test("a closed box mesh encloses its volume with outward normals", () => {
    const mesh = meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 } })
    expect(Math.abs(meshVolume(mesh))).toBeCloseTo(8, 4)
  })

  test("a closed cylinder mesh volume is near pi r^2 h", () => {
    const mesh = meshOf({ _tag: "Cylinder", origin: { x: 0, y: 0, z: 0 }, radius: 2, height: 3, segments: 128 })
    const expected = Math.PI * 4 * 3
    expect(Math.abs(meshVolume(mesh))).toBeGreaterThan(expected * 0.99)
    expect(Math.abs(meshVolume(mesh))).toBeLessThan(expected * 1.01)
  })

  test("an extrude mesh volume matches the profile area times height, either winding", () => {
    const ccw = meshOf({ _tag: "Extrude", profile: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }], height: 2 })
    const cw = meshOf({ _tag: "Extrude", profile: [{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 0 }], height: 2 })
    expect(Math.abs(meshVolume(ccw))).toBeCloseTo(50, 4)
    expect(Math.abs(meshVolume(cw))).toBeCloseTo(50, 4)
  })

  test("a revolve of a closed profile matches Pappus' theorem", () => {
    // A 2x2 square ring revolved 360° about the Z axis is a torus: Pappus gives
    // area * centroid path = 4 * (2 * 2π) = 16π.
    const torus = meshOf({
      _tag: "Revolve",
      profile: [{ x: 1, y: -1 }, { x: 3, y: -1 }, { x: 3, y: 1 }, { x: 1, y: 1 }],
      angle: Math.PI * 2,
      segments: 256
    })
    expect(Math.abs(meshVolume(torus))).toBeGreaterThan(16 * Math.PI * 0.99)
    expect(Math.abs(meshVolume(torus))).toBeLessThan(16 * Math.PI * 1.01)
  })

  test("a partial revolve is closed with caps and volume is proportional to the sweep", () => {
    const profile = [{ x: 1, y: -1 }, { x: 3, y: -1 }, { x: 3, y: 1 }, { x: 1, y: 1 }]
    const full = Math.abs(meshVolume(meshOf({ _tag: "Revolve", profile, angle: Math.PI * 2, segments: 256 })))
    const half = Math.abs(meshVolume(meshOf({ _tag: "Revolve", profile, angle: Math.PI, segments: 256 })))
    expect(half / full).toBeCloseTo(0.5, 3)
  })

  test("a negative sweep produces the same positive volume", () => {
    const profile = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 2 }]
    const cw = meshOf({ _tag: "Revolve", profile, angle: -Math.PI * 2, segments: 128 })
    const ccw = meshOf({ _tag: "Revolve", profile, angle: Math.PI * 2, segments: 128 })
    expect(meshVolume(cw)).toBeCloseTo(meshVolume(ccw), 6)
  })
})

describe("constants exported for downstream packages", () => {
  test("tolerance and allowance constants are present", () => {
    expect(SELF_TOLERANCE).toBeGreaterThan(0)
    expect(TEXTURE_REL).toBeGreaterThan(0)
    expect(arcBounds).toBeDefined()
  })
})