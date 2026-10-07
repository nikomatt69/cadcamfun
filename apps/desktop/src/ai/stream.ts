/**
 * SSE client for nikcli (spec 08-ai.md §3, WP8).
 *
 * The sidecar's `chatStream` endpoint is `HttpApiSchema.StreamSse({ data: unknown })`,
 * so the typed client resolves to `Effect<Stream<unknown, ...>>`. We narrow that
 * to the public `AiEvent` shape, decode each `data:` line as JSON, and surface
 * a typed transport error when the line does not parse.
 *
 * Aborting the chat uses the same `chatAbort` endpoint the store's `abort()`
 * calls; cancelling the stream is enough to keep the UI responsive.
 */
import { Effect, Queue, Schema, Stream } from "effect"
import type { Client, AppRuntime } from "../state/client.ts"
import type { AiEvent, ProviderId, Tier } from "./types.ts"

export class AiStreamError extends Schema.TaggedError<AiStreamError>()("AiStreamError", {
  message: Schema.String
}, { httpApiStatus: 500 }) {}

const AiEventSchema = Schema.fromJsonString(
  Schema.Struct({
    type: Schema.String,
    sessionId: Schema.String,
    text: Schema.optional(Schema.String),
    callId: Schema.optional(Schema.String),
    tool: Schema.optional(Schema.String),
    input: Schema.optional(Schema.Unknown),
    ok: Schema.optional(Schema.Boolean),
    output: Schema.optional(Schema.String),
    requestId: Schema.optional(Schema.String),
    permission: Schema.optional(Schema.String),
    patterns: Schema.optional(Schema.Array(Schema.String)),
    code: Schema.optional(Schema.String),
    message: Schema.optional(Schema.String),
    usage: Schema.optional(Schema.Struct({
      inputTokens: Schema.Number,
      outputTokens: Schema.Number
    }))
  })
)

const decodeEvent = (json: string): AiEvent => {
  const raw = JSON.parse(json) as Record<string, unknown>
  const type = raw["type"]
  const sessionId = typeof raw["sessionId"] === "string" ? (raw["sessionId"] as string) : ""
  if (type === "delta") return { type: "delta", sessionId, text: typeof raw["text"] === "string" ? raw["text"] : "" }
  if (type === "tool_call") return {
    type: "tool_call", sessionId,
    callId: typeof raw["callId"] === "string" ? (raw["callId"] as string) : "",
    tool: typeof raw["tool"] === "string" ? (raw["tool"] as string) : "",
    input: raw["input"]
  }
  if (type === "tool_result") return {
    type: "tool_result", sessionId,
    callId: typeof raw["callId"] === "string" ? (raw["callId"] as string) : "",
    tool: typeof raw["tool"] === "string" ? (raw["tool"] as string) : "",
    ok: raw["ok"] === true,
    output: typeof raw["output"] === "string" ? (raw["output"] as string) : ""
  }
  if (type === "permission_request") return {
    type: "permission_request", sessionId,
    requestId: typeof raw["requestId"] === "string" ? (raw["requestId"] as string) : "",
    permission: typeof raw["permission"] === "string" ? (raw["permission"] as string) : "",
    patterns: Array.isArray(raw["patterns"]) ? (raw["patterns"] as ReadonlyArray<string>) : []
  }
  if (type === "done") {
    const u = raw["usage"] as { inputTokens?: number; outputTokens?: number } | undefined
    return {
      type: "done", sessionId,
      text: typeof raw["text"] === "string" ? (raw["text"] as string) : "",
      ...(u && typeof u.inputTokens === "number" && typeof u.outputTokens === "number"
        ? { usage: { inputTokens: u.inputTokens, outputTokens: u.outputTokens } } : {})
    }
  }
  if (type === "error") {
    const code = raw["code"] === "config" || raw["code"] === "aborted" || raw["code"] === "internal" ? raw["code"] : "provider"
    return { type: "error", sessionId, code, message: typeof raw["message"] === "string" ? (raw["message"] as string) : "AI request failed" }
  }
  return { type: "error", sessionId, code: "internal", message: `Unknown AI event: ${type}` }
}

export { decodeEvent }

export interface StreamCallbacks {
  readonly onEvent: (event: AiEvent) => void
  readonly onError: (message: string) => void
  readonly onDone: () => void
}

export interface StreamInput {
  readonly message: string
  readonly sessionId: string
  readonly projectId?: string
  readonly context?: string
  readonly model?: { readonly provider: ProviderId; readonly model: string; readonly tier?: Tier }
}

export interface StreamHandle {
  abort(): void
}

