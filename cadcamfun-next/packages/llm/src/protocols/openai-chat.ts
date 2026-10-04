import { Array as Arr, Effect, Schema } from "effect"
import { Route } from "../route/client"
import { Auth } from "../route/auth"
import { Endpoint } from "../route/endpoint"
import { Framing } from "../route/framing"
import { HttpTransport } from "../route/transport"
import { Protocol } from "../route/protocol"
import {
  Usage,
  type CacheHint,
  type FinishReason,
  type LLMEvent,
  type LLMRequest,
  type MediaPart,
  type TextPart,
  type ToolCallPart,
  type ToolDefinition,
} from "../schema"
import { isRecord, JsonObject, optionalArray, optionalNull, ProviderShared } from "./shared"
import { OpenAIOptions } from "./utils/openai-options"
import { ToolStream } from "./utils/tool-stream"

const ADAPTER = "openai-chat"
export const DEFAULT_BASE_URL = "https://api.openai.com/v1"
export const PATH = "/chat/completions"

// =============================================================================
// Request Body Schema
// =============================================================================
// The body schema is the provider-native JSON body. `fromRequest` below builds
// this shape from the common `LLMRequest`, then `Route.make` validates and
// JSON-encodes it before transport.
const OpenAIChatFunction = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  parameters: JsonObject,
})

const OpenAIChatCacheControl = Schema.Struct({
  type: Schema.Literal("ephemeral"),
  ttl: Schema.optional(Schema.String),
})

const OpenAIChatTool = Schema.Struct({
  type: Schema.tag("function"),
  function: OpenAIChatFunction,
  cache_control: Schema.optional(OpenAIChatCacheControl),
})
type OpenAIChatTool = Schema.Schema.Type<typeof OpenAIChatTool>

const OpenAIChatAssistantToolCall = Schema.Struct({
  id: Schema.String,
  type: Schema.tag("function"),
  function: Schema.Struct({
    name: Schema.String,
    arguments: Schema.String,
  }),
})
type OpenAIChatAssistantToolCall = Schema.Schema.Type<typeof OpenAIChatAssistantToolCall>

const OpenAIChatUserContentPart = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("text"),
    text: Schema.String,
    cache_control: Schema.optional(OpenAIChatCacheControl),
  }),
  Schema.Struct({
    type: Schema.Literal("image_url"),
    image_url: Schema.Struct({ url: Schema.String }),
  }),
  Schema.Struct({
    type: Schema.Literal("file"),
    file: Schema.Struct({ filename: Schema.optional(Schema.String), file_data: Schema.String }),
  }),
])
type OpenAIChatUserContentPart = Schema.Schema.Type<typeof OpenAIChatUserContentPart>

const OpenAIChatMessage = Schema.Union([
  Schema.Struct({
    role: Schema.Literal("system"),
    content: Schema.Union([
      Schema.String,
      Schema.Array(
        Schema.Struct({
          type: Schema.Literal("text"),
          text: Schema.String,
          cache_control: Schema.optional(OpenAIChatCacheControl),
        }),
      ),
    ]),
  }),
  Schema.Struct({
    role: Schema.Literal("user"),
    content: Schema.Union([Schema.String, Schema.Array(OpenAIChatUserContentPart)]),
  }),
  Schema.Struct({
    role: Schema.Literal("assistant"),
    content: Schema.NullOr(Schema.String),
    tool_calls: optionalArray(OpenAIChatAssistantToolCall),
    reasoning_content: Schema.optional(Schema.String),
    cache_control: Schema.optional(OpenAIChatCacheControl),
  }),
  Schema.Struct({
    role: Schema.Literal("tool"),
    tool_call_id: Schema.String,
    content: Schema.String,
    cache_control: Schema.optional(OpenAIChatCacheControl),
  }),
]).pipe(Schema.toTaggedUnion("role"))
type OpenAIChatMessage = Schema.Schema.Type<typeof OpenAIChatMessage>

