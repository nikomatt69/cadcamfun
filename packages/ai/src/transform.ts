/**
 * Provider transforms for the one-shot AI SDK path, the same set nikcli applies
 * before every model call (`packages/nikcli/src/provider/transform.ts`): message
 * normalisation per provider, prompt-cache breakpoints, sampling defaults,
 * reasoning-effort variants, provider option keys, output limits and tool-schema
 * sanitising. The embedded host applies its own copy to agent turns; this one
 * keeps `DirectModel` (titles, summaries, structured output) on equal terms.
 *
 * Pure functions over a {@link TransformModel}: no I/O, no AI SDK client.
 */
import type { ModelMessage } from "ai"
import type { ResolvedModel } from "./models.ts"

type Modality = "image" | "audio" | "video" | "pdf"
type Json = Record<string, any>

/** What a transform needs to know about a model; mirrors nikcli's `Provider.Model`. */
export interface TransformModel {
  readonly providerID: string
  readonly id: string
  readonly api: { readonly id: string; readonly npm: string }
  readonly capabilities: {
    readonly reasoning: boolean
    /** `{ field }`: the provider wants reasoning sent back as a message field (e.g. `reasoning_content`). */
    readonly interleaved?: boolean | { readonly field: string }
    readonly input?: Partial<Record<Modality, boolean>>
  }
  readonly limit: { readonly output: number }
  /** ISO date (`2025-12-04`); gates effort tiers newer than the model. */
  readonly releaseDate?: string
}

export const OUTPUT_TOKEN_MAX = 32_000

const NPM = {
  anthropic: "@ai-sdk/anthropic",
  vertexAnthropic: "@ai-sdk/google-vertex/anthropic",
  openai: "@ai-sdk/openai",
  compatible: "@ai-sdk/openai-compatible",
  gateway: "@ai-sdk/gateway",
  google: "@ai-sdk/google",
  vertex: "@ai-sdk/google-vertex",
  bedrock: "@ai-sdk/amazon-bedrock",
  azure: "@ai-sdk/azure",
  copilot: "@ai-sdk/github-copilot",
  openrouter: "@openrouter/ai-sdk-provider",
  xai: "@ai-sdk/xai",
  mistral: "@ai-sdk/mistral",
  groq: "@ai-sdk/groq",
  alibaba: "@ai-sdk/alibaba"
} as const

const REASONING_HINTS = [/claude-(?:opus|sonnet)-[4-9]/, /claude-3-7/, /claude-haiku-4/, /(^|\/)o[1-9]/, /gpt-5/, /gpt-6/, /gpt-reserve/, /gemini-(?:2\.5|3)/, /grok-(?:3-mini|4)/, /deepseek-r1/, /minimax-m/]

/** Builds the transform view of a model the one-shot path resolved. */
export const transformModelFor = (resolved: ResolvedModel, overrides: Partial<TransformModel> = {}): TransformModel => {
  const modelId = resolved.modelId
  const lower = modelId.toLowerCase()
  const npm =
    resolved.provider === "anthropic"
      ? NPM.anthropic
      : resolved.provider === "openai"
        ? NPM.openai
        : resolved.provider === "gateway"
          ? NPM.gateway
          : NPM.compatible
  const claude = lower.includes("claude")
  return {
    providerID: resolved.provider,
    id: modelId,
    api: { id: modelId, npm },
    capabilities: {
      reasoning: REASONING_HINTS.some((hint) => hint.test(lower)),
      input: { image: claude || /gpt-[456]|gemini|o[1-9]/.test(lower), pdf: claude || /gemini/.test(lower), audio: /gemini/.test(lower), video: /gemini/.test(lower) }
    },
    limit: { output: claude ? 64_000 : OUTPUT_TOKEN_MAX },
    ...overrides
  }
}

// ── strings ────────────────────────────────────────────────────────────────

const SURROGATE_RANGE = /[\uD800-\uDFFF]/
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Replaces lone UTF-16 surrogates (they make providers reject the request body). Keeps string identity when clean. */
export const sanitizeSurrogates = (content: string): string =>
  SURROGATE_RANGE.test(content) ? content.replace(LONE_SURROGATE, "�") : content

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

export const mergeDeep = (a: Json, b: Json): Json => {
  const out: Json = { ...a }
  for (const [key, value] of Object.entries(b)) out[key] = isObject(value) && isObject(out[key]) ? mergeDeep(out[key], value) : value
  return out
}

/** The key the AI SDK expects `providerOptions` under for a package. */
const sdkKey = (npm: string): string | undefined => {
  switch (npm) {
    case NPM.copilot:
      return "copilot"
    case NPM.azure:
      return "azure"
    case NPM.openai:
      return "openai"
    case NPM.bedrock:
      return "bedrock"
    case NPM.anthropic:
    case NPM.vertexAnthropic:
      return "anthropic"
    case NPM.vertex:
      return "vertex"
    case NPM.google:
      return "google"
    case NPM.gateway:
      return "gateway"
    case NPM.openrouter:
      return "openrouter"
    case NPM.xai:
      return "xai"
    case NPM.mistral:
      return "mistral"
    case NPM.groq:
      return "groq"
    case NPM.alibaba:
      return "alibaba"
    default:
      return undefined
  }
}

const mimeToModality = (mime: string): Modality | undefined => {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("audio/")) return "audio"
  if (mime.startsWith("video/")) return "video"
  if (mime === "application/pdf") return "pdf"
  return undefined
}

// ── message normalisation ──────────────────────────────────────────────────

const sanitizeToolOutput = (part: any) => {
  const output = part?.output
  if (!output) return part
  if (output.type === "text" || output.type === "error-text") output.value = sanitizeSurrogates(output.value)
  if (output.type === "content") {
    output.value = output.value.map((item: any) => (item.type === "text" ? { ...item, text: sanitizeSurrogates(item.text) } : item))
  }
  return part
}

