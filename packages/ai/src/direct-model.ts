import { createAnthropic } from "@ai-sdk/anthropic"
import { createGateway } from "@ai-sdk/gateway"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { Output, generateText, jsonSchema, streamText, type LanguageModel, type ModelMessage } from "ai"
import { Context, Effect, Layer, Option, Redacted, Schema, Stream } from "effect"
import { AiConfig } from "./ai-config.ts"
import { AiCredentials, type StoredCredential } from "./credentials.ts"
import { AiAborted, AiConfigError, AiProviderError, type AiError } from "./errors.ts"
import {
  BUILTIN_PROVIDER_IDS,
  DEFAULT_MINIMAX_BASE_URL,
  resolveModel,
  type ModelSelector,
  type ProviderId,
  type ResolvedModel
} from "./models.ts"
import { formatOverflowMessage, parseApiFailure, type ApiFailure } from "./provider-error.ts"
import { RETRY_MAX_ATTEMPTS, delay as retryDelay, retryable, sleep as retrySleep } from "./retry.ts"
import { prepareCall, schema as transformSchema, transformModelFor, type PreparedCall } from "./transform.ts"

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
    default: {
      // Any other provider the host knows (models.dev): the one-shot path can only
      // reach it through its OpenAI-compatible endpoint, so a base URL is required.
      const providerId = resolved.provider
      if (credential.baseUrl === undefined) {
        throw new Error(`No base URL configured for "${providerId}". Add one in the AI settings, or pick a built-in provider.`)
      }
      return createOpenAICompatible({ name: providerId, apiKey, baseURL: credential.baseUrl })(resolved.modelId)
    }
  }
}

/** The provider transforms (nikcli's `ProviderTransform`) applied to a one-shot prompt. */
export const prepareDirectCall = (resolved: ResolvedModel, input: DirectCallBase & { readonly prompt: string }): PreparedCall => {
  const messages: ModelMessage[] = [
    ...(input.system ? [{ role: "system", content: input.system } as const] : []),
    { role: "user", content: input.prompt }
  ]
  return prepareCall({ model: transformModelFor(resolved), messages, sessionID: "cadcamfun-direct" })
}

const callSettings = (call: PreparedCall) => ({
  messages: call.messages,
  // System entries stay in `messages` so the cache breakpoints land where the transform put them.
  allowSystemInMessages: true,
  maxOutputTokens: call.maxOutputTokens,
  providerOptions: call.providerOptions,
  ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
  ...(call.topP !== undefined ? { topP: call.topP } : {}),
  ...(call.topK !== undefined ? { topK: call.topK } : {})
})

const usageOf = (usage: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined) => ({
  inputTokens: usage?.inputTokens ?? 0,
  outputTokens: usage?.outputTokens ?? 0
})

/** Removes any occurrence of the key from a message so it can never reach logs or the UI. */
export const scrubSecret = (message: string, secrets: ReadonlyArray<string>): string =>
  secrets.reduce((text, secret) => (secret.length >= 4 ? text.split(secret).join("[redacted]") : text), message)

/** The request/response fields of an AI SDK `APICallError` (or anything shaped like one). */
const failureOf = (error: unknown): ApiFailure => {
  if (typeof error !== "object" || error === null) return { message: String(error) }
  // The SDK wraps its own retries ("Failed after 2 attempts"): the status and headers are on the last error.
  const last = (error as { lastError?: unknown }).lastError
  if (last !== undefined && last !== error) return failureOf(last)
  const e = error as { message?: unknown; statusCode?: unknown; responseBody?: unknown; responseHeaders?: unknown; isRetryable?: unknown }
  return {
    ...(typeof e.message === "string" ? { message: e.message } : {}),
    ...(typeof e.statusCode === "number" ? { statusCode: e.statusCode } : {}),
    ...(typeof e.responseBody === "string" ? { responseBody: e.responseBody } : {}),
    ...(typeof e.responseHeaders === "object" && e.responseHeaders !== null ? { responseHeaders: e.responseHeaders as Record<string, string> } : {}),
    ...(typeof e.isRetryable === "boolean" ? { isRetryable: e.isRetryable } : {})
  }
}