const OpenAIChatToolChoice = Schema.Union([
  Schema.Literals(["auto", "none", "required"]),
  Schema.Struct({
    type: Schema.tag("function"),
    function: Schema.Struct({ name: Schema.String }),
  }),
])

export const bodyFields = {
  model: Schema.String,
  messages: Schema.Array(OpenAIChatMessage),
  tools: optionalArray(OpenAIChatTool),
  tool_choice: Schema.optional(OpenAIChatToolChoice),
  stream: Schema.Literal(true),
  stream_options: Schema.optional(Schema.Struct({ include_usage: Schema.Boolean })),
  store: Schema.optional(Schema.Boolean),
  reasoning_effort: Schema.optional(OpenAIOptions.OpenAIReasoningEffort),
  max_completion_tokens: Schema.optional(Schema.Number),
  max_tokens: Schema.optional(Schema.Number),
  temperature: Schema.optional(Schema.Number),
  top_p: Schema.optional(Schema.Number),
  frequency_penalty: Schema.optional(Schema.Number),
  presence_penalty: Schema.optional(Schema.Number),
  seed: Schema.optional(Schema.Number),
  stop: optionalArray(Schema.String),
}
const OpenAIChatBody = Schema.Struct(bodyFields)
export type OpenAIChatBody = Schema.Schema.Type<typeof OpenAIChatBody>

// =============================================================================
// Streaming Event Schema
// =============================================================================
// The event schema is one decoded SSE `data:` payload. `Framing.sse` splits the
// byte stream into strings, then `Protocol.jsonEvent` decodes each string into
// this provider-native event shape.
const OpenAIChatUsage = Schema.Struct({
  prompt_tokens: Schema.optional(Schema.Number),
  completion_tokens: Schema.optional(Schema.Number),
  total_tokens: Schema.optional(Schema.Number),
  prompt_tokens_details: optionalNull(
    Schema.Struct({
      cached_tokens: Schema.optional(Schema.Number),
      // GPT-5.6 and later bill cache writes at 1.25x uncached input. Dropping
      // this field makes every write look free and overstates fresh input.
      cache_write_tokens: Schema.optional(Schema.Number),
    }),
  ),
  completion_tokens_details: optionalNull(
    Schema.Struct({
      reasoning_tokens: Schema.optional(Schema.Number),
    }),
  ),
})

const OpenAIChatToolCallDeltaFunction = Schema.Struct({
  name: optionalNull(Schema.String),
  arguments: optionalNull(Schema.String),
})

const OpenAIChatToolCallDelta = Schema.Struct({
  index: Schema.Number,
  id: optionalNull(Schema.String),
  function: optionalNull(OpenAIChatToolCallDeltaFunction),
})
type OpenAIChatToolCallDelta = Schema.Schema.Type<typeof OpenAIChatToolCallDelta>

const OpenAIChatDelta = Schema.Struct({
  content: optionalNull(Schema.String),
  tool_calls: optionalNull(Schema.Array(OpenAIChatToolCallDelta)),
})

const OpenAIChatChoice = Schema.Struct({
  delta: optionalNull(OpenAIChatDelta),
  finish_reason: optionalNull(Schema.String),
})

export const OpenAIChatEvent = Schema.Struct({
  choices: Schema.Array(OpenAIChatChoice),
  usage: optionalNull(OpenAIChatUsage),
})
export type OpenAIChatEvent = Schema.Schema.Type<typeof OpenAIChatEvent>
type OpenAIChatRequestMessage = LLMRequest["messages"][number]

interface ParserState {
  readonly tools: ToolStream.State<number>
  readonly toolCallEvents: ReadonlyArray<LLMEvent>
  readonly usage?: Usage
  readonly finishReason?: FinishReason
  readonly rawFinishReason?: string
}

const invalid = ProviderShared.invalidRequest

interface LoweringOptions {
  readonly cacheControl?: (
    cache: CacheHint | undefined,
  ) => Schema.Schema.Type<typeof OpenAIChatCacheControl> | undefined
}

