/// <reference path="./sdk-next.d.ts" />
import { Effect, Scope } from "effect"
import { mkdirSync, realpathSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { NikCliHostInstance, ToolExecuteContext } from "@nikcli-ai/sdk-next"
import { AiConfigError, AiProviderError } from "../errors.ts"
import { buildHostConfig, type HostProviderSpec } from "./config.ts"
import { applyIsolation, isolatedPaths, projectScratchDir, type IsolatedPaths, type IsolationOptions } from "./isolation.ts"
import { installHostLogFilter, type HostLogSink } from "./logs.ts"

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
  /** Receives the host's own log lines. Default: warnings and errors only, dropped otherwise. */
  readonly hostLogs?: HostLogSink
}

export interface ProjectHost {
  readonly projectId: string
  readonly directory: string
  readonly client: NikCliHostInstance
}

export interface NikCliRuntime {
  readonly paths: IsolatedPaths
  /** Get or lazily create the host bound to the project's scratch directory. */
  host(projectId: string): Effect.Effect<ProjectHost, AiConfigError>
  /** Push a key into the host (`provider.api.set`). */
  setProviderKey(providerId: string, key: string): Effect.Effect<void, AiConfigError>
  clearProviderKey(providerId: string): Effect.Effect<void>
  /** Replace the provider declarations (e.g. new MiniMax base URL) and reload live hosts. */
  updateProviders(providers: ReadonlyArray<HostProviderSpec>): Effect.Effect<void, AiConfigError>
}

type Sdk = typeof import("@nikcli-ai/sdk-next")

let initialisedRoot: string | undefined
let sdkPromise: Promise<Sdk> | undefined

/**
 * The host freezes its paths and flags at module load, so the isolation env is
 * applied first and the module is imported dynamically, once per process.
 */
const loadSdk = (paths: IsolatedPaths, isolation: IsolationOptions | undefined): Promise<Sdk> => {
  if (initialisedRoot !== undefined && initialisedRoot !== paths.root) {
    return Promise.reject(
      new Error("The embedded nikcli host is already initialised for a different data directory in this process.")
    )
  }
  initialisedRoot = paths.root
  applyIsolation(paths, isolation)
  sdkPromise ??= import("@nikcli-ai/sdk-next")
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

    const sdk = yield* Effect.tryPromise({
      try: () => loadSdk(paths, options.isolation),
      catch: toConfigError("Failed to load the embedded nikcli host")
    })

    let providers = options.providers
    const hosts = new Map<string, Promise<ProjectHost>>()
    const liveKeys = new Set<string>()
    const pendingKeys = new Map<string, string>()
    const toolIdsOf = (projectId: string) => options.toolsFor(projectId).map((t) => t.id)

    const writeConfig = (projectId: string) =>
      writeFile(
        join(paths.config, "nikcli.json"),
        JSON.stringify(buildHostConfig({ providers, toolIds: toolIdsOf(projectId), systemPrompt: options.systemPrompt }), null, 2)
      )

    const createHost = async (projectId: string): Promise<ProjectHost> => {
      const scratch = projectScratchDir(paths, projectId)
      mkdirSync(scratch, { recursive: true })
      const directory = realpathSync(scratch)
      await writeConfig(projectId)
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
