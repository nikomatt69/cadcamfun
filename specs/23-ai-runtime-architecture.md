# Sidecar, workers and AI sessions — nikcli architecture alignment

Status: adopted lifecycle, demand-loading and rendering changes implemented and regression-checked. The remaining architectural work below is not implemented. Owners: WP8 (AI runtime), WP3/WP4 (typed catalogue filter, HTTP/services), WP6/WP7 (bootstrap, queries and viewport), WP9 (plugin RPC), WP10 (native updater). Related specifications record each cross-work-package change before implementation. No database migration in this increment.

## Decision and evidence

Reference checkout: `/Volumes/SSD/Projects/nikcli`, inspected on 2026-10-09. The application uses published `sdk-next@1.428.0`; reference-checkout APIs are architectural evidence, not an assumed surface of the pinned bundle.

Retain Tauri's supervised Bun sidecar and authenticated HttpApi. Within it, retain one scoped AI runtime, lazily cached project hosts, one application-wide scheduler and child host sessions for specialists. Apply nikcli's ownership and cancellation approach at each boundary. An agent session is not an OS thread or Bun Worker.

| Boundary | CADCAMFUN sources | nikcli reference sources and implication |
| --- | --- | --- |
| Native backend | `apps/desktop/src-tauri/src/sidecar.rs`: ready JSON, token, restart once, stdin shutdown, forced termination after timeout | `packages/desktop/src-tauri/src/cli.rs`, `server.rs`, `lib.rs`: spawned backend and health-gated startup. Retain the existing boundary. |
| Server scope | `apps/sidecar/src/main.ts`, `shutdown.ts`: Effect scope, health before ready, signal/stdin teardown | `packages/nikcli/src/cli/cmd/tui/worker.ts`: owns streams, instances and server, joins shutdown. Callbacks and runners must be owned too. |
| Physical Workers | Plugin Bun Workers in `apps/sidecar/src/plugins/host.ts`; browser meshing Worker in `apps/desktop/src/viewport/view3d/view3d.tsx` | TUI backend Worker and `packages/tui/src/util/rpc.ts`: ready gating, RPC events, fail pending calls on closure. Different boundaries solve different isolation needs. |
| Embedded host | `packages/ai/src/nikcli/runtime.ts`: lazy import, scratch directories, host cache, project tools | `packages/sdk-next/src/nikcli.ts`, `packages/nikcli/src/project/instance.ts`: directory-bound in-process fetch, cached runtime, single-flight bootstrap, disposal. Keep hosts across turns. |
| AI thread | `packages/ai/src/service.ts`, `nikcli/chat.ts`: client-to-host session binding, prompt queue, explicit abort, disconnect recovery | `packages/nikcli/src/session/prompt-state.ts`, `prompt.ts`: session-owned queues and cancellation. Resolve session identity once for removal. |
| Specialist jobs | `background-tasks.ts`, `background-tools-runner.ts`: four slots, sixteen queued, child sessions, retries and queued parent wake | `packages/nikcli/src/tool/task.ts`: concurrent in-process agent loops and child lineage. Carry project/parent ownership through teardown. |
| Durability | Scheduler records are in memory; child sessions are removed after completion | `packages/nikcli/src/background/run.ts`, `run.sql.ts`, `repo.ts`: persisted outcomes, process leases, heartbeats, bounded recovery. CADCAMFUN has no equivalent restart recovery. |
| Events | `agents.ts`/`event-mapper.ts` forwards child tools to active parent streams; desktop polls state for background results | nikcli Worker forwards global/directory events and reconnects streams. Task push needs a separate contract. |

## Required lifecycle changes

1. Shared runner cancellation uses fictitious project `__shared__`, missing real owners. Pass `{ projectId, parentSessionId }` from the resolved session.
2. HTTP removal aborts the mapped host session but cancels/removes the raw client id. Delegate removal to `AiService`, which owns the binding; cancel and join children before removing the resolved parent and releasing its binding.
3. Cancelled editors retain global capacity but lose their editing exclusion (`status === running`). Track occupied entries independently from visible status until actual settlement.
4. Queue admission checks sixteen queued only when all four slots are occupied; project exclusion or missing runner allows overflow. Bound the queue independently.
5. Waiters retain abort listeners after settlement. Release listeners as waiters finish.
6. A cached per-parent runner tracks only one current promise despite concurrent children. Use one invocation lifecycle per task and scheduler-owned joining.
7. Detached completion delivery races parent removal and shutdown. Retire owners before cancellation; recheck retirement after host acquisition; join completion callbacks during disposal.
8. Warm-up and public runtime methods can create hosts after scope closure. Close admission at finalization start and guard delayed warming.

