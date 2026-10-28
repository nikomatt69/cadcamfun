import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Database, schema } from "@cadcamfun/db"
import { Context, Effect, Layer, Metric, Redacted, Tracer } from "effect"
import { PrometheusMetrics } from "effect/unstable/observability"
import { AppConfigService, type AppConfig } from "../src/config.ts"
import { countCadOperation, isSensitiveAttribute, ObservabilityLive, otlpUrl, scrubAttributes, scrubbingLogRecordProcessor, scrubbingSpanProcessor } from "../src/observability.ts"
import { CadSurfaceRepo } from "../src/repos/cad-surface-repo.ts"
import { makeApp } from "./helpers.ts"

const config = (extra: Partial<AppConfig>) =>
  Layer.succeed(AppConfigService, AppConfigService.of({
    token: Redacted.make("t"), dataDir: "/tmp/unused", migrationsDir: undefined, version: "6.0.0", localeEnv: {}, ...extra
  }))

describe("otlpUrl", () => {
  test("appends the signal path once, with or without a trailing slash", () => {
    expect(otlpUrl("http://127.0.0.1:4318", "traces")).toBe("http://127.0.0.1:4318/v1/traces")
    expect(otlpUrl("http://127.0.0.1:4318//", "logs")).toBe("http://127.0.0.1:4318/v1/logs")
  })
})

describe("ObservabilityLive", () => {
  const received: Array<{ path: string; body: string }> = []
  let collector: ReturnType<typeof Bun.serve>
  beforeAll(() => {
    collector = Bun.serve({
      port: 0, hostname: "127.0.0.1",
      async fetch(req) {
        const raw = new Uint8Array(await req.arrayBuffer())
        const encoding = req.headers.get("content-encoding")
        const body = encoding === "gzip" ? new TextDecoder().decode(Bun.gunzipSync(raw)) : new TextDecoder().decode(raw)
        received.push({ path: new URL(req.url).pathname, body })
        return new Response("{}", { headers: { "content-type": "application/json" } })
      }
    })
  })
  afterAll(() => { collector.stop(true) })

  test("is a no-op without an endpoint", async () => {
    await Effect.runPromise(Layer.build(ObservabilityLive).pipe(Effect.scoped, Effect.provide(config({}))))
  })

  test("exports an Effect span to the collector when the scope closes", async () => {
    await Effect.runPromise(
      Effect.gen(function*() {
        yield* Effect.void.pipe(Effect.withSpan("cadcamfun.test-span"))
      }).pipe(
        Effect.provide(ObservabilityLive),
        Effect.scoped,
        Effect.provide(config({ otlpEndpoint: `http://127.0.0.1:${collector.port}` }))
      )
    )
    const traces = received.filter((r) => r.path === "/v1/traces")
    expect(traces.length).toBeGreaterThan(0)
    expect(traces.some((r) => r.body.includes("cadcamfun.test-span"))).toBe(true)
    expect(traces.some((r) => r.body.includes("cadcamfun-sidecar"))).toBe(true)
  })

  test("exports a log record written inside a span, carrying that span's trace", async () => {
    await Effect.runPromise(
      Effect.gen(function*() {
        yield* Effect.logInfo("cadcamfun test log").pipe(Effect.withSpan("cadcamfun.log-span"))
      }).pipe(
        Effect.provide(ObservabilityLive),
        Effect.scoped,
        Effect.provide(config({ otlpEndpoint: `http://127.0.0.1:${collector.port}` }))
      )
    )
    const logs = received.filter((r) => r.path === "/v1/logs")
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.some((r) => r.body.includes("cadcamfun test log"))).toBe(true)
    // The OTLP log record carries the trace id of the span it was written in (hex, as exported).
    const traces = received.filter((r) => r.path === "/v1/traces" && r.body.includes("cadcamfun.log-span"))
    expect(traces.length).toBeGreaterThan(0)
    const traceId = /"traceId":"([0-9a-f]{32})"/.exec(traces[0]!.body)?.[1] ?? /traceId[^0-9a-f]*([0-9a-f]{32})/.exec(traces[0]!.body)?.[1]
    expect(traceId).toBeDefined()
    expect(logs.some((r) => traceId !== undefined && r.body.includes(traceId))).toBe(true)
  })
})

