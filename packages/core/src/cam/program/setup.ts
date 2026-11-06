/**
 * A setup (spec 14 §3): stock, machine type, post and an ordered list of operations. The order is the machining order.
 * Not the same thing as `cam/setup.ts` (`ManufacturingSetup`: the work frame and fixtures of one fixturing) or the kernel's
 * `ManufacturingJob`: this one groups the legacy generator's operations into programs with tool changes.
 */
import { Schema } from "effect"
import { StockSchema, ToolSchema, type Tool } from "../tool.ts"
import { WorkOffsetSchema } from "../ir.ts"
import { WorkOffsetRefSchema, formatOffsetRef } from "../work-offset.ts"
import { ToolpathSettingsSchema } from "../generator/schema.ts"
import { OperationSchema, OperationTemplateSchema, TemplateUseSchema, type Operation, type OperationTemplate, type TemplateUse } from "./op.ts"
import { boxInPartFrame } from "../indexing.ts"
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
  programNumberBase: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  /** Siemens `CYCLE800` swivel data of the machine (the builder's record name and retraction): a part indexed as a tilted plane on a Siemens post needs it. */
  swivel: Schema.optionalKey(Schema.Struct({
    dataRecord: Schema.String.check(Schema.isMinLength(1)),
    retraction: Schema.optionalKey(Schema.Literals([0, 1, 2, 4])),
    retractDistance: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
    status: Schema.optionalKey(Schema.Int)
  }))
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
  /** The rotary index of this part (a tombstone face, an indexed vise), degrees: the table turns there, tool retracted, before its toolpaths. Each face keeps its own register. */
  index: Schema.optionalKey(Schema.Struct({ a: Schema.optionalKey(Schema.Finite), b: Schema.optionalKey(Schema.Finite), c: Schema.optionalKey(Schema.Finite) })),
  /**
   * How the index is written: `table` (default) turns the rotary table to the angles (`Orient`) and the toolpaths stay in the part's frame;
   * `plane` keeps the table where it is and writes the same orientation as the control's own tilted work plane (Fanuc/Haas/Okuma-style `G68.2` + `G53.1`,
   * Siemens `CYCLE800`, Heidenhain `PLANE SPATIAL`): the part's toolpaths are in the plane's coordinates and the control does the swivel. A post whose
   * control has no such word refuses the setup with the reason.
   */
  indexAs: Schema.optionalKey(Schema.Literals(["table", "plane"])),
  /** This part's own blank when it is not the setup's (different blanks on one fixture); its corner is relative to the part's datum. */
  stock: Schema.optionalKey(StockSchema)
})
export type Workpiece = typeof WorkpieceSchema.Type

/** `toolFirst`: an operation runs on every workpiece before the next operation (one tool change per tool); `partFirst`: a workpiece is finished before the next one starts (every tool change repeated). */
export const WorkpieceOrderSchema = Schema.Literals(["toolFirst", "partFirst"])
export type WorkpieceOrder = typeof WorkpieceOrderSchema.Type

const Vec = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })

/**
 * A clamp, a vise jaw, a parallel or the plate under the parts, as a box in the frame of the first workpiece's datum (the frame of
 * `placement`). Blanks may not overlap it, and a generated toolpath that reaches it is reported.
 */
export const FixtureBoxSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  min: Vec,
  max: Vec
})
export type FixtureBox = typeof FixtureBoxSchema.Type

/** A tool and the tool that takes over from it once its life is spent (a sister tool: the same cutter, a fresh edge, its own pocket). */
export const SisterToolSchema = Schema.Struct({ toolId: Schema.String.check(Schema.isMinLength(1)), tool: ToolSchema })
export type SisterTool = typeof SisterToolSchema.Type

const Vec2 = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
const Unit2 = Schema.Struct({ x: Schema.Finite.check(Schema.isBetween({ minimum: -1, maximum: 1 })), y: Schema.Finite.check(Schema.isBetween({ minimum: -1, maximum: 1 })) })
const Depth = { depth: Schema.Finite.check(Schema.isGreaterThan(0)), top: Schema.optionalKey(Schema.Finite) } as const
const Sense = Schema.Literals([1, -1])

