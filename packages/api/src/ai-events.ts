import { Schema } from "effect"

const Count = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0))

export const TurnEvent = Schema.Struct({ type: Schema.Literal("turn"), sessionId: Schema.String,
  phase: Schema.Literals(["start", "recovering", "continuing", "finish"]), reason: Schema.optionalKey(Schema.String) })
export const SessionStatusEvent = Schema.Struct({ type: Schema.Literal("session_status"), sessionId: Schema.String,
  status: Schema.Literals(["busy", "idle", "retry"]) })
export const PermissionResolvedEvent = Schema.Struct({ type: Schema.Literal("permission_resolved"), sessionId: Schema.String,
  requestId: Schema.String, reply: Schema.Literals(["once", "always", "reject"]) })
export const PermissionBlockedEvent = Schema.Struct({ type: Schema.Literal("permission_blocked"), sessionId: Schema.String,
  permission: Schema.String, patterns: Schema.Array(Schema.String), reason: Schema.String })
export const CompactionEvent = Schema.Struct({ type: Schema.Literal("compaction"), sessionId: Schema.String,
  phase: Schema.Literals(["start", "finish"]) })
export const ContextSnapshotEvent = Schema.Struct({ type: Schema.Literal("context_snapshot"), sessionId: Schema.String,
  projectId: Schema.String, source: Schema.Literal("workspace"), chars: Count })
export const ToolDiagnosticEvent = Schema.Struct({ type: Schema.Literal("tool_diagnostic"), sessionId: Schema.String,
  agent: Schema.optionalKey(Schema.String), callId: Schema.String, tool: Schema.String,
  kind: Schema.Literals(["argument", "execution", "partial", "verification"]),
  severity: Schema.Literals(["error", "warning", "info"]), message: Schema.String,
  recovery: Schema.optionalKey(Schema.String), mutationApplied: Schema.optionalKey(Schema.Boolean) })

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
  /** The specialist running the tool (`agents.ts`); absent when the main agent does. */
  agent: Schema.optionalKey(Schema.String),
  callId: Schema.String,
  tool: Schema.String,
  input: Schema.Unknown
})

export const ToolResultEvent = Schema.Struct({
  type: Schema.Literal("tool_result"),
  sessionId: Schema.String,
  /** The specialist running the tool (`agents.ts`); absent when the main agent does. */
  agent: Schema.optionalKey(Schema.String),
  callId: Schema.String,
  tool: Schema.String,
  ok: Schema.Boolean,
  output: Schema.String,
  images: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isMaxLength(4_000_100))).check(Schema.isMaxLength(2)))
})

export const PermissionRequestEvent = Schema.Struct({
  type: Schema.Literal("permission_request"),
  sessionId: Schema.String,
  requestId: Schema.String,
  permission: Schema.String,
  patterns: Schema.Array(Schema.String)
})

export const QuestionInfoSchema = Schema.Struct({ header: Schema.String, question: Schema.String,
  options: Schema.Array(Schema.Struct({ label: Schema.String, description: Schema.String })),
  multiple: Schema.optionalKey(Schema.Boolean), custom: Schema.optionalKey(Schema.Boolean) })
export const QuestionRequestEvent = Schema.Struct({ type: Schema.Literal("question_request"), sessionId: Schema.String, requestId: Schema.String,
  questions: Schema.Array(QuestionInfoSchema) })
export const QuestionResolvedEvent = Schema.Struct({ type: Schema.Literal("question_resolved"), sessionId: Schema.String, requestId: Schema.String })

export const UsageSchema = Schema.Struct({
  inputTokens: Count,
  outputTokens: Count
})

export const DoneEvent = Schema.Struct({
  type: Schema.Literal("done"),
  sessionId: Schema.String,
  text: Schema.String,
  usage: Schema.optionalKey(UsageSchema),
  recovered: Schema.optionalKey(Schema.Boolean)
})

export const ErrorEvent = Schema.Struct({
  type: Schema.Literal("error"),
  sessionId: Schema.String,
  code: Schema.Literals(["provider", "config", "aborted", "internal"]),
  message: Schema.String
})

