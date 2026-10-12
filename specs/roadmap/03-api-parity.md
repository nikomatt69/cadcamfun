# RM-03 — HTTP contract parity (remaining families)

Status: **pending**. May run in parallel with RM-02 on **disjoint** files. Design: `11-api-parity-brief.md`, `specs/api-inventory.md`, [AI-02](../ai/02-setup-and-domain-parity.md), [spec 28](../28-native-ai-architecture.md). Owners: WP3 `packages/api`, WP4 `apps/sidecar`; WP0 `packages/db/src/schema.ts` and generated migration directory for document revisions/action receipts only, with DB contract changes before generation. AI execution integration uses RM-01; no duplicate dispatcher.

## Problem

Measured: **121/195** legacy route files in the contract (`bun run --filter @cadcamfun/api coverage`, 2026-10-11). Missing families (abbrev.): remaining `ai/*` proxies and code-interpreter, `components/*` (list/comments/versions/storage/library), `conversation/*`, marketplace + Polar webhook, MCP extras, `ml/*`, nested `organizations/:id/{conversations,invite,members,projects}`, invitations accept, `toolpaths/export-import`, websocket, og/graphql-playground/route.

Each family is one **module**: HttpApi group **interface** (path, method, Schema, status, `{ message }` body) + sidecar handler **adapter**. Do not invent a new envelope. Cloud deps stay Effect services with local/no-op defaults (`00-overview.md` §6).

## Effect v4

Copy the worked example in `11-api-parity-brief.md`: `HttpApiGroup`, `CurrentUser`, `Database.query` in a repo service, `Effect.catchTag("DatabaseError", …)`. Errors from `@cadcamfun/api`. Config only via sidecar `config.ts`.

## Deliverables (order inside this step)

Port one family per change, in this order (user-visible CAD/CAM first; cloud last):

1. `components/*` (library parts the desktop already screens)
2. `toolpaths/export-import`
3. Nested `organizations/:id/*` + `invitations/:token/accept` + `conversation/*`
4. Remaining `auth` leftovers listed in `11-api-parity-brief.md` (get-session, signin-direct, signup, verify-magic-link)
5. Marketplace + Polar webhook (local `PaymentProvider`)
6. Remaining `analytics/*`, `ml/*`
7. MCP extras and AI proxies — **only** as typed no-op/local adapters unless `27` says the action lives on the catalogue (do not resurrect MCP as a fourth dispatch; spec 27 rejected MCP)
8. Static leftovers (`/api/og*`, `/api/route`, graphql-playground)

Append Done/Deviations to `11-api-parity-brief.md`. Do not tick `api-inventory.md`.

Native AI consistency amendment: before RM-04 consumes receipts, add authoritative document revisions, expected-revision writes, idempotent invocation receipts, typed conflict errors and derived-artifact invalidation. HTTP and AI call the same application execute, not each other. Authorize document and write rights; validate a batch before atomic commit. Generated migration preserves legacy documents and explicit unit versions. Verify stale/duplicate/conflicting writes, cancellation before commit, and artifact/NC-hash identity. WP0 persistence tests are part of this gate, not deferred to the UI.

Persistence sequencing: this revision/receipt module and WP0 migration also precede RM-02 persisted setup integration and RM-09 precision acceptance. RM-03 has no dependency on RM-02: test the persistence interface with document/setup-shaped fixtures without requiring its planner, generated programs or desktop consumers. RM-02 integrates only after RM-03 is done. Parallel pure/stateless RM-02 work must use disjoint files; coordinate shared contract/handler files rather than assuming different HTTP groups are sufficient.

## Out of scope

- Solid page ports (RM-04).
- Action catalogue (RM-01).

## Verify

```bash
bun --no-env-file run --filter @cadcamfun/api coverage
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file test packages/api apps/sidecar
```

Gate: coverage rises per family; `--strict` is green only when 195/195. Handler parity is HTTP tests, not the coverage script.

## Change log

- v1: remaining 74 route files, CAD/CAM-adjacent families first.
- 2026-10-12: scoped AI-02 revision/receipt prerequisite for RM-04 and WP0 generated migration ownership; runtime implementation pending.
- 2026-10-12: made RM-03 the independent persistence prerequisite for RM-02 consumers and RM-09 acceptance, without a reverse RM-02 dependency. Documentation only; no gate claimed.
