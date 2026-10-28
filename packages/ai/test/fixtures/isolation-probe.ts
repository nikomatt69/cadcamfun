/**
 * Runs in a child process (the host freezes its paths at import time, so this
 * cannot share a process with other tests). Sentinel files are planted in a fake
 * HOME where a non-isolated nikcli would look, and fs reads are recorded.
 *
 * argv: <fakeHome> <dataDir> <overrideHome: "1" | "0">
 */
import fs from "node:fs"
import fsp from "node:fs/promises"
import { Effect, Scope } from "effect"
import { makeNikCliRuntime } from "../../src/nikcli/runtime.ts"
import { defaultProviderSpecs } from "../../src/nikcli/config.ts"

const [fakeHome = "", dataDir = "", override = "1"] = process.argv.slice(2)

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

const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(
  makeNikCliRuntime({
    dataDir,
    providers: defaultProviderSpecs(),
    systemPrompt: "probe",
    toolsFor: () => [],
    hostLogs: () => undefined,
    isolation: { overrideHome: override === "1" }
  }).pipe(Scope.provide(scope))
)
const host = await Effect.runPromise(runtime.host("probe"))
const config = JSON.stringify(await host.client.config.get())
const agents = (await host.client["top-level"].agent()).map((a) => String(a["name"]))
const providers = (await host.client.provider.list()).all.map((p) => p.id)
const tools = await host.client.experimental.toolIDs()
const auth = JSON.stringify(await host.client.provider.list())
const sharedConfig = JSON.parse(fs.readFileSync(`${runtime.paths.config}/nikcli.json`, "utf8")) as Record<string, unknown>
await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))

const sentinelPaths = [...touched].filter(
  (p) =>
    p.startsWith(fakeHome) &&
    (/\/\.config\/nikcli/.test(p) || /\/\.nikcli/.test(p) || /\/\.local\/share\/nikcli/.test(p) || /\/\.claude/.test(p) || /\/\.cache\/nikcli/.test(p))
)
const readsOwnConfig = [...touched].some((p) => p.endsWith("/config/nikcli.json"))
const readsInstanceConfig = [...touched].some((p) => p === `${host.directory}/nikcli.json`)

console.log(
  "PROBE_RESULT " +
    JSON.stringify({
      home: process.env.HOME,
      configHasSentinel: config.includes("SENTINEL"),
      agentsHaveSentinel: agents.some((a) => a.includes("sentinel")),
      providersHaveSentinel: providers.some((p) => p.includes("sentinel")),
      toolsHaveSentinel: tools.some((t) => t.includes("sentinel")),
      sentinelPaths,
      readsOwnConfig,
      readsInstanceConfig,
      agentsHaveCadcam: agents.includes("cadcam-build"),
      sharedConfigHasAgents: sharedConfig["agent"] !== undefined,
      envScrubbed: process.env["NIKCLI_DB"] === undefined && process.env["NIKCLI_AUTH_CONTENT"] === undefined,
      sentinelDatabase: fs.existsSync(`${fakeHome}/sentinel.db`),
      authHasSentinel: auth.includes("SENTINEL_AUTH_KEY")
    })
)
process.exit(0)
