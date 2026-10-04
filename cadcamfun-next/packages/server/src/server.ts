import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api"
import { SqlClient } from "effect/sql"
import { CamLibrary } from "@cadcamfun/cam"
import type { CadAgent, Workspace } from "@cadcamfun/ai"
import { Api } from "./api"
import { ChatRoute } from "./chat"
import { ApiHandlers } from "./handlers"
import { MigratorLayer } from "./migrations"
import { Projects } from "./projects"

/** Serve a built single-page app: files when they exist, `index.html` otherwise. */
const StaticRoute = (dir: string) =>
  HttpRouter.add("GET", "/*", (request) =>
    Effect.promise(async () => {
      const path = new URL(request.url, "http://local").pathname
      const file = Bun.file(`${dir}${path === "/" ? "/index.html" : path}`)
      const target = (await file.exists()) && !path.includes("..") ? file : Bun.file(`${dir}/index.html`)
      return HttpServerResponse.raw(target, { headers: { "content-type": target.type } })
    }),
  )

export interface AppOptions<E> {
  /** Agent implementation; swap for a scripted model in tests. */
  readonly agent: Layer.Layer<CadAgent, E, Workspace | CamLibrary>
  /** Database client (SQLite in production, in-memory in tests). */
  readonly sql: Layer.Layer<SqlClient.SqlClient, unknown>
  /** Directory of the built web app to serve, if any. */
  readonly staticDir?: string
}

/** The whole HTTP application as a layer: typed API, OpenAPI docs, AI chat stream, optional SPA. */
export const makeApp = <E>(options: AppOptions<E>) => {
  const routes = Layer.mergeAll(
    HttpApiBuilder.layer(Api, { openapiPath: "/api/openapi.json" }).pipe(Layer.provide(ApiHandlers)),
    HttpApiScalar.layer(Api, { path: "/api/docs" }),
    ChatRoute(options.agent),
    options.staticDir ? StaticRoute(options.staticDir) : Layer.empty,
  )
  return routes.pipe(
    Layer.provide(Projects.layer),
    Layer.provide(CamLibrary.layer),
    Layer.provide(MigratorLayer),
    Layer.provide(Layer.orDie(options.sql)),
  )
}
