/**
 * A scripted LLM for deterministic tests.
 *
 * Tests that drive a real model exchange otherwise reach for module-level response globals, hand
 * written SSE strings and polling loops to synchronise on tool calls. All three make failures hard
 * to read: the assertion that fails is nowhere near the response that caused it. `TestLLM` scripts
 * responses in the order they will be consumed, and — by default — fails loudly when the code under
 * test asks for one more than was scripted, which is usually the actual bug.
 *
 * ```ts
 * const llm = TestLLM.make()
 * llm.push(TestLLM.text("hello"))
 * llm.push(TestLLM.toolCall("read", { filePath: "a.ts" }))
 *
 * await program.pipe(Effect.provide(llm.layer), Effect.runPromise)
 * expect(llm.exhausted()).toBe(true)
 * ```
 */
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { LLMClient, RequestExecutor } from "./route"
import * as OpenAIChat from "./protocols/openai-chat"
import type { Service as LLMClientService } from "./route/client"
import type { Service as RequestExecutorService } from "./route/executor"

export namespace TestLLM {
  const SSE_HEADERS = { "content-type": "text/event-stream" } as const
  const FIXTURE_ID = "chatcmpl_testllm"

  export type Env = RequestExecutorService | LLMClientService

  /** One scripted model turn, described semantically rather than as wire bytes. */
  export type Response = {
    /** Assistant text emitted for this turn. */
    readonly text?: string
    /** Tool calls emitted for this turn, in order. */
    readonly toolCalls?: ReadonlyArray<{ readonly id?: string; readonly name: string; readonly input: unknown }>
    /** Defaults to `tool_calls` when the turn has tool calls, `stop` otherwise. */
    readonly finishReason?: string
    readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number }
    /** Fail the request with this HTTP status instead of returning a completion. */
    readonly status?: number
    /** Body to return alongside `status`. */
    readonly body?: string
  }

  /**
   * A model wired to the OpenAI-chat route, which is what {@link make} speaks.
   *
   * Tests that build a `ModelRef` by hand fail with `No LLM route for ...` because the route has to
   * come from the protocol module; going through here removes that trap.
   */
  export const model = (overrides: Partial<Parameters<typeof OpenAIChat.model>[0]> = {}) =>
    OpenAIChat.model({
      id: "test-model",
      baseURL: "https://llm.test/v1",
      headers: { authorization: "Bearer test" },
      ...overrides,
    })

  /** A turn that is only assistant text. */
  export const text = (value: string, extra: Omit<Response, "text"> = {}): Response => ({ text: value, ...extra })

  /** A turn that calls one tool. */
  export const toolCall = (name: string, input: unknown, extra: Omit<Response, "toolCalls"> = {}): Response => ({
    toolCalls: [{ name, input }],
    ...extra,
  })

  /** A turn that fails with an HTTP status, for retry and error-path tests. */
  export const failure = (status: number, body = "scripted failure"): Response => ({ status, body })

  export type Recorded = {
    /** Request body as sent on the wire. */
    readonly body: string
    readonly url: string
  }

  export interface Instance {
    /** Layer providing the LLM runtime backed by this script. */
    readonly layer: Layer.Layer<Env>
    /** Queue one more response. Consumed in push order. */
    readonly push: (response: Response) => void
    /**
     * Response to serve once the queue is empty. Without it, an extra request fails the test
     * instead of silently replaying the last scripted turn.
     */
    readonly fallback: (response: Response) => void
    /** Serve this response for every request, ignoring the queue. */
    readonly always: (response: Response) => void
    /** Requests the code under test actually made, in order. */
    readonly requests: () => ReadonlyArray<Recorded>
    /** True when every scripted response was consumed. */
    readonly exhausted: () => boolean
    /** Number of responses still queued. */
    readonly remaining: () => number
  }

  const encodeChunk = (chunk: unknown) => `data: ${JSON.stringify(chunk)}\n\n`

  const encode = (response: Response): string => {
    const chunks: unknown[] = []
    const calls = response.toolCalls ?? []

    if (response.text !== undefined) {
      chunks.push({
        id: FIXTURE_ID,
        choices: [{ delta: { role: "assistant", content: response.text }, finish_reason: null }],
        usage: null,
      })
    }

    calls.forEach((call, index) => {
      chunks.push({
        id: FIXTURE_ID,
        choices: [
          {
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index,
                  id: call.id ?? `call_${index}`,
                  function: { name: call.name, arguments: JSON.stringify(call.input) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
        usage: null,
      })
    })

    const finish = response.finishReason ?? (calls.length > 0 ? "tool_calls" : "stop")
    chunks.push({ id: FIXTURE_ID, choices: [{ delta: {}, finish_reason: finish }], usage: null })

    if (response.usage) {
      chunks.push({ id: FIXTURE_ID, choices: [], usage: response.usage })
    }

    return `${chunks.map(encodeChunk).join("")}data: [DONE]\n\n`
  }

  /**
   * Builds a scripted LLM.
   *
   * `strict` (the default) turns an unscripted request into a failed request rather than a silent
   * replay, so a test that drives one more turn than it scripted fails at the point of divergence.
   */
  export const make = (options: { readonly strict?: boolean } = {}): Instance => {
    const strict = options.strict ?? true
    const queue: Response[] = []
    const recorded: Recorded[] = []
    let fallbackResponse: Response | undefined
    let alwaysResponse: Response | undefined

    const next = (): Response => {
      if (alwaysResponse) return alwaysResponse
      const scripted = queue.shift()
      if (scripted) return scripted
      if (fallbackResponse) return fallbackResponse
      if (!strict) return { text: "" }
      // 400, not 500: an unscripted request is a mistake in the test, not a transient provider
      // failure. A retryable status would send the executor into its backoff loop and the test
      // would time out instead of reporting what actually went wrong.
      return {
        status: 400,
        body: `TestLLM: unscripted request #${recorded.length}. Push another response, or set fallback()/always().`,
      }
    }

    const httpLayer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.gen(function* () {
          const web = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie)
          const body = yield* Effect.promise(() => web.text())
          recorded.push({ body, url: request.url })

          const response = next()
          if (response.status !== undefined) {
            return HttpClientResponse.fromWeb(
              request,
              new Response(response.body ?? "scripted failure", { status: response.status }),
            )
          }
          return HttpClientResponse.fromWeb(request, new Response(encode(response), { headers: SSE_HEADERS }))
        }),
      ),
    )

    const requestExecutorLayer = RequestExecutor.layer.pipe(Layer.provide(httpLayer))
    const llmClientLayer = LLMClient.layer.pipe(Layer.provide(requestExecutorLayer))

    return {
      layer: Layer.mergeAll(requestExecutorLayer, llmClientLayer),
      push: (response) => {
        queue.push(response)
      },
      fallback: (response) => {
        fallbackResponse = response
      },
      always: (response) => {
        alwaysResponse = response
      },
      requests: () => recorded,
      exhausted: () => queue.length === 0,
      remaining: () => queue.length,
    }
  }

  /** Convenience: a scripted LLM pre-loaded with `responses`. */
  export const of = (...responses: ReadonlyArray<Response>): Instance => {
    const instance = make()
    for (const response of responses) instance.push(response)
    return instance
  }
}