/**
 * What the probe measures on every workpiece to find its datum, in the part's own frame (each part's zero is where its cycle expects it;
 * the register of each part receives the deviation): a Z surface, an edge, an outside or inside corner (two touches per edge also measure
 * the part's rotation), a bore, a boss, a web or a slot at an `angle` (radians from +X), a rectangle, and the angle of a straight face
 * (`edge-angle`: two touches `pitch` apart). A part on an indexed face (`Workpiece.index`) is probed after its table turn.
 */
export const PartProbeCycleSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("z-surface"), at: Vec2, expectedZ: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("edge"), at: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite }), normal: Unit2 }),
  Schema.Struct({ kind: Schema.Literal("corner"), corner: Vec2, inside: Schema.Boolean, xSense: Sense, ySense: Sense, ...Depth, inset: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))), touchesPerEdge: Schema.optionalKey(Schema.Literals([1, 2])) }),
  Schema.Struct({ kind: Schema.Literals(["bore", "boss"]), centre: Vec2, diameter: Schema.Finite.check(Schema.isGreaterThan(0)), ...Depth }),
  Schema.Struct({ kind: Schema.Literals(["web", "pocket"]), centre: Vec2, width: Schema.Finite.check(Schema.isGreaterThan(0)), angle: Schema.Finite, ...Depth }),
  Schema.Struct({ kind: Schema.Literal("rectangle"), inside: Schema.Boolean, centre: Vec2, size: Schema.Struct({ x: Schema.Finite.check(Schema.isGreaterThan(0)), y: Schema.Finite.check(Schema.isGreaterThan(0)) }), ...Depth }),
  Schema.Struct({ kind: Schema.Literal("edge-angle"), start: Vec2, along: Unit2, pitch: Schema.Finite.check(Schema.isGreaterThan(0)), normal: Unit2, ...Depth })
])
export type PartProbeCycle = typeof PartProbeCycleSchema.Type

/** How far a part is taken to sit from where the setup believes it, for the replay of the probe program: mm in the part's frame, rotation in degrees about its datum. */
export const PartDisplacementSchema = Schema.Struct({
  /** The workpiece it applies to; absent = every workpiece. */
  workpieceId: Schema.optionalKey(Schema.String),
  x: Schema.optionalKey(Schema.Finite), y: Schema.optionalKey(Schema.Finite), z: Schema.optionalKey(Schema.Finite),
  rotation: Schema.optionalKey(Schema.Finite)
})
export type PartDisplacement = typeof PartDisplacementSchema.Type

