# AI-06 - Owner-safe execution, durability and replay

Status: specified / implementation pending.

## Control and scope

Controlling step: [RM-07](../roadmap/07-ai-lifecycle.md), dependent on RM-01 and RM-03 receipts for write recovery. [Roadmap](../roadmap/README.md) and [process](../roadmap/00-how-to-follow.md) alone control sequence. RM-01 is currently first; publication of this contract starts no implementation and marks no RM row done. Revision/receipt contracts must already exist before durable editing is enabled; missing prerequisites require contract-first amendments, not out-of-order implementation.

Effect `4.0.0-rc.112` and `@nikcli-ai/sdk-next@1.428.0` are mandatory. Read installed `packages/db/node_modules/effect/ai-docs/src/` before implementation. Use `Context.Service`, explicit Layers, named `Effect.fn`, tagged failures, decoded external inputs and scope-owned acquisition/release. SDK imports remain confined to `packages/ai/src/nikcli/`; AI SDK v7 remains stateless/one-shot. Geometry hot loops remain pure, without Effect execution.

## Rationale and source evidence

- `packages/ai/src/nikcli/runtime.ts`: cached project hosts belong to the sidecar scope, not individual turns. Retain this lifetime.
- `packages/ai/src/nikcli/background-tasks.ts`, `background-layer.ts`, `background-tools-runner.ts`, `background-tools.ts`: existing memory scheduler, four active slots, sixteen queued tasks, project/parent ownership and joining. These are the actual scheduler filenames; do not invent a replacement scheduler.
- `apps/sidecar/src/services/acting-user.ts`: layer-wide last-turn user and prompt cell. Overlapping turns can consume another turn's identity; this is a static risk, not a reproduced exploit.
- `apps/sidecar/src/http/ai.ts`, `apps/sidecar/src/services/ai.ts`: chat/control admission and repository execution need a single immutable trusted actor binding.
- `apps/sidecar/src/services/live-events.ts`: replay of twenty events but unbounded PubSub delivery. A bounded replay window is not bounded subscriber memory.
- `apps/desktop/src/ai/stream.ts`, `store.ts`: state recovery, native decision restoration and specialist polling already exist. Deepen them rather than claim recovery is absent.
- `specs/23-ai-runtime-architecture.md`: adopted teardown invariants and separately pending durability, task events and measured SDK isolation; historical test results are dated evidence, not results of this publication.
- `packages/db/src/schema.ts`, `packages/db/src/database.test.ts`, `specs/01-conventions.md`: DB ownership, generated migrations and in-memory SQLite test conventions.

## Module, Interface and Implementation

The existing Runtime/Task module gains depth behind `enqueue`, `read/list`, `cancel/wait`, parent retirement and event subscription. Its Interface includes owner identity, replay eligibility, cancellation ordering, lease fencing and delivery guarantees, not just task status. The Implementation retains nikcli host sessions and scheduler rules while a repository concentrates durable state transitions. Memory and Sqlite are two adapters at the durability seam; both execute the same contract suite. The action execute seam is reused, not duplicated.

Deletion test: deleting the deepened module would spread actor binding, lease recovery, deduplicated delivery and parent retirement across HTTP handlers, specialist runners and desktop recovery. Keeping those rules together earns locality and leverage; a separate pass-through task facade does not.

## Exact implementation owners and contract-first amendments

RM-07's 2026-10-12 amendment includes WP0 persistence and WP3/WP4/WP6 consumers and selects SQLite. SQLite is mandatory for this approved plan; the historical in-memory-only alternative requires a new approved ADR. The exact scopes below are a contract-first refinement: before implementing, reconcile any broader directory in this table with RM-07's narrower file/task scopes and cited contracts. Directory inclusion never grants unrelated edits.

