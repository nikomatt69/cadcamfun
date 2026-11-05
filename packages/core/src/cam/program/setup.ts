/**
 * A setup (spec 14 §3): stock, machine type, post and an ordered list of operations. The order is the machining order.
 * Not the same thing as `cam/setup.ts` (`ManufacturingSetup`: the work frame and fixtures of one fixturing) or the kernel's
 * `ManufacturingJob`: this one groups the legacy generator's operations into programs with tool changes.
 */
import { Schema } from "effect"
import { StockSchema, type Tool } from "../tool.ts"
import { WorkOffsetSchema } from "../ir.ts"
import { WorkOffsetRefSchema, formatOffsetRef } from "../work-offset.ts"
import { OperationSchema, type Operation } from "./op.ts"
import { assignPockets } from "./tooltable.ts"

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

/**
 * One workpiece of the fixture (a vise with four parts, a tombstone face, a plate): the same operations run on each, each under its
 * own work offset register. The operator holds the real datum in the control's register; `placement` is only where that datum lies
 * from the first workpiece's, for the preview and the clearance check, and is never written to the NC.
 */
export const WorkpieceSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  workOffset: WorkOffsetSchema,
  /** An extended register (`G54.1 P3`, Haas `G154 P3`, Siemens `G505`) in place of `workOffset`: a fixture of more than six parts. */
  workOffsetRef: Schema.optionalKey(WorkOffsetRefSchema),
  placement: Schema.optionalKey(Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })),
  /** This part's own blank when it is not the setup's (different blanks on one fixture); its corner is relative to the part's datum. */
  stock: Schema.optionalKey(StockSchema)
})
export type Workpiece = typeof WorkpieceSchema.Type

/** `toolFirst`: an operation runs on every workpiece before the next operation (one tool change per tool); `partFirst`: a workpiece is finished before the next one starts (every tool change repeated). */
export const WorkpieceOrderSchema = Schema.Literals(["toolFirst", "partFirst"])
export type WorkpieceOrder = typeof WorkpieceOrderSchema.Type

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
  operations: Schema.Array(OperationSchema),
  /** The workpieces of the fixture: six on G54-G59, more on extended registers. Absent = one workpiece under `workOffset`. */
  workpieces: Schema.optionalKey(Schema.Array(WorkpieceSchema).check(Schema.isMaxLength(48))),
  /** Pockets the tool magazine holds; a tool table that needs more is an issue. */
  magazineSize: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  /** How operations and workpieces interleave; default `toolFirst`. */
  workpieceOrder: Schema.optionalKey(WorkpieceOrderSchema)
})
export type Setup = typeof SetupSchema.Type

export const decodeSetup = (input: unknown): Setup => Schema.decodeUnknownSync(SetupSchema)(input)

export interface SetupIssue {
  /** The operation the issue is about, when it is about one. */
  readonly operationId?: string
  readonly message: string
}