/** The probe run on each workpiece before it is cut (`probePart` on generate): one program of the probe tool that reads every part's datum into that part's register. */
export const PartProbeSchema = Schema.Struct({
  cycles: Schema.Array(PartProbeCycleSchema).check(Schema.isMinLength(1), Schema.isMaxLength(4)),
  /** The probe's tool number in the magazine; absent = the pocket after the last one the operations use. */
  toolNumber: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9999 }))),
  stylusDiameter: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  /** Touch feed, mm/min. */
  feed: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  /** How far past the expected surface the probe looks before it alarms, mm. */
  search: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  clearance: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  /** Travel height above the datum; absent = 15 above the stock's top (25 without a stock). */
  safeZ: Schema.optionalKey(Schema.Finite),
  /**
   * Where the probe of each part runs: `first-program` (default) is one separate program of the probe tool that runs before any cut;
   * `inline` puts each part's cycles at the start of that part's own toolpaths, in the program that first cuts it (the probe takes a pocket of
   * its own: tool change to the probe and back).
   */
  placement: Schema.optionalKey(Schema.Literals(["first-program", "inline"])),
  /** A correction larger than this is a wrong datum or a clamped part, never written: the control alarms. Default 5 mm. */
  limit: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  /**
   * Where a measured rotation (a corner with two touches per edge, an `edge-angle`) goes: the register's own rotation (`offset-r`), the
   * control's coordinate rotation turned about the measured point (`g68`, which stays on for what follows), or the rotary table (`table-c`).
   * Absent = a rotation is measured but not written.
   */
  rotation: Schema.optionalKey(Schema.Literals(["g68", "offset-r", "table-c"])),
  /**
   * The replay of the probe program against blanks displaced from where the setup believes them (`plan.probe.parts[].replay`): the
   * displacements to try (default 0.8, -0.6, 0.3 mm on every part, and 0.5 degrees when a rotation is written) and how close the corrected
   * register must put the blank's corners to where they really are (default 0.05 mm).
   */
  replay: Schema.optionalKey(Schema.Struct({ displacements: Schema.optionalKey(Schema.Array(PartDisplacementSchema).check(Schema.isMaxLength(48))), tolerance: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))) }))
})
export type PartProbe = typeof PartProbeSchema.Type

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
  workpieceOrder: Schema.optionalKey(WorkpieceOrderSchema),
  /** Clamps, jaws and plates of the fixture, in the frame of the first workpiece's datum. */
  fixtures: Schema.optionalKey(Schema.Array(FixtureBoxSchema).check(Schema.isMaxLength(64))),
  /** The machine's travel, in the frame of the first workpiece's datum: the placed blanks must lie inside it. */
  envelope: Schema.optionalKey(Schema.Struct({ min: Vec, max: Vec })),
  /** Sister tools: when a tool's `lifeMinutes` would be spent by the next run, the runs after it use its sister, which has its own pocket. */
  sisters: Schema.optionalKey(Schema.Array(SisterToolSchema).check(Schema.isMaxLength(64))),
  /** Operation templates (a rough, semi-finish and finish cycle) the setup applies through `uses`; expanded into `operations` before planning and generating. */
  templates: Schema.optionalKey(Schema.Array(OperationTemplateSchema).check(Schema.isMaxLength(64))),
  uses: Schema.optionalKey(Schema.Array(TemplateUseSchema).check(Schema.isMaxLength(256))),
  /** The datum probe of every workpiece, generated as its own program on request. */
  partProbe: Schema.optionalKey(PartProbeSchema)
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
  for (const wp of workpieces) {
    if (wp.indexAs === "plane" && wp.index === undefined) issues.push({ message: `${wp.name} is indexed as a tilted plane but has no index angles` })
    if (wp.indexAs === "plane" && (wp.index?.a ?? 0) !== 0 && (wp.index?.b ?? 0) !== 0) issues.push({ message: `${wp.name}: a tilted plane takes the tilt of one axis (A or B) and C, not A and B together` })
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
      datum: wp.placement,
      index: wp.index,
      min: { x: wp.placement.x + block.origin.x, y: wp.placement.y + block.origin.y, z: wp.placement.z + block.origin.z - block.z },
      max: { x: wp.placement.x + block.origin.x + block.x, y: wp.placement.y + block.origin.y + block.y, z: wp.placement.z + block.origin.z }
    }]
  })
  const fixtures = setup.fixtures ?? []
  const touches = (a: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }, b: typeof a): boolean => {
    const eps = 1e-6
    return a.min.x < b.max.x - eps && b.min.x < a.max.x - eps && a.min.y < b.max.y - eps && b.min.y < a.max.y - eps && a.min.z < b.max.z - eps && b.min.z < a.max.z - eps
  }
  for (const box of boxes) {
    // The blank sits in this part's frame. A clamp stored on the first datum is carried by the table turn before the overlap is judged.
    for (const fx of fixtures) if (touches(box, boxInPartFrame(fx, box.datum, box.index))) issues.push({ message: `${box.name}'s blank overlaps ${fx.name}: the part would stand inside the workholding` })
    const env = setup.envelope
    if (env !== undefined && (box.min.x < env.min.x || box.min.y < env.min.y || box.min.z < env.min.z || box.max.x > env.max.x || box.max.y > env.max.y || box.max.z > env.max.z)) {
      issues.push({ message: `${box.name}'s blank lies outside the machine travel` })
    }
  }
  for (const fx of fixtures) if (!(fx.max.x > fx.min.x && fx.max.y > fx.min.y && fx.max.z > fx.min.z)) issues.push({ message: `${fx.name}: max must be larger than min on every axis` })
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!, eps = 1e-6
    if (a.min.x < b.max.x - eps && b.min.x < a.max.x - eps && a.min.y < b.max.y - eps && b.min.y < a.max.y - eps && a.min.z < b.max.z - eps && b.min.z < a.max.z - eps) {
      issues.push({ message: `${a.name} and ${b.name} overlap: their blanks occupy the same space at the placements given` })
    }
  }
  return issues
}

