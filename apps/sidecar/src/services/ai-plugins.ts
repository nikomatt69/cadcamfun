/**
 * Plugin AI tools, mods and modes in the running application (RM-11, spec 27 §4.2, spec 09-plugins.md assistant extensions).
 *
 * The worker host (`plugins/host.ts`) runs a plugin's code in a sandboxed worker and calls the function a manifest names. This
 * service is the production caller: it loads the plugins the operator has switched on and offers their tools to the assistant (as
 * host tools, through `buildTools`' extension hook) and, read-only, to a standalone nikcli; it also materializes the mods a
 * plugin ships (as `file://` specs the host config declares, next to the app-owned store's) and the assistant modes it
 * contributes (prompt blocks the mode picker offers).
 *
 * Consent is a file, like the AI policy: `<data dir>/plugins/enabled.json`, a JSON array of plugin ids; the plugin lives in
 * `<data dir>/plugins/<id>/` (`plugin.json` + its entry). Nothing is loaded unless it is listed, and the capabilities this host
 * wires are `ai:tool`, `ai:mod` and `ai:mode`: a manifest that asks for drawing, toolpath, storage or UI access is skipped with
 * a warning, because those surfaces are not wired to this host, and a silent no-op would be worse than a refusal. A contribution
 * without its capability is refused too (mods need `ai:mod`, modes `ai:mode`, tools `ai:tool`): the capability is the grant.
 * A plugin that fails to load never keeps the application from starting.
 *
 * Not an OS sandbox: the worker has no process, fetch or file handle of its own, but Bun's globals stay reachable inside it. A tool
 * is code the user chose to switch on; a `write` tool is asked about before every call. A mod is stronger still — it hooks the
 * whole host — which is why it is its own capability and why only enabled plugins' mods are ever declared.
 */
import { definePluginTool, type ContributedMode, type PluginToolListing } from "@cadcamfun/ai"
import type { ToolDefinition } from "@cadcamfun/ai"
import { parseManifest, PluginManifestSchema, type PluginManifest } from "@cadcamfun/plugin-sdk"
import { Cause, Context, Data, Effect, Layer, Schema, Semaphore } from "effect"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { mkdir, readdir, readFile, writeFile, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { AppConfigService } from "../config.ts"
import { makeHost, spawnBunWorker, type PluginHostService } from "../plugins/host.ts"

/** The capabilities this host wires to plugins; see the module note. */
export const SUPPORTED_PLUGIN_CAPABILITIES: ReadonlyArray<string> = ["ai:tool", "ai:mod", "ai:mode"]

export class AiPluginError extends Data.TaggedError("AiPluginError")<{ readonly message: string }> {}

export class AiPlugins extends Context.Service<AiPlugins, {
  /** The tools of the plugins that are running now, as host tools; read on every call, so a plugin switched on later shows. */
  readonly installed: Effect.Effect<ReadonlyArray<{ id: string; name: string; version: string; enabled: boolean; tools: number; mods: number; modes: number }>, AiPluginError>
  readonly remove: (id: string) => Effect.Effect<void, AiPluginError>
  readonly install: (manifest: string, source: string, files?: Readonly<Record<string, string>>) => Effect.Effect<void, AiPluginError>
  readonly toggle: (id: string, enabled: boolean) => Effect.Effect<void, AiPluginError>
  readonly tools: () => ReadonlyArray<ToolDefinition>
  readonly listing: () => ReadonlyArray<PluginToolListing & { readonly toolId: string }>
  /** The `file://` specs of the enabled plugins' mods, read on every configuration publication, so a toggle applies. */
  readonly modSpecs: () => ReadonlyArray<string>
  /** The mods the enabled plugins ship, for the Extensions panel. */
  readonly modList: () => ReadonlyArray<ContributedMod>
  /** The assistant modes the enabled plugins contribute, `enabled.json` order. */
  readonly modes: () => ReadonlyArray<ContributedMode>
}>()("cadcamfun/AiPlugins") {}

/** What `enabled.json` switches on: ids only. Anything else in the file is ignored with a warning. */
export const readEnabledPlugins = (path: string): ReadonlyArray<string> => {
  if (!existsSync(path)) return []
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"))
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(id)))] : []
  } catch { return [] }
}

/**
 * A contribution must hold the capability it acts through: the capability is the grant the person gave, so a manifest
 * cannot ship a mod out of an `ai:tool` grant, or a tool out of an `ai:mod` one. Cross-field rules the Schema cannot
 * express, kept in one place so the loader and the install face refuse exactly the same manifests.
 */
export const contributionProblems = (manifest: PluginManifest): ReadonlyArray<string> => {
  const problems: string[] = []
  const unsupported = manifest.capabilities.filter((capability) => !SUPPORTED_PLUGIN_CAPABILITIES.includes(capability))
  if (unsupported.length > 0) problems.push(`This host does not wire ${unsupported.join(", ")} to plugins (supported: ${SUPPORTED_PLUGIN_CAPABILITIES.join(", ")})`)
  if ((manifest.contributes?.aiTools?.length ?? 0) > 0 && !manifest.capabilities.includes("ai:tool")) problems.push("contributes.aiTools requires the ai:tool capability")
  if ((manifest.contributes?.mods?.length ?? 0) > 0 && !manifest.capabilities.includes("ai:mod")) problems.push("contributes.mods requires the ai:mod capability")
  if ((manifest.contributes?.modes?.length ?? 0) > 0 && !manifest.capabilities.includes("ai:mode")) problems.push("contributes.modes requires the ai:mode capability")
  if (manifest.contributes?.mods?.some((mod) => mod.entry === manifest.entry)) problems.push("a mod entry cannot be the plugin module itself")
  return problems
}