| Owner | Allowed directories / explicit shared files | Purpose |
| --- | --- | --- |
| WP8 | `packages/ai/src/`, `packages/ai/test/` | Runtime, scheduler, immutable invocation and Memory adapter |
| WP0 | `packages/db/src/`, `packages/db/drizzle/` | Schema, generated SQL/metadata, migration and DB tests |
| WP4 amendment | `apps/sidecar/src/services/`, `apps/sidecar/src/repos/`, `apps/sidecar/src/http/`, `apps/sidecar/test/`; shared `apps/sidecar/src/layers.ts` | Actor binding, task repository, controls and live-event implementation |
| WP3 amendment | `packages/api/src/groups/`, `packages/api/src/schemas/`, `packages/api/src/sdk/generated/`; shared `packages/api/src/index.ts` | Typed events, control errors and generated consumers |
| WP6 amendment | `apps/desktop/src/ai/`, `apps/desktop/test/` | Task push, deduplication and authoritative resync |

Contracts to amend first: `specs/23-ai-runtime-architecture.md`, `specs/05-api-sidecar.md`, `specs/02-database.md`, `specs/08-ai.md`, `specs/06-desktop-ui.md`, and RM-07 owners/deliverables. These are required future amendments, not edits authorized by this publication. No Tauri, mobile, kernel or dependency-manifest changes here. Any absent proposed directory is created only under its approved owner.

## Precise Interface and invariant contracts

### Identity, authorization and controls

1. Trusted `InvocationContext` contains immutable `actorId`, `projectId`, `parentSessionId`, resolved `hostSessionId`, `clientSessionId`, `turnId`, `actionCallId`, optional `drawingId/expectedRevision`, and cancellation signal. Capture at turn admission/enqueue. Model input cannot set actor, owner, grants or confirmation evidence. Persist identifiers, not a transferable credential or a mutable SessionUser reference.
2. Owner equality is the triple `(actorId, projectId, parentSessionId)`. Session alias resolution is validated against that owner before host acquisition; child bindings cannot cross owner/project. Recheck current resource read/write rights immediately before execute/commit; enqueue-time authority cannot outlive revocation.
3. Chat, queue, state/list/read, abort/cancel, remove, compact, question reply, permission reply, task controls and event subscription all validate authenticated owner. Wrong-owner IDs return a stable non-disclosing failure; no host/repository mutation runs. Resource authorization, native nikcli capability/confirmation and write scheduling remain separate checks.
4. Native decisions bind owner, requestId, action identity/digest, revision and expiry. A reply to a retired parent, changed parameters/revision, consumed request or revoked authority is rejected. A model's `confirm: true` never grants approval.
5. Removal resolves aliases once, retires the owner, closes admission, cancels/joins children and outstanding deliveries, then removes the resolved parent/binding. No wake may create/acquire a host for a retired owner. Shutdown closes all admission before joining tasks/deliveries and releasing hosts. Disconnect does not abort; explicit turn abort does not implicitly delete independent background investigations.

### Durable rows and state transitions

Proposed table names below are new contracts, finalized by WP0 against existing naming conventions; do not reuse generic KV blobs for job state.

| Row | Required fields and constraints |
| --- | --- |
| `AiTask` | `id`, owner triple, client/host/child session IDs, turn/call IDs, action ID, classified effects, replay policy, document ID/base revision, operation key/input digest, schema version, bounded authorized input, status, created/updated time, cancel/retired markers; immutable identity after enqueue |
| `AiTaskAttempt` | task ID + monotonically increasing attempt unique key, lease owner, fencing token, lease expiry/heartbeat, started/settled time, bounded tagged error; terminal attempts never become running again |
| `AiTaskOutcome` | task/attempt unique key, terminal status, bounded result/evidence references, mutation receipt ID, committed time; outcome exists before delivery |
| `AiTaskDelivery` | unique `(taskId, outcomeVersion, parentSessionId)` key, pending/acknowledged/suppressed state and attempts; replay cannot create a second logical wake |

All rows go through WP0 Database/repository contracts. Inputs/results need schema versions, explicit size/retention limits and actor/project access checks; prompts/part data are not telemetry. No provider keys or bearer tokens in rows. FK/index requirements include owner lookup, runnable status/lease expiry and unique operation keys at the action receipt seam.