const scrubParts = (msgs: ModelMessage[], scrub: (id: string) => string): ModelMessage[] =>
  msgs.map((msg) => {
    if ((msg.role !== "assistant" && msg.role !== "tool") || !Array.isArray(msg.content)) return msg
    return {
      ...msg,
      content: (msg.content as any[]).map((part) =>
        part.type === "tool-call" || part.type === "tool-result" ? { ...part, toolCallId: scrub(part.toolCallId) } : part
      )
    } as ModelMessage
  })

/** Drops empty text and unsigned empty reasoning parts; a message with nothing left disappears. */
const dropEmpty = (msgs: ModelMessage[], key: "anthropic" | "bedrock"): ModelMessage[] =>
  msgs
    .map((msg) => {
      if (typeof msg.content === "string") return msg.content === "" ? undefined : msg
      if (!Array.isArray(msg.content)) return msg
      const kept = (msg.content as any[]).filter((part) => {
        if (part.type === "text") return part.text !== ""
        if (part.type === "reasoning") {
          return part.text.trim().length > 0 || part.providerOptions?.[key]?.signature != null || part.providerOptions?.[key]?.redactedData != null
        }
        return true
      })
      return kept.length === 0 ? undefined : ({ ...msg, content: kept } as ModelMessage)
    })
    .filter((msg): msg is ModelMessage => msg !== undefined)

const normalizeMessages = (input: ModelMessage[], model: TransformModel): ModelMessage[] => {
  let msgs = input.map((msg): ModelMessage => {
    switch (msg.role) {
      case "tool":
        return { ...msg, content: msg.content.map((part) => (part.type === "tool-result" ? (sanitizeToolOutput({ ...part }) as typeof part) : part)) }
      case "system":
        return { ...msg, content: sanitizeSurrogates(msg.content) }
      case "user":
        return {
          ...msg,
          content:
            typeof msg.content === "string"
              ? sanitizeSurrogates(msg.content)
              : msg.content.map((part) => (part.type === "text" ? { ...part, text: sanitizeSurrogates(part.text) } : part))
        }
      case "assistant":
        return {
          ...msg,
          content:
            typeof msg.content === "string"
              ? sanitizeSurrogates(msg.content)
              : msg.content.map((part) => {
                  if (part.type === "text" || part.type === "reasoning") return { ...part, text: sanitizeSurrogates(part.text) }
                  if (part.type === "tool-result") return sanitizeToolOutput({ ...part }) as typeof part
                  return part
                })
        }
    }
  })

  // Anthropic rejects empty content.
  if (model.api.npm === NPM.anthropic) msgs = dropEmpty(msgs, "anthropic")
  if (model.api.npm === NPM.bedrock) msgs = dropEmpty(msgs, "bedrock")

  // Claude tool ids must match [a-zA-Z0-9_-].
  if (model.api.id.includes("claude")) msgs = scrubParts(msgs, (id) => id.replace(/[^a-zA-Z0-9_-]/g, "_"))

  // Anthropic rejects [tool_use, text] inside one assistant turn: split into text, then the calls.
  if (model.api.npm === NPM.anthropic || model.api.npm === NPM.vertexAnthropic) {
    msgs = msgs.flatMap((msg) => {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) return [msg]
      const parts = msg.content as any[]
      const first = parts.findIndex((part) => part.type === "tool-call")
      if (first === -1 || !parts.slice(first).some((part) => part.type !== "tool-call")) return [msg]
      return [
        { ...msg, content: parts.filter((part) => part.type !== "tool-call") } as ModelMessage,
        { ...msg, content: parts.filter((part) => part.type === "tool-call") } as ModelMessage
      ]
    })
  }

  const apiId = model.api.id.toLowerCase()
  if (model.providerID === "mistral" || apiId.includes("mistral") || apiId.includes("devstral")) {
    msgs = scrubParts(msgs, (id) => id.replace(/[^a-zA-Z0-9]/g, "").substring(0, 9).padEnd(9, "0"))
    // Mistral rejects a user turn straight after a tool turn.
    const spaced: ModelMessage[] = []
    msgs.forEach((msg, index) => {
      spaced.push(msg)
      if (msg.role === "tool" && msgs[index + 1]?.role === "user") spaced.push({ role: "assistant", content: [{ type: "text", text: "Done." }] })
    })
    return spaced
  }

  // DeepSeek wants reasoning on every assistant turn.
  if (apiId.includes("deepseek")) {
    msgs = msgs.map((msg) => {
      if (msg.role !== "assistant") return msg
      if (Array.isArray(msg.content)) {
        return (msg.content as any[]).some((part) => part.type === "reasoning")
          ? msg
          : ({ ...msg, content: [...msg.content, { type: "reasoning", text: "" }] } as ModelMessage)
      }
      return { ...msg, content: [...(msg.content ? [{ type: "text" as const, text: msg.content }] : []), { type: "reasoning" as const, text: "" }] }
    })
  }

  const interleaved = model.capabilities.interleaved
  if (typeof interleaved === "object" && interleaved.field && model.api.npm !== NPM.openrouter) {
    const field = interleaved.field
    return msgs.map((msg) => {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) return msg
      const reasoning = (msg.content as any[]).filter((part) => part.type === "reasoning")
      const content = (msg.content as any[]).filter((part) => part.type !== "reasoning")
      // Only set the field when the turn reasoned: an empty string on every turn breaks KV-cache prefix matching.
      if (reasoning.length === 0) return { ...msg, content } as ModelMessage
      return {
        ...msg,
        content,
        providerOptions: {
          ...msg.providerOptions,
          openaiCompatible: { ...msg.providerOptions?.openaiCompatible, [field]: reasoning.map((part) => part.text).join("") }
        }
      } as ModelMessage
    })
  }

  return msgs
}

