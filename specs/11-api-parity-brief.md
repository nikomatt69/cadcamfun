# API parity brief (for agents porting route groups)

Goal: every legacy route in `specs/api-inventory.md` exists in the sidecar with the **same path, methods, request/response JSON, status codes and `{ message }` error bodies** as `.reference/src/pages/api/**`. Read each legacy handler fully before porting it; port its behaviour, including permission rules, validation order, defaults and messages.

## The worked example to copy (read these first)

- Contract: `packages/api/src/{errors,auth,projects}.ts`, root `packages/api/src/index.ts`.
- Server: `apps/sidecar/src/repos/project-repo.ts` (Drizzle queries), `src/http/projects.ts` (handlers, legacy permission checks, `Effect.catchTag("DatabaseError", ...)` → 500 with the legacy message), `src/layers.ts` (registration), `src/config.ts`, `src/services/local-profile.ts`.
- Tests: `apps/sidecar/test/{helpers,projects.test}.ts` (in-process, in-memory DB, auth header, asserts status + legacy messages).
- Effect rc.112 docs: `packages/db/node_modules/effect/ai-docs/src/51_http-server/` and `01_effect/`. HttpApi lives in `effect/unstable/httpapi`.

## Mapping rules

| Legacy | v6 |
| --- | --- |
| `requireAuth(req,res)` / `withApiAuth` | `HttpApiGroup(...).middleware(Authorization)` + `const user = yield* CurrentUser` (always the local profile) |
| `prisma.x.findMany/…` | Drizzle via `Database.query(op, db => …)` in a repo service; table `xTable` from `@cadcamfun/db` (same table/column names) |
| `res.status(N).json(body)` | endpoint `success` Schema (+ `httpApiStatus` annotation when not 200) |
| `res.status(4xx/5xx).json({message})` | `BadRequest/Forbidden/NotFound/MethodNotAllowed/Conflict/InternalError` from `@cadcamfun/api` (add a new tagged error with `{ message }` only if another status is needed) |
| `req.query` / `req.body` | `query` / `payload` Schemas; keep fields optional when the legacy handler tolerated absence and validates manually (so the legacy message is returned, not a generic 422) |
| Dates in JSON | ISO strings (`toISOString()`) |
| `include: {...}` relations | explicit batched queries as in `hydrate()` in project-repo.ts |
| Cloud-dependent logic (Stripe, Polar, email, OAuth, push) | an Effect service with a local default (no-op / local log); HTTP contract unchanged |
| `withSubscription` plan gating | reads the local `Subscription` row; unknown ⇒ treat as FREE like legacy |
| Next-only routes (`/api/og*`, `/api/route`, `/api/graphql-playground`, `bootstrap.js`) | equivalent static response with the same content type |

## Shared building blocks (already written — reuse, do not duplicate)

- `apps/sidecar/src/repos/access.ts`: `orgIdsOf`, `isOrgMember`, `hasOrgWriteAccess` (ADMIN/MANAGER), `userRef`, `orgRef` (batched owner/organization embeds).
- `apps/sidecar/src/repos/import-loop.ts`: `importLoop(items, mode, ops)` — the legacy create/update/skip export-import POST loop; `ImportResults`.
- `apps/sidecar/src/http/entity-io.ts`: `exportEntities(io)` / `importEntities(io)` — the full export-import GET (json/zip/bucket) and POST flow for any entity via an `EntityIO` description; `internal` maps `DatabaseError`/`StorageError` to the envelope 500. Usage example: `http/tools-storage.ts` (and `materials-storage.ts`).
- `apps/sidecar/src/services/storage.ts`: `StorageService` (local replacement for the S3/4everland bucket under `<dataDir>/storage`): `generateObjectPath`, `upload`, `download`, `delete`, `signedUrl` (file:// URL), `listByPrefix`.
- `packages/api/src/errors.ts`: plain errors (`BadRequest`…`InternalError`, body `{ message }`) and **envelope** errors (`EnvBadRequest`…`EnvInternal`, body `{ success:false, message, errors }`) + `envErr(Cls, msg)`, `Envelope(schema)`, `ok(data, message)` for routes that use the legacy `sendSuccessResponse/sendErrorResponse` helpers (`src/lib/api/helpers.ts`). Pick whichever format the legacy route used.
- Test harness: `apps/sidecar/test/helpers.ts` (`makeApp()` → `call(path, { method, json, auth, headers })` returning `{ status, body, headers, bytes }`).
- Gotcha: HttpApi handler return types must include every error the endpoint can fail with — declare `InternalError`/`EnvInternal` on endpoints whose handlers map `DatabaseError`.
- Handlers needing extra services (e.g. `StorageService`) must `yield*` them in the group builder and `Effect.provideService` them into per-request effects (see `tools-storage.ts`).

## Ownership and shared files

- You own, for each group `<g>` you are assigned: `packages/api/src/groups/<g>.ts`, `apps/sidecar/src/http/<g>.ts`, `apps/sidecar/src/repos/<g>-repo.ts` (and services under `apps/sidecar/src/services/<g>-*.ts`), `apps/sidecar/test/<g>.test.ts`.
- Shared files you must touch with **small `Edit` calls only** (re-read the file immediately before editing; other agents edit them concurrently; never rewrite them with Write): `packages/api/src/index.ts` (export your group + `.add(YourGroup.middleware(Authorization))`) and `apps/sidecar/src/layers.ts` (add your handlers to `Handlers`, repos/services to `Services`). Do not edit anything else outside your files. New dependencies: avoid; if essential add to the owning `package.json` and run `bun install` from the repo root (retry if busy).
- Do not edit `packages/db` schema unless a legacy route truly needs a column that doesn't exist; if so add it, run `bun run db:generate`, and note it in your report.
- Update the checkbox column in `specs/api-inventory.md`? No — instead append a short section for your groups to the bottom of `specs/11-api-parity-brief.md` ("Done: <routes>; Deviations: …").

## Definition of done

- Every route/method of your groups implemented (or listed under "Deviations" with a reason).
- `cd packages/api && bunx tsc -p tsconfig.json` and `cd apps/sidecar && bunx tsc -p tsconfig.json` exit 0.
- `bun test apps/sidecar` passes; per group, tests cover happy path, validation errors, permission failures and not-found with the exact legacy messages.
- English only. Do not commit. Never read `.env*` files.

## Progress log (agents append below)

### Done so far (by the lead; tests in `apps/sidecar/test/`)

- `/api/health` (check only), `/api/projects` + `/api/projects/:id` (GET/POST/PUT/DELETE)
- `/api/materials`, `/api/materials/:id`, `/api/materials/:id/storage`, `/api/materials/export-import`
- `/api/tools`, `/api/tools/:id`, `/api/tools/:id/storage`, `/api/tools/export-import`, `/api/tools/:id/export-import`
- Deviations: list `search` narrows the visible set (legacy replaced the visibility filter, leaking others' rows); material create/import organisation membership is checked for the current user (legacy matched any member); error bodies carry an extra `_tag` field.
