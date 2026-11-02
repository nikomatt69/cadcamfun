# Sidecar, workers and AI sessions — nikcli architecture alignment

Status: adopted lifecycle, demand-loading and rendering changes implemented and regression-checked. The remaining architectural work below is not implemented. Owners: WP8 (AI runtime), WP3/WP4 (typed catalogue filter, HTTP/services), WP6/WP7 (bootstrap, queries and viewport), WP9 (plugin RPC), WP10 (native updater). Related specifications record each cross-work-package change before implementation. No database migration in this increment.

## Long-running assistant coherence (2026-11-02)

Owner-requested performance and architecture refinement owns WP8 `packages/ai` and WP6
`apps/desktop/src/features/ai` plus their existing tests. Keep the existing host and transport interfaces:
disconnect is not cancellation, remote-turn editor ownership is captured once before asynchronous history
loading, and reconnect failures are counted per connection rather than over the follower's lifetime.
WP8 records observed first activity, inter-action gaps, permission-inclusive tool duration and loop
transitions without logging prompts or tool payloads. These observations are not provider-only latency.
No permission rule or deterministic CAD/CAM verification is weakened. Source-backed findings and remaining
work extend spec 35; unfinished architecture work is not declared complete by these fixes.

The same WP8 increment moves the pure `cad.kernel` naming report behind the existing scoped kernel-job
interface. History acquisition and project authorization stay in the action adapter; only plain validated
history/input crosses to the worker. Preserve reference outcomes, Boolean counters and diagnostics, pass
the invocation abort signal, and check worker/inline equivalence. No new model-visible action is added.

The export continuation also moves inline-history rebuild, CAD tessellation/encoding and verified-stock
meshing/encoding through that worker interface. The action adapter still acquires authorized drawing or
verification data and stores bytes only after worker success and a cancellation check. Keep formats,
units, mesh repair diagnostics, SHA-256 identities and persisted bytes equivalent. Inline-history CAD
export performs rebuild and encoding in one job; the reusable bodies reader uses the same pure rebuild
implementation. No worker may persist files, access a project repository or bypass mutation admission.

WP4 integration for export owns `apps/sidecar/src/services/ai-export.ts`, the export handler in
`apps/sidecar/src/services/ai.ts` and existing export tests: drawing-to-exact-solid acquisition is itself
a pure worker job. `cadExportBodies` accepts an optional invocation signal, preserving existing callers;
the sidecar supplies authorized elements and awaits the worker. The HTTP and action schemas are unchanged.

All kernel calls inside the existing WP4 AI tool adapter inherit `ActingUser`'s immutable invocation signal
when a caller does not supply one explicitly. This uses the same async-local-to-Effect invocation seam
already used for identity and drawing ownership. Cancellation must release workers used by inspection,
generation and verification, including handler signatures that predate an explicit signal argument.

Host isolation also sets the pinned SDK's `NIKCLI_DISABLE_SHARE`: the existing `share: disabled` setting
denies publishing but does not prevent native share-sync event listeners and deferred database reads.
Sharing remains disabled as before; unused synchronization must not tax every session event or outlive teardown.

## Parametric responsiveness continuation (2026-11-02)

The owner requested committing the verified increment and continuing. WP8 owns pure parametric worker
jobs, the existing parametric action adapters and their tests; WP4 owns `ai-parametric.ts`, the parametric
handler in `ai.ts` and existing parametric integration tests. Validation/diagnosis, recipe reports, exact
inspection, parameter changes, timeline checks and structural edits must compute in scoped workers.
The sidecar still authorizes, freezes the target, checks expected revision and commits through the
existing drawing repository. Complete immutable-input reports may share bounded content-keyed work;
callers receive independent copies of cached evidence. Keep all geometric checks, failure diagnoses,
warnings, history revision hashes and result shapes. Test variants never persist changes, carry the
invocation cancellation signal and remain bounded by the existing worker queue.

Element normalization also rebuilds nested parametric histories. Its pure implementation remains the
single validation authority; tool/sidecar batch adapters use the worker only when a batch contains a
parametric element, including within a component/group. Ordinary primitives retain their cheap path.

## Project and session context continuation (2026-11-02)

The owner requests nikcli-style context adapted to CAD/CAM: native history/plan belongs to its session,
rules and durable facts belong to its authorized project, and the live observation belongs to that turn's
explicit drawing. WP4 owns `ai-context.ts`, its use in `http/ai.ts`, and existing context tests. A project-wide
editor snapshot must not inject another drawing's selection/geometry into a bound session. When it does
not match, use the authorized target drawing's saved data with clear provenance, never another editor's
state. Keep context budgets, append-only observations and `includeContext=false` behavior. Session ids
are carried through the assembly seam; project facts stay intentionally shared across that project's sessions.

## Decision and evidence

### Tool and prompt coherence continuation (2026-11-02)

The owner reports failed operations and requests a thorough prompt rewrite connected to the actual kernels.
WP8 owns the primary, specialist, workflow, model-family and tool prompts, their assembly contracts and
tests, and delegation action normalization; WP3 owns its canonical brief schema in
`packages/api/src/ai-action-inputs.ts` and generated API reference. Audit actual native requests and stored tool outcomes
before attributing failures to the registry. Deferred discovery must expose real schemas, reused once
loaded; read-only preparation and delegation must serve the requested edit rather than replace it.
Delegation reports may be supplied as a bounded string or bounded string checklist, normalized into the
same internal brief before admission. Reject other shapes with actionable validation; never silently
drop user constraints. Preserve project/session permissions, kernel verification and prompt budgets.
No prompt or mocked provider test establishes general model competence or production tool latency.
This includes WP8 on-demand skill text: references must name current catalogue actions and make
preparation conditional on the task, rather than reintroducing removed mandatory reads. WP4 owns
correction of stale recovery instructions in the existing AI service/export/transform adapters.
The pinned host also starts Requesty remote model discovery despite the configured
`NIKCLI_DISABLE_MODELS_FETCH` flag. WP8 may patch that discovery at the existing mandatory host-patch
seam to honor the flag, keeping bundled model data and selected-provider inference unchanged. The same
patch must be asserted at source import and compiled build time; do not introduce a global fetch patch.

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

- 2026-11-02: owner-requested long-task refinement: detached budget renewal, observed latency metrics,
  bounded follower reconnection, frozen editor ownership, journal-reset drawing reconciliation and
  epoch-isolated event handling. Exact naming uses the existing cancellable kernel-worker seam.
  AI/sidecar/desktop typechecks pass; focused loop, scheduler, follower, editor and real-host regressions
  pass. Production-patched sidecar compilation and temporary-project naming invocation pass.
  Export worker migration and real-provider stage timing remain open.
- 2026-11-02 continuation: export solid acquisition, tessellation and encoding now use cancellable pure
  jobs, including verified CAM stock; legacy heavy AI handlers inherit admitted invocation cancellation.
  Native operation timing distinguishes permission wait from execution on the owning Effect v4 context.
  Loop recovery tracks confirmed completion identities. Coalesced editor reconciliation survives return
  navigation and retries transient reset failures with bounded lifecycle-owned timers. Native share-sync
  listeners are disabled consistently with the existing share policy. AI suite 1,266/1,266, UI suite 19/19,
  sidecar export/binding suite 14/14, three typechecks and compiled export/receipt smoke pass. Remaining
  synchronous parametric paths and production-provider request measurements are documented in spec 35.
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