/** Replaces media the model cannot read with an explicit error the model can relay to the user. */
const unsupportedParts = (msgs: ModelMessage[], model: TransformModel): ModelMessage[] =>
  msgs.map((msg) => {
    if (msg.role !== "user" || !Array.isArray(msg.content)) return msg
    const content = msg.content.map((part: any) => {
      if (part.type !== "file" && part.type !== "image") return part
      if (part.type === "image") {
        const image = String(part.image)
        const match = image.startsWith("data:") ? image.match(/^data:([^;]+);base64,(.*)$/) : null
        if (match && !match[2]) return { type: "text" as const, text: "ERROR: Image file is empty or corrupted. Please provide a valid image." }
      }
      const mime = part.type === "image" ? String(part.image).split(";")[0]!.replace("data:", "") : part.mediaType
      const modality = mimeToModality(mime)
      if (!modality || model.capabilities.input?.[modality]) return part
      const name = part.type === "file" && part.filename ? `"${part.filename}"` : modality
      return { type: "text" as const, text: `ERROR: Cannot read ${name} (this model does not support ${modality} input). Inform the user.` }
    })
    return { ...msg, content } as ModelMessage
  })

// ── prompt cache breakpoints ───────────────────────────────────────────────

/** Anthropic/Bedrock reject more than four `cache_control` markers; one is reserved for the tool definitions. */
export const BREAKPOINT_CAP = 4
export const TOOL_BREAKPOINT_RESERVE = 1
export const MESSAGE_BREAKPOINT_BUDGET = BREAKPOINT_CAP - TOOL_BREAKPOINT_RESERVE
/** Trailing messages to mark, so a long tool loop keeps a reusable entry near the tail. */
export const CONVERSATION_TAIL = 2
const CHARS_PER_TOKEN = 4

/** The minimum cacheable prefix is per model and not monotonic across generations. */
const MIN_CACHEABLE_TOKENS: ReadonlyArray<readonly [RegExp, number]> = [
  [/opus-4-6|opus-4-5|haiku-4-5/, 4096],
  [/opus-4-7|haiku-3-5/, 2048],
  [/opus-5|fable-5|mythos-5/, 512]
]
export const DEFAULT_MIN_CACHEABLE_TOKENS = 1024

export const minCacheableChars = (modelId: string): number => {
  const id = modelId.toLowerCase()
  for (const [pattern, tokens] of MIN_CACHEABLE_TOKENS) if (pattern.test(id)) return tokens * CHARS_PER_TOKEN
  return DEFAULT_MIN_CACHEABLE_TOKENS * CHARS_PER_TOKEN
}

const textLength = (msg: ModelMessage): number => {
  if (typeof msg.content === "string") return msg.content.length
  if (!Array.isArray(msg.content)) return 0
  return (msg.content as any[]).reduce((total, part) => total + (typeof part?.text === "string" ? part.text.length : 0), 0)
}

/** Which messages get a breakpoint, highest value first, truncated to `budget`. */
export const planCacheBreakpoints = (
  msgs: readonly ModelMessage[],
  budget = MESSAGE_BREAKPOINT_BUDGET,
  minChars = DEFAULT_MIN_CACHEABLE_TOKENS * CHARS_PER_TOKEN
): ModelMessage[] => {
  if (budget <= 0) return []
  const system = msgs.filter((msg) => msg.role === "system")
  const conversation = msgs.filter((msg) => msg.role !== "system")
  const first = system[0]
  const last = system[system.length - 1]
  const candidates: ModelMessage[] = []
  if (last) candidates.push(last)
  candidates.push(...conversation.slice(-CONVERSATION_TAIL))
  // A distinct first system part earns a slot only when large enough to cache on its own.
  if (first && first !== last && textLength(first) >= minChars) candidates.push(first)
  return [...new Set(candidates)].slice(0, budget)
}

export type CacheRetention = "short" | "long"
const cacheTtl = (retention: CacheRetention): "1h" | undefined => (retention === "long" ? "1h" : undefined)

const applyCaching = (msgs: ModelMessage[], model: TransformModel, retention: CacheRetention): ModelMessage[] => {
  const targets = planCacheBreakpoints(msgs, MESSAGE_BREAKPOINT_BUDGET, minCacheableChars(model.api.id || model.id))
  const ttl = cacheTtl(retention)
  const providerOptions = {
    anthropic: { cacheControl: ttl ? { type: "ephemeral", ttl } : { type: "ephemeral" } },
    openrouter: { cacheControl: { type: "ephemeral" } },
    bedrock: { cachePoint: { type: "default" } },
    openaiCompatible: { cache_control: { type: "ephemeral" } },
    copilot: { copilot_cache_control: { type: "ephemeral" } },
    alibaba: { cacheControl: { type: "ephemeral" } }
  }
  const messageLevel = model.providerID === "anthropic" || model.providerID.includes("bedrock") || model.api.npm === NPM.bedrock
  for (const msg of targets) {
    if (!messageLevel && Array.isArray(msg.content) && msg.content.length > 0) {
      const last = msg.content[msg.content.length - 1] as Json | undefined
      if (last && typeof last === "object") {
        last.providerOptions = mergeDeep(last.providerOptions ?? {}, providerOptions)
        continue
      }
    }
    msg.providerOptions = mergeDeep(msg.providerOptions ?? {}, providerOptions)
  }
  return msgs
}

const cachesPrompt = (model: TransformModel): boolean =>
  (model.providerID === "anthropic" ||
    model.providerID === "google-vertex-anthropic" ||
    model.api.id.includes("anthropic") ||
    model.api.id.includes("claude") ||
    model.id.includes("anthropic") ||
    model.id.includes("claude") ||
    model.api.npm === NPM.anthropic ||
    model.api.npm === NPM.alibaba ||
    model.api.npm === NPM.openrouter ||
    model.providerID === "openrouter") &&
  model.api.npm !== NPM.gateway

