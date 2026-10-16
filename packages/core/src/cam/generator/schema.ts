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
import { MotionTrackSchema } from "../viewer/motion-track.ts"
import { NonNegative, Positive, withDefault } from "../params.ts"

const Num = Schema.Finite
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
const Percent = Schema.Finite.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100))

export const MachineTypeSchema = Schema.Literals(["mill", "lathe", "3dprinter"])
export const MillOperationSchema = Schema.Literals(["contour", "pocket", "drill", "engrave", "profile", "threading", "3d_surface", "probing", "multiaxis"])
export const LatheOperationSchema = Schema.Literals(["facing", "turning", "boring", "threading", "grooving", "parting", "knurling"])
export const PrinterOperationSchema = Schema.Literals(["standard", "vase", "support", "infill", "raft", "brim"])
export const OperationTypeSchema = Schema.Union([MillOperationSchema, LatheOperationSchema, PrinterOperationSchema])
export const MaterialTypeSchema = Schema.Literals(["aluminum", "steel", "wood", "plastic", "brass", "titanium", "composite", "other"])
export const ToolTypeSchema = Schema.Literals(["endmill", "ballnose", "drill", "vbit", "chamfer", "threadmill", "reamer", "probe", "toolsetter"])
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
  /**
   * `3d_surface` only. `roughing` clears the stock level by level around the part (and, with `finishingPass`, is followed by the
   * finishing strategy below); `parallel` and `waterline` finish the surface directly.
   */
  surfaceStrategy: withDefault(Schema.Literals(["roughing", "parallel", "waterline", "steep-shallow"]), "roughing"),
  /** `steep-shallow`: slope, degrees from the horizontal, above which the surface is finished by waterline instead of raster. */
  steepAngle: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 5, maximum: 85 })), 45),
  /**
   * `3d_surface` roughing (and rest roughing) only: how each region is cleared. `contour` is contour-parallel offsets at `stepover`;
   * `adaptive` keeps the radial depth of cut at `adaptiveEngagement` percent of the tool diameter wherever the tool goes.
   */
  surfaceClearing: withDefault(Schema.Literals(["contour", "adaptive"]), "contour"),
  /** `adaptive` clearing: the maximum radial depth of cut, percent of the tool diameter. */
  adaptiveEngagement: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 50 })), 12),
  /** Cusp height left between raster lines of a ball nose cutter, mm; 0 = use `stepover`. */
  scallop: withDefault(NonNegative, 0),
  /** Direction of the raster lines, degrees from +X. */
  rasterAngle: withDefault(Num, 0),
  /** Every raster line in the same direction (otherwise zig-zag). */
  rasterOneWay: withDefault(Schema.Boolean, false),
  useAI: withDefault(Schema.Boolean, false),
  aiDifficulty: withDefault(Schema.Literals(["simple", "moderate", "complex"]), "moderate"),
  aiOptimize: withDefault(Schema.Literals(["speed", "quality", "balance"]), "balance"),
  optimizePath: withDefault(Schema.Boolean, false),
  useArcFitting: withDefault(Schema.Boolean, false),
  useHighSpeedMode: withDefault(Schema.Boolean, false),
  useExactStop: withDefault(Schema.Boolean, false),
  useToolCompensation: withDefault(Schema.Boolean, false),
  useAdaptiveFeeds: withDefault(Schema.Boolean, false),
  /**
   * `3d_surface` roughing only: clear just what a previous, larger tool (`restToolDiameter`) left behind, instead of the whole part.
   * It is ignored by the finishing strategies and by the 2D operations, which have no previous tool to continue.
   */
  useRestMachining: withDefault(Schema.Boolean, false),
  /** Diameter of the tool that already roughed the part, mm (the rest region is what its disc could not reach). */
  restToolDiameter: withDefault(Positive, 10),
  /** `multiaxis` only (simultaneous 5-axis): the strategy, the tool axis rule and the lean (degrees). */
  fiveAxisStrategy: withDefault(Schema.Literals(["parallel", "contour"]), "parallel"),
  fiveAxisToolAxis: withDefault(Schema.Literals(["normal", "lead"]), "lead"),
  fiveAxisLead: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: -85, maximum: 85 })), 10),
  fiveAxisTilt: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: -85, maximum: 85 })), 0),
  /** `multiaxis`: lean further wherever the cutter would otherwise cut the part. */
  fiveAxisGouge: withDefault(Schema.Boolean, true),
  toolNumber: withDefault(PositiveInt, 1),
  /** Work offset the program runs in (the zero of the part on the machine table). G54 is the control's default and is not written. */
  workOffset: withDefault(Schema.Literals(["G54", "G55", "G56", "G57", "G58", "G59"]), "G54"),
  // touch probe / tool setter (`probing`)
  probeCycle: withDefault(Schema.Literals(["zSurface", "edgeX", "edgeY", "corner", "bore", "boss", "toolLength"]), "zSurface"),
  probeFeed: withDefault(Positive, 100),
  /** How far the probe may travel looking for contact, mm. */
  probeSearch: withDefault(Positive, 10),
  /** Stylus tip diameter, mm: contact happens half of it before the edge. */
  probeStylus: withDefault(Positive, 4),
  /** Probe move and result variables: linuxcnc / grbl style G38.2, or Fanuc style G31 skip. */
  probeDialect: withDefault(Schema.Literals(["linuxcnc", "fanuc"]), "linuxcnc"),
  /** Nominal feature size for `bore` and `boss`, mm (the probe starts at the centre and searches +/- this much). */
  probeFeatureSize: withDefault(Positive, 20),
  // thread milling (`threading` on a mill): the element is the hole (or boss), its diameter the nominal diameter of the thread
  threadPitch: withDefault(Positive, 1.5),
  threadType: withDefault(Schema.Literals(["internal", "external"]), "internal"),
  threadHand: withDefault(Schema.Literals(["right", "left"]), "right"),
  /** Radial passes from the first cut to full depth, and extra passes at full depth. */
  threadPasses: withDefault(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })), 2),
  threadSpringPasses: withDefault(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })), 0),
  /** Lathe Z zero: the finished front face (Z negative into the part) or the chuck face (Z positive towards the front). */
  latheZero: withDefault(Schema.Literals(["face", "chuck"]), "face"),
  /** 3D printer XY zero: the front-left corner of the plate, or its centre (delta and some bed-slinger profiles). */
  bedOrigin: withDefault(Schema.Literals(["corner", "center"]), "corner"),
  // 3D printer
  nozzleDiameter: withDefault(Positive, 0.4),
  filamentDiameter: withDefault(Positive, 1.75),
  layerHeight: withDefault(Positive, 0.2),
  extrusionWidth: withDefault(Positive, 0.4),
  printSpeed: withDefault(Positive, 60),
  printTemperature: withDefault(Positive, 200),
  /** Build plate, mm: the part is set down on it (Z0) and centred (see `centerOnBed`). */
  bedWidth: withDefault(Positive, 220),
  bedDepth: withDefault(Positive, 220),
  centerOnBed: withDefault(Schema.Boolean, true),
  bedTemperature: withDefault(NonNegative, 60),
  // lathe
  stockDiameter: withDefault(Positive, 50),
  stockLength: withDefault(Positive, 100),
  spindleDirection: withDefault(Schema.Literals(["cw", "ccw"]), "cw"),
  turningOperation: withDefault(Schema.Literals(["external", "internal", "face"]), "external"),
  applyToolCompensation: withDefault(Schema.Boolean, true),
  // workholding and machine layout (spec 31 §4.1): how the part is held, as the preview draws it and the checks use it
  /** Mill: a machine vise, strap clamps, a fixture plate (stock straight on the table) or nothing drawn. */
  workholding: withDefault(Schema.Literals(["vise", "clamps", "plate", "none"]), "vise"),
  /** Vise jaws parallel to X (clamping across Y, the usual VMC set-up) or to Y. */
  viseJawAxis: withDefault(Schema.Literals(["x", "y"]), "x"),
  /** Height of stock gripped by the jaws, mm; 0 = automatic (a third of the stock, 3..10 mm). */
  clampDepth: withDefault(NonNegative, 0),
  viseJawHeight: withDefault(Positive, 40),
  /** Parallels under the stock, mm (0 = the stock sits on the vise bed). */
  parallelsHeight: withDefault(NonNegative, 10),
  /** The workholding was set by the user or the assistant: it is drawn solid and checked; otherwise it is an assumption. */
  workholdingConfigured: withDefault(Schema.Boolean, false),
  /** Lathe turret behind the axis (slant bed, +X up in the preview) or in front of it (+X towards the operator). */
  latheTurret: withDefault(Schema.Literals(["rear", "front"]), "rear"),
  chuckType: withDefault(Schema.Literals(["3-jaw", "4-jaw", "collet"]), "3-jaw"),
  /** Stock length inside the chuck jaws, mm. */
  gripLength: withDefault(Positive, 20),
  tailstock: withDefault(Schema.Boolean, false),
  /** Bore of a tube stock, mm (0 = solid bar). */
  stockBore: withDefault(NonNegative, 0),
  /** 3D printer motion: what physically moves (the program is the same). */
  printerKinematics: withDefault(Schema.Literals(["cartesian", "corexy", "bed-slinger", "delta"]), "cartesian"),
  buildHeight: withDefault(Positive, 250),
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

