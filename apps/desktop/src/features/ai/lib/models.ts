/**
 * The catalogue + status helpers around `/api/ai/{status,models,credentials,...}`.
 *
 * Wraps the typed client in Effect so the UI components stay pure. Uses the
 * project Effect v4 conventions: `Effect.fn`, `Effect.gen`, `Schema`-typed
 * domain errors via `Schema.TaggedError`.
 */
import { Context, Effect, Layer, Schema, Stream } from "effect"
import type { Client } from "../../../shared/state/client.ts"
import type { AiStatus, ModelInfo, ProviderId, ProviderInfo, Tier } from "./types.ts"

export class AiConfigError extends Schema.TaggedError<AiConfigError>()("AiConfigError", {
  message: Schema.String
}, { httpApiStatus: 400 }) {}

export class AiGatewayError extends Schema.TaggedError<AiGatewayError>()("AiGatewayError", {
  message: Schema.String
}, { httpApiStatus: 502 }) {}

export interface CredentialsInput {
  readonly provider: ProviderId
  readonly key: string
  readonly baseUrl?: string
}

export interface AiCatalog {
  readonly status: Effect.Effect<AiStatus, AiConfigError, never>
  readonly models: Effect.Effect<ReadonlyArray<ModelInfo>, AiConfigError, never>
  /** The whole provider catalogue: what the settings browser lists (spec 08-ai.md §2). */
  readonly providers: Effect.Effect<ReadonlyArray<ProviderInfo>, AiConfigError, never>
  readonly setCredentials: (input: CredentialsInput) => Effect.Effect<AiStatus, AiConfigError, never>
  readonly clearCredentials: (provider: ProviderId) => Effect.Effect<AiStatus, AiConfigError, never>
  readonly feedback: (input: { readonly messageId: string; readonly rating: "up" | "down"; readonly comment?: string }) => Effect.Effect<void, AiConfigError, never>
}

export type AiCatalogService = AiCatalog

export const AiCatalog = Context.Service<AiCatalog, AiCatalog>()("cadcamfun/AiCatalog")

export const layerFromClient = (client: Client): Layer.Layer<AiCatalog, never, never> =>
  Layer.succeed(AiCatalog, makeCatalog(client))

const invalid = (e: unknown): AiConfigError =>
  new AiConfigError({ message: e instanceof Error ? e.message : String(e) })

const fetchStatus = Effect.fn("AiCatalog.status")(function* (client: Client) {
  return yield* client.ai.status().pipe(Effect.mapError(invalid))
})

const fetchModels = Effect.fn("AiCatalog.models")(function* (client: Client) {
  const raw = yield* client.ai.models({ query: { configuredOnly: "true" } }).pipe(Effect.mapError(invalid))
  return raw.map((m) => ({
    id: m.id,
    provider: m.provider,
    // Only the built-in fallback tiers carry one; models.dev entries do not.
    ...(m.tier === undefined ? {} : { tier: m.tier }),
    contextWindow: m.contextWindow,
    tools: m.tools,
    vision: m.vision,
    configured: m.configured
  }))
})

const fetchProviders = Effect.fn("AiCatalog.providers")(function* (client: Client) {
  const raw = yield* client.ai.providers().pipe(Effect.mapError(invalid))
  return raw.map((p): ProviderInfo => ({
    id: p.id,
    name: p.name,
    source: p.source,
    auth: p.auth,
    configured: p.configured,
    ...(p.baseUrl === undefined ? {} : { baseUrl: p.baseUrl }),
    models: p.models
  }))
})

const setCredentials = Effect.fn("AiCatalog.setCredentials")(function* (client: Client, input: CredentialsInput) {
  const status = yield* client.ai.setCredentials({ payload: {
    provider: input.provider,
    key: input.key,
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {})
  } }).pipe(Effect.mapError(invalid))
  return status
})

const clearCredentials = Effect.fn("AiCatalog.clearCredentials")(function* (client: Client, provider: ProviderId) {
  return yield* client.ai.clearCredentials({ params: { provider } }).pipe(Effect.mapError(invalid))
})

const feedback = Effect.fn("AiCatalog.feedback")(function* (client: Client, input: { readonly messageId: string; readonly rating: "up" | "down"; readonly comment?: string }) {
  yield* client.ai.feedback({ payload: {
    messageId: input.messageId,
    rating: input.rating,
    ...(input.comment ? { comment: input.comment } : {})
  } }).pipe(Effect.mapError(invalid))
})

export const makeCatalog = (client: Client): AiCatalog => ({
  status: fetchStatus(client),
  models: fetchModels(client),
  providers: fetchProviders(client),
  setCredentials: (input) => setCredentials(client, input),
  clearCredentials: (provider) => clearCredentials(client, provider),
  feedback: (input) => feedback(client, input)
})

/** Picks a model for a `tier`, falling back across providers in declaration order. */
export const pickModelForTier = (
  models: ReadonlyArray<ModelInfo>,
  tier: Tier
): ModelInfo | undefined => {
  for (const m of models) {
    if (m.tier === tier && m.configured) return m
  }
  return undefined
}

/** Streaming chat effect (typed) for callers that prefer Effect over callbacks. */
export const chatStreamEffect = (
  client: Client,
  input: {
    readonly message: string
    readonly sessionId: string
    readonly projectId?: string
    readonly context?: string
    readonly model?: { readonly provider: ProviderId; readonly model: string; readonly tier?: Tier }
  }
): Stream.Stream<unknown, AiConfigError> =>
  Stream.unwrap(
    client.ai.chatStream({ payload: {
      message: input.message,
      sessionId: input.sessionId,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.context !== undefined ? { context: input.context } : {}),
      ...(input.model !== undefined ? { model: input.model } : {})
    } }).pipe(
      Effect.mapError(invalid),
      Effect.map((raw) => raw.pipe(Stream.mapError((e: unknown) => invalid(e))))
    )
  )