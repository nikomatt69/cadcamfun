/**
 * The typed API client and the boot sequence (spec 06-desktop-ui.md §1).
 *
 * `ApiClient` is generated from WP3's `Api` HttpApi, so every call is typed and its
 * response decoded by the endpoint's own Schema; the UI never hand-parses JSON. This
 * module owns three things:
 *
 *  1. `ApiClient.layer({ baseUrl, token })` — the `Authorization` client middleware
 *     (bearer token) plus the `fetch` implementation;
 *  2. the single app `ManagedRuntime` every screen's effects run in;
 *  3. `connect` — endpoint → client → `GET /health`, with the spec's 15 s deadline and
 *     the data the splash needs to offer Retry and "View logs".
 */
import { Context, Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi"
import { Api, Authorization } from "@cadcamfun/api"
import { getEndpoint, isTauri, resetEndpoint, type Endpoint } from "../../app/sidecar.ts"
import { withSessionToken } from "./session.ts"
import { createFakeApi, type ApiClient as FakeApiClient } from "../../testing/fake-api.ts"

/**
 * The client interface every screen depends on. The fake in `testing/fake-api.ts`
 * implements the same shape, so a screen cannot tell them apart.
 */
export type Client = HttpApiClient.ForApi<typeof Api>

/** Each client layer owns its launch token; reconnects cannot overwrite another runtime's authorization. */
export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()("cadcamfun/ApiClient") {
  static readonly layer = (options: ApiClientOptions) => {
    const authorization = HttpApiMiddleware.layerClient(Authorization, ({ next, request }) =>
      Effect.flatMap(withSessionToken(HttpClientRequest.bearerToken(request, options.token)), next))
    return Layer.effect(ApiClient, HttpApiClient.make(Api, {
      baseUrl: options.baseUrl,
      transformClient: (client) => client.pipe(HttpClient.filterStatusOk)
    })).pipe(Layer.provide(authorization), Layer.provide(FetchHttpClient.layer))
  }
}

export interface ApiClientOptions {
  readonly baseUrl: string
  readonly token: string
}

export interface AppRuntime {
  /** Runs an effect with the app's services; rejects with the Effect's error. */
  readonly run: <A>(effect: Effect.Effect<A, unknown, ApiClient>, options?: { readonly signal?: AbortSignal }) => Promise<A>
  /** Fire-and-forget for writes whose failure the screen already reports locally. */
  readonly runVoid: (effect: Effect.Effect<unknown, unknown, ApiClient>) => void
  dispose(): void
}

/**
 * The single app runtime (spec 06 §1: "the UI runs effects with a single app
 * `ManagedRuntime`"), so the HTTP client and its connection pool are shared.
 */
export const createRuntime = (options: ApiClientOptions): AppRuntime => {
  const runtime = ManagedRuntime.make(ApiClient.layer(options))
  return {
    run: (effect, options) => runtime.runPromise(effect, options),
    runVoid: (effect) => {
      void runtime.runPromise(effect).catch(() => undefined)
    },
    dispose: () => {
      void runtime.dispose()
    }
  }
}

/** Boot state machine; the splash renders every state except `ready`. */
export type BootState =
  | { readonly _tag: "starting" }
  | { readonly _tag: "checking" }
  | { readonly _tag: "ready"; readonly client: Client; readonly mode: "live" | "fake" }
  | { readonly _tag: "failed"; readonly reason: string; readonly timedOut: boolean }

/** The spec's deadline for `get_sidecar_endpoint` plus `GET /health`. */
export const BOOT_TIMEOUT_MS = 15_000

export interface ConnectOptions {
  readonly timeoutMs?: number
  /** Overrides endpoint resolution; a test passes a stub, and Retry re-resolves. */
  readonly endpoint?: () => Promise<Endpoint>
  /** The shell's log directory, for the splash's "View logs" button. */
  readonly logsDir?: () => Promise<string | undefined>
  /** Falls back to the in-memory fake when there is no sidecar (browser dev). */
  readonly fallbackToFake?: boolean
}

/** A readable reason from whatever a failed call rejects with (the Tauri shell rejects with plain objects, not Errors). */
export const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
    try { return JSON.stringify(error) } catch { return "unknown error" }
  }
  return String(error)
}