describe("the request observability", () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })

  let app: Awaited<ReturnType<typeof makeApp>>
  beforeAll(async () => { app = await makeApp({}, Layer.succeed(Tracer.Tracer, tracer)) })
  afterAll(async () => { await app.dispose() })

  test("a request becomes a server span that keeps the caller's trace", async () => {
    const traceId = "11111111111111111111111111111111"
    const res = await app.call("/api/health", {
      auth: false,
      headers: { traceparent: `00-${traceId}-2222222222222222-01` }
    })
    expect(res.status).toBe(200)
    // The tracer writes the response attributes when it ends the span, which it schedules
    // after the response has been sent: give that task a turn before reading them.
    await Bun.sleep(10)
    const server = spans.find((span) => span.name.startsWith("http.server"))
    expect(server).toBeDefined()
    expect(server?.traceId).toBe(traceId)
    expect(server?.kind).toBe("server")
    expect(server?.attributes.get("http.route")).toBe("/api/health")
    expect(server?.attributes.get("http.response.status_code")).toBe(200)
  })

  test("the request metrics are exposed in the Prometheus exposition", async () => {
    const res = await app.call("/metrics", { auth: false })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/plain")
    expect(res.body).toContain("# TYPE cadcamfun_http_requests_total counter")
    expect(res.body).toMatch(/cadcamfun_http_requests_total\{[^}]*route="\/api\/health"[^}]*\} [1-9]/)
    expect(res.body).toContain("cadcamfun_http_request_duration_ms")
  })

  test("a request that matches no route is counted as unmatched, not as a success", async () => {
    const res = await app.call("/api/does-not-exist", { auth: false })
    expect(res.status).toBe(404)
    const metrics = await app.call("/metrics", { auth: false })
    expect(metrics.body).toMatch(/cadcamfun_http_requests_total\{[^}]*route="unmatched"[^}]*status="404"/)
  })

  test("only the scrape itself is in flight once earlier requests have been answered", async () => {
    await app.call("/api/health", { auth: false })
    const metrics = await app.call("/metrics", { auth: false })
    // The scrape reads the registry while its own request is being answered, so exactly one
    // request — the scrape — is in flight; the health request above has already been released.
    expect(metrics.body).toMatch(/^cadcamfun_http_requests_in_flight 1$/m)
  })
})

describe("scrubbing", () => {
  test("keys that name content or a credential are sensitive, shapes are not", () => {
    for (const key of ["ai.prompt", "http.request.header.authorization", "user_password", "apiKey", "tool_payload", "session_token", "cookie"]) {
      expect(isSensitiveAttribute(key)).toBe(true)
    }
    for (const key of ["http.route", "http.response.status_code", "cadcamfun.operation", "ai.provider"]) {
      expect(isSensitiveAttribute(key)).toBe(false)
    }
    expect(scrubAttributes({ "ai.prompt": "draw a bracket", "ai.provider": "minimax", "db.system": "sqlite" }))
      .toEqual({ "ai.provider": "minimax", "db.system": "sqlite" })
  })

  test("the span processor drops sensitive attributes before the delegate sees the span", async () => {
    const seen: Array<Record<string, unknown>> = []
    const processor = scrubbingSpanProcessor({
      onStart: () => {},
      onEnd: (span) => { seen.push({ ...span.attributes }) },
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve()
    })
    processor.onEnd({ attributes: { "ai.prompt": "secret text", "http.route": "/api/health", authorization: "Bearer x" } })
    expect(seen).toEqual([{ "http.route": "/api/health" }])
    await expect(processor.forceFlush()).resolves.toBeUndefined()
    await expect(processor.shutdown()).resolves.toBeUndefined()
  })

  test("the log processor drops sensitive attributes before the delegate sees the record", async () => {
    const seen: Array<Record<string, unknown>> = []
    const processor = scrubbingLogRecordProcessor({
      onEmit: (record) => { seen.push({ ...record.attributes }) },
      forceFlush: () => Promise.resolve(),
      shutdown: () => Promise.resolve()
    })
    processor.onEmit({ attributes: { message: "signed in", password: "hunter2", userId: "u1" } })
    expect(seen).toEqual([{ message: "signed in", userId: "u1" }])
    await expect(processor.forceFlush()).resolves.toBeUndefined()
  })
})

