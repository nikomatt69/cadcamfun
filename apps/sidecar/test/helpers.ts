import { Database, schema } from "@cadcamfun/db"
import { Effect, Layer, Redacted } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { AppConfigService } from "../src/config.ts"
import { ApiRoutes } from "../src/layers.ts"

export const TOKEN = "test-token"
const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname

const testConfig = (dataDir: string) => Layer.succeed(AppConfigService, AppConfigService.of({
  token: Redacted.make(TOKEN),
  dataDir,
  migrationsDir: migrationsFolder,
  version: "test",
  // Tests read the e-mail links out of the response, as there is no mail transport.
  debugLinks: true
}))

/** Boots the whole API in-process on a fresh in-memory database; returns a fetch-like function and the DB handle. */
export async function makeApp() {
  // Files (StorageService) go to a throw-away folder; the database itself is in memory.
  const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-test-"))
  const db = Database.layer({ path: ":memory:", migrationsFolder })
  const deps = Layer.mergeAll(db, testConfig(dataDir))
  const { handler, dispose } = HttpRouter.toWebHandler(
    ApiRoutes.pipe(Layer.provide(deps), Layer.provideMerge(HttpServer.layerServices))
  )
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
    }))
    const buf = new Uint8Array(await res.arrayBuffer())
    const text = new TextDecoder().decode(buf)
    const isJson = (res.headers.get("content-type") ?? "").includes("json")
    return { status: res.status, headers: res.headers, bytes: buf, body: isJson && text ? JSON.parse(text) : text || undefined }
  }
  const cleanup = async () => { await dispose(); rmSync(dataDir, { recursive: true, force: true }) }
  return { call, dispose: cleanup, schema, Effect, dataDir }
}
