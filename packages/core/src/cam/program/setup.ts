/**
 * A setup (spec 14 §3): stock, machine type, post and an ordered list of operations. The order is the machining order.
 * Not the same thing as `cam/setup.ts` (`ManufacturingSetup`: the work frame and fixtures of one fixturing) or the kernel's
 * `ManufacturingJob`: this one groups the legacy generator's operations into programs with tool changes.
 */
import { Schema } from "effect"
import { StockSchema, type Tool } from "../tool.ts"
import { OperationSchema, type Operation } from "./op.ts"

export const PostConfigSchema = Schema.Struct({
  postId: Schema.Literals(["generic", "fanuc", "grbl", "linuxcnc", "haas", "siemens", "heidenhain", "okuma", "mazak", "mitsubishi", "brother"]),
  decimals: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })),
  useCannedCycles: Schema.Boolean,
  arcMode: Schema.Literals(["ijk", "radius", "linearize"]),
  header: Schema.Boolean,
  tolerance: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  lineNumbers: Schema.optionalKey(Schema.Struct({ start: Schema.Int, step: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)) })),
  stamp: Schema.optionalKey(Schema.String),
  /** The first program is numbered `programNumberBase`, the next one more (Fanuc `O1000`). */
  programNumberBase: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
})
export type PostConfig = typeof PostConfigSchema.Type

export const DEFAULT_POST_CONFIG: PostConfig = { postId: "generic", decimals: 3, useCannedCycles: true, arcMode: "ijk", header: true, tolerance: 0.01, programNumberBase: 1000 }

export const SetupGroupingSchema = Schema.Literals(["single", "perTool", "perOperation"])
export type SetupGrouping = typeof SetupGroupingSchema.Type

export const SetupSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  machineType: Schema.Literals(["mill", "lathe", "3dprinter"]),
  workOffset: Schema.Literals(["G54", "G55", "G56", "G57", "G58", "G59"]),
  stock: Schema.optionalKey(StockSchema),
  post: PostConfigSchema,
  grouping: SetupGroupingSchema,
  /** Raise Z to the highest point reached before every tool change (a changer cannot pull the tool out of the material). */
  retractBeforeToolChange: Schema.Boolean,
  operations: Schema.Array(OperationSchema)
})
export type Setup = typeof SetupSchema.Type

export const decodeSetup = (input: unknown): Setup => Schema.decodeUnknownSync(SetupSchema)(input)

export interface SetupIssue {
  /** The operation the issue is about, when it is about one. */
  readonly operationId?: string
  readonly message: string
}

/** Problems with a setup. Reported, not thrown: the UI shows them next to the offending row. */
export const validateSetup = (setup: Setup): ReadonlyArray<SetupIssue> => {
  const issues: SetupIssue[] = []
  const ids = new Set<string>()
  for (const op of setup.operations) {
    if (ids.has(op.id)) issues.push({ operationId: op.id, message: `Operation id ${op.id} is used twice` })
    ids.add(op.id)
    if (op.elementIds.length === 0) issues.push({ operationId: op.id, message: `${op.name} has no elements to machine` })
    if (op.params.rpm > op.tool.maxRpm) issues.push({ operationId: op.id, message: `${op.name} asks for ${op.params.rpm} rpm, above the ${op.tool.maxRpm} rpm of ${op.tool.name}` })
    if (op.params.machineType !== "mill") issues.push({ operationId: op.id, message: `${op.name} is a ${op.params.machineType} operation: setups group milling operations, a ${op.params.machineType} operation is generated on its own` })
  }
  if (setup.machineType !== "mill") issues.push({ message: `A ${setup.machineType} setup cannot be grouped into programs: only milling operations change tools inside one program` })
  // Two different tools in one pocket is a wrong tool table: the carousel holds one tool per pocket.
  const byPocket = new Map<number, Tool>()
  for (const op of setup.operations) {
    if (op.pocket === undefined) continue
    const held = byPocket.get(op.pocket)
    if (held !== undefined && held.id !== op.tool.id) issues.push({ operationId: op.id, message: `Pocket T${op.pocket} holds ${held.name} and ${op.tool.name}` })
    else byPocket.set(op.pocket, op.tool)
  }
  if (!setup.operations.some((op) => op.enabled)) issues.push({ message: "The setup has no enabled operation" })
  return issues
}

export const enabledOperations = (setup: Setup): ReadonlyArray<Operation> => setup.operations.filter((op) => op.enabled)
