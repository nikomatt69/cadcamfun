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
- `cd packages/api && bun check -p tsconfig.json` and `cd apps/sidecar && bun check -p tsconfig.json` exit 0.
- `bun test apps/sidecar` passes; per group, tests cover happy path, validation errors, permission failures and not-found with the exact legacy messages.
- English only. Do not commit. Never read `.env*` files.

## Progress log (agents append below)

### Done so far (by the lead; tests in `apps/sidecar/test/`)

- `/api/health` (check only), `/api/projects` + `/api/projects/:id` (GET/POST/PUT/DELETE)
- `/api/materials`, `/api/materials/:id`, `/api/materials/:id/storage`, `/api/materials/export-import`
- `/api/tools`, `/api/tools/:id`, `/api/tools/:id/storage`, `/api/tools/export-import`, `/api/tools/:id/export-import`
- Deviations: list `search` narrows the visible set (legacy replaced the visibility filter, leaking others' rows); material create/import organisation membership is checked for the current user (legacy matched any member); error bodies carry an extra `_tag` field.

### Integration batch (analytics, waitlist, auth, files, plugins)

- Done: `GET /api/analytics/system-metrics`, `POST /api/analytics/track`, `POST /api/waitlist`, `POST /api/auth/{forgot-password,reset-password,send-magic-link,send-verification-email,verify-email,signout,passkey-register}`, `POST /api/upload`, `GET /api/download`, all 14 `/api/plugins/*` routes.
- Deviations: waitlist is kept in `<dataDir>/waitlist.json`; upload returns a `file://` URL from `StorageService` instead of a 4everland pre-signed URL (and needs an existing conversation participant row); download serves `<dataDir>/downloads/cadcamfun-app.zip`; plugin deviations are listed in `09-plugins.md`; error bodies carry an extra `_tag`.
- Not yet: `GET /api/auth/get-session`, `signin-direct`, `signup`, `test-direct-create`, `verify-magic-link`, the remaining `analytics/*` routes, and every family without a contract (see `bun run --filter @cadcamfun/api coverage --missing`).

### RM-03 step 1: `components/*` versions and comments (2026-11-03)

- Done: `GET,POST /api/components/:id/versions`, `GET /api/components/:id/versions/:versionId`, `POST /api/components/:id/versions/restore`, `GET,POST /api/components/:id/comments`, `PUT,DELETE /api/components/:id/comments/:commentId`. Coverage 121 → 126 of 184. Tests: `apps/sidecar/test/components.test.ts`.
- Not yet in this family: `GET,POST /api/components`, `library`, `details`, `analysis`, `relationships`, `storage`, `export-import`.
- Deviations: `restore` takes the component from the path and only `versionId` from the body (a body `id` is ignored: the generated clients cannot carry the same field in path and payload, and the path cannot disagree with itself); the version of another component answers 404 `Version not found`. Restore runs in one transaction (the "Auto-saved before version restore" version and the data update commit together; legacy did two writes). Comment and version writes go through `commitMutation`, so they leave a mutation record like every other write. Error bodies carry the extra `_tag`.

### RM-03 step 1b: `components` index, details, relationships (2026-11-03)

- Done: `GET,POST /api/components`, `GET /api/components/:id/details`, `GET /api/components/:id/relationships`. Coverage 126 → 129. Tests: `apps/sidecar/test/components.test.ts`.
- Not yet in this family: `library` (static JSON catalogue, not ported), `analysis`, `storage`, `export-import`.
- Deviations (all close legacy leaks): the index `search` narrows the visible set instead of replacing it, and `public=true` is accepted and ignored (the data-isolation rule: `isPublic` admits nobody else; `versions`, `comments`, `relationships` follow it too, where legacy let any reader see public components); `relationships` only walks components the user can see (legacy scanned every component of every user); `details.usageStats.usedInDrawings` counts drawings of the same project whose data mentions the component id (legacy counted every drawing in the database); the index POST type defaults to `custom` as legacy does.

### RM-03 step 1c: `components` storage and export-import (2026-11-03)

- Done: `GET,POST,DELETE /api/components/:id/storage`, `GET,POST /api/components/export-import` (both live in the `components` group, so no new group registration). Coverage 129 → 131. Tests: `apps/sidecar/test/components.test.ts`.
- Not yet in this family: `library` (static JSON catalogue, not ported), `analysis`.
- Deviations: storage answers 404 (not 403) for a component the user cannot see, which no longer reveals that it exists; storage delete removes only `storagePath` from the data (legacy wrote `{ ...component.data?.toString, storagePath: null }` and lost the rest); the legacy membership check compared the organisation member with the *component id*, so organisation members never passed, the owner check now also admits them; export without `ids` lists every visible component (legacy listed bucket objects of the user); the export JSON `metadata` carries `projectName` as legacy did. Import is project-scoped and shares `importLoop` with materials and tools; `export` shares `exportEntities` through the narrower `EntityExportIO`.

### RM-03 step 2: `toolpaths/export-import` (2026-11-03)

- Done: `GET,POST /api/toolpaths/export-import` (in the `toolpathExtras` group). Coverage 131 → 132. Tests: `apps/sidecar/test/toolpath-extras.test.ts`.
- Deviations: export without `ids` lists the toolpaths the user created, with `ids` those created by the user or in a project of one of their organisations (public toolpaths of others are not exported); `format=bucket` is refused as legacy did; import also accepts `importMode=skip` (legacy answered "Unsupported import mode: skip" for toolpaths only) and shares `importLoop` with materials, tools and components; the stranger gets 404 on every route, never another user's rows.
- Left open in step 1 on purpose: `components/library` (static catalogue, needs its data ported) and `components/:id/analysis` (heuristic scores with no engineering basis; port only if the desktop still shows them).

### RM-03 step 3a: nested `organizations/:id/{members,invite,projects}` (2026-11-03)

- Done: `GET,PUT,DELETE /api/organizations/:id/members`, `POST /api/organizations/:id/invite`, `GET,POST /api/organizations/:id/projects` (in the `organizations` group). Coverage 132 → 135. First dedicated HTTP tests of the organisations family: `apps/sidecar/test/organizations.test.ts`.
- Deviations: the last Admin can no longer demote *or* remove themselves (legacy only blocked removal); an unknown `role` is a 400 (legacy let the database fail with a 500); the invite address is trimmed and lower-cased, as accounts are; no mail server exists, so the response carries `inviteUrl` (`/invitations/<token>`, 64 hex characters, valid 7 days) for the inviter to hand over; a renewed invitation answers 201 like a new one (the generated clients take one success schema per endpoint), the `message` tells them apart; the organisation project list also carries `organization` (the shared `ProjectWithRelations` shape).
- Still open in step 3: `organizations/:id/conversations`, `invitations/:token/accept`, `conversation/:id` (GET, PATCH), `conversation/:id/messages`, `conversation/:id/read`.

### RM-03 step 3b: conversations, messages, invitation accept (2026-11-03)

- Done: `GET,POST /api/organizations/:id/conversations`, `GET,PATCH /api/conversation/:id`, `GET,POST /api/conversation/:id/messages`, `POST /api/conversation/:id/read`, `POST /api/invitations/:token/accept`. Coverage 135 → 141 (the two legacy files for `/api/conversation/:id` are one route here, the richer `[id].ts`). New group `conversations` (`packages/api/src/groups/conversations.ts`, `ConversationRepo`, `http/conversations.ts`); accept lives in the `organizations` group. Tests: `apps/sidecar/test/conversations.test.ts`, `organizations.test.ts`.
- Deviations: creating a chat with nobody valid (no other member of the organisation among `participantIds`) is a 400 (legacy created a chat with only the creator); a direct chat that already exists answers 201 like a new one (one success schema per endpoint); page and limit are bounded (`limit` at most 100); messages are ordered by time with ties broken by insertion order, and the cursor must belong to the conversation; sending a message creates `NEW_MESSAGE` notifications for the other participants through the existing `NotificationService.newMessage` (nothing called it before); a conversation id the caller does not take part in answers 403, existing or not, as legacy did.
- With this the nested organisation routes of RM-03 step 3 are complete. Still open in RM-03: step 4 (`auth` leftovers), step 5 (`analytics/*`, `ml/*`), 6 (MCP extras and AI proxies as typed local adapters), 7 (static leftovers), and the revision/receipt consolidation.

### RM-03 steps 4-7 and the coverage gate (2026-11-03)

- Step 4 (`auth` leftovers) and step 5 (`analytics/*`) were already in the contract; the inventory had no open row for them. `components/library` and `components/:id/analysis` are now served (`components-library.json` is a snapshot like `toolpaths-library.json`; `analysis` keeps the legacy formulas, with the memory/render/load figures documented as size-based estimates, and `usage` limited to the components the caller can see, with real project names).
- Steps 6 and 7 are **decided, not ported**: 41 legacy route files (AI provider proxies and code interpreter, the MCP dispatch family, `ml/*`, `websocket`, `og*`, `route`, `graphql-playground`, `test-webauthn`) are listed with a reason each in `packages/api/scripts/accepted-gaps.ts`. `bun run coverage` prints covered, accepted and open apart, and `--strict` now fails only on a route that is neither covered nor accepted (a test checks that every accepted route is a row of the inventory). Today: 143 covered, 41 accepted, 0 open, `--strict` green.
- Deviations: the legacy `components/library` required an `id` query parameter the route never had and so always answered 400; it is served without it.
- What RM-03 still owes: the revision / receipt consolidation (expected-revision writes, idempotent receipts, typed conflicts) before RM-02 persistence and RM-04.

### RM-03 revision consolidation, slice 1: components (2026-11-03)

- `PUT /api/components/:id` and `POST /api/components/:id/versions/restore` take an optional `baseUpdatedAt`: the write happens only while the component's `updatedAt` still equals it (check and write are one `commitMutation` transaction); otherwise 409 `Conflict`, nothing written, no receipt, and a restore adds no "Auto-saved before version restore" version. Without it the write stays unconditional (legacy). Same contract as drawings and toolpaths. Tests: `apps/sidecar/test/components.test.ts` ("expected-revision writes").
