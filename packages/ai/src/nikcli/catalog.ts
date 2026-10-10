/**
 * Reading the embedded host's provider catalogue.
 *
 * nikcli merges the models.dev database with the providers declared in
 * `nikcli.json`, so `provider.list()` is the single source of truth for
 * "which providers and models can this app talk to". We read it instead of
 * maintaining a static list by hand (which the reference app had to hand-edit,
 * see `.reference/src/lib/ai/provider/models.ts`).
 */
import { Effect } from "effect"
import type { HostModel, HostProvider } from "@nikcli-ai/sdk-next"
import { AiConfigError } from "../errors.ts"
import type { NikCliRuntime } from "./runtime.ts"

/** One model as the host knows it. */
export interface HostModelInfo {
  readonly id: string
  readonly name: string
  readonly provider: string
  readonly contextWindow: number
  readonly maxOutput: number
  readonly inputWindow?: number
  readonly reasoning: boolean
  readonly variants: ReadonlyArray<string>
  /** The model can be given tools (the `cad_*` catalogue). */
  readonly tools: boolean
  /** The model accepts image input. */
  readonly vision: boolean
  /** USD per million tokens. */
  readonly cost: { readonly input: number; readonly output: number }
}

export interface HostProviderInfo {
  readonly id: string
  readonly name: string
  readonly source: string
  /** How this provider can be authenticated, e.g. `api`, `oauth`. */
  readonly auth: ReadonlyArray<string>
  readonly models: ReadonlyArray<HostModelInfo>
}

const number = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const toModel = (provider: string, id: string, raw: HostModel): HostModelInfo => ({
  id,
  name: raw.name ?? id,
  provider,
  contextWindow: number(raw.limit?.context),
  maxOutput: number(raw.limit?.output),
  ...(number(raw.limit?.input) > 0 ? { inputWindow: number(raw.limit?.input) } : {}),
  reasoning: raw.capabilities?.reasoning === true,
  variants: Object.keys(raw.variants ?? {}).sort(),
  tools: raw.capabilities?.toolcall === true,
  vision: raw.capabilities?.attachment === true || raw.capabilities?.input?.image === true,
  cost: { input: number(raw.cost?.input), output: number(raw.cost?.output) }
})

const toCatalogError = (cause: unknown): AiConfigError =>
  new AiConfigError({
    message: `Could not read the nikcli provider catalogue: ${cause instanceof Error ? cause.message : String(cause)}`
  })

/** Reads every provider and model from the host, with its authentication methods. */
export const hostCatalog = (
  runtime: NikCliRuntime,
  projectId = "default"
): Effect.Effect<ReadonlyArray<HostProviderInfo>, AiConfigError> =>
  Effect.gen(function* () {
    // Read the lazy seed first: it starts on catalogue demand, and
    // `provider.list()` only sees models.dev once `<cache>/models.json` exists.
    yield* Effect.promise(() => runtime.catalogueReady)
    const host = yield* runtime.host(projectId)
    const list = yield* Effect.tryPromise({
      try: async () => (await host.client.provider.list()).all as ReadonlyArray<HostProvider>,
      catch: toCatalogError
    })
    // Authentication methods are decoration (the UI shows how to sign in): a host
    // that cannot list them must not fail the whole catalogue read.
    const authByProvider = yield* Effect.tryPromise({
      try: async () => await host.client.provider.auth(),
      catch: toCatalogError
    }).pipe(Effect.orElseSucceed(() => ({}) as Readonly<Record<string, ReadonlyArray<{ type: string }>>>))

    return list.map((provider) => ({
      id: provider.id,
      name: provider.name ?? provider.id,
      source: provider.source ?? "config",
      auth: (authByProvider[provider.id] ?? []).map((option) => option.type).filter((type) => type !== undefined),
      models: Object.entries(provider.models ?? {})
        .map(([id, raw]) => toModel(provider.id, id, raw))
        .sort((a, b) => a.id.localeCompare(b.id))
    }))
  })

/** Flattened model list with the provider id, the shape the UI model picker consumes. */
export const flattenCatalog = (
  providers: ReadonlyArray<HostProviderInfo>
): ReadonlyArray<HostModelInfo> => providers.flatMap((provider) => provider.models)
