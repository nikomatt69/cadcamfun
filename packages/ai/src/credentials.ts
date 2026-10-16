import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { Context, Effect, Layer, Option, Redacted, Scope } from "effect"
import { AiConfigError } from "./errors.ts"
import { readOAuthGrants } from "./nikcli/oauth-store.ts"
import { BUILTIN_PROVIDER_IDS, isProviderId, type ProviderId } from "./models.ts"

export interface StoredCredential {
  readonly key: Redacted.Redacted<string>
  readonly baseUrl?: string
}

export type CredentialChange =
  | { readonly _tag: "oauth"; readonly provider: ProviderId }
  | { readonly _tag: "set"; readonly provider: ProviderId; readonly credential: StoredCredential }
  | { readonly _tag: "clear"; readonly provider: ProviderId }

/** A consumer of credential changes (the embedded host pushes keys with `provider.api.set`). */
export interface CredentialSink {
  readonly apply: (change: CredentialChange) => Effect.Effect<void, AiConfigError>
}

export type CredentialStatus = "configured" | "missing"

/** Where the credentials survive a restart: read once when the service starts, rewritten after every change. */
export interface CredentialPersistence {
  readonly loadOAuth?: () => ReadonlyArray<string>
  readonly load: () => ReadonlyArray<readonly [ProviderId, StoredCredential]>
  readonly save: (entries: ReadonlyArray<readonly [ProviderId, StoredCredential]>) => void
}

/**
 * A JSON file (`{ "version": 1, "providers": { "<id>": { "key", "baseUrl"? } } }`) the user does not have to re-enter keys
 * from. The keys are stored as written, so the file is created readable by its owner only (mode 0600). A missing or damaged
 * file reads as empty, and a failed write never fails the change in memory.
 */
export const jsonFileCredentials = (file: string): CredentialPersistence => ({
  loadOAuth: () => Object.keys(readOAuthGrants(join(dirname(file), "nikcli", "data", "auth.json"))),
  load: () => {
    try {
      if (!existsSync(file)) return []
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { providers?: Record<string, { key?: unknown; baseUrl?: unknown }> }
      const out: Array<readonly [ProviderId, StoredCredential]> = []
      for (const [id, entry] of Object.entries(parsed.providers ?? {})) {
        if (!isProviderId(id) || typeof entry?.key !== "string" || entry.key.trim().length === 0) continue
        out.push([id, { key: Redacted.make(entry.key), ...(typeof entry.baseUrl === "string" && entry.baseUrl.length > 0 ? { baseUrl: entry.baseUrl } : {}) }])
      }
      return out
    } catch {
      return []
    }
  },
  save: (entries) => {
    try {
      mkdirSync(dirname(file), { recursive: true })
      const providers = Object.fromEntries(entries.map(([id, c]) => [id, { key: Redacted.value(c.key), ...(c.baseUrl ? { baseUrl: c.baseUrl } : {}) }]))
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify({ version: 1, providers }, null, 2), { mode: 0o600 })
      chmodSync(tmp, 0o600)
      renameSync(tmp, file)
    } catch {
      // The key stays usable for this run; the next change tries to write again.
    }
  }
})

export class AiCredentials extends Context.Service<
  AiCredentials,
  {
    set(provider: ProviderId, key: Redacted.Redacted<string>, opts?: { baseUrl?: string }): Effect.Effect<void, AiConfigError>
    clear(provider: ProviderId): Effect.Effect<void>
    /** Native nikcli already saved the grant; replace the app's API key without deleting that grant. */
    useOAuth(provider: ProviderId): Effect.Effect<void, AiConfigError>
    status: Effect.Effect<Record<ProviderId, CredentialStatus>>
    /** Changes whenever the effective provider credentials change; used to invalidate cached AI workflows. */
    revision: Effect.Effect<number>
    /** In-memory lookup used by `DirectModel`. */
    get(provider: ProviderId): Effect.Effect<Option.Option<StoredCredential>>
    /**
     * Replays current credentials to `sink` and applies every later change until the
     * scope closes; on close all keys are cleared from the sink.
     */
    attach(sink: CredentialSink): Effect.Effect<void, AiConfigError, Scope.Scope>
  }
>()("cadcamfun/AiCredentials") {
  /** Keys live in memory only; nothing is persisted by this layer (tests, `direct` experiments). */
  static layer: Layer.Layer<AiCredentials> = AiCredentials.build()

  /** Like `layer`, but the keys are loaded from and saved to `persistence` (see `jsonFileCredentials`). */
  static layerPersisted = (persistence: CredentialPersistence): Layer.Layer<AiCredentials> => AiCredentials.build(persistence)

  private static build(persistence?: CredentialPersistence): Layer.Layer<AiCredentials> { return Layer.sync(AiCredentials, () => {
    const store = new Map<ProviderId, StoredCredential>(persistence?.load() ?? [])
    const oauth = new Set(persistence?.loadOAuth?.() ?? [])
    for (const provider of oauth) store.delete(provider)
    let revision = 0
    const persist = () => persistence?.save([...store])
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
          if (!isProviderId(provider)) {
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
          const previous = store.get(provider)
          oauth.delete(provider)
          if (previous === undefined || Redacted.value(previous.key) !== Redacted.value(key) || previous.baseUrl !== credential.baseUrl) revision++
          store.set(provider, credential)
          persist()
          yield* broadcast({ _tag: "set", provider, credential })
        }),
      clear: (provider) =>
        Effect.gen(function* () {
          if (oauth.delete(provider)) revision++
          if (store.delete(provider)) revision++
          persist()
          yield* broadcast({ _tag: "clear", provider }).pipe(Effect.ignore)
        }),
      useOAuth: Effect.fn("AiCredentials.useOAuth")(function*(provider) {
        store.delete(provider)
        oauth.add(provider)
        revision++
        persist()
        yield* broadcast({ _tag: "oauth", provider })
      }),
      status: Effect.sync(() => {
        // Builtins plus every provider the user saved a key for: a models.dev
        // provider has to stay visible in the settings once configured.
        const ids = new Set<string>([...BUILTIN_PROVIDER_IDS, ...store.keys(), ...oauth])
        return Object.fromEntries([...ids].map((id) => [id, store.has(id) || oauth.has(id) ? "configured" : "missing"])) as Record<
          ProviderId,
          CredentialStatus
        >
      }),
      revision: Effect.sync(() => revision),
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
          for (const provider of oauth) yield* sink.apply({ _tag: "oauth", provider })
        })
    })
  }) }
}