// =============================================================================
// Request Lowering
// =============================================================================
// Lowering is the only place that knows how common LLM messages map onto the
// OpenAI Chat wire format. Keep provider quirks here instead of leaking native
// fields into `LLMRequest`.
const lowerTool = (tool: ToolDefinition, options: LoweringOptions): OpenAIChatTool => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  },
  cache_control: options.cacheControl?.(tool.cache),
})

const lowerToolChoice = (toolChoice: NonNullable<LLMRequest["toolChoice"]>) =>
  ProviderShared.matchToolChoice("OpenAI Chat", toolChoice, {
    auto: () => "auto" as const,
    none: () => "none" as const,
    required: () => "required" as const,
    tool: (name) => ({ type: "function" as const, function: { name } }),
  })

const lowerToolCall = (part: ToolCallPart): OpenAIChatAssistantToolCall => ({
  id: part.id,
  type: "function",
  function: {
    name: part.name,
    arguments: ProviderShared.encodeJson(part.input),
  },
})

const openAICompatibleReasoningContent = (native: unknown) =>
  isRecord(native) && typeof native.reasoning_content === "string" ? native.reasoning_content : undefined

// Images ride as data URLs; documents as `file` parts. Other media (audio, video) have no Chat Completions
// user-message shape here, so they are refused at the protocol boundary.
const lowerMedia = Effect.fn("OpenAIChat.lowerMedia")(function* (part: MediaPart) {
  const url = `data:${part.mediaType};base64,${ProviderShared.mediaBytes(part)}`
  if (part.mediaType.startsWith("image/")) return { type: "image_url" as const, image_url: { url } }
  if (part.mediaType === "application/pdf")
    return { type: "file" as const, file: { filename: part.filename, file_data: url } }
  return yield* ProviderShared.invalidRequest(`OpenAI Chat does not support ${part.mediaType} user media`)
})

const lowerUserMessage = Effect.fn("OpenAIChat.lowerUserMessage")(function* (
  message: OpenAIChatRequestMessage,
  options: LoweringOptions,
) {
  const content: OpenAIChatUserContentPart[] = []
  for (const part of message.content) {
    if (!ProviderShared.supportsContent(part, ["text", "media"]))
      return yield* ProviderShared.unsupportedContent("OpenAI Chat", "user", ["text", "media"])
    if (part.type === "media") {
      content.push(yield* lowerMedia(part))
      continue
    }
    content.push({ type: "text", text: part.text, cache_control: options.cacheControl?.(part.cache) })
  }
  if (content.every((part) => part.type === "text" && part.cache_control === undefined))
    return {
      role: "user" as const,
      content: content.map((part) => (part.type === "text" ? part.text : "")).join("\n"),
    }
  return { role: "user" as const, content }
})

const lowerAssistantMessage = Effect.fn("OpenAIChat.lowerAssistantMessage")(function* (
  message: OpenAIChatRequestMessage,
  options: LoweringOptions,
) {
  const content: TextPart[] = []
  const toolCalls: OpenAIChatAssistantToolCall[] = []
  for (const part of message.content) {
    // Chat Completions has no reasoning input item; replay rides `native.openaiCompatible.reasoning_content`.
    if (part.type === "reasoning") continue
    if (!ProviderShared.supportsContent(part, ["text", "tool-call"]))
      return yield* ProviderShared.unsupportedContent("OpenAI Chat", "assistant", ["text", "tool-call"])
    if (part.type === "text") {
      content.push(part)
      continue
    }
    if (part.type === "tool-call") {
      toolCalls.push(lowerToolCall(part))
      continue
    }
  }
  const cached = message.content.findLast((part) => "cache" in part && part.cache !== undefined)
  return {
    role: "assistant" as const,
    content: content.length === 0 ? null : ProviderShared.joinText(content),
    tool_calls: toolCalls.length === 0 ? undefined : toolCalls,
    reasoning_content: openAICompatibleReasoningContent(message.native?.openaiCompatible),
    cache_control: options.cacheControl?.(cached && "cache" in cached ? cached.cache : undefined),
  }
})

