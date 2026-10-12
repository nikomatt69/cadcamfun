# AI-09 - Honest evaluation and observability

Status: specified / implementation pending.

## Control and scope

Controlling step: [RM-10](../roadmap/10-observability.md), dependent on [RM-07](../roadmap/07-ai-lifecycle.md). [Roadmap](../roadmap/README.md) and [process](../roadmap/00-how-to-follow.md) alone control sequence. RM-01 remains current; no quality dashboard advances a later step. Instrumentation and fixtures belong with earlier increments, not postponed until RM-10. Actual RM-10 usage totals, manual compaction/effective policy and recovered-turn copy remain required.

Effect `4.0.0-rc.112` and `@nikcli-ai/sdk-next@1.428.0` stay pinned. Use `Context.Service`, explicit Layers, named `Effect.fn`, tagged errors and bounded scoped resources after reading installed v4 docs. SDK coupling remains in `packages/ai/src/nikcli/`; nikcli owns sessions/compaction, AI SDK v7 remains one-shot. Geometry hot loops stay pure; telemetry is collected at application seams, not inserted into every geometry iteration.

## Rationale and source evidence

- `packages/ai/src/analytics.ts`: existing `AiAnalytics` and bounded in-memory ring; broad metadata and aggregate averages are not a revisioned quality baseline.
- `packages/ai/src/nikcli/runtime.ts`, `packages/ai/test/assistant-controls.test.ts`, `session-state.test.ts`: native host settings/control and readback foundations. Do not implement a second compaction algorithm.
- `apps/desktop/src/features/ai/lib/stream.ts`, `apps/desktop/test/ai-context-metrics.test.ts`: recovery and context presentation need truthful provenance.
- `packages/ai/test/nikcli-host.test.ts`, `specialists-host.test.ts`, `analytics.test.ts`, `fixtures/`, `helpers/`: offline host wiring and fixture assets exist, not evidence of real-model dimensional competence.
- `apps/sidecar/test/ai-parametric.test.ts`, `apps/desktop/test/cam-verify.test.ts`, `packages/core/src/cad/history.test.ts`: deterministic geometry/manufacturing test surfaces supply evidence for an evaluation harness.
- `specs/23-ai-runtime-architecture.md`: dated verification and explicitly unmeasured native/SDK performance. Preserve dates and limitations; no fabricated performance baseline.
- `specs/08-ai.md`, `specs/01-conventions.md`, `specs/27-everything-via-nikcli.md`: stack pins, logging and native orchestration contracts.

## Module, Interface and Implementation

Deepen the existing Usage/Evaluation module behind correlated `record`, `aggregate`, `compact/readPolicy` and versioned fixture-run readback. The Interface includes metric provenance, unknown values, owner scope, duplicate-event rules and distinct offline versus stochastic run types. The Implementation concentrates cost accounting, latency phases, redaction and scorecard assembly rather than making each UI sum ad hoc. Stream and recovered snapshot are two delivery adapters for the same usage seam; deterministic fake-provider and explicitly opted-in live-provider runs are separate adapters at the evaluation seam, not interchangeable evidence.

Deletion test: removing depth would distribute recovered usage deduplication, unknown pricing, compaction truth and quality provenance across chat, settings and evaluation runners. Concentrating these rules earns locality and leverage; a decorative dashboard without those rules is shallow. The Interface is the test surface.

## Exact owners and amendments

| Owner | Allowed directories / explicit shared files | Purpose |
| --- | --- | --- |
| WP8 current | `packages/ai/src/`, `packages/ai/test/` including `fixtures/` | Usage, host compaction adapter, redacted traces, versioned offline evaluation harness |
| WP6 current, narrowed | `apps/desktop/src/features/ai/`, `apps/desktop/src/features/*/screens/`, `apps/desktop/test/` | Existing settings/costs/chat views and truthful recovery/quality UI |
| WP3 conditional amendment | `packages/api/src/groups/`, `packages/api/src/schemas/`, `packages/api/src/sdk/generated/`; shared `packages/api/src/index.ts` | Missing typed trace/run/policy readback contracts |
| WP4 conditional amendment | `apps/sidecar/src/services/`, `apps/sidecar/src/http/`, `apps/sidecar/test/`; shared `apps/sidecar/src/layers.ts` | Correlation at execute, authorized readback and event plumbing |

Amend RM-10 and `specs/08-ai.md`, `specs/05-api-sidecar.md`, `specs/06-desktop-ui.md`, `specs/23-ai-runtime-architecture.md` before adding the broader scorecard or conditional owners. Earlier RM owners implement their own instrumentation/fixtures; this step must not retroactively edit core or companion without ownership. No new DB persistence implied; if needed, obtain explicit WP0 schema/migration owners and retention contract first. No `scripts/`, build config, provider key or dependency changes authorized by this document.

