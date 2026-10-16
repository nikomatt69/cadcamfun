/**
 * Runs in a child process (the pinned host freezes its paths and flags when its module is first evaluated, so this
 * cannot share a process with other tests). It plants a fake user's nikcli install — a global config that declares a
 * mod and mod files in both folders the host watches — plus one enabled mod in the app's own store, then reports
 * which mods the host actually loaded and which files it touched.
 *
 * The gate (spec 27 §4.3): with `isolation.mods` cleared the host must load exactly the app's own mod; while the flag
 * stands it must load nothing.
 *
 * argv: <fakeHome> <dataDir> <modsEnabled: "1" | "0">
 */
import fs from "node:fs"
import fsp from "node:fs/promises"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Effect, Scope } from "effect"
import { makeNikCliRuntime } from "../../src/nikcli/runtime.ts"
import { defaultProviderSpecs } from "../../src/nikcli/config.ts"
import { isolatedPaths } from "../../src/nikcli/isolation.ts"
import { modSpec, modSpecs, saveMod, setModEnabled } from "../../src/nikcli/mods.ts"

const [fakeHome = "", dataDir = "", modsEnabled = "1"] = process.argv.slice(2)

const touched = new Set<string>()
const record = (p: unknown) => {
  const value = typeof p === "string" ? p : p instanceof URL ? p.pathname : undefined
  if (value !== undefined) touched.add(value)
}
const wrap = <T extends object>(target: T, names: string[]) => {
  for (const name of names) {
    const original = (target as Record<string, unknown>)[name]
    if (typeof original !== "function") continue
    ;(target as Record<string, unknown>)[name] = (...args: unknown[]) => {
      record(args[0])
      return (original as (...a: unknown[]) => unknown).apply(target, args)
    }
  }
}
const readers = ["readFile", "readFileSync", "readdir", "readdirSync", "open", "openSync", "stat", "statSync", "lstat", "lstatSync", "access", "accessSync", "exists", "existsSync", "opendir", "opendirSync", "createReadStream", "realpath", "realpathSync"]
wrap(fs, readers)
wrap(fsp, readers)
const originalFile = Bun.file.bind(Bun)
;(Bun as unknown as { file: unknown }).file = (p: unknown, ...rest: unknown[]) => {
  record(p)
  return (originalFile as (...a: unknown[]) => unknown)(p, ...rest)
}

const MOD_MODULE = `export const register = (on) => {
  on("tool.call", { tool: "cad_delete_entities" }, async ($, e, next) => next(e))
  on("prompt.submit", {}, async ($, e, next) => next(e))
}
`

/** What a non-isolated host would treat as the user's install: its own config and both plugin folders. */
const plantUserInstall = (home: string, marker: string): string => {
  const plugin = join(home, ".config", "nikcli")
  mkdirSync(join(plugin, "plugin"), { recursive: true })
  mkdirSync(join(plugin, "plugins"), { recursive: true })
  const configMod = join(plugin, "plugin", `user_config_${marker}.js`)
  const directoryMod = join(plugin, "plugins", `user_directory_${marker}.js`)
  writeFileSync(configMod, MOD_MODULE)
  writeFileSync(directoryMod, MOD_MODULE)
  writeFileSync(join(plugin, "nikcli.json"), JSON.stringify({ plugin: [`file://${configMod}`] }))
  for (const folder of [join(home, ".config", "nikcli"), join(home, ".nikcli")]) {
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, "sentinel.json"), "SENTINEL")
  }
  return configMod
}

const sentinel = plantUserInstall(fakeHome, "sentinel")

const paths = isolatedPaths(dataDir)
saveMod(paths, { id: "probe_mod", name: "Probe mod", description: "Gate probe.", source: MOD_MODULE })
setModEnabled(paths, "probe_mod", true)
const appSpec = modSpec(paths, "probe_mod")

const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(
  makeNikCliRuntime({
    dataDir,
    providers: defaultProviderSpecs(),
    systemPrompt: "probe",
    toolsFor: () => [],
    hostLogs: () => undefined,
    isolation: { overrideHome: false, mods: modsEnabled === "1" },
    mods: () => modSpecs(paths)
  }).pipe(Scope.provide(scope))
)
const host = await Effect.runPromise(runtime.host("probe"))
const loaded = await host.client.mod.list()
await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))

const text = (info: (typeof loaded)[number]): string => JSON.stringify(info)
const appMod = loaded.find((info) => text(info).includes("probe_mod"))
const sentinelPaths = [...touched].filter(
  (p) => p.startsWith(fakeHome) && (/\/\.config\/nikcli/.test(p) || /\/\.nikcli/.test(p) || /\/\.local\/share\/nikcli/.test(p))
)

console.log(
  "PROBE_RESULT " +
    JSON.stringify({
      modsFlag: process.env["NIKCLI_DISABLE_MODS"],
      appSpec,
      loaded: loaded.map((info) => ({ id: info.id, name: info.name, events: info.events, tools: info.tools, commands: info.commands })),
      appLoaded: appMod !== undefined,
      appEvents: appMod?.events ?? [],
      sentinelLoaded: loaded.some((info) => text(info).includes("sentinel")),
      sentinelConfigLoaded: loaded.some((info) => text(info).includes(sentinel)),
      sentinelReads: sentinelPaths
    })
)
process.exit(0)
