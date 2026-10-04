import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { Layer } from "effect"
import { HttpRouter } from "effect/http"
import { AiModel, CadAgent } from "@cadcamfun/ai"
import { makeApp } from "./server"

const port = Number(process.env.PORT ?? 8787)

const App = makeApp({
  agent: CadAgent.layer.pipe(Layer.provide(AiModel.layerConfig)),
  sql: SqliteClient.layer({ filename: process.env.CADCAMFUN_DB ?? "cadcamfun.db" }),
  staticDir: process.env.CADCAMFUN_STATIC_DIR,
})

HttpRouter.serve(App).pipe(
  Layer.provide(BunHttpServer.layer({ port, hostname: process.env.HOST ?? "0.0.0.0" })),
  Layer.launch,
  BunRuntime.runMain,
)