/**
 * Everything applied to the messages before the call: unreadable media, per-provider
 * normalisation, cache breakpoints, and the `providerOptions` key remap.
 * `cache: false` leaves breakpoints to the caller.
 */
export const message = (
  input: ModelMessage[],
  model: TransformModel,
  settings: { readonly cache?: boolean; readonly retention?: CacheRetention } = {}
): ModelMessage[] => {
  let msgs = normalizeMessages(unsupportedParts(input, model), model)
  if (settings.cache !== false && cachesPrompt(model)) msgs = applyCaching(msgs, model, settings.retention ?? "short")

  // Stored providerID → the key the SDK reads.
  const key = sdkKey(model.api.npm)
  if (key && key !== model.providerID) {
    const remap = (opts: Json | undefined) => {
      if (!opts || !(model.providerID in opts)) return opts
      const { [model.providerID]: moved, ...rest } = opts
      return { ...rest, [key]: moved }
    }
    msgs = msgs.map((msg) => ({
      ...msg,
      providerOptions: remap(msg.providerOptions),
      ...(Array.isArray(msg.content)
        ? { content: (msg.content as any[]).map((part) => ({ ...part, providerOptions: remap(part.providerOptions) })) }
        : {})
    })) as ModelMessage[]
  }
  return msgs
}

// ── sampling ───────────────────────────────────────────────────────────────

export const temperature = (model: TransformModel): number | undefined => {
  const id = model.id.toLowerCase()
  if (id.includes("qwen")) return 0.55
  if (id.includes("claude")) return undefined
  if (id.includes("gemini")) return 1.0
  if (id.includes("glm-4.6") || id.includes("glm-4.7")) return 1.0
  if (id.includes("minimax-m2") || id.includes("minimax-m3")) return 1.0
  if (id.includes("kimi-k2")) return ["thinking", "k2.", "k2p", "k2-5"].some((s) => id.includes(s)) ? 1.0 : 0.6
  return undefined
}

export const topP = (model: TransformModel): number | undefined => {
  const id = model.id.toLowerCase()
  if (id.includes("qwen")) return 1
  if (["minimax-m2", "minimax-m3", "gemini", "kimi-k2.5", "kimi-k2p5", "kimi-k2-5"].some((s) => id.includes(s))) return 0.95
  return undefined
}

export const topK = (model: TransformModel): number | undefined => {
  const id = model.id.toLowerCase()
  if (id.includes("minimax-m2") || id.includes("minimax-m3")) return ["m2.", "m25", "m21", "m3"].some((s) => id.includes(s)) ? 40 : 20
  if (id.includes("gemini")) return 64
  return undefined
}

export const maxOutputTokens = (model: TransformModel, outputTokenMax = OUTPUT_TOKEN_MAX): number =>
  Math.min(model.limit.output, outputTokenMax) || outputTokenMax

// ── reasoning-effort variants ──────────────────────────────────────────────

const WIDELY_SUPPORTED_EFFORTS = ["low", "medium", "high"]
const OPENAI_EFFORTS = ["none", "minimal", ...WIDELY_SUPPORTED_EFFORTS, "xhigh"]
const OPENAI_GPT5_1_EFFORTS = ["none", ...WIDELY_SUPPORTED_EFFORTS]
const OPENAI_GPT5_2_PLUS_EFFORTS = [...OPENAI_GPT5_1_EFFORTS, "xhigh"]
const OPENAI_GPT5_PRO_EFFORTS = ["high"]
const OPENAI_GPT5_PRO_2_PLUS_EFFORTS = ["medium", "high", "xhigh"]
const OPENAI_GPT5_CHAT_EFFORTS = ["medium"]
const OPENAI_GPT5_CODEX_XHIGH_EFFORTS = [...WIDELY_SUPPORTED_EFFORTS, "xhigh"]
const OPENAI_GPT5_CODEX_3_PLUS_EFFORTS = ["none", ...OPENAI_GPT5_CODEX_XHIGH_EFFORTS]
// GPT-6 / GPT-Reserve drop `none`/`minimal`; `max` exists on the Responses API only.
const CHAT_XHIGH_EFFORTS = [...WIDELY_SUPPORTED_EFFORTS, "xhigh"]
const RESPONSES_MAX_EFFORTS = [...CHAT_XHIGH_EFFORTS, "max"]
const OPENAI_NONE_EFFORT_RELEASE_DATE = "2025-11-13"
const OPENAI_XHIGH_EFFORT_RELEASE_DATE = "2025-12-04"
const INCLUDE_ENCRYPTED_REASONING = ["reasoning.encrypted_content"] as const

const GPT5_FAMILY_RE = /(?:^|\/)gpt-5(?:[.-]|$)/
const GPT5_VERSION_RE = /(?:^|\/)gpt-5[.-](\d+)(?:[.-]|$)/
const GPT5_PRO_RE = /(?:^|\/)gpt-5[.-]?pro(?:[.-]|$)/
const GPT5_VERSIONED_PRO_RE = /(?:^|\/)gpt-5[.-]\d+[.-]pro(?:[.-]|$)/
const GPT6_FAMILY_RE = /(?:^|\/)gpt-6(?:[.-]|$)/
const GPT_RESERVE_RE = /(?:^|\/)gpt-reserve(?:[.-]|$)/
const GROK_4_5_RE = /(?:^|\/)grok-4[.-]5(?:[.-]|$)/

export const isGpt6Family = (apiId: string): boolean => GPT6_FAMILY_RE.test(apiId.toLowerCase())
export const isGptReserve = (apiId: string): boolean => GPT_RESERVE_RE.test(apiId.toLowerCase())

const gpt5Version = (apiId: string): number | undefined => Number(GPT5_VERSION_RE.exec(apiId)?.[1]) || undefined

const gptFrontierEfforts = (apiId: string, responses: boolean): string[] | undefined =>
  GPT6_FAMILY_RE.test(apiId) || GPT_RESERVE_RE.test(apiId) ? (responses ? RESPONSES_MAX_EFFORTS : CHAT_XHIGH_EFFORTS) : undefined

