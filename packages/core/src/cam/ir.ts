/**
 * Toolpath intermediate representation (spec 04-core-cam.md §2).
 *
 * The IR is the contract between the operations, the post-processors, the
 * viewport and the simulator. Every stage is a pure function over it.
 *
 * Rules the whole module depends on:
 *  - coordinates are **millimetres**, feeds **mm/min**, times **seconds**;
 *  - cut depths are **negative Z** (stock top at `z = 0`); the sign is converted
 *    once, in the operation, never in a post-processor;
 *  - an `Arc` carries the **true centre** in absolute coordinates; the post
 *    turns it into the relative `I`/`J` the dialect expects;
 *  - an `Arc` whose `to` has the same XY as its start is a **full circle**.
 */
import { Schema } from "effect"
import { AssignSchema, CycleBeginSchema, CycleEndSchema, ElseSchema, EndIfSchema, EndWhileSchema, GotoSchema, IfSchema, LabelSchema, MacroCallSchema, MessageSchema, WhileSchema, WordExprSchema } from "./macro.ts"
import { angleInArc, normalizeAngle } from "../cad/arc-math.ts"
import { Vec2Schema, Vec3Schema } from "../cad/entities.ts"
import { TAU, type Vec2, type Vec3 } from "../cad/vec.ts"
import type { Tool } from "./tool.ts"
import { assertCycleSafe } from "./cycle-safety.ts"

const Positive = Schema.Finite.check(Schema.isGreaterThan(0))
const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))

// ---------------------------------------------------------------- moves

/**
 * Rotary axes carried **with** a move (simultaneous 5-axis): the tool tip moves
 * to `to` while the rotaries take these angles (degrees). Unlike `Orient`, the
 * angles change *during* the move: the machine interpolates all five axes
 * together. Only the axes given are moved; the post writes them on the same
 * block as the linear motion.
 */
export const RotarySchema = Schema.Struct({
  a: Schema.optionalKey(Schema.Finite),
  b: Schema.optionalKey(Schema.Finite),
  c: Schema.optionalKey(Schema.Finite)
})
export type Rotary = typeof RotarySchema.Type

export const RapidSchema = Schema.TaggedStruct("Rapid", {
  to: Vec3Schema,
  rotary: Schema.optionalKey(RotarySchema),
  /** Words the control computes (`macro.ts`); `to` stays the nominal position. */
  expr: Schema.optionalKey(WordExprSchema)
})

export const LinearSchema = Schema.TaggedStruct("Linear", {
  to: Vec3Schema,
  /** mm/min. */
  feed: Positive,
  rotary: Schema.optionalKey(RotarySchema),
  expr: Schema.optionalKey(WordExprSchema)
})

/** Arc in the XY plane; helical when `to.z` differs from the start Z. */
export const ArcSchema = Schema.TaggedStruct("Arc", {
  to: Vec3Schema,
  center: Vec2Schema,
  clockwise: Schema.Boolean,
  feed: Positive
})

export const DwellSchema = Schema.TaggedStruct("Dwell", { seconds: NonNegative })

export const CommentSchema = Schema.TaggedStruct("Comment", { text: Schema.String })

/**
 * Rotary positioning for indexed (3+2) machining: the rotary axes turn to these angles (degrees) with the tool retracted, and the
 * moves that follow are in machine coordinates for that orientation (see `indexing.ts`). An axis that is not given is not moved.
 */
export const OrientSchema = Schema.TaggedStruct("Orient", {
  a: Schema.optionalKey(Schema.Finite),
  b: Schema.optionalKey(Schema.Finite),
  c: Schema.optionalKey(Schema.Finite)
})

/**
 * Spindle orientation (`M19`, Siemens `SPOS`): the spindle stops and turns to `angle` (degrees, 0 = the control's orientation
 * mark, default) and is held there, so a tool with one cutting edge (the insert of a back-boring bar) points in a known direction.
 * It moves nothing in the part's space and is **not** `Orient`, which turns the rotary table. The spindle is stopped afterwards: a
 * post restarts it (`M3 S..`) before the next feed move. A control without the word refuses the program instead of dropping it.
 */
export const SpindleOrientSchema = Schema.TaggedStruct("SpindleOrient", {
  angle: Schema.optionalKey(Schema.Finite)
})

export const CycleKindSchema = Schema.Literals(["drill", "dwell", "peck", "chipBreak", "tap", "ream", "bore"])
export type CycleKind = typeof CycleKindSchema.Type

