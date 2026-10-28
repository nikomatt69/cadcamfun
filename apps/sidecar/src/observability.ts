import { Effect, Exit, Layer, Metric, Option, Tracer } from "effect"
import { HttpMiddleware, HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { PrometheusMetrics } from "effect/unstable/observability"
import { AppConfigService } from "./config.ts"

/** `http://host:4318` and `http://host:4318/` both become `http://host:4318/v1/<signal>`. */
export const otlpUrl = (endpoint: string, signal: "traces" | "metrics" | "logs"): string =>
  `${endpoint.replace(/\/+$/, "")}/v1/${signal}`

/**
 * OpenTelemetry export for spans, metrics and logs (Effect spans, `Effect.log*` and the
 * HTTP server's request spans all flow through it). Off unless `OTEL_EXPORTER_OTLP_ENDPOINT`
 * is set, so a packaged app never opens a telemetry connection on its own. The service
 * name/attributes can still be overridden through the standard `OTEL_SERVICE_NAME` and
 * `OTEL_RESOURCE_ATTRIBUTES` variables.
 */
export const ObservabilityLive = Layer.unwrap(
  Effect.gen(function*() {
    const c = yield* AppConfigService
    const endpoint = c.otlpEndpoint
    if (!endpoint) return Layer.empty
    const [effectOtel, logsExporter, metricsExporter, tracesExporter, logsSdk, metricsSdk, tracesSdk] = yield* Effect.promise(() => Promise.all([
      import("@effect/opentelemetry"), import("@opentelemetry/exporter-logs-otlp-http"),
      import("@opentelemetry/exporter-metrics-otlp-http"), import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/sdk-logs"), import("@opentelemetry/sdk-metrics"), import("@opentelemetry/sdk-trace-base")
    ]))
    return effectOtel.NodeSdk.layer(() => ({
      resource: { serviceName: "cadcamfun-sidecar", serviceVersion: c.version },
      spanProcessor: scrubbingSpanProcessor(new tracesSdk.BatchSpanProcessor(new tracesExporter.OTLPTraceExporter({ url: otlpUrl(endpoint, "traces") }))),
      ...(c.otelSampleRatio === undefined ? {} : {
        tracerConfig: {
          sampler: new tracesSdk.ParentBasedSampler({ root: new tracesSdk.TraceIdRatioBasedSampler(c.otelSampleRatio) })
        }
      }),
      metricReader: new metricsSdk.PeriodicExportingMetricReader({ exporter: new metricsExporter.OTLPMetricExporter({ url: otlpUrl(endpoint, "metrics") }) }),
      logRecordProcessor: scrubbingLogRecordProcessor(new logsSdk.BatchLogRecordProcessor({ exporter: new logsExporter.OTLPLogExporter({ url: otlpUrl(endpoint, "logs") }) }))
    }))
  })
)

/**
 * The Prometheus exposition of the metrics the OTLP exporter sends.
 *
 * Both read Effect's metric registry, so the scraped numbers and the exported numbers can never
 * disagree. It is a raw router route: an operator's endpoint, not part of the product API
 * contract, so it stays out of the generated API reference.
 */
export const MetricsRouteLive = PrometheusMetrics.layerHttp({ path: "/metrics" })

/** HTTP requests answered, by method, route template and status code. */
export const httpRequests = Metric.counter("cadcamfun_http_requests_total", {
  description: "HTTP requests answered, by method, route and status"
})

/** How long an HTTP request took, in milliseconds. */
export const httpRequestDuration = Metric.histogram("cadcamfun_http_request_duration_ms", {
  description: "Duration of an HTTP request, in milliseconds",
  boundaries: [5, 25, 100, 500, 2000, 10000, 60000]
})

/** Requests the server is answering right now. */
export const httpRequestsInFlight = Metric.gauge("cadcamfun_http_requests_in_flight", {
  description: "HTTP requests the server is answering right now"
})

/** CAD surface operations, by operation and outcome. */
export const cadOperations = Metric.counter("cadcamfun_cad_operations_total", {
  description: "CAD surface operations, by operation and outcome"
})

/** How long a CAD surface operation took, in milliseconds. */
export const cadOperationDuration = Metric.histogram("cadcamfun_cad_operation_duration_ms", {
  description: "Duration of a CAD surface operation, in milliseconds",
  boundaries: [10, 50, 250, 1000, 5000, 30000]
})

/** Counts a CAD surface operation and how long it took. */
export const countCadOperation = (
  operation: string,
  outcome: "ok" | "error",
  durationMs: number
): Effect.Effect<void> =>
  Effect.all([
    Metric.update(Metric.withAttributes(cadOperations, { operation, outcome }), 1),
    Metric.update(Metric.withAttributes(cadOperationDuration, { operation }), durationMs)
  ], { discard: true })

/**
 * The route a request matched, read from the request span.
 *
 * Effect's router records the matched template on the span (`http.route`), which is the only
 * place that knows it: a counter per URL would create one series per document and drown the
 * useful ones. A request that matched no route has no template and is counted as `unmatched`.
 */
const routeOf = Effect.gen(function*() {
  const span = yield* Effect.serviceOption(Tracer.ParentSpan)
  const route = Option.match(span, {
    onSome: (span) => span._tag === "Span" ? span.attributes.get("http.route") : undefined,
    onNone: () => undefined
  })
  return typeof route === "string" ? route : "unmatched"
})

/**
 * The status a request ended with.
 *
 * A failed request is turned into the response the server would send, so a request that matched
 * no route is counted as the `404` it was and not as a server error.
 */
const statusOf = (exit: Exit.Exit<HttpServerResponse.HttpServerResponse, unknown>): Effect.Effect<number> =>
  Exit.isSuccess(exit)
    ? Effect.succeed(exit.value.status)
    : Effect.map(HttpServerError.causeResponse(exit.cause), ([response]) => response.status)

/**
 * Counts every request the server answers.
 *
 * The request span is created by Effect's HTTP server above this middleware: it is the parent
 * of every span the request creates, it is where the router records the matched route template,
 * and a client that sends a W3C `traceparent` header continues its own trace in it.
 */
export const httpMetrics = HttpMiddleware.make((app) =>
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const startedAt = Date.now()
    yield* Metric.modify(httpRequestsInFlight, 1)
    return yield* Effect.onExit(app, (exit) =>
      Effect.gen(function*() {
        yield* Metric.modify(httpRequestsInFlight, -1)
        const route = yield* routeOf
        const status = yield* statusOf(exit)
        yield* Metric.update(
          Metric.withAttributes(httpRequests, { method: request.method, route, status: String(status) }),
          1
        )
        yield* Metric.update(
          Metric.withAttributes(httpRequestDuration, { method: request.method, route }),
          Date.now() - startedAt
        )
      }))
  }))

