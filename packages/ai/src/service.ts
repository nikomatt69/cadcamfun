import { Context, Effect, Layer, Option, Ref, Schema, Stream } from "effect"
import { AiConfig } from "./ai-config.ts"
import { AiCredentials } from "./credentials.ts"
import { DirectModel } from "./direct-model.ts"
import { AiCache } from "./cache.ts"
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
import { prepareAttachments, type Attachment } from "./attachments.ts"
import { abortHostSession, createHostSession, hostChatStream, queueHostMessage, readHostSessionState, sessionExists, taskInfos, type HostSessionState, type PendingDelivery } from "./nikcli/chat.ts"
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
export class AiHost extends Context.Service<AiHost, {
  readonly runtime: NikCliRuntime
  /**
   * Runtime-wide scheduler the host instantiates up-front so every project
   * advertises the `agent_task*` tools. `AiBackground` reads this off the host
   * to build its worker runner without allocating a second one.
   */
  readonly scheduler: import("./nikcli/background-tasks.ts").BackgroundTaskManager
}>()("cadcamfun/AiHost") {}

/**
 * The runtime-wide background-task scheduler. One instance per host runtime;
 * the sidecar owns it because it has to be disposed on shutdown, and the HTTP
 * `removeSession` handler must call `cancelForParent` to stop the workers
 * associated with an aborted parent session.
 */
export class AiBackground extends Context.Service<AiBackground, {
  readonly runner: import("./nikcli/background-tools-runner.ts").BackgroundToolsRunner
  /** Cancel every active/queued worker owned by the parent session. */
  readonly cancelForParent: (owner: import("./nikcli/background-tasks.ts").BackgroundTaskOwner) => Effect.Effect<number>
  /** Cancel every active/queued worker and refuse future enqueues. */
  readonly dispose: () => Effect.Effect<void>
}>()("cadcamfun/AiBackground") {}

