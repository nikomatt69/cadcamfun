# RM-07 — AI session lifecycle (remaining)

Status: **in progress** (2026-11-03: the durable task journal of deliverable 2 exists in key-value form; see the change log). Depends on: RM-01 and RM-03 receipts for write recovery. Design: `23-ai-runtime-architecture.md` "Further work", [AI-06](../ai/06-owner-safe-lifecycle.md), [spec 28](../28-native-ai-architecture.md). Owners: WP8 `packages/ai`; WP0 `packages/db` task/outcome persistence only; WP3 `packages/api/src` event/control schemas; WP4 `apps/sidecar/src/services/acting-user.ts`, AI admission/control/event handlers and AI services for owner binding; WP6 `apps/desktop/src/ai` task/stream recovery consumers. Matching tests included.

## Problem

Adopted lifecycle (owner-specific cancel/join, queue bounds, closed-runtime admission) is specified as implemented. Remaining work is a second **adapter** at the durability **seam**: in-memory scheduler vs SQLite crash recovery. The approved AI-06 contract selects SQLite; the earlier in-memory-only option is superseded and would require a newly approved ADR. One adapter (memory) is hypothetical; RM-07 makes the seam real.

Also remaining from spec 23: task events (typed transitions), SDK evaluation isolation (measure first), actor/permissions per-turn context.

## Effect v4

- Scheduler as `Context.Service`. Layers: `Memory` adapter now; `Sqlite` adapter only with a generated migration.
- `Effect.acquireRelease` for host/runtime. Admission closed at finalization (`23`).
- No `any`. Named `Effect.fn("AiService.removeSession")` for removal that joins children.

## Deliverables (order)

1. Confirm adopted lifecycle tests still cover the list in `23` Acceptance. Fill holes; do not re-specify.
2. Implement SQLite task/outcome rows (owner, child session, attempt, lease/heartbeat, revision/receipt evidence) with a generated migration and deterministic memory adapter. Approved AI-06 chooses durability; changing to in-memory-only now requires a new explicitly approved ADR, not silently skipping this gate. Commit enqueue before execution and outcome before delivery; uncertain editor outcomes reconcile, never blindly replay.
3. Typed task events for desktop (WP3/WP4/WP6) only after (1).
4. Do **not** add an AI Worker until stalls are measured (spec 23). Measurement note in Change log is enough to skip.
5. Complete immutable actor/owner propagation across child execution, retries, wakes and native controls; validate ownership of permission/question replies and removal. Bounded sequenced event buffers return explicit resync, preserve polling fallback until replay tests pass. Cancel/remove join task and delivery effects.

## Verify

```bash
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file test packages/ai apps/sidecar
```

## Change log

- v1: remaining lifecycle + explicit durability seam.
- 2026-10-12: approved AI-06 durability/ownership contract and consumer scopes; implementation pending, no crash-recovery evidence claimed.

- 2026-11-03: status corrected against the tree. Deliverable 2 exists as AI-11 step 9, with one deviation from this text: the task journal is rows of the SQLite-backed key-value store (`ai.tasks.<id>`, `apps/sidecar/src/services/ai-task-journal.ts`), not a dedicated table with a generated migration. The durability the contract asks for holds (SQLite file, task written before its runner starts, the specialist's report before its session is removed, the outcome before delivery, recovery at start-up by `BackgroundTaskManager.recover`, a row that does not decode skipped and never guessed); what a dedicated table would add is typed columns and an index by owner, which no reader needs yet. Covered by `apps/sidecar/test/ai-task-journal.test.ts` and `packages/ai/test/background-journal.test.ts`, `background-tasks.test.ts`. Still open: lease/heartbeat evidence per attempt and revision/receipt references on the row (the `target` field carries actor, drawing, revision and turn), typed task events for the desktop (deliverable 3), the bounded sequenced event buffers with explicit resync (deliverable 5), and the stall measurement note that closes deliverable 4.

