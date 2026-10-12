# RM-02 — Multi-operation setup (finish WP14)

Status: **pending**. Depends on: RM-01 for new AI actions; RM-03 for persisted setup integration and completion. After RM-01, pure core, stateless contracts/adapters and non-persisting desktop work may run alongside RM-03 on explicitly disjoint files only. Design: `14-multi-op-setup.md`. Owners: WP2 `packages/core/src/cam`, WP3 `packages/api/src/groups`, WP4 `apps/sidecar/src/http` + repos, WP6 `apps/desktop/src/cam`. WP0 revision/receipt schema and generated migrations belong to RM-03, not this step.

## Problem

`combineGCode` concatenates full programs (headers, `M30`, `%`) with no tool change. That is a shallow pass-through: complexity leaks into every caller (viewport, verifier, AI, post). A **Setup** module with `planPrograms` / `generateSetup` concentrates ordering, pockets, and one-emit-per-program (**depth**, **locality**).

Current tree: `packages/core/src/cam/setup.ts` exists; `cam/index.ts` does **not** export `cam.program`; there is no `packages/api/src/groups/cam-setup.ts`, no `apps/sidecar/src/http/cam-setup.ts`, no `apps/desktop/src/features/cam/store/setupStore.ts`.

## Interface (test surface)

Pure functions in `packages/core` (no Effect, no I/O):

- `planPrograms(setup): SetupPlan`
- `generateSetup(setup, geometryOf): GeneratedSetup`
- `validateSetup(setup): issues[]` (reported, not thrown)
- `buildToolTable` / `assignPockets`

HTTP **adapter** (Effect): `POST /api/cam/setups/{plan,generate,validate}` as in `14-multi-op-setup.md` §4. Decode with Schema; `DatabaseError` → existing tagged HTTP errors.

Desktop store is an **adapter** over that HTTP interface, not a second planner.

## Effect v4

- Sidecar handlers: `Effect.fn("http.camSetup.plan")` / `.generate` / `.validate`.
- Payload: `Schema.decodeUnknownEffect`.
- Core stays pure. Geometry resolution happens in the sidecar/desktop before `generateSetup` if the core contract requires resolved elements (`14` §4).

## Deliverables (order inside this step)

1. `packages/core/src/cam/program/{op,setup,tooltable,plan,programs}.ts` exported as `cam.program` from `cam/index.ts`. Goldens of `04-core-cam.md` stay byte-identical when WP14 options are off.
2. `packages/api/src/groups/cam-setup.ts` + register in `packages/api/src/index.ts`.
3. `apps/sidecar/src/http/cam-setup.ts` + `layers.ts` (small Edit).
4. `apps/desktop/src/features/cam/{lib/setup.ts,store/setupStore.ts}` — replace `combineGCode` as the multi-op path; keep the old helper only if a test still needs it, marked deprecated.
5. After RM-03 is done: persist project-scoped setup JSON using its authoritative document revision/receipt implementation. Existing project/drawing storage or KvStore is acceptable only if it participates in the same authorized, expected-revision, atomic write and receipt semantics; it is not a bypass. No new cloud table. Any required revision/receipt schema change is contract-first WP0 work in RM-03 (`01-conventions.md` §3), not a second migration here. RM-03 delivers and tests the persistence module without waiting for RM-02 consumers; RM-02 then integrates setup/artifact identities and invalidation through that interface.
6. After RM-01: `cam_edit` actions `setup_plan` / `setup_generate` (or equivalent) — not a new per-verb tool file.

## Out of scope

- Pencil/scallop/flowline (RM-09).
- Library version columns (RM-05).

## Verify

```bash
bunx tsc -p packages/core/tsconfig.json
bunx tsc -p packages/api/tsconfig.json
bunx tsc -p apps/sidecar/tsconfig.json
bunx tsc -p apps/desktop/tsconfig.json
bun test packages/core packages/api apps/sidecar
```

Gates: one program, two tools → one header, one `M30`, `T.. M6` between ops; `perTool` emits N files; existing post goldens unchanged; HTTP tests for plan/generate/validate.

## Native AI action scope

Additional WP8 scope after RM-01: `packages/ai/src/actions/`, `packages/ai/src/tools/` and `packages/ai/test/` for setup action bindings only, under [AI-02](../ai/02-setup-and-domain-parity.md). Do not introduce new operations or geometry here. DB revision/receipt work is RM-03/WP0. HTTP and embedded adapters use the same application execution, with no internal HTTP hop.

## Change log

- 2026-10-12: [AI-02](../ai/02-setup-and-domain-parity.md) adds revisioned setup/artifact identities and actual-NC verification contracts under [spec 28](../28-native-ai-architecture.md). Persistence follows RM-03/WP0 before consumers. Existing implementation sequence and pending status unchanged.

- v1: finish WP14 as a deep Setup module plus HTTP and desktop adapters.
- 2026-10-12: clarified that pure/stateless work may proceed on disjoint files, but persisted consumers and completion wait for RM-03. Revision/receipt migration stays with RM-03/WP0; no reverse dependency or implementation claim.
