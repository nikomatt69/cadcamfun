/**
 * Forward-compatible `Drawing` loading. `Drawing.schemaVersion` gates the
 * migration chain: an older format is upgraded in place before validation, so a
 * document written by the v5 app loads without a database migration.
 */
import { Data, Effect } from "effect"
import { CURRENT_SCHEMA_VERSION, decodeDrawing, type Drawing, type Entity } from "./entities.ts"

export class DrawingMigrationError extends Data.TaggedError("DrawingMigrationError")<{
  readonly reason: string
  readonly schemaVersion: number
}> {}

const isRecord = (u: unknown): u is Record<string, unknown> =>
  typeof u === "object" && u !== null && !Array.isArray(u)

/** v5 entity `type` values mapped onto the `_tag` discriminators. */
const LEGACY_TYPE_TO_TAG: Record<string, Entity["_tag"]> = {
  line: "Line",
  circle: "Circle",
  arc: "Arc",
  polyline: "Polyline",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  spline: "Spline",
  text: "Text",
  dimension: "Dimension",
  hatch: "Hatch",
  block: "Block"
}

const toPoint = (u: unknown): { x: number; y: number } | undefined => {
  if (Array.isArray(u) && typeof u[0] === "number" && typeof u[1] === "number") return { x: u[0], y: u[1] }
  if (isRecord(u) && typeof u.x === "number" && typeof u.y === "number") return { x: u.x, y: u.y }
  return undefined
}

const toPoints = (u: unknown): Array<{ x: number; y: number }> =>
  Array.isArray(u) ? u.map(toPoint).filter((p): p is { x: number; y: number } => p !== undefined) : []

const normalizeLegacyAngle = (a: number): number => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)

/**
 * Converts one stored entity to the current shape. Returns `undefined` when the
 * element carries too little information to infer safely; `droppedEntities`
 * reports the count so callers can surface it.
 */
const migrateEntity = (input: unknown): Entity | undefined => {
  if (!isRecord(input)) return undefined
  const tag: Entity["_tag"] | undefined = typeof input._tag === "string"
    ? (input._tag as Entity["_tag"])
    : typeof input.type === "string"
    ? LEGACY_TYPE_TO_TAG[input.type.toLowerCase()]
    : undefined
  if (tag === undefined) return undefined
  const base = {
    id: typeof input.id === "string" && input.id.length > 0 ? input.id : `legacy-${Math.random().toString(36).slice(2, 10)}`,
    layerId: typeof input.layerId === "string" ? input.layerId : "layer-0",
    visible: input.visible !== false,
    locked: input.locked === true
  }
  const radius = typeof input.radius === "number" && input.radius > 0 ? input.radius : undefined
  const center = toPoint(input.center)
  switch (tag) {
    case "Line": {
      const start = toPoint(input.start)
      const end = toPoint(input.end)
      return start !== undefined && end !== undefined ? { ...base, _tag: "Line", start, end } : undefined
    }
    case "Circle":
      return center !== undefined && radius !== undefined
        ? { ...base, _tag: "Circle", center, radius }
        : undefined
    case "Arc": {
      const startAngle = typeof input.startAngle === "number" ? input.startAngle : undefined
      const endAngle = typeof input.endAngle === "number" ? input.endAngle : undefined
      return center !== undefined && radius !== undefined && startAngle !== undefined && endAngle !== undefined
        ? {
          ...base,
          _tag: "Arc",
          center,
          radius,
          startAngle: normalizeLegacyAngle(startAngle),
          endAngle: normalizeLegacyAngle(endAngle),
          clockwise: input.clockwise === true
        }
        : undefined
    }
    case "Polyline": {
      const points = toPoints(input.points)
      return points.length >= 2 ? { ...base, _tag: "Polyline", points, closed: input.closed === true } : undefined
    }
    case "Rectangle": {
      const corner1 = toPoint(input.corner1) ?? toPoint(input.start)
      const corner2 = toPoint(input.corner2) ?? toPoint(input.end)
      return corner1 !== undefined && corner2 !== undefined ? { ...base, _tag: "Rectangle", corner1, corner2 } : undefined
    }
    case "Ellipse": {
      const radiusX = typeof input.radiusX === "number" && input.radiusX > 0 ? input.radiusX : undefined
      const radiusY = typeof input.radiusY === "number" && input.radiusY > 0 ? input.radiusY : undefined
      return center !== undefined && radiusX !== undefined && radiusY !== undefined
        ? {
          ...base,
          _tag: "Ellipse",
          center,
          radiusX,
          radiusY,
          rotation: typeof input.rotation === "number" ? input.rotation : 0
        }
        : undefined
    }
    case "Text": {
      const position = toPoint(input.position) ?? toPoint(input.start)
      return position !== undefined
        ? {
          ...base,
          _tag: "Text",
          position,
          text: typeof input.text === "string" ? input.text : "",
          fontSize: typeof input.fontSize === "number" && input.fontSize > 0 ? input.fontSize : 2.5,
          fontFamily: typeof input.fontFamily === "string" ? input.fontFamily : "Helvetica",
          rotation: typeof input.rotation === "number" ? input.rotation : 0,
          alignment: "left",
          baseline: "bottom"
        }
        : undefined
    }
    default:
      return undefined
  }
}

