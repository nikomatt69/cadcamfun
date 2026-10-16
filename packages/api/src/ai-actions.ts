import { Schema } from "effect"

const identifier = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200))
const revision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const ActionKind = Schema.Literals(["read", "write", "destructive"])

/**
 * What an action changes or reaches beyond reading the open document, declared per action (`ACTION_CONTRACTS`) and never
 * inferred from its tool. `interface` is the editor or viewport on the user's screen, `external` the network, `task` the
 * delegation scheduler. A `read` action may only have `interface` or `external`; every write names a persistent effect.
 */
export const ActionEffect = Schema.Literals([
  "drawing", "operation", "program", "report", "stock", "component", "library", "memory", "context", "mod", "history", "workflow", "task", "interface", "external"
])
export type ActionEffect = typeof ActionEffect.Type
export const PERSISTENT_EFFECTS: ReadonlyArray<ActionEffect> = ActionEffect.literals.filter((effect) => effect !== "interface" && effect !== "external")

/** Trusted admission data; never a field in model-visible action parameters. */
export const ActionInvocation = Schema.Struct({
  actorId: identifier,
  projectId: identifier,
  drawingId: Schema.optionalKey(identifier),
  sessionId: identifier,
  turnId: identifier,
  callId: identifier,
  expectedRevision: Schema.optionalKey(revision)
})
export type ActionInvocation = typeof ActionInvocation.Type

export class ActionDenied extends Schema.TaggedError<ActionDenied>()("ActionDenied", {
  actionId: identifier,
  message: Schema.String
}) {}

export class ActionInvalidInput extends Schema.TaggedError<ActionInvalidInput>()("ActionInvalidInput", {
  actionId: identifier,
  message: Schema.String
}) {}

export class ActionInterrupted extends Schema.TaggedError<ActionInterrupted>()("ActionInterrupted", {
  actionId: identifier,
  message: Schema.String
}) {}

/** The call may have committed (a write whose answer could not be read): reconcile by inspecting, never retry blindly. */
export class ActionUncertain extends Schema.TaggedError<ActionUncertain>()("ActionUncertain", {
  actionId: identifier,
  message: Schema.String
}) {}

export const ActionConflict = Schema.Struct({
  ok: Schema.Literal(false),
  _tag: Schema.Literal("ActionConflict"),
  actionId: identifier,
  projectId: identifier,
  drawingId: identifier,
  expectedRevision: revision,
  actualRevision: revision,
  message: Schema.String
})
export type ActionConflict = typeof ActionConflict.Type

/** A committed result may be reconciled, never replayed as a fresh mutation. */
export const ActionReceipt = Schema.Struct({
  receiptId: identifier,
  actionId: identifier,
  actorId: identifier,
  projectId: identifier,
  drawingId: identifier,
  callId: identifier,
  previousRevision: revision,
  revision,
  committedAt: Schema.String,
  result: Schema.Json
})
export type ActionReceipt = typeof ActionReceipt.Type

export const ActionCommitted = Schema.Struct({
  ok: Schema.Literal(true),
  _tag: Schema.Literal("ActionCommitted"),
  receipt: ActionReceipt
})

export const ActionFailure = Schema.Union([ActionDenied, ActionInvalidInput, ActionInterrupted, ActionUncertain])
export const ActionMutationOutcome = Schema.Union([ActionCommitted, ActionConflict])

/**
 * How one call ended, as every adapter reports it: `succeeded` (including a read whose finding is negative, such as a
 * failing check), `partial` (part of the answer or part of the batch), `refused` (nothing done: invalid, denied,
 * unavailable, nothing to do), `conflict` (the document moved on: inspect again), `cancelled` and `uncertain`.
 */
export const ActionOutcomeStatus = Schema.Literals(["succeeded", "partial", "refused", "conflict", "cancelled", "uncertain"])
export type ActionOutcomeStatus = typeof ActionOutcomeStatus.Type

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined

/** Classifies a validated action result; the one rule the host text, Code Mode, the desktop and the bridge share. */
export const actionOutcome = (value: unknown): ActionOutcomeStatus => {
  const result = record(value)
  if (result === undefined) return "succeeded"
  const tag = result["_tag"]
  if (tag === "ActionInterrupted") return "cancelled"
  if (tag === "ActionUncertain" || tag === "ActionResultInvalid") return "uncertain"
  if (tag === "ActionConflict" || tag === "ActionStale" || result["status"] === "stale" || result["status"] === "conflict") return "conflict"
  if (result["ok"] === false && (typeof result["error"] === "string" || typeof tag === "string")) return "refused"
  const skipped = result["skipped"]
  if (result["complete"] === false || (typeof result["omitted"] === "number" && result["omitted"] > 0) || (Array.isArray(skipped) && skipped.length > 0)) return "partial"
  if (typeof result["nextOffset"] === "number") return "partial"
  return "succeeded"
}