## Precise Interface and invariant contracts

### Correlation, metrics and privacy

Versioned `TurnMetrics` carries actor/project/session/turn, task/attempt/call IDs where applicable, model/provider/config fingerprint, timing phases, input/output/cache token counts with source, recovery state and quality/artifact references. Metrics are access-controlled to the same owner/project as their evidence. Never turn model-supplied identity into authorization. Deduplicate native usage by stable provider/host event identity and turn/attempt; recovered `done` cannot be counted twice. Child retry attempts are visible and attributed without counting a parent rollup again.

Tokens may be `known(value, source)` or `unavailable(reason)`; never use an absent counter as zero. Costs include currency, pricing table/version/date, model mapping and computed/estimated/unavailable status. Unknown pricing is unavailable, not free. Parent/project/session totals explicitly label partial retention and unavailable portions. Preserve input/output/cache distinction and failed/retried work. Pricing is injected configuration/reference data, not an extra env read or speculative rate.

Latency phases include queue wait, SDK evaluation/host bootstrap, provider response, action execution, rebuild/measurement, commit, event delivery and recovery. Use monotonic duration clocks in one process; cross-process wall timestamps are labeled and do not produce fictional precise durations. Collect p50/p95 with sample count, workload version, warm/cold state, build/runtime/OS/hardware, mesh/feature count, memory definition and event-loop stall methodology. Native frame responsiveness requires a real Tauri/WebKit run, separately labeled from Bun/DOM mocks. No arbitrary latency, memory or FPS target before baseline measurement and owner approval. Worker proposals depend on measured stalls, not agent concurrency.

Redacted `ActionTrace` contains action ID/classified effects, owner-scoped correlation, input digest (not full input), before/after revision, receipt/artifact hash, limit/failure tags and timing. No provider keys, bearer/pairing tokens, complete prompts/parts, attachments or raw provider bodies by default. Explicit debug consent is separate, bounded and revocable; never weaken authorization. Logs use Effect logging and redaction, with count/byte retention bounds and safe export. Trace failure must not convert a committed action to uncommitted or trigger mutation replay.

### Native compaction and recovery honesty

Manual compact is a native host operation using effective policy readback. Preserve RM-10's host-native `auto: false` requirement through the pinned adapter; if the bundle cannot apply/read it, report unsupported/failed rather than assume disabled. Return `reduced: true|false|failed`, observed before/after context measures where available, effective configuration/version and failure tag. A click is not proof that compaction reduced context. Deduplicate manual control replies and respect owner/cancel semantics. Do not summarize/replace the host conversation independently with AI SDK.

Recovered-turn copy uses actual `done.recovered`/snapshot provenance. Distinguish complete recorded outcome, partial replay and unavailable original usage. Never fabricate missing tool output/token counts to make a recovered turn look live. Context `includeContext=false` and budgets remain earlier contracts, not an observability toggle for disabling identity checks.

### Offline fixture wiring versus stochastic quality

`EvaluationRun` declares `kind: offline-wiring|stochastic-quality`, fixture corpus version/hash, prompt/skill/catalogue/schema/engine versions, model/provider parameters, local fake-provider transcript ID or actual model identity, seed if supported (otherwise unavailable), attempts, run time and environment. A run without recorded results is `not_run`; initial baseline is unavailable, never a made-up percentage.

Offline fixtures exercise the real embedded host with local fake provider, actual action execute and sidecar/repository contracts, in-memory SQLite and deterministic core. They prove routing, decoding, permissions, cancellations, receipt/revision handling and known geometry/CAM assertions for supplied candidate histories. They do not prove the stochastic model independently designed a correct part. Do not stub the acceptance checker to return success.

Scorecard records separate schema success, dimensional correctness, required feature intent, safe mutation, CAM validity, retries/tokens and uncertainty; never hide a safety failure inside an overall average. Per-part dimensional/angle tolerances come from approved fixture intent and achieved measurement limitations, not an arbitrary global quality score. Unsupported required capabilities are explicit failed/ineligible scenarios, not silently removed to improve results. All defined deterministic safety fixtures must pass (100% of enumerated safety assertions), with corpus size and exclusions reported.

Stochastic quality needs an independently recorded baseline with repeated trials, sample count, variance/uncertainty, actual configuration and failure taxonomy. Declare non-regression rule and sample plan before comparison; compare same corpus/config or label incomparable changes. Missing baseline means no non-regression claim yet. Live/provider runs are opt-in with explicit credentials, permitted data and spending/call/token budget; they are not a default Verify command and no paid calls are made by this publication. Failed/aborted runs retain observed failures and costs. No autonomous training, prompt promotion or unreviewed corpus exclusion.

