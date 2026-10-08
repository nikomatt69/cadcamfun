// Generates the typed API clients from the `Api` contract, the way nikcli does with `generate:httpapi-clients`:
//
//   bun run generate            write src/sdk/generated (Promise SDK) and src/client/generated (Effect clients)
//   bun run generate --check    fail when the committed files differ from what the contract generates
//
// The contract (`src/groups/*`) stays the single source of truth; nothing under a `generated/` folder is edited by hand.
import { BunFileSystem } from "@effect/platform-bun"
import { compile, emitEffectImported, emitPromise, write, type Output } from "@cadcamfun/httpapi-codegen"
import { Effect } from "effect"
import { HttpApi } from "effect/unstable/httpapi"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Api } from "../src/index.ts"

/** `requiredForClient` middleware the generated clients leave to the caller: the bearer token (`ClientOptions.headers` / `layerClient`). */
const CLIENT_MIDDLEWARE = new Set(["cadcamfun/api/Authorization"])

/**
 * Endpoints no generated client can express (the contract compiler rejects them). They stay reachable through the
 * hand-wired `ApiClient`, which is built from the contract itself.
 */
export const UNSUPPORTED: Readonly<Record<string, string>> = {
  "user.updateProfile": "multipart payload",
  "plugins.install": "multipart payload",
  "mcp.createConfig": "two success schemas (201 created / 200 imported)",
  "mcp.updateConfigById": "path `id` collides with a payload field of the same name",
  "projectToolpaths.create": "query `projectId` collides with a payload field of the same name",
  "plugins.serve": "stream response with declared headers"
}

/** Endpoints only the Promise SDK cannot express; the Effect clients import the real schemas and keep them. */
export const PROMISE_UNSUPPORTED: Readonly<Record<string, string>> = {
  "billing.stripeWebhook": "raw signed body, not JSON",
  "plugins.bootstrap": "JavaScript response, not JSON",
  "files.download": "binary/stream response",
  "toolpathGenerator.generate": "request schema the type emitter cannot print (free-form CAD element records)",
  "toolpathGenerator.suggest": "request schema the type emitter cannot print (free-form CAD element records)"
}

/** Every `group.endpoint` of the contract, straight from the reflection (no codegen involved). */
const contractEndpoints = (): ReadonlySet<string> => {
  const names = new Set<string>()
  HttpApi.reflect(Api, { onGroup() {}, onEndpoint: ({ group, endpoint }) => { names.add(`${group.identifier}.${endpoint.identifier}`) } })
  return names
}

export interface Target {
  /** Directory relative to `packages/api`. */
  readonly directory: string
  readonly output: Output
}

const root = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url))

export function targets(): ReadonlyArray<Target> {
  const known = contractEndpoints()
  const stale = [...Object.keys(UNSUPPORTED), ...Object.keys(PROMISE_UNSUPPORTED)].filter((name) => !known.has(name))
  if (stale.length > 0) throw new Error(`Omitted endpoints that no longer exist in the contract: ${stale.join(", ")}`)

  const shared = { clientPathsFromEndpointNames: true, clientMiddleware: CLIENT_MIDDLEWARE } as const
  const effectContract = compile(Api, { ...shared, omitEndpoints: new Set(Object.keys(UNSUPPORTED)) })
  const promiseContract = compile(Api, { ...shared, omitEndpoints: new Set([...Object.keys(UNSUPPORTED), ...Object.keys(PROMISE_UNSUPPORTED)]) })
  return [
    { directory: "src/sdk/generated", output: emitPromise(promiseContract, { mutableOutputs: true }) },
    { directory: "src/client/generated", output: emitEffectImported(effectContract, { module: "../../index.ts", api: "Api" }) }
  ]
}

const writeAll = (base: (directory: string) => string) =>
  Effect.forEach(targets(), (target) => write(target.output, base(target.directory)), { discard: true }).pipe(Effect.provide(BunFileSystem.layer))

const files = async (directory: string): Promise<Map<string, string>> => {
  const result = new Map<string, string>()
  for (const name of await readdir(directory).catch(() => [])) result.set(name, await readFile(join(directory, name), "utf8"))
  return result
}

/** Differences between what the contract generates now and the committed files, one line each. */
export async function drift(): Promise<ReadonlyArray<string>> {
  const scratch = await mkdtemp(join(tmpdir(), "cadcamfun-api-generate-"))
  try {
    await Effect.runPromise(writeAll((directory) => join(scratch, directory)))
    const problems: Array<string> = []
    for (const target of targets()) {
      const fresh = await files(join(scratch, target.directory))
      const committed = await files(root(target.directory))
      for (const [name, content] of fresh) {
        if (!committed.has(name)) problems.push(`${target.directory}/${name} is missing`)
        else if (committed.get(name) !== content) problems.push(`${target.directory}/${name} is out of date`)
      }
      for (const name of committed.keys()) if (!fresh.has(name)) problems.push(`${target.directory}/${name} is no longer generated`)
    }
    return problems
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    const problems = await drift()
    if (problems.length > 0) {
      console.error(`Generated API clients are stale (run \`bun run generate\` in packages/api):\n${problems.map((problem) => `  ${problem}`).join("\n")}`)
      process.exit(1)
    }
    console.log("Generated API clients are up to date.")
  } else {
    await Effect.runPromise(writeAll(root))
    const count = (output: Output) => output.operations.length
    const [sdk, effect] = targets()
    console.log(`Generated Promise SDK (${count(sdk!.output)} operations) and Effect clients (${count(effect!.output)} operations).`)
  }
}
