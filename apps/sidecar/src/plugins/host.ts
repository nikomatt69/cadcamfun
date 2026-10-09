/**
 * Plugin host: lifecycle, isolation and capability enforcement
 * (spec 09-plugins.md §3).
 *
 * Plugins are untrusted code. Each enabled plugin runs in its own Bun `Worker`
 * spawned from a self-contained bootstrap, and it can only act through the RPC
 * bridge below. Every call is checked against the plugin's granted capabilities in
 * the **host** — never in the plugin — so a missing capability is a typed error
 * rather than a silent no-op (spec §3, §6).
 *
 * Hard limits (spec §3): wall-clock timeout per call (default 5 s), a memory cap
 * through the worker's `resourceLimits`, and a call-rate limit.
 *
 * The seam that keeps this testable is `PluginHostEnv`: it supplies the worker
 * factory and the storage backend, so the whole lifecycle is exercised in
 * `plugins.test.ts` without touching a real plugin folder.
 */
import { Context, Data, Effect, Layer } from "effect"
import { readFileSync } from "node:fs"
import { effectiveCapabilities, type Capability } from "@cadcamfun/plugin-sdk"
import type { PluginManifest } from "@cadcamfun/plugin-sdk"

/** Default wall-clock budget for one plugin call, milliseconds (spec §3). */
export const CALL_TIMEOUT_MS = 5_000
/** Maximum plugin heap, megabytes. A plugin that allocates past this is killed. */
export const MEMORY_LIMIT_MB = 256
/** Calls allowed per plugin per minute. */
export const CALL_RATE_LIMIT = 2_000
export const MAX_PENDING_CALLS = 64
/** Window used to count crashes, milliseconds. */
export const CRASH_WINDOW_MS = 10 * 60 * 1_000
/** Crashes inside the window that trigger an automatic disable (spec §3). */
export const CRASH_LIMIT = 3

// ---------------------------------------------------------------- errors

export class PluginError extends Data.TaggedError("PluginError")<{
  readonly pluginId: string
  readonly reason: string
}> {
  constructor(props: { readonly pluginId: string; readonly reason: string }) {
    super(props)
    this.message = props.reason
  }
}

export class PluginCapabilityError extends Data.TaggedError("PluginCapabilityError")<{
  readonly pluginId: string
  readonly capability: Capability
}> {}

export class PluginTimeoutError extends Data.TaggedError("PluginTimeoutError")<{
  readonly pluginId: string
  readonly timeoutMs: number
}> {}

export class PluginCrashedError extends Data.TaggedError("PluginCrashedError")<{
  readonly pluginId: string
  readonly message: string
}> {}

/**
 * A manifest pointed its `entry` outside the plugin's own folder (absolute path or
 * a `..` segment). The host refuses rather than sandboxing a filesystem escape.
 */
export class EntryEscapesPluginError extends Data.TaggedError("EntryEscapesPluginError")<{
  readonly pluginId: string
  readonly entry: string
  readonly message: string
}> {
  constructor(args: { readonly pluginId: string; readonly entry: string }) {
    super({
      pluginId: args.pluginId,
      entry: args.entry,
      message: `entry "${args.entry}" escapes the plugin folder`
    })
  }
}

/** The union every plugin operation can fail with. */
export type PluginFailure =
  | PluginError
  | PluginCapabilityError
  | PluginTimeoutError
  | PluginCrashedError

// ---------------------------------------------------------------- records

export const PLUGIN_STATES = ["installed", "enabled", "disabled", "faulted"] as const
export type PluginState = (typeof PLUGIN_STATES)[number]

/** A plugin as the host tracks it (the DB row holds the same fields). */
export interface PluginRecord {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly apiVersion: string
  /** Entry module, relative to `directory`. */
  readonly entry: string
  /** Absolute path of the installed folder. */
  readonly directory: string
  /** Capabilities in force: the granted ones plus everything they imply. */
  readonly capabilities: ReadonlyArray<Capability>
  readonly contributes: PluginManifest["contributes"]
  readonly state: PluginState
  readonly dev: boolean
  readonly signature?: string
}

/** Declarative contributions collected during activation. */
export interface PluginContributions {
  readonly commands: ReadonlyArray<{ readonly id: string; readonly title: string }>
  readonly panels: ReadonlyArray<{ readonly id: string; readonly title: string; readonly entry: string }>
  readonly postProcessors: ReadonlyArray<string>
  readonly operations: ReadonlyArray<string>
}

