# Roadmap — ordered next work

Status: **active**. This folder is the **single ordered index** of remaining work after WP0–WP14. When anyone cites **the roadmap**, this file is the source of order.

Design specs (`specs/00` through `28`, plus `specs/ai/`) own contracts. This folder owns **sequence**: what to do next, in which order, with which owner directories, and when a step is done. [Native AI contracts](../ai/README.md) are design increments mapped to these rows, not a second task board. Their publication does not change implementation statuses.

## How to follow

1. Read this file. The table below is the order. Do not invent a parallel sequence.
2. The **current** step is the first row whose status is `in progress`, else the first `pending`.
3. Open that row's spec in this folder. Edit only its owner directories. Cross-WP contract changes go through the cited design spec first (`01-conventions.md` §4).
4. Do not start a later step until every `depends on` row is `done`, unless the request names that later step **and** its dependencies are already `done`.
5. After the acceptance gate passes: set the row to `done`, append a Change log line on the step spec, and stop unless asked to continue.

Full agent rules: `00-how-to-follow.md`. Effect v4 and architecture vocabulary in every step spec.

## Order

| # | Id | Spec | Status | Depends on | Owners |
| --- | --- | --- | --- | --- | --- |
| 0 | RM-00 | `00-how-to-follow.md` | **done** (rules) | — | agents |
| 1 | RM-01 | `01-action-catalogue.md` | **in progress** | — | WP8 `packages/ai`, WP4 AI handler adapters, WP3 shared action schemas, WP6 AI tool consumers (scopes in step spec) |
| 2 | RM-02 | `02-multi-op-setup.md` | **pending** | RM-01 for AI actions; RM-03 for persisted setup integration/completion (pure work may run in parallel) | WP2 `packages/core/src/cam`, WP3 `packages/api`, WP4 `apps/sidecar`, WP6 `apps/desktop/src/cam`, WP8 setup action bindings only |
| 3 | RM-03 | `03-api-parity.md` | **pending** | — (parallel with RM-02 on disjoint groups; AI execution uses RM-01) | WP3 `packages/api`, WP4 `apps/sidecar`, WP0 revision/receipt migration only |
| 4 | RM-04 | `04-desktop-parity.md` | **pending** | RM-03 for each vertical's routes | WP6 `apps/desktop` |
| 5 | RM-05 | `05-library-write.md` | **pending** | RM-01, WP0 | WP0 `packages/db`, WP3, WP4, WP8, WP6 |
| 6 | RM-06 | `06-context-awareness.md` | **pending** | RM-01 | WP8, WP6, WP11, WP3 snapshot/intent contracts, WP4 authorized context assembly |
| 7 | RM-07 | `07-ai-lifecycle.md` | **pending** | RM-01, RM-03 receipts for write recovery | WP8, WP0 task persistence, WP3 event/control contracts, WP4 owner binding, WP6 recovery consumers |
| 8 | RM-08 | `08-mobile-codriver.md` | **pending** | RM-07 stream recovery | WP13 `apps/mobile`, WP4 companion gateway |
| 9 | RM-09 | `09-cad-cam-depth.md` | **pending** | RM-02 for pure-core work; RM-03 and RM-06 additionally for precision integration | WP1 CAD, WP2 CAM, WP8 quality/action exposure, WP3/WP4/WP6 after core gates (scopes in step spec) |
| 10 | RM-10 | `10-observability.md` | **pending** | RM-07 | WP8, WP6 |
| 11 | RM-11 | `11-nikcli-bridge.md` | **in progress** (HTTP face + plugin built) | RM-01, RM-03 | WP8, WP3, WP4, WP9 |

Parallelisation: RM-01 is first because every later AI change hits the tool **seam**. After RM-01, RM-02 pure planning/generation, stateless contracts/adapters and non-persisting desktop work may run alongside RM-03 only on explicitly disjoint files; both steps own parts of `packages/api` and `apps/sidecar`, so workspace names alone do not prove disjointness. RM-03 owns document revision/receipt persistence and its WP0 migration first, with no dependency on RM-02. RM-02 persisted setup integration and completion wait for RM-03 to be done; RM-03 must not wait for RM-02 consumers. This scoped parallel allowance is not permission to bypass the persistence gate. RM-04 waits on the routes it ports. After RM-02, RM-09 pure-core work is independent of RM-03/RM-06; precision integration waits for both rows to be done and its core tests to pass.

