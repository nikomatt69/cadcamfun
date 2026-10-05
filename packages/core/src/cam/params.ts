/**
 * Parameter records shared by the CAM operations (spec 04-core-cam.md §3).
 *
 * Two rules the legacy generator broke and this module encodes instead:
 *  - **defaults apply only to a missing field** (`??` semantics, never `||`): an
 *    explicit `0` — a retract height of 0, a zero allowance — survives; and
 *  - **depth is validated at the edge**: `totalDepth > 0` and `stepdown > 0`
 *    (finite), so a generator can never silently produce zero passes.
 *
 * Height semantics (absolute Z, millimetres, stock top at `z = 0`):
 *  - `clearanceHeight` — rapid plane where the tool travels free of the stock;
 *  - `safeHeight` — where an operation starts and ends its feed moves;
 *  - `retractHeight` — where the tool parks between passes (0 is allowed);
 *  - `totalDepth` — **positive**; the deepest cut is at `z = topZ - totalDepth`.
 * They must satisfy `clearanceHeight >= safeHeight >= retractHeight`.
 */
import { Effect, Schema } from "effect"
import type { Vec3 } from "../cad/vec.ts"
import { CoolantSchema, type Move } from "./ir.ts"

export const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
export const Positive = Schema.Finite.check(Schema.isGreaterThan(0))

/**
 * Field with a default that applies only when the key is missing (decoding) or
 * omitted (construction). Present values — including `0` — are never replaced.
 */
export const withDefault = <S extends Schema.Constraint & Schema.WithoutConstructorDefault>(
  schema: S,
  value: S["Type"]
) =>
  Schema.withConstructorDefault<Schema.withDecodingDefaultTypeKey<S>>(Effect.succeed(value) as never)(
    Schema.withDecodingDefaultTypeKey<S>(Effect.succeed(value))(schema)
  )

/** Fields every cutting operation has. */
export const OperationFields = {
  id: withDefault(Schema.String.check(Schema.isMinLength(1)), "operation"),
  name: withDefault(Schema.String, "Operation"),
  clearanceHeight: withDefault(Schema.Finite, 10),
  safeHeight: withDefault(Schema.Finite, 5),
  retractHeight: withDefault(Schema.Finite, 2),
  /** Positive depth below the stock top; converted to `z = topZ - totalDepth` once. */
  totalDepth: Positive,
  /** Positive depth per pass; the last pass is clipped to `totalDepth`. */
  stepdown: Positive,
  /** Cutting feed, mm/min. */
  feed: withDefault(Positive, 800),
  /** Feed for plunging moves, mm/min. */
  plungeFeed: withDefault(Positive, 300),
  spindleRpm: withDefault(Positive, 10000),
  coolant: withDefault(CoolantSchema, "off" as const)
} as const

/** Cross-field rule shared by every operation's Schema. */
export const heightsOrdered = Schema.makeFilter<{
  readonly clearanceHeight: number
  readonly safeHeight: number
  readonly retractHeight: number
}>((p) =>
  p.clearanceHeight >= p.safeHeight && p.safeHeight >= p.retractHeight
    ? undefined
    : "heights must satisfy clearanceHeight >= safeHeight >= retractHeight"
)

// ---------------------------------------------------------------- move helpers

export const rapid = (to: Vec3): Move => ({ _tag: "Rapid", to })
export const linear = (to: Vec3, feed: number): Move => ({ _tag: "Linear", to, feed })
export const comment = (text: string): Move => ({ _tag: "Comment", text })

/**
 * Positive pass depths: `totalDepth = 5`, `stepdown = 2` gives `[2, 4, 5]`; the
 * last pass is clipped instead of overshooting. Throws on non-positive or
 * non-finite input (legacy bug 9), so a caller can never get an empty cut.
 */
export const passDepths = (totalDepth: number, stepdown: number): number[] => {
  if (!Number.isFinite(totalDepth) || !Number.isFinite(stepdown) || totalDepth <= 0 || stepdown <= 0) {
    throw new RangeError(`totalDepth and stepdown must be positive finite numbers, got ${totalDepth} / ${stepdown}`)
  }
  const count = Math.max(1, Math.ceil(totalDepth / stepdown - 1e-9))
  const passes: number[] = []
  for (let i = 1; i <= count; i++) passes.push(i === count ? totalDepth : Math.min(totalDepth, i * stepdown))
  return passes
}

/** Resolved Z levels of an operation (all absolute, clamped to the stock top). */
export interface Levels {
  readonly topZ: number
  readonly clearanceZ: number
  readonly safeZ: number
  readonly retractZ: number
  /** Where feed-rate entries (helix, ramp, plunge) start: at most 1 mm above the stock. */
  readonly entryZ: number
  /** Cut Z for every pass, shallow to deep. */
  readonly passZ: ReadonlyArray<number>
  readonly bottomZ: number
}

/**
 * Converts the parameter heights into absolute levels. Heights below the stock
 * top are clamped to it, so a rapid can never end inside the material.
 */
export const levelsOf = (
  params: {
    readonly clearanceHeight: number
    readonly safeHeight: number
    readonly retractHeight: number
    readonly totalDepth: number
    readonly stepdown: number
  },
  topZ: number
): Levels => {
  const clearanceZ = Math.max(params.clearanceHeight, topZ)
  const safeZ = Math.min(clearanceZ, Math.max(params.safeHeight, topZ))
  const retractZ = Math.min(safeZ, Math.max(params.retractHeight, topZ))
  const passZ = passDepths(params.totalDepth, params.stepdown).map((d) => topZ - d)
  const entryZ = Math.min(retractZ, topZ + 1)
  return { topZ, clearanceZ, safeZ, retractZ, entryZ, passZ, bottomZ: topZ - params.totalDepth }
}