const migrateLayers = (input: Record<string, unknown>): Drawing["layers"] => {
  if (!Array.isArray(input.layers)) return []
  return input.layers.filter(isRecord).map((l, i) => ({
    id: typeof l.id === "string" && l.id.length > 0 ? l.id : `layer-${i}`,
    name: typeof l.name === "string" ? l.name : String(i),
    visible: l.visible !== false,
    locked: l.locked === true,
    color: typeof l.color === "string" ? l.color : "#1e88e5"
  }))
}

const DEFAULT_LAYERS: Drawing["layers"] = [
  { id: "layer-0", name: "0", visible: true, locked: false, color: "#1e88e5" }
]

/**
 * Normalises any stored drawing JSON into a valid `Drawing`. Unmigratable
 * entities are dropped so one bad element never makes the document unreadable.
 */
export const migrateDrawing = (input: unknown): Effect.Effect<Drawing, DrawingMigrationError> =>
  Effect.suspend(() => {
    if (!isRecord(input)) {
      return Effect.fail(new DrawingMigrationError({ reason: "drawing is not an object", schemaVersion: 0 }))
    }
    const schemaVersion = typeof input.schemaVersion === "number" ? input.schemaVersion : 0
    if (schemaVersion > CURRENT_SCHEMA_VERSION) {
      return Effect.fail(
        new DrawingMigrationError({
          reason: `drawing schema version ${schemaVersion} is newer than the supported version ${CURRENT_SCHEMA_VERSION}`,
          schemaVersion
        })
      )
    }
    const rawEntities = Array.isArray(input.entities) ? input.entities : []
    const entities = rawEntities.map(migrateEntity).filter((e): e is Entity => e !== undefined)
    const layers = migrateLayers(input)
    const version = input.version
    const candidate = {
      schemaVersion: CURRENT_SCHEMA_VERSION as typeof CURRENT_SCHEMA_VERSION,
      id: typeof input.id === "string" && input.id.length > 0 ? input.id : "drawing",
      name: typeof input.name === "string" ? input.name : "Untitled",
      units: input.units === "inch" ? ("inch" as const) : ("mm" as const),
      layers: layers.length > 0 ? layers : DEFAULT_LAYERS,
      entities,
      version: typeof version === "number" && Number.isInteger(version) && version >= 0 ? version : 0
    }
    return decodeDrawing(candidate).pipe(
      Effect.mapError((cause) =>
        new DrawingMigrationError({
          reason: `migrated drawing failed validation: ${String(cause)}`,
          schemaVersion
        })
      )
    )
  })

/** How many entities `migrateDrawing` had to drop, for the import report. */
export const droppedEntities = (input: unknown): number => {
  if (!isRecord(input) || !Array.isArray(input.entities)) return 0
  return input.entities.length - input.entities.map(migrateEntity).filter((e) => e !== undefined).length
}