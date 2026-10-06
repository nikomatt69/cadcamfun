/**
 * Schemas of the toolpath generator (the legacy `ToolpathGenerator` panel's state).
 *
 * One definition serves three consumers: the pure generator (types), the sidecar
 * `toolpathGenerator` HTTP group (request / response bodies) and the Solid panel
 * (typed client, so a field added here shows up in the UI types).
 *
 * Defaults apply only to a *missing* field (`withDefault`, `??` semantics): an explicit `0`
 * — a zero allowance, a zero origin offset — is a value, never replaced.
 */
import { Schema } from "effect"
import { ProgramSchema } from "../ir.ts"
import { NonNegative, Positive, withDefault } from "../params.ts"

const Num = Schema.Finite
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
const Percent = Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100))

export const MachineTypeSchema = Schema.Literals(["mill", "lathe", "3dprinter"])
export const MillOperationSchema = Schema.Literals(["contour", "pocket", "drill", "engrave", "profile", "threading", "3d_surface"])
export const LatheOperationSchema = Schema.Literals(["facing", "turning", "boring", "threading", "grooving", "parting", "knurling"])
export const PrinterOperationSchema = Schema.Literals(["standard", "vase", "support", "infill", "raft", "brim"])
export const OperationTypeSchema = Schema.Union([MillOperationSchema, LatheOperationSchema, PrinterOperationSchema])
export const MaterialTypeSchema = Schema.Literals(["aluminum", "steel", "wood", "plastic", "brass", "titanium", "composite", "other"])
export const ToolTypeSchema = Schema.Literals(["endmill", "ballnose", "drill", "vbit", "chamfer", "threadmill", "reamer"])
export const LatheToolTypeSchema = Schema.Literals(["turning", "facing", "threading", "grooving", "boring", "parting"])
export const PrinterNozzleSchema = Schema.Literals(["brass", "hardened", "ruby", "standard"])
export const AllToolTypeSchema = Schema.Union([ToolTypeSchema, LatheToolTypeSchema, PrinterNozzleSchema])
export const OriginTypeSchema = Schema.Literals(["workpiece-center", "workpiece-corner", "workpiece-corner2", "machine-zero", "custom"])
export const GeometryTypeSchema = Schema.Literals([
  "rectangle", "circle", "polygon", "custom", "selected",
  "cube", "sphere", "cylinder", "cone", "extrude", "line",
  "pyramid", "hemisphere", "ellipsoid", "capsule", "triangle", "ellipse", "prism"
])

export type MachineType = typeof MachineTypeSchema.Type
export type MillOperationType = typeof MillOperationSchema.Type
export type LatheOperationType = typeof LatheOperationSchema.Type
export type PrinterOperationType = typeof PrinterOperationSchema.Type
export type OperationType = typeof OperationTypeSchema.Type
export type MaterialType = typeof MaterialTypeSchema.Type
export type ToolType = typeof ToolTypeSchema.Type
export type AllToolType = typeof AllToolTypeSchema.Type
export type OriginType = typeof OriginTypeSchema.Type
export type GeometryType = typeof GeometryTypeSchema.Type

// ---------------------------------------------------------------- settings

export const ToolpathSettingsSchema = Schema.Struct({
  machineType: withDefault(MachineTypeSchema, "mill"),
  operationType: withDefault(OperationTypeSchema, "contour"),
  material: withDefault(MaterialTypeSchema, "aluminum"),
  toolType: withDefault(AllToolTypeSchema, "endmill"),
  toolDiameter: withDefault(Positive, 6),
  flutes: withDefault(PositiveInt, 2),
  /** Positive total depth below the stock top. */
  depth: withDefault(Positive, 5),
  stepdown: withDefault(Positive, 1),
  /** Percent of the tool diameter. */
  stepover: withDefault(Percent, 40),
  feedrate: withDefault(Positive, 800),
  plungerate: withDefault(Positive, 300),
  rpm: withDefault(Positive, 10000),
  tolerance: withDefault(NonNegative, 0.01),
  offset: withDefault(Schema.Literals(["inside", "outside", "center"]), "outside"),
  direction: withDefault(Schema.Literals(["climb", "conventional"]), "climb"),
  coolant: withDefault(Schema.Boolean, true),
  finishingPass: withDefault(Schema.Boolean, false),
  finishingAllowance: withDefault(NonNegative, 0.2),
  finishingStrategy: withDefault(Schema.Literals(["contour", "parallel", "spiral", "radial"]), "contour"),
  useAI: withDefault(Schema.Boolean, false),
  aiDifficulty: withDefault(Schema.Literals(["simple", "moderate", "complex"]), "moderate"),
  aiOptimize: withDefault(Schema.Literals(["speed", "quality", "balance"]), "balance"),
  optimizePath: withDefault(Schema.Boolean, false),
  useArcFitting: withDefault(Schema.Boolean, false),
  useHighSpeedMode: withDefault(Schema.Boolean, false),
  useExactStop: withDefault(Schema.Boolean, false),
  useToolCompensation: withDefault(Schema.Boolean, false),
  useAdaptiveFeeds: withDefault(Schema.Boolean, false),
  useRestMachining: withDefault(Schema.Boolean, false),
  toolNumber: withDefault(PositiveInt, 1),
  // 3D printer
  nozzleDiameter: withDefault(Positive, 0.4),
  filamentDiameter: withDefault(Positive, 1.75),
  layerHeight: withDefault(Positive, 0.2),
  extrusionWidth: withDefault(Positive, 0.4),
  printSpeed: withDefault(Positive, 60),
  printTemperature: withDefault(Positive, 200),
  bedTemperature: withDefault(NonNegative, 60),
  // lathe
  stockDiameter: withDefault(Positive, 50),
  stockLength: withDefault(Positive, 100),
  spindleDirection: withDefault(Schema.Literals(["cw", "ccw"]), "cw"),
  turningOperation: withDefault(Schema.Literals(["external", "internal", "face"]), "external"),
  applyToolCompensation: withDefault(Schema.Boolean, true),
  // origin
  originType: withDefault(OriginTypeSchema, "workpiece-center"),
  originX: withDefault(Num, 0),
  originY: withDefault(Num, 0),
  originZ: withDefault(Num, 0)
})
export type ToolpathSettings = typeof ToolpathSettingsSchema.Type

/** Decodes any object into full settings (missing fields take their defaults); throws on an invalid value. */
export const decodeSettings = (input: unknown): ToolpathSettings => Schema.decodeUnknownSync(ToolpathSettingsSchema)(input)

/** Every field at its legacy default (decoding an empty record applies them all). */
export const DEFAULT_SETTINGS: ToolpathSettings = Schema.decodeUnknownSync(ToolpathSettingsSchema)({})

// ---------------------------------------------------------------- stock and geometry

/**
 * The raw piece the toolpath starts from (legacy `cadStore.workpiece` / CAM `derivedWorkpieceDimensions`).
 * `width` is X, `height` is Y, `depth` is the Z thickness; `topZ` is the machining reference (stock top).
 */
export const StockSchema = Schema.Struct({
  width: Positive,
  height: Positive,
  depth: Positive,
  radius: withDefault(NonNegative, 0),
  /** Stock centre in CAD coordinates (a stock derived from an element is centred on it). */
  x: withDefault(Num, 0),
  y: withDefault(Num, 0),
  topZ: withDefault(Num, 0),
  /** Extra raw material around the part, mm. */
  allowance: withDefault(NonNegative, 1),
  material: Schema.optionalKey(Schema.String),
  /** CAD element the stock was derived from (legacy `workpiece.elementId`). */
  elementId: Schema.optionalKey(Schema.String)
})
export type Stock = typeof StockSchema.Type

/** A CAD element as the editor stores it: a `type` plus free-form numeric fields. */
export const CadElementSchema = Schema.Record(Schema.String, Schema.Unknown)
export type CadElement = Record<string, any>

export const GeometrySchema = Schema.Struct({
  geometryType: withDefault(GeometryTypeSchema, "rectangle"),
  rectangleWidth: withDefault(Positive, 100),
  rectangleHeight: withDefault(Positive, 50),
  circleRadius: withDefault(Positive, 25),
  polygonSides: withDefault(Schema.Int.check(Schema.isGreaterThanOrEqualTo(3)), 6),
  polygonRadius: withDefault(Positive, 30),
  customPath: withDefault(Schema.String, ""),
  /** Selected CAD elements, in selection order. The first one is the "selected element" of the legacy panel. */
  selectedElements: withDefault(Schema.Array(CadElementSchema), []),
  stock: Schema.optionalKey(StockSchema)
})
export type GeometryInput = Omit<typeof GeometrySchema.Type, "selectedElements"> & {
  readonly selectedElements: ReadonlyArray<CadElement>
}
export const DEFAULT_GEOMETRY: GeometryInput = Schema.decodeUnknownSync(GeometrySchema)({}) as GeometryInput