## Already shipped (do not re-open)

See `specs/00-overview.md` §4. Snapshot as of this file:

| Area | State |
| --- | --- |
| WP0 Database | `LocalKeyValue` + `KvStore` exist; leftover: typed Json columns, FK indexes |
| WP1 CAD core | done |
| WP2 CAM core | done for 2.5D / 3D / lathe / verify / indexing; WP14 program grouping incomplete |
| WP3/WP4 API | **121/184** legacy route files in the contract (`bun run --filter @cadcamfun/api coverage`) |
| WP5 Tauri | M1 done |
| WP6/WP7 UI | pages are no longer `PageStub`; chat/2FA still fake; CAM setup store missing |
| WP8 AI | nikcli host, specialists (incl. `reviewer`), 16 skills, per-verb tools (~32 built-ins). Spec 26 **not landed** (`tools/action.ts` absent) |
| WP9 Plugins | SDK + host; SDK host not on HTTP |
| WP10 Release | pipeline done; secrets unset |
| WP11/12 VCS + workflows | core + sidecar; `vcs_restore_paths`, `cam/sequence` exist |
| WP13 Mobile | Expo companion; TestFlight pending |
| WP14 Multi-op setup | `cam/setup.ts` exists; `cam.program` namespace **not** exported from `packages/core/src/cam/index.ts`; no `packages/api` `camSetup` group; no desktop `setupStore` |

Design specs this roadmap sequences (do not duplicate them): `11-api-parity-brief.md`, `12-frontend-clone-brief.md`, `12-professional-cad-cam.md`, `14-multi-op-setup.md`, `14-cad-cam-parity-roadmap.md`, `20-integral-roadmap.md`, `21-integration-master-plan.md`, `22-gaps-and-fixes.md`, `23-ai-runtime-architecture.md`, `26-tool-consolidation.md`, `27-everything-via-nikcli.md`, [28-native-ai-architecture.md](../28-native-ai-architecture.md) and [AI design contracts](../ai/README.md).

## Architecture (every step)

Use these words as in the architecture skill: **module**, **interface**, **implementation**, **depth**, **seam**, **adapter**, **leverage**, **locality**.

- Prefer deepening an existing module over adding a pass-through.
- **Deletion test** before a new file: if deleting it would not force complexity into N callers, do not add it.
- The **interface is the test surface**. Tests cross the same seam as callers.
- **One adapter = hypothetical seam. Two adapters = real seam.** Do not introduce a seam until a second adapter exists or is in the same step.

## Effect v4 (every step)

Pinned to `4.0.0-rc.112`. Docs: `packages/db/node_modules/effect/ai-docs/src/`. Do not use v3 from memory (`01-conventions.md` §2).

- Services: `class X extends Context.Service<X, Shape>()("cadcamfun/X")`.
- Named workflows: `Effect.fn("Module.name")`; hot paths: `Effect.fnUntraced`.
- Boundary errors: `Schema.TaggedError`. Internal: `Data.TaggedError`. Never throw in Effect code.
- Decode with `Schema.decodeUnknownEffect`. Domain: `Schema.Class` / `Schema.Struct`.
- Layers own resources (`Effect.acquireRelease`). Callers never close handles.
- `packages/core` stays **pure** in hot loops. Effect wraps only at edges.
- Tests: `bun:test` + `Effect.runPromise` with explicit layers. `:memory:` SQLite for DB.

## Definition of done (every RM step)

Same as `00-overview.md` §5, plus:

1. This index row is updated.
2. The step spec Change log has an entry.
3. Cited design spec Status/Change log updated if the surface changed.
4. Cross-phase AI invariants in `20-integral-roadmap.md` still pass when the step touches tools, VCS, or workflows.

## Change log

- v1: created `specs/roadmap/`; ordered RM-00–RM-11 from current tree (API 121/195, spec 26 not landed, WP14 persistence missing) and architecture/Effect rules.
- 2026-10-12: linked approved spec 28 and AI design increments; scoped cross-WP contract amendments for safe execution, receipts, context, durability and precision. Sequence and pending statuses unchanged; no implementation gate claimed.
- 2026-10-12: reconciled RM-02 persistence behind independent RM-03 and explicitly gated RM-09 precision integration on RM-03/RM-06, with scoped pure-work parallelism. Documentation only; statuses unchanged.