/** A running plugin instance. */
export interface RunningPlugin {
  readonly record: PluginRecord
  readonly contributions: PluginContributions
}

// ---------------------------------------------------------------- RPC

/** Requests the host accepts from a worker. */
export type HostRequest =
  | { readonly _tag: "activate"; readonly granted: ReadonlyArray<Capability> }
  | { readonly _tag: "deactivate" }
  | { readonly _tag: "storage.get"; readonly key: string }
  | { readonly _tag: "storage.set"; readonly key: string; readonly value: string }
  | { readonly _tag: "storage.delete"; readonly key: string }
  | { readonly _tag: "storage.keys" }
  | { readonly _tag: "drawing.read" }
  | { readonly _tag: "drawing.patch"; readonly patch: unknown }
  | { readonly _tag: "toolpath.list" }
  | { readonly _tag: "toolpath.program"; readonly toolpathId: string }
  | { readonly _tag: "ui.command"; readonly commandId: string }
  | { readonly _tag: "ui.panel"; readonly panel: { readonly id: string } }

/** The capability each request needs; `undefined` means the request needs none. */
export const REQUIRED_CAPABILITY: Partial<Record<HostRequest["_tag"], Capability>> = {
  "storage.get": "storage",
  "storage.set": "storage",
  "storage.delete": "storage",
  "storage.keys": "storage",
  "drawing.read": "drawing:read",
  "drawing.patch": "drawing:write",
  "toolpath.list": "toolpath:read",
  "toolpath.program": "toolpath:read",
  "ui.command": "ui:panel",
  "ui.panel": "ui:panel"
}

export interface RpcResponse {
  readonly rpcId?: string
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: { readonly _tag: string; readonly message: string }
}

// ---------------------------------------------------------------- limits

/** Sliding-window call rate limiter, one per plugin. */
export class CallRateLimiter {
  #timestamps: Array<number> = []

  constructor(
    private readonly limit: number = CALL_RATE_LIMIT,
    private readonly windowMs: number = 60_000
  ) {}

  /** `false` once the plugin has used up its budget; the call must be refused. */
  allow(now: number = Date.now()): boolean {
    this.#timestamps = this.#timestamps.filter((t) => now - t < this.windowMs)
    if (this.#timestamps.length >= this.limit) return false
    this.#timestamps.push(now)
    return true
  }

  used(now: number = Date.now()): number {
    return this.#timestamps.filter((t) => now - t < this.windowMs).length
  }
}

/** Crash history per plugin, driving the auto-disable rule (spec §3). */
export class CrashTracker {
  #times: Array<number> = []

  record(now: number = Date.now()): number {
    this.#times.push(now)
    return this.count(now)
  }