/**
 * Canned drilling cycle (extension of the spec's move set). The IR keeps the
 * *intent* (peck depth, dwell, retract plane); the post decides whether it can
 * be written as `G81`/`G82`/`G83`/`G73`/`G84`/`G85` or must be expanded with
 * `expandCycle`. `to` is the hole bottom; the tool returns to `retractHeight`.
 * `tap` is rigid tapping: the feed is `pitch` x spindle speed, the spindle reverses at the bottom and the tap feeds out; it has
 * no expansion a control without the cycle could run (the reversal is the control's), so such a post refuses it. `ream` feeds in
 * and back out at the cutting feed (reaming, boring to size), so the edge does not mark the finished bore on a rapid exit.
 * `bore` feeds in and rapids out (G86: the control stops the spindle at the bottom), the cycle of a boring bar.
 */
export const CycleSchema = Schema.TaggedStruct("Cycle", {
  cycle: CycleKindSchema,
  to: Vec3Schema,
  /** mm/min. */
  feed: Positive,
  /** Peck increment from the retract plane, mm; used by `peck`/`chipBreak`. */
  peckDepth: NonNegative,
  /** Dwell at the hole bottom, seconds; used by `dwell` and optionally by pecks. */
  dwellSeconds: NonNegative,
  /** Retract (R) plane, absolute Z. */
  retractHeight: Schema.Finite,
  /** `tap` only: the thread lead per spindle revolution, mm. */
  pitch: Schema.optionalKey(Positive)
})

export const MoveSchema = Schema.Union([
  RapidSchema,
  LinearSchema,
  ArcSchema,
  DwellSchema,
  CommentSchema,
  CycleSchema,
  OrientSchema,
  SpindleOrientSchema,
  AssignSchema,
  MacroCallSchema,
  IfSchema,
  ElseSchema,
  EndIfSchema,
  WhileSchema,
  EndWhileSchema,
  LabelSchema,
  GotoSchema,
  CycleBeginSchema,
  CycleEndSchema,
  MessageSchema
])

export type RapidMove = typeof RapidSchema.Type
export type LinearMove = typeof LinearSchema.Type
export type ArcMove = typeof ArcSchema.Type
export type DwellMove = typeof DwellSchema.Type
export type CommentMove = typeof CommentSchema.Type
export type OrientMove = typeof OrientSchema.Type
export type SpindleOrientMove = typeof SpindleOrientSchema.Type
export type CycleMove = typeof CycleSchema.Type
export type Move = typeof MoveSchema.Type

/** Clearance kept above the last depth when a peck cycle rapids back down, mm. */
export const PECK_CLEARANCE = 0.5
/** Planning figure for one spindle orientation (stop, find the mark, hold), seconds; controls differ, none is faster than this. */
export const SPINDLE_ORIENT_SECONDS = 2
/** Retract between pecks of a chip-breaking cycle, mm. */
export const CHIP_BREAK_RETRACT = 0.5

// ---------------------------------------------------------------- move helpers

/** Endpoint of a move, or `undefined` for `Dwell`/`Comment`/`SpindleOrient`, which do not move. */
export const moveTarget = (move: Move): Vec3 | undefined => {
  switch (move._tag) {
    case "Rapid":
    case "Linear":
    case "Arc":
      return move.to
    case "Cycle":
      return { x: move.to.x, y: move.to.y, z: move.retractHeight }
    case "Dwell":
    case "Comment":
    case "Orient":
    case "SpindleOrient":
      return undefined
  }
}

/** Feed of a cutting move; rapids, dwells and comments have none. */
export const moveFeed = (move: Move): number | undefined =>
  move._tag === "Linear" || move._tag === "Arc" || move._tag === "Cycle" ? move.feed : undefined

/**
 * Unsigned XY sweep of an arc about `center` from `from` to `to`. Equal
 * endpoints mean a full circle, the case the emitters special-case for `I`/`J`.
 */
export const arcSweepBetween = (from: Vec2, to: Vec2, center: Vec2, clockwise: boolean): number => {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x)
  const a1 = Math.atan2(to.y - center.y, to.x - center.x)
  const raw = normalizeAngle(clockwise ? a0 - a1 : a1 - a0)
  // Float noise around a full turn can show up as either ~0 or ~2π.
  return raw < 1e-12 || raw > TAU - 1e-12 ? TAU : raw
}