// ---------------------------------------------------------------- machine for a program

/**
 * What the generator needs to know about the selected machine: its axes, its rotary table (for `multiaxis`), the zero of
 * the rotary table, and the controller whose post writes the program. Built from the machine library entry by the caller.
 */
const RotaryRangeSchema = Schema.Struct({ min: Schema.Finite, max: Schema.Finite })
export const MachineForProgramSchema = Schema.Struct({
  id: Schema.String,
  name: withDefault(Schema.String, ""),
  axes: withDefault(Schema.Literals([3, 4, 5]), 3),
  /** Post id the controller uses: `haas`, `fanuc`, `grbl`, `generic`. */
  controller: withDefault(Schema.String, "generic"),
  /** Rotary table of a 5-axis machine; absent on a 3-axis one. */
  fiveAxis: Schema.optionalKey(Schema.Struct({
    layout: Schema.Literals(["table-AC", "table-BC"]),
    tilt: RotaryRangeSchema,
    rotation: Schema.optionalKey(RotaryRangeSchema),
    pivot: Schema.optionalKey(Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })),
    /** `control`: the controller applies the tool centre point (Haas G234); `program`: the program is in machine coordinates. */
    tcp: withDefault(Schema.Literals(["control", "program"]), "control")
  }))
})
export type MachineForProgram = typeof MachineForProgramSchema.Type

