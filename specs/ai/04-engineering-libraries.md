# AI-04 - Grounded engineering libraries

Status: **specified; implementation pending**.
Stack: Effect **4.0.0-rc.112** and nikcli **@nikcli-ai/sdk-next 1.428.0** throughout.

## Authority and dependencies

Controlling step: [RM-05](../roadmap/05-library-write.md); dependencies are RM-01 tool contracts and WP0 persistence contracts.
Follow [the single roadmap](../roadmap/README.md), [process](../roadmap/00-how-to-follow.md) and [umbrella](../28-native-ai-architecture.md).
Read [library design](../18-library-and-knowledge.md), [database](../02-database.md) and [conventions](../01-conventions.md).
RM-02 setup and RM-03 receipt contracts are consumed where available; dependent evidence cannot be declared current without their identities.
Publishing this specification neither introduces another library task board nor starts implementation early.

## Source evidence

- [Approved plan](../../.nikcli/plans/1791820593388-shiny-garden.md), AI-04, requires provenance, limits and honest absent equipment.
- [DB schema](../../packages/db/src/schema.ts) defines material/tool/machine/component rows; versioned writes need WP0 review.
- [Library repository](../../apps/sidecar/src/repos/library-repo.ts), [material repository](../../apps/sidecar/src/repos/material-repo.ts) and [tool repository](../../apps/sidecar/src/repos/tool-repo.ts) are existing persistence implementations.
- [Machine repository](../../apps/sidecar/src/repos/machine-config-repo.ts) and [machine domain](../../packages/core/src/cam/machine.ts) ground equipment capabilities.
- [AI execution](../../apps/sidecar/src/services/ai.ts) and [library design](../18-library-and-knowledge.md) describe inline library tools; inventory actual support before claiming gaps.
Static documentation/source evidence is not proof of completed versioning, permission safety or machine suitability.

## Owners and contract-first amendments

- WP0: `packages/db/src/schema.ts`, `packages/db/drizzle/`, `packages/db/src/` for schema and migration tests.
- WP3: `packages/api/src/groups/`, `packages/api/src/` shared library schemas, explicit `packages/api/src/index.ts` registration, `packages/api/test/`.
- WP4: `apps/sidecar/src/repos/`, `apps/sidecar/src/http/`, `apps/sidecar/src/services/`, `apps/sidecar/test/` for library execution/evidence only.
- WP8: `packages/ai/src/actions/`, `packages/ai/src/tools/`, `packages/ai/src/nikcli/`, `packages/ai/test/` for catalogue exposure.
- WP6: `apps/desktop/src/features/*/screens/`, `apps/desktop/src/app/`, `apps/desktop/test/` only for library CRUD and evidence display.
- WP11 VCS integration remains `packages/vcs/` and sidecar VCS implementation; add it to RM-05 explicitly if snapshot contracts must change.
Amend controlling RM-05 and affected library/DB/shared contracts before cross-WP edits, including any holder evidence persistence.
WP2 `packages/core/src/cam/` is not implicitly owned; request contract-first amendment if deterministic constraints need core changes.
Publication owns only this file; scope lists are not authorization for unrelated runtime changes.

## Module, Interface, Implementation

Module: deepen engineering library evidence and versioned editing, retaining existing lookup/repository implementations.
Interface: authorized list/get/upsert/delete/default plus revision and evidence-backed recommendation result.
Implementation: validated Effect workflows over repositories and existing deterministic machining constraints.
Depth hides ownership, unit decoding and evidence invalidation; leverage gives human and AI callers the same grounded data.
Locality keeps limits/provenance beside version semantics; deleting the module would scatter those rules among callers.
HTTP and catalogue adapters form the execution seam; VCS snapshot is an evidence consumer, not another row authority.

## Precise contracts