export const PrinterExtrasSchema = Schema.Struct({
  infillDensity: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 })), 20),
  infillPattern: withDefault(Schema.Literals(["grid", "lines", "triangles", "honeycomb"]), "grid"),
  supportType: withDefault(Schema.Literals(["none", "minimal", "full"]), "minimal"),
  shellCount: withDefault(PositiveInt, 2),
  printResolution: withDefault(Schema.Literals(["standard", "high", "low"]), "standard"),
  printOrientation: withDefault(Schema.Literals(["original", "auto-optimal"]), "original")
})
export type PrinterExtras = typeof PrinterExtrasSchema.Type
export const DEFAULT_PRINTER_EXTRAS: PrinterExtras = Schema.decodeUnknownSync(PrinterExtrasSchema)({})

// ---------------------------------------------------------------- generate

export const GenerateRequestSchema = Schema.Struct({
  settings: withDefault(ToolpathSettingsSchema, DEFAULT_SETTINGS),
  geometry: withDefault(GeometrySchema, DEFAULT_GEOMETRY as never),
  printer: withDefault(PrinterExtrasSchema, DEFAULT_PRINTER_EXTRAS),
  /** Injected into the header; omitted by default so the output is deterministic. */
  stamp: Schema.optionalKey(Schema.String)
})
export type GenerateRequest = typeof GenerateRequestSchema.Type

export const GcodeStatsSchema = Schema.Struct({
  lines: Schema.Int,
  /** Length of feed moves, mm. */
  cutLength: Schema.Finite,
  rapidLength: Schema.Finite,
  minZ: Schema.Finite,
  maxZ: Schema.Finite,
  /** Seconds, rapids at `rapidRate`. */
  estimatedSeconds: Schema.Finite,
  bounds: Schema.Struct({
    min: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite }),
    max: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })
  })
})
export type GcodeStats = typeof GcodeStatsSchema.Type

export const GenerateResponseSchema = Schema.Struct({
  gcode: Schema.String,
  /** Canned-cycle lines found in the program (legacy `detectedCycles`). */
  cycles: Schema.Array(Schema.Struct({ gcode: Schema.String })),
  warnings: Schema.Array(Schema.String),
  stats: GcodeStatsSchema,
  /** Machine-neutral IR rebuilt from the text, what the viewport draws. */
  program: ProgramSchema
})
export type GenerateResponse = typeof GenerateResponseSchema.Type

export const ParseRequestSchema = Schema.Struct({
  gcode: Schema.String,
  name: withDefault(Schema.String, "Program")
})

export const ParseResponseSchema = Schema.Struct({
  warnings: Schema.Array(Schema.String),
  stats: GcodeStatsSchema,
  program: ProgramSchema
})

// ---------------------------------------------------------------- suggestions

export const SuggestRequestSchema = Schema.Struct({
  settings: withDefault(ToolpathSettingsSchema, DEFAULT_SETTINGS),
  geometry: withDefault(GeometrySchema, DEFAULT_GEOMETRY as never)
})

export const SuggestResponseSchema = Schema.Struct({
  /** Parameters the selected element suggests (legacy `suggestMachiningParameters`), when something is selected. */
  parameters: Schema.optionalKey(Schema.Struct({
    depth: Schema.Finite,
    stepdown: Schema.Finite,
    operationType: OperationTypeSchema
  })),
  suggestions: Schema.Array(Schema.String),
  feedback: Schema.String,
  statistics: Schema.Struct({
    cuttingSpeed: Schema.Finite,
    chipLoad: Schema.Finite,
    materialRemovalRate: Schema.Finite,
    effectiveStepover: Schema.Finite
  }),
  operation: Schema.Struct({ title: Schema.String, description: Schema.String }),
  warnings: Schema.Array(Schema.String)
})
