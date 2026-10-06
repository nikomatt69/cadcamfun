import { Context, Effect, Layer, Option, Ref, Schema, Stream } from "effect"
import { AiConfig } from "./ai-config.ts"
import { AiCredentials } from "./credentials.ts"
import { DirectModel } from "./direct-model.ts"
import { AiAborted, AiConfigError, AiProviderError, type AiError } from "./errors.ts"
import type { AiEvent } from "./events.ts"
import { analyzeGcode, type GcodeReport, type MachineProfile } from "./gcode-analysis.ts"
import {
  BUILTIN_PROVIDER_IDS,
  allModels,
  resolveModel,
  type ModelInfo,
  type ModelSelector,
  type ProviderId
} from "./models.ts"
import { flattenCatalog, hostCatalog, type HostProviderInfo } from "./nikcli/catalog.ts"
import { abortHostSession, createHostSession, hostChatStream, sessionExists } from "./nikcli/chat.ts"
import type { NikCliRuntime, ProjectHost } from "./nikcli/runtime.ts"
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

/** One provider as the UI needs it: what the host knows plus our key state. */
export interface ProviderEntry extends HostProviderInfo {
  readonly configured: boolean
  /** Set when the user overrode the base URL (OpenAI-compatible endpoints). */
  readonly baseUrl?: string
}

export class AiService extends Context.Service<AiService, {
  /** Every model the host knows; `configured` is true when its provider (or the gateway) has a key. */
  readonly models: Effect.Effect<ReadonlyArray<ModelEntry>>
  /** Every provider with its models, auth methods and key state. */
  readonly providers: Effect.Effect<ReadonlyArray<ProviderEntry>>
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
      /** Client session id (owned by the UI) → the host session it actually talks to. */
      const sessionMap = yield* Ref.make(new Map<string, { host: ProjectHost; sessionId: string }>())

      const configured = Effect.gen(function* () {
        const status = yield* credentials.status
        // Builtins first (declaration order matters for the "no selector" rule),
        // then every other provider the user saved a key for, in a stable order.
        const extras = Object.keys(status).filter((id) => status[id] === "configured").sort()
        return new Set<ProviderId>([
          ...BUILTIN_PROVIDER_IDS.filter((id) => status[id] === "configured"),
          ...extras
        ])
      })

      const providers = Effect.gen(function* () {
        const ok = yield* configured
        const status = yield* credentials.status
        if (Option.isNone(host)) {
          return BUILTIN_PROVIDER_IDS.map((id): ProviderEntry => ({
            id, name: id, source: "config", auth: ["api"], models: [], configured: ok.has(id)
          }))
        }
        const catalog = yield* hostCatalog(host.value.runtime)
        return catalog.map((provider): ProviderEntry => ({
          ...provider,
          configured: ok.has(provider.id) || ok.has("gateway")
        })).concat(
          // Keys saved for a provider the host no longer advertises stay visible/editable.
          Object.keys(status)
            .filter((id) => status[id] === "configured" && !catalog.some((p) => p.id === id))
            .map((id): ProviderEntry => ({ id, name: id, source: "config", auth: ["api"], models: [], configured: true }))
        )
      })

      const models = Effect.gen(function* () {
        const ok = yield* configured
        if (Option.isSome(host)) {
          const catalog = yield* hostCatalog(host.value.runtime)
          return flattenCatalog(catalog).map((m): ModelEntry => ({
            id: m.id,
            provider: m.provider,
            contextWindow: m.contextWindow,
            tools: m.tools,
            vision: m.vision,
            configured: ok.has(m.provider) || ok.has("gateway")
          }))
        }
        return allModels().map((m): ModelEntry => ({ ...m, configured: ok.has(m.provider) || ok.has("gateway") }))
      })

      /**
       * The UI owns its session id, but the host owns the conversation. Bind the
       * two here and verify the binding before every prompt: a turn that failed
       * before the host session existed (no key yet, provider error) otherwise
       * leaves the UI pointing at a session that was never created, and the next
       * prompt comes back as an opaque `UnexpectedStatus`.
       */
      const ensureSession = (
        projectHost: ProjectHost,
        clientSessionId: string | undefined
      ): Effect.Effect<{ host: ProjectHost; sessionId: string }, AiConfigError> =>
        Effect.gen(function* () {
          if (clientSessionId !== undefined) {
            const mapped = (yield* Ref.get(sessionMap)).get(clientSessionId)
            if (mapped !== undefined) {
              if (yield* sessionExists(mapped.host, mapped.sessionId)) return mapped
              yield* Ref.update(sessionMap, (map) => {
                map.delete(clientSessionId)
                return map
              })
            }
          }
          const sessionId = yield* createHostSession(projectHost, "CADCAMFUN chat")
          const target = { host: projectHost, sessionId }
          if (clientSessionId !== undefined) {
            yield* Ref.update(sessionMap, (map) => {
              map.set(clientSessionId, target)
              return map
            })
          }
          return target
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
              const target = yield* ensureSession(projectHost, input.sessionId)
              return hostChatStream({
                host: target.host, sessionId: target.sessionId, message: input.message, system,
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
        providers,
        chat,
        complete: (input) => direct.generateText(input).pipe(Effect.map((r) => ({ text: r.text, model: r.model }))),
        generate: (input) => direct.generateObject(input),
        analyzeGcode: (input) => Effect.sync(() => analyzeGcode(input.gcode, input.machine)),
        abort: (sessionId) =>
          Effect.gen(function* () {
            const map = yield* Ref.get(controllers)
            map.get(sessionId)?.abort()
            if (Option.isNone(host)) return
            // Abort the host session this client session is bound to; the id the
            // UI knows is not the host's own id, so resolve it through the map.
            const mapped = (yield* Ref.get(sessionMap)).get(sessionId)
            if (mapped !== undefined) {
              yield* abortHostSession(mapped.host, mapped.sessionId)
              return
            }
            const projectHost = yield* host.value.runtime.host("default").pipe(Effect.option)
            if (Option.isSome(projectHost)) yield* abortHostSession(projectHost.value, sessionId)
          })
      })
    })
  )
}

export type { ProviderId }
export { AiAborted, AiProviderError }
