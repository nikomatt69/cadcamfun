import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { BadRequest, InternalError, NotFound } from "../errors.ts"
import { AiStreamEventSchema, ToolCallEvent, ToolResultEvent, TodoEvent, ToolDiagnosticEvent, UsageSchema } from "../ai-events.ts"

const opt = Schema.optional
const nullable = Schema.NullOr(Schema.String)
/**
 * Any provider the embedded host knows (models.dev merged with `nikcli.json`):
 * not a closed union, because the user picks the provider in the settings.
 */
export const AiProviderId = Schema.String
export const AiTier = Schema.Literals(["fast", "balanced", "best"])
export const AiModelSelector = Schema.Struct({ provider: opt(AiProviderId), model: opt(Schema.String), tier: opt(AiTier), variant: opt(Schema.String) })

/** `{ error }` bodies used by the legacy chat routes. */
export class AiBadRequest extends Schema.TaggedError<AiBadRequest>()("AiBadRequest", { error: Schema.String }, { httpApiStatus: 400 }) {}
export class AiNotFound extends Schema.TaggedError<AiNotFound>()("AiNotFound", { error: Schema.String }, { httpApiStatus: 404 }) {}
export class AiFailure extends Schema.TaggedError<AiFailure>()("AiFailure", { error: Schema.String }, { httpApiStatus: 500 }) {}
/** `{ success: false, error, action, processedAt }` of the unified G-code route. */
export class GcodeActionError extends Schema.TaggedError<GcodeActionError>()("GcodeActionError", {
  success: Schema.Literal(false), error: Schema.String, action: opt(Schema.String), processedAt: opt(Schema.String)
}, { httpApiStatus: 400 }) {}
export class GcodeActionFailure extends Schema.TaggedError<GcodeActionFailure>()("GcodeActionFailure", {
  success: Schema.Literal(false), error: Schema.String, action: Schema.String, processedAt: Schema.String
}, { httpApiStatus: 500 }) {}

export const CredentialBody = Schema.Struct({ provider: opt(Schema.String), key: opt(Schema.String), baseUrl: opt(Schema.String) })
export const CredentialStatus = Schema.Record(Schema.String, Schema.Literals(["configured", "missing"]))
export const AiStatus = Schema.Struct({
  providers: CredentialStatus,
  configured: Schema.Boolean,
  tools: opt(Schema.Array(Schema.Struct({ id: Schema.String, description: Schema.String }))),
  host: Schema.Literals(["nikcli", "direct"])
})
export const AiModelEntry = Schema.Struct({
  id: Schema.String, provider: AiProviderId, tier: opt(AiTier), contextWindow: Schema.Number,
  tools: Schema.Boolean, vision: Schema.Boolean, configured: Schema.Boolean
})

/** One model of a catalogue provider, as the embedded host reports it. */
export const AiHostModel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  provider: Schema.String,
  contextWindow: Schema.Number,
  maxOutput: Schema.Number,
  inputWindow: opt(Schema.Number), reasoning: opt(Schema.Boolean), variants: opt(Schema.Array(Schema.String)),
  tools: Schema.Boolean,
  vision: Schema.Boolean,
  /** USD per million tokens. */
  cost: Schema.Struct({ input: Schema.Number, output: Schema.Number })
})
/** One provider of `GET /api/ai/providers`: what nikcli knows plus our key state. */
export const AiProviderEntry = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** Where the host got it: `models.dev`, `config`, … */
  source: Schema.String,
  /** How it can be authenticated (`api`, `oauth`). */
  auth: Schema.Array(Schema.String),
  configured: Schema.Boolean,
  /** Present when the user overrode the base URL (OpenAI-compatible endpoints). */
  baseUrl: opt(Schema.String),
  models: Schema.Array(AiHostModel)
})