Chat abort continues to stop the parent turn while background investigations remain active. Session removal cancels and joins that owner's children. Stream disconnect is not agent abort. Shutdown closes admission, joins tasks/deliveries, then releases hosts and keys.

## Further work, separately gated

- **Persisted tasks (WP0/WP8):** generated DB migration for owner, child session, terminal outcome, lease/heartbeat and bounded recovery. Commit enqueue before execution and outcome before delivery. Recover readers after a lost lease; reconcile document revisions before replaying editors. Cancelled tasks stay terminal. Requires crash/restart tests.
- **Task events (WP3/WP4/WP6):** typed transitions/wakes with task and attempt identifiers for deduplication; snapshot reconciliation on reconnect. Keep polling as recovery until disconnect tests pass.
- **SDK evaluation isolation:** warming still evaluates the host on the sidecar event loop. Measure stalls before a dedicated AI Worker with typed ready/closing/closed RPC, bounded pending calls, forwarded events and tool proxies. Closures, Effect services and DB handles cannot be transferred. Requires compiled-sidecar packaging tests.
- **CPU CAM pool:** measure generation/verification latency, then isolate pure domain inputs in bounded Workers. Persistence and authorization stay in services; agent concurrency does not isolate CPU work.
- **Actor/permissions:** reviewer tools include workflows and verification that can write despite a read-only declaration; acting-user state is application-wide. Per-turn actor context and read-only classification need follow-up contracts. This change does not prove multi-user or parent-versus-child write isolation.

## Acceptance

Regressions must cover cancelled-editor exclusion, queue bounds with free global slots, waiter cleanup, owner-specific cancellation/joining, suppressed wakes for retired parents, joined asynchronous delivery, resolved client-id removal and closed-runtime admission/warm-up. Also run real embedded-host delegation/routing/events/retry, relevant HTTP/lifecycle tests and AI/sidecar typechecks. Distinguish the adopted lifecycle invariants from the further work above.

## Change log

- 2026-10-09: local nikcli inspection; WP8 lifecycle contract and WP4 delegation to the session-owning service specified before implementation.


## Demand loading and native/UI alignment

The AI provider is UI-scoped and its status, models and full provider catalogue are separate lazy resources. The assistant requests `/api/ai/models?configuredOnly=true`; an installation without connected providers answers without starting an embedded host. The full-list default is preserved for other callers. Settings sort connected providers first. Both model menus page results in batches of 50 and support search; searches reuse a prebuilt provider index rather than rebuilding model strings per keystroke.

The AI service uses `Effect.cachedInvalidateWithTTL` to coalesce concurrent catalogue reads. Credential mutations invalidate it after the runtime applies the change. The sidecar does not prewarm the SDK or download model metadata during bootstrap. A lazy, single-flight catalogue seed is aborted and joined during runtime shutdown. Optional OpenTelemetry imports are deferred until a collector is configured.

Typed client runtimes own credentials independently and accept AbortSignals through `ManagedRuntime.runPromise`. View queries interrupt superseded/unmounted reads. CAD fetches plugin metadata only when its plugin panel is open. Changing only chart presentation retains analytics data instead of repeating its API request.

CADCanvas and View3D own a frame scheduler which coalesces invalidations, settles orbit damping, suspends hidden views and schedules no idle frames. Browser frame APIs retain their Window receiver (required by WebKit). Toolpath playback requests continuous frames while active. Resource teardown deduplicates owned geometry/material/texture disposal; pointer callbacks and fullscreen timers are cancelled. Meshing IPC serializes work, bounds admission, correlates replies, times out hung workers and terminates superseded scene work.

