/// <reference path="./sdk-next.d.ts" />
import type { FilePart } from "../attachments.ts"
import { mcpStore, mcpHostName, validateMcpName, validateMcpConfig, type McpConfig } from "./mcp.ts"
import { z } from "zod"
import { Effect, Scope, Semaphore } from "effect"
import { mkdirSync, realpathSync } from "node:fs"
import { rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { HostModInfo, HostRegistration, NikCliHostInstance, ToolExecuteContext } from "@nikcli-ai/sdk-next"
import { AiConfigError, AiProviderError } from "../errors.ts"
import { installSkills } from "../skills/index.ts"
import { createUserSkillStore } from "../skills/user.ts"
import type { PolicyStatement } from "./policy.ts"
import { recordProgramCall } from "./program-calls.ts"
import { INSTANCE_CONFIG_FILE, registerHostPatches } from "./host-patches.ts"
import { buildHostConfig, splitHostConfig, type HostProviderSpec, type HostCompactionSettings, type HostTimeoutSettings } from "./config.ts"
import { applyIsolation, isolatedPaths, projectScratchDir, type IsolatedPaths, type IsolationOptions } from "./isolation.ts"
import { installHostLogFilter, type HostLogSink } from "./logs.ts"
import { seedModelsCache, type CatalogueSeed } from "./models-cache.ts"
import { bootstrapStep, describeBootstrapFailure } from "./bootstrap-errors.ts"
import { HostToolRegistry } from "./tool-registry.ts"
import { findHostSession } from "./chat.ts"
import { providerOAuth } from "./provider-oauth.ts"
import { readOAuthGrants } from "./oauth-store.ts"
import { toolPermissionPattern } from "./permission-modes.ts"
import { exposedActions, EXPOSED_TOOL_IDS, nameOf } from "../actions/catalogue.ts"

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
  /**
   * The full answer: `output` is the bounded text the model reads, `value` the whole validated result that Code Mode and
   * the stored part receive (absent for a tool that only has text), `bounded` whether the text leaves anything out.
   */
  readonly executeWithFiles?: (input: unknown, ctx: { readonly sessionId: string; readonly projectId: string; readonly signal: AbortSignal }) => Promise<HostToolAnswer>
}

export interface HostToolAnswer {
  readonly output: string
  readonly value?: unknown
  readonly outcome?: string
  readonly bounded?: boolean
  readonly files?: ReadonlyArray<FilePart>
}

