import { createAnthropic } from "@ai-sdk/anthropic"
import { createGateway } from "@ai-sdk/gateway"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { Output, generateText, jsonSchema, streamText, type LanguageModel } from "ai"
import { Context, Effect, Layer, Option, Redacted, Schema, Stream } from "effect"
import { AiConfig } from "./ai-config.ts"
import { AiCredentials, type StoredCredential } from "./credentials.ts"
import { AiAborted, AiConfigError, AiProviderError, type AiError } from "./errors.ts"
import {
  DEFAULT_MINIMAX_BASE_URL,
  PROVIDER_IDS,
  resolveModel,
  type ModelSelector,
  type ProviderId,
  type ResolvedModel
} from "./models.ts"

export interface DirectCallBase {
  readonly system?: string
  readonly model?: ModelSelector
}

export interface TextResult {
  readonly text: string
  readonly model: string
  readonly provider: ProviderId
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number }
}

export type DirectStreamPart =
  | { readonly type: "delta"; readonly text: string }
  | { readonly type: "finish"; readonly usage: { readonly inputTokens: number; readonly outputTokens: number } }

/** Builds the AI SDK model for a resolved selection. Injected in tests. */
export type LanguageModelFactory = (resolved: ResolvedModel, credential: StoredCredential) => LanguageModel

export const defaultModelFactory: LanguageModelFactory = (resolved, credential) => {
  const apiKey = Redacted.value(credential.key)
  switch (resolved.provider) {
    case "anthropic":
      return createAnthropic({ apiKey, ...(credential.baseUrl ? { baseURL: credential.baseUrl } : {}) })(resolved.modelId)
    case "openai":
      return createOpenAI({ apiKey, ...(credential.baseUrl ? { baseURL: credential.baseUrl } : {}) })(resolved.modelId)
    case "minimax":
      return createOpenAICompatible({
        name: "minimax",
        apiKey,
        baseURL: credential.baseUrl ?? DEFAULT_MINIMAX_BASE_URL
      })(resolved.modelId)
    case "gateway":
      return createGateway({ apiKey, ...(credential.baseUrl ? { baseURL: credential.baseUrl } : {}) })(resolved.modelId)
  }
}

const usageOf = (usage: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined) => ({
  inputTokens: usage?.inputTokens ?? 0,
  outputTokens: usage?.outputTokens ?? 0
})

/** Removes any occurrence of the key from a message so it can never reach logs or the UI. */
export const scrubSecret = (message: string, secrets: ReadonlyArray<string>): string =>
  secrets.reduce((text, secret) => (secret.length >= 4 ? text.split(secret).join("[redacted]") : text), message)

const statusOf = (error: unknown): number | undefined => {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const value = (error as { statusCode: unknown }).statusCode
    return typeof value === "number" ? value : undefined
  }
  return undefined
}

const isAbort = (error: unknown, signal?: AbortSignal): boolean =>
  signal?.aborted === true || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))

export class DirectModel extends Context.Service<
  DirectModel,
  {
    generateText(input: DirectCallBase & { readonly prompt: string }): Effect.Effect<TextResult, AiError>
    streamText(input: DirectCallBase & { readonly prompt: string }): Stream.Stream<DirectStreamPart, AiError>
    /** Structured output validated twice: by the AI SDK against JSON Schema, then by the Effect Schema. */
    generateObject<A>(input: DirectCallBase & { readonly prompt: string; readonly schema: Schema.Decoder<A> }): Effect.Effect<A, AiError>
  }