Plugin RPC has ready gating, correlation IDs, scope-owned disposal, interruption cleanup and at most 64 outstanding requests per plugin. Scope closure settles pending requests before terminating workers. Rust supervises bounded reaping and suppresses restart when process exit cannot be established, moves keychain/path work to its blocking pool, and owns a single updater task with coalesced requests. Effect logs are one-line JSON; the supervisor preserves severity after redaction.

## Remaining performance limits

- A scoped in-process AI host still evaluates its SDK on the sidecar thread when first requested. Lazy loading and coalescing reduce unnecessary work; they do not prove CPU isolation. A dedicated AI Worker requires tool proxies and package/build verification.
- Heavy legacy CSG and Three.js edge extraction can still execute on the UI thread. Scene-scale geometry pooling/instancing and a CSG worker need picking/export/selection regressions before introduction.
- The live event bus uses an unbounded subscriber buffer. A bounded stream with explicit overflow/resynchronization needs a contract across desktop and mobile; silently dropping events is not introduced here.
- Persisted scheduler jobs, crash recovery and task push events remain the separate work described above.
- GPU/CPU/RAM percentage improvements require before/after runs on the same native workload. Scheduler/resource invariants are regression-tested; no percentage claim is inferred from them.

## Bootstrap diagnostics (2026-10-10)

Host acquisition reports its failing bootstrap phase (configuration, SDK import, client creation, tool registration or credential replay) and the SDK HTTP status when available. Credentials and response bodies are excluded. A saved MiniMax coding-plan key is covered by an offline embedded-host bootstrap test; this does not validate a real provider request or establish the cause of an older desktop failure.

First host acquisition with saved credentials for a provider outside the declared defaults joins metadata seeding before tool/provider initialization. Built-in-only hosts remain independent of the metadata network request. Connected-only model results require credentials for their own provider; a gateway key does not mark unrelated provider rows as connected. Metadata response admission is bounded and cache publication is atomic.

Runtime configuration publication is serialized with an Effect semaphore and atomic rename. Built-in/user skill installation is shared across project bootstraps and explicitly invalidated on skill reload, avoiding repeated filesystem work while preserving updates. Parallel project bootstrap is regression-covered.

A client conversation binding cannot cross project ownership: chat admission rejects an alias already bound to another project before acquiring that project host. The system prompt was compacted from 12,953 to 10,369 characters without raising its existing 10,400-character budget; specialist capacity is stated as global, matching the runtime scheduler.

## Verification — 2026-10-10

- Full AI suite: 294 passed, zero failures (39 files), including real embedded-host calls against a local fake provider, isolated host directories, scoped shutdown, specialist ownership and retry behavior.
- Desktop/sidecar integration: 65 passed, zero failures, covering connected-provider ordering, model selection, typed AI endpoints, bootstrap and plugin RPC/HTTP.
- Source-process lifecycle: three passed, covering EOF, shutdown IPC and SIGTERM with persisted DB state across restart. Effect logs stay on stderr; stdout retains startup-event framing.
- Graphics/scheduler/background regressions: 43 passed, zero failures. These checks do not constitute a native GPU benchmark or an end-to-end WebKit rendering verification.
- Rust: 64 passed, two explicitly ignored (real OS keychain and packaged-sidecar test); Clippy passed with warnings denied.
- AI, desktop, sidecar and API TypeScript checks passed. Generated SDK consistency and OpenAPI contract snapshots passed.
- MiniMax coding-plan bootstrap, saved-key replay, connected metadata and concurrent project acquisition passed using a synthetic public catalogue and test key, without calling MiniMax. The production screenshot's historical UnexpectedStatus was not reproduced and is not declared resolved; bootstrap now reports phase and HTTP status to diagnose any recurrence.

## Full monorepo regression check — 2026-10-10

After reproducing the three desktop failures, their fixtures/assertions were aligned with the current contracts: imported meshes require actual vertices/faces, tool summaries include the research category with exact ID coverage, and operation updates invalidate old G-code/verification before regeneration. The CAM test still verifies that editing newly verified G-code marks its report stale.

`bun --no-env-file test packages apps scripts`: 2,191 passed, zero failed, 231 files, one passing snapshot. Desktop TypeScript and whitespace checks passed. This supersedes the earlier selected-suite result for Bun tests; it is not a claim that native packaged-sidecar/keychain or live-provider checks ran.