/** Code Mode receives a tool's whole value through this codec; any JSON value passes (the action contract already checked it). */
const ANY_VALUE = z.unknown()

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
  /**
   * `file://` specs of the mods the host loads, read again for every configuration publication: the app-owned store
   * (`mods.ts`) and the plugin host own the files, the runtime only declares them. Changes reach live hosts through
   * `reloadMods` (spec 27 §4.3).
   */
  readonly mods?: () => ReadonlyArray<string>
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
  mcpServers(projectId: string): Effect.Effect<ReadonlyArray<{ name: string; config: McpConfig; status: string }>, AiConfigError>
  saveMcpServer(projectId: string, name: string, config: McpConfig | undefined): Effect.Effect<void, AiConfigError>
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
  /** Download fresh metadata and reload provider state without disposing conversations. */
  refreshCatalogue(): Effect.Effect<void, AiConfigError>
  /** Get or lazily create the host bound to the project's scratch directory. */
  host(projectId: string): Effect.Effect<ProjectHost, AiConfigError>
  /** Push a key into the host (`provider.api.set`). */
  setProviderKey(providerId: string, key: string): Effect.Effect<void, AiConfigError>
  clearProviderKey(providerId: string): Effect.Effect<void>
  useProviderOAuth(providerId: string): Effect.Effect<void, AiConfigError>
  readonly oauth: ReturnType<typeof providerOAuth>
  /** Replace the provider declarations (e.g. new MiniMax base URL) and reload live hosts. */
  updateProviders(providers: ReadonlyArray<HostProviderSpec>): Effect.Effect<void, AiConfigError>
  /** Rewrite the skills (built-in + the user's) into the host config and make live hosts see them. */
  reloadSkills(): Effect.Effect<void, AiConfigError>
  /**
   * Rewrite the mod declarations (`plugin` of the isolated config — the store and the plugin host already wrote the
   * files) and reload live hosts: the pinned bundle re-runs its plugin pass on `config-management.reload`, so a mod
   * created, edited, enabled or removed here applies to running conversations too (spec 27 §4.3).
   */
  reloadMods(): Effect.Effect<void, AiConfigError>
  /**
   * The mods the live host reports as loaded (`mod.list`), or the empty list when none runs for the project yet.
   * Reading never *starts* a host: a mod's hooks are visible only once one is already there (spec 27 §4.3).
   * A failed live inspection is an error, never evidence that no mods loaded.
   */
  loadedMods(projectId: string): Effect.Effect<ReadonlyArray<HostModInfo>, AiConfigError>
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
    const catalogueHosts = new Set<ProjectHost>()
    let catalogueReady: Promise<CatalogueSeed> | undefined
    const ensureCatalogue = () => {
      assertOpen()
      if (catalogueReady !== undefined) return catalogueReady
      // A failed download must not stick for the process lifetime: the next
      // catalogue read or host creation tries again.
      const pending = seedModelsCache(paths, { ...options.catalogue, signal: catalogueController.signal }).then(async (seed) => {
        // A host may have started during an outage. Loading the file later must also replace its fallback catalogue.
        if (seed === "seeded" || seed === "bundled") for (const host of catalogueHosts) {
          await host.client["config-management"].reload()
          for (const [providerId, key] of pendingKeys) await host.client.provider.api({ providerID: providerId, key })
        }
        if (seed === "unavailable" && catalogueReady === pending) catalogueReady = undefined
        return seed
      })
      catalogueReady = pending
      return pending
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
    let publishedShared: string | undefined
    const writeAtomically = async (file: string, text: string): Promise<void> => {
      const temporary = `${file}.${crypto.randomUUID()}.tmp`
      try {
        await writeFile(temporary, text, { mode: 0o600 })
        await rename(temporary, file)
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined)
      }
    }
    /**
     * Publishes the configuration a project's host reads: the shared file (providers, defaults, policies; one for every host)
     * and the project's own file in its scratch folder (its agents and permission maps), which only that Instance reads.
     */
    const writeConfig = (projectId: string): Promise<void> => Effect.runPromise(
      configurationLock.withPermit(Effect.tryPromise({
        try: async () => {
          assertOpen()
          if (installedSkillsRevision !== skillsRevision) {
            const revision = skillsRevision
            await installSkills(paths.config, await userSkills.list())
            installedSkillsRevision = revision
          }
          const { shared, instance } = splitHostConfig(buildHostConfig({
            providers,
            mcp: await mcpStore(projectScratchDir(paths, projectId)).read(),
            toolIds: toolIdsOf(projectId),
            askToolIds: toolRegistry.approvalIds(projectId),
            systemPrompt: options.systemPrompt,
            ...(options.mods ? { mods: [...new Set(options.mods())] } : {}),
            ...(options.compaction ? { compaction: options.compaction } : {}),
            ...(options.timeouts ? { timeouts: options.timeouts } : {}),
            ...(options.policies ? { policies: options.policies } : {})
          }))
          const sharedText = JSON.stringify(shared, null, 2)
          if (sharedText !== publishedShared) {
            await writeAtomically(join(paths.config, "nikcli.json"), sharedText)
            publishedShared = sharedText
          }
          const scratch = projectScratchDir(paths, projectId)
          mkdirSync(scratch, { recursive: true })
          await writeAtomically(join(scratch, INSTANCE_CONFIG_FILE), JSON.stringify(instance, null, 2))
        },
        catch: (cause) => cause instanceof Error ? cause : new Error("Host configuration publication failed")
      }))
    )

    /** The live registration batch of each project's host; closed when the next batch is registered. */
    const registrations = new Map<string, HostRegistration>()

    /**
     * Registers the project's tools on its host. The host keeps the last registration of an id (nikcli `lastWins`), so
     * calling this again replaces changed tools and adds new ones; the previous batch is then closed, so a tool that left the
     * set is no longer registered at all and repeated publications do not pile up registrations. The permission map
     * `writeConfig` publishes also denies it and hides it from `search_tools`. The Instance itself is never recreated.
     */
    const registerTools = async (sdk: Sdk, client: NikCliHostInstance, projectId: string): Promise<void> => {
      assertOpen()
      const specs = toolRegistry.tools(projectId)
      const defined = specs.map((spec) =>
        sdk.Tool.define(spec.id, async () => ({
          description: spec.description,
          parameters: spec.parameters,
          // Declaring an output makes Code Mode read `value` (the whole result) instead of the bounded text.
          ...(spec.executeWithFiles ? { output: ANY_VALUE } : {}),
          ...(spec.formatValidationError ? { formatValidationError: spec.formatValidationError } : {}),
          execute: async (args: never, ctx: ToolExecuteContext) => {
            assertOpen()
            const pattern = toolPermissionPattern(spec.id, args, projectId, ctx.agent)
            const action = EXPOSED_TOOL_IDS.includes(spec.id)
              ? exposedActions(spec.id).find((entry) => nameOf(entry) === (args as { action?: unknown }).action)
              : undefined
            await ctx.ask({ permission: spec.id, patterns: [pattern], always: [pattern], metadata: {
              input: args,
              context: { application: "CADCAMFUN", projectId, ...(action ? { action: { id: action.id, kind: action.kind, effects: action.effects } } : {}) }
            } })
            assertOpen()
            const call = { sessionId: ctx.sessionID, projectId, signal: ctx.abort }
            // Under `code_mode` the call id is the program's, not this tool's: record what happened so the program's inner calls
            // reach the editor as they finish (see `program-calls.ts`).
            const result: HostToolAnswer = await (spec.executeWithFiles
              ? spec.executeWithFiles(args, call)
              : spec.execute(args, call).then((output) => ({ output }))).catch((cause: unknown) => {
              recordProgramCall(ctx.callID, { tool: spec.id, input: args, output: cause instanceof Error ? cause.message : String(cause), failed: true })
              throw cause
            })
            // Inner Code Mode calls reach the editor with the whole value, exactly as a direct call's stored part does.
            const full = result.value === undefined ? result.output : JSON.stringify(result.value)
            recordProgramCall(ctx.callID, { tool: spec.id, input: args, output: full, failed: false })
            return {
              title: spec.id, output: result.output,
              ...(spec.executeWithFiles ? { value: result.value ?? null } : {}),
              // `truncated` is declared, so the host keeps our bounded text instead of cutting it again; `value` is the
              // stored, complete answer the desktop and recovery read.
              metadata: { truncated: result.bounded === true, ...(result.outcome !== undefined ? { outcome: result.outcome } : {}), ...(result.value !== undefined && result.bounded === true ? { value: result.value } : {}) },
              attachments: result.files?.map((file) => ({ ...file, id: `part_${crypto.randomUUID().replaceAll("-", "")}`, sessionID: ctx.sessionID, messageID: ctx.messageID }))
            }
          }
        }))
      )
      const registration = await Effect.runPromise(client.tools.register(...defined))
      const previous = registrations.get(projectId)
      registrations.set(projectId, registration)
      await previous?.close()
    }

    const createHost = async (projectId: string): Promise<ProjectHost> => {
      assertOpen()
      const scratch = projectScratchDir(paths, projectId)
      mkdirSync(scratch, { recursive: true })
      const directory = realpathSync(scratch)
      // The host builds its provider database once, at Instance creation, from
      // `<cache>/models.json`: a host created before the seed lands would keep
      // only the declared providers for its whole lifetime. Every host
      // therefore waits for the seed (instant once the file exists).
      await bootstrapStep("model catalogue", ensureCatalogue)
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
        const host = { projectId, directory, client }
        catalogueHosts.add(host)
        return host
      } catch (cause) {
        registrations.delete(projectId)
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
      refreshCatalogue: () => Effect.tryPromise({
        try: async () => {
          assertOpen()
          if (options.catalogue?.network !== true) throw new Error("Model catalogue downloads are disabled in offline mode.")
          await catalogueReady
          const result = await seedModelsCache(paths, { network: true, refresh: true, signal: catalogueController.signal })
          if (result !== "seeded") throw new Error("Could not download the model catalogue. Check the desktop's connection and retry; the previous catalogue was kept.")
          catalogueReady = Promise.resolve("present")
          for (const promise of hosts.values()) {
            const host = await promise
            assertOpen()
            await host.client["config-management"].reload()
            for (const [providerId, key] of pendingKeys) await host.client.provider.api({ providerID: providerId, key })
          }
        },
        catch: toConfigError("Failed to refresh models"),
      }),
      oauth: providerOAuth(() => Effect.tryPromise({ try: () => getHost("default"), catch: toConfigError("Could not open provider sign-in") }), join(paths.data, "auth.json")),
      toolCatalogue: () => toolRegistry.catalogue("default"),
      paths,
      get catalogueReady() {
        assertOpen()
        return ensureCatalogue()
      },
      mcpServers: (projectId) => Effect.tryPromise({
        try: async () => {
          assertOpen()
          const entries = await mcpStore(projectScratchDir(paths, projectId)).read()
          if (Object.keys(entries).length === 0) return []
          const host = await getHost(projectId)
          const statuses = await host.client.mcp.status()
          return Object.entries(entries).map(([name, config]) => ({ name, config, status: statuses[mcpHostName(name)]?.status ?? (config.enabled ? "disconnected" : "disabled") }))
        },
        catch: toConfigError("Unable to read MCP connections")
      }),
      saveMcpServer: (projectId, name, config) => Effect.tryPromise({
        try: async () => {
          assertOpen()
          validateMcpName(name)
          if (config) validateMcpConfig(config)
          // Serialize read-modify-write and reload, including concurrent changes to the same project.
          const next = publishing.catch(() => undefined).then(async () => {
            assertOpen()
            const store = mcpStore(projectScratchDir(paths, projectId))
            const entries = await store.read()
            if (config) entries[name] = config
            else delete entries[name]
            const existing = hosts.get(projectId)
            if (existing) await (await existing).client.mcp.disconnect({ name: mcpHostName(name) })
            await store.write(entries)
            await writeConfig(projectId)
            if (existing) {
              const host = await existing
              await host.client["config-management"].reload()
              for (const [id, key] of pendingKeys) await host.client.provider.api({ providerID: id, key })
              // Reload preserves the MCP service's live clients; a newly enabled entry needs an explicit connection.
              if (config?.enabled) await host.client.mcp.connect({ name: mcpHostName(name) })
            }
          })
          publishing = next
          await next
        },
        catch: toConfigError("Unable to save MCP connection")
      }),
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
          if (readOAuthGrants(join(paths.data, "auth.json"))[providerId] && hosts.size === 0) await getHost("default")
          for (const promise of hosts.values()) {
            const host = await promise.catch(() => undefined)
            await host?.client.provider.removeAuth({ providerID: providerId }).catch(() => undefined)
          }
        }),
      useProviderOAuth: (providerId) => Effect.tryPromise({
        try: async () => {
          pendingKeys.delete(providerId)
          liveKeys.delete(providerId)
          for (const promise of hosts.values()) {
            const host = await promise
            await host.client["config-management"].reload()
            for (const [id, key] of pendingKeys) await host.client.provider.api({ providerID: id, key })
          }
        },
        catch: () => new AiConfigError({ message: "Could not refresh the subscription provider.", provider: providerId })
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
      reloadMods: () =>
        Effect.tryPromise({
          try: async () => {
            assertOpen()
            for (const [projectId, promise] of hosts) {
              const host = await promise
              await writeConfig(projectId)
              await host.client["config-management"].reload()
              for (const [providerId, key] of pendingKeys) await host.client.provider.api({ providerID: providerId, key })
            }
          },
          catch: toConfigError("Failed to reload the mods")
        }),
      loadedMods: (projectId) =>
        Effect.tryPromise({
          try: async () => {
            const promise = hosts.get(projectId)
            if (promise === undefined) return []
            const host = await promise.catch(() => undefined)
            if (host === undefined) return []
            return host.client.mod.list()
          },
          catch: toConfigError("Failed to inspect the loaded mods")
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
        registrations.clear()
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
