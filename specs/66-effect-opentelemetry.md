# Effect OpenTelemetry observability

Status: implemented (owner-requested, 2026-10-28). See the change log for what landed and the
two places where the implementation differs from the first draft of the contracts below.

The owner asked to integrate Effect's OpenTelemetry support into CADCAMFUN "the way nikcli does
it": one runtime-wide telemetry stack that produces distributed traces, metrics and
trace-correlated logs for every request, AI turn and CAD/CAM operation, instead of
console-only output. This is a concrete feature request under `roadmap/00-how-to-follow.md` §1;
it does not mark any RM row `done` and does not replace the roadmap sequence. RM-10 (cost and
compaction honesty) stays a separate step: this spec adds the *telemetry* the cost screen and
the evaluation increment can read, it does not implement the cost screen.

## Problem

The sidecar already exports Effect spans, metrics and logs over OTLP when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set (`apps/sidecar/src/observability.ts`), but the export is
close to empty:

- **Nothing read the server span.** Effect's HTTP adapter does create a request span (see the
  change log), but the application never looked at it: the matched route, the status and the
  duration were never turned into anything an operator could see, and a client that sent a
  `traceparent` header had no way to know the trace had continued.
- **No application metrics.** Effect metrics are only exported if something defines them. Nothing
  does: there is no request counter, no duration histogram, no AI token/tool counter. The OTLP
  metrics pipeline carries an empty payload.
- **No scrape endpoint.** An operator without a collector has no way to read the numbers.
  nikcli exposes Prometheus text at `/metrics`; CADCAMFUN exposes nothing.
- **No AI telemetry.** A turn's tokens, tool calls and failures are visible only in the event
  stream the UI already consumes.

The result is an observability stack that is wired but silent: the plumbing exists, the
instrumentation does not.

## Contracts

1. **One telemetry edge.** The sidecar stays the only telemetry edge. Everything is off unless
   `OTEL_EXPORTER_OTLP_ENDPOINT` is set (the existing rule), and the endpoint is never contacted
   by a packaged app on its own. `/metrics` is always available on the loopback listener: it
   exposes numbers, never payloads.
2. **Traces.** Every HTTP request produces a server span parented by an incoming `traceparent`
   (W3C) or `b3` header, so a trace started by a client continues into the sidecar. Handler
   spans stay children of that request span. AI turns produce their own span with the provider,
   model and session as attributes. A span that ends in a failure carries the failure as its
   status, so an error is visible without reading the logs.
3. **Metrics.** Effect metrics are the single metric surface (OTLP export and Prometheus text
   read the same registry, so the two can never disagree). The catalogue covers HTTP requests
   (count, duration, in-flight), AI turns (count, duration, tokens, tool calls, failures) and CAD
   surface operations (count, duration, outcome). Metric names are stable `snake_case` identifiers
   with the `cadcamfun_` prefix; attributes are low-cardinality (method, route template, status
   class, tool name, operation kind) — never a URL, an id or a free-text message.
4. **Logs.** Logs keep their current JSON form on stderr and additionally reach the OTLP logs
   pipeline, where they carry the `traceId`/`spanId` of the span in flight. Log records never
   contain request bodies, prompts or tool payloads.
5. **Health.** The existing probes stay the health contract (`GET /api/health` public,
   `GET /health` behind the launch token). No new health route is added: a second liveness
   endpoint would be a second contract with no second meaning.
6. **Privacy.** Telemetry stays opt-in, carries no user content and no identifiers beyond what
   the operator's own collector already receives. The endpoint is loopback-only, so a scrape is a
   local operation.

## Ownership

- `packages/ai` (WP8): the AI metric catalogue and the instrumentation of the turn stream.
- `apps/sidecar` (WP4): the OTLP layer, the HTTP instrumentation middleware, the Prometheus
  endpoint and the server wiring.
- No change to `packages/api`: `/metrics` is an operator endpoint, not part of the product API
  contract, so the generated API reference does not move.

## Effect v4

- `Effect.fn("Module.name")` for instrumented workflows, `Effect.fnUntraced` for hot paths.
- Metrics are `Metric.counter` / `Metric.gauge` / `Metric.histogram`; attributes come from
  `Metric.withAttributes`, values from `Metric.update` (a gauge is moved with `Metric.modify`).
- The tracer is Effect's `Tracer` reference; the OTLP layer keeps providing it, so every
  `Effect.fn`/`Effect.withSpan` in the workspace exports without further wiring.
- The request span is *not* created by the application: the HTTP adapter wraps every request in
  `HttpMiddleware.tracer`. The application reads the route from that span instead of opening a
  second one.

## Verification

- `bun test packages/ai apps/sidecar` — the metric catalogue, the turn instrumentation, the
  Prometheus exposition and the OTLP export.
- `bun check -p apps/sidecar/tsconfig.json` and `bun check -p packages/ai/tsconfig.json`.
- An in-process server test asserts that a request produces a server span, that an incoming
  `traceparent` becomes its parent, and that the request metrics show up in `/metrics`.

## Change log

- 2026-10-28: recorded the owner-requested observability scope, the one-edge rule, the metric
  catalogue, the trace-propagation contract and the verification plan before implementation.
- 2026-10-28: implemented. `packages/ai` gained the AI metric catalogue and `observedTurn`
  (turn span with provider/model/session, tokens counted once from the `done` event, tool calls
  by outcome, failures by code, duration recorded on success and on failure); `AiService.chat`
  counts a turn when it starts and observes both the host and the direct stream.
  `apps/sidecar` gained the HTTP metric catalogue (count, duration, in-flight) read from the
  matched route template, the CAD operation catalogue wired into `CadSurfaceRepo`, and
  `GET /metrics` (`PrometheusMetrics.layerHttp`, a raw router route outside the API contract).
  Two deviations from the contracts as first drafted: (1) no `HttpMiddleware.tracer` is
  installed by hand — every Effect server adapter already wraps the app in it
  (`HttpEffect.toHandled`), so installing another one created a duplicate sibling server span
  per request; the installed middleware is the metrics one, and the adapter's span is the one
  that honours `traceparent` and carries `http.route`. (2) Beyond the draft: head sampling via
  `OTEL_TRACES_SAMPLER_ARG` (parent-based, ratio on the root) and attribute scrubbing on the
  span and log processors, which drop any attribute whose key names a prompt, a payload or a
  credential before export. Verified by `packages/ai/test/observability.test.ts` and
  `apps/sidecar/test/observability.test.ts` (in-process server span parented by `traceparent`,
  route/status attributes, Prometheus exposition, unmatched-route counting, in-flight release,
  scrubbing, a 0 sample ratio exporting nothing, log records carrying their span's trace id).
