# RM-02 — Multi-operation setup (finish WP14)

Status: **pending**. Depends on: RM-01 only for new AI actions; core/API/desktop may start in parallel if they do not touch `packages/ai`. Design: `14-multi-op-setup.md`. Owners: WP2 `packages/core/src/cam`, WP3 `packages/api/src/groups`, WP4 `apps/sidecar/src/http` + repos, WP6 `apps/desktop/src/cam`.

## Problem

`combineGCode` concatenates full programs (headers, `M30`, `%`) with no tool change. That is a shallow pass-through: complexity leaks into every caller (viewport, verifier, AI, post). A **Setup** module with `planPrograms` / `generateSetup` concentrates ordering, pockets, and one-emit-per-program (**depth**, **locality**).

Current tree: `packages/core/src/cam/setup.ts` exists; `cam/index.ts` does **not** export `cam.program`; there is no `packages/api/src/groups/cam-setup.ts`, no `apps/sidecar/src/http/cam-setup.ts`, no `apps/desktop/src/cam/store/setupStore.ts`.

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
4. `apps/desktop/src/cam/{lib/setup.ts,store/setupStore.ts}` — replace `combineGCode` as the multi-op path; keep the old helper only if a test still needs it, marked deprecated.
5. Persistence: setup JSON on the project (existing project/drawing tables or KvStore). No new cloud table. If a column is required, WP0 migration in the same change (`01-conventions.md` §3).
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

## Change log

- v1: finish WP14 as a deep Setup module plus HTTP and desktop adapters.
