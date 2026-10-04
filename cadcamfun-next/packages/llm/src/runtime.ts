import { Effect, Layer, ManagedRuntime, Stream } from "effect"
import { FetchHttpClient } from "effect/http"
import { LLMClient, Service as LLMClientService } from "./route/client"
import { RequestExecutor } from "./route/executor"
import type { LLMEvent, LLMRequest, LLMResponse, PreparedRequest } from "./schema"
import { generateObject as llmGenerateObject, type GenerateObjectDynamicOptions } from "./llm"
import type { StreamOptions } from "./route/client"

const llmLayer = Layer.provide(LLMClient.layer, RequestExecutor.defaultLayer)

type Runtime = ManagedRuntime.ManagedRuntime<LLMClientService, never>
let _runtime: Runtime | undefined
const getRuntime = (): Runtime => {
  if (!_runtime) _runtime = ManagedRuntime.make(llmLayer)
  return _runtime
}

export const prepareRequest = (request: LLMRequest): Promise<PreparedRequest> =>
  getRuntime().runPromise(LLMClient.prepare(request))

export interface RuntimeStreamOptions extends StreamOptions {
  /**
   * Fetch the request is sent through, in place of `globalThis.fetch`. Provider auth that is not a static
   * key (OAuth bearer renewal, an account token resolved per request, a rewritten endpoint) lives in a
   * wrapped fetch, so a stream that cannot take one cannot serve those providers.
   */
  readonly fetch?: typeof globalThis.fetch
  /** Cancels a `generate*` call (a stream is cancelled by dropping its iterator). */
  readonly signal?: AbortSignal
}

export const streamRequest = (request: LLMRequest, options?: RuntimeStreamOptions): AsyncIterable<LLMEvent> => {
  const { fetch, signal: _signal, ...streamOptions } = options ?? {}
  const events = LLMClient.stream(request, streamOptions).pipe(Stream.provide(llmLayer))
  return Stream.toAsyncIterable(fetch ? events.pipe(Stream.provideService(FetchHttpClient.Fetch, fetch)) : events)
}

const withFetch = <A, E, R>(effect: Effect.Effect<A, E, R>, fetch: typeof globalThis.fetch | undefined) =>
  fetch ? effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)) : effect

/** Run a request to completion and collect it, through `options.fetch` when given. */
export const generateRequest = (request: LLMRequest, options?: RuntimeStreamOptions): Promise<LLMResponse> => {
  const { fetch, signal, ...streamOptions } = options ?? {}
  return Effect.runPromise(
    withFetch(LLMClient.generate(request, streamOptions).pipe(Effect.provide(llmLayer)), fetch),
    signal ? { signal } : undefined,
  )
}

/** Run a model and return the object it was forced to produce for `jsonSchema` (see `LLM.generateObject`). */
export const generateObjectRequest = (
  input: GenerateObjectDynamicOptions,
  options?: Pick<RuntimeStreamOptions, "fetch" | "signal">,
): Promise<{ readonly object: unknown; readonly response: LLMResponse }> =>
  Effect.runPromise(
    withFetch(llmGenerateObject(input).pipe(Effect.provide(llmLayer)), options?.fetch),
    options?.signal ? { signal: options.signal } : undefined,
  )

export const dispose = async (): Promise<void> => {
  if (_runtime) {
    await _runtime.dispose()
    _runtime = undefined
  }
}
