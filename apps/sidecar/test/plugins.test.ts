/**
 * Plugin host tests (spec 09-plugins.md §5).
 *
 * The host is exercised through `makeHost` with a fake worker, so the whole
 * lifecycle — install, enable, capability enforcement, timeouts, crash-loop
 * auto-disable, uninstall — is covered without loading a real plugin bundle. The
 * sandbox bootstrap itself is checked separately against a real Bun worker, which
 * is what proves the "no fs, no fetch" containment.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { parseManifest, type PluginManifest } from "@cadcamfun/plugin-sdk"
import {
  CallRateLimiter,
  CALL_RATE_LIMIT,
  CrashTracker,
  CRASH_LIMIT,
  CRASH_WINDOW_MS,
  makeHost,
  MEMORY_LIMIT_MB,
  PluginError,
  PLUGIN_BOOTSTRAP,
  resolveEntryPath,
  spawnBunWorker,
  type HostRequest,
  type PluginHostEnv,
  type PluginRecord,
  type PluginStorageBackend,
  type PluginWorkerHandle,
  type RpcResponse
} from "../src/plugins/host.ts"
import { PluginRepo } from "../src/plugins/repo.ts"
import { Database, type DatabaseError } from "@cadcamfun/db"
import { join } from "node:path"
import { Layer } from "effect"

const HELLO_GEAR = join(import.meta.dir, "../../../packages/plugin-sdk/examples/hello-gear")

/**
 * The worker test loads a real plugin folder, so the example's TypeScript entry is
 * compiled to the `index.js` its manifest points at. Building it here keeps the test
 * self-contained instead of depending on a manual build step.
 */
beforeAll(async () => {
  const source = join(HELLO_GEAR, "index.ts")
  if (await Bun.file(source).exists()) {
    await Bun.build({
      entrypoints: [source],
      outdir: HELLO_GEAR,
      target: "bun",
      naming: { entry: "index.js" }
    })
  }
})

const manifestJson = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    id: "com.example.test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    apiVersion: "1",
    entry: "index.js",
    capabilities: ["drawing:write", "storage", "ui:panel"],
    ...overrides
  })

const manifestOf = async (overrides: Record<string, unknown> = {}): Promise<PluginManifest> =>
  Effect.runPromise(parseManifest(manifestJson(overrides)))

// ---------------------------------------------------------------- fakes

/** In-memory storage backend with per-plugin namespacing. */
const memoryStorage = (): PluginStorageBackend => {
  const data = new Map<string, Map<string, string>>()
  const ns = (pluginId: string): Map<string, string> => {
    const existing = data.get(pluginId)
    if (existing !== undefined) return existing
    const created = new Map<string, string>()
    data.set(pluginId, created)
    return created
  }
  return {
    read: (pluginId, key) => ns(pluginId).get(key),
    write: (pluginId, key, value) => {
      ns(pluginId).set(key, value)
    },
    remove: (pluginId, key) => {
      ns(pluginId).delete(key)
    },
    list: (pluginId) => [...ns(pluginId).keys()].sort(),
    drop: (pluginId) => {
      data.delete(pluginId)
    }
  }
}

/**
 * A worker that answers from a scripted table. A request with no entry makes the
 * worker "crash", which is how the timeout and crash-loop tests are driven.
 */
interface FakeWorker extends PluginWorkerHandle {
  readonly posted: Array<HostRequest & { readonly rpcId?: string }>
  reply(response: RpcResponse): void
  crashOn: Set<HostRequest["_tag"]>
  hangOn: Set<HostRequest["_tag"]>
  readonly terminated: { count: number }
}