describe("sampling", () => {
  const received: Array<string> = []
  let collector: ReturnType<typeof Bun.serve>
  beforeAll(() => {
    collector = Bun.serve({
      port: 0, hostname: "127.0.0.1",
      async fetch(req) {
        received.push(new URL(req.url).pathname)
        return new Response("{}", { headers: { "content-type": "application/json" } })
      }
    })
  })
  afterAll(() => { collector.stop(true) })

  test("a sample ratio of 0 exports no traces", async () => {
    await Effect.runPromise(
      Effect.gen(function*() {
        yield* Effect.void.pipe(Effect.withSpan("cadcamfun.unsampled-span"))
      }).pipe(
        Effect.provide(ObservabilityLive),
        Effect.scoped,
        Effect.provide(config({ otlpEndpoint: `http://127.0.0.1:${collector.port}`, otelSampleRatio: 0 }))
      )
    )
    expect(received.filter((path) => path === "/v1/traces")).toEqual([])
  })
})

describe("the CAD metric catalogue", () => {
  test("an operation is counted by kind and outcome, with its duration", async () => {
    const body = await Effect.runPromise(Effect.gen(function*() {
      yield* countCadOperation("loft", "ok", 42)
      yield* countCadOperation("loft", "error", 7)
      const snapshot = yield* Metric.snapshot
      const counter = snapshot.find((entry) => entry.id === "cadcamfun_cad_operations_total" && entry.attributes?.operation === "loft" && entry.attributes?.outcome === "ok")
      expect(counter?.type).toBe("Counter")
      if (counter?.type === "Counter") expect(Number(counter.state.count)).toBeGreaterThanOrEqual(1)
      return yield* PrometheusMetrics.format()
    }))
    expect(body).toContain("# TYPE cadcamfun_cad_operations_total counter")
    expect(body).toMatch(/cadcamfun_cad_operations_total\{[^}]*operation="loft"[^}]*outcome="error"/)
    expect(body).toContain("cadcamfun_cad_operation_duration_ms_count")
  })
})

describe("the CAD surface audit trail", () => {
  test("the audit row points at the trace the operation ran in", async () => {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    const app = await makeApp({}, Layer.succeed(Tracer.Tracer, tracer))
    try {
      const projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Audit" } })).body.id
      const database = await app.database()
      const repo = Context.get(await Effect.runPromise(
        Layer.build(CadSurfaceRepo.layer.pipe(Layer.provide(Layer.succeed(Database, database)))).pipe(Effect.scoped)
      ), CadSurfaceRepo)
      await Effect.runPromise(repo.chamferBox(projectId, {
        box: { _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 10, z: 10 } },
        distance: 1
      }).pipe(Effect.provideService(Tracer.Tracer, tracer)))
      const rows = await Effect.runPromise(database.query("test.audit", (db) => db.select().from(schema.cadOperationLogTable)))
      expect(rows).toHaveLength(1)
      // The ids come from Effect's tracer, so they exist whether or not a collector is configured.
      expect(rows[0]!.traceId).toMatch(/^[0-9a-f]{32}$/)
      expect(rows[0]!.spanId).toMatch(/^[0-9a-f]{16}$/)
      const operation = spans.find((span) => span.name.startsWith("cad."))
      expect(operation?.traceId).toBe(rows[0]!.traceId ?? undefined)
      expect(operation?.spanId).toBe(rows[0]!.spanId ?? undefined)
    } finally {
      await app.dispose()
    }
  })
})
