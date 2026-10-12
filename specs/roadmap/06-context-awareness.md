# RM-06 — Workspace context depth

Status: **pending**. Depends on: RM-01. Design: `19-context-awareness.md`, `20` Phase 3, `25-project-ai-context.md`, [AI-05](../ai/05-design-intent-and-context.md). Owners: WP8 workspace/project-context, scoped memory and intent modules in `packages/ai/src`; WP6 `apps/desktop/src/ai` snapshot writer; WP11 history read adapter; WP3 `packages/api/src` snapshot/intent contracts; WP4 AI context assembly. Exact additions and matching tests are scoped below.

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

## Native AI contract scope

Implement [AI-05](../ai/05-design-intent-and-context.md) under this step. Added owners: WP3 `packages/api/src` snapshot/intent schemas; WP4 `apps/sidecar/src/http/ai.ts` and AI services for authorized context assembly. Existing WP8/WP6/WP11 scope stays. Deliverables include missing-dimension questions, versioned intent, actor/project-scoped memory, provenance/staleness labels and server-side context-off behaviour. Verify no cross-project memory injection, correct snapshots and bounded rendering. Geometry preview execution remains RM-09.

## Change log

- 2026-10-12: [AI-05](../ai/05-design-intent-and-context.md) and [spec 28](../28-native-ai-architecture.md) add dimensioned intent, trust/provenance, context-off semantics and actor/project memory isolation. Additional scoped owners: WP3 `packages/api/src` snapshot/intent schemas and WP4 `apps/sidecar/src/http/ai.ts` / AI context implementations for authorized assembly; existing WP8/WP6/WP11 scope remains. No new geometric preview backend before RM-09. Implementation pending.

- v1: finish context Phase 3 on the existing renderer module.