export const ChatMessage = Schema.Struct({ role: Schema.String, content: Schema.Unknown })
export const LegacyChatBody = Schema.Struct({
  messages: opt(Schema.Unknown), mcpServerId: opt(Schema.String), mcpReference: opt(Schema.String)
})
export const LegacyChatReply = Schema.Struct({ reply: Schema.String, hasMcpData: Schema.Boolean })
export const ChatAttachment = Schema.Struct({
  name: Schema.String, mime: opt(Schema.String), data: Schema.String, encoding: opt(Schema.Literals(["base64", "text"]))
})
export const StreamChatBody = Schema.Struct({
  permissionMode: opt(Schema.Literals(["auto", "ask", "approve"])),
  agent: opt(Schema.String), mode: opt(Schema.Literals(["general", "cad", "cam", "gcode", "toolpath"])),
  attachments: opt(Schema.Array(ChatAttachment)),
  message: opt(Schema.String), sessionId: opt(Schema.String), projectId: opt(Schema.String),
  /** The drawing this turn works on. Checked against the project before admission; the turn's tools act on it and on nothing else. */
  drawingId: opt(Schema.String),
  context: opt(Schema.String), includeContext: opt(Schema.Boolean), model: opt(AiModelSelector)
})
export const AbortBody = Schema.Struct({ sessionId: opt(Schema.String), projectId: opt(Schema.String) })
export const PermissionReplyBody = Schema.Struct({ sessionId: Schema.String, projectId: opt(Schema.String), requestId: Schema.String, decision: Schema.Literals(["once", "always", "reject"]) })