/** Whether an arc move is a full circle starting at `from`. */
export const isFullCircle = (move: ArcMove, from: Vec3, eps = 1e-9): boolean =>
  Math.abs(move.to.x - from.x) <= eps && Math.abs(move.to.y - from.y) <= eps

/** Points of an arc on the coordinate axes through its centre that lie within its sweep. */
export const arcExtrema = (move: ArcMove, from: Vec3): ReadonlyArray<Vec3> => {
  const r = Math.hypot(from.x - move.center.x, from.y - move.center.y)
  const a0 = Math.atan2(from.y - move.center.y, from.x - move.center.x)
  const a1 = Math.atan2(move.to.y - move.center.y, move.to.x - move.center.x)
  const full = isFullCircle(move, from)
  const out: Vec3[] = []
  for (let k = 0; k < 4; k++) {
    const angle = (k * Math.PI) / 2
    const inside = full || (move.clockwise ? angleInArc(angle, a1, a0, false) : angleInArc(angle, a0, a1, false))
    if (inside) out.push({ x: move.center.x + r * Math.cos(angle), y: move.center.y + r * Math.sin(angle), z: move.to.z })
  }
  return out
}

/** A move that moves nothing: it is data for the post (a variable, a macro, a branch, a message) or for the operator. */
export const isControlNode = (move: Move): move is Extract<Move, { readonly _tag: "Assign" | "MacroCall" | "If" | "Else" | "EndIf" | "While" | "EndWhile" | "Label" | "Goto" | "CycleBegin" | "CycleEnd" | "Message" }> =>
  move._tag === "Assign" || move._tag === "CycleBegin" || move._tag === "CycleEnd" || move._tag === "Label" || move._tag === "Goto" || move._tag === "MacroCall" || move._tag === "If" || move._tag === "Else" || move._tag === "EndIf" || move._tag === "While" || move._tag === "EndWhile" || move._tag === "Message"

/** Length of a move from `from`; arcs use the true radius and sweep and include the helical rise. */
export const moveLength = (move: Move, from: Vec3): number => {
  switch (move._tag) {
    case "Rapid":
    case "Linear":
      return Math.hypot(move.to.x - from.x, move.to.y - from.y, move.to.z - from.z)
    case "Arc": {
      const r = Math.hypot(from.x - move.center.x, from.y - move.center.y)
      const planar = r * arcSweepBetween(from, move.to, move.center, move.clockwise)
      return Math.hypot(planar, move.to.z - from.z)
    }
    case "Cycle":
    case "Dwell":
    case "Comment":
    case "Orient":
    case "SpindleOrient":
    case "Assign":
    case "MacroCall":
    case "If":
    case "Else":
    case "EndIf":
    case "While":
    case "EndWhile":
    case "Label":
    case "Goto":
    case "CycleBegin":
    case "CycleEnd":
    case "Message":
      return 0
  }
}

/**
 * Expands a canned cycle into plain moves starting from `from`. Rapids only
 * travel over the hole at the current height and down to the R plane; feeds do
 * the cutting. The same expansion defines the cut length of a `Cycle` for
 * `toolpathLength` and for the posts that cannot emit canned cycles.
 */