const lowerToolMessages = Effect.fn("OpenAIChat.lowerToolMessages")(function* (
  message: OpenAIChatRequestMessage,
  options: LoweringOptions,
) {
  const messages: OpenAIChatMessage[] = []
  for (const part of message.content) {
    if (!ProviderShared.supportsContent(part, ["tool-result"]))
      return yield* ProviderShared.unsupportedContent("OpenAI Chat", "tool", ["tool-result"])
    messages.push({
      role: "tool",
      tool_call_id: part.id,
      content: ProviderShared.toolResultText(part),
      cache_control: options.cacheControl?.(part.cache),
    })
  }
  return messages
})

const lowerMessage = Effect.fn("OpenAIChat.lowerMessage")(function* (
  message: OpenAIChatRequestMessage,
  options: LoweringOptions,
) {
  if (message.role === "user") return [yield* lowerUserMessage(message, options)]
  if (message.role === "assistant") return [yield* lowerAssistantMessage(message, options)]
  return yield* lowerToolMessages(message, options)
})

const lowerMessages = Effect.fn("OpenAIChat.lowerMessages")(function* (request: LLMRequest, options: LoweringOptions) {
  const system: OpenAIChatMessage[] =
    request.system.length === 0
      ? []
      : request.system.some((part) => part.cache !== undefined) && options.cacheControl
        ? [
            {
              role: "system",
              content: request.system.map((part) => ({
                type: "text" as const,
                text: part.text,
                cache_control: options.cacheControl?.(part.cache),
              })),
            },
          ]
        : [{ role: "system", content: ProviderShared.joinText(request.system) }]
  return [
    ...system,
    ...Arr.flatten(yield* Effect.forEach(request.messages, (message) => lowerMessage(message, options))),
  ]
})

const lowerOptions = Effect.fn("OpenAIChat.lowerOptions")(function* (request: LLMRequest) {
  const store = OpenAIOptions.store(request)
  const reasoningEffort = OpenAIOptions.reasoningEffort(request)
  if (reasoningEffort && !OpenAIOptions.isReasoningEffort(reasoningEffort))
    return yield* invalid(`OpenAI Chat does not support reasoning effort ${reasoningEffort}`)
  return {
    ...(store !== undefined ? { store } : {}),
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  }
})

export const fromRequest = Effect.fn("OpenAIChat.fromRequest")(function* (
  request: LLMRequest,
  options: LoweringOptions = {},
) {
  // `fromRequest` returns the provider body only. Endpoint, auth, framing,
  // validation, and HTTP execution are composed by `Route.make`.
  const generation = request.generation
  return {
    model: request.model.id,
    messages: yield* lowerMessages(request, options),
    tools: request.tools.length === 0 ? undefined : request.tools.map((tool) => lowerTool(tool, options)),
    tool_choice: request.toolChoice ? yield* lowerToolChoice(request.toolChoice) : undefined,
    stream: true as const,
    stream_options: { include_usage: true },
    ...(request.model.compatibility?.maxTokensField === "max_completion_tokens"
      ? { max_completion_tokens: generation?.maxTokens }
      : { max_tokens: generation?.maxTokens }),
    temperature: generation?.temperature,
    top_p: generation?.topP,
    frequency_penalty: generation?.frequencyPenalty,
    presence_penalty: generation?.presencePenalty,
    seed: generation?.seed,
    stop: generation?.stop,
    ...(yield* lowerOptions(request)),
  }
})

// =============================================================================
// Stream Parsing
// =============================================================================
// Streaming parsers are small state machines: every event returns a new state
// plus the common `LLMEvent`s produced by that event. Tool calls are accumulated
// because OpenAI streams JSON arguments across multiple deltas.
const mapFinishReason = (reason: string | null | undefined): FinishReason => {
  if (reason === "stop") return "stop"
  if (reason === "length") return "length"
  if (reason === "content_filter") return "content-filter"
  if (reason === "function_call" || reason === "tool_calls") return "tool-calls"
  return "unknown"
}