// ---------------------------------------------------------------- generate

export const GenerateRequestSchema = Schema.Struct({
  settings: withDefault(ToolpathSettingsSchema, DEFAULT_SETTINGS),
  geometry: withDefault(GeometrySchema, DEFAULT_GEOMETRY as never),
  printer: withDefault(PrinterExtrasSchema, DEFAULT_PRINTER_EXTRAS),
  /**
   * The machine the program is for. Required by `multiaxis` (it needs the rotary axes and the controller's post); the
   * other operations ignore it, so existing requests are unchanged.
   */
  machine: Schema.optionalKey(MachineForProgramSchema),
  /** Injected into the header; omitted by default so the output is deterministic. */
  stamp: Schema.optionalKey(Schema.String),
  /** Build the evidence record (default true): replays the NC on the stock and, for a part, checks gouges. */
  evidence: Schema.optionalKey(Schema.Boolean)
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

/** Traceable source of cutting data: material table row, columns read, factors applied (`kernel/cutting-data.ts` `CuttingReference`). */
export const CuttingReferenceSchema = Schema.Struct({
  table: Schema.Literal("MATERIALS"),
  row: Schema.String,
  rowName: Schema.String,
  columns: Schema.Record(Schema.String, Schema.Finite),
  factors: Schema.Record(Schema.String, Schema.Finite),
  basis: Schema.String
})

export const ProgramCheckSchema = Schema.Struct({
  id: Schema.Literals(["generated", "cutting-data", "safe-height", "no-rapid-in-material", "tool-clearance", "within-stock", "no-gouge", "nc-interpretation"]),
  /** `not-run`: the check does not apply to this machine / operation. `unresolved`: it applies but the inputs to decide it are missing. */
  status: Schema.Literals(["passed", "failed", "unresolved", "not-run"]),
  detail: Schema.String,
  /** First NC line the finding refers to. */
  line: Schema.optionalKey(Schema.Int)
})
export type ProgramCheck = typeof ProgramCheckSchema.Type

/**
 * Evidence record of one generated program: what went in (digest of the request), the tool and process values, where the
 * cutting data comes from, the exact NC (SHA-256), every check run on that NC and the result. Same request, same record.
 */
export const ProgramRecordSchema = Schema.Struct({
  schema: Schema.Literal("cadcamfun/program-record@1"),
  inputs: Schema.Struct({
    /** SHA-256 of the canonical request (settings, geometry, printer, machine, stamp). */
    digest: Schema.String,
    machineType: Schema.String,
    operationType: Schema.String,
    material: Schema.String,
    elements: Schema.Array(Schema.String),
    stock: Schema.optionalKey(Schema.Struct({ width: Schema.Finite, height: Schema.Finite, depth: Schema.Finite, topZ: Schema.Finite }))
  }),
  tool: Schema.Struct({ type: Schema.String, diameter: Schema.Finite, flutes: Schema.Finite }),
  process: Schema.Struct({ rpm: Schema.Finite, feed: Schema.Finite, plunge: Schema.Finite, stepdown: Schema.Finite, stepover: Schema.Finite, coolant: Schema.Boolean }),
  cuttingData: Schema.Struct({
    /** `kernel`: the values match the kernel's table within 15 %. `manual`: they differ (the deviation is in `detail`). */
    status: Schema.Literals(["kernel", "manual", "not-applicable"]),
    detail: Schema.String,
    recommended: Schema.optionalKey(Schema.Struct({ rpm: Schema.Finite, feed: Schema.Finite, plunge: Schema.Finite, stepdown: Schema.Finite })),
    reference: Schema.optionalKey(CuttingReferenceSchema)
  }),
  program: Schema.Struct({ sha256: Schema.String, lines: Schema.Int, cutLength: Schema.Finite, estimatedSeconds: Schema.Finite }),
  checks: Schema.Array(ProgramCheckSchema),
  result: Schema.Literals(["passed", "warnings", "failed"])
})
export type ProgramRecord = typeof ProgramRecordSchema.Type

export const GenerateResponseSchema = Schema.Struct({
  gcode: Schema.String,
  /** Canned-cycle lines found in the program (legacy `detectedCycles`). */
  cycles: Schema.Array(Schema.Struct({ gcode: Schema.String })),
  warnings: Schema.Array(Schema.String),
  stats: GcodeStatsSchema,
  /** Machine-neutral IR rebuilt from the text, what the viewport draws. */
  program: ProgramSchema,
  /** Evidence about this exact NC (`evidence.ts`); absent only when the request turned it off. */
  evidence: Schema.optionalKey(ProgramRecordSchema)
})
export type GenerateResponse = typeof GenerateResponseSchema.Type

export const ParseRequestSchema = Schema.Struct({
  gcode: Schema.String,
  name: withDefault(Schema.String, "Program")
})

export const ParseResponseSchema = Schema.Struct({
  warnings: Schema.Array(Schema.String),
  stats: GcodeStatsSchema,
  program: ProgramSchema,
  /** Machine state per move (spec 31 §4.4); optional so older servers and clients stay compatible. */
  motion: Schema.optionalKey(MotionTrackSchema)
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
