import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CURRENT_SCHEMA_VERSION, ENTITY_TAGS, type Drawing, type Entity } from "./entities.ts"
import { DrawingMigrationError, droppedEntities, migrateDrawing } from "./migrate.ts"

const base = (id: string) => ({
  id,
  layerId: "detail",
  visible: false,
  locked: true,
  lineStyle: { color: { r: 12, g: 34, b: 56, a: 0.75 }, width: 0.3, type: "dashed" as const },
  transform: { translation: { x: 10, y: -20 }, rotation: 0.7, scale: { x: 2, y: 0.5 } },
  userData: { source: "import", machining: { tool: 3, passes: [1, 2] }, note: null }
})

const point = { x: 1, y: 2 }
const end = { x: 5, y: 6 }
const points = [point, end, { x: 9, y: 2 }]
const entities: ReadonlyArray<Entity> = [
  { ...base("line"), _tag: "Line", start: point, end },
  { ...base("circle"), _tag: "Circle", center: point, radius: 4 },
  { ...base("arc"), _tag: "Arc", center: point, radius: 4, startAngle: 0.123, endAngle: 5.678, clockwise: true },
  { ...base("polyline"), _tag: "Polyline", points, closed: true, bulge: [0.25, -0.5, 0] },
  { ...base("rectangle"), _tag: "Rectangle", corner1: point, corner2: end },
  { ...base("ellipse"), _tag: "Ellipse", center: point, radiusX: 5, radiusY: 2, rotation: -0.4 },
  { ...base("spline"), _tag: "Spline", controlPoints: points, degree: 2, closed: false, knots: [0, 0, 0, 1, 1, 1] },
  {
    ...base("text"), _tag: "Text", position: point, text: "Drawing note", fontSize: 3.5,
    fontFamily: "Helvetica", rotation: 0.6, alignment: "right", baseline: "top"
  },
  {
    ...base("dimension"), _tag: "Dimension", start: point, end, text: "<> mm",
    textPosition: { x: 3, y: 8 }, arrowSize: 0.8, textSize: 2.5, dimensionType: "aligned"
  },
  { ...base("hatch"), _tag: "Hatch", boundary: points, pattern: "cross", scale: 2, angle: 0.9, fillColor: "#123456" },
  {
    ...base("block"), _tag: "Block", name: "Assembly", basePoint: { x: 100, y: 200 },
    entities: [{
      ...base("nested-block"), _tag: "Block", name: "Detail", basePoint: { x: -3, y: 7 },
      entities: [
        { ...base("nested-line"), _tag: "Line", start: point, end },
        { ...base("nested-spline"), _tag: "Spline", controlPoints: points, degree: 2, closed: true }
      ]
    }]
  }
]

const drawing: Drawing = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: "drawing-preservation",
  name: "Full drawing",
  units: "inch",
  layers: [
    { id: "detail", name: "Detail", visible: false, locked: true, color: "#abcdef" },
    { id: "outline", name: "Outline", visible: true, locked: false, color: "#123456" }
  ],
  entities,
  version: 42
}

const migrationError = (input: unknown) => Effect.runPromise(
  migrateDrawing(input).pipe(Effect.match({
    onFailure: (error) => error,
    onSuccess: () => { throw new Error("Expected migration to fail") }
  }))
)

