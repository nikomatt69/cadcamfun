/**
 * Plugin AI tools in the running application (RM-11, spec 27 §4.2).
 *
 * The worker host (`plugins/host.ts`) runs a plugin's code in a sandboxed worker and calls the function a manifest names. This
 * service is the production caller: it loads the plugins the operator has switched on and offers their tools to the assistant (as
 * host tools, through `buildTools`' extension hook) and, read-only, to a standalone nikcli.
 *
 * Consent is a file, like the AI policy: `<data dir>/plugins/enabled.json`, a JSON array of plugin ids; the plugin lives in
 * `<data dir>/plugins/<id>/` (`plugin.json` + its entry). Nothing is loaded unless it is listed, and the only capability a plugin
 * can hold here is `ai:tool`: a manifest that asks for drawing, toolpath, storage or UI access is skipped with a warning, because
 * those surfaces are not wired to this host, and a silent no-op would be worse than a refusal. A plugin that fails to load never
 * keeps the application from starting.
 *
 * Not an OS sandbox: the worker has no process, fetch or file handle of its own, but Bun's globals stay reachable inside it. A tool
 * is code the user chose to switch on; a `write` tool is asked about before every call.
 */
import { definePluginTool, type PluginToolListing } from "@cadcamfun/ai"
import type { ToolDefinition } from "@cadcamfun/ai"
import { parseManifest } from "@cadcamfun/plugin-sdk"
import { Cause, Context, Data, Effect, Layer, Semaphore } from "effect"
import { existsSync, readFileSync } from "node:fs"
import { mkdir, readdir, readFile, writeFile, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { AppConfigService } from "../config.ts"
import { makeHost, spawnBunWorker, type PluginHostService } from "../plugins/host.ts"

/** The only capability a plugin can hold in this host; see the module note. */
export const SUPPORTED_PLUGIN_CAPABILITIES: ReadonlyArray<string> = ["ai:tool"]

export class AiPluginError extends Data.TaggedError("AiPluginError")<{ readonly message: string }> {}

export class AiPlugins extends Context.Service<AiPlugins, {
  /** The tools of the plugins that are running now, as host tools; read on every call, so a plugin switched on later shows. */
  readonly installed: Effect.Effect<ReadonlyArray<{ id: string; name: string; version: string; enabled: boolean; tools: number }>, AiPluginError>
  readonly remove: (id: string) => Effect.Effect<void, AiPluginError>
  readonly install: (manifest: string, source: string) => Effect.Effect<void, AiPluginError>
  readonly toggle: (id: string, enabled: boolean) => Effect.Effect<void, AiPluginError>
  readonly tools: () => ReadonlyArray<ToolDefinition>
  readonly listing: () => ReadonlyArray<PluginToolListing & { readonly toolId: string }>
}>()("cadcamfun/AiPlugins") {}

/** What `enabled.json` switches on: ids only. Anything else in the file is ignored with a warning. */
export const readEnabledPlugins = (path: string): ReadonlyArray<string> => {
  if (!existsSync(path)) return []
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"))
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(id)))] : []
  } catch { return [] }
}

const toolFailure = (cause: unknown): { readonly ok: false; readonly error: string } => {
  const text = typeof cause === "object" && cause !== null && "reason" in cause ? String((cause as { reason: unknown }).reason)
    : typeof cause === "object" && cause !== null && "message" in cause ? String((cause as { message: unknown }).message) : String(cause)
  return { ok: false, error: text.slice(0, 500) }
}

/** Loads the switched-on plugins into a host; each failure is a warning, never an error. */
export const loadPlugins = (host: PluginHostService, root: string): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function*() {
    const loaded: string[] = []
    for (const id of readEnabledPlugins(join(root, "enabled.json"))) {
      const directory = join(root, id)
      const outcome = yield* Effect.gen(function*() {
        const manifest = yield* Effect.try(() => readFileSync(join(directory, "plugin.json"), "utf8")).pipe(Effect.flatMap(parseManifest))
        if (manifest.id !== id) return yield* Effect.fail(new Error(`the folder is named ${id} but the manifest says ${manifest.id}`))
        const unsupported = manifest.capabilities.filter((capability) => !SUPPORTED_PLUGIN_CAPABILITIES.includes(capability))
        if (unsupported.length > 0) return yield* Effect.fail(new Error(`it asks for ${unsupported.join(", ")}, which this application does not wire to plugins yet (only ai:tool)`))
        yield* host.install({ manifest, directory })
        yield* host.enable(id)
        return id
      }).pipe(Effect.catchCause((cause) => Effect.logWarning(`Plugin ${id} was not loaded: ${toolFailure(Cause.squash(cause)).error}`).pipe(Effect.as(undefined))))
      if (outcome !== undefined) loaded.push(outcome)
    }
    return loaded
  })