`enqueue` commits queued row before returning admission or executing a child. Claim/heartbeat/settle are conditional transactions fenced by current lease token; a stale process cannot commit a task transition or a document write. Task status transitions are `queued -> running -> completed|failed|cancelled|needs_review`; a recoverable reader may create a new attempt, never overwrite an old attempt. Terminal cancellation does not requeue. Queue-full/disposed errors are typed and commit no task. Preserve four active/sixteen queued limits unless a measured, approved contract changes them. Editing exclusion is per document and retained until runner settlement, even after visible cancellation; project exclusion remains conservative until multi-document scheduling is tested.

Outcome and delivery intent commit before event/wake emission. Document mutation, receipt and artifact invalidation commit atomically in the document repository; task completion links that receipt. If those commits cannot share a transaction, recovery reads the receipt to close the gap rather than re-executing. Delivery is at-least-once with deduplication, not exactly-once model execution. Acknowledgement is not proof of UI application; snapshot state remains authoritative.

### Unknown editor outcomes and cancellation

Operation key is scoped to actor/project/document/action invocation; canonical validated input digest detects reuse with changed parameters (`OperationKeyConflict`). Serialize writes, validate the complete batch, check expected revision, current authority, lease fence and interruption immediately before atomic commit. A repeated committed key returns its original receipt. Before-commit cancellation commits nothing; cancellation observed after commit returns committed receipt/status, never falsely claims rollback.

On restart/lost lease, only classified read jobs without hidden writes are eligible for bounded retry with the original actor and fresh authority checks. Editor outcome is `unknown` until reconciliation reads operation receipt and authoritative revision. Matching receipt/digest means committed; proven pre-commit nonexecution may be offered for explicit new execution. Missing receipt alone is not proof that a write did not happen. Uncertain, conflicting or unavailable evidence becomes `needs_review`; no blind replay, automatic model rerun, or fallback actor. Report-persistence, memory and workflow effects are writes for replay policy.

### Bounded events and resync

Event envelope: schemaVersion, eventId, sequence, stream epoch, owner/session/turn/task/attempt IDs, transition, document ID/revision when applicable, receipt/outcome references and timestamp. Sequence is monotonic within an owner stream/epoch, not a claimed global order. Snapshots include epoch and high-water cursor, active tasks, terminal outcomes and pending native decisions. Filter authorization before exposing data.

Bound subscriber queues and retained events by configured count/bytes; never block a document commit on a slow client. Overflow or expired/foreign cursor produces explicit `resync_required { reason, epoch, snapshotCursor }`, closes/pauses ordinary delivery, and directs an authorized snapshot fetch. Never silently drop an event and continue as if contiguous. Clients deduplicate eventId and task/attempt/outcome keys, ignore stale revisions, then resume after the snapshot high-water cursor. Keep polling fallback until replay, overflow and reconnect tests pass. Bound and redact diagnostics.

Tagged failures include `OwnerMismatch`, `Forbidden`, `StaleDecision`, `RevisionConflict`, `OperationKeyConflict`, `TaskQueueFull`, `RuntimeClosed`, `LeaseLost`, `OutcomeUnknown`, `ResyncRequired` and `DatabaseError`; publish their decoded schema and HTTP mappings in WP3 before consumption.

## Numbered deliverables

1. Amend contracts/owners and inventory every control and actual effect; preserve adopted lifecycle assertions.
2. Replace last-turn actor/prompt lookup with immutable invocation binding through parent, child, retry and wake; deny revoked writes.
3. Add generated SQLite migration and repository, Memory/Sqlite contract suite, fenced lease transitions and commit-before-delivery.
4. Add document receipt/idempotency reconciliation and crash matrix; uncertain editors require review, not replay.
5. Add authorized typed task push, bounded subscriber/resync protocol, desktop reducer and polling fallback.
6. Record SDK import/first-host/turn event-loop stalls, native responsiveness and compiled-sidecar observations. Only measured stalls justify a separate Worker proposal; typed Worker RPC/packaging is not a deliverable here.