const mapUsage = (usage: OpenAIChatEvent["usage"]): Usage | undefined => {
  if (!usage) return undefined
  return new Usage({
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
    cacheReadInputTokens: usage.prompt_tokens_details?.cached_tokens,
    cacheWriteInputTokens: usage.prompt_tokens_details?.cache_write_tokens,
    totalTokens: ProviderShared.totalTokens(usage.prompt_tokens, usage.completion_tokens, usage.total_tokens),
    native: usage,
  })
}

const step = (state: ParserState, event: OpenAIChatEvent) =>
  Effect.gen(function* () {
    const events: LLMEvent[] = []
    const usage = mapUsage(event.usage) ?? state.usage
    const choice = event.choices[0]
    const finishReason = choice?.finish_reason ? mapFinishReason(choice.finish_reason) : state.finishReason
    const rawFinishReason = choice?.finish_reason ?? state.rawFinishReason
    const delta = choice?.delta
    const toolDeltas = delta?.tool_calls ?? []
    let tools = state.tools

    if (delta?.content) events.push({ type: "text-delta", text: delta.content })

    for (const tool of toolDeltas) {
      const result = ToolStream.appendOrStart(
        ADAPTER,
        tools,
        tool.index,
        { id: tool.id ?? undefined, name: tool.function?.name ?? undefined, text: tool.function?.arguments ?? "" },
        "OpenAI Chat tool call delta is missing id or name",
      )
      if (ToolStream.isError(result)) return yield* result
      tools = result.tools
      if (result.event) events.push(result.event)
    }

    // Finalize accumulated tool inputs eagerly when finish_reason arrives so
    // JSON parse failures fail the stream at the boundary rather than at halt.
    const finished =
      finishReason !== undefined && state.finishReason === undefined && Object.keys(tools).length > 0
        ? yield* ToolStream.finishAll(ADAPTER, tools)
        : undefined

    return [
      {
        tools: finished?.tools ?? tools,
        toolCallEvents: finished?.events ?? state.toolCallEvents,
        usage,
        finishReason,
        rawFinishReason,
      },
      events,
    ] as const
  })

const finishEvents = (state: ParserState): ReadonlyArray<LLMEvent> => {
  const hasToolCalls = state.toolCallEvents.length > 0
  const reason = state.finishReason === "stop" && hasToolCalls ? "tool-calls" : state.finishReason
  return [
    ...state.toolCallEvents,
    ...(reason
      ? ([
          {
            type: "request-finish",
            reason,
            ...(state.rawFinishReason ? { rawReason: state.rawFinishReason } : {}),
            usage: state.usage,
          },
        ] satisfies ReadonlyArray<LLMEvent>)
      : []),
  ]
}

// =============================================================================
// Protocol And OpenAI Route
// =============================================================================
/**
 * The OpenAI Chat protocol — request body construction, body schema, and the
 * streaming-event state machine. Reused by every route that speaks OpenAI Chat
 * over HTTP+SSE: native OpenAI, DeepSeek, TogetherAI, Cerebras, Baseten,
 * Fireworks, DeepInfra, and (once added) Azure OpenAI Chat.
 */
export const protocol = Protocol.make({
  id: ADAPTER,
  body: {
    schema: OpenAIChatBody,
    from: fromRequest,
  },
  stream: {
    event: Protocol.jsonEvent(OpenAIChatEvent),
    initial: () => ({ tools: ToolStream.empty<number>(), toolCallEvents: [] }),
    step,
    onHalt: finishEvents,
  },
})

const encodeBody = Schema.encodeSync(Schema.fromJsonString(OpenAIChatBody))

export const httpTransport = HttpTransport.httpJson({
  endpoint: Endpoint.path(PATH),
  auth: Auth.bearer(),
  framing: Framing.sse,
  encodeBody,
})

export const route = Route.make({
  id: ADAPTER,
  provider: "openai",
  protocol,
  transport: httpTransport,
  defaults: {
    baseURL: DEFAULT_BASE_URL,
  },
})

// =============================================================================
// Model Helper
// =============================================================================
export const model = route.model

export * as OpenAIChat from "./openai-chat"
