import { Context, Layer } from "effect"
import { FetchHttpClient, HttpClientRequest } from "effect/unstable/http"
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi"
import { Authorization } from "./auth.ts"
import { Api } from "./index.ts"

export interface ApiConnection {
  readonly baseUrl: string
  readonly token: string
}

export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()("cadcamfun/ApiClient") {
  static layer = ({ baseUrl, token }: ApiConnection) => Layer.effect(
    ApiClient,
    HttpApiClient.make(Api, { baseUrl })
  ).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(HttpApiMiddleware.layerClient(Authorization, ({ request, next }) =>
      next(HttpClientRequest.setHeader(request, "authorization", `Bearer ${token}`))))
  )
}
