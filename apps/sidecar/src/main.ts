import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Cause, Effect, Layer, Logger, Runtime, Schedule } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { KernelJobsLive } from "@cadcamfun/ai"
import { AppConfigService } from "./config.ts"
import { ApiRoutes, DatabaseLive } from "./layers.ts"
import { ObservabilityLive } from "./observability.ts"
import { awaitShutdown } from "./shutdown.ts"
import { markAnnounced, setLocalPort } from "./startup.ts"
import { restoreHostedState } from "./services/cloud-checkpoint.ts"

/** Prints the one-line ready event the Tauri shell waits for (specs/05 §1). */
const Ready = Layer.effectDiscard(Effect.gen(function*() {
  const server = yield* HttpServer.HttpServer
  const address = server.address
  if (address._tag !== "TcpAddress") return yield* Effect.die("sidecar must listen on TCP")
  // The socket listens while the API layers (the AI host takes a moment) may still be building;
  // announce readiness only once the public health route answers, so the shell never sees a 404.
  const probe = Effect.tryPromise(async () => {
    const res = await fetch(`http://127.0.0.1:${address.port}/api/health`)
    if (!res.ok) throw new Error(`health ${res.status}`)
  })
  yield* probe.pipe(Effect.retry({ schedule: Schedule.spaced("50 millis"), times: 400 }), Effect.orDie)
  setLocalPort(address.port)
  console.log(JSON.stringify({ event: "ready", port: address.port }))
  markAnnounced()
}))

const Server = Layer.mergeAll(HttpRouter.serve(ApiRoutes), Ready).pipe(
  // `BunHttpServer.layer` supplies both the listening server and the HTTP platform
  // services. `HttpServer.layerServices` must NOT be added here: that layer is the
  // no-op `HttpPlatform` meant for in-process tests, and providing it shadows the
  // real Bun server so the port is reported but nothing ever accepts a connection.
  Layer.provide(BunServer()),
  Layer.provide(DatabaseLive),
  Layer.provide(ObservabilityLive)
)

// stdout is reserved for the ready/error events the shell parses; logs go to stderr.


function BunServer() {
  // No idle timeout: Bun closes a connection that is silent for 10 s, and a model writing a long tool call is silent that long.
  // The server only listens on the loopback interface, so nothing outside can hold connections open.
  // Effect's default drain is 20 s, longer than the shell's 2 s kill deadline.
  // Give request scopes time to finish, then interrupt streams before releasing the DB.
  return BunHttpServer.layer({ port: 0, hostname: "127.0.0.1", idleTimeout: 0, gracefulShutdownTimeout: "500 millis" })
}

/**
 * Exit codes. `SIGTERM`/`SIGINT` interrupt the main fiber, which still runs every scope
 * finalizer, so an interrupted exit is a *graceful* shutdown: the server stopped, the
 * database was checkpointed and closed. The default teardown would report that as 130
 * (the conventional "killed by SIGINT" code) and make a clean shutdown look like a crash
 * to the shell, so an interruption-only exit is mapped to 0 here. A real failure keeps
 * reporting through the ready/error event and `process.exitCode = 1`.
 */
const teardown: Runtime.Teardown = (exit, onExit) => {
  Runtime.defaultTeardown(exit, (code) => {
    if (code === 0) return onExit(0)
    onExit(exit._tag === "Failure" && Cause.hasInterruptsOnly(exit.cause) ? 0 : code)
  })
}

Effect.gen(function*() {
  const config = yield* AppConfigService
  // Container disk is disposable; recover acknowledged state before SQLite or any service opens it.
  yield* Effect.tryPromise({ try: () => restoreHostedState(config), catch: () => new Error("Could not restore durable cloud workspace state") })
  // Built first, so its release runs after the server has stopped taking requests: the kernel workers are stopped, not waited for
  // (the shell's kill deadline is 2 s).
  yield* Layer.build(KernelJobsLive)
  yield* Layer.build(Server)
  yield* config.runtime === "server" ? Effect.never : awaitShutdown
}).pipe(
  Effect.scoped,
  Effect.provide(AppConfigService.layer),
  Effect.provide(Logger.layer([Logger.withConsoleError(Logger.formatJson)])),
  Effect.provideService(Logger.LogToStderr, true),
  Effect.catchCause((cause) =>
    Cause.hasInterruptsOnly(cause) ? Effect.void :
    Effect.sync(() => {
      console.log(JSON.stringify({ event: "error", message: String(cause) }))
      process.exitCode = 1
    })
  ),
  BunRuntime.runMain({ teardown })
)
