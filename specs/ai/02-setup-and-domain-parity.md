# AI-02 - Setup and domain parity

Status: **specified; implementation pending**.
Stack: Effect **4.0.0-rc.112** and nikcli **@nikcli-ai/sdk-next 1.428.0** throughout.

## Authority and dependencies

Controlling steps: [RM-02 setup](../roadmap/02-multi-op-setup.md) and [RM-03 parity](../roadmap/03-api-parity.md).
RM-01 precedes new AI actions; RM-02/RM-03 may overlap only on disjoint files under [the existing sequence](../roadmap/README.md).
Follow [process](../roadmap/00-how-to-follow.md), [umbrella](../28-native-ai-architecture.md), [conventions](../01-conventions.md) and [setup design](../14-multi-op-setup.md).
RM-03 must persist revisions/receipts before RM-04 consumes them; WP0 approval/migration is an explicit prerequisite for persistence changes.
This contract is not a second task board, and no pending RM row becomes done by publication.

## Source evidence

- [Approved plan](../../.nikcli/plans/1791820593388-shiny-garden.md), AI-02, requires setup evidence and generated DB migration.
- [Setup](../../packages/core/src/cam/setup.ts) and [CAM exports](../../packages/core/src/cam/index.ts) are the existing foundation; verify program exports rather than assuming completion.
- [Drawing repository](../../apps/sidecar/src/repos/drawing-repo.ts) and [toolpath repository](../../apps/sidecar/src/repos/toolpath-repo.ts) own persistence access.
- [AI execution](../../apps/sidecar/src/services/ai.ts) regenerates/persists verification output; artifact identity must become explicit.
- [Schema](../../packages/db/src/schema.ts) and [API inventory](../api-inventory.md) ground migration and route parity.
Evidence is static; historical coverage figures and post results are not current passing gates.

## Owners and contract-first amendments

- RM-02 WP2: `packages/core/src/cam/` and CAM fixtures in `packages/core/test/`.
- RM-02 WP3: `packages/api/src/groups/`, explicit registration in `packages/api/src/index.ts`, and `packages/api/test/`.
- RM-02 WP4: `apps/sidecar/src/http/`, `apps/sidecar/src/repos/`, explicit wiring in `apps/sidecar/src/layers.ts`, and `apps/sidecar/test/`.
- RM-02 WP6: `apps/desktop/src/features/cam/` and `apps/desktop/test/` for setup bindings only.
- RM-03 WP3/WP4: `packages/api/` and `apps/sidecar/` for parity, authoritative mutation execution and receipt delivery.
- Required RM-03 WP0 amendment: `packages/db/src/schema.ts`, `packages/db/drizzle/`, `packages/db/src/` migration tests; WP0 owns revision/receipt storage and generated SQL.
- Required WP8 amendment for new setup actions: `packages/ai/src/actions/`, `packages/ai/src/tools/`, `packages/ai/test/`, after RM-01.
Amend RM owner/deliverable lists and [database](../02-database.md)/[shared contracts](../05-api-sidecar.md)/setup contracts before cross-WP implementation.
No inferred WP0 ownership: persistence work is blocked until that amendment is explicit; publication edits only this file.

## Module, Interface, Implementation

Module: deepen manufacturing setup/evidence and authoritative document mutation, not a second planner.
Interface: revisioned setup -> validated plan/program artifacts; authorized mutation -> committed receipt or tagged failure.
Implementation: pure `planPrograms`/`generateSetup`/validation plus sidecar Effect orchestration and DB repositories.
Depth localizes ordering, idempotency and invalidation; leverage lets desktop and nikcli use identical evidence.
Deletion would redistribute ordering and revision rules among generators, HTTP and AI callers; locality justifies the module.
HTTP and embedded action adapters share the execution seam without internal HTTP calls; core remains pure.

## Precise contracts