describe("current drawing migration regression", () => {
  test("preserves every drawing field, entity type, metadata, and recursive block", async () => {
    const stored: unknown = JSON.parse(JSON.stringify(drawing))
    const migrated = await Effect.runPromise(migrateDrawing(stored))
    expect(migrated.entities.map((entity) => entity._tag)).toEqual([...ENTITY_TAGS])
    expect(migrated).toEqual(drawing)
    expect(await Effect.runPromise(migrateDrawing(migrated))).toEqual(drawing)
    expect(stored).toEqual(drawing)
    expect(droppedEntities(stored)).toBe(0)
  })

  test("preserves valid empty layer and entity lists without inserting defaults", async () => {
    const empty = { ...drawing, layers: [], entities: [], name: "", version: 0 }
    expect(await Effect.runPromise(migrateDrawing(empty))).toEqual(empty)
  })

  const invalidDocuments: ReadonlyArray<readonly [string, unknown]> = [
    ["empty id", { ...drawing, id: "" }],
    ["missing name", { ...drawing, name: undefined }],
    ["invalid units", { ...drawing, units: "cm" }],
    ["invalid revision", { ...drawing, version: -1 }],
    ["non-array entities", { ...drawing, entities: null }],
    ["invalid layer", { ...drawing, layers: [{ ...drawing.layers[0], visible: "false" }] }],
    ["unknown entity", { ...drawing, entities: [{ ...base("unknown"), _tag: "Unknown" }] }],
    ["mixed legacy and current entities", { ...drawing, entities: [entities[0], { type: "line", start: [0, 0], end: [1, 1] }] }],
    ["invalid radius", { ...drawing, entities: [{ ...base("circle"), _tag: "Circle", center: point, radius: -1 }] }],
    ["unnormalized arc", { ...drawing, entities: [{ ...entities[2], startAngle: -0.1 }] }],
    ["invalid bulge length", { ...drawing, entities: [{ ...entities[3], bulge: [0] }] }],
    ["invalid metadata", { ...drawing, entities: [{ ...entities[0], lineStyle: { width: -1 } }] }],
    ["invalid recursive child", {
      ...drawing,
      entities: [{ ...base("outer"), _tag: "Block", name: "Outer", basePoint: point, entities: [
        { ...base("inner"), _tag: "Block", name: "Inner", basePoint: point, entities: [
          { ...base("bad-child"), _tag: "Line", start: point }
        ] }
      ] }]
    }]
  ]

  for (const [name, input] of invalidDocuments) {
    test(`rejects ${name} instead of repairing or dropping it`, async () => {
      const error = await migrationError(input)
      expect(error).toBeInstanceOf(DrawingMigrationError)
      expect(error._tag).toBe("DrawingMigrationError")
      expect(error.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
      expect(error.reason).toContain("drawing failed validation:")
    })
  }

  test("rejects future documents with their original version and tagged error", async () => {
    const schemaVersion = CURRENT_SCHEMA_VERSION + 1
    const error = await migrationError({ ...drawing, schemaVersion })
    expect(error).toBeInstanceOf(DrawingMigrationError)
    expect(error._tag).toBe("DrawingMigrationError")
    expect(error.schemaVersion).toBe(schemaVersion)
    expect(error.reason).toBe(
      `drawing schema version ${schemaVersion} is newer than the supported version ${CURRENT_SCHEMA_VERSION}`
    )
  })

  test("rejects non-object documents with tagged errors", async () => {
    for (const input of [null, 42, "drawing", []]) {
      const error = await migrationError(input)
      expect(error._tag).toBe("DrawingMigrationError")
      expect(error.schemaVersion).toBe(0)
      expect(error.reason).toBe("drawing is not an object")
    }
  })

  test("still reconstructs legacy documents and reports unmigratable entities", async () => {
    const legacy = {
      id: "legacy", name: "Legacy", entities: [
        { id: "line", type: "line", start: [1, 2], end: [5, 6], selected: true },
        { type: "unknown" }
      ]
    }
    const migrated = await Effect.runPromise(migrateDrawing(legacy))
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.entities).toEqual([
      { id: "line", layerId: "layer-0", visible: true, locked: false, _tag: "Line", start: point, end }
    ])
    expect(droppedEntities(legacy)).toBe(1)
    expect(await Effect.runPromise(migrateDrawing({ ...legacy, schemaVersion: CURRENT_SCHEMA_VERSION }))).toEqual(migrated)
  })

  test("migrates sparse early tagged exports despite a colliding schema version", async () => {
    const migrated = await Effect.runPromise(migrateDrawing({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "early-export",
      entities: [
        { _tag: "Line", id: "line", start: point, end },
        { _tag: "Nonsense", id: "bad" }
      ]
    }))
    expect(migrated.entities).toEqual([
      { id: "line", layerId: "layer-0", visible: true, locked: false, _tag: "Line", start: point, end }
    ])
  })
})