## Numbered deliverables

1. Confirm upstream correlations/fixtures and amend broader scorecard contracts without moving RM sequence.
2. Deepen one usage aggregation Implementation, owner-scoped summaries and honest unknown/partial costs in settings/chat.
3. Expose native manual compaction/effective policy and truthful recovered-turn copy, retaining actual RM-10 deliverables.
4. Add redacted action/quality/artifact trace and measured phase latency/resource instrumentation with bounded retention.
5. Add versioned offline fixture scorecard and failure taxonomy over supported precision/manufacturing paths; pin configuration and preserve negative cases.
6. Define opt-in stochastic baseline protocol and record `not_run` until real authorized evidence exists. Set performance targets only after same-workload baseline and reviewed decision.

## Non-goals

No live paid call in default tests, fabricated baseline, arbitrary performance number, universal quality percentage, training, autonomous prompt updates, provider-body logging, replacement compactor or claim that fixture wiring proves model competence. No machine/controller certification.

## Migration, failure and rollback

Version usage/run records and configuration fingerprints. Legacy usage without correlation/provenance remains labeled partial/legacy and is not merged into a precise new baseline. Missing fields become unavailable, not zero. Retention exhaustion reports partial coverage; no unbounded logging. Schema decode failure quarantines invalid diagnostic data without changing domain state. Privacy/trace export failure fails closed for export while preserving the already committed receipt.

Roll back new views/harness to existing honest usage/recovery display; retain metric versions and baseline artifacts read-only, disable optional collection/export independently and preserve authorization/redaction. Native compact unsupported leaves conversation operational and reports failure. Do not promote prompts to compensate for an evaluation failure or rerun unknown mutations to fill traces.

## Tests and Verify

Existing: `packages/ai/test/analytics.test.ts`, `assistant-controls.test.ts`, `session-state.test.ts`, `nikcli-host.test.ts`, `isolation.test.ts`, `parametric.test.ts`; `apps/desktop/test/ai-context-metrics.test.ts`, `ai-recovery.test.ts`, `ai-settings.test.ts`; `apps/sidecar/test/ai.test.ts`, `ai-parametric.test.ts`.

Proposed: `packages/ai/test/evaluation-offline.test.ts`, `usage-provenance.test.ts`, `trace-redaction.test.ts`, `packages/ai/test/fixtures/precision-evaluation/`, `apps/desktop/test/ai-quality-scorecard.test.ts`. Cover duplicate/recovered usage, unknown prices/counters, child retries, unsupported compact/readback, false reduction, missing baseline, changed corpus/config, bounded redaction, per-part failed holes despite positive volume, stale revision, wrong actor, reviewer write denial, cancellation, exact-NC hash mismatch and budget exhaustion. Harness rejects unlabeled fake-provider evidence as a stochastic baseline.

Implementation Verify commands, not executed here. Typecheck scripts confirmed in AI/desktop/sidecar/API manifests; API `generate:check` confirmed. Run through Monitor using local fake provider/offline data, without `.env` reads:

```sh
bun --no-env-file test packages/ai apps/desktop/test apps/sidecar/test
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/desktop typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/api generate:check
git diff --check
```

Record measured native workload results separately; no fabricated p50/p95, memory, frame or baseline figures appear in this spec. Live evaluation requires a separate explicitly budgeted request, not implied by these commands.

## Pending acceptance checklist

- [ ] RM-07 done and broader contracts/conditional owner amendments approved.
- [ ] Usage deduplicates stream/recovery/children and labels unknown/partial tokens/pricing.
- [ ] Effective native compaction and actual reduction/failure readback verified; recovery copy reflects provenance.
- [ ] Redacted bounded trace correlates revisions/quality/artifact identity without secrets or full parts.
- [ ] Enumerated offline safety fixtures all pass; deterministic wiring is not marketed as stochastic competence.
- [ ] Per-part precision gates and unsupported cases remain explicit; baseline stays unavailable until recorded.
- [ ] Any stochastic comparison has authorized budget, pinned versions and recorded uncertainty/non-regression rule.
- [ ] Performance baseline measured before numeric targets/Worker claims; Verify evidence recorded before RM-10 done.

## Change log

- 2026-10-12: Documentation-only evaluation design specified. Separated offline fixture wiring/safety from stochastic model quality and unmeasured performance; no baseline or paid-provider result fabricated. Owner amendments remain pending; no tests executed.