/**
 * The setup with its template uses turned into operations (templates and uses removed): each use gives the elements, the template the tools,
 * settings and strategy. Pure and idempotent; a use that cannot be expanded is skipped and named in `issues`. The expanded operations go
 * before `position` (an index in the original operations) or after all of them, in the order of the uses.
 */
export const expandSetup = (setup: Setup): { readonly setup: Setup; readonly issues: ReadonlyArray<SetupIssue> } => {
  if ((setup.uses ?? []).length === 0 && setup.templates === undefined) return { setup, issues: [] }
  const { templates, uses, ...rest } = setup
  const issues: SetupIssue[] = []
  const byId = new Map<string, OperationTemplate>()
  for (const template of templates ?? []) {
    if (byId.has(template.id)) issues.push({ message: `Template id ${template.id} is used twice` })
    else byId.set(template.id, template)
    const stepIds = new Set<string>()
    for (const step of template.steps) {
      if (stepIds.has(step.id)) issues.push({ message: `Template ${template.name} has the step id ${step.id} twice` })
      stepIds.add(step.id)
    }
    for (const step of template.steps) for (const dep of step.dependsOn ?? []) if (!stepIds.has(dep)) issues.push({ message: `Template ${template.name}: step ${step.name} depends on ${dep}, which the template does not have` })
  }
  const taken = new Set(rest.operations.map((op) => op.id))
  const useIds = new Set<string>()
  const buckets = new Map<number, Operation[]>()
  const place = (position: number | undefined, ops: ReadonlyArray<Operation>): void => {
    const at = position === undefined ? rest.operations.length : Math.min(position, rest.operations.length)
    buckets.set(at, [...(buckets.get(at) ?? []), ...ops])
  }
  for (const use of uses ?? []) {
    const label = use.name ?? use.id
    if (useIds.has(use.id)) { issues.push({ message: `Template use id ${use.id} is used twice` }); continue }
    useIds.add(use.id)
    const template = byId.get(use.templateId)
    if (template === undefined) { issues.push({ message: `${label} uses the template ${use.templateId}, which the setup does not have` }); continue }
    if (use.elementIds.length === 0) { issues.push({ message: `${label} has no elements to machine` }); continue }
    if (use.position !== undefined && use.position > rest.operations.length) issues.push({ message: `${label} goes before operation ${use.position}, the setup has ${rest.operations.length}: it goes last` })
    const known = new Set(Object.keys(template.steps[0]!.params))
    const badKeys = Object.keys(use.overrides ?? {}).filter((key) => !known.has(key))
    if (badKeys.length > 0) { issues.push({ message: `${label} overrides ${badKeys.join(", ")}, which are not settings of the toolpath` }); continue }
    const instances = use.perElement === true ? use.elementIds.map((id) => [id]) : [use.elementIds]
    const many = instances.length > 1
    const order = use.order ?? "perStep"
    const made: Operation[][] = []
    let invalid = false
    instances.forEach((elementIds, i) => {
      const idOf = (stepId: string): string => (many ? `${use.id}[${i + 1}]:${stepId}` : `${use.id}:${stepId}`)
      const ops = template.steps.map((step): Operation => {
        const params = use.overrides === undefined ? step.params : { ...step.params, ...use.overrides }
        if (use.overrides !== undefined && !invalid) {
          try { Schema.decodeUnknownSync(ToolpathSettingsSchema)(params) } catch (error) { invalid = true; issues.push({ message: `${label}: the overrides are not valid settings (${error instanceof Error ? error.message.split("\n")[0] : String(error)})` }) }
        }
        return {
          id: idOf(step.id), name: `${use.name ?? template.name}${many ? ` #${i + 1}` : ""} - ${step.name}`, elementIds, params, tool: step.tool,
          ...(step.pocket !== undefined ? { pocket: step.pocket } : {}), enabled: use.enabled ?? true, fromPreviousStock: step.fromPreviousStock ?? false,
          ...(use.workpieceIds !== undefined ? { workpieceIds: use.workpieceIds } : {}),
          ...(step.dependsOn !== undefined && step.dependsOn.length > 0 ? { dependsOn: step.dependsOn.map(idOf) } : {})
        }
      })
      made.push(ops)
    })
    if (invalid) continue
    if (many && order === "perStep") for (const step of template.steps) if (step.fromPreviousStock === true) issues.push({ message: `${label}: ${step.name} continues the previous operation, which is another feature when the steps run step by step: use order perFeature` })
    const ops = order === "perFeature" || !many ? made.flat() : template.steps.flatMap((_, s) => made.map((instance) => instance[s]!))
    const clash = ops.filter((op) => taken.has(op.id))
    if (clash.length > 0) { issues.push({ message: `${label} would make the operation ids ${clash.map((op) => op.id).join(", ")}, which the setup already has` }); continue }
    for (const op of ops) taken.add(op.id)
    place(use.position, ops)
  }
  const operations: Operation[] = []
  rest.operations.forEach((op, i) => { operations.push(...(buckets.get(i) ?? []), op) })
  operations.push(...(buckets.get(rest.operations.length) ?? []))
  return { setup: { ...rest, operations }, issues }
}

