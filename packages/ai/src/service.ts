import { Context, Effect, Layer, Option, Ref, Schema, Stream } from "effect"
import { AiConfig } from "./ai-config.ts"
import { AiCredentials } from "./credentials.ts"
import { DirectModel } from "./direct-model.ts"
import { AiAborted, AiConfigError, AiProviderError, type AiError } from "./errors.ts"
import type { AiEvent } from "./events.ts"
import { analyzeGcode, type GcodeReport, type MachineProfile } from "./gcode-analysis.ts"
import { PROVIDER_IDS, allModels, resolveModel, type ModelInfo, type ModelSelector, type ProviderId } from "./models.ts"
import { abortHostSession, createHostSession, hostChatStream } from "./nikcli/chat.ts"
import type { NikCliRuntime } from "./nikcli/runtime.ts"
import { systemPrompt } from "./prompts/system.ts"

/** The embedded nikcli host, when the sidecar started it; chat falls back to `DirectModel` without it. */
export class AiHost extends Context.Service<AiHost, { readonly runtime: NikCliRuntime }>()("cadcamfun/AiHost") {}

export interface ChatInput {
  readonly sessionId?: string
  readonly projectId?: string
  readonly message: string
  /** Free-text project context appended to the system prompt. */
  readonly context?: string
  readonly model?: ModelSelector
}

export interface ModelEntry extends ModelInfo {
  readonly configured: boolean
}

export class AiService extends Context.Service<AiService, {
  /** Every catalogue model; `configured` is true when its provider (or the gateway) has a key. */
  readonly models: Effect.Effect<ReadonlyArray<ModelEntry>>
  readonly chat: (input: ChatInput) => Stream.Stream<AiEvent, AiError>
  readonly complete: (input: { prompt: string; system?: string; model?: ModelSelector }) => Effect.Effect<{ text: string; model: string }, AiError>
  readonly generate: <A>(input: { prompt: string; schema: Schema.Decoder<A>; system?: string; model?: ModelSelector }) => Effect.Effect<A, AiError>
  readonly analyzeGcode: (input: { gcode: string; machine?: MachineProfile }) => Effect.Effect<GcodeReport>
  readonly abort: (sessionId: string) => Effect.Effect<void>
}>()("cadcamfun/AiService") {
  static readonly layer: Layer.Layer<AiService, never, AiCredentials | AiConfig | DirectModel> = Layer.effect(
    AiService,
    Effect.gen(function* () {
      const credentials = yield* AiCredentials
      const config = yield* AiConfig
      const direct = yield* DirectModel
      const host = yield* Effect.serviceOption(AiHost)
      const controllers = yield* Ref.make(new Map<string, AbortController>())

      const configured = Effect.gen(function* () {
        const status = yield* credentials.status
        return new Set(PROVIDER_IDS.filter((id) => status[id] === "configured"))
      })

      const models = Effect.gen(function* () {
        const ok = yield* configured
        return allModels().map((m): ModelEntry => ({ ...m, configured: ok.has(m.provider) || ok.has("gateway") }))
      })

      const chat = (input: ChatInput): Stream.Stream<AiEvent, AiError> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const ok = yield* configured
            const resolved = resolveModel(input.model, { configured: ok, forceGateway: config.forceGateway })
            if (resolved instanceof AiConfigError) return yield* resolved
            const system = systemPrompt(input.context)

            if (Option.isSome(host)) {
              const projectHost = yield* host.value.runtime.host(input.projectId ?? "default")
              const sessionId = input.sessionId ?? (yield* createHostSession(projectHost, "CADCAMFUN chat"))
              return hostChatStream({
                host: projectHost, sessionId, message: input.message, system,
                model: { providerID: resolved.provider, modelID: resolved.modelId }
              }).pipe(Stream.mapError((e): AiError => e))
            }

            // No embedded host: a stateless one-shot stream through the AI SDK.
            const sessionId = input.sessionId ?? crypto.randomUUID()
            let text = ""
            return direct.streamText({ prompt: input.message, system, model: input.model ?? { provider: resolved.provider, model: resolved.modelId } }).pipe(
              Stream.flatMap((part): Stream.Stream<AiEvent> => {
                if (part.type === "delta") { text += part.text; return Stream.succeed({ type: "delta", sessionId, text: part.text }) }
                return Stream.succeed({ type: "done", sessionId, text, usage: part.usage })
              }),
              Stream.catch((error): Stream.Stream<AiEvent> =>
                Stream.succeed({
                  type: "error", sessionId,
                  code: error._tag === "AiAborted" ? "aborted" : error._tag === "AiConfigError" ? "config" : "provider",
                  message: error._tag === "AiAborted" ? "The request was cancelled." : error.message
                }))
            )
          })
        )

      return AiService.of({
        models,
        chat,
        complete: (input) => direct.generateText(input).pipe(Effect.map((r) => ({ text: r.text, model: r.model }))),
        generate: (input) => direct.generateObject(input),
        analyzeGcode: (input) => Effect.sync(() => analyzeGcode(input.gcode, input.machine)),
        abort: (sessionId) =>
          Effect.gen(function* () {
            const map = yield* Ref.get(controllers)
            map.get(sessionId)?.abort()
            if (Option.isSome(host)) {
              const projectHost = yield* host.value.runtime.host("default").pipe(Effect.option)
              if (Option.isSome(projectHost)) yield* abortHostSession(projectHost.value, sessionId)
            }
          })
      })
    })
  )
}

export type { ProviderId }
export { AiAborted, AiProviderError }
