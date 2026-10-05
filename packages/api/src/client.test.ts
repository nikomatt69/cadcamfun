import { expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi"
import { Authorization } from "./auth.ts"
import { ApiClient } from "./client.ts"
import { Api } from "./index.ts"

test("ApiClient is generated from the contract and adds launch credentials", async () => {
  const requests: Array<{ url: string; authorization: string | undefined }> = []
  const transport = HttpClient.make((request) => {
    requests.push({ url: request.url, authorization: request.headers.authorization })
    return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json([])))
  })
  const clientLayer = Layer.effect(ApiClient, HttpApiClient.make(Api, { baseUrl: "http://127.0.0.1:54321" })).pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, transport)),
    Layer.provide(HttpApiMiddleware.layerClient(Authorization, ({ request, next }) => {
      return next({ ...request, headers: { ...request.headers, authorization: "Bearer test-launch-token" } })
    }))
  )
  const result = await Effect.runPromise(Effect.gen(function*() {
    const client = yield* ApiClient
    return yield* client.materials.list({ query: {} })
  }).pipe(Effect.provide(clientLayer)))
  expect(result).toEqual([])
  expect(requests).toEqual([{ url: "http://127.0.0.1:54321/api/materials", authorization: "Bearer test-launch-token" }])
})