/** Problems with the fixture: the same id or the same register twice, an operation on a workpiece that is not there. */
export const workpieceIssues = (setup: Setup): ReadonlyArray<SetupIssue> => {
  const issues: SetupIssue[] = []
  const workpieces = setup.workpieces ?? []
  const wpIds = new Set<string>(), wpOffsets = new Map<string, string>()
  for (const wp of workpieces) {
    if (wpIds.has(wp.id)) issues.push({ message: `Workpiece id ${wp.id} is used twice` })
    wpIds.add(wp.id)
    const key = wp.workOffsetRef !== undefined ? formatOffsetRef(wp.workOffsetRef) : wp.workOffset
    const holder = wpOffsets.get(key)
    if (holder !== undefined) issues.push({ message: `${wp.name} and ${holder} share ${key}: two workpieces need two work offsets` })
    else wpOffsets.set(key, wp.name)
  }
  for (const op of setup.operations) {
    for (const id of op.workpieceIds ?? []) if (!wpIds.has(id)) issues.push({ operationId: op.id, message: `${op.name} names workpiece ${id}, which the setup does not have` })
    if (op.workpieceIds !== undefined && op.workpieceIds.length === 0) issues.push({ operationId: op.id, message: `${op.name} runs on no workpiece` })
  }
  // Parts that are placed must not occupy the same space: the blanks of two parts may touch, never overlap.
  const boxes = workpieces.flatMap((wp) => {
    const block = wp.stock ?? setup.stock
    return wp.placement === undefined || block === undefined ? [] : [{
      name: wp.name,
      min: { x: wp.placement.x + block.origin.x, y: wp.placement.y + block.origin.y, z: wp.placement.z + block.origin.z - block.z },
      max: { x: wp.placement.x + block.origin.x + block.x, y: wp.placement.y + block.origin.y + block.y, z: wp.placement.z + block.origin.z }
    }]
  })
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!, eps = 1e-6
    if (a.min.x < b.max.x - eps && b.min.x < a.max.x - eps && a.min.y < b.max.y - eps && b.min.y < a.max.y - eps && a.min.z < b.max.z - eps && b.min.z < a.max.z - eps) {
      issues.push({ message: `${a.name} and ${b.name} overlap: their blanks occupy the same space at the placements given` })
    }
  }
  return issues
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
  issues.push(...workpieceIssues(setup))
  const enabledIds = new Set(setup.operations.filter((o) => o.enabled).map((o) => o.id))
  const earlier = new Set<string>()
  for (const op of setup.operations) {
    for (const dep of op.dependsOn ?? []) {
      if (!ids.has(dep)) issues.push({ operationId: op.id, message: `${op.name} depends on ${dep}, which the setup does not have` })
      else if (!enabledIds.has(dep)) issues.push({ operationId: op.id, message: `${op.name} depends on ${dep}, which is disabled` })
      else if (!earlier.has(dep)) issues.push({ operationId: op.id, message: `${op.name} depends on ${dep}, which runs after it` })
    }
    if (op.enabled) earlier.add(op.id)
  }
  if (setup.magazineSize !== undefined) {
    const enabled = setup.operations.filter((o) => o.enabled)
    const pockets = assignPockets(enabled)
    for (const op of enabled) {
      const pocket = pockets.get(op.id)!
      if (pocket > setup.magazineSize) issues.push({ operationId: op.id, message: `${op.name} needs pocket T${pocket}, the magazine holds ${setup.magazineSize}` })
    }
  }
  return issues
}

export const enabledOperations = (setup: Setup): ReadonlyArray<Operation> => setup.operations.filter((op) => op.enabled)

/** The workpieces of a setup: the list it names, else one workpiece under the setup's own work offset. */
export const workpiecesOf = (setup: Setup): ReadonlyArray<Workpiece> =>
  setup.workpieces !== undefined && setup.workpieces.length > 0 ? setup.workpieces : [{ id: "wp-1", name: "Workpiece 1", workOffset: setup.workOffset }]

/** One run of an operation on a workpiece. */
export interface OperationRun {
  readonly operation: Operation
  readonly workpiece: Workpiece
  /** More than one workpiece in the setup: the run's toolpath carries the workpiece in its id and its offset. */
  readonly multi: boolean
}

/**
 * The runs of the operations in machining order. `toolFirst` keeps the operation order and repeats each operation over its workpieces
 * (a tool is loaded once for all the parts); `partFirst` finishes a workpiece before the next (the whole tool list repeated per part).
 */
export const runsOf = (setup: Setup, operations: ReadonlyArray<Operation> = enabledOperations(setup)): ReadonlyArray<OperationRun> => {
  const all = workpiecesOf(setup)
  const multi = all.length > 1
  const on = (op: Operation): ReadonlyArray<Workpiece> => (op.workpieceIds === undefined ? all : all.filter((wp) => op.workpieceIds!.includes(wp.id)))
  if (setup.workpieceOrder === "partFirst") return all.flatMap((workpiece) => operations.filter((op) => on(op).includes(workpiece)).map((operation) => ({ operation, workpiece, multi })))
  return operations.flatMap((operation) => on(operation).map((workpiece) => ({ operation, workpiece, multi })))
}