export const expandCycle = (cycle: CycleMove, from: Vec3): ReadonlyArray<Move> => {
  assertCycleSafe(cycle)
  if (![from.x, from.y, from.z].every(Number.isFinite)) throw new RangeError("Invalid drilling cycle start")
  const out: Move[] = []
  const { x, y } = cycle.to
  const r = cycle.retractHeight
  const bottom = cycle.to.z
  const rapid = (z: number): void => {
    out.push({ _tag: "Rapid", to: { x, y, z } })
  }
  const feed = (z: number): void => {
    out.push({ _tag: "Linear", to: { x, y, z }, feed: cycle.feed })
  }
  const positioningZ = Math.max(from.z, r)
  if (from.z < r) out.push({ _tag: "Rapid", to: { ...from, z: r } })
  if (Math.abs(from.x - x) > 1e-9 || Math.abs(from.y - y) > 1e-9) rapid(positioningZ)
  if (positioningZ !== r) rapid(r)
  const dwell = (): void => {
    if (cycle.dwellSeconds > 0) out.push({ _tag: "Dwell", seconds: cycle.dwellSeconds })
  }
  switch (cycle.cycle) {
    case "drill":
    case "bore":
      feed(bottom)
      break
    case "dwell":
      feed(bottom)
      dwell()
      break
    case "peck": {
      const peck = cycle.peckDepth > 0 ? cycle.peckDepth : r - bottom
      let z = r
      while (z > bottom + 1e-9) {
        const target = Math.max(bottom, z - peck)
        feed(target)
        if (target <= bottom + 1e-9) break
        rapid(r)
        rapid(Math.min(r, target + PECK_CLEARANCE))
        z = target
      }
      dwell()
      break
    }
    case "chipBreak": {
      const peck = cycle.peckDepth > 0 ? cycle.peckDepth : r - bottom
      let z = r
      while (z > bottom + 1e-9) {
        const target = Math.max(bottom, z - peck)
        feed(target)
        if (target <= bottom + 1e-9) break
        rapid(Math.min(r, target + CHIP_BREAK_RETRACT))
        z = target
      }
      dwell()
      break
    }
    // The motion of a rigid tap and of a reamer: in and back out at the feed (the tap's spindle reversal is not a move).
    case "tap":
    case "ream":
      feed(bottom)
      if (cycle.cycle === "ream") dwell()
      feed(r)
      break
  }
  rapid(r)
  return out
}

/** Flattens a move list, replacing every `Cycle` by its expansion. */
export const expandMoves = (moves: ReadonlyArray<Move>, start: Vec3): Move[] => {
  const out: Move[] = []
  let at = start
  for (const move of moves) {
    if (move._tag === "Cycle") {
      const expanded = expandCycle(move, at)
      out.push(...expanded)
      at = moveTarget(move) ?? at
      continue
    }
    out.push(move)
    at = moveTarget(move) ?? at
  }
  return out
}

// ---------------------------------------------------------------- toolpath / program

export const CoolantSchema = Schema.Literals(["off", "flood", "mist"])
export type Coolant = typeof CoolantSchema.Type

export const ProgramUnitsSchema = Schema.Literals(["mm", "inch"])
export type ProgramUnits = typeof ProgramUnitsSchema.Type

export const WorkOffsetSchema = Schema.Literals(["G54", "G55", "G56", "G57", "G58", "G59"])
export type WorkOffset = typeof WorkOffsetSchema.Type

export const ToolpathSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  toolId: Schema.String.check(Schema.isMinLength(1)),
  spindleRpm: NonNegative,
  coolant: CoolantSchema,
  moves: Schema.Array(MoveSchema),
  /**
   * The operation this toolpath belongs to. Toolpaths with the same operation id are one operation of the program that changes
   * tools inside it (one toolpath per tool); a toolpath without it is an operation by itself.
   */
  operation: Schema.optionalKey(Schema.Struct({ id: Schema.String.check(Schema.isMinLength(1)), name: Schema.String }))
})
export type Toolpath = typeof ToolpathSchema.Type

export const ProgramSchema = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1)),
  /** Output unit; IR coordinates stay millimetres and the post converts. */
  units: ProgramUnitsSchema,
  workOffset: WorkOffsetSchema,
  toolpaths: Schema.Array(ToolpathSchema),
  /** Free-form notes for the header (material, stock, ...); never machine data. */
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String))
})
export type Program = typeof ProgramSchema.Type

export const decodeToolpath = Schema.decodeUnknownEffect(ToolpathSchema)
export const encodeToolpath = Schema.encodeEffect(ToolpathSchema)
export const decodeProgram = Schema.decodeUnknownEffect(ProgramSchema)
export const encodeProgram = Schema.encodeEffect(ProgramSchema)

/** Builds a program with sensible defaults (mm, G54). */
export const makeProgram = (
  name: string,
  toolpaths: ReadonlyArray<Toolpath>,
  options: { readonly units?: ProgramUnits; readonly workOffset?: WorkOffset; readonly metadata?: Readonly<Record<string, string>> } = {}
): Program => ({
  name,
  units: options.units ?? "mm",
  workOffset: options.workOffset ?? "G54",
  toolpaths,
  ...(options.metadata !== undefined ? { metadata: options.metadata } : {})
})

// ---------------------------------------------------------------- analysis

/** Start point implied by a toolpath: the first move target, or the origin. */
export const toolpathStart = (toolpath: Toolpath): Vec3 => {
  for (const move of toolpath.moves) {
    const to = moveTarget(move)
    if (to !== undefined) return { ...to }
  }
  return { x: 0, y: 0, z: 0 }
}