- Every record has identity, kind, owner/organization/project scope, revision/version ancestry and validated properties.
- Evidence property carries value or range, unit, source reference, source version/date, trust/provenance and known limits.
- Distinguish user-entered, manufacturer-specified, measured and derived data; missing evidence remains unknown.
- Material evidence includes identified alloy/condition and only supplied density/cutting data with units and applicable operation bounds.
- Cutter evidence includes supported type, diameter, flute count, cutting/total/shank lengths, RPM ceiling and coolant constraints.
- Holder/assembly evidence records geometry, stickout and source; absent holder geometry is unknown collision coverage, not safe clearance.
- Machine evidence includes supported axes/travel, spindle/feed ceilings, offsets, changer bounds, controller/post and coolant availability.
- Component references distinguish saved resource IDs from canvas instance IDs; insertion creates fresh instance IDs.
- Reject non-finite/negative incompatible values, impossible cutter lengths, invalid flute counts and unsupported unit conversions.
- Visibility/public lookup does not grant mutation; every write checks immutable actor/resource `canWrite` and native tool-keyed policy.
- Upsert/delete/default use expected version and idempotent mutation identity; unknown references and stale versions fail without partial writes.
- A model `confirm:true` never substitutes for native human approval; destructive groups follow AI-01's stricter `ask` contract.
- Recommendation identifies material/tool/holder/machine revisions, operation and input geometry evidence plus method and units.
- Deterministic constraints cap or reject RPM/feed/step parameters against known limits and return explicit reason/changed value.
- With required evidence absent, return needs-input/unsupported instead of inventing alloy, shop equipment or certified safe settings.
- Suggested values remain proposals; persist only an authorized approved edit through the shared execution seam.
- Library version changes invalidate dependent setup/toolpath/program/report identities; retain old revision evidence for audit.
- VCS canonical version blobs remain consistent with library revisions; AI cannot push GitHub or expand authority via library text.

## Deliverables

1. Inventory actual lookup/write coverage, schema gaps and current library evidence; reconcile dated claims against code.
2. Add validated property/provenance contracts and version ancestry with WP0-generated migration where required.
3. Route HTTP, catalogue and human CRUD through one version-aware authorized implementation using existing legacy paths.
4. Produce evidence-backed deterministic recommendations with explicit clamp/reject/missing-evidence reasons.
5. Link library revisions to setup/program invalidation and existing VCS snapshots without duplicating canonical records.
6. Expose provenance, uncertainty and approval in existing library screens; test the public interface across both adapters.

## Non-goals

No invented material/equipment catalog, automatic web scraping, machine certification or autonomous machine actuation.
No new kernel/geometry operations, separate library remote, paid provider calls or model-visible account/billing actions.

## Migration and failure handling

WP0 generates version/provenance migrations; existing rows get explicit legacy/unverified provenance, not fabricated manufacturer sources.
Do not infer private ownership from public visibility; ambiguous rows remain non-writable until assigned by an authorized user.
Decode legacy JSON/versioned units explicitly; malformed records fail typed validation or appear unavailable, never as safe defaults.
Conflicts preserve the previous version; dependency invalidation failure rolls back the associated edit transaction.
Deletion preserves required audit/version references or is refused; lost delivery reconciles a committed receipt instead of duplicating writes.

## Tests

Use explicit Effect Layers, offline catalogue/HTTP fixtures and `:memory:` SQLite upgrade tests through the library interface.
Cover invalid geometry/RPM/feed, incompatible units, missing holder/machine evidence and recommendation clamps with reasons.
Assert public/read-only/non-owner writes are denied, destructive approval is native and stale edits preserve prior versions.
Assert library changes invalidate dependent evidence and VCS blobs match the recorded revision; legacy rows remain readable but unverified.

## Verify

Manifests confirm workspace `typecheck`, API `generate:check` and root `db:generate`; use Monitor during implementation.
Only WP0 runs `bun --no-env-file run db:generate` when schema changes; generated output is reviewed, not hand-edited.

```sh
bun --no-env-file run --filter @cadcamfun/db typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/desktop typecheck
bun --no-env-file run --filter @cadcamfun/api generate:check
bun --no-env-file test packages/db packages/api packages/ai apps/sidecar/test apps/desktop/test
git diff --check
```

## Acceptance checklist

- [ ] Versioned library records preserve units, source evidence and explicit unknowns.
- [ ] Resource/native authority and stale-version tests protect every write across both adapters.
- [ ] Deterministic recommendations reject or clamp unsupported inputs with attributable reasons.
- [ ] Generated upgrade, dependency invalidation and VCS consistency fixtures pass.
- [ ] RM-05 completes only after its gates and required contract-first owner amendments pass.

## Change log

- 2026-10-12: specified grounded engineering evidence, authorized versioned edits and deterministic recommendation limits; implementation pending.
