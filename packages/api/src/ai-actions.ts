import { Schema } from "effect"

const identifier = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200))
const revision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const ActionKind = Schema.Literals(["read", "write", "destructive"])

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

export const ActionFailure = Schema.Union([ActionDenied, ActionInvalidInput, ActionInterrupted])
export const ActionMutationOutcome = Schema.Union([ActionCommitted, ActionConflict])