export const CompletionBody = Schema.Struct({
  prompt: opt(Schema.String), systemPrompt: opt(Schema.String), model: opt(Schema.String), temperature: opt(Schema.Number)
})
export const CompletionReply = Schema.Struct({ text: Schema.String, model: Schema.String })
export const PromptSuggestionsReply = Schema.Struct({ prompts: Schema.Array(Schema.String) })
export const AiTitleBody = Schema.Struct({ excerpt: opt(Schema.String), model: opt(AiModelSelector) })
export const AiTitleReply = Schema.Struct({ title: Schema.String })
export const AiDesignAnalysisBody = Schema.Struct({ description: opt(Schema.String), layer: opt(Schema.String), machine: opt(Schema.String), model: opt(AiModelSelector) })
export const AiDesignAnalysisReply = Schema.Struct({ suggestions: Schema.Array(Schema.Struct({
  title: Schema.String, description: Schema.String, confidence: Schema.Number,
  priority: Schema.Literals(["low", "medium", "high"]), kind: Schema.Literals(["optimization", "warning", "critical"])
})) })
export const AiMachiningParametersBody = Schema.Struct({
  material: opt(Schema.String), tool: opt(Schema.String), operation: opt(Schema.String), machine: opt(Schema.String), model: opt(AiModelSelector)
})
export const AiMachiningParametersReply = Schema.Struct({
  cuttingSpeedMPerMin: Schema.Number, feedRateMmPerMin: Schema.Number, depthOfCutMm: Schema.Number, stepoverPct: Schema.Number,
  coolant: Schema.Literals(["flood", "mist", "none"]), engagement: Schema.Literals(["conventional", "climb"]), warnings: Schema.Array(Schema.String)
})
export const AiGcodeOptimizationBody = Schema.Struct({
  gcode: opt(Schema.String), material: opt(Schema.String), machineType: opt(Schema.String), constraints: opt(Schema.String), model: opt(AiModelSelector)
})
export const AiGcodeOptimizationReply = Schema.Struct({
  gcode: Schema.String,
  changes: Schema.Array(Schema.Struct({ line: Schema.Number, before: Schema.String, after: Schema.String, reason: Schema.String })),
  estimatedSavings: Schema.Struct({ timePct: Schema.Number, toolLifePct: Schema.Number, qualityNote: Schema.String }),
  notes: Schema.String
})
export const AiDesignSuggestionsBody = Schema.Struct({ elements: opt(Schema.String), currentOperation: opt(Schema.String), currentTool: opt(Schema.String), model: opt(AiModelSelector) })
export const AiDesignSuggestionsReply = Schema.Array(Schema.Struct({ title: Schema.String, rationale: Schema.String, nextStep: Schema.String }))
export const AnalyzeGcodeBody = Schema.Struct({ gcode: opt(Schema.String), model: opt(Schema.String) })
export const GcodeIssue = Schema.Struct({
  severity: Schema.Literals(["error", "warning", "info"]), code: Schema.String, line: Schema.Number, message: Schema.String
})
const Vec = Schema.Struct({ x: Schema.Number, y: Schema.Number, z: Schema.Number })
export const GcodeReport = Schema.Struct({
  issues: Schema.Array(GcodeIssue),
  stats: Schema.Struct({
    lines: Schema.Number, rapidMoves: Schema.Number, cutMoves: Schema.Number, toolChanges: Schema.Number,
    bounds: Schema.NullOr(Schema.Struct({ min: Vec, max: Vec }))
  })
})
export const GcodeActionBody = Schema.Struct({
  action: opt(Schema.String), gcode: opt(Schema.String), partialCode: opt(Schema.String), machineType: opt(Schema.String),
  material: opt(Schema.String), model: opt(Schema.String), options: opt(Schema.Unknown), description: opt(Schema.String),
  toolpathType: opt(Schema.String)
})
export const GcodeActionReply = Schema.Struct({
  success: Schema.Literal(true), action: Schema.String, data: Schema.Unknown, processedAt: Schema.String
})
export const ToolpathAnalysisBody = Schema.Struct({ gcode: opt(Schema.String), model: opt(Schema.String), max_tokens: opt(Schema.Number) })
export const ToolpathAnalysisReply = Schema.Struct({ insights: Schema.String })
export const FeedbackBody = Schema.Struct({ messageId: opt(Schema.String), rating: opt(Schema.String), comment: opt(Schema.String) })
export const FeedbackReply = Schema.Struct({ success: Schema.Literal(true), message: Schema.String })
export const ProxyBody = Schema.Struct({
  model: opt(Schema.String), messages: opt(Schema.Unknown), max_tokens: opt(Schema.Number), temperature: opt(Schema.Number),
  system: opt(Schema.Unknown), reasoning: opt(Schema.Unknown)
})
/** The Anthropic Messages shape the legacy client parser expects. */
export const AnthropicMessage = Schema.Struct({
  id: Schema.String, type: Schema.Literal("message"), role: Schema.Literal("assistant"), model: Schema.String,
  content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })),
  stop_reason: nullable, usage: Schema.Struct({ input_tokens: Schema.Number, output_tokens: Schema.Number })
})
export const SkillInfo = Schema.Struct({
  name: Schema.String, description: Schema.String, builtIn: Schema.Boolean, category: Schema.String
})
export const SkillList = Schema.Struct({ skills: Schema.Array(SkillInfo), max: Schema.Number })
/** Either `markdown` (a whole SKILL.md) or `name` + `description` + `body`. */
export const SkillBody = Schema.Struct({
  markdown: opt(Schema.String), name: opt(Schema.String), description: opt(Schema.String), body: opt(Schema.String)
})
export const SkillSaved = Schema.Struct({ skill: SkillInfo, skills: Schema.Array(SkillInfo), live: Schema.Boolean })
const skillParam = { name: Schema.String }
export const RemoveSessionBody = Schema.Struct({ sessionId: Schema.String, projectId: opt(Schema.String) })
/** A message written while the agent works: `queue` waits for the next safe step, `steer` goes in at once. */
export const QueueBody = Schema.Struct({
  sessionId: Schema.String, message: Schema.String, projectId: opt(Schema.String),
  delivery: opt(Schema.Literals(["queue", "steer"]))
})
export const SessionStateBody = Schema.Struct({ sessionId: Schema.String, projectId: opt(Schema.String) })
export const SessionTask = Schema.Struct({
  id: Schema.String, agent: Schema.String, description: Schema.String,
  status: Schema.Literals(["queued", "running", "completed", "error", "cancelled"]),
  background: Schema.Boolean, text: opt(Schema.String), error: opt(Schema.String),
  createdAt: opt(Schema.Number), startedAt: opt(Schema.Number), finishedAt: opt(Schema.Number)
})
/** Stored tool evidence for reconnecting clients; replay never executes tools. */
export const AiRecoveryEvent = Schema.Union([
  ToolCallEvent, ToolResultEvent, TodoEvent, ToolDiagnosticEvent
])
export const SessionStateReply = Schema.Struct({ busy: Schema.Boolean, text: Schema.String, error: opt(Schema.String), tasks: opt(Schema.Array(SessionTask)),
  events: opt(Schema.Array(AiRecoveryEvent)), usage: opt(UsageSchema) })
export const RemoveSessionReply = Schema.Struct({ removed: Schema.Boolean })
export const AssistantAgent = Schema.Struct({ id: Schema.String, title: Schema.String, description: Schema.String, tools: Schema.Array(Schema.String), edits: Schema.Boolean })
export const QuestionInfo = Schema.Struct({ header: Schema.String, question: Schema.String, options: Schema.Array(Schema.Struct({ label: Schema.String, description: Schema.String })), multiple: opt(Schema.Boolean), custom: opt(Schema.Boolean) })
export const PendingQuestion = Schema.Struct({ requestId: Schema.String, questions: Schema.Array(QuestionInfo) })
export const SessionControlBody = Schema.Struct({ sessionId: Schema.String, projectId: opt(Schema.String),
  action: Schema.Literals(["status", "compact", "cancel_task", "answer_question", "reject_question", "reply_permission", "consolidate_memory", "context"]),
  taskId: opt(Schema.String), requestId: opt(Schema.String), answers: opt(Schema.Array(Schema.Array(Schema.String))), decision: opt(Schema.Literals(["once", "always", "reject"])), model: opt(AiModelSelector) })