export const AiPluginsLive = Layer.effect(AiPlugins, Effect.gen(function*() {
  const config = yield* AppConfigService
  const host = yield* Effect.acquireRelease(
    Effect.sync(() => makeHost({
      // Only `ai:tool` is granted, so none of these is reachable; they refuse rather than pretend.
      world: { drawing: { read: () => undefined, patch: () => { throw new Error("drawing access is not available to plugins") } }, toolpath: { list: () => [], program: () => undefined } },
      storage: { read: () => undefined, write: () => {}, remove: () => {}, list: () => [], drop: () => {} },
      spawn: spawnBunWorker,
      timeoutMs: 10_000
    })),
    (instance) => instance.dispose
  )
  yield* loadPlugins(host, join(config.dataDir, "plugins"))
  const root = join(config.dataDir, "plugins")
  const lock = yield* Semaphore.make(1)
  const attempt = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: (cause) => new AiPluginError({ message: toolFailure(cause).error }) })
  const manifestFor = async (text: string) => {
    const manifest = await Effect.runPromise(parseManifest(text))
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(manifest.id)) throw new Error("Invalid plugin id")
    if (manifest.capabilities.some((capability) => !SUPPORTED_PLUGIN_CAPABILITIES.includes(capability))) throw new Error("This host currently supports only the ai:tool capability")
    return manifest
  }
  const installed = attempt(async () => {
    await mkdir(root, { recursive: true })
    const live = await Effect.runPromise(host.list())
    const plugins = []
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(entry.name)) continue
      try {
        const manifest = await manifestFor(await readFile(join(root, entry.name, "plugin.json"), "utf8"))
        if (manifest.id !== entry.name) continue
        plugins.push({ id: manifest.id, name: manifest.name, version: manifest.version, enabled: live.some((record) => record.id === manifest.id && record.state === "enabled"), tools: manifest.contributes?.aiTools?.length ?? 0 })
      } catch { /* unrelated or invalid folders are never loaded */ }
    }
    return plugins.sort((a, b) => a.name.localeCompare(b.name))
  })
  const listing = () => host.aiTools().map((tool) => ({ pluginId: tool.pluginId, pluginName: tool.pluginName, id: tool.id, toolId: tool.id, description: tool.description, kind: tool.kind, parameters: tool.parameters }))
  return AiPlugins.of({
    installed,
    remove: (id) => lock.withPermit(attempt(async () => {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(id)) throw new Error("Invalid plugin id")
      const records = await Effect.runPromise(host.list())
      if (records.some((record) => record.id === id)) await Effect.runPromise(host.uninstall(id))
      const ids = readEnabledPlugins(join(root, "enabled.json")).filter((candidate) => candidate !== id)
      const temp = join(root, `.enabled-${crypto.randomUUID()}.tmp`)
      try {
        await writeFile(temp, JSON.stringify(ids), { mode: 0o600 })
        await rename(temp, join(root, "enabled.json"))
      } finally { await rm(temp, { force: true }) }
      await rm(join(root, id), { recursive: true, force: true })
    })),
    install: (text, source) => lock.withPermit(attempt(async () => {
      if (!source.trim() || source.length > 500_000 || text.length > 64_000) throw new Error("Provide a manifest (up to 64 KB) and JavaScript source (up to 500 KB)")
      const manifest = await manifestFor(text)
      if (manifest.entry !== "index.js") throw new Error("Uploaded plugins must use index.js as their entry")
      const directory = join(root, manifest.id)
      if (existsSync(directory)) throw new Error("This plugin is already installed")
      await mkdir(root, { recursive: true })
      const temp = join(root, `.${crypto.randomUUID()}.tmp`)
      await mkdir(temp, { mode: 0o700 })
      try {
        await writeFile(join(temp, "plugin.json"), text, { mode: 0o600 })
        await writeFile(join(temp, "index.js"), source, { mode: 0o600 })
        await rename(temp, directory)
      } finally { await rm(temp, { recursive: true, force: true }) }
    })),
    toggle: (id, enabled) => lock.withPermit(attempt(async () => {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(id)) throw new Error("Invalid plugin id")
      const directory = join(root, id)
      const manifest = await manifestFor(await readFile(join(directory, "plugin.json"), "utf8"))
      if (manifest.id !== id) throw new Error("Plugin id does not match its folder")
      const records = await Effect.runPromise(host.list())
      if (enabled) {
        if (!records.some((record) => record.id === id)) await Effect.runPromise(host.install({ manifest, directory }))
        await Effect.runPromise(host.enable(id))
      } else if (records.some((record) => record.id === id)) await Effect.runPromise(host.disable(id))
      const ids = new Set(readEnabledPlugins(join(root, "enabled.json")))
      if (enabled) ids.add(id)
      else ids.delete(id)
      const temp = join(root, `.enabled-${crypto.randomUUID()}.tmp`)
      try {
        await writeFile(temp, JSON.stringify([...ids]), { mode: 0o600 })
        await rename(temp, join(root, "enabled.json"))
      } catch (cause) {
        if (enabled) await Effect.runPromise(host.disable(id))
        throw cause
      } finally { await rm(temp, { force: true }) }
    })),
    listing,
    tools: () => listing().map((entry) => definePluginTool(entry, async (args) => {
      // A call that throws, times out or finds the plugin gone is a result the assistant can read, not a crash of the turn.
      return await Effect.runPromise(host.callTool(entry.pluginId, entry.id, args).pipe(Effect.catch((cause) => Effect.succeed(toolFailure(cause)))))
    }))
  })
}))