const versionedGpt5Efforts = (apiId: string): string[] | undefined => {
  if (GPT5_VERSIONED_PRO_RE.test(apiId)) return OPENAI_GPT5_PRO_2_PLUS_EFFORTS
  const version = gpt5Version(apiId)
  if (version === undefined) return undefined
  return version === 1 ? OPENAI_GPT5_1_EFFORTS : OPENAI_GPT5_2_PLUS_EFFORTS
}

const gpt5CodexEfforts = (apiId: string): string[] | undefined => {
  if (!GPT5_FAMILY_RE.test(apiId) || !apiId.includes("codex")) return undefined
  const version = gpt5Version(apiId)
  if (version !== undefined && version >= 3) return OPENAI_GPT5_CODEX_3_PLUS_EFFORTS
  if (apiId.includes("codex-max") || (version !== undefined && version >= 2)) return OPENAI_GPT5_CODEX_XHIGH_EFFORTS
  return WIDELY_SUPPORTED_EFFORTS
}

const gpt5ChatEfforts = (apiId: string): string[] | undefined => {
  if (!GPT5_FAMILY_RE.test(apiId) || !apiId.includes("-chat")) return undefined
  return gpt5Version(apiId) === undefined ? [] : OPENAI_GPT5_CHAT_EFFORTS
}

const openaiReasoningEfforts = (apiId: string, releaseDate: string): string[] => {
  const id = apiId.toLowerCase()
  if (id.includes("deep-research")) return ["medium"]
  const frontier = gptFrontierEfforts(id, true)
  if (frontier) return frontier
  const chat = gpt5ChatEfforts(id)
  if (chat) return chat
  if (GPT5_PRO_RE.test(id)) return OPENAI_GPT5_PRO_EFFORTS
  const codex = gpt5CodexEfforts(id)
  if (codex) return codex
  const versioned = versionedGpt5Efforts(id)
  if (versioned) return versioned
  const efforts = [...WIDELY_SUPPORTED_EFFORTS]
  if (GPT5_FAMILY_RE.test(id)) efforts.unshift("minimal")
  if (releaseDate >= OPENAI_NONE_EFFORT_RELEASE_DATE) efforts.unshift("none")
  if (releaseDate >= OPENAI_XHIGH_EFFORT_RELEASE_DATE) efforts.push("xhigh")
  return efforts
}

const openaiCompatibleReasoningEfforts = (id: string): string[] => {
  const apiId = id.toLowerCase()
  return (
    gptFrontierEfforts(apiId, false) ??
    gpt5ChatEfforts(apiId) ??
    (GPT5_PRO_RE.test(apiId) ? OPENAI_GPT5_PRO_EFFORTS : undefined) ??
    gpt5CodexEfforts(apiId) ??
    versionedGpt5Efforts(apiId) ??
    OPENAI_EFFORTS
  )
}

const anthropicOpus47OrLater = (apiId: string): boolean => {
  const version = /opus-(\d+)[.-](\d+)(?:[.@-]|$)/i.exec(apiId)
  if (!version) return false
  const major = Number(version[1])
  const minor = Number(version[2])
  return major > 4 || (major === 4 && minor >= 7)
}

const anthropicAdaptiveEfforts = (apiId: string): string[] | null => {
  if (anthropicOpus47OrLater(apiId)) return ["low", "medium", "high", "xhigh", "max"]
  if (["opus-4-6", "opus-4.6", "sonnet-4-6", "sonnet-4.6"].some((v) => apiId.includes(v))) return ["low", "medium", "high", "max"]
  if (apiId.toLowerCase().includes("minimax-m3")) return ["low", "medium", "high", "max"]
  return null
}

const googleThinkingLevelEfforts = (apiId: string): string[] => {
  const id = apiId.toLowerCase()
  if (!id.includes("gemini-3")) return ["low", "high"]
  if (id.includes("flash-image")) return ["minimal", "high"]
  if (id.includes("pro-image")) return ["high"]
  if (id.includes("flash")) return ["minimal", "low", "medium", "high"]
  return ["low", "medium", "high"]
}

const googleThinkingBudgetMax = (apiId: string): number => {
  const id = apiId.toLowerCase()
  return id.includes("2.5") && id.includes("pro") && !id.includes("flash") ? 32_768 : 24_576
}

const xaiReasoningEfforts = (id: string): string[] | undefined => {
  if (id.includes("grok-3-mini")) return ["low", "high"]
  if (id.includes("multi-agent")) return ["low", "medium", "high", "xhigh"]
  if (GROK_4_5_RE.test(id)) return ["low", "medium", "high"]
  return undefined
}

const byEffort = (efforts: ReadonlyArray<string>, shape: (effort: string) => Json): Record<string, Json> =>
  Object.fromEntries(efforts.map((effort) => [effort, shape(effort)]))

const anthropicBudgetVariants = (output: number): Record<string, Json> => ({
  high: { thinking: { type: "enabled", budgetTokens: Math.min(16_000, Math.floor(output / 2 - 1)) } },
  max: { thinking: { type: "enabled", budgetTokens: Math.min(31_999, output - 1) } }
})