>()("cadcamfun/DirectModel") {
  static layerWith = (factory: LanguageModelFactory): Layer.Layer<DirectModel, never, AiCredentials | AiConfig> =>
    Layer.effect(
      DirectModel,
      Effect.gen(function* () {
        const credentials = yield* AiCredentials
        const config = yield* AiConfig

        const prepare = Effect.fn("DirectModel.prepare")(function* (selector: ModelSelector | undefined) {
          const status = yield* credentials.status
          const configured = new Set(PROVIDER_IDS.filter((id) => status[id] === "configured"))
          const resolved = resolveModel(selector, { configured, forceGateway: config.forceGateway })
          if (resolved instanceof AiConfigError) return yield* resolved
          const credential = yield* credentials.get(resolved.provider)
          if (Option.isNone(credential)) {
            return yield* new AiConfigError({ message: `No API key configured for "${resolved.provider}".`, provider: resolved.provider })
          }
          const model = yield* Effect.try({
            try: () => factory(resolved, credential.value),
            catch: () => new AiConfigError({ message: `Could not create a ${resolved.provider} model client.`, provider: resolved.provider })
          })
          return { resolved, model, secrets: [Redacted.value(credential.value.key)] }
        })

        const toError = (error: unknown, signal: AbortSignal | undefined, provider: ProviderId, secrets: ReadonlyArray<string>): AiError => {
          if (isAbort(error, signal)) return new AiAborted({})
          const status = statusOf(error)
          const raw = error instanceof Error ? error.message : String(error)
          return new AiProviderError({
            message: scrubSecret(raw, secrets),
            provider,
            retryable: status === undefined ? false : status === 429 || status >= 500
          })
        }

        const generateTextImpl = Effect.fn("DirectModel.generateText")(function* (input: DirectCallBase & { readonly prompt: string }) {
          const { resolved, model, secrets } = yield* prepare(input.model)
          return yield* Effect.tryPromise({
            try: async (signal): Promise<TextResult> => {
              const result = await generateText({
                model,
                prompt: input.prompt,
                ...(input.system ? { system: input.system } : {}),
                abortSignal: signal,
                maxRetries: 1
              })
              return { text: result.text, model: resolved.modelId, provider: resolved.provider, usage: usageOf(result.usage) }
            },
            catch: (error) => toError(error, undefined, resolved.provider, secrets)
          })
        })

        return DirectModel.of({
          generateText: generateTextImpl,

          streamText: (input) =>
            Stream.unwrap(
              Effect.gen(function* () {
                const { resolved, model, secrets } = yield* prepare(input.model)
                const controller = new AbortController()
                yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()))
                const result = streamText({
                  model,
                  prompt: input.prompt,
                  ...(input.system ? { system: input.system } : {}),
                  abortSignal: controller.signal,
                  maxRetries: 1
                })
                const parts = Stream.fromAsyncIterable(result.fullStream, (error) =>
                  toError(error, controller.signal, resolved.provider, secrets)
                )
                return parts.pipe(
                  Stream.flatMap((part): Stream.Stream<DirectStreamPart> => {
                    if (part.type === "text-delta") return Stream.succeed({ type: "delta", text: part.text })
                    if (part.type === "finish") return Stream.succeed({ type: "finish", usage: usageOf(part.totalUsage) })
                    return Stream.empty
                  })
                )
              })
            ),

          generateObject: <A>(input: DirectCallBase & { readonly prompt: string; readonly schema: Schema.Decoder<A> }) =>
            Effect.gen(function* () {
              const { resolved, model, secrets } = yield* prepare(input.model)
              const document = Schema.toJsonSchemaDocument(input.schema)
              const aiSchema = jsonSchema<unknown>({
                ...document.schema,
                ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {})
              } as Parameters<typeof jsonSchema>[0])
              const raw = yield* Effect.tryPromise({
                try: async (signal) => {
                  const result = await generateText({
                    model,
                    prompt: input.prompt,
                    ...(input.system ? { system: input.system } : {}),
                    output: Output.object({ schema: aiSchema }),
                    abortSignal: signal,
                    maxRetries: 1
                  })
                  return result.output as unknown
                },
                catch: (error) => toError(error, undefined, resolved.provider, secrets)
              })
              return yield* Schema.decodeUnknownEffect(input.schema)(raw).pipe(
                Effect.mapError(
                  () => new AiProviderError({ message: "The model returned data that does not match the requested schema.", provider: resolved.provider })
                )
              )
            })
        })
      })
    )

  static layer: Layer.Layer<DirectModel, never, AiCredentials | AiConfig> = DirectModel.layerWith(defaultModelFactory)
}