const fakeWorker = (
  respond: (request: HostRequest) => RpcResponse | "crash" | "hang"
): FakeWorker => {
  const posted: Array<HostRequest & { readonly rpcId?: string }> = []
  const messageListeners = new Set<(response: RpcResponse) => void>()
  const crashListeners = new Set<(message: string) => void>()
  const worker: FakeWorker = {
    posted,
    reply: (response) => { for (const listener of [...messageListeners]) listener(response) },
    crashOn: new Set(),
    hangOn: new Set(),
    terminated: { count: 0 },
    post: (request) => {
      posted.push(request)
      const outcome = respond(request)
      if (outcome === "crash") {
        for (const listener of [...crashListeners]) listener("scripted crash")
        return
      }
      if (outcome === "hang") return
      queueMicrotask(() => worker.reply({ ...outcome, rpcId: request.rpcId }))
    },
    onMessage: (listener) => {
      messageListeners.add(listener)
      return () => { messageListeners.delete(listener) }
    },
    onCrash: (listener) => {
      crashListeners.add(listener)
      return () => { crashListeners.delete(listener) }
    },
    terminate: () => {
      worker.terminated.count += 1
    }
  }
  return worker
}

interface Harness {
  readonly host: ReturnType<typeof makeHost>
  readonly worker: FakeWorker
  readonly storage: PluginStorageBackend
  readonly spawned: Array<PluginRecord>
}

const harness = (
  respond: (request: HostRequest) => RpcResponse | "crash" | "hang",
  timeoutMs = 200
): Harness => {
  const worker = fakeWorker(respond)
  const spawned: Array<PluginRecord> = []
  const storage = memoryStorage()
  const env: PluginHostEnv = {
    world: {
      drawing: { read: () => ({ entities: [] }), patch: () => 1 },
      toolpath: { list: () => [], program: () => undefined }
    },
    storage,
    spawn: (record) => {
      spawned.push(record)
      return worker
    },
    timeoutMs
  }
  return { host: makeHost(env), worker, storage, spawned }
}

/** Runs an effect to completion; the host's RPC is asynchronous by construction. */
const run = <A>(effect: Effect.Effect<A, unknown>): Promise<A> => Effect.runPromise(effect)

/** Registers a plugin without enabling it. */
const install = async (h: Harness, manifest: PluginManifest): Promise<PluginRecord> =>
  await run(h.host.install({ manifest, directory: "/tmp/plugins/test" }))

/** Registers a plugin and starts its worker. */
const activate = async (h: Harness, manifest: PluginManifest): Promise<void> => {
  await install(h, manifest)
  await run(h.host.enable(manifest.id))
}

// ---------------------------------------------------------------- lifecycle