const isAbort = (error: unknown, signal?: AbortSignal): boolean =>
  signal?.aborted === true || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))

export interface DirectModelSettings {
  /** Calls per request including the first; default {@link RETRY_MAX_ATTEMPTS}. */
  readonly retryAttempts?: number
  /** Replaced in tests so a retry does not wait. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

export class DirectModel extends Context.Service<
  DirectModel,
  {
    generateText(input: DirectCallBase & { readonly prompt: string }): Effect.Effect<TextResult, AiError>
    streamText(input: DirectCallBase & { readonly prompt: string }): Stream.Stream<DirectStreamPart, AiError>
    /** Structured output validated twice: by the AI SDK against JSON Schema, then by the Effect Schema. */
    generateObject<A>(input: DirectCallBase & { readonly prompt: string; readonly schema: Schema.Decoder<A> }): Effect.Effect<A, AiError>
  }
>()("cadcamfun/DirectModel") {
  static layerWith = (factory: LanguageModelFactory, settings: DirectModelSettings = {}): Layer.Layer<DirectModel, never, AiCredentials | AiConfig> =>
    Layer.effect(
      DirectModel,
      Effect.gen(function* () {
        const credentials = yield* AiCredentials
        const config = yield* AiConfig
        const retryAttempts = settings.retryAttempts ?? RETRY_MAX_ATTEMPTS
        const sleepFor = settings.sleep ?? retrySleep

        const prepare = Effect.fn("DirectModel.prepare")(function* (selector: ModelSelector | undefined) {
          const status = yield* credentials.status
          // Only the providers `defaultModelFactory` can build a client for; the rest are host-only.
          const configured = new Set<ProviderId>(BUILTIN_PROVIDER_IDS.filter((id) => status[id] === "configured"))
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

        const toError = (error: unknown, signal: AbortSignal | undefined, provider: ProviderId, secrets: ReadonlyArray<string>, modelId?: string): AiError => {
          if (isAbort(error, signal)) return new AiAborted({})
          const failure = failureOf(error)
          const raw = failure.message ?? (error instanceof Error ? error.message : String(error))
          // An overflow is not an outage: waiting does not help, summarising does (nikcli's `ProviderError`).
          if (parseApiFailure({ ...failure, message: raw }).type === "context_overflow") {
            return new AiProviderError({ message: scrubSecret(`${raw}\n${formatOverflowMessage(provider, modelId)}`, secrets), provider, retryable: false })
          }
          return new AiProviderError({ message: scrubSecret(raw, secrets), provider, retryable: retryable({ ...failure, message: raw }) !== undefined })
        }

        /** nikcli's retry: transient failures are asked again after a growing pause, up to {@link RETRY_MAX_ATTEMPTS}. */
        const withRetry = async <A>(call: (signal: AbortSignal) => Promise<A>, signal: AbortSignal): Promise<A> => {
          for (let attempt = 1; ; attempt += 1) {
            try {
              return await call(signal)
            } catch (error) {
              if (attempt >= retryAttempts || isAbort(error, signal) || retryable(failureOf(error)) === undefined) throw error
              await sleepFor(retryDelay(attempt, failureOf(error)), signal)
            }
          }
        }

        const generateTextImpl = Effect.fn("DirectModel.generateText")(function* (input: DirectCallBase & { readonly prompt: string }) {
          const { resolved, model, secrets } = yield* prepare(input.model)
          return yield* Effect.tryPromise({
            try: (signal): Promise<TextResult> =>
              withRetry(async (abortSignal) => {
                const result = await generateText({ model, ...callSettings(prepareDirectCall(resolved, input)), abortSignal, maxRetries: 0 })
                return { text: result.text, model: resolved.modelId, provider: resolved.provider, usage: usageOf(result.usage) }
              }, signal),
            catch: (error) => toError(error, undefined, resolved.provider, secrets, resolved.modelId)
          })
        })

        const streamOnce = (input: DirectCallBase & { readonly prompt: string }, onResolved?: (provider: ProviderId) => void): Stream.Stream<DirectStreamPart, AiError> =>
            Stream.unwrap(
              Effect.gen(function* () {
                const { resolved, model, secrets } = yield* prepare(input.model)
                onResolved?.(resolved.provider)
                const controller = new AbortController()
                yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()))
                const result = streamText({
                  model,
                  ...callSettings(prepareDirectCall(resolved, input)),
                  abortSignal: controller.signal,
                  maxRetries: 1,
                  // Failures arrive as `error` parts below and are reported there; the default handler would also print them.
                  onError: () => undefined
                })
                const parts = Stream.fromAsyncIterable(result.fullStream, (error) =>
                  toError(error, controller.signal, resolved.provider, secrets, resolved.modelId)
                )
                return parts.pipe(
                  Stream.flatMap((part): Stream.Stream<DirectStreamPart, AiError> => {
                    // `streamText` reports provider failures as `error` parts instead of throwing.
                    if (part.type === "error") return Stream.fail(toError(part.error, controller.signal, resolved.provider, secrets, resolved.modelId))
                    if (part.type === "text-delta") return Stream.succeed({ type: "delta", text: part.text })
                    if (part.type === "finish") return Stream.succeed({ type: "finish", usage: usageOf(part.totalUsage) })
                    return Stream.empty
                  })
                )
              })
            )

        /** Another configured route for the same request, when the caller left the provider to us. */
        const fallbackSelector = Effect.fn("DirectModel.fallbackSelector")(function* (failed: ProviderId, requested: ModelSelector | undefined) {
          if (requested?.provider !== undefined) return undefined
          const status = yield* credentials.status
          const next = BUILTIN_PROVIDER_IDS.find((id) => id !== failed && status[id] === "configured")
          return next === undefined ? undefined : ({ provider: next, ...(requested?.tier !== undefined ? { tier: requested.tier } : {}) } satisfies ModelSelector)
        })

        return DirectModel.of({
          generateText: generateTextImpl,

          streamText: (input) => {
            // nikcli's `withStreamFallback`: a stream that fails before it produced anything is run again on another route;
            // output that was already sent is never replayed, and a cancellation is never retried.
            let emitted = false
            let primary: ProviderId | undefined
            return streamOnce(input, (provider) => { primary = provider }).pipe(
              Stream.tap(() => Effect.sync(() => { emitted = true })),
              Stream.catch((error: AiError) =>
                emitted || error._tag !== "AiProviderError" || primary === undefined
                  ? Stream.fail(error)
                  : Stream.unwrap(
                      fallbackSelector(primary, input.model).pipe(
                        Effect.map((selector) => (selector === undefined ? Stream.fail(error) : streamOnce({ ...input, model: selector }).pipe(Stream.catch(() => Stream.fail(error)))))
                      )
                    )
              )
            )
          },

          generateObject: <A>(input: DirectCallBase & { readonly prompt: string; readonly schema: Schema.Decoder<A> }) =>
            Effect.gen(function* () {
              const { resolved, model, secrets } = yield* prepare(input.model)
              const document = Schema.toJsonSchemaDocument(input.schema)
              const aiSchema = jsonSchema<unknown>(
                transformSchema(transformModelFor(resolved), {
                  ...document.schema,
                  ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {})
                }) as Parameters<typeof jsonSchema>[0]
              )
              const raw = yield* Effect.tryPromise({
                try: (signal) =>
                  withRetry(async (abortSignal) => {
                    const result = await generateText({
                      model,
                      ...callSettings(prepareDirectCall(resolved, input)),
                      output: Output.object({ schema: aiSchema }),
                      abortSignal,
                      maxRetries: 0
                    })
                    return result.output as unknown
                  }, signal),
                catch: (error) => toError(error, undefined, resolved.provider, secrets, resolved.modelId)
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
