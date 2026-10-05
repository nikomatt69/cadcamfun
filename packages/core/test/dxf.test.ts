import { describe, expect, test } from "bun:test"
import { parseDxf, writeDxf } from "../src/cad/dxf.ts"
import { type Drawing, type Entity, baseEntity, emptyDrawing, isDrawing } from "../src/cad/entities.ts"
import { boundingBox } from "../src/cad/bounds.ts"
import { tessellate } from "../src/cad/tessellate.ts"
import { applyTransform, translate } from "../src/cad/transform.ts"

const pairs = (...items: Array<[number, string | number]>): string => items.map(([c, v]) => `${c}\n${v}`).join("\n") + "\n"

const sample = pairs(
  [0, "SECTION"], [2, "HEADER"], [9, "$INSUNITS"], [70, 4], [0, "ENDSEC"],
  [0, "SECTION"], [2, "TABLES"], [0, "TABLE"], [2, "LAYER"],
  [0, "LAYER"], [2, "CUT"], [70, 0], [62, 1],
  [0, "LAYER"], [2, "HIDDEN"], [70, 4], [62, -5],
  [0, "ENDTAB"], [0, "ENDSEC"],
  [0, "SECTION"], [2, "ENTITIES"],
  [0, "LINE"], [8, "CUT"], [10, 0], [20, 0], [30, 0], [11, 10], [21, 5], [31, 0],
  [0, "CIRCLE"], [8, "CUT"], [10, 5], [20, 5], [40, 2.5],
  [0, "ARC"], [8, "0"], [10, 0], [20, 0], [40, 10], [50, 350], [51, 10],
  [0, "LWPOLYLINE"], [8, "CUT"], [90, 3], [70, 1], [10, 0], [20, 0], [10, 10], [20, 0], [42, 0.5], [10, 10], [20, 10],
  [0, "ELLIPSE"], [8, "0"], [10, 1], [20, 2], [30, 0], [11, 0], [21, 4], [31, 0], [40, 0.5], [41, 0], [42, 6.283185307179586],
  [0, "TEXT"], [8, "HIDDEN"], [10, 3], [20, 4], [40, 2], [1, "Hi"], [50, 90],
  [0, "HATCH"], [8, "0"],
  [0, "HATCH"], [8, "0"],
  [0, "SPLINE"], [8, "0"],
  [0, "ENDSEC"], [0, "EOF"]
)

describe("parseDxf", () => {
  const { drawing, warnings } = parseDxf(sample)

  test("produces a valid Drawing", () => {
    expect(isDrawing(drawing)).toBe(true)
    expect(drawing.units).toBe("mm")
    expect(drawing.entities.map((e) => e._tag)).toEqual(["Line", "Circle", "Arc", "Polyline", "Ellipse", "Text"])
  })

  test("skipped entity types are reported once with a count, without section noise", () => {
    expect(warnings).toEqual(["Skipped 2 unsupported DXF entities: HATCH", "Skipped 1 unsupported DXF entity: SPLINE"])
  })

  test("layers come from the LAYER table and entities are assigned to them", () => {
    expect(drawing.layers.map((l) => l.name)).toEqual(["0", "CUT", "HIDDEN"])
    expect(drawing.layers[1]).toMatchObject({ color: "#ff0000", visible: true, locked: false })
    expect(drawing.layers[2]).toMatchObject({ visible: false, locked: true })
    expect(drawing.entities[0]!.layerId).toBe("layer:CUT")
    expect(drawing.entities[2]!.layerId).toBe("layer-0")
  })

  test("arcs keep DXF's counter-clockwise convention, degrees become radians", () => {
    const arc = drawing.entities[2]!
    expect(arc).toMatchObject({ _tag: "Arc", clockwise: false })
    if (arc._tag === "Arc") {
      expect(arc.startAngle).toBeCloseTo((350 * Math.PI) / 180, 12)
      expect(arc.endAngle).toBeCloseTo((10 * Math.PI) / 180, 12)
    }
  })

  test("a bulge belongs to the vertex before it, even when other vertices have none", () => {
    const poly = drawing.entities[3]!
    expect(poly).toMatchObject({ _tag: "Polyline", closed: true, bulge: [0, 0.5, 0] })
  })

  test("a full ellipse keeps its axes", () => {
    const e = drawing.entities[4]!
    expect(e).toMatchObject({ _tag: "Ellipse", center: { x: 1, y: 2 }, radiusX: 4, radiusY: 2 })
    if (e._tag === "Ellipse") expect(e.rotation).toBeCloseTo(Math.PI / 2, 12)
  })

  test("ids are deterministic per call", () => {
    expect(parseDxf(sample).drawing.entities.map((e) => e.id)).toEqual(drawing.entities.map((e) => e.id))
    expect(drawing.entities[0]!.id).toBe("dxf-1")
  })

  test("inch files are converted to millimetres and flagged", () => {
    const inch = parseDxf(pairs([0, "SECTION"], [2, "HEADER"], [9, "$INSUNITS"], [70, 1], [0, "ENDSEC"], [0, "SECTION"], [2, "ENTITIES"], [0, "CIRCLE"], [10, 1], [20, 1], [40, 0.5], [0, "ENDSEC"]))
    expect(inch.drawing.units).toBe("inch")
    expect(inch.drawing.entities[0]).toMatchObject({ _tag: "Circle", center: { x: 25.4, y: 25.4 }, radius: 12.7 })
  })

  test("garbage input yields a warning, not an exception", () => {
    expect(parseDxf("not a dxf").warnings.length).toBeGreaterThan(0)
    expect(parseDxf("").drawing.entities).toEqual([])
  })
})