const walk = (
  toolpath: Toolpath,
  visit: (move: Exclude<Move, CycleMove>, from: Vec3) => void
): void => {
  let from = toolpathStart(toolpath)
  for (const move of expandMoves(toolpath.moves, from)) {
    visit(move as Exclude<Move, CycleMove>, from)
    const to = moveTarget(move)
    if (to !== undefined) from = { ...to }
  }
}

/** Cut length in mm (feed moves only, cycles expanded) — what a cycle-time estimate needs. */
export const toolpathLength = (toolpath: Toolpath): number => {
  let total = 0
  walk(toolpath, (move, from) => {
    if (move._tag === "Linear" || move._tag === "Arc") total += moveLength(move, from)
  })
  return total
}

/** Total path length in mm, rapids included. */
export const toolpathPathLength = (toolpath: Toolpath): number => {
  let total = 0
  walk(toolpath, (move, from) => {
    total += moveLength(move, from)
  })
  return total
}

export interface Bounds3D {
  readonly minX: number
  readonly minY: number
  readonly minZ: number
  readonly maxX: number
  readonly maxY: number
  readonly maxZ: number
}

/**
 * Axis-aligned bounds of everything the tool centre sweeps (arcs contribute
 * their axis extrema). An empty toolpath yields an inverted (empty) box.
 */
export const toolpathBounds = (toolpath: Toolpath): Bounds3D => {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  const include = (x: number, y: number, z: number): void => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  let started = false
  walk(toolpath, (move, from) => {
    if (move._tag === "Dwell" || move._tag === "Comment" || move._tag === "Orient" || move._tag === "SpindleOrient" || isControlNode(move)) return
    if (!started) {
      include(from.x, from.y, from.z)
      started = true
    }
    include(move.to.x, move.to.y, move.to.z)
    if (move._tag === "Arc") for (const p of arcExtrema(move, from)) include(p.x, p.y, p.z)
  })
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

/** Deepest Z reached, or `Infinity` for a toolpath without moves. */
export const toolpathMinZ = (toolpath: Toolpath): number => toolpathBounds(toolpath).minZ

/**
 * Cycle-time estimate in seconds. Rapids use `rapidRate` (mm/min), cutting moves
 * their own feed, dwells their own seconds. Acceleration is ignored on purpose:
 * the number is a planning figure, not a machine simulation.
 */
export const estimateTime = (toolpath: Toolpath, rapidRate: number): number => {
  let seconds = 0
  const rate = Math.max(1e-9, rapidRate)
  walk(toolpath, (move, from) => {
    switch (move._tag) {
      case "Rapid":
        seconds += (moveLength(move, from) / rate) * 60
        break
      case "Linear":
      case "Arc":
        seconds += (moveLength(move, from) / move.feed) * 60
        break
      case "Dwell":
        seconds += move.seconds
        break
      case "SpindleOrient":
        seconds += SPINDLE_ORIENT_SECONDS
        break
      case "Comment":
        break
    }
  })
  return seconds
}

// ---------------------------------------------------------------- validation

export interface MachineTravel {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
}

/** Allowed range of one rotary axis, degrees. */
export interface RotaryRange {
  readonly min: number
  readonly max: number
}

/**
 * Rotary axes of a 4/5-axis machine and the range each is allowed to take,
 * degrees. An axis that is absent is not fitted to the machine.
 */
export interface MachineRotary {
  readonly a?: RotaryRange
  readonly b?: RotaryRange
  readonly c?: RotaryRange
}

/** The subset of a machine configuration a program has to respect. */
export interface MachineProfile {
  readonly id: string
  readonly travel: MachineTravel
  /** Highest feed the machine accepts, mm/min. */
  readonly maxFeed?: number
  readonly maxSpindleRpm?: number
  /** Rotary axes fitted, with the range of each, degrees. */
  readonly rotary?: MachineRotary
  /** When present, a toolpath referencing an unknown tool is an error. */
  readonly tools?: ReadonlyArray<Pick<Tool, "id">>
}

export type ValidationIssue =
  | { readonly _tag: "InvalidInput"; readonly message: string; readonly path: string; readonly toolpathId?: string; readonly moveIndex?: number }
  | { readonly _tag: "TravelLimit"; readonly message: string; readonly point: Vec3; readonly toolpathId: string }
  | { readonly _tag: "FeedLimit"; readonly message: string; readonly feed: number; readonly toolpathId: string }
  | { readonly _tag: "MissingTool"; readonly message: string; readonly toolId: string; readonly toolpathId: string }
  | { readonly _tag: "SpindleLimit"; readonly message: string; readonly spindleRpm: number; readonly toolpathId: string }
  | { readonly _tag: "RotaryLimit"; readonly message: string; readonly axis: "A" | "B" | "C"; readonly angle: number; readonly toolpathId: string; readonly moveIndex?: number }

const fmt = (n: number): string => n.toFixed(3)

const MachineProfileSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  travel: Schema.Struct({
    minX: Schema.Finite, maxX: Schema.Finite,
    minY: Schema.Finite, maxY: Schema.Finite,
    minZ: Schema.Finite, maxZ: Schema.Finite
  }),
  maxFeed: Schema.optionalKey(Positive),
  maxSpindleRpm: Schema.optionalKey(NonNegative),
  rotary: Schema.optionalKey(Schema.Struct({
    a: Schema.optionalKey(Schema.Struct({ min: Schema.Finite, max: Schema.Finite })),
    b: Schema.optionalKey(Schema.Struct({ min: Schema.Finite, max: Schema.Finite })),
    c: Schema.optionalKey(Schema.Struct({ min: Schema.Finite, max: Schema.Finite }))
  })),
  tools: Schema.optionalKey(Schema.Array(Schema.Struct({ id: Schema.String.check(Schema.isMinLength(1)) })))
})

