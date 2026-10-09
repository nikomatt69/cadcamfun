import { Effect, Layer } from "effect"
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
      spanProcessor: new tracesSdk.BatchSpanProcessor(new tracesExporter.OTLPTraceExporter({ url: otlpUrl(endpoint, "traces") })),
      metricReader: new metricsSdk.PeriodicExportingMetricReader({ exporter: new metricsExporter.OTLPMetricExporter({ url: otlpUrl(endpoint, "metrics") }) }),
      logRecordProcessor: new logsSdk.BatchLogRecordProcessor({ exporter: new logsExporter.OTLPLogExporter({ url: otlpUrl(endpoint, "logs") }) })
    }))
  })
)