describe("writeDxf", () => {
  const e = (extra: Record<string, unknown>): Entity => ({ ...baseEntity("x"), ...extra }) as Entity
  const drawing: Drawing = {
    ...emptyDrawing("d", "draw"),
    layers: [
      { id: "layer-0", name: "0", visible: true, locked: false, color: "#1e88e5" },
      { id: "l1", name: "CUT", visible: true, locked: false, color: "#ff0000" }
    ],
    entities: [
      e({ _tag: "Line", id: "a", layerId: "l1", start: { x: 0, y: 0 }, end: { x: 10, y: 5 } }),
      e({ _tag: "Circle", id: "b", center: { x: 5, y: 5 }, radius: 2.5 }),
      e({ _tag: "Arc", id: "c", center: { x: 0, y: 0 }, radius: 10, startAngle: 0.5, endAngle: 1.5, clockwise: false }),
      e({ _tag: "Arc", id: "d", center: { x: 0, y: 0 }, radius: 10, startAngle: 1.5, endAngle: 0.5, clockwise: true }),
      e({ _tag: "Polyline", id: "f", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: true, bulge: [0, 0.5, 0] }),
      e({ _tag: "Rectangle", id: "g", corner1: { x: 20, y: 20 }, corner2: { x: 30, y: 25 } }),
      e({ _tag: "Ellipse", id: "h", center: { x: 1, y: 2 }, radiusX: 2, radiusY: 4, rotation: 0.3 }),
      e({ _tag: "Text", id: "i", position: { x: 3, y: 4 }, text: "Hi", fontSize: 2, fontFamily: "x", rotation: 0, alignment: "left", baseline: "bottom" }),
      e({
        _tag: "Block", id: "j", name: "blk", basePoint: { x: 100, y: 100 },
        entities: [e({ _tag: "Line", id: "k", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } })]
      })
    ]
  }
  const text = writeDxf(drawing)
  const back = parseDxf(text)

  test("round-trips through parseDxf without warnings", () => {
    expect(back.warnings).toEqual([])
    expect(isDrawing(back.drawing)).toBe(true)
    expect(back.drawing.layers.map((l) => l.name)).toEqual(["0", "CUT"])
  })

  test("lines, circles and polylines keep their geometry exactly", () => {
    const tags = back.drawing.entities.map((x) => x._tag)
    expect(tags).toEqual(["Line", "Circle", "Arc", "Arc", "Polyline", "Polyline", "Ellipse", "Text", "Line"])
    expect(back.drawing.entities[0]).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 10, y: 5 }, layerId: "layer:CUT" })
    expect(back.drawing.entities[4]).toMatchObject({ closed: true, bulge: [0, 0.5, 0] })
  })

  test("a clockwise arc is the same curve as the counter-clockwise arc with swapped ends", () => {
    const [ccw, cw] = [back.drawing.entities[2]!, back.drawing.entities[3]!]
    const a = tessellate(ccw, 0.01)[0]!
    const b = tessellate(cw, 0.01)[0]!
    const original = tessellate(drawing.entities[3]!, 0.01)[0]!
    expect(a[0]!.x).toBeCloseTo(10 * Math.cos(0.5), 5)
    // The written clockwise arc covers the same points as the original clockwise arc.
    const span = (pts: ReadonlyArray<{ x: number; y: number }>): number[] => [pts[0]!.x, pts[0]!.y, pts.at(-1)!.x, pts.at(-1)!.y].map((v) => Math.round(v * 1e4) / 1e4)
    expect(span(b).slice(0, 2).sort()).toEqual(span(original).slice(2).sort())
    expect(span(b).slice(2).sort()).toEqual(span(original).slice(0, 2).sort())
  })

  test("rectangles become closed four-point polylines with the same bounds", () => {
    const rect = back.drawing.entities[5]!
    expect(rect).toMatchObject({ _tag: "Polyline", closed: true })
    if (rect._tag === "Polyline") expect(rect.points).toHaveLength(4)
    expect(boundingBox(rect)).toEqual(boundingBox(drawing.entities[5]!))
  })

  test("ellipses keep centre, radii and rotation (major axis written explicitly)", () => {
    const el = back.drawing.entities[6]!
    const original = drawing.entities[7 - 1]!
    const a = boundingBox(el)
    const b = boundingBox(original)
    for (const key of ["minX", "minY", "maxX", "maxY"] as const) expect(a[key]).toBeCloseTo(b[key], 4)
  })

  test("block children are flattened at their base point", () => {
    expect(back.drawing.entities.at(-1)).toMatchObject({ _tag: "Line", start: { x: 100, y: 100 }, end: { x: 101, y: 100 } })
  })

  test("inch drawings are written in inches and read back in millimetres", () => {
    const inch: Drawing = { ...emptyDrawing("i", "inch", "inch"), entities: [e({ _tag: "Circle", center: { x: 25.4, y: 50.8 }, radius: 12.7 })] }
    const written = writeDxf(inch)
    expect(written).toContain("$INSUNITS\n70\n1\n")
    expect(written).toContain("10\n1\n20\n2\n")
    const read = parseDxf(written)
    expect(read.drawing.units).toBe("inch")
    expect(read.drawing.entities[0]).toMatchObject({ center: { x: 25.4, y: 50.8 }, radius: 12.7 })
  })

  test("output is deterministic", () => {
    expect(writeDxf(drawing)).toBe(text)
  })
})

