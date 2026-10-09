# Sidecar, workers and AI sessions — nikcli architecture alignment

Status: analysis and lifecycle alignment in progress. Owners: WP8 (`packages/ai`), WP4 (`apps/sidecar`, HTTP delegation only). No database, UI or Rust contract changes in this increment.

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
