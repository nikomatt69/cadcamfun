import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { BadRequest, InternalError, NotFound } from "../errors.ts"

const opt = Schema.optional
const nullable = Schema.NullOr(Schema.String)
export const AiProviderId = Schema.Literals(["anthropic", "openai", "minimax", "gateway"])
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
  host: Schema.Literals(["nikcli", "direct"])
})
export const AiModelEntry = Schema.Struct({
  id: Schema.String, provider: AiProviderId, tier: AiTier, contextWindow: Schema.Number,
  tools: Schema.Boolean, vision: Schema.Boolean, configured: Schema.Boolean
})

export const ChatMessage = Schema.Struct({ role: Schema.String, content: Schema.Unknown })
export const LegacyChatBody = Schema.Struct({
  messages: opt(Schema.Unknown), mcpServerId: opt(Schema.String), mcpReference: opt(Schema.String)
})
export const LegacyChatReply = Schema.Struct({ reply: Schema.String, hasMcpData: Schema.Boolean })
export const StreamChatBody = Schema.Struct({
  message: opt(Schema.String), sessionId: opt(Schema.String), projectId: opt(Schema.String),
  context: opt(Schema.String), model: opt(AiModelSelector)
})
export const AbortBody = Schema.Struct({ sessionId: opt(Schema.String) })

export const CompletionBody = Schema.Struct({
  prompt: opt(Schema.String), systemPrompt: opt(Schema.String), model: opt(Schema.String), temperature: opt(Schema.Number)
})
export const CompletionReply = Schema.Struct({ text: Schema.String, model: Schema.String })
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
const message = Schema.Struct({ message: Schema.String })
const providerParam = { provider: Schema.String }
const chatEvents = Schema.Unknown

export class AiGroup extends HttpApiGroup.make("ai")
  .add(
    HttpApiEndpoint.put("setCredentials", "/api/ai/credentials", { payload: CredentialBody, success: AiStatus, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.delete("clearCredentials", "/api/ai/credentials/:provider", { params: providerParam, success: AiStatus, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.get("status", "/api/ai/status", { success: AiStatus, error: InternalError }),
    HttpApiEndpoint.get("models", "/api/ai/models", { success: Schema.Array(AiModelEntry), error: InternalError }),
    HttpApiEndpoint.post("chat", "/api/ai/chat", { payload: LegacyChatBody, success: LegacyChatReply, error: [AiBadRequest, AiNotFound, AiFailure] }),
    HttpApiEndpoint.post("chatStream", "/api/ai/chat/stream", {
      payload: StreamChatBody, success: HttpApiSchema.StreamSse({ data: chatEvents }), error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.post("chatAbort", "/api/ai/chat/abort", { payload: AbortBody, success: message, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("completion", "/api/ai/completion", { payload: CompletionBody, success: CompletionReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("analyzeGcode", "/api/ai/analyze-gcode", { payload: AnalyzeGcodeBody, success: GcodeReport, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("gcode", "/api/ai/gcode", { payload: GcodeActionBody, success: GcodeActionReply, error: [GcodeActionError, GcodeActionFailure] }),
    HttpApiEndpoint.post("toolpathAnalysis", "/api/ai/toolpath-analysis", { payload: ToolpathAnalysisBody, success: ToolpathAnalysisReply, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.post("feedback", "/api/ai/feedback", { payload: FeedbackBody, success: FeedbackReply, error: [AiBadRequest, AiFailure] }),
    HttpApiEndpoint.post("proxy", "/api/ai/proxy", { payload: ProxyBody, success: AnthropicMessage, error: InternalError })
  )
{}
