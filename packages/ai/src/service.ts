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
  isBuiltinProviderId,
  resolveModel,
  type BuiltinProviderId,
  type ModelInfo,
  type ModelSelector,
  type ProviderId
} from "./models.ts"
import { flattenCatalog, hostCatalog, type HostModelInfo, type HostProviderInfo } from "./nikcli/catalog.ts"
import { abortHostSession, createHostSession, hostChatStream, sessionExists } from "./nikcli/chat.ts"
import type { NikCliRuntime, ProjectHost } from "./nikcli/runtime.ts"
import { isAssistantMode, SUGGESTED_PROMPTS, type AssistantMode } from "./prompts/modes.ts"
import { systemPrompt } from "./prompts/system.ts"
import {
  ANALYZE_DESIGN,
  AnalyzeDesignOutput,
  DesignSuggestionsSummary,
  MachiningParameters,
  OptimizeGcodeOutput,
  OPTIMIZE_GCODE,
  RECOMMEND_MACHINING_PARAMETERS,
  SUMMARIZE_DESIGN_SUGGESTIONS,
  TITLE_GENERATION,
  TitleOutput,
  clipForPrompt,
  renderPrompt,
  type PromptTemplate
} from "./prompts/workflows.ts"

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
  readonly models: Effect.Effect<ReadonlyArray<ModelEntry>, AiConfigError>
  /** Every provider with its models, auth methods and key state. Fails only when the catalogue cannot be read. */
  readonly providers: Effect.Effect<ReadonlyArray<ProviderEntry>, AiConfigError>
  readonly chat: (input: ChatInput) => Stream.Stream<AiEvent, AiError>
  readonly complete: (input: { prompt: string; system?: string; model?: ModelSelector }) => Effect.Effect<{ text: string; model: string }, AiError>
  readonly generate: <A>(input: { prompt: string; schema: Schema.Decoder<A>; system?: string; model?: ModelSelector }) => Effect.Effect<A, AiError>
  /** Starter questions for an assistant mode; an unknown mode falls back to `general`. */
  readonly suggestedFor: (mode: string) => ReadonlyArray<string>
  /** A 3–6 word sidebar title for a conversation excerpt. */
  readonly suggestTitle: (input: { excerpt: string; model?: ModelSelector }) => Effect.Effect<TitleOutput, AiError>
  readonly analyzeDesign: (input: { description: string; layer?: string; machine?: string; model?: ModelSelector }) => Effect.Effect<AnalyzeDesignOutput, AiError>
  readonly recommendMachiningParameters: (input: { material: string; tool: string; operation: string; machine?: string; model?: ModelSelector }) => Effect.Effect<MachiningParameters, AiError>
  readonly optimizeGcode: (input: { gcode: string; material?: string; machineType?: string; constraints?: string; model?: ModelSelector }) => Effect.Effect<OptimizeGcodeOutput, AiError>
  readonly summarizeDesignSuggestions: (input: { elements: string; currentOperation?: string; currentTool?: string; model?: ModelSelector }) => Effect.Effect<DesignSuggestionsSummary, AiError>
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

      /**
       * The host catalogue, cached for a minute: it is the whole models.dev database
       * (~1.5 MB / ~8k models) and the settings screen reads it on every visit.
       */
      const catalogCache = yield* Ref.make<Option.Option<{ readonly at: number; readonly value: ReadonlyArray<HostProviderInfo> }>>(
        Option.none()
      )
      const CATALOG_TTL_MS = 60_000
      const catalogOf = (runtime: NikCliRuntime): Effect.Effect<ReadonlyArray<HostProviderInfo>, AiConfigError> =>
        Effect.gen(function* () {
          const cached = yield* Ref.get(catalogCache)
          if (Option.isSome(cached) && Date.now() - cached.value.at < CATALOG_TTL_MS) return cached.value.value
          const value = yield* hostCatalog(runtime)
          yield* Ref.set(catalogCache, Option.some({ at: Date.now(), value }))
          return value
        })

      /** The built-in tier defaults shaped as host models: direct mode has no catalogue to read. */
      const builtinModels = (provider: BuiltinProviderId): ReadonlyArray<HostModelInfo> =>
        allModels([provider]).map((m) => ({
          id: m.id,
          name: m.id,
          provider,
          contextWindow: m.contextWindow,
          maxOutput: 16_000,
          tools: m.tools,
          vision: m.vision,
          cost: { input: 0, output: 0 }
        }))

      const providers = Effect.gen(function* () {
        const ok = yield* configured
        const status = yield* credentials.status
        if (Option.isNone(host)) {
          return BUILTIN_PROVIDER_IDS.map((id): ProviderEntry => ({
            id, name: id, source: "config", auth: ["api"], models: builtinModels(id), configured: ok.has(id)
          }))
        }
        const catalog = yield* catalogOf(host.value.runtime)
        return catalog.map((provider): ProviderEntry => ({
          ...provider,
          configured: ok.has(provider.id) || ok.has("gateway")
        })).concat(
          // Keys saved for a provider the host no longer advertises stay visible/editable.
          Object.keys(status)
            .filter((id) => status[id] === "configured" && !catalog.some((p) => p.id === id))
            .map((id): ProviderEntry => ({
              id,
              name: id,
              source: "config",
              auth: ["api"],
              models: isBuiltinProviderId(id) ? builtinModels(id) : [],
              configured: true
            }))
        )
      })

      const models = Effect.gen(function* () {
        const ok = yield* configured
        if (Option.isSome(host)) {
          const catalog = yield* catalogOf(host.value.runtime)
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

      /**
       * One structured workflow call: render a `PromptTemplate`, ask the model for the
       * matching schema and decode it. Every prompt here says "Output strict JSON only",
       * so a malformed reply surfaces as an `AiConfigError`/provider error rather than
       * silently reaching the UI.
       */
      const workflow = <A>(
        template: PromptTemplate,
        variables: Readonly<Record<string, string>>,
        schema: Schema.Decoder<A>,
        model?: ModelSelector
      ): Effect.Effect<A, AiError> => {
        const prompt = renderPrompt(template, variables)
        return direct.generateObject({ prompt: prompt.user, system: prompt.system, schema, model })
      }

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
        suggestedFor: (mode) => SUGGESTED_PROMPTS[isAssistantMode(mode) ? mode : "general"],
        suggestTitle: (input) =>
          workflow(TITLE_GENERATION, { excerpt: clipForPrompt(input.excerpt) }, TitleOutput, input.model),
        analyzeDesign: (input) =>
          workflow(
            ANALYZE_DESIGN,
            {
              description: clipForPrompt(input.description),
              layer: input.layer ?? "",
              machine: input.machine ?? ""
            },
            AnalyzeDesignOutput,
            input.model
          ),
        recommendMachiningParameters: (input) =>
          workflow(
            RECOMMEND_MACHINING_PARAMETERS,
            { material: input.material, tool: input.tool, operation: input.operation, machine: input.machine ?? "" },
            MachiningParameters,
            input.model
          ),
        optimizeGcode: (input) =>
          workflow(
            OPTIMIZE_GCODE,
            {
              gcode: clipForPrompt(input.gcode),
              material: input.material ?? "",
              machineType: input.machineType ?? "CNC",
              constraints: input.constraints ?? ""
            },
            OptimizeGcodeOutput,
            input.model
          ),
        summarizeDesignSuggestions: (input) =>
          workflow(
            SUMMARIZE_DESIGN_SUGGESTIONS,
            {
              elements: clipForPrompt(input.elements),
              currentOperation: input.currentOperation ?? "",
              currentTool: input.currentTool ?? ""
            },
            DesignSuggestionsSummary,
            input.model
          ),
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