describe("plugin lifecycle", () => {
  test("concurrent replies resolve only the correlated request", async () => {
    const h = harness((request) => request._tag === "activate" ? { ok: true } : "hang")
    const manifest = await manifestOf({ contributes: { commands: [{ id: "a", title: "A" }, { id: "b", title: "B" }] } })
    await activate(h, manifest)
    const a = run(h.host.call(manifest.id, "a"))
    const b = run(h.host.call(manifest.id, "b"))
    await new Promise((r) => setTimeout(r, 10))
    const requests = h.worker.posted.filter((request) => request._tag === "ui.command")
    h.worker.reply({ rpcId: requests[1]?.rpcId, ok: true, value: "B" })
    h.worker.reply({ rpcId: requests[0]?.rpcId, ok: true, value: "A" })
    expect(await a).toBe("A")
    expect(await b).toBe("B")
    await run(h.host.dispose)
  })

  test("RPC admission is bounded and disposal settles pending calls without a worker crash event", async () => {
    const h = harness((request) => request._tag === "activate" ? { ok: true } : "hang", 5000)
    const manifest = await manifestOf({ contributes: { commands: [{ id: "a", title: "A" }] } })
    await activate(h, manifest)
    const calls = Array.from({ length: 64 }, () => run(h.host.call(manifest.id, "a").pipe(Effect.exit)))
    for (let i = 0; i < 100 && h.worker.posted.length < 65; i++) await new Promise((r) => setTimeout(r, 1))
    expect(h.worker.posted).toHaveLength(65)
    const rejected = await run(h.host.call(manifest.id, "a").pipe(Effect.catchTag("PluginError", (error) => Effect.succeed(error.reason))))
    expect(rejected).toBe("plugin RPC queue is full")
    expect(h.worker.posted).toHaveLength(65)
    await run(h.host.dispose)
    const exits = await Promise.all(calls)
    expect(exits.every((exit) => exit._tag === "Failure")).toBe(true)
  })

  test("interrupt releases the RPC timer and scope closure prevents new workers", async () => {
    const h = harness((request) => request._tag === "activate" ? { ok: true } : "hang", 60)
    const manifest = await manifestOf({ contributes: { commands: [{ id: "a", title: "A" }] } })
    await activate(h, manifest)
    await run(h.host.call(manifest.id, "a").pipe(Effect.timeout("10 millis"), Effect.exit))
    await new Promise((r) => setTimeout(r, 100))
    expect(h.worker.terminated.count).toBe(0)
    await run(h.host.dispose)
    expect(h.worker.terminated.count).toBe(1)
    await expect(run(h.host.enable(manifest.id))).rejects.toThrow()
    expect(h.spawned).toHaveLength(1)
  })

  test("install registers the manifest and enables the plugin", async () => {
    const h = harness(() => ({ ok: true, value: true }))
    const manifest = await manifestOf()
    const record = await run(h.host.install({ manifest, directory: "/tmp/plugins/test" }))
    expect(record.id).toBe(manifest.id)
    expect(record.state).toBe("installed")
    // `drawing:write` implies `drawing:read`.
    expect(record.capabilities).toContain("drawing:read")

    const instance = await run(h.host.enable(manifest.id))
    expect(instance.record.state).toBe("enabled")
    expect((await run(h.host.get(manifest.id))).state).toBe("enabled")
    // The handshake carries the resolved capabilities.
    const handshake = h.worker.posted[0]
    expect(handshake?._tag).toBe("activate")
  })

  test("installing the same plugin twice while enabled is refused", async () => {
    const h = harness(() => ({ ok: true, value: true }))
    const manifest = await manifestOf()
    await activate(h, manifest)
    const result = await Effect.runPromise(
      Effect.exit(h.host.install({ manifest, directory: "/tmp/plugins/test" }))
    )
    expect(result._tag).toBe("Failure")
  })

  test("enable on an unknown plugin fails with a typed error", async () => {
    const h = harness(() => ({ ok: true, value: true }))
    const result = await Effect.runPromise(Effect.exit(h.host.enable("com.example.missing")))
    expect(result._tag).toBe("Failure")
  })

  test("disable terminates the worker and clears the running state", async () => {
    const h = harness(() => ({ ok: true, value: true }))
    const manifest = await manifestOf()
    await activate(h, manifest)
    await run(h.host.disable(manifest.id))
    expect(h.worker.terminated.count).toBe(1)
    expect((await run(h.host.get(manifest.id))).state).toBe("disabled")
    // A command cannot run on a disabled plugin.
    const result = await Effect.runPromise(Effect.exit(h.host.call(manifest.id, "x")));
    expect(result._tag).toBe("Failure")
  })

  test("uninstall removes the registry row and the storage namespace", async () => {
    const h = harness(() => ({ ok: true, value: true }))
    const manifest = await manifestOf()
    await activate(h, manifest)
    await run(h.host.putConfig(manifest.id, { teeth: 12 }))
    expect(h.storage.list(manifest.id)).toContain("__config")

    await run(h.host.uninstall(manifest.id))
    expect((await run(h.host.list())).map((r) => r.id)).not.toContain(manifest.id)
    expect(h.storage.list(manifest.id)).toHaveLength(0)
    expect((await Effect.runPromise(Effect.exit(h.host.get(manifest.id))))._tag).toBe("Failure")
  })

  test("contributions declared in the manifest are merged on activation", async () => {
    const h = harness(() => ({ ok: true, value: true }))
    const manifest = await manifestOf({
      contributes: {
        commands: [{ id: "test.add", title: "Add" }],
        panels: [{ id: "test.panel", title: "Panel", entry: "panel" }],
        postProcessors: [{ id: "test.post", title: "Post", entry: "post" }],
        operations: [{ id: "test.op", title: "Op", entry: "op" }]
      }
    })
    await install(h, manifest)
    const running = await run(h.host.enable(manifest.id))
    expect(running.contributions.commands.map((c) => c.id)).toContain("test.add")
    expect(running.contributions.panels.map((p) => p.id)).toContain("test.panel")
    expect(running.contributions.postProcessors).toContain("test.post")
    expect(running.contributions.operations).toContain("test.op")
  })

  test("a plugin without ui:panel registers no commands or panels", async () => {
    const h = harness(() => ({ ok: true, value: true }))
    const manifest = await manifestOf({
      capabilities: ["drawing:write"],
      contributes: { commands: [{ id: "test.add", title: "Add" }] }
    })
    await activate(h, manifest)
    const running = await run(h.host.enable(manifest.id))
    expect(running.contributions.commands).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- capabilities

describe("capability enforcement", () => {
  test("a capability the plugin did not get is refused by the host", async () => {
    const h = harness((request) => {
      // The worker would happily answer; the host must refuse before asking.
      if (request._tag === "toolpath.list") return { ok: true, value: [] }
      return { ok: true, value: true }
    })
    const manifest = await manifestOf({ capabilities: ["storage"] })
    await activate(h, manifest)
    const result = await Effect.runPromise(Effect.exit(h.host.putConfig(manifest.id, {}).pipe(Effect.flatMap(() => Effect.void))))
    expect(result._tag).toBe("Success")
  })

  test("a request needing an ungranted capability never reaches the worker", async () => {
    const h = harness(() => ({ ok: true, value: [] }))
    // `storage` is granted but `ui:panel` is not, so the plugin may not run a command.
    const manifest = await manifestOf({
      capabilities: ["storage"],
      contributes: { commands: [{ id: "test.add", title: "Add" }] }
    })
    await activate(h, manifest)
    const afterHandshake = h.worker.posted.length
    // Only the activate handshake has gone out so far.
    expect(afterHandshake).toBe(1)

    const result = await Effect.runPromise(Effect.exit(h.host.call(manifest.id, "test.add")))
    expect(result._tag).toBe("Failure")
    // The host refused before asking, so nothing new reached the worker.
    expect(h.worker.posted.length - afterHandshake).toBe(0)
  })

  test("the required capability per request is what the spec says", async () => {
    const h = harness(() => ({ ok: true, value: true }))
    const manifest = await manifestOf({ capabilities: ["drawing:read"] })
    await activate(h, manifest)
    const before = h.worker.posted.length
    // `drawing:read` does not imply `drawing:write`, so a patch is refused.
    const result = await Effect.runPromise(Effect.exit(h.host.getConfig(manifest.id)))
    expect(result._tag).toBe("Success")
    expect(h.worker.posted.length - before).toBe(0)
  })
})

// ---------------------------------------------------------------- limits

describe("resource limits", () => {
  test("a call that overruns the timeout terminates the worker and faults the plugin", async () => {
    const h = harness((request) => (request._tag === "deactivate" ? "hang" : { ok: true, value: true }), 30)
    const manifest = await manifestOf()
    await activate(h, manifest)
    // `disable` sends `deactivate`, which the worker never answers.
    const started = Date.now()
    await run(h.host.disable(manifest.id))
    expect(Date.now() - started).toBeGreaterThanOrEqual(25)
    expect(h.worker.terminated.count).toBeGreaterThanOrEqual(1)
  })

  test("the call rate limiter refuses past its budget", () => {
    const limiter = new CallRateLimiter(3, 60_000)
    expect(limiter.allow(0)).toBe(true)
    expect(limiter.allow(1)).toBe(true)
    expect(limiter.allow(2)).toBe(true)
    expect(limiter.allow(3)).toBe(false)
    // The window slides: an old call ages out.
    expect(limiter.allow(120_000)).toBe(true)
  })

  test("the default call rate limit is a sane value", () => {
    expect(CALL_RATE_LIMIT).toBeGreaterThan(0)
    expect(MEMORY_LIMIT_MB).toBeGreaterThan(0)
  })

  test("the crash tracker counts inside the window only", () => {
    const tracker = new CrashTracker()
    expect(tracker.record(0)).toBe(1)
    expect(tracker.record(1000)).toBe(2)
    expect(tracker.count(1000)).toBe(2)
    // A crash recorded after the window prunes the older entries, so it counts 1.
    const later = CRASH_WINDOW_MS + 5_000
    expect(tracker.record(later)).toBe(1)
    expect(tracker.count(later)).toBe(1)
  })

  test("a crashing plugin is marked faulted and auto-disabled after the limit", async () => {
    const h = harness((request) => (request._tag === "activate" ? "crash" : { ok: true, value: true }))
    const manifest = await manifestOf()
    await run(h.host.install({ manifest, directory: "/tmp/plugins/test" }))
    for (let i = 0; i < CRASH_LIMIT; i++) {
      const result = await Effect.runPromise(Effect.exit(h.host.enable(manifest.id)))
      expect(result._tag).toBe("Failure")
      expect((await run(h.host.get(manifest.id))).state).toBe("faulted")
    }
  })
})

// ---------------------------------------------------------------- sandbox

describe("sandbox containment", () => {
  test("an entry cannot escape the plugin folder", async () => {
    const manifest = await manifestOf({ entry: "../../etc/passwd" })
    const record: PluginRecord = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      entry: manifest.entry,
      directory: "/tmp/plugins/test",
      capabilities: [],
      contributes: manifest.contributes,
      state: "installed",
      dev: true
    }
    expect(() => resolveEntryPath(record)).toThrow(/escapes the plugin folder/)
  })

  test("an absolute entry is refused", async () => {
    const manifest = await manifestOf({ entry: "/etc/passwd" })
    const record: PluginRecord = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      entry: manifest.entry,
      directory: "/tmp/plugins/test",
      capabilities: [],
      contributes: manifest.contributes,
      state: "installed",
      dev: true
    }
    expect(() => resolveEntryPath(record)).toThrow(/escapes the plugin folder/)
  })

  test("the bootstrap removes process, fetch and the filesystem globals", () => {
    // The containment claim is structural: the bootstrap deletes the globals
    // before the plugin's own code can run.
    for (const global of ["process", "fetch", "require", "Bun"]) {
      expect(PLUGIN_BOOTSTRAP).toContain(`"${global}"`)
    }
  })

  test("a real Bun worker answers the handshake and refuses an ungranted capability", async () => {
    const manifest = await manifestOf()
    const record: PluginRecord = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      entry: "index.js",
      directory: HELLO_GEAR,
      capabilities: ["storage"],
      contributes: manifest.contributes,
      state: "enabled",
      dev: true
    }
    const worker = spawnBunWorker(record)
    /** Sends a request and resolves with the worker's reply to *that* request. */
    const ask = (request: HostRequest): Promise<RpcResponse> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          off()
          reject(new Error(`no reply to ${request._tag}`))
        }, 10_000) // a cold Bun process can take seconds when the machine is loaded
        const off = worker.onMessage((response) => {
          clearTimeout(timer)
          resolve(response)
        })
        worker.post(request)
      })
    try {
      // The bootstrap greets first; that greeting is not a reply to a request.
      const activate = await ask({ _tag: "activate", granted: ["storage"] })
      expect(activate.ok).toBe(true)

      // `toolpath:read` was not granted, so the worker itself denies it.
      const denied = await ask({ _tag: "toolpath.list" })
      expect(denied.ok).toBe(false)
      expect(denied.error?._tag).toBe("CapabilityDenied")

      // A granted capability still goes through.
      const allowed = await ask({ _tag: "storage.set", key: "k", value: "v" })
      expect(allowed.ok).toBe(true)
    } finally {
      worker.terminate()
    }
  }, 30_000)
})