const validateProgramInput = Schema.decodeUnknownSync(ProgramSchema, { errors: "all" })
const validateMachineInput = Schema.decodeUnknownSync(MachineProfileSchema, { errors: "all" })

/**
 * Fails closed on schema-invalid input, inverted travel, unsafe arcs and cycles.
 * Schema failures stop geometric checks; otherwise all limit and semantic issues
 * are collected. Cycle travel is checked analytically, never by peck expansion.
 * An empty array means valid for these checks, not collision certification.
 */
export const validate = (program: Program, machine: MachineProfile): ReadonlyArray<ValidationIssue> => {
  const issues: ValidationIssue[] = []
  try {
    validateProgramInput(program)
  } catch (error) {
    issues.push({ _tag: "InvalidInput", path: "program", message: `Invalid program: ${error instanceof Error ? error.message : String(error)}` })
  }
  try {
    validateMachineInput(machine)
  } catch (error) {
    issues.push({ _tag: "InvalidInput", path: "machine", message: `Invalid machine profile: ${error instanceof Error ? error.message : String(error)}` })
  }
  if (issues.length > 0) return issues
  const t = machine.travel
  for (const axis of ["X", "Y", "Z"] as const) {
    if (t[`min${axis}`] > t[`max${axis}`]) {
      issues.push({ _tag: "InvalidInput", path: `machine.travel.${axis}`, message: `Machine travel min${axis} must not exceed max${axis}` })
    }
  }
  if (issues.length > 0) return issues
  for (const toolpath of program.toolpaths) {
    if (machine.tools !== undefined && !machine.tools.some((tool) => tool.id === toolpath.toolId)) {
      issues.push({
        _tag: "MissingTool",
        toolpathId: toolpath.id,
        toolId: toolpath.toolId,
        message: `Toolpath "${toolpath.name}" uses tool ${toolpath.toolId}, which machine ${machine.id} does not have`
      })
    }
    if (machine.maxSpindleRpm !== undefined && toolpath.spindleRpm > machine.maxSpindleRpm) {
      issues.push({
        _tag: "SpindleLimit",
        toolpathId: toolpath.id,
        spindleRpm: toolpath.spindleRpm,
        message: `Toolpath "${toolpath.name}" asks for S${toolpath.spindleRpm}, above the machine limit of ${machine.maxSpindleRpm}`
      })
    }
    const outside = (x: number, y: number, z: number): boolean =>
      x < t.minX - 1e-9 || x > t.maxX + 1e-9 || y < t.minY - 1e-9 || y > t.maxY + 1e-9 || z < t.minZ - 1e-9 || z > t.maxZ + 1e-9
    const ranges = machine.rotary
    const checkRotary = (toolpathId: string, moveIndex: number, axes: ReadonlyArray<readonly ["A" | "B" | "C", number | undefined]>): void => {
      if (ranges === undefined) return
      for (const [axis, angle] of axes) {
        if (angle === undefined || !Number.isFinite(angle)) continue
        const range = ranges[axis.toLowerCase() as "a" | "b" | "c"]
        if (range === undefined) continue
        if (angle >= range.min - 1e-9 && angle <= range.max + 1e-9) continue
        issues.push({
          _tag: "RotaryLimit",
          axis,
          angle,
          toolpathId,
          moveIndex,
          message: `Toolpath move ${moveIndex} turns ${axis}${fmt(angle)}, outside the machine range ${fmt(range.min)}..${fmt(range.max)}`
        })
      }
    }
    const reported = new Set<string>()
    const check = (point: Vec3): void => {
      if (![point.x, point.y, point.z].every(Number.isFinite)) {
        issues.push({ _tag: "InvalidInput", path: `toolpath.${toolpath.id}.geometry`, toolpathId: toolpath.id, message: `Toolpath "${toolpath.name}" produces non-finite travel geometry` })
        return
      }
      if (!outside(point.x, point.y, point.z)) return
      const key = `${fmt(point.x)}/${fmt(point.y)}/${fmt(point.z)}`
      if (reported.has(key)) return
      reported.add(key)
      issues.push({
        _tag: "TravelLimit",
        toolpathId: toolpath.id,
        point: { ...point },
        message: `Toolpath "${toolpath.name}" leaves the travel of machine ${machine.id} at X${fmt(point.x)} Y${fmt(point.y)} Z${fmt(point.z)}`
      })
    }
    for (const move of toolpath.moves) {
      const feed = moveFeed(move)
      if (feed !== undefined && machine.maxFeed !== undefined && feed > machine.maxFeed) {
        issues.push({
          _tag: "FeedLimit",
          toolpathId: toolpath.id,
          feed,
          message: `Toolpath "${toolpath.name}" feeds at F${fmt(feed)}, above the machine limit of ${machine.maxFeed}`
        })
      }
    }
    let from: Vec3 | undefined
    for (const [moveIndex, move] of toolpath.moves.entries()) {
      const invalid = (message: string): void => {
        issues.push({ _tag: "InvalidInput", path: `toolpath.${toolpath.id}.moves[${moveIndex}]`, toolpathId: toolpath.id, moveIndex, message: `Toolpath "${toolpath.name}" move ${moveIndex}: ${message}` })
      }
      const to = moveTarget(move)
      if (to === undefined) {
        if (move._tag === "Orient") checkRotary(toolpath.id, moveIndex, [["A", move.a], ["B", move.b], ["C", move.c]])
        if (move._tag === "SpindleOrient" && move.angle !== undefined && !(move.angle >= 0 && move.angle < 360)) invalid(`spindle orientation ${move.angle} deg is outside 0..360`)
        continue
      }
      if (move._tag === "Cycle") {
        try {
          assertCycleSafe(move)
        } catch (error) {
          invalid(error instanceof Error ? error.message : String(error))
        }
        // Every expanded peck lies between bottom and R. The only higher travel
        // is the protective lift and lateral positioning at max(start Z, R).
        const start = from ?? to
        const positioningZ = Math.max(start.z, move.retractHeight)
        check({ ...start, z: positioningZ })
        check({ x: move.to.x, y: move.to.y, z: positioningZ })
        check(move.to)
      }
      if (move._tag === "Arc") {
        if (from === undefined) {
          invalid("Arc requires a known start position from a preceding positioning move")
        } else {
          const radius = Math.hypot(from.x - move.center.x, from.y - move.center.y)
          const endRadius = Math.hypot(to.x - move.center.x, to.y - move.center.y)
          if (!Number.isFinite(radius) || !Number.isFinite(endRadius) || radius <= 0 || Math.abs(radius - endRadius) > 1e-6) {
            invalid("Arc requires finite positive radius and matching endpoint radii within 1e-6 mm")
          } else {
            for (const p of arcExtrema(move, from)) check(p)
          }
        }
      }
      check(to)
      from = to
      if (move._tag === "Rapid" || move._tag === "Linear") {
        if (move.rotary !== undefined) {
          checkRotary(toolpath.id, moveIndex, [["A", move.rotary.a], ["B", move.rotary.b], ["C", move.rotary.c]])
        }
      }
    }
  }
  return issues
}

export type { Vec2 }