- Setup identity binds project/drawing and geometry revision, stock/frame/WCS, fixtures, cutter/holder revisions, machine limits, post/version and explicit units.
- Missing fixture/holder/machine evidence is `unknown` or `unsupported`, never an invented shop resource or certification.
- Validate finite bounds, supported operations, tool numbers/pockets, work offsets and frame compatibility before generation.
- Program identity binds setup/input digests, generator/post identity, units and hash of actual stored/emitted NC bytes.
- Geometry, stock, WCS, tool/holder, fixture, machine or post changes invalidate dependent plans/programs/verification evidence.
- Read inspection is non-mutating; generation, report persistence and generate-and-verify are separately declared write actions.
- Verification replays the identified stored NC artifact; never regenerate a different program and label the original verified.
- RM-03 receipt wire schema: version, receipt/action/call IDs, operation key/input digest, actor/owner, project/drawing, revision before/after, change set, invalidated artifacts and evidence references.
- Sidecar allocates revisions and receipts; desktop snapshots do not overwrite them or choose trusted actors.
- Serialize writes per document and require expected revision; validate every batch member before one atomic commit.
- Atomically store mutation, revision, receipt and invalidation; cancellation before commit changes nothing.
- Repeated operation key plus identical digest returns the committed receipt; different digest is a typed conflict.
- Authorization uses immutable actor and resource `canWrite`; recheck commit authority and never replace native approval with model input.
- After commit, delivery failure/cancellation reports a committed outcome; reconcile by operation key, not a blind retry.
- Shared Effect wire schemas remain in `packages/api`; HTTP paths/status/error bodies preserve existing parity contracts.
- Each inventoried action is implemented, unavailable with reason, or explicitly HTTP-only; account/billing never become model-visible by parity.

## Deliverables

1. RM-02: export and finish program planning, tool tables/pockets and one-emission generation with unchanged legacy post goldens.
2. RM-02: expose typed setup plan/generate/validate routes, setup store bindings and evidence identities.
3. RM-03: publish receipt/revision/idempotency contracts with explicit WP0 persistence ownership before RM-04 begins.
4. RM-03: implement generated migration and transactional mutation execution; HTTP and catalogue adapters call the same implementation.
5. Inventory domain/route parity and unavailable capabilities; port the controlling RM-03 families in its existing order.
6. Verify exact NC hash/revision linkage and invalidation; document unknown manufacturing coverage without machine-grade claims.

## Non-goals

No new precision preview backend, exact kernel, simultaneous multi-axis scope, external nikcli bridge or physical machine commands.
No new cloud setup table or alternate dispatch system; new geometric acceptance belongs to RM-09.

## Migration and failure handling

WP0 generates SQL from schema via `db:generate`; never hand-edit generated SQL or apply a production migration here.
Legacy documents receive a recorded baseline revision without changing geometry/units; historical evidence stays unverified until linked to actual bytes.
Preserve degree-valued histories under versioned decoding; use explicit mm/radian conversions, never reinterpret old numbers.
Reject stale revision, invalid batch, denied actor, missing required references and conflicting operation-key reuse without partial writes.
Crash-after-commit returns the existing receipt; unknown outcomes reconcile DB before retry. Migration failure prevents new receipt-dependent writes.

## Tests

Use pure setup/post fixtures, HTTP/action parity fixtures and explicit Effect Layers with `:memory:` SQLite.
Assert one header/M30 and correct tool changes, per-tool programs, frame/unit round trips and unchanged legacy goldens.
Assert invalidation across every setup input, exact saved-NC replay, unauthorized writes and atomic batch rollback.
Exercise concurrent revisions, identical/conflicting retries, cancel-before-commit, crash-after-commit and legacy upgrade round trips.

## Verify

Manifest-confirmed scripts: workspace `typecheck`, API `coverage`/`generate:check`, root `db:generate`.
Run via Monitor at implementation time; codegen only in WP0 scope when schema changes, not during this publication.

```sh
bun --no-env-file run --filter @cadcamfun/core typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/db typecheck
bun --no-env-file run --filter @cadcamfun/desktop typecheck
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/api coverage
bun --no-env-file run --filter @cadcamfun/api generate:check
bun --no-env-file test packages/core packages/api packages/db packages/ai apps/sidecar/test apps/desktop/test
git diff --check
```

## Acceptance checklist

- [ ] RM-02 setup ordering/tool changes and evidence contracts pass without legacy post regression.
- [ ] RM-03 revisions/receipts persist atomically under explicit WP0 ownership before RM-04 adoption.
- [ ] HTTP/AI execution parity, exact NC identity and all invalidation fixtures pass.
- [ ] Migration, conflict, authorization, cancellation and idempotency gates pass independently of route coverage.
- [ ] Only each satisfied controlling RM gate changes its existing roadmap status.

## Change log

- 2026-10-12: specified revisioned setup and RM-03 persistent receipts with explicit WP0 contract-first ownership; implementation pending.
