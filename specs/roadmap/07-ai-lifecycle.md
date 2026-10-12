# RM-07 — AI session lifecycle (remaining)

Status: **pending**. Depends on: RM-01 and RM-03 receipts for write recovery. Design: `23-ai-runtime-architecture.md` "Further work", [AI-06](../ai/06-owner-safe-lifecycle.md), [spec 28](../28-native-ai-architecture.md). Owners: WP8 `packages/ai`; WP0 `packages/db` task/outcome persistence only; WP3 `packages/api/src` event/control schemas; WP4 `apps/sidecar/src/services/acting-user.ts`, AI admission/control/event handlers and AI services for owner binding; WP6 `apps/desktop/src/ai` task/stream recovery consumers. Matching tests included.

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