## Non-goals

No replacement nikcli loop, new agent framework, AI Worker, provider call, exact-once LLM execution, machine actuation, wider companion access or new geometry. In-memory-only production durability is not the accepted option in this plan. No runtime toggle bypasses authorization.

## Migration, failure and rollback

Generate from `packages/db/src/schema.ts` with `bun --no-env-file run db:generate`; include generated SQL and metadata in the eventual implementation change, never hand-edit SQL. A git commit still requires an explicit user request. Test fresh and prior-schema SQLite copies, upgrade twice and interruption; do not run `db:migrate` on user/production data for a test. Commit-before-delivery refers to SQLite transaction commit, not git.

Legacy in-memory tasks have no reliable durable provenance: do not synthesize restartable editors. Drain/join before enabling durable admission. Missing actor ownership quarantines old state; never infer the latest user. DB unavailable means durable enqueue/write admission fails closed. Lease expiry, delivery failure and unknown commit produce recoverable evidence/needs-review, not silent success. Roll back by closing admission, joining runners, disabling new delivery consumers and retaining rows/receipts for reconciliation; do not drop tables, delete evidence or replay jobs under old code. A schema-incompatible binary must refuse durable execution until a reviewed compatibility path exists.

## Tests and Verify

Existing: `packages/ai/test/runtime-lifecycle.test.ts`, `background-tasks.test.ts`, `background-tools-runner.test.ts`, `assistant-controls.test.ts`, `isolation.test.ts`; `apps/sidecar/test/acting-user.test.ts`, `ai.test.ts`, `live-events.test.ts`; `apps/desktop/test/ai-recovery.test.ts`, `ai-lifecycle.test.ts`; `packages/db/src/database.test.ts`. Existing locations are regression targets, not pass claims.

Proposed: `packages/ai/test/task-durability-contract.test.ts`, `apps/sidecar/test/ai-owner-durability.test.ts`, `packages/db/src/ai-task-migration.test.ts`, `apps/desktop/test/ai-task-resync.test.ts`. Use fake clocks, local fake provider and `:memory:`/temporary-file SQLite. Cover overlap of actors/projects, reader write denial, owner control forgery, retirement delivery race, lost lease fencing, crash before/after document commit and outcome commit, duplicate wake, overflow, missing cursor, cancelled editor slot retention and revoked rights during recovery.

Implementation Verify commands (not executed for this documentation task). Typecheck scripts confirmed in the respective manifests; root `db:generate` confirmed in `package.json`/`packages/db/package.json`. Run long commands with Monitor and isolated test config, without `.env` reads:

```sh
bun --no-env-file test packages/ai apps/sidecar/test apps/desktop/test packages/db/src
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/db typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/desktop typecheck
git diff --check
```

## Pending acceptance checklist

- [ ] Required owner/contract amendments approved; RM prerequisites done.
- [ ] Original actor survives overlap, retry, wake and every control; rights revoked before commit deny mutation.
- [ ] Generated migration and both durability adapters pass contract/crash tests; outcomes commit before delivery.
- [ ] Unknown editors reconcile without blind replay; duplicates return recorded receipt.
- [ ] Cancel/remove/shutdown join children and deliveries; retired parents cannot wake.
- [ ] Overflow/reconnect snapshot reconciliation works; polling remains until gates pass.
- [ ] SDK stalls measured before any Worker decision; no new performance claim inferred.
- [ ] Verify results recorded by implementation owner before RM-07 can be marked done.

## Change log

- 2026-10-12: Documentation-only contract specified from the approved plan. Selected SQLite durability and exact owner refinements; read back concurrent RM-07 receipt/owner amendments without editing them. Historical in-memory alternative remains a recorded conflict. No runtime tests executed; implementation and acceptance remain pending.
