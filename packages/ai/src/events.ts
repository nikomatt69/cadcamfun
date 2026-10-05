import { Schema } from "effect"

/**
 * Events streamed by `AiService.chat`. This is the contract shared with the
 * SSE endpoint in WP3: every member is a plain struct with a `type`
 * discriminator and JSON-safe fields.
 */
export const DeltaEvent = Schema.Struct({
  type: Schema.Literal("delta"),
  sessionId: Schema.String,
  text: Schema.String
})

export const ToolCallEvent = Schema.Struct({
  type: Schema.Literal("tool_call"),
  sessionId: Schema.String,
  callId: Schema.String,
  tool: Schema.String,
  input: Schema.Unknown
})

export const ToolResultEvent = Schema.Struct({
  type: Schema.Literal("tool_result"),
  sessionId: Schema.String,
  callId: Schema.String,
  tool: Schema.String,
  ok: Schema.Boolean,
  output: Schema.String
})

export const PermissionRequestEvent = Schema.Struct({
  type: Schema.Literal("permission_request"),
  sessionId: Schema.String,
  requestId: Schema.String,
  permission: Schema.String,
  patterns: Schema.Array(Schema.String)
})

export const UsageSchema = Schema.Struct({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number
})

export const DoneEvent = Schema.Struct({
  type: Schema.Literal("done"),
  sessionId: Schema.String,
  text: Schema.String,
  usage: Schema.optionalKey(UsageSchema)
})

export const ErrorEvent = Schema.Struct({
  type: Schema.Literal("error"),
  sessionId: Schema.String,
  code: Schema.Literals(["provider", "config", "aborted", "internal"]),
  message: Schema.String
})

export const AiEventSchema = Schema.Union([
  DeltaEvent,
  ToolCallEvent,
  ToolResultEvent,
  PermissionRequestEvent,
  DoneEvent,
  ErrorEvent
])

export type AiEvent = typeof AiEventSchema.Type
