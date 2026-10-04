import { FetchHttpClient } from "effect/http"
import { AtomHttpApi } from "effect/reactivity"
import { Api } from "@cadcamfun/server"

/** Typed client for the server's HttpApi, exposed as Effect atoms (queries + mutations). */
export class ApiClient extends AtomHttpApi.Service<ApiClient>()("ApiClient", {
  api: Api,
  httpClient: FetchHttpClient.layer,
  baseUrl: typeof window === "undefined" ? "http://localhost" : window.location.origin,
}) {}