/** Rejects with `reason` if `promise` has not settled within `ms`. */
export const withTimeout = async <A,>(promise: Promise<A>, ms: number, reason: string): Promise<A> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(reason)), ms)
      })
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export interface Connection {
  readonly state: BootState
  readonly client: Client | undefined
  readonly logsDir: string | undefined
  readonly elapsedMs: number
}

/**
 * One boot attempt. It resolves with the outcome rather than rejecting, because the
 * splash has to render *why* it failed — a thrown error would lose that message.
 */
export const connect = async (options: ConnectOptions = {}): Promise<Connection> => {
  const timeoutMs = options.timeoutMs ?? BOOT_TIMEOUT_MS
  const started = Date.now()
  let endpoint: Endpoint
  try {
    endpoint = await withTimeout(
      (options.endpoint ?? getEndpoint)(),
      timeoutMs,
      "the sidecar did not report an address"
    )
  } catch (error) {
    if (options.fallbackToFake === true) return fakeConnection(started)
    return {
      state: { _tag: "failed", reason: messageOf(error), timedOut: true },
      client: undefined,
      logsDir: undefined,
      elapsedMs: Date.now() - started
    }
  }

  const runtime = createRuntime(endpoint)
  let client: Client
  const remaining = () => Math.max(1, timeoutMs - (Date.now() - started))
  try { client = await runtime.run(Effect.service(ApiClient).pipe(Effect.timeout(remaining()))) }
  catch (error) {
    runtime.dispose()
    return { state: { _tag: "failed", reason: messageOf(error), timedOut: true }, client: undefined, logsDir: undefined, elapsedMs: Date.now() - started }
  }
  if (await healthCheck(runtime, client, remaining())) {
    return {
      state: { _tag: "ready", client, mode: "live" },
      client,
      logsDir: await readLogsDir(options),
      elapsedMs: Date.now() - started
    }
  }
  runtime.dispose()
  if (options.fallbackToFake === true) return fakeConnection(started)
  return {
    state: { _tag: "failed", reason: "the sidecar did not answer the health check", timedOut: true },
    client: undefined,
    logsDir: await readLogsDir(options),
    elapsedMs: Date.now() - started
  }
}

const readLogsDir = async (options: ConnectOptions): Promise<string | undefined> => {
  if (options.logsDir === undefined || !isTauri()) return undefined
  try {
    return await withTimeout(options.logsDir(), 1000, "logs directory lookup timed out")
  } catch {
    return undefined
  }
}

/** `GET /health` through the typed client, decoded by the endpoint's own Schema. */
const healthCheck = async (runtime: AppRuntime, client: Client, timeoutMs: number): Promise<boolean> => {
  try {
    const health = await withTimeout(
      runtime.run(client.health.check().pipe(Effect.timeout(timeoutMs))),
      timeoutMs,
      "the health check timed out"
    )
    return health.status.length > 0
  } catch {
    return false
  }
}

const fakeConnection = (started: number): Connection => {
  const fake = createFakeApi()
  return {
    state: { _tag: "ready", client: fake as unknown as Client, mode: "fake" },
    client: fake as unknown as Client,
    logsDir: undefined,
    elapsedMs: Date.now() - started
  }
}

/** A runtime bound straight to a fake, for component tests and browser dev. */
export const fakeRuntime = (fake?: FakeApiClient): { runtime: AppRuntime; client: FakeApiClient } => {
  const client = fake ?? createFakeApi()
  const provide = <A,>(effect: Effect.Effect<A, unknown, ApiClient>) =>
    Effect.runPromise(
      Effect.provideService(effect as Effect.Effect<A, unknown, never>, ApiClient, client as unknown as never)
    )
  const runtime: AppRuntime = {
    run: provide,
    runVoid: (effect) => {
      void provide(effect).catch(() => undefined)
    },
    dispose: () => {}
  }
  return { runtime, client }
}

/** Re-resolves the endpoint and tries again; the splash's Retry button calls this. */
export const retryConnect = async (options: ConnectOptions = {}): Promise<Connection> => {
  resetEndpoint()
  return connect(options)
}