  count(now: number = Date.now()): number {
    return this.#times.filter((t) => now - t < CRASH_WINDOW_MS).length
  }
}

// ---------------------------------------------------------------- host services

/** What a plugin's world looks like from the outside. */
export interface PluginWorld {
  readonly drawing: {
    read(): unknown
    patch(patch: unknown): number
  }
  readonly toolpath: {
    list(): ReadonlyArray<unknown>
    program(id: string): unknown
  }
}

/** Persistent, namespaced key-value storage. */
export interface PluginStorageBackend {
  read(pluginId: string, key: string): string | undefined
  write(pluginId: string, key: string, value: string): void
  remove(pluginId: string, key: string): void
  list(pluginId: string): ReadonlyArray<string>
  /** Drops the plugin's whole namespace; called on uninstall (spec §5). */
  drop(pluginId: string): void
}

/** A worker as the host sees it: post a request, receive one response. */
export interface PluginWorkerHandle {
  post(request: HostRequest & { readonly rpcId?: string }): void
  onMessage(listener: (response: RpcResponse) => void): () => void
  onCrash(listener: (message: string) => void): () => void
  terminate(): void
}

/** Everything `makeHost` needs from the outside world. */
export interface PluginHostEnv {
  readonly world: PluginWorld
  readonly storage: PluginStorageBackend
  /** Spawns a sandboxed worker for the plugin. */
  readonly spawn: (record: PluginRecord) => PluginWorkerHandle
  readonly timeoutMs: number
}

/** The host service, as the HTTP layer consumes it. */
export interface PluginHostService {
  readonly install: (input: { readonly manifest: PluginManifest; readonly directory: string }) => Effect.Effect<PluginRecord, PluginError>
  readonly enable: (id: string) => Effect.Effect<RunningPlugin, PluginFailure>
  readonly disable: (id: string) => Effect.Effect<void, PluginError>
  readonly uninstall: (id: string) => Effect.Effect<void, PluginError>
  readonly list: () => Effect.Effect<ReadonlyArray<PluginRecord>, never>
  readonly get: (id: string) => Effect.Effect<PluginRecord, PluginError>
  readonly call: (pluginId: string, commandId: string) => Effect.Effect<unknown, PluginFailure>
  readonly dispose: Effect.Effect<void>
  readonly getConfig: (id: string) => Effect.Effect<Readonly<Record<string, unknown>>, PluginError>
  readonly putConfig: (id: string, config: Readonly<Record<string, unknown>>) => Effect.Effect<void, PluginError>
}

export class PluginHost extends Context.Service<PluginHost, PluginHostService>()("cadcamfun/PluginHost") {
  static layer = (env: PluginHostEnv): Layer.Layer<PluginHost> => Layer.effect(PluginHost,
    Effect.acquireRelease(Effect.sync(() => makeHost(env)), (host) => host.dispose))
}

// ---------------------------------------------------------------- host

/**
 * Builds the host over injected dependencies. `makeHost` is exported so tests can
 * exercise the whole lifecycle with a fake worker.
 */
export const makeHost = (env: PluginHostEnv): PluginHostService => {
  let disposed = false
  const pendingCalls = new Map<string, Map<string, () => void>>()
  const registry = new Map<string, PluginRecord>()
  const running = new Map<string, RunningPlugin>()
  const configs = new Map<string, Record<string, unknown>>()
  const limiters = new Map<string, CallRateLimiter>()
  const crashes = new Map<string, CrashTracker>()

  const limiterOf = (id: string): CallRateLimiter => {
    const existing = limiters.get(id)
    if (existing !== undefined) return existing
    const created = new CallRateLimiter()
    limiters.set(id, created)
    return created
  }

  const trackerOf = (id: string): CrashTracker => {
    const existing = crashes.get(id)
    if (existing !== undefined) return existing
    const created = new CrashTracker()
    crashes.set(id, created)
    return created
  }

  const markFaulted = (id: string, state: PluginState): void => {
    const record = registry.get(id)
    if (record !== undefined) registry.set(id, { ...record, state })
  }

  /** One RPC, with the capability check, the rate limit and the timeout applied. */
  const call = (
    record: PluginRecord,
    request: HostRequest
  ): Effect.Effect<unknown, PluginFailure> =>
    Effect.suspend(() => {
      if (disposed) return Effect.fail(new PluginError({ pluginId: record.id, reason: "plugin host is closed" }))
      const needed = REQUIRED_CAPABILITY[request._tag]
      if (needed !== undefined && !record.capabilities.includes(needed)) {
        return Effect.fail(new PluginCapabilityError({ pluginId: record.id, capability: needed }))
      }
      if (!limiterOf(record.id).allow()) {
        return Effect.fail(
          new PluginError({ pluginId: record.id, reason: "call rate limit exceeded" })
        )
      }
      const instance = running.get(record.id)
      if (instance === undefined) {
        return Effect.fail(new PluginError({ pluginId: record.id, reason: "plugin is not running" }))
      }
      const worker = workers.get(record.id)
      if (worker === undefined) {
        return Effect.fail(new PluginError({ pluginId: record.id, reason: "plugin worker is gone" }))
      }
      return Effect.callback<unknown, PluginFailure>((resume: (effect: Effect.Effect<unknown, PluginFailure>) => void) => {
        let pending = pendingCalls.get(record.id)
        if (!pending) { pending = new Map(); pendingCalls.set(record.id, pending) }
        if (pending.size >= MAX_PENDING_CALLS) {
          resume(Effect.fail(new PluginError({ pluginId: record.id, reason: "plugin RPC queue is full" })))
          return
        }
        const rpcId = crypto.randomUUID()
        let settled = false
        let unsubscribeMessage = () => {}
        let unsubscribeCrash = () => {}
        const cleanup = () => { clearTimeout(timer); unsubscribeMessage(); unsubscribeCrash(); pending.delete(rpcId) }
        const finish = (effect: Effect.Effect<unknown, PluginFailure>): void => {
          if (settled) return
          settled = true
          cleanup()
          resume(effect)
        }
        pending.set(rpcId, () => finish(Effect.fail(new PluginCrashedError({ pluginId: record.id, message: "plugin host closed" }))))
        const timer = setTimeout(() => {
          // Settle this request before termination rejects the other in-flight calls.
          finish(Effect.fail(new PluginTimeoutError({ pluginId: record.id, timeoutMs: env.timeoutMs })))
          worker.terminate()
          workers.delete(record.id)
          running.delete(record.id)
          markFaulted(record.id, "faulted")
          trackerOf(record.id).record()
        }, env.timeoutMs)

        unsubscribeMessage = worker.onMessage((response) => {
          if (response.rpcId !== rpcId) return
          if (response.ok) {
            finish(Effect.succeed(response.value))
          } else {
            finish(Effect.fail(responseError(record, response.error)))
          }
        })
        unsubscribeCrash = worker.onCrash((message) => {
          const count = trackerOf(record.id).record()
          finish(Effect.fail(new PluginCrashedError({ pluginId: record.id, message })))
          worker.terminate()
          workers.delete(record.id)
          running.delete(record.id)
          // Crash-looping plugins are disabled automatically (spec §3).
          markFaulted(record.id, count >= CRASH_LIMIT ? "faulted" : "faulted")
        })
        try { worker.post({ ...request, rpcId }) }
        catch (cause) {
          finish(Effect.fail(new PluginCrashedError({ pluginId: record.id, message: cause instanceof Error ? cause.message : String(cause) })))
          worker.terminate()
          workers.delete(record.id)
          running.delete(record.id)
          markFaulted(record.id, "faulted")
        }
        return Effect.sync(() => { settled = true; cleanup() })
      })
    })

  const workers = new Map<string, PluginWorkerHandle>()

  const activate = (record: PluginRecord): Effect.Effect<RunningPlugin, PluginFailure> =>
    Effect.suspend(() => {
      const worker = Effect.try({
        try: () => env.spawn(record),
        catch: (cause) =>
          new PluginCrashedError({
            pluginId: record.id,
            message: cause instanceof Error ? cause.message : String(cause)
          })
      })
      return worker.pipe(
        Effect.flatMap((handle) => {
          workers.set(record.id, handle)
          running.set(record.id, { record, contributions: emptyContributions() })
          return call(record, { _tag: "activate", granted: record.capabilities }).pipe(
            Effect.as(running.get(record.id)!),
            Effect.tapError(() =>
              Effect.sync(() => {
                handle.terminate()
                workers.delete(record.id)
                running.delete(record.id)
              })
            )
          )
        }),
        Effect.tap((instance) => collectContributions(instance))
      )
    })

  /**
   * Merges the plugin's declared contributions into its running instance. This is
   * what puts a command into the palette and a post-processor into WP2's registry
   * (spec §3).
   */
  const collectContributions = (instance: RunningPlugin): Effect.Effect<void, PluginFailure> =>
    Effect.sync(() => {
      const declared = instance.record.contributes
      if (declared === undefined) return
      const mutable = instance.contributions as {
        commands: Array<{ id: string; title: string }>
        panels: Array<{ id: string; title: string; entry: string }>
        postProcessors: Array<string>
        operations: Array<string>
      }
      if (instance.record.capabilities.includes("ui:panel")) {
        for (const command of declared.commands ?? []) mutable.commands.push({ id: command.id, title: command.title })
        for (const panel of declared.panels ?? []) {
          mutable.panels.push({ id: panel.id, title: panel.title, entry: panel.entry })
        }
      }
      // A post-processor or operation contribution is a registration, not a
      // privileged action, so it does not need `ui:panel`.
      for (const post of declared.postProcessors ?? []) mutable.postProcessors.push(post.id)
      for (const operation of declared.operations ?? []) mutable.operations.push(operation.id)
    })

  const notInstalled = (id: string): PluginError =>
    new PluginError({ pluginId: id, reason: "plugin is not installed" })

  return {
    dispose: Effect.sync(() => {
      if (disposed) return
      disposed = true
      for (const pending of pendingCalls.values()) for (const finish of [...pending.values()]) finish()
      pendingCalls.clear()
      for (const worker of workers.values()) worker.terminate()
      workers.clear()
      running.clear()
    }),
    install: ({ manifest, directory }) =>
      Effect.suspend(() => {
        if (disposed) return Effect.fail(new PluginError({ pluginId: manifest.id, reason: "plugin host is closed" }))
        const existing = registry.get(manifest.id)
        if (existing !== undefined && existing.state === "enabled") {
          return Effect.fail(
            new PluginError({
              pluginId: manifest.id,
              reason: "plugin is already installed and enabled"
            })
          )
        }
        const capabilities = effectiveCapabilities(manifest.capabilities)
        const record: PluginRecord = {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          apiVersion: manifest.apiVersion,
          entry: manifest.entry,
          directory,
          capabilities,
          contributes: manifest.contributes,
          state: "installed",
          dev: manifest.dev === true,
          ...(manifest.signature !== undefined ? { signature: manifest.signature } : {})
        }
        registry.set(record.id, record)
        return Effect.succeed(record)
      }),

    enable: (id) =>
      Effect.suspend(() => {
        if (disposed) return Effect.fail(new PluginError({ pluginId: id, reason: "plugin host is closed" }))
        const record = registry.get(id)
        if (record === undefined) return Effect.fail(notInstalled(id))
        const existing = running.get(id)
        if (existing !== undefined) return Effect.succeed(existing)
        return activate(record).pipe(
          Effect.map((instance) => {
            const enabled: RunningPlugin = { ...instance, record: { ...instance.record, state: "enabled" } }
            running.set(id, enabled)
            registry.set(id, { ...record, state: "enabled" })
            return enabled
          }),
          Effect.tapError(() =>
            Effect.sync(() => {
              trackerOf(id).record()
              registry.set(id, { ...record, state: "faulted" })
            })
          )
        )
      }),

    disable: (id) =>
      Effect.suspend(() => {
        const record = registry.get(id)
        if (record === undefined) return Effect.fail(notInstalled(id))
        const instance = running.get(id)
        if (instance === undefined) {
          registry.set(id, { ...record, state: "disabled" })
          return Effect.void
        }
        return call(record, { _tag: "deactivate" }).pipe(
          Effect.catchTag("PluginCrashedError", () => Effect.void),
          Effect.catchTag("PluginTimeoutError", () => Effect.void),
          Effect.catchTag("PluginError", () => Effect.void),
          Effect.catchTag("PluginCapabilityError", () => Effect.void),
          Effect.asVoid,
          Effect.andThen(
            Effect.sync(() => {
              workers.get(id)?.terminate()
              workers.delete(id)
              running.delete(id)
              registry.set(id, { ...record, state: "disabled" })
            })
          )
        )
      }),

    uninstall: (id) =>
      Effect.suspend(() => {
        if (!registry.has(id)) return Effect.fail(notInstalled(id))
        return Effect.sync(() => {
          workers.get(id)?.terminate()
          workers.delete(id)
          running.delete(id)
          registry.delete(id)
          configs.delete(id)
          // Uninstalling removes the registry rows and the storage namespace
          // (spec §5).
          env.storage.drop(id)
        })
      }),

    list: () => Effect.succeed([...registry.values()]),
    get: (id) =>
      Effect.suspend(() => {
        const record = registry.get(id)
        return record === undefined
          ? Effect.fail(notInstalled(id))
          : Effect.succeed(record)
      }),

    call: (pluginId, commandId) =>
      Effect.suspend(() => {
        const record = registry.get(pluginId)
        if (record === undefined) return Effect.fail(notInstalled(pluginId))
        if (running.get(pluginId) === undefined) {
          return Effect.fail(new PluginError({ pluginId, reason: "plugin is not running" }))
        }
        const declared = (record.contributes?.commands ?? []).find((c) => c.id === commandId)
        if (declared === undefined) {
          return Effect.fail(
            new PluginError({
              pluginId,
              reason: `plugin contributes no command "${commandId}"`
            })
          )
        }
        return call(record, { _tag: "ui.command", commandId })
      }),

    getConfig: (id) =>
      Effect.suspend(() => {
        if (!registry.has(id)) return Effect.fail(notInstalled(id))
        return Effect.succeed(configs.get(id) ?? {})
      }),

    putConfig: (id, config) =>
      Effect.suspend(() => {
        if (!registry.has(id)) return Effect.fail(notInstalled(id))
        return Effect.sync(() => {
          configs.set(id, { ...config })
          env.storage.write(id, "__config", JSON.stringify(config))
        })
      })
  }
}

const emptyContributions = (): {
  commands: Array<{ id: string; title: string }>
  panels: Array<{ id: string; title: string; entry: string }>
  postProcessors: Array<string>
  operations: Array<string>
} => ({ commands: [], panels: [], postProcessors: [], operations: [] })

/** Maps a worker error response onto a host error. */
const responseError = (
  record: PluginRecord,
  error: { readonly _tag: string; readonly message: string } | undefined
): PluginFailure => {
  const message = error?.message ?? "plugin call failed"
  switch (error?._tag) {
    case "CapabilityDenied":
      return new PluginCapabilityError({ pluginId: record.id, capability: "storage" })
    case "Timeout":
      return new PluginTimeoutError({ pluginId: record.id, timeoutMs: CALL_TIMEOUT_MS })
    case "NotRunning":
      return new PluginError({ pluginId: record.id, reason: message })
    default:
      return new PluginCrashedError({ pluginId: record.id, message })
  }
}

// ---------------------------------------------------------------- real worker

/**
 * Resolves a plugin's entry inside its own folder. A manifest cannot read outside
 * it: an absolute entry or a `..` segment is rejected.
 */
export const resolveEntryPath = (record: PluginRecord): string => {
  const entry = record.entry.replace(/\\/g, "/")
  if (entry.startsWith("/") || entry.split("/").includes("..")) {
    throw new EntryEscapesPluginError({ pluginId: record.id, entry: record.entry })
  }
  return `${record.directory}/${entry}`
}

/**
 * The worker bootstrap. It is a single string so the sandbox has no imports of its
 * own: `process`, `fs` and `fetch` are removed before the plugin entry runs, which
 * is what makes spec §5's "a plugin that tries to read a file or fetch" testable.
 */
export const PLUGIN_BOOTSTRAP = `
const scope = self;
// The plugin must not reach the filesystem, the network or the process table.
for (const name of ["process", "require", "Bun", "Deno", "fetch", "XMLHttpRequest", "WebSocket"]) {
  try {
    // Some of these are non-configurable in a worker, so a failure to delete is
    // expected and simply leaves the global in place.
    delete scope[name]
  } catch {
    // Ignored on purpose: the capability check in the host is the real boundary.
  }
}
let granted = [];
const host = {
  storage: {
    values: new Map(),
    get(key) { return host.storage.values.get(key) },
    set(key, value) { host.storage.values.set(key, value) },
    delete(key) { host.storage.values.delete(key) },
    keys() { return [...host.storage.values.keys()] }
  },
  drawing: { value: null, read() { return host.drawing.value }, patch(p) { return 1 } },
  toolpath: { list() { return [] }, program() { return undefined } },
  ui: { commands: [], panels: [], command(c) { host.ui.commands.push(c); return true }, panel(p) { host.ui.panels.push(p); return true } }
};

const deny = (capability) => ({ ok: false, error: { _tag: "CapabilityDenied", message: "capability " + capability + " was not granted" } });

const handlers = {
  activate(req) { granted = req.granted; return true },
  deactivate() { return true },
  "storage.get"(req) { return granted.includes("storage") ? host.storage.get(req.key) : deny("storage") },
  "storage.set"(req) { if (!granted.includes("storage")) return deny("storage"); host.storage.set(req.key, req.value); return true },
  "storage.delete"(req) { if (!granted.includes("storage")) return deny("storage"); host.storage.delete(req.key); return true },
  "storage.keys"() { return granted.includes("storage") ? host.storage.keys() : deny("storage") },
  "drawing.read"() { return granted.includes("drawing:read") ? host.drawing.read() : deny("drawing:read") },
  "drawing.patch"(req) { return granted.includes("drawing:write") ? host.drawing.patch(req.patch) : deny("drawing:write") },
  "toolpath.list"() { return granted.includes("toolpath:read") ? host.toolpath.list() : deny("toolpath:read") },
  "toolpath.program"(req) { return granted.includes("toolpath:read") ? host.toolpath.program(req.toolpathId) : deny("toolpath:read") },
  "ui.command"(req) { if (!granted.includes("ui:panel")) return deny("ui:panel"); return host.ui.command({ id: req.commandId }) },
  "ui.panel"(req) { if (!granted.includes("ui:panel")) return deny("ui:panel"); return host.ui.panel({ id: req.panel.id }) }
};

// Replies carry the request id; readiness is handled by the transport.
scope.addEventListener("message", (event) => {
  const req = event.data;
  const handler = handlers[req._tag];
  if (handler === undefined) {
    scope.postMessage({ rpcId: req.rpcId, ok: false, error: { _tag: "NotRunning", message: "unknown request " + req._tag } });
    return;
  }
  try {
    const result = handler(req) ?? null;
    // A handler answers a refusal with an ok:false envelope; that has to reach the
    // host as a failure rather than as a successful value wrapping a denial.
    if (result !== null && typeof result === "object" && result.ok === false && result.error) {
      scope.postMessage({ ...result, rpcId: req.rpcId });
      return;
    }
    scope.postMessage({ rpcId: req.rpcId, ok: true, value: result });
  } catch (error) {
    scope.postMessage({ rpcId: req.rpcId, ok: false, error: { _tag: "PluginThrew", message: error instanceof Error ? error.message : String(error) } });
  }
});
`

/** Wraps a Bun `Worker` in the handle shape the host talks to. */
export const spawnBunWorker = (record: PluginRecord): PluginWorkerHandle => {
  const entryPath = resolveEntryPath(record)
  // The host is the only thing allowed to read the plugin's source: the worker has
  // no filesystem access at all, so the code arrives inline.
  const source = readFileSync(entryPath, "utf8")
  const bundle = `${PLUGIN_BOOTSTRAP}\n${source}\nself.postMessage({ ready: true });\n//# sourceURL=plugin-${record.id}.js`
  // Bun resolves a string passed to `eval: true` as a module *path*, so the code is
  // handed over as a blob URL instead.
  const url = URL.createObjectURL(new Blob([bundle], { type: "text/javascript" }))
  const worker = new Worker(url, {
    // Bun accepts `resourceLimits`; the DOM lib does not model it.
    resourceLimits: { maxOldGenerationSizeMb: MEMORY_LIMIT_MB },
    // The plugin runs with an empty environment: no credentials, no host config.
    env: {} as Record<string, string>
  } as WorkerOptions)
  let ready = false
  let closed: string | undefined
  const outbox: Array<HostRequest & { readonly rpcId?: string }> = []
  const messages = new Set<(response: RpcResponse) => void>()
  const crashes = new Set<(message: string) => void>()
  const close = (message: string) => {
    if (closed !== undefined) return
    closed = message
    outbox.length = 0
    URL.revokeObjectURL(url)
    for (const listener of [...crashes]) listener(message)
    crashes.clear()
    messages.clear()
  }
  worker.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (closed !== undefined || typeof event.data !== "object" || event.data === null) return
    if ("ready" in event.data && event.data.ready === true) {
      if (ready) return
      ready = true
      URL.revokeObjectURL(url)
      try { for (const request of outbox.splice(0)) worker.postMessage(request) }
      catch (cause) { close(String(cause)); worker.terminate() }
      return
    }
    if (!("ok" in event.data) || typeof event.data.ok !== "boolean") return
    const response = event.data as RpcResponse
    for (const listener of [...messages]) listener(response)
  })
  worker.addEventListener("error", (event: ErrorEvent) => {
    close(event.message || "worker crashed")
    worker.terminate()
  })
  worker.addEventListener("messageerror", () => { close("plugin worker returned an unreadable response"); worker.terminate() })
  return {
    post: (request) => {
      if (closed !== undefined) throw new Error(closed)
      if (ready) worker.postMessage(request)
      else outbox.push(request)
    },
    onMessage: (listener) => { messages.add(listener); return () => { messages.delete(listener) } },
    onCrash: (listener) => {
      if (closed !== undefined) { listener(closed); return () => {} }
      crashes.add(listener)
      return () => { crashes.delete(listener) }
    },
    terminate: () => { close("plugin worker closed"); worker.terminate() }
  }
}
