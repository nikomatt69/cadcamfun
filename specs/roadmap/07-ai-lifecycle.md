# RM-07 — AI session lifecycle (remaining)

Status: **pending**. Depends on: RM-01. Design: `23-ai-runtime-architecture.md` "Further work". Owners: WP8 `packages/ai`, WP0 only if persisted tasks need a table.

## Problem

Adopted lifecycle (owner-specific cancel/join, queue bounds, closed-runtime admission) is specified as implemented. Remaining work is a second **adapter** at the durability **seam**: in-memory scheduler vs crash recovery. One adapter (memory) is hypothetical; RM-07 makes it real **or** records an ADR that in-memory is enough for v6.0.

Also remaining from spec 23: task events (typed transitions), SDK evaluation isolation (measure first), actor/permissions per-turn context.

## Effect v4

- Scheduler as `Context.Service`. Layers: `Memory` adapter now; `Sqlite` adapter only with a generated migration.
- `Effect.acquireRelease` for host/runtime. Admission closed at finalization (`23`).
- No `any`. Named `Effect.fn("AiService.removeSession")` for removal that joins children.

## Deliverables (order)

1. Confirm adopted lifecycle tests still cover the list in `23` Acceptance. Fill holes; do not re-specify.
2. Decide durability: implement SQLite task rows (owner, child session, outcome, lease/heartbeat) **or** write `docs/adr` / spec note "v6.0 in-memory only" so architecture review does not re-suggest it.
3. Typed task events for desktop (WP3/WP4/WP6) only after (1).
4. Do **not** add an AI Worker until stalls are measured (spec 23). Measurement note in Change log is enough to skip.

## Verify

```bash
bunx tsc -p packages/ai/tsconfig.json
bun test packages/ai apps/sidecar
```

## Change log

- v1: remaining lifecycle + explicit durability seam.