/** The full Effect: POST + SSE parsing + per-line decoding, exposed for tests. */
export const streamChatEffect = (
  client: Client,
  input: StreamInput,
  signal?: AbortSignal
): Stream.Stream<AiEvent, AiStreamError> =>
  Stream.callback<AiEvent, AiStreamError>((queue) =>
    Effect.gen(function* () {
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener("abort", abort, { once: true })
      yield* Effect.addFinalizer(() => Effect.sync(() => {
        signal?.removeEventListener("abort", abort)
        controller.abort()
      }))
      const offer = (event: AiEvent) => void Queue.offerUnsafe(queue, event)

      const pump = (async () => {
        try {
          const http = client.ai.chatStream({ payload: {
            message: input.message,
            sessionId: input.sessionId,
            ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
            ...(input.context !== undefined ? { context: input.context } : {}),
            ...(input.model !== undefined ? { model: input.model } : {})
          } })
          const stream = await Effect.runPromise(http)
          const items = Stream.toAsyncIterable(stream)
          for await (const item of items) {
            if (controller.signal.aborted) break
            const decoded = await Effect.runPromise(decodeEventSafely(item))
            offer(decoded)
          }
        } catch (cause) {
          offer({
            type: "error" as const, sessionId: input.sessionId, code: "internal" as const, message: describe(cause)
          })
        }
      })()

      yield* Effect.tryPromise({
        try: async () => { await pump },
        catch: (cause) => new AiStreamError({ message: describe(cause) })
      }).pipe(
        Effect.matchCauseEffect({
          onSuccess: () => Queue.end(queue),
          onFailure: (cause) => Queue.failCause(queue, cause)
        })
      )
    })
  )

const describe = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === "string" ? e : "The AI sidecar is unreachable."

const decodeEventSafely = (raw: unknown): Effect.Effect<AiEvent, AiStreamError> =>
  Effect.try({
    try: () => {
      const text = typeof raw === "string" ? raw : JSON.stringify(raw)
      const value = Schema.decodeUnknownSync(AiEventSchema)(text)
      return decodeEventFromUnknown(value)
    },
    catch: (e) => new AiStreamError({ message: e instanceof Error ? e.message : "Failed to parse AI event." })
  })

const decodeEventFromUnknown = (raw: { type: string; sessionId: string; text?: string; callId?: string; tool?: string; input?: unknown; ok?: boolean; output?: string; requestId?: string; permission?: string; patterns?: ReadonlyArray<string>; code?: string; message?: string; usage?: { inputTokens: number; outputTokens: number } }): AiEvent => {
  if (raw.type === "delta") return { type: "delta", sessionId: raw.sessionId, text: raw.text ?? "" }
  if (raw.type === "tool_call") return { type: "tool_call", sessionId: raw.sessionId, callId: raw.callId ?? "", tool: raw.tool ?? "", input: raw.input }
  if (raw.type === "tool_result") return { type: "tool_result", sessionId: raw.sessionId, callId: raw.callId ?? "", tool: raw.tool ?? "", ok: raw.ok === true, output: raw.output ?? "" }
  if (raw.type === "permission_request") return { type: "permission_request", sessionId: raw.sessionId, requestId: raw.requestId ?? "", permission: raw.permission ?? "", patterns: raw.patterns ?? [] }
  if (raw.type === "done") return {
    type: "done", sessionId: raw.sessionId, text: raw.text ?? "",
    ...(raw.usage ? { usage: { inputTokens: raw.usage.inputTokens, outputTokens: raw.usage.outputTokens } } : {})
  }
  const code = raw.code === "config" || raw.code === "aborted" || raw.code === "internal" ? raw.code : "provider"
  return { type: "error", sessionId: raw.sessionId, code, message: raw.message ?? "AI request failed" }
}

/** Imperative wrapper: drives the Effect stream through callbacks the Solid store owns. */
export const streamChat = (
  deps: { readonly client: Client; readonly runtime: AppRuntime; readonly onEvent: StreamCallbacks["onEvent"]; readonly onError: StreamCallbacks["onError"]; readonly onDone: StreamCallbacks["onDone"] },
  input: StreamInput
): StreamHandle => {
  const controller = new AbortController()
  const program = streamChatEffect(deps.client, input, controller.signal).pipe(
    Stream.runForEach((event) => Effect.sync(() => deps.onEvent(event)))
  )
  const run = deps.runtime.run(program.pipe(Effect.ensuring(Effect.sync(() => deps.onDone()))))
  void run.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    deps.onError(message)
    deps.onDone()
  })
  return {
    abort: () => {
      controller.abort()
    }
  }
}
