import { NodeSdk } from "@effect/opentelemetry"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { Layer } from "effect"
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
  AppConfigService.useSync((c) => {
    const endpoint = c.otlpEndpoint
    if (!endpoint) return Layer.empty
    return NodeSdk.layer(() => ({
      resource: { serviceName: "cadcamfun-sidecar", serviceVersion: c.version },
      spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({ url: otlpUrl(endpoint, "traces") })),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: otlpUrl(endpoint, "metrics") })
      }),
      logRecordProcessor: new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: otlpUrl(endpoint, "logs") }) })
    }))
  })
)
