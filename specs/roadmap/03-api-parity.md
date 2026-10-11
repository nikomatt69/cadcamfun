# RM-03 — HTTP contract parity (remaining families)

Status: **pending**. May run in parallel with RM-02 on **disjoint** files. Design: `11-api-parity-brief.md`, `specs/api-inventory.md`. Owners: WP3 `packages/api`, WP4 `apps/sidecar`.

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

## Out of scope

- Solid page ports (RM-04).
- Action catalogue (RM-01).

## Verify

```bash
bun run --filter @cadcamfun/api coverage
bunx tsc -p packages/api/tsconfig.json
bunx tsc -p apps/sidecar/tsconfig.json
bun test packages/api apps/sidecar
```

Gate: coverage rises per family; `--strict` is green only when 195/195. Handler parity is HTTP tests, not the coverage script.

## Change log

- v1: remaining 74 route files, CAD/CAM-adjacent families first.