/** nikcli's session goal (`/goal`): what the agent works toward on its own, and how far it is. */
export const SessionGoal = Schema.Struct({
  objective: Schema.String,
  status: Schema.Literals(["active", "paused", "blocked", "usage_limited", "budget_limited", "complete"]),
  iteration: Schema.Number, tokensUsed: Schema.Number, tokenBudget: opt(Schema.Number)
})
export const SessionControlReply = Schema.Struct({ goal: opt(Schema.NullOr(SessionGoal)), permissions: opt(Schema.Array(Schema.Struct({ requestId: Schema.String, sessionId: Schema.String, permission: Schema.String, patterns: Schema.Array(Schema.String) }))), busy: Schema.Boolean, text: Schema.String, tasks: Schema.Array(SessionTask), questions: Schema.Array(PendingQuestion),
  context: Schema.Struct({ memory: Schema.optional(Schema.Struct({ enabled: Schema.Boolean, memoryEnabled: Schema.Boolean, minHours: Schema.Number, minSessions: Schema.Number, lastBrainAt: Schema.Number, hoursSinceLastBrain: Schema.Number, sessionsSinceLastBrain: Schema.Number, shouldTrigger: Schema.Boolean })), source: Schema.Literal("host-config"), auto: Schema.Boolean, prune: Schema.Boolean, reserved: opt(Schema.Number),
    provider: opt(Schema.String), model: opt(Schema.String), contextWindow: opt(Schema.Number), maxOutput: opt(Schema.Number), inputWindow: opt(Schema.Number), requestOutput: opt(Schema.Number), compactAt: opt(Schema.Number), tokens: opt(Schema.Number), compacted: Schema.Boolean,
    /** nikcli `SessionContext.breakdown` summed per category; only on the `context` action. */
    breakdown: opt(Schema.Struct({ estimatedTotal: Schema.Number, categories: Schema.Array(Schema.Struct({ category: Schema.String, tokens: Schema.Number })) })) }) })
/** RM-11: the action catalogue as a standalone nikcli sees it (`packages/ai/src/actions/bridge.ts`). */
export const BridgeAction = Schema.Struct({ id: Schema.String, name: Schema.String, kind: Schema.Literals(["read", "write", "destructive"]) })
export const BridgeTool = Schema.Struct({
  id: Schema.String, description: Schema.String, kind: Schema.Literals(["read", "write", "destructive"]),
  actions: Schema.Array(BridgeAction),
  /** JSON Schema of the tool's arguments: a union over its actions, discriminated by `action`. */
  parameters: Schema.Record(Schema.String, Schema.Unknown)
})
export const BridgeTools = Schema.Struct({ tools: Schema.Array(BridgeTool) })
export const BridgeInvokeBody = Schema.Struct({ projectId: Schema.String, drawingId: opt(Schema.String), tool: Schema.String, input: Schema.Record(Schema.String, Schema.Unknown) })
export const BridgeInvokeReply = Schema.Struct({ tool: Schema.String, action: Schema.String, result: Schema.Unknown })
/** RM-11: scoped, revocable tokens for a standalone nikcli (one project, read-only or read-write). Issued with the application's own token. */
export const BridgeMode = Schema.Literals(["read", "write"])
export const BridgeTokenInfo = Schema.Struct({ id: Schema.String, name: Schema.String, projectId: Schema.String, mode: BridgeMode, userId: Schema.String, createdAt: Schema.String, expiresAt: Schema.String })
export const BridgeTokenBody = Schema.Struct({ name: opt(Schema.String), projectId: Schema.String, mode: BridgeMode, days: opt(Schema.Number) })
/** `token` is shown once; only its id is kept. */
export const BridgeTokenIssued = Schema.Struct({ info: BridgeTokenInfo, token: Schema.String })
const bridgeTokenParam = { id: Schema.String }
const message = Schema.Struct({ message: Schema.String })
const providerParam = { provider: Schema.String }
const chatEvents = Schema.Union([AiStreamEventSchema, Schema.Struct({ type: Schema.Literal("heartbeat") })])

