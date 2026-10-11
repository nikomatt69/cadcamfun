# RM-10 — Cost and compaction honesty

Status: **pending**. Depends on: RM-07. Design: `20` Phase 7, `08-ai.md`. Owners: WP8, WP6 `/settings` + chat panel.

## Problem

`done.usage` exists; settings cost screen is partial; manual compact and recovered-stream copy are pending (`21` §18). Deepen **one** usage module (aggregate per session/project/turn) rather than summing ad hoc in three components.

## Effect v4

- Usage is data on the stream, not a new env read.
- Compact: host-native `auto: false`; UI shows `reduced: true | false | failed` honestly.

## Deliverables

1. `/settings` (or existing costs stub) sums input/output/cache from `done.usage`.
2. Manual compact button + effective policy readback.
3. Recovered-turn copy when `done.recovered` (`20` §7.4) — shared with RM-08.

## Verify

```bash
bun test packages/ai apps/desktop
```

## Change log

- v1: visible cost and honest compact/recovery.