/** Problems with a setup. Reported, not thrown: the UI shows them next to the offending row. A setup with template uses is validated as expanded. */
export const validateSetup = (given: Setup): ReadonlyArray<SetupIssue> => {
  const { setup, issues: templateIssues } = expandSetup(given)
  const issues: SetupIssue[] = [...templateIssues]
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
  if (setup.partProbe !== undefined && setup.machineType !== "mill") issues.push({ message: `A part probe is a milling accessory: a ${setup.machineType} setup has none` })
  for (const sister of setup.sisters ?? []) {
    if (!setup.operations.some((op) => op.tool.id === sister.toolId)) issues.push({ message: `Sister tool ${sister.tool.name} backs ${sister.toolId}, which no operation uses` })
    if (setup.operations.some((op) => op.tool.id === sister.tool.id)) issues.push({ message: `Sister tool ${sister.tool.name} is already a tool of an operation: a sister has an id of its own` })
  }
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
    const held = new Set([...pockets.values()])
    const spare = (setup.sisters ?? []).filter((s) => enabled.some((o) => o.tool.id === s.toolId)).length
    if (spare > 0 && held.size <= setup.magazineSize && held.size + spare > setup.magazineSize) issues.push({ message: `The tools and their sister tools need ${held.size + spare} pockets, the magazine holds ${setup.magazineSize}` })
    for (const op of enabled) {
      const pocket = pockets.get(op.id)!
      if (pocket > setup.magazineSize) issues.push({ operationId: op.id, message: `${op.name} needs pocket T${pocket}, the magazine holds ${setup.magazineSize}` })
    }
    // An inline part probe is a tool of its own in the magazine, after the cutting tools and their sisters.
    if (setup.partProbe?.placement === "inline") {
      const probe = setup.partProbe.toolNumber ?? Math.max(0, ...pockets.values()) + (setup.sisters ?? []).length + 1
      if (probe > setup.magazineSize) issues.push({ message: `The part probe is T${probe} and the magazine holds ${setup.magazineSize}: give the probe a pocket inside the magazine (partProbe.toolNumber) or take a tool out` })
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