const readManifestSync = (file: string): PluginManifest | undefined => {
  try { return Schema.decodeUnknownSync(PluginManifestSchema)(JSON.parse(readFileSync(file, "utf8"))) } catch { return undefined }
}

/** The enabled plugins' manifests, `enabled.json` order; folders that do not decode or do not cohere are skipped, as in the loader. */
const enabledManifests = (root: string): ReadonlyArray<PluginManifest> =>
  readEnabledPlugins(join(root, "enabled.json")).flatMap((id) => {
    const manifest = readManifestSync(join(root, id, "plugin.json"))
    return manifest !== undefined && manifest.id === id && contributionProblems(manifest).length === 0 ? [manifest] : []
  })

/** A mod an enabled plugin ships; the id shown to people is `<pluginId>.<modId>`, independent of where the file lives. */
export interface ContributedMod {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly pluginId: string
  readonly pluginName: string
  /** The module file inside the plugin folder. */
  readonly entry: string
}

/** The mods the enabled plugins ship, `enabled.json` order: what the Extensions panel lists and the config declares. */
export const pluginModList = (root: string): ReadonlyArray<ContributedMod> =>
  enabledManifests(root).flatMap((manifest) => (manifest.contributes?.mods ?? []).flatMap((mod): ReadonlyArray<ContributedMod> => {
    const file = join(root, manifest.id, mod.entry)
    // A declared module that is not on disk is not a contribution: nothing to list, nothing to load.
    return existsSync(file) ? [{
      id: `${manifest.id}.${mod.id}`,
      title: mod.title,
      description: mod.description,
      pluginId: manifest.id,
      pluginName: manifest.name,
      entry: mod.entry
    }] : []
  }))

/** The `file://` specs of the mods the enabled plugins ship: what the host config adds to the app-owned store's specs. */
export const pluginModSpecs = (root: string): ReadonlyArray<string> => [...new Set(pluginModList(root).map((mod) =>
  pathToFileURL(realpathSync(join(root, mod.pluginId, mod.entry))).href))]

/** The modes the enabled plugins contribute, `enabled.json` order, first claim of an id wins. */
export const pluginModes = (root: string): ReadonlyArray<ContributedMode> => {
  const seen = new Set<string>()
  return enabledManifests(root).flatMap((manifest) => (manifest.contributes?.modes ?? []).flatMap((mode): ReadonlyArray<ContributedMode> => {
    const id = `${manifest.id}:${mode.id}`
    if (seen.has(id)) return []
    seen.add(id)
    return [{ id, title: mode.title, description: mode.description, instructions: mode.instructions, pluginId: manifest.id, pluginName: manifest.name }]
  }))
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
        const incoherent = contributionProblems(manifest)
        if (incoherent.length > 0) return yield* Effect.fail(new Error(incoherent.join("; ")))
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
    const incoherent = contributionProblems(manifest)
    if (incoherent.length > 0) throw new Error(incoherent.join("; "))
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
        plugins.push({
          id: manifest.id, name: manifest.name, version: manifest.version,
          enabled: live.some((record) => record.id === manifest.id && record.state === "enabled"),
          tools: manifest.contributes?.aiTools?.length ?? 0,
          mods: manifest.contributes?.mods?.length ?? 0,
          modes: manifest.contributes?.modes?.length ?? 0
        })
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
    install: (text, source, files) => lock.withPermit(attempt(async () => {
      if (!source.trim() || source.length > 500_000 || text.length > 64_000) throw new Error("Provide a manifest (up to 64 KB) and JavaScript source (up to 500 KB)")
      const manifest = await manifestFor(text)
      if (manifest.entry !== "index.js") throw new Error("Uploaded plugins must use index.js as their entry")
      // The bundle carries exactly the mod modules the manifest declares: one file per declared entry, and nothing else.
      const declared = (manifest.contributes?.mods ?? []).map((mod) => mod.entry)
      const provided = files ?? {}
      for (const name of Object.keys(provided)) {
        if (!declared.includes(name)) throw new Error(`The bundle carries "${name}", which the manifest does not declare as a mod entry`)
      }
      for (const entry of declared) {
        if (typeof provided[entry] !== "string" || provided[entry].trim().length === 0) throw new Error(`The manifest declares the mod entry "${entry}": the bundle must carry its source`)
      }
      if (Object.values(provided).reduce((total, modSource) => total + modSource.length, 0) > 500_000) throw new Error("The mod modules together must stay under 500 KB")
      const directory = join(root, manifest.id)
      if (existsSync(directory)) throw new Error("This plugin is already installed")
      await mkdir(root, { recursive: true })
      const temp = join(root, `.${crypto.randomUUID()}.tmp`)
      await mkdir(temp, { mode: 0o700 })
      try {
        await writeFile(join(temp, "plugin.json"), text, { mode: 0o600 })
        await writeFile(join(temp, "index.js"), source, { mode: 0o600 })
        for (const [name, modSource] of Object.entries(provided)) await writeFile(join(temp, name), modSource, { mode: 0o600 })
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
    modSpecs: () => pluginModSpecs(root),
    modList: () => pluginModList(root),
    modes: () => pluginModes(root),
    tools: () => listing().map((entry) => definePluginTool(entry, async (args) => {
      // A call that throws, times out or finds the plugin gone is a result the assistant can read, not a crash of the turn.
      return await Effect.runPromise(host.callTool(entry.pluginId, entry.id, args).pipe(Effect.catch((cause) => Effect.succeed(toolFailure(cause)))))
    }))
  })
}))