describe("transform regression: local transforms are folded exactly once", () => {
  test("a transformed entity no longer carries its local transform", () => {
    const line = {
      ...baseEntity("l"),
      _tag: "Line" as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      transform: { translation: { x: 5, y: 0 }, rotation: 0, scale: { x: 2, y: 2 } }
    }
    const once = translate(line, { x: 0, y: 1 })
    expect("transform" in once).toBe(false)
    expect(once).toMatchObject({ start: { x: 5, y: 1 }, end: { x: 7, y: 1 } })
    expect(translate(once, { x: 0, y: 0 })).toEqual(once)
  })

  test("translating a block moves it by the delta once (children are block-local)", () => {
    const block: Entity = {
      ...baseEntity("b"),
      _tag: "Block",
      name: "b",
      basePoint: { x: 10, y: 0 },
      entities: [{ ...baseEntity("l"), _tag: "Line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }]
    }
    const moved = translate(block, { x: 5, y: 5 })
    expect(boundingBox(moved)).toEqual({ minX: 15, minY: 5, maxX: 16, maxY: 5 })
    const rotated = applyTransform(block, { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 })
    const b = boundingBox(rotated)
    expect(b.minX).toBeCloseTo(0, 9)
    expect(b.minY).toBeCloseTo(10, 9)
    expect(b.maxY).toBeCloseTo(11, 9)
  })
})