/** The reasoning-effort presets a model exposes (`{}` when it has no effort control). */
export const variants = (model: TransformModel): Record<string, Json> => {
  if (!model.capabilities.reasoning) return {}
  const id = model.id.toLowerCase()
  const apiId = model.api.id
  const releaseDate = model.releaseDate ?? ""
  const adaptiveOpus = anthropicOpus47OrLater(apiId)
  const adaptive = anthropicAdaptiveEfforts(apiId)
  const viaOpenRouter = model.api.npm === NPM.openrouter

  // Families whose reasoning cannot be steered (or leaks into content).
  if (
    id.includes("deepseek-chat") ||
    id.includes("deepseek-reasoner") ||
    id.includes("deepseek-r1") ||
    id.includes("deepseek-v3") ||
    (id.includes("minimax") && !id.includes("minimax-m3")) ||
    (id.includes("glm") && !viaOpenRouter) ||
    (id.includes("kimi") && !viaOpenRouter) ||
    (id.includes("k2p") && !viaOpenRouter) ||
    id.includes("qwen") ||
    id.includes("big-pickle")
  )
    return {}

  // xAI: effort is per model; `xhigh` only survives OpenRouter's generic passthrough.
  if (id.includes("grok") || model.api.npm === NPM.xai) {
    const efforts = xaiReasoningEfforts(id)
    if (!efforts) return {}
    if (viaOpenRouter) return byEffort(efforts, (effort) => ({ reasoning: { effort } }))
    return byEffort(efforts.filter((effort) => effort !== "xhigh"), (reasoningEffort) => ({ reasoningEffort }))
  }

  switch (model.api.npm) {
    case NPM.openrouter: {
      const efforts =
        id.includes("gpt") || apiId.toLowerCase().startsWith("openai/")
          ? openaiCompatibleReasoningEfforts(id)
          : (adaptive ?? [...WIDELY_SUPPORTED_EFFORTS, "max"])
      return byEffort(efforts, (effort) => ({ reasoning: { effort } }))
    }

    case NPM.gateway: {
      if (model.id.includes("anthropic")) {
        if (adaptive) return byEffort(adaptive, (effort) => ({ thinking: { type: "adaptive" }, effort }))
        return {
          high: { thinking: { type: "enabled", budgetTokens: 16_000 } },
          max: { thinking: { type: "enabled", budgetTokens: 31_999 } }
        }
      }
      if (model.id.includes("google")) {
        if (id.includes("2.5")) {
          return {
            high: { thinkingConfig: { includeThoughts: true, thinkingBudget: 16_000 } },
            max: { thinkingConfig: { includeThoughts: true, thinkingBudget: 24_576 } }
          }
        }
        return byEffort(["low", "high"], (effort) => ({ includeThoughts: true, thinkingLevel: effort }))
      }
      return byEffort(openaiCompatibleReasoningEfforts(apiId), (reasoningEffort) => ({ reasoningEffort }))
    }

    case NPM.copilot: {
      if (model.id.includes("gemini")) return {}
      if (model.id.includes("claude")) return byEffort(WIDELY_SUPPORTED_EFFORTS, (reasoningEffort) => ({ reasoningEffort }))
      const efforts = GPT6_FAMILY_RE.test(id)
        ? CHAT_XHIGH_EFFORTS
        : id.includes("5.1-codex-max") || id.includes("5.2") || id.includes("5.3")
          ? [...WIDELY_SUPPORTED_EFFORTS, "xhigh"]
          : id.includes("gpt-5") && releaseDate >= OPENAI_XHIGH_EFFORT_RELEASE_DATE
            ? [...WIDELY_SUPPORTED_EFFORTS, "xhigh"]
            : [...WIDELY_SUPPORTED_EFFORTS]
      return byEffort(efforts, (reasoningEffort) => ({ reasoningEffort, reasoningSummary: "auto", include: INCLUDE_ENCRYPTED_REASONING }))
    }

    case "@ai-sdk/cerebras":
    case "@ai-sdk/togetherai":
    case "@ai-sdk/deepinfra":
    case "venice-ai-sdk-provider":
    case NPM.compatible: {
      const efforts = [...WIDELY_SUPPORTED_EFFORTS]
      if (apiId.toLowerCase().includes("deepseek-v4")) efforts.push("max")
      return byEffort(efforts, (reasoningEffort) => ({ reasoningEffort }))
    }

    case NPM.azure: {
      if (id === "o1-mini") return {}
      const efforts = GPT6_FAMILY_RE.test(id)
        ? CHAT_XHIGH_EFFORTS
        : GPT5_FAMILY_RE.test(id) && gpt5Version(id) === undefined
          ? ["minimal", ...WIDELY_SUPPORTED_EFFORTS]
          : WIDELY_SUPPORTED_EFFORTS
      return byEffort(efforts, (reasoningEffort) => ({ reasoningEffort, reasoningSummary: "auto", include: INCLUDE_ENCRYPTED_REASONING }))
    }

    case NPM.openai:
      return byEffort(openaiReasoningEfforts(apiId, releaseDate), (reasoningEffort) => ({
        reasoningEffort,
        reasoningSummary: "detailed",
        include: INCLUDE_ENCRYPTED_REASONING
      }))

    case NPM.anthropic:
    case NPM.vertexAnthropic: {
      if (adaptive) {
        let efforts = [...adaptive]
        if (model.providerID === "github-copilot") {
          if (apiId.includes("opus-4.7")) efforts = ["medium"]
          efforts = efforts.filter((effort) => effort !== "max" && effort !== "xhigh")
        }
        return byEffort(efforts, (effort) => ({
          thinking: { type: "adaptive", ...(adaptiveOpus ? { display: "summarized" } : undefined) },
          effort
        }))
      }
      if (["opus-4-5", "opus-4.5"].some((v) => apiId.includes(v))) return byEffort(WIDELY_SUPPORTED_EFFORTS, (effort) => ({ effort }))
      return anthropicBudgetVariants(model.limit.output)
    }

    case NPM.bedrock: {
      if (adaptive) {
        return byEffort(adaptive, (effort) => ({
          reasoningConfig: { type: "adaptive", maxReasoningEffort: effort, ...(adaptiveOpus ? { display: "summarized" } : undefined) }
        }))
      }
      if (apiId.includes("anthropic")) {
        return {
          high: { reasoningConfig: { type: "enabled", budgetTokens: 16_000 } },
          max: { reasoningConfig: { type: "enabled", budgetTokens: 31_999 } }
        }
      }
      return byEffort(WIDELY_SUPPORTED_EFFORTS, (effort) => ({ reasoningConfig: { type: "enabled", maxReasoningEffort: effort } }))
    }

    case NPM.vertex:
    case NPM.google: {
      if (id.includes("2.5")) {
        return {
          high: { thinkingConfig: { includeThoughts: true, thinkingBudget: 16_000 } },
          max: { thinkingConfig: { includeThoughts: true, thinkingBudget: googleThinkingBudgetMax(id) } }
        }
      }
      return byEffort(googleThinkingLevelEfforts(id), (thinkingLevel) => ({ thinkingConfig: { includeThoughts: true, thinkingLevel } }))
    }

    case NPM.mistral: {
      const reasoning = ["mistral-small-2603", "mistral-small-latest", "mistral-medium-3.5", "mistral-medium-2604"]
      return reasoning.some((candidate) => apiId.toLowerCase().includes(candidate)) ? { high: { reasoningEffort: "high" } } : {}
    }

    case NPM.groq:
      return byEffort(["none", ...WIDELY_SUPPORTED_EFFORTS], (reasoningEffort) => ({ reasoningEffort }))
  }
  return {}
}

