import { Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient, HttpClientRequest } from "effect/unstable/http"
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi"
import { Api, Authorization } from "@cadcamfun/api"
import { ApiClient, type AppRuntime, type Client } from "../state/client.ts"
import { withSessionToken } from "../state/session.ts"
import type { Endpoint } from "./sidecar.ts"

export { ApiClient }

export const clientLayer = (endpoint: Endpoint, transport: typeof fetch = globalThis.fetch) => {
  const auth = HttpApiMiddleware.layerClient(Authorization, ({ next, request }) =>
    Effect.flatMap(withSessionToken(HttpClientRequest.bearerToken(request, endpoint.token)), next))
  return Layer.effect(ApiClient, HttpApiClient.make(Api, { baseUrl: endpoint.baseUrl })).pipe(
    Layer.provide(auth),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, transport))
  )
}

export const runtimeForLayer = (layer: ReturnType<typeof clientLayer>): AppRuntime => {
  const managed = ManagedRuntime.make(layer)
  return {
    run: (effect, options) => managed.runPromise(effect, options),
    runVoid: (effect) => { void managed.runPromise(effect).catch(() => undefined) },
    dispose: () => { void managed.dispose() }
  }
}

export const runtimeForClient = (client: Client): AppRuntime => {
  const managed = ManagedRuntime.make(Layer.succeed(ApiClient, client))
  return {
    run: (effect, options) => managed.runPromise(effect, options),
    runVoid: (effect) => { void managed.runPromise(effect).catch(() => undefined) },
    dispose: () => { void managed.dispose() }
  }
}

export const readClient = (runtime: AppRuntime): Promise<Client> => runtime.run(Effect.service(ApiClient))
