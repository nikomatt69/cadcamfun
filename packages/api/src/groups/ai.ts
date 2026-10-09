import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { BadRequest, InternalError, NotFound } from "../errors.ts"

const opt = Schema.optional
const nullable = Schema.NullOr(Schema.String)
/**
 * Any provider the embedded host knows (models.dev merged with `nikcli.json`):
 * not a closed union, because the user picks the provider in the settings.
 */
export const AiProviderId = Schema.String
export const AiTier = Schema.Literals(["fast", "balanced", "best"])
export const AiModelSelector = Schema.Struct({ provider: opt(AiProviderId), model: opt(Schema.String), tier: opt(AiTier) })

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
  attachments: opt(Schema.Array(ChatAttachment)),
  message: opt(Schema.String), sessionId: opt(Schema.String), projectId: opt(Schema.String),
  context: opt(Schema.String), model: opt(AiModelSelector)
})
export const AbortBody = Schema.Struct({ sessionId: opt(Schema.String) })
export const PermissionReplyBody = Schema.Struct({ sessionId: Schema.String, requestId: Schema.String, decision: Schema.Literals(["once", "always", "reject"]) })

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
  background: Schema.Boolean, text: opt(Schema.String), error: opt(Schema.String)
})
export const SessionStateReply = Schema.Struct({ busy: Schema.Boolean, text: Schema.String, error: opt(Schema.String), tasks: opt(Schema.Array(SessionTask)) })
export const RemoveSessionReply = Schema.Struct({ removed: Schema.Boolean })
const message = Schema.Struct({ message: Schema.String })
const providerParam = { provider: Schema.String }
const chatEvents = Schema.Unknown

export class AiGroup extends HttpApiGroup.make("ai")
  .add(
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
