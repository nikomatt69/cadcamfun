# RM-05 — Library write + versioning

Status: **pending**. Depends on: RM-01 (tool ids), WP0. Design: `18-library-and-knowledge.md`, `20-integral-roadmap.md` Phase 4. Owners: WP0 `packages/db`, WP3, WP4, WP8, WP6 library screens.

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