/** The model's reasoning as it is written (nikcli `reasoning` parts / AI SDK `reasoning-delta`). */
export const ReasoningEvent = Schema.Struct({
  type: Schema.Literal("reasoning"),
  sessionId: Schema.String,
  text: Schema.String
})

/** A tool call the model is still writing: its name is known, its arguments are not complete (AI SDK `tool-input-delta`). */
export const ToolProgressEvent = Schema.Struct({
  type: Schema.Literal("tool_progress"),
  sessionId: Schema.String,
  /** The specialist running the tool (`agents.ts`); absent when the main agent does. */
  agent: Schema.optionalKey(Schema.String),
  callId: Schema.String,
  tool: Schema.String,
  /** Characters of arguments written so far. */
  chars: Schema.Number
})

/** One step of the agent loop (a model call, then its tools): `start` when it begins, `finish` with what it cost. */
export const StepEvent = Schema.Struct({
  type: Schema.Literal("step"),
  sessionId: Schema.String,
  phase: Schema.Literals(["start", "finish"]),
  /** 1-based number of the step in this turn. */
  index: Schema.Number,
  /** Why a finished step ended: `stop`, `tool-calls`, `length`, ... */
  reason: Schema.optionalKey(Schema.String),
  usage: Schema.optionalKey(UsageSchema)
})

export const TodoSchema = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  content: Schema.String,
  status: Schema.Literals(["pending", "in_progress", "completed", "cancelled"]),
  priority: Schema.optionalKey(Schema.String)
})
export type Todo = typeof TodoSchema.Type

/** The agent's plan (its todo list) as it stands: the whole list, every time it changes. */
export const TodoEvent = Schema.Struct({
  type: Schema.Literal("todo"),
  sessionId: Schema.String,
  todos: Schema.Array(TodoSchema)
})

/** The provider failed and the host is trying again. */
export const RetryEvent = Schema.Struct({
  type: Schema.Literal("retry"),
  sessionId: Schema.String,
  attempt: Schema.Number,
  message: Schema.String
})

/** The conversation grew past the model's window and the host summarised the older part. */
export const CompactedEvent = Schema.Struct({
  type: Schema.Literal("compacted"),
  sessionId: Schema.String
})

/** The session goal the agent works toward (nikcli's `/goal` loop): the host keeps prompting until it is complete, blocked or out of budget. */
export const GoalEvent = Schema.Struct({
  type: Schema.Literal("goal"),
  sessionId: Schema.String,
  /** `null` when the goal was cleared. */
  goal: Schema.NullOr(Schema.Struct({
    objective: Schema.String,
    status: Schema.Literals(["active", "paused", "blocked", "usage_limited", "budget_limited", "complete"]),
    iteration: Schema.Number,
    tokensUsed: Schema.Number,
    tokenBudget: Schema.optionalKey(Schema.Number)
  }))
})

/**
 * A message the user sent while the agent was working has been taken into the conversation (nikcli promotes a queued message at
 * the next safe step, a steered one at once). What the agent writes from here on answers it.
 */
export const UserMessageEvent = Schema.Struct({
  type: Schema.Literal("user_message"),
  sessionId: Schema.String,
  text: Schema.String
})

export const AiStreamEventSchema = Schema.Union([
  TurnEvent,
  SessionStatusEvent,
  PermissionResolvedEvent,
  PermissionBlockedEvent,
  CompactionEvent,
  ContextSnapshotEvent,
  ToolDiagnosticEvent,
  UserMessageEvent,
  GoalEvent,
  DeltaEvent,
  ReasoningEvent,
  ToolProgressEvent,
  StepEvent,
  TodoEvent,
  RetryEvent,
  CompactedEvent,
  ToolCallEvent,
  ToolResultEvent,
  PermissionRequestEvent,
  QuestionRequestEvent,
  QuestionResolvedEvent,
  DoneEvent,
  ErrorEvent
])

export type AiStreamEvent = typeof AiStreamEventSchema.Type
