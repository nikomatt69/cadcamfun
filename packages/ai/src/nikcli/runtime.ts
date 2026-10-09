/// <reference path="./sdk-next.d.ts" />
import { Effect, Scope } from "effect"
import { mkdirSync, realpathSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { NikCliHostInstance, ToolExecuteContext } from "@nikcli-ai/sdk-next"
import { AiConfigError, AiProviderError } from "../errors.ts"
import { installSkills } from "../skills/index.ts"
import { createUserSkillStore } from "../skills/user.ts"
import { buildHostConfig, type HostProviderSpec, type HostCompactionSettings } from "./config.ts"
import { applyIsolation, isolatedPaths, projectScratchDir, type IsolatedPaths, type IsolationOptions } from "./isolation.ts"
import { installHostLogFilter, type HostLogSink } from "./logs.ts"
import { seedModelsCache, type CatalogueSeed } from "./models-cache.ts"

/** A tool exposed to the model. `execute` receives already zod-validated input. */
export interface HostToolSpec {
  readonly id: string
  readonly description: string
  /** zod 4 object schema (what nikcli sends to the model as JSON Schema). */
  readonly parameters: unknown
  readonly execute: (
    input: unknown,
    ctx: { readonly sessionId: string; readonly projectId: string; readonly signal: AbortSignal }
  ) => Promise<string>
}

export interface NikCliRuntimeOptions {
  /** Application data directory; all host state lives under `<dataDir>/ai/nikcli`. */
  readonly dataDir: string
  readonly providers: ReadonlyArray<HostProviderSpec>
  readonly systemPrompt: string
  /** Builds the tool set for one project (closing over its project id). */
  readonly toolsFor: (projectId: string) => ReadonlyArray<HostToolSpec>
  readonly isolation?: IsolationOptions
  /** Whether the one-shot models.dev seed may touch the network. Default: never (tests stay offline). */
  readonly catalogue?: { readonly network?: boolean }
  /** Receives the host's own log lines. Default: warnings and errors only, dropped otherwise. */
  readonly hostLogs?: HostLogSink
  /** Automatic compaction can spend model calls; omission preserves host defaults. */
  readonly compaction?: HostCompactionSettings
  /** When this settles the host bundle is imported ahead of the first request. Omitted: it is imported on first use only. */
  readonly warmAfter?: Promise<unknown>
}

export interface ProjectHost {
  readonly projectId: string
  readonly directory: string
  readonly client: NikCliHostInstance
}

export interface NikCliRuntime {
  readonly paths: IsolatedPaths
  /**
   * The runtime is the application's *long-lived* connection to nikcli: every
   * project host is created lazily on first use and cached for the rest of
   * the app's lifetime. `dispose()` runs **only** when the sidecar's owning
   * `Scope` closes (app quit, `SIGTERM`, stdin close). No code path may call
   * `client["top-level"].dispose()` per chat turn, per session, or per
   * project switch — that would break the continuous-agent contract by
   * killing the in-process host every parent session depends on.
   */
  /**
   * Resolves when the models.dev catalogue seed finished. Every catalogue read
   * awaits it; boot never does (the download must not delay the first frame).
   */
  readonly catalogueReady: Promise<CatalogueSeed>
  /** Get or lazily create the host bound to the project's scratch directory. */
  host(projectId: string): Effect.Effect<ProjectHost, AiConfigError>
  /** Push a key into the host (`provider.api.set`). */
  setProviderKey(providerId: string, key: string): Effect.Effect<void, AiConfigError>
  clearProviderKey(providerId: string): Effect.Effect<void>
  /** Replace the provider declarations (e.g. new MiniMax base URL) and reload live hosts. */
  updateProviders(providers: ReadonlyArray<HostProviderSpec>): Effect.Effect<void, AiConfigError>
  /** Rewrite the skills (built-in + the user's) into the host config and make live hosts see them. */
  reloadSkills(): Effect.Effect<void, AiConfigError>
  /**
   * Open a child session under the given `parentSessionId` using the read-only
   * `cadcam-worker` agent. The child inherits the parent's project directory but
   * a separate permission allow-list, so it cannot mutate geometry, spawn more
   * agents or set goals. The caller is responsible for removing the session
   * (`client.session.remove`) once it has the answer.
   */
  worker(input: { projectId: string; parentSessionId: string; title?: string }): Effect.Effect<ProjectHost & { readonly workerSessionId: string }, AiConfigError>
}

type Sdk = typeof import("@nikcli-ai/sdk-next")

let initialisedRoot: string | undefined
let sdkPromise: Promise<Sdk> | undefined

/**
 * The host freezes its paths and flags at module load, so the isolation env is
 * applied first and the module is imported dynamically, once per process.
 *
 * The import itself has to run with a clean `Error.prepareStackTrace`: once a JS
 * rewriter is installed there (Bun swaps its own in while loading source-mapped
 * modules — which anything running in our process can trigger), it stops
 * accepting the plain objects axios brands as errors while following redirects,
 * and the whole host fails to load with `First argument must be an Error object`.
 */
const importSdk = async (): Promise<Sdk> => {
  const previous = Error.prepareStackTrace
  // lib.dom types the hook as non-optional; the runtime accepts `undefined` (its native default).
  Error.prepareStackTrace = undefined as unknown as typeof Error.prepareStackTrace
  try {
    return await import("@nikcli-ai/sdk-next")
  } finally {
    Error.prepareStackTrace = previous
  }
}

const loadSdk = (paths: IsolatedPaths, isolation: IsolationOptions | undefined): Promise<Sdk> => {
  if (initialisedRoot !== undefined && initialisedRoot !== paths.root) {
    return Promise.reject(
      new Error("The embedded nikcli host is already initialised for a different data directory in this process.")
    )
  }
  initialisedRoot = paths.root
  applyIsolation(paths, isolation)
  sdkPromise ??= importSdk()
  return sdkPromise
}

const toConfigError = (message: string) => (cause: unknown) =>
  new AiConfigError({ message: `${message}: ${cause instanceof Error ? cause.message : String(cause)}` })

/** Acquire the runtime; the Scope owns log-filter and host teardown. */
export const makeNikCliRuntime = (
  options: NikCliRuntimeOptions
): Effect.Effect<NikCliRuntime, AiConfigError, Scope.Scope> =>
  Effect.gen(function* () {
    const paths = isolatedPaths(options.dataDir)

    const uninstall = installHostLogFilter(
      options.hostLogs ??
        ((level, line) => {
          if (level === "warn" || level === "error") Effect.runFork(Effect.logDebug(`nikcli host: ${line}`))
        })
    )
    yield* Effect.addFinalizer(() => Effect.sync(uninstall))

    // The host bundle is large and evaluating it blocks the event loop, which is what kept the sidecar from answering its
    // health check (and the shell from connecting) for ten seconds and more on a busy machine. It is loaded when the first
    // host is needed, or warmed once `warmAfter` settles (the sidecar passes the moment it has announced itself) so the first chat does not pay for it.
    let sdkReady: Promise<Sdk> | undefined
    const getSdk = (): Promise<Sdk> => (sdkReady ??= loadSdk(paths, options.isolation))
    let warm: ReturnType<typeof setTimeout> | undefined
    void options.warmAfter?.then(() => {
      warm = setTimeout(() => { getSdk().catch(() => undefined) }, 250)
      warm.unref?.()
    })
    yield* Effect.addFinalizer(() => Effect.sync(() => { if (warm !== undefined) clearTimeout(warm) }))

    // Started here, never awaited at boot: writing `<cache>/models.json` once is what
    // gives `provider.list()` the whole models.dev catalogue instead of the four
    // providers declared in nikcli.json. It cannot reject (`seedModelsCache` answers
    // "unavailable"), so nothing surfaces as an unhandled rejection.
    const catalogueReady = seedModelsCache(paths, options.catalogue)

    let providers = options.providers
    const hosts = new Map<string, Promise<ProjectHost>>()
    const liveKeys = new Set<string>()
    const pendingKeys = new Map<string, string>()
    const toolIdsOf = (projectId: string) => options.toolsFor(projectId).map((t) => t.id)

    const userSkills = createUserSkillStore(join(options.dataDir, "ai", "skills"))
    const writeConfig = async (projectId: string) => {
      await installSkills(paths.config, await userSkills.list())
      await writeFile(
        join(paths.config, "nikcli.json"),
        JSON.stringify(
          buildHostConfig({
            providers,
            toolIds: toolIdsOf(projectId),
            systemPrompt: options.systemPrompt,
            ...(options.compaction ? { compaction: options.compaction } : {})
          }),
          null,
          2
        )
      )
    }

    const createHost = async (projectId: string): Promise<ProjectHost> => {
      const scratch = projectScratchDir(paths, projectId)
      mkdirSync(scratch, { recursive: true })
      const directory = realpathSync(scratch)
      await writeConfig(projectId)
      const sdk = await getSdk().catch((cause) => { throw new Error(toConfigError("Failed to load the embedded nikcli host")(cause).message) })
      const client = await Effect.runPromise(sdk.NikCli.create({ directory }))
      const specs = options.toolsFor(projectId)
      const defined = specs.map((spec) =>
        sdk.Tool.define(spec.id, async () => ({
          description: spec.description,
          parameters: spec.parameters,
          execute: async (args: never, ctx: ToolExecuteContext) => {
            const output = await spec.execute(args, { sessionId: ctx.sessionID, projectId, signal: ctx.abort })
            return { title: spec.id, output, metadata: {} }
          }
        }))
      )
      await Effect.runPromise(client.tools.register(...defined))
      // Keys set before this host existed.
      for (const [providerId, key] of pendingKeys) await client.provider.api({ providerID: providerId, key })
      return { projectId, directory, client }
    }

    const runtime: NikCliRuntime = {
      paths,
      catalogueReady,
      host: (projectId) =>
        Effect.tryPromise({
          try: () => {
            let existing = hosts.get(projectId)
            if (existing === undefined) {
              existing = createHost(projectId)
              hosts.set(projectId, existing)
              existing.catch(() => hosts.delete(projectId))
            }
            return existing
          },
          catch: toConfigError("Failed to start the embedded nikcli host")
        }),
      setProviderKey: (providerId, key) =>
        Effect.tryPromise({
          try: async () => {
            pendingKeys.set(providerId, key)
            liveKeys.add(providerId)
            for (const promise of hosts.values()) {
              const host = await promise
              await host.client.provider.api({ providerID: providerId, key })
            }
          },
          catch: toConfigError(`Failed to register the ${providerId} key with the host`)
        }),
      clearProviderKey: (providerId) =>
        Effect.promise(async () => {
          pendingKeys.delete(providerId)
          liveKeys.delete(providerId)
          for (const promise of hosts.values()) {
            const host = await promise.catch(() => undefined)
            await host?.client.provider.removeAuth({ providerID: providerId }).catch(() => undefined)
          }
        }),
      reloadSkills: () =>
        Effect.tryPromise({
          try: async () => {
            for (const [projectId, promise] of hosts) {
              const host = await promise
              await writeConfig(projectId)
              await host.client["config-management"].reload()
              for (const [providerId, key] of pendingKeys) await host.client.provider.api({ providerID: providerId, key })
            }
          },
          catch: toConfigError("Failed to reload the skills")
        }),
      updateProviders: (next) =>
        Effect.tryPromise({
          try: async () => {
            providers = next
            for (const [projectId, promise] of hosts) {
              const host = await promise
              await writeConfig(projectId)
              await host.client["config-management"].reload()
              for (const [providerId, key] of pendingKeys) await host.client.provider.api({ providerID: providerId, key })
            }
          },
          catch: toConfigError("Failed to update the host provider configuration")
        }),
      worker: ({ projectId, parentSessionId, title }) =>
        Effect.gen(function* () {
          const projectHost = yield* Effect.tryPromise({
            try: () => {
              let existing = hosts.get(projectId)
              if (existing === undefined) {
                existing = createHost(projectId)
                hosts.set(projectId, existing)
                existing.catch(() => hosts.delete(projectId))
              }
              return existing
            },
            catch: toConfigError("Failed to start the embedded nikcli host")
          })
          const session = yield* Effect.tryPromise({
            try: () =>
              projectHost.client.session.create({
                parentID: parentSessionId,
                title: title ?? `worker for ${parentSessionId}`
              }),
            catch: toConfigError("Failed to open a worker session")
          })
          return { ...projectHost, workerSessionId: session.id }
        })
    }

    // Teardown: drop every key the host holds (it persists them in plaintext) and dispose instances.
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        for (const promise of hosts.values()) {
          const host = await promise.catch(() => undefined)
          if (host === undefined) continue
          for (const providerId of liveKeys) await host.client.provider.removeAuth({ providerID: providerId }).catch(() => undefined)
          await host.client["top-level"].dispose().catch(() => undefined)
        }
        hosts.clear()
        liveKeys.clear()
        pendingKeys.clear()
      })
    )

    return runtime
  })

export const hostFailure = (cause: unknown, provider?: string): AiProviderError =>
  new AiProviderError({
    message: cause instanceof Error ? cause.message : String(cause),
    ...(provider ? { provider } : {})
  })
