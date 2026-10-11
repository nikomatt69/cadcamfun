# RM-06 — Workspace context depth

Status: **pending**. Depends on: RM-01. Design: `19-context-awareness.md`, `20` Phase 3, `25-project-ai-context.md`. Owners: WP8 `packages/ai/src/workspace-context.ts`, WP6 snapshot writer, WP11 for last-commit line.

## Problem

`renderWorkspaceContext` exists and budgets sections. It still guesses less than a machinist needs: no `lastGcodeChangedAt` / `lastVerifiedAt` / `stockBox` / machine limits, no "next machining decision" hint, no typed `memory_recall`, no last-3-commits line (`21` §8.6–8.8 pending).

Deepen **one** renderer module. Do not add a second context builder in the desktop.

## Interface

`WorkspaceSnapshot` Schema (desktop writes, sidecar/AI reads). Renderer: pure function `(snapshot, budget) => string`. Tests on that function.

## Effect v4

- Snapshot decode with Schema at the sidecar edge.
- Memory stays on `KvStore` / `LocalKeyValue`. Credentials never in KV (`02-database.md`).
- `Effect.fn("workspace.render")` only if the renderer becomes effectful; prefer keeping it pure.

## Deliverables

1. Snapshot fields from `20` §3.1–3.3.
2. Next-decision hint table aligned with `toolpath-verification` skill.
3. Typed notes from `memory_recall` (`preference` | `lesson` | `spec`).
4. Last-3-commits one-liner from `vcs_log` when non-empty.

## Verify

```bash
bun test packages/ai
```

Unit tests on the renderer with budget caps; no invented fields (`str/num/rec/arr` helpers stay).

## Change log

- v1: finish context Phase 3 on the existing renderer module.