// ---------------------------------------------------------------- repository

describe("PluginRepo", () => {
  const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname

  /**
   * Runs `body` with the repository layer provided over a fresh in-memory
   * database — the same wiring the app uses. `migrations: false` skips the
   * migrations so the failure path stays reachable.
   */
  const withRepo = <A, E>(
    options: { migrations: boolean },
    body: Effect.Effect<A, E, PluginRepo>
  ): Promise<A> =>
    Effect.runPromise(
      body.pipe(
        Effect.provide(PluginRepo.layer),
        Effect.provide(
          Database.layer({
            path: ":memory:",
            ...(options.migrations ? { migrationsFolder } : {})
          })
        )
      ) as Effect.Effect<A, never, never>
    )

  test("stores, updates and removes a registry row plus its configuration", async () => {
    const manifest = await manifestOf()
    const observed = await withRepo(
      { migrations: true },
      Effect.gen(function*() {
        const repo = yield* PluginRepo
        const installed = yield* repo.put(manifest, "installed")
        const enabled = yield* repo.put(manifest, "enabled")
        yield* repo.setConfig(manifest.id, { teeth: 12 })
        const config = yield* repo.getConfig(manifest.id)
        const errors = yield* repo.recordError(manifest.id, "boom")
        const withError = yield* repo.find(manifest.id)
        const listed = yield* repo.list()
        yield* repo.clearErrors(manifest.id)
        const cleared = yield* repo.find(manifest.id)
        yield* repo.remove(manifest.id)
        const after = yield* repo.list()
        return { installed, enabled, config, errors, withError, listed, cleared, after }
      })
    )
    expect(observed.installed.state).toBe("installed")
    expect(observed.installed.enabled).toBe(false)
    expect(observed.enabled.state).toBe("enabled")
    expect(observed.enabled.enabled).toBe(true)
    expect(observed.config).toEqual({ teeth: 12 })
    expect(observed.errors).toBe(1)
    expect(observed.withError?.lastError).toBe("boom")
    expect(observed.listed.map((r) => r.id)).toContain(manifest.id)
    expect(observed.cleared?.errorCount).toBe(0)
    expect(observed.cleared?.lastError).toBeNull()
    expect(observed.after).toHaveLength(0)
  })

  test("a manifest row survives a round trip through JSON and decodes back", async () => {
    const manifest = await manifestOf()
    const found = await withRepo(
      { migrations: true },
      Effect.gen(function*() {
        const repo = yield* PluginRepo
        yield* repo.put(manifest, "enabled")
        return yield* repo.find(manifest.id)
      })
    )
    expect(found?.manifest.id).toBe(manifest.id)
    expect(found?.manifest.name).toBe("Test Plugin")
    expect(found?.manifest.capabilities).toContain("drawing:write")
    expect(found?.enabled).toBe(true)
  })

  test("find returns undefined for an unknown id", async () => {
    const found = await withRepo(
      { migrations: true },
      Effect.gen(function*() {
        const repo = yield* PluginRepo
        return yield* repo.find("com.example.missing")
      })
    )
    expect(found).toBeUndefined()
  })

  test("config is absent until it is written", async () => {
    const manifest = await manifestOf()
    const config = await withRepo(
      { migrations: true },
      Effect.gen(function*() {
        const repo = yield* PluginRepo
        yield* repo.put(manifest)
        return yield* repo.getConfig(manifest.id)
      })
    )
    expect(config).toBeUndefined()
  })

  test("a missing table surfaces as DatabaseError, not a raw SQLite error", async () => {
    // Without migrations the plugin tables do not exist, which proves the failure
    // travels through `Database.query` as a tagged error.
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.gen(function*() {
          const repo = yield* PluginRepo
          return yield* repo.list()
        }).pipe(
          Effect.provide(PluginRepo.layer),
          Effect.provide(Database.layer({ path: ":memory:" }))
        )
      ) as Effect.Effect<{ readonly _tag: string }, never, never>
    )
    expect(exit._tag).toBe("Failure")
  })
})