// ── provider options ───────────────────────────────────────────────────────

/** Default `providerOptions` body for a call (before wrapping under the provider key). */
export const options = (input: { readonly model: TransformModel; readonly sessionID: string; readonly setCacheKey?: boolean }): Json => {
  const { model, sessionID } = input
  const result: Json = {}
  const apiId = model.api.id
  const lowerId = apiId.toLowerCase()

  if (model.api.npm === NPM.vertexAnthropic || (!apiId.includes("claude") && model.api.npm === NPM.anthropic)) result["toolStreaming"] = false

  if (model.providerID === "openai" || model.api.npm === NPM.openai || model.api.npm === NPM.copilot) result["store"] = false
  if (model.api.npm === NPM.azure) {
    result["store"] = false
    result["promptCacheKey"] = sessionID
  }
  if (model.api.npm === NPM.openrouter || model.api.npm === "@llmgateway/ai-sdk-provider") {
    result["usage"] = { include: true }
    if (apiId.includes("gemini-3")) result["reasoning"] = { effort: "high" }
  }
  if (model.providerID === "baseten") result["chat_template_args"] = { enable_thinking: true }
  if (["zai", "zhipuai"].some((id) => model.providerID.includes(id)) && model.api.npm === NPM.compatible) {
    result["thinking"] = { type: "enabled", clear_thinking: false }
  }
  if (model.providerID === "openai" || input.setCacheKey) result["promptCacheKey"] = sessionID

  if ((model.api.npm === NPM.google || model.api.npm === NPM.vertex) && model.capabilities.reasoning) {
    result["thinkingConfig"] = { includeThoughts: true, ...(apiId.includes("gemini-3") ? { thinkingLevel: "high" } : {}) }
  }

  // Kimi over the Anthropic wire thinks by default.
  if (
    (model.api.npm === NPM.anthropic || model.api.npm === NPM.vertexAnthropic) &&
    (lowerId.includes("k2p") || lowerId.includes("kimi-k2.") || lowerId.includes("kimi-k2p"))
  ) {
    result["thinking"] = { type: "enabled", budgetTokens: Math.min(16_000, Math.floor(model.limit.output / 2 - 1)) }
  }

  // DashScope only returns reasoning_content when asked.
  if (
    model.providerID === "alibaba-cn" &&
    model.capabilities.reasoning &&
    model.api.npm === NPM.compatible &&
    !lowerId.includes("kimi-k2-thinking")
  ) {
    result["enable_thinking"] = true
  }

  if (model.api.npm === NPM.azure && apiId.includes("gpt-5.5")) {
    result["reasoningSummary"] = "auto"
    return result
  }

  const isGpt5 = apiId.includes("gpt-5") && !apiId.includes("gpt-5-chat")
  const isFrontier = isGpt6Family(apiId) || isGptReserve(apiId)
  if (isGpt5 || isFrontier) {
    if (!apiId.includes("gpt-5-pro")) {
      result["reasoningEffort"] = "medium"
      result["reasoningSummary"] = model.api.npm === NPM.openai ? "detailed" : "auto"
      if (model.api.npm === NPM.openai) result["include"] = INCLUDE_ENCRYPTED_REASONING
    }
    // Chat models only support "medium" verbosity; gpt-6 has no documented `text.verbosity`.
    if (
      ((isGpt5 && apiId.includes("gpt-5.") && !apiId.includes("codex") && !apiId.includes("-chat")) || isGptReserve(apiId)) &&
      model.providerID !== "azure"
    ) {
      result["textVerbosity"] = "low"
    }
  }

  if (model.providerID === "venice") result["promptCacheKey"] = sessionID
  if (model.providerID === "openrouter") result["prompt_cache_key"] = sessionID
  if (model.api.npm === NPM.gateway) result["gateway"] = { caching: "auto" }
  return result
}

const SLUG_OVERRIDES: Record<string, string> = { amazon: "bedrock" }

/** Wraps an options body under the key the SDK reads it from. */
export const providerOptions = (model: TransformModel, body: Json): Record<string, Json> => {
  if (model.api.npm === NPM.gateway) {
    const slash = model.api.id.indexOf("/")
    const rawSlug = slash > 0 ? model.api.id.slice(0, slash) : undefined
    const slug = rawSlug ? (SLUG_OVERRIDES[rawSlug] ?? rawSlug) : undefined
    const { gateway, ...rest } = body
    const result: Json = {}
    if (gateway !== undefined) result.gateway = gateway
    if (Object.keys(rest).length > 0) {
      if (slug) result[slug] = rest
      else result.gateway = isObject(gateway) ? { ...gateway, ...rest } : rest
    }
    return result
  }
  const dotSplit = model.api.npm === NPM.compatible || model.api.npm === NPM.openai || model.api.npm === NPM.anthropic
  const key = sdkKey(model.api.npm) ?? (dotSplit ? model.providerID.split(".")[0]! : model.providerID)
  if (model.api.npm === NPM.azure) return { openai: body, azure: body }
  return { [key]: body }
}

