# RM-05 — Library write + versioning

Status: **in progress** (2026-11-03: version column, history table and read routes built; see the change log). Depends on: RM-01 (tool ids), WP0. Design: `18-library-and-knowledge.md`, `20-integral-roadmap.md` Phase 4. Owners: WP0 `packages/db`, WP3, WP4, WP8, WP6 library screens.

## Problem

`Material` / `Tool` / `MachineConfig` / `Component` tables exist; lookup tools exist; upserts and version columns do not (`21` §16.8 pending). Writes today would bypass history. Deepen the **library module**: one interface (list/get/upsert/delete + version) used by HTTP, VCS snapshot, and `library_edit` actions.

## Effect v4

- Schema change: `schema.ts` → `bun run db:generate` → commit SQL. Never hand-edit generated SQL.
- Repos use `Database.query`. Decode JSON columns with Schema before return.
- Destructive actions require `confirm: true` on the AI adapter. Person UI is the source of truth for confirm.

## Deliverables

1. Columns `version`, `previousVersionId`, `libraryProjectId` on Material/Tool/MachineConfig (`20` §4.1). Upgrade test round-trips.
2. HTTP group `/api/library/{materials,tools,machines,components}/**` or extend existing entity groups — match legacy paths where they exist (`/api/materials`, `/api/tools`, …). Do not create a second URL for the same row.
3. Catalogue actions `library_edit.upsert_*` / `set_default` / `delete` (RM-01 ids).
4. VCS tree already snapshots library JSON; keep that as the canonical version blob. AI cannot push GitHub (`20` §4.4) — person-only desktop.
5. WP6 screens edit through the same HTTP interface.

## Out of scope

- GitHub library remote if transport already covers project push; only add `library/` paths if missing.
- Parametric fillet features (RM-09).

## Verify

```bash
bun test packages/db
bun run db:generate   # only if schema changed; commit output
bun test apps/sidecar packages/ai
```

## Change log

- 2026-10-12: [AI-04](../ai/04-engineering-libraries.md) specifies engineering provenance, unit/limit validation, write authority and derived-evidence invalidation within existing owners; no invented shop equipment or unverified machining recommendations. Implementation pending.

- v1: versioned library writes behind one module.

- 2026-11-03: **deliverable 1 built, in the form the code needed.** Material, Tool and MachineConfig get `version` (1 when created, +1 per save); a new table `LibraryRowVersion` (`kind`, `rowId`, `version`, `data`, `changedBy`, indexed by kind and row) keeps the whole previous row of every save, written in the same transaction as the save (`apps/sidecar/src/repos/library-history.ts`), on every path that replaces a row: `PUT`, the compare-and-set `updateIfCurrent`, the assistant's `library_edit.upsert_*` and the export-import `update` mode. A refused (stale) save keeps nothing and does not move the version. `changedBy` is the person who saved, or the actor of the governed assistant command. Reads: `GET /api/{materials,tools,machine-configs}/:id/versions` (newest first, same visibility as the row). `previousVersionId` and `libraryProjectId` of the original deliverable were not added: the history table carries the chain (`rowId` + `version`) and the row stays one row per id, so no second URL or id per version exists; `libraryProjectId` has no consumer yet. The migration (`20261103180507_sticky_sandman`) is additive and generated; `packages/db/src/library-version-migration.test.ts` upgrades a database that holds legacy rows and checks they come out at version 1, untouched, with an empty history. Tests: `apps/sidecar/test/expected-revision.test.ts` (history), `ai-admission.test.ts` (an assistant replace keeps the old row). Open in this step: restore-from-history action, `library_edit` actions for `set_default` on versions, desktop screens (deliverable 5), generic `library_item` and component history, `libraryProjectId`.