const sensitiveKey = /(password|passwd|secret|token|authorization|cookie|api[-_]?key|prompt|payload)/i

/**
 * True when an attribute key names user content or a credential.
 *
 * Telemetry carries shapes, never content (spec 66 §4): an attribute whose key names a prompt,
 * a payload or a credential is dropped before export, whatever the caller annotated.
 */
export const isSensitiveAttribute = (key: string): boolean => sensitiveKey.test(key)

/** A copy of the attributes with every sensitive key dropped. */
export const scrubAttributes = <V>(attributes: Readonly<Record<string, V>>): Record<string, V> => {
  const scrubbed: Record<string, V> = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (!isSensitiveAttribute(key)) scrubbed[key] = value
  }
  return scrubbed
}

/** The slice of an SDK span processor this module wraps. */
export interface SpanProcessorLike {
  onStart?(span: never, context: never): void
  onEnd(span: { attributes: Record<string, unknown> }): void
  forceFlush(): Promise<void>
  shutdown(): Promise<void>
}

/**
 * Wraps a span processor and drops sensitive attributes before a span reaches the exporter.
 *
 * The SDK span carries a mutable attribute record; scrubbing on end covers attributes set at
 * creation and during the request (HTTP header attributes are already redacted by Effect's
 * tracer, this is the second wall for application annotations).
 */
export const scrubbingSpanProcessor = (delegate: SpanProcessorLike): SpanProcessorLike & { onStart(span: never, context: never): void } => ({
  onStart: (span: never, context: never) => delegate.onStart?.(span, context),
  onEnd: (span) => {
    for (const key of Object.keys(span.attributes)) {
      if (isSensitiveAttribute(key)) delete span.attributes[key]
    }
    delegate.onEnd(span)
  },
  forceFlush: () => delegate.forceFlush(),
  shutdown: () => delegate.shutdown()
})

/** The slice of an SDK log record this module scrubs. */
export interface LogRecordLike {
  attributes: Record<string, unknown>
}

/** The slice of an SDK log record processor this module wraps. */
export interface LogRecordProcessorLike {
  onEmit(record: LogRecordLike, context?: unknown): void
  forceFlush(): Promise<void>
  shutdown(): Promise<void>
}

/** A log record processor that drops sensitive attributes before delegating. */
export const scrubbingLogRecordProcessor = (delegate: LogRecordProcessorLike): LogRecordProcessorLike => ({
  onEmit: (record, context) => {
    for (const key of Object.keys(record.attributes)) {
      if (isSensitiveAttribute(key)) delete record.attributes[key]
    }
    delegate.onEmit(record, context)
  },
  forceFlush: () => delegate.forceFlush(),
  shutdown: () => delegate.shutdown()
})
