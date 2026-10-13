/// <reference path="./sdk-next.d.ts" />
import type { FilePart } from "../attachments.ts"
import type { z } from "zod"
import { Effect, Scope, Semaphore } from "effect"
import { mkdirSync, realpathSync } from "node:fs"
import { rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { NikCliHostInstance, ToolExecuteContext } from "@nikcli-ai/sdk-next"
import { AiConfigError, AiProviderError } from "../errors.ts"
import { installSkills } from "../skills/index.ts"
import { createUserSkillStore } from "../skills/user.ts"
import type { PolicyStatement } from "./policy.ts"
import { recordProgramCall } from "./program-calls.ts"
import { registerHostPatches } from "./host-patches.ts"
import { buildHostConfig, type HostProviderSpec, type HostCompactionSettings, type HostTimeoutSettings } from "./config.ts"
import { applyIsolation, isolatedPaths, projectScratchDir, type IsolatedPaths, type IsolationOptions } from "./isolation.ts"
import { installHostLogFilter, type HostLogSink } from "./logs.ts"
import { seedModelsCache, type CatalogueSeed } from "./models-cache.ts"
import { bootstrapStep, describeBootstrapFailure } from "./bootstrap-errors.ts"
import { HostToolRegistry } from "./tool-registry.ts"
import { findHostSession } from "./chat.ts"

/** A tool exposed to the model. `execute` receives already zod-validated input. */
export interface HostToolSpec {
  readonly id: string
  readonly description: string
  /** zod 4 object schema (what nikcli sends to the model as JSON Schema). */
  readonly parameters: unknown
  /** nikcli validates before execute; keep recovery guidance on that path too. */
  readonly formatValidationError?: (error: z.ZodError) => string
  readonly execute: (
    input: unknown,
    ctx: { readonly sessionId: string; readonly projectId: string; readonly signal: AbortSignal }
  ) => Promise<string>
  /** The host asks the person before each call, whatever the role (an extension tool that changes something). */
  readonly approval?: boolean
  readonly executeWithFiles?: (input: unknown, ctx: { readonly sessionId: string; readonly projectId: string; readonly signal: AbortSignal }) => Promise<{ readonly output: string; readonly files?: ReadonlyArray<FilePart> }>
}

export interface NikCliRuntimeOptions {
  /** Application data directory; all host state lives under `<dataDir>/ai/nikcli`. */
  readonly dataDir: string
  readonly providers: ReadonlyArray<HostProviderSpec>
  readonly systemPrompt: string
  /** Builds the tool set for one project (closing over its project id); the central `ToolRegistry`'s `snapshot` in the app. */
  readonly toolsFor: (projectId: string) => ReadonlyArray<HostToolSpec>
  /**
   * Called with a listener that must run whenever `toolsFor` would answer differently (`ToolRegistry.subscribe`); returns
   * the unsubscribe. Every live host then gets the new permission map and the new or replaced tools, without a restart.
   */
  readonly toolChanges?: (listener: () => void) => () => void
  readonly isolation?: IsolationOptions
  /** Whether the one-shot models.dev seed may touch the network. Default: never (tests stay offline). */
  readonly catalogue?: { readonly network?: boolean }
  /** Receives the host's own log lines. Default: warnings and errors only, dropped otherwise. */
  readonly hostLogs?: HostLogSink
  /** Automatic compaction can spend model calls; omission preserves host defaults. */
  readonly compaction?: HostCompactionSettings
  /** Deadlines for one tool call and one delegated task; omission uses the CAD/CAM budgets. */
  readonly timeouts?: HostTimeoutSettings
  /** nikcli resource policy: `provider.use` is enforced by the host, `tool.use` by the permission map built here. */
  readonly policies?: ReadonlyArray<PolicyStatement>
  /** When this settles the host bundle is imported ahead of the first request. Omitted: it is imported on first use only. */
  readonly warmAfter?: Promise<unknown>
}

export interface ProjectHost {
  readonly projectId: string
  readonly directory: string
  readonly client: NikCliHostInstance
}

export interface NikCliRuntime {
  /** Actual host registrations plus permitted native discovery/control tools; no executor is invoked. */
  readonly toolCatalogue: () => ReadonlyArray<{ id: string; description: string }>
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
  /** Publish the current tool set to every live host (what `toolChanges` triggers): permission map, registrations, reload. */
  reloadTools(): Effect.Effect<void, AiConfigError>
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
  registerHostPatches()
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
  new AiConfigError({ message: `${message}: ${describeBootstrapFailure(cause)}` })

/** Acquire the runtime; the Scope owns log-filter and host teardown. */
export const makeNikCliRuntime = (
  options: NikCliRuntimeOptions
): Effect.Effect<NikCliRuntime, AiConfigError, Scope.Scope> =>
  Effect.gen(function* () {
    const paths = isolatedPaths(options.dataDir)
    let closed = false
    const assertOpen = () => { if (closed) throw new Error("The embedded nikcli runtime is closed") }

    const uninstall = installHostLogFilter(
      options.hostLogs ??
        ((level, line) => {
          if (level === "warn" || level === "error") Effect.runFork(Effect.logDebug(`nikcli host: ${line}`))
        })
    )
    yield* Effect.addFinalizer(() => Effect.sync(uninstall))

    // The host bundle is large and evaluating it blocks the event loop, which is what kept the sidecar from answering its
    // health check (and the shell from connecting) for ten seconds and more on a busy machine. It is loaded when the first
    // host is needed, or optionally warmed once `warmAfter` settles. The sidecar keeps this demand-loaded.
    let sdkReady: Promise<Sdk> | undefined
    const getSdk = (): Promise<Sdk> => {
      assertOpen()
      return sdkReady ??= loadSdk(paths, options.isolation)
    }
    let warm: ReturnType<typeof setTimeout> | undefined
    void options.warmAfter?.then(() => {
      if (closed) return
      warm = setTimeout(() => { if (!closed) getSdk().catch(() => undefined) }, 250)
      warm.unref?.()
    }).catch(() => undefined)
    yield* Effect.addFinalizer(() => Effect.sync(() => { if (warm !== undefined) clearTimeout(warm) }))

    // The metadata seed shares the first catalogue reader's lifecycle, not application startup.
    const catalogueController = new AbortController()
    let catalogueReady: Promise<CatalogueSeed> | undefined
    const ensureCatalogue = () => {
      assertOpen()
      return catalogueReady ??= seedModelsCache(paths, { ...options.catalogue, signal: catalogueController.signal })
    }

    let providers = options.providers
    const hosts = new Map<string, Promise<ProjectHost>>()
    const liveKeys = new Set<string>()
    const pendingKeys = new Map<string, string>()
    const toolRegistry = new HostToolRegistry(options.toolsFor)
    const toolIdsOf = (projectId: string) => toolRegistry.ids(projectId)

    const userSkills = createUserSkillStore(join(options.dataDir, "ai", "skills"))
    const configurationLock = yield* Semaphore.make(1)
    let skillsRevision = 0
    let installedSkillsRevision = -1
    const writeConfig = (projectId: string): Promise<void> => Effect.runPromise(
      configurationLock.withPermit(Effect.tryPromise({
        try: async () => {
          assertOpen()
          if (installedSkillsRevision !== skillsRevision) {
            const revision = skillsRevision
            await installSkills(paths.config, await userSkills.list())
            installedSkillsRevision = revision
          }
          const file = join(paths.config, "nikcli.json")
          const temporary = `${file}.${crypto.randomUUID()}.tmp`
          try {
            await writeFile(temporary, JSON.stringify(buildHostConfig({
              providers,
              toolIds: toolIdsOf(projectId),
              askToolIds: toolRegistry.approvalIds(projectId),
              systemPrompt: options.systemPrompt,
              ...(options.compaction ? { compaction: options.compaction } : {}),
              ...(options.timeouts ? { timeouts: options.timeouts } : {}),
              ...(options.policies ? { policies: options.policies } : {})
            }), null, 2))
            await rename(temporary, file)
          } finally {
            await rm(temporary, { force: true }).catch(() => undefined)
          }
        },
        catch: (cause) => cause instanceof Error ? cause : new Error("Host configuration publication failed")
      }))
    )

    /**
     * Registers the project's tools on its host. The host keeps the last registration of an id (nikcli `lastWins`), so
     * calling this again replaces changed tools and adds new ones; a tool that left the set is denied by the permission
     * map `writeConfig` publishes, which also hides it from `search_tools`.
     */
    const registerTools = (sdk: Sdk, client: NikCliHostInstance, projectId: string): Promise<void> => {
      assertOpen()
      const specs = toolRegistry.tools(projectId)
      const defined = specs.map((spec) =>
        sdk.Tool.define(spec.id, async () => ({
          description: spec.description,
          parameters: spec.parameters,
          ...(spec.formatValidationError ? { formatValidationError: spec.formatValidationError } : {}),
          execute: async (args: never, ctx: ToolExecuteContext) => {
            assertOpen()
            await ctx.ask({ permission: spec.id, patterns: [`project:${projectId}`], always: [`project:${projectId}`], metadata: { input: args } })
            assertOpen()
            const call = { sessionId: ctx.sessionID, projectId, signal: ctx.abort }
            // Under `code_mode` the call id is the program's, not this tool's: record what happened so the program's inner calls
            // reach the editor as they finish (see `program-calls.ts`).
            const result: { readonly output: string; readonly files?: ReadonlyArray<FilePart> } = await (spec.executeWithFiles
              ? spec.executeWithFiles(args, call)
              : spec.execute(args, call).then((output) => ({ output }))).catch((cause: unknown) => {
              recordProgramCall(ctx.callID, { tool: spec.id, input: args, output: cause instanceof Error ? cause.message : String(cause), failed: true })
              throw cause
            })
            recordProgramCall(ctx.callID, { tool: spec.id, input: args, output: result.output, failed: false })
            return { title: spec.id, output: result.output, metadata: {}, attachments: result.files?.map((file) => ({ ...file, id: `part_${crypto.randomUUID().replaceAll("-", "")}`, sessionID: ctx.sessionID, messageID: ctx.messageID })) }
          }
        }))
      )
      return Effect.runPromise(client.tools.register(...defined))
    }

    const createHost = async (projectId: string): Promise<ProjectHost> => {
      assertOpen()
      const scratch = projectScratchDir(paths, projectId)
      mkdirSync(scratch, { recursive: true })
      const directory = realpathSync(scratch)
      // A restored external-provider chat can arrive before the model browser.
      if ([...pendingKeys.keys()].some((id) => !providers.some((provider) => provider.id === id))) {
        await bootstrapStep("model catalogue", ensureCatalogue)
      }
      await bootstrapStep("configuration", () => writeConfig(projectId))
      const sdk = await bootstrapStep("SDK import", getSdk)
      assertOpen()
      const client = await bootstrapStep("client creation", () => Effect.runPromise(sdk.NikCli.create({ directory })))
      try {
        assertOpen()
        await bootstrapStep("tool registration", () => registerTools(sdk, client, projectId))
        assertOpen()
        // Keys set before this host existed.
        for (const [providerId, key] of pendingKeys) {
          assertOpen()
          await bootstrapStep(`credential replay for ${providerId}`, () => client.provider.api({ providerID: providerId, key }))
        }
        assertOpen()
        return { projectId, directory, client }
      } catch (cause) {
        for (const providerId of liveKeys) await client.provider.removeAuth({ providerID: providerId }).catch(() => undefined)
        await client["top-level"].dispose().catch(() => undefined)
        throw cause
      }
    }

    const getHost = (projectId: string): Promise<ProjectHost> => {
      assertOpen()
      let existing = hosts.get(projectId)
      if (existing === undefined) {
        existing = createHost(projectId)
        const pending = existing
        hosts.set(projectId, pending)
        pending.catch(() => { if (hosts.get(projectId) === pending) hosts.delete(projectId) })
      }
      return existing
    }

    // One publication at a time, and a change that lands during one is published after it (never dropped, never doubled).
    let publishing: Promise<void> = Promise.resolve()
    const publishTools = (): Promise<void> => {
      const next = publishing.catch(() => undefined).then(async () => {
        if (closed) return
        toolRegistry.invalidate()
        const sdk = sdkReady === undefined ? undefined : await sdkReady
        for (const [projectId, promise] of hosts) {
          const host = await promise.catch(() => undefined)
          if (host === undefined || sdk === undefined || closed) continue
          await writeConfig(projectId)
          await registerTools(sdk, host.client, projectId)
          await host.client["config-management"].reload()
          for (const [providerId, key] of pendingKeys) await host.client.provider.api({ providerID: providerId, key })
        }
      })
      publishing = next
      return next
    }
    if (options.toolChanges) {
      const unsubscribe = options.toolChanges(() => {
        publishTools().catch((cause: unknown) => Effect.runFork(Effect.logWarning(`nikcli host: the new tool set was not published: ${describeBootstrapFailure(cause)}`)))
      })
      yield* Effect.addFinalizer(() => Effect.sync(unsubscribe))
    }

    const runtime: NikCliRuntime = {
      toolCatalogue: () => toolRegistry.catalogue("default"),
      paths,
      get catalogueReady() {
        assertOpen()
        return ensureCatalogue()
      },
      host: (projectId) =>
        Effect.tryPromise({
          try: () => getHost(projectId),
          catch: toConfigError("Failed to start the embedded nikcli host")
        }),
      setProviderKey: (providerId, key) =>
        Effect.tryPromise({
          try: async () => {
            assertOpen()
            pendingKeys.set(providerId, key)
            liveKeys.add(providerId)
            for (const promise of hosts.values()) {
              const host = await promise
              assertOpen()
              await host.client.provider.api({ providerID: providerId, key })
            }
          },
          catch: toConfigError(`Failed to register the ${providerId} key with the host`)
        }),
      clearProviderKey: (providerId) =>
        Effect.promise(async () => {
          if (closed) return
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
            assertOpen()
            skillsRevision++
            for (const [projectId, promise] of hosts) {
              const host = await promise
              await writeConfig(projectId)
              await host.client["config-management"].reload()
              for (const [providerId, key] of pendingKeys) await host.client.provider.api({ providerID: providerId, key })
            }
          },
          catch: toConfigError("Failed to reload the skills")
        }),
      reloadTools: () =>
        Effect.tryPromise({
          try: () => publishTools(),
          catch: toConfigError("Failed to publish the tool set to the host")
        }),
      updateProviders: (next) =>
        Effect.tryPromise({
          try: async () => {
            assertOpen()
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
            try: () => getHost(projectId),
            catch: toConfigError("Failed to start the embedded nikcli host")
          })
          const parent = yield* findHostSession(projectHost, parentSessionId)
          if (!parent) return yield* new AiConfigError({ message: "The parent conversation no longer exists in this workspace." })
          const session = yield* Effect.tryPromise({
            try: () => {
              assertOpen()
              return projectHost.client.session.create({
                parentID: parentSessionId,
                title: title ?? `worker for ${parentSessionId}`
              })
            },
            catch: toConfigError("Failed to open a worker session")
          })
          return { ...projectHost, workerSessionId: session.id }
        })
    }

    // Teardown: drop every key the host holds (it persists them in plaintext) and dispose instances.
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        closed = true
        catalogueController.abort()
        await catalogueReady?.catch(() => undefined)
        if (warm !== undefined) clearTimeout(warm)
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