// ── tools and errors ───────────────────────────────────────────────────────

const MULTI_AGENT_RE = /multi-?agent/i

/** xAI multi-agent models run on the Responses API only and take no client-side tools. */
export const isMultiAgent = (model: TransformModel): boolean =>
  (model.providerID === "xai" || model.api.id.toLowerCase().includes("grok")) && (MULTI_AGENT_RE.test(model.api.id) || MULTI_AGENT_RE.test(model.id))

export const tools = <T extends Record<string, unknown>>(model: TransformModel, defined: T): T => (isMultiAgent(model) ? ({} as T) : defined)

export const supportsMediaInToolResults = (model: TransformModel): boolean =>
  model.capabilities.input?.image === true &&
  [NPM.anthropic, NPM.vertexAnthropic, NPM.bedrock, NPM.google, NPM.vertex].includes(model.api.npm as never)

/** A provider message with the hint a user needs to act on it. */
export const error = (providerID: string, failure: { readonly message?: string; readonly statusCode?: number }): string => {
  const msg = failure.message ?? ""
  if (providerID === "xai" && MULTI_AGENT_RE.test(msg)) {
    return `${msg}. xAI multi-agent models don't support client-side tools and only run on the Responses API — use a standard grok model (e.g. grok-4, grok-code-fast) for tool-using sessions.`
  }
  if (providerID.includes("github-copilot") && failure.statusCode === 403 && !msg.toLowerCase().includes("reauthenticate")) {
    return msg ? `${msg}. Please reauthenticate in GitHub Copilot settings.` : "Authentication failed. Please reauthenticate in GitHub Copilot settings."
  }
  if (providerID === "github-copilot" && msg.toLowerCase().includes("not supported") && !msg.includes("github.com/settings/copilot")) {
    return `${msg} See https://github.com/settings/copilot for available models.`
  }
  return msg
}

// ── tool/structured-output schema ──────────────────────────────────────────

const SCHEMA_INTENT_KEYS = ["type", "properties", "items", "prefixItems", "enum", "const", "$ref", "additionalProperties", "patternProperties", "required", "not", "if", "then", "else"]

const sanitizeMoonshot = (node: unknown): unknown => {
  if (node === null || typeof node !== "object") return node
  if (Array.isArray(node)) return node.map(sanitizeMoonshot)
  const obj = node as Json
  if (typeof obj.$ref === "string") return { $ref: obj.$ref }
  const result: Json = Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, sanitizeMoonshot(value)]))
  if (Array.isArray(result.items)) result.items = result.items[0] ?? {}
  return result
}

const sanitizeGemini = (node: any): any => {
  if (node === null || typeof node !== "object") return node
  if (Array.isArray(node)) return node.map(sanitizeGemini)
  const hasCombiner = (value: unknown) => isObject(value) && (Array.isArray(value.anyOf) || Array.isArray(value.oneOf) || Array.isArray(value.allOf))
  const hasIntent = (value: unknown) => isObject(value) && (hasCombiner(value) || SCHEMA_INTENT_KEYS.some((key) => key in value))
  const result: Json = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === "enum" && Array.isArray(value)) {
      result[key] = value.map(String)
      if (result.type === "integer" || result.type === "number") result.type = "string"
    } else {
      result[key] = typeof value === "object" && value !== null ? sanitizeGemini(value) : value
    }
  }
  if (result.type === "object" && result.properties && Array.isArray(result.required)) {
    result.required = result.required.filter((field: string) => field in result.properties)
  }
  if (result.type === "array" && !hasCombiner(result)) {
    if (result.items == null) result.items = {}
    if (isObject(result.items) && !hasIntent(result.items)) result.items.type = "string"
  }
  if (result.type && result.type !== "object" && !hasCombiner(result)) {
    delete result.properties
    delete result.required
  }
  return result
}

/** Rewrites a JSON Schema into the dialect the provider accepts (Moonshot tuples, Gemini enums/arrays). */
export const schema = <S extends Json>(model: TransformModel, input: S): S => {
  let out: unknown = input
  if (model.providerID === "moonshotai" || model.api.id.toLowerCase().includes("kimi")) {
    const sanitized = sanitizeMoonshot(out)
    if (isObject(sanitized)) out = sanitized
  }
  if (model.providerID === "google" || model.api.id.includes("gemini")) out = sanitizeGemini(out)
  return out as S
}

// ── the whole call ─────────────────────────────────────────────────────────

export interface PreparedCall {
  readonly messages: ModelMessage[]
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
  readonly maxOutputTokens: number
  readonly providerOptions: Record<string, Json>
}

/** Messages plus sampling, limits and provider options for one call, the way nikcli's `LLM.stream` builds it. */
export const prepareCall = (input: {
  readonly model: TransformModel
  readonly messages: ModelMessage[]
  readonly sessionID: string
  /** A reasoning-effort preset from {@link variants}. */
  readonly variant?: string
  readonly retention?: CacheRetention
}): PreparedCall => {
  const { model } = input
  const body = mergeDeep(options({ model, sessionID: input.sessionID }), (input.variant ? variants(model)[input.variant] : undefined) ?? {})
  const temp = temperature(model)
  const p = topP(model)
  const k = topK(model)
  return {
    messages: message(input.messages, model, { retention: input.retention ?? "short" }),
    ...(temp !== undefined ? { temperature: temp } : {}),
    ...(p !== undefined ? { topP: p } : {}),
    ...(k !== undefined ? { topK: k } : {}),
    maxOutputTokens: maxOutputTokens(model),
    providerOptions: providerOptions(model, body)
  }
}