export interface ChatInput {
  readonly sessionId?: string
  readonly projectId?: string
  readonly message: string
  readonly attachments?: ReadonlyArray<Attachment>
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
  readonly availableModels: Effect.Effect<ReadonlyArray<ModelEntry>, AiConfigError>
  readonly invalidateCatalogue: Effect.Effect<void>
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
  /** Resolve client identity, stop and join children, then remove the host session. */
  readonly removeSession: (sessionId: string, projectId?: string) => Effect.Effect<boolean>
  /** Where a conversation stands, for a client that lost its connection mid-turn (`busy: false` when there is no host session). */
  readonly sessionState: (sessionId: string, projectId?: string) => Effect.Effect<HostSessionState, AiError>
  /** A message written while the agent works: admitted to the host's pending queue (or steered in) and answered by the running turn. */
  readonly queue: (input: { sessionId: string; message: string; delivery?: PendingDelivery }) => Effect.Effect<void, AiError>
}>()("cadcamfun/AiService") {
  static readonly layer: Layer.Layer<AiService, never, AiCredentials | AiConfig | DirectModel> = Layer.effect(
    AiService,
    Effect.gen(function* () {
      const credentials = yield* AiCredentials
      const config = yield* AiConfig
      const direct = yield* DirectModel
      const cache = yield* AiCache
      const host = yield* Effect.serviceOption(AiHost)
      const background = yield* Effect.serviceOption(AiBackground)
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
      const [cachedCatalog, invalidateCatalog] = yield* Effect.cachedInvalidateWithTTL(
        Option.isSome(host) ? hostCatalog(host.value.runtime) : Effect.succeed([] as ReadonlyArray<HostProviderInfo>),
        "1 minute"
      )
      const catalogOf = (_runtime: NikCliRuntime) => cachedCatalog.pipe(Effect.tapError(() => invalidateCatalog))

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
        return Effect.gen(function*() {
          const credentialRevision = yield* credentials.revision
          const payload = { template: { system: template.system, user: template.user }, variables, model: model ?? null, credentialRevision }
          const key = cache.keyFor(payload)
          const hit = yield* cache.get<A>(key)
          if (hit !== undefined) return hit
          const result = yield* direct.generateObject({ prompt: prompt.user, system: prompt.system, schema, model })
          yield* cache.set(key, result)
          return result
        })
      }

      const chat = (input: ChatInput): Stream.Stream<AiEvent, AiError> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const ok = yield* configured
            const resolved = resolveModel(input.model, { configured: ok, forceGateway: config.forceGateway })
            if (resolved instanceof AiConfigError) return yield* resolved
            const system = systemPrompt(input.context, undefined, resolved.modelId)
            const attached = prepareAttachments(input.projectId ?? "default", input.attachments)
            const message = input.message + attached.note

            if (Option.isSome(host)) {
              const projectHost = yield* host.value.runtime.host(input.projectId ?? "default")
              const target = yield* ensureSession(projectHost, input.sessionId)
              return hostChatStream({
                host: target.host, sessionId: target.sessionId, message, files: attached.parts, system,
                model: { providerID: resolved.provider, modelID: resolved.modelId }
              }).pipe(Stream.mapError((e): AiError => e))
            }

            // No embedded host: a stateless one-shot stream through the AI SDK.
            const sessionId = input.sessionId ?? crypto.randomUUID()
            let text = ""
            return direct.streamText({ prompt: message, files: attached.parts, system, model: input.model ?? { provider: resolved.provider, model: resolved.modelId } }).pipe(
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
        availableModels: configured.pipe(Effect.flatMap((ids) => ids.size === 0
          ? Effect.succeed([] as ReadonlyArray<ModelEntry>)
          : models.pipe(Effect.map((entries) => entries.filter((entry) => entry.configured))))),
        providers,
        invalidateCatalogue: invalidateCatalog,
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
        sessionState: (sessionId, projectId) =>
          Effect.gen(function* () {
            if (Option.isNone(host)) return { busy: false, text: "" } satisfies HostSessionState
            const withTasks = (state: HostSessionState, owner: { projectId: string; parentSessionId: string }): HostSessionState => {
              const tasks = taskInfos(host.value.scheduler, owner)
              return tasks.length > 0 ? { ...state, tasks } : state
            }
            const mapped = (yield* Ref.get(sessionMap)).get(sessionId)
            if (mapped !== undefined) {
              return withTasks(yield* readHostSessionState(mapped.host, mapped.sessionId), { projectId: mapped.host.projectId, parentSessionId: mapped.sessionId })
            }
            const projectHost = yield* host.value.runtime.host(projectId ?? "default")
            if (!(yield* sessionExists(projectHost, sessionId))) return { busy: false, text: "" } satisfies HostSessionState
            return withTasks(yield* readHostSessionState(projectHost, sessionId), { projectId: projectHost.projectId, parentSessionId: sessionId })
          }),
        queue: ({ sessionId, message, delivery }) =>
          Effect.gen(function* () {
            const mapped = (yield* Ref.get(sessionMap)).get(sessionId)
            if (mapped === undefined) return yield* new AiConfigError({ message: "There is no running conversation to add this message to." })
            yield* queueHostMessage(mapped.host, mapped.sessionId, message, delivery ?? "queue")
          }),
        removeSession: Effect.fn("AiService.removeSession")(function* (sessionId: string, projectId?: string) {
          (yield* Ref.get(controllers)).get(sessionId)?.abort()
          if (Option.isNone(host)) return false
          const mapped = (yield* Ref.get(sessionMap)).get(sessionId)
          const target = mapped !== undefined
            ? Option.some(mapped)
            : yield* host.value.runtime.host(projectId ?? "default").pipe(
              Effect.map((projectHost) => ({ host: projectHost, sessionId })), Effect.option)
          if (Option.isNone(target)) return false
          const resolved = target.value
          if (Option.isSome(background)) {
            yield* background.value.cancelForParent({ projectId: resolved.host.projectId, parentSessionId: resolved.sessionId })
          }
          yield* abortHostSession(resolved.host, resolved.sessionId)
          const removed = yield* Effect.promise(() => resolved.host.client.session.remove({ sessionID: resolved.sessionId }).catch(() => false))
          yield* Ref.update(sessionMap, (map) => {
            for (const [clientId, binding] of map) {
              if (binding.host === resolved.host && binding.sessionId === resolved.sessionId) map.delete(clientId)
            }
            return map
          })
          return removed
        }),
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
  ).pipe(Layer.provide(AiCache.layer()))
}

export type { ProviderId }
export { AiAborted, AiProviderError }
