import { Database, schema } from "@cadcamfun/db"
import { ToolHandlers } from "@cadcamfun/ai"
import { Context, Effect, Exit, Layer, Redacted, Scope } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BunFileSystem } from "@effect/platform-bun"
import { Path } from "effect"
import { Etag, HttpPlatform, HttpRouter } from "effect/unstable/http"
import { AppConfigService, type AppConfig } from "../src/config.ts"
import { ApiRoutes, Services } from "../src/layers.ts"

// Tests must never reach the network: with the host enabled the runtime seeds the
// models.dev catalogue once, and an unreachable fetch would stall the boot for 10 s
// (the sidecar tests run offline by design; see specs/08-ai.md §5).
process.env.CADCAMFUN_AI_OFFLINE = "1"

export const TOKEN = "test-token"
const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname

// What `HttpServer.layerServices` provides, but over the real filesystem: multipart uploads are
// persisted to disk and the no-op filesystem would die on them.
const testServices = Layer.mergeAll(HttpPlatform.layer, Path.layer, Etag.layerWeak).pipe(Layer.provideMerge(BunFileSystem.layer))

const testConfig = (dataDir: string, extra: Partial<AppConfig> = {}) => Layer.succeed(AppConfigService, AppConfigService.of({
  token: Redacted.make(TOKEN),
  dataDir,
  migrationsDir: migrationsFolder,
  version: "test",
  // Tests read the e-mail links out of the response, as there is no mail transport.
  debugLinks: true,
  aiHost: "direct",
  localeEnv: {},
  ...extra
}))

/**
 * Boots the whole API in-process on a fresh in-memory database; returns a fetch-like function and the DB handle.
 *
 * `extraLayers` adds services to the runtime (a test tracer, for instance) without touching the
 * services every other test relies on.
 */
export async function makeApp(extra: Partial<AppConfig> = {}, extraLayers: Layer.Layer<never, never, never> = Layer.empty) {
  // Files (StorageService) go to a throw-away folder; the database itself is in memory.
  const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-test-"))
  const db = Database.layer({ path: ":memory:", migrationsFolder })
  const deps = Layer.mergeAll(db, testConfig(dataDir, extra), extraLayers)
  // One memo map for the routes and for `toolHandlers()`, so both see the same in-memory database.
  const memoMap = Layer.makeMemoMapUnsafe()
  const { handler, dispose } = HttpRouter.toWebHandler(
    // `extraLayers` is merged into the built context, not provided to the routes: a middleware
    // runs in the request's context, so a service it needs has to be in the context the handler
    // is built with.
    ApiRoutes.pipe(Layer.provide(deps), Layer.provideMerge(testServices), Layer.provideMerge(extraLayers)),
    { memoMap }
  )
  const scope = Effect.runSync(Scope.make())
  /** The AI tool handlers the assistant calls, over the same database as `call`. */
  const services = () => Effect.runPromise(Layer.buildWithMemoMap(Services.pipe(Layer.provide(deps)), memoMap, scope))
  const toolHandlers = async () => Context.get(await services(), ToolHandlers)
  /** The in-memory database the app writes to, for tests that read rows the API does not expose. */
  const database = async () => Context.get(await Effect.runPromise(Layer.buildWithMemoMap(db, memoMap, scope)), Database)
  // A second handle on the same layer would open another :memory: DB, so seed through HTTP or the repo only.
  const call = async (path: string, init: RequestInit & { json?: unknown; auth?: boolean } = {}) => {
    const { json, auth = true, ...rest } = init
    const headers = new Headers(rest.headers)
    if (auth) headers.set("authorization", `Bearer ${TOKEN}`)
    if (json !== undefined) headers.set("content-type", "application/json")
    const res = await handler(new Request(`http://sidecar.test${path}`, {
      ...rest,
      headers,
      ...(json !== undefined ? { body: JSON.stringify(json) } : {})
    }), Context.empty())
    const buf = new Uint8Array(await res.arrayBuffer())
    const text = new TextDecoder().decode(buf)
    const isJson = (res.headers.get("content-type") ?? "").includes("json")
    return { status: res.status, headers: res.headers, bytes: buf, body: isJson && text ? JSON.parse(text) : text || undefined }
  }
  const cleanup = async () => { await dispose(); await Effect.runPromise(Scope.close(scope, Exit.void)); rmSync(dataDir, { recursive: true, force: true }) }
  /** `fetch` for the generated typed client: requests go straight to the in-process handler. */
  const transport = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => handler(new Request(input, init), Context.empty()),
    { preconnect: globalThis.fetch.preconnect }
  )
  return { call, dispose: cleanup, schema, Effect, dataDir, transport, toolHandlers, services, database }
}
