import { Context, Effect, Layer, Option, Redacted, Scope } from "effect"
import { AiConfigError } from "./errors.ts"
import { PROVIDER_IDS, type ProviderId } from "./models.ts"

export interface StoredCredential {
  readonly key: Redacted.Redacted<string>
  readonly baseUrl?: string
}

export type CredentialChange =
  | { readonly _tag: "set"; readonly provider: ProviderId; readonly credential: StoredCredential }
  | { readonly _tag: "clear"; readonly provider: ProviderId }

/** A consumer of credential changes (the embedded host pushes keys with `provider.api.set`). */
export interface CredentialSink {
  readonly apply: (change: CredentialChange) => Effect.Effect<void, AiConfigError>
}

export type CredentialStatus = "configured" | "missing"

export class AiCredentials extends Context.Service<
  AiCredentials,
  {
    set(provider: ProviderId, key: Redacted.Redacted<string>, opts?: { baseUrl?: string }): Effect.Effect<void, AiConfigError>
    clear(provider: ProviderId): Effect.Effect<void>
    status: Effect.Effect<Record<ProviderId, CredentialStatus>>
    /** In-memory lookup used by `DirectModel`. */
    get(provider: ProviderId): Effect.Effect<Option.Option<StoredCredential>>
    /**
     * Replays current credentials to `sink` and applies every later change until the
     * scope closes; on close all keys are cleared from the sink.
     */
    attach(sink: CredentialSink): Effect.Effect<void, AiConfigError, Scope.Scope>
  }
>()("cadcamfun/AiCredentials") {
  /** Keys live in memory only; nothing is persisted by this service. */
  static layer: Layer.Layer<AiCredentials> = Layer.sync(AiCredentials, () => {
    const store = new Map<ProviderId, StoredCredential>()
    const sinks = new Set<CredentialSink>()

    const broadcast = (change: CredentialChange) =>
      Effect.forEach([...sinks], (sink) => sink.apply(change), { discard: true })

    const validateBaseUrl = (provider: ProviderId, baseUrl: string | undefined) => {
      if (baseUrl === undefined) return Effect.void
      try {
        const url = new URL(baseUrl)
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol")
        return Effect.void
      } catch {
        return Effect.fail(new AiConfigError({ message: "The base URL is not a valid http(s) URL.", provider }))
      }
    }

    return AiCredentials.of({
      set: (provider, key, opts) =>
        Effect.gen(function* () {
          if (!PROVIDER_IDS.includes(provider)) {
            return yield* new AiConfigError({ message: `Unknown provider "${String(provider)}".` })
          }
          if (Redacted.value(key).trim().length === 0) {
            return yield* new AiConfigError({ message: "The API key is empty.", provider })
          }
          yield* validateBaseUrl(provider, opts?.baseUrl)
          const credential: StoredCredential = {
            key,
            ...(opts?.baseUrl ? { baseUrl: opts.baseUrl.replace(/\/+$/, "") } : {})
          }
          store.set(provider, credential)
          yield* broadcast({ _tag: "set", provider, credential })
        }),
      clear: (provider) =>
        Effect.gen(function* () {
          store.delete(provider)
          yield* broadcast({ _tag: "clear", provider }).pipe(Effect.ignore)
        }),
      status: Effect.sync(
        () => Object.fromEntries(PROVIDER_IDS.map((id) => [id, store.has(id) ? "configured" : "missing"])) as Record<ProviderId, CredentialStatus>
      ),
      get: (provider) => Effect.sync(() => Option.fromNullishOr(store.get(provider))),
      attach: (sink) =>
        Effect.gen(function* () {
          sinks.add(sink)
          yield* Effect.addFinalizer(() =>
            Effect.gen(function* () {
              sinks.delete(sink)
              for (const provider of store.keys()) yield* sink.apply({ _tag: "clear", provider }).pipe(Effect.ignore)
            })
          )
          for (const [provider, credential] of store) yield* sink.apply({ _tag: "set", provider, credential })
        })
    })
  })
}