export class AiGroup extends HttpApiGroup.make("ai")
  .add(
    HttpApiEndpoint.get("actions", "/api/ai/actions", { success: BridgeTools, error: [InternalError] }),
    HttpApiEndpoint.post("invokeAction", "/api/ai/actions/invoke", { payload: BridgeInvokeBody, success: BridgeInvokeReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("issueBridgeToken", "/api/ai/bridge/tokens", { payload: BridgeTokenBody, success: BridgeTokenIssued, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.get("bridgeTokens", "/api/ai/bridge/tokens", { success: Schema.Array(BridgeTokenInfo), error: [InternalError] }),
    HttpApiEndpoint.delete("revokeBridgeToken", "/api/ai/bridge/tokens/:id", { params: bridgeTokenParam, success: message, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.get("agents", "/api/ai/agents", { success: Schema.Array(AssistantAgent), error: [InternalError] }),
    HttpApiEndpoint.post("sessionControl", "/api/ai/sessions/control", { payload: SessionControlBody, success: SessionControlReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("sessionState", "/api/ai/sessions/state", { payload: SessionStateBody, success: SessionStateReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("removeSession", "/api/ai/sessions/remove", { payload: RemoveSessionBody, success: RemoveSessionReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.get("skills", "/api/ai/skills", { success: SkillList, error: [InternalError] }),
    HttpApiEndpoint.put("saveSkill", "/api/ai/skills", { payload: SkillBody, success: SkillSaved, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.delete("deleteSkill", "/api/ai/skills/:name", { params: skillParam, success: SkillList, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.put("setCredentials", "/api/ai/credentials", { payload: CredentialBody, success: AiStatus, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.delete("clearCredentials", "/api/ai/credentials/:provider", { params: providerParam, success: AiStatus, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.get("status", "/api/ai/status", { success: AiStatus, error: InternalError }),
    HttpApiEndpoint.get("models", "/api/ai/models", { query: { configuredOnly: opt(Schema.Literals(["true", "false"])) }, success: Schema.Array(AiModelEntry), error: InternalError }),
    HttpApiEndpoint.get("providers", "/api/ai/providers", { success: Schema.Array(AiProviderEntry), error: InternalError }),
    HttpApiEndpoint.get("prompts", "/api/ai/prompts", { query: { mode: opt(Schema.String) }, success: PromptSuggestionsReply, error: InternalError }),
    HttpApiEndpoint.post("title", "/api/ai/title", { payload: AiTitleBody, success: AiTitleReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("designAnalysis", "/api/ai/design-analysis", { payload: AiDesignAnalysisBody, success: AiDesignAnalysisReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("machiningParameters", "/api/ai/machining-parameters", { payload: AiMachiningParametersBody, success: AiMachiningParametersReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("gcodeOptimization", "/api/ai/gcode-optimization", { payload: AiGcodeOptimizationBody, success: AiGcodeOptimizationReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("designSuggestions", "/api/ai/design-suggestions", { payload: AiDesignSuggestionsBody, success: AiDesignSuggestionsReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("chat", "/api/ai/chat", { payload: LegacyChatBody, success: LegacyChatReply, error: [AiBadRequest, AiNotFound, AiFailure] }),
    HttpApiEndpoint.post("chatStream", "/api/ai/chat/stream", {
      payload: StreamChatBody, success: HttpApiSchema.StreamSse({ data: chatEvents }), error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.post("chatQueue", "/api/ai/chat/queue", { payload: QueueBody, success: message, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("chatAbort", "/api/ai/chat/abort", { payload: AbortBody, success: message, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("permissionReply", "/api/ai/permission/reply", { payload: PermissionReplyBody, success: message, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("completion", "/api/ai/completion", { payload: CompletionBody, success: CompletionReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("analyzeGcode", "/api/ai/analyze-gcode", { payload: AnalyzeGcodeBody, success: GcodeReport, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("gcode", "/api/ai/gcode", { payload: GcodeActionBody, success: GcodeActionReply, error: [GcodeActionError, GcodeActionFailure] }),
    HttpApiEndpoint.post("toolpathAnalysis", "/api/ai/toolpath-analysis", { payload: ToolpathAnalysisBody, success: ToolpathAnalysisReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("feedback", "/api/ai/feedback", { payload: FeedbackBody, success: FeedbackReply, error: [AiBadRequest, AiFailure] }),
    HttpApiEndpoint.post("proxy", "/api/ai/proxy", { payload: ProxyBody, success: AnthropicMessage, error: InternalError })
  )
{}
