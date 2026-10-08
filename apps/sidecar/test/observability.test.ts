import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect, Layer, Redacted } from "effect"
import { AppConfigService, type AppConfig } from "../src/config.ts"
import { ObservabilityLive, otlpUrl } from "../src/observability.ts"

const config = (extra: Partial<AppConfig>) =>
  Layer.succeed(AppConfigService, AppConfigService.of({
    token: Redacted.make("t"), dataDir: "/tmp/unused", migrationsDir: undefined, version: "6.0.0", ...extra
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
})
