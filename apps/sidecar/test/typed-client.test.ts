/**
 * The generated typed client (what the desktop UI uses) against the real handlers, in
 * process. It proves the contract the screens compile against is the one the server
 * actually speaks, including the multipart plugin install and the loosened auth payloads.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Api, Authorization } from "@cadcamfun/api"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClientRequest } from "effect/unstable/http"
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi"
import JSZip from "jszip"
import { makeApp, TOKEN } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let client: HttpApiClient.ForApi<typeof Api>
beforeAll(async () => {
  app = await makeApp()
  const auth = HttpApiMiddleware.layerClient(Authorization, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, TOKEN)))
  client = await Effect.runPromise(HttpApiClient.make(Api, { baseUrl: "http://sidecar.test" }).pipe(
    Effect.provide(Layer.mergeAll(auth, FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, app.transport)))))))
})
afterAll(async () => { await app.dispose() })

const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect)

describe("typed client against the sidecar", () => {
  test("waitlist, analytics and auth round-trip", async () => {
    expect((await run(client.waitlist.join({ payload: { email: "ui@example.com" } }))).success).toBe(true)
    const metrics = await run(client.analytics.systemMetrics())
    expect(metrics.cpuUsage).toBeGreaterThan(0)
    expect((await run(client.analytics.track({ payload: { itemId: "p", itemType: "project", action: "viewed" } }))).success).toBe(true)
    const forgot = await run(client.auth.forgotPassword({ payload: { email: "ghost@example.com" } }))
    expect(forgot.message).toContain("Se l'email esiste")
    const rejected = await run(client.auth.forgotPassword({ payload: {} }).pipe(Effect.flip))
    expect(rejected).toMatchObject({ _tag: "AuthBadRequest", error: "Email richiesta" })
  })

  test("plugin install through the multipart client, then list, config and uninstall", async () => {
    const zip = new JSZip()
    zip.file("manifest.json", JSON.stringify({
      id: "ui-plugin", name: "UI plugin", version: "1.0.0", description: "d", author: "a", main: "main.js",
      engines: { cadcam: "^1.0.0" }, permissions: []
    }))
    zip.file("main.js", "export function activate() {}")
    const form = new FormData()
    form.set("file", new File([(await zip.generateAsync({ type: "uint8array" })) as BlobPart], "plugin.zip", { type: "application/zip" }))
    const installed = await run(client.plugins.install({ payload: form as never }))
    expect(installed.plugin.id).toBe("ui-plugin")
    expect((await run(client.plugins.list())).map((p) => p.id)).toEqual(["ui-plugin"])
    await run(client.plugins.updateConfig({ params: { id: "ui-plugin" }, payload: { a: 1 } }))
    expect(await run(client.plugins.getConfig({ params: { id: "ui-plugin" } }))).toEqual({ a: 1 })
    await run(client.plugins.enable({ params: { id: "ui-plugin" } }))
    expect((await run(client.plugins.get({ params: { id: "ui-plugin" } }))).enabled).toBe(true)
    await run(client.plugins.uninstall({ params: { id: "ui-plugin" } }))
    expect(await run(client.plugins.list())).toEqual([])
  })

  test("organizations and the cost estimate endpoints", async () => {
    const org = await run(client.organizations.create({ payload: { name: "Shop", description: null } }))
    expect((await run(client.organizations.list())).map((o) => o.id)).toContain(org.id)
    const detail = await run(client.organizations.get({ params: { id: org.id } }))
    expect(detail.userRole).toBe("ADMIN")
    const missing = await run(client["production-costs"].calculateEstimate({ payload: { toolpathId: "nope" } }).pipe(Effect.flip))
    expect(missing._tag).toBe("NotFound")
  })
})
