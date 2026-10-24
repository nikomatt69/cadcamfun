# WP3 + WP4 — Shared API contract and sidecar server

## Additive assistant evidence (2026-10-24)

WP4's owner-requested print integration preserves the existing kernel `print` report in
`cam.manufacture` results and printer profiles in configured-machine discovery. Printer
stock notes describe a build plate and deposited filament rather than inferred milling
stock. WP8 owns the existing material/machine discovery action and its print guidance
(spec 08). These are additive fields within existing record-valued tool results; HTTP
request/response schemas and action identities stay unchanged. Verify through the real
tool catalogue, project handlers and kernel worker, including blocked releases.

## Exact-replay diagnostic preservation (2026-10-22)

Spec 33 K0 authorizes WP3 `packages/api/src/ai-action-results.ts` and its tests to add optional string-array warnings to
the existing parametric validation/exact result contracts, plus the existing exact-export fields already returned by WP8.
WP8 forwards core recovery warnings through these contracts; historical results lacking warnings remain decodable. No new
route, storage schema or handler ownership is introduced. Regenerate the web API reference before checks and completion.

K1 additionally owns the descriptions in `packages/api/src/ai-parametric.ts`: an ellipse/curve shape preserves nominal
geometry; its legacy `segments`/`divisions` fields control construction references rather than the exact profile boundary.
No input schema fields or generated client signatures change.

K7 additionally owns an optional `name` on the `pushpull` and `draft` features in `packages/api/src/ai-parametric.ts`. It is
the exact face name. Older histories without it stay decodable. No new route. Regenerate the web API reference.

K4 additionally owns `apps/sidecar/test/cam-kernel.test.ts` for the shared optional multiaxis `mode` field consumed from
WP2's operation schema by both manufacturing request schemas. Verify validation and the resolved mode/actual NC across
HTTP; retain existing routes and handlers. The generated web API reference must include the additive field.

## Subscription provider connections (2026-10-16)

Owner clarification: also provide OpenCode Zen (`opencode`) and Go (`opencode-go`) account-key connections. Their documented account/subscription access uses API keys, not an invented OAuth grant. WP8 owns explicit provider fallbacks and native session headers; WP6 owns console links and key guidance. Preserve models.dev per-model protocol routing. Reference: https://opencode.ai/v2/docs/console/go/ and https://opencode.ai/v2/docs/console/models/.

Integration authorized by 08-ai.md: application-only POST /api/ai/oauth/authorize takes provider (openai or xai) and returns attemptId, url, method and instructions. POST /api/ai/oauth/complete takes provider, attemptId and optional code, delegates to native nikcli and returns AI status. External bridge grants cannot manage provider credentials. Regenerate both clients. Status: implemented; typechecks and targeted provider/UI regressions pass.

## Assistant extensions (2026-10-16)

Owner-requested assistant extensions: add typed AI endpoints for project-owned MCP configuration/status and local Worker plugin installation/enablement. Reuse the native nikcli MCP client and existing AiPlugins host; reject external bridge grants for extension management. Regenerate clients. Status: implemented and verified at source-runtime level.

## Assistant control integration (2026-10-10)

See `24-assistant-control-flow.md`: WP3 adds schema-first agents/session-control endpoints and optional chat role/mode/model variant; WP4 delegates controls to WP8's session-bound service. Generate both clients after changes. Status: in progress. Change log: 2026-10-10 — registered the assistant control contract before implementation.

## AI lifecycle alignment (2026-10-09)

See `23-ai-runtime-architecture.md`. WP4's session-removal handler delegates to WP8's `AiService.removeSession(sessionId, projectId?)`, which resolves client/host identity and joins children before parent removal. The HTTP request/reply schemas remain unchanged. IPC auditing also covers bounded startup/shutdown and plugin RPC failure settlement.

Status: partial. Projects, materials, tools, machine configs, drawings, components, toolpaths, library, the legacy public health probe and the native system routes are implemented end to end (contract, handler, persistence, HTTP tests, real-process lifecycle tests). Production costs, organizations, notifications, plugins (legacy browser-plugin routes), files, analytics (`system-metrics`, `track`), waitlist and the seven contract-covered auth routes are also served with HTTP tests. Contract coverage is measured by `bun run --filter @cadcamfun/api coverage`, which measures *contract* coverage only and never counts a declared route as implemented on its own, so handler parity needs its own HTTP tests. About 15% of the 195 legacy route files are served.

- **WP3** owns `packages/api` (`@cadcamfun/api`): schema-first `HttpApi` definitions and shared domain Schemas. Contains **no server code and no DB code**, so the UI can import it for the typed client without pulling the server in.
- **WP4** owns `apps/sidecar` (`@cadcamfun/sidecar`): handlers, repositories, wiring, config, entrypoint, compile script.

Effect reference: `node_modules/effect/ai-docs/src/51_http-server/` (read `10_basics.ts` and the `fixtures/` folder; it is exactly this pattern). Imports: `effect/http`, `effect/http-api`, `@effect/platform-bun` for the Bun server.

## 1. Process model

```
Tauri (Rust)  ──spawn──►  sidecar (Bun-compiled binary)  ◄──HTTP + Bearer token──  webview (React)
     │  stdout: {"event":"ready","port":53211}                      ▲
     └── passes token via env CADCAMFUN_TOKEN, reads port from stdout, hands both to the webview via a Tauri command
```

- Sidecar binds **127.0.0.1 only**, port `0` (OS-assigned), prints one JSON line `{"event":"ready","port":N}` to stdout after migrations succeeded and the server is listening. Failure to start prints `{"event":"error","message":"…"}` and exits non-zero.
- Every request requires `Authorization: Bearer <token>`; token is a random 32-byte value generated by the Rust shell per launch and provided via `CADCAMFUN_TOKEN`. CORS allows only the Tauri webview origin(s) (`tauri://localhost`, `http://tauri.localhost`, and the Vite dev origin in dev builds).
- Sidecar exits when stdin closes (shell died) and on `SIGTERM` (graceful: finish requests, close DB via layer finalisers).
- Configuration comes from env, read once in `apps/sidecar/src/config.ts`: `CADCAMFUN_TOKEN` (required), `CADCAMFUN_DATA_DIR` (required; DB at `<dir>/cadcamfun.db`), `CADCAMFUN_MIGRATIONS_DIR`, `CADCAMFUN_LOG_LEVEL`, AI keys are **not** env — they live in the OS keychain via the shell (see `07-tauri-shell.md`); the UI pushes them to the sidecar at boot with `PUT /ai/credentials` (also saved to `<data dir>/ai/credentials.json`, owner-only, see `08-ai.md` §1).

## 2. API contract (`packages/api`) — parity with the legacy API

**Hard requirement:** every route in `specs/api-inventory.md` (184 files under `/api/*`) is implemented with the same path, methods, request/response JSON shapes and status codes as the legacy Next.js handlers in `.reference/src/pages/api`. Read each legacy handler before implementing it; the inventory lists the Prisma models each touches (same-named Drizzle tables). Routes the legacy code gated with `withApiAuth`/`withSubscription` keep that gating (v6 maps the local profile to an always-valid session; plan gating reads the local `Subscription` row). Group the routes into one `HttpApiGroup` per top-level segment (`ai`, `analytics`, `auth`, `components`, `drawings`, `library`, `machine-configs`, `materials`, `mcp`, `notifications`, `organizations`, `plugins`, `production-costs`, `projects`, `toolpaths`, `tools`, `user`, …) in separate files under `packages/api/src/groups/`. Streaming routes (`/api/ai/*stream*`, `/api/mcp*`, `/api/websocket`) keep their wire format (SSE/WebSocket). Webhook and cron routes (`/api/webhooks/stripe`, `/api/cron/*`) are implemented with signature verification stubs behind services. Next.js-only routes (`/api/og*`, `/api/route`, `/api/graphql-playground`) are served as static/HTML equivalents.

The summary table below is the *minimum* v6.0 core; the inventory is authoritative where they differ.

One `HttpApi` named `Api` composed of groups. All payloads are Schemas; all errors are `Schema.TaggedError` with HTTP status annotations: `NotFound` (404), `Validation` (422), `Conflict` (409), `Unauthorized` (401), `Internal` (500).

| Group | Endpoints (REST, JSON) | Backing tables |
| --- | --- | --- |
| `system` | `GET /health`, `GET /version` | — |
| `projects` | `GET /projects`, `POST /projects`, `GET/PATCH/DELETE /projects/:id` | `Project` |
| `drawings` | `GET /projects/:id/drawings`, `POST …`, `GET/PUT/DELETE /drawings/:id`, `GET /drawings/:id/versions` | `Drawing`, `DrawingVersion` |
| `components` | CRUD + `GET /components/:id/versions` | `Component`, `ComponentVersion` |
| `toolpaths` | CRUD, `POST /toolpaths/:id/generate` (runs WP2 pipeline), `POST /toolpaths/:id/gcode` (`{ post, options }` → `{ gcode, stats }`) | `Toolpath`, `ToolpathVersion` |
| `materials`, `tools`, `machine-configs` | CRUD | `Material`, `Tool`, `MachineConfig` |
| `library` | CRUD + import/export JSON | `LibraryItem` |
| `costs` | `POST /costs/estimate`, CRUD for cost settings and estimates | `CostSettings`, `ProductionCostEstimate`, `ToolWearCost`, `MaterialCost`, `OperationCost` |
| `files` | `POST /files/import` (DXF/STL/G-code), `POST /files/export` | `FileUpload` (metadata only; blobs on disk in `<dataDir>/files/`) |
| `ai` | `PUT /ai/credentials` (in-memory), `GET /ai/status`, `GET /ai/models`, `POST /ai/chat` (SSE stream; optional `attachments`), `POST /ai/sessions/remove`, `POST /ai/sessions/state`, `GET/PUT /ai/skills`, `DELETE /ai/skills/:name` (user-loadable skills), `POST /ai/analyze-gcode`, `POST /ai/generate-toolpath` | `AIAnalysisLog` |
| `plugins` | list/install/enable/disable/uninstall, per-plugin config | `PluginRegistryEntry`, `PluginConfiguration` |
| `settings` | `GET/PUT /settings` (units, theme, locale, post defaults) | JSON in a local settings table or file — decide in WP4, document here |

Rules:

- Collection endpoints take `?limit&cursor&q`; cursor pagination with opaque cursors.
- Optimistic concurrency: updates send `If-Match: <updatedAt ISO>`; mismatch → `Conflict`.
- Drawing/toolpath content is stored as JSON validated by the **WP1/WP2 schemas**, with `schemaVersion` and write-through version snapshots (`DrawingVersion`, `ToolpathVersion`) capped at the 50 most recent per entity.
- Streaming (`ai/chat`) is Server-Sent Events with typed events (`delta`, `tool_call`, `tool_result`, `done`, `error`).
- The AI surface follows nikcli's agent/tool architecture for CAD/CAM work: `/ai/chat/stream` runs the project-scoped agent and its registered CAD/CAM tools; stateless workflow endpoints return advice and never mutate drawings, components or machining operations. Workflow contracts and handlers are grouped by domain so providers, sessions, skills, CAD and CAM can evolve independently.
- `KvStore` is a sidecar repository over WP0's `LocalKeyValue` Drizzle table using `Database.query`. It persists AI context, assistant memory and local preferences across restarts. Credentials remain in the separate owner-only credentials file.

Deliverable of WP3: the `Api` value, all request/response/error Schemas, plus `ApiClient` helper (`HttpApiClient.make(Api, …)` wrapped as a `Context.Service`) with `ApiClient.layer({ baseUrl, token })`. Tests: encode/decode round-trip for every Schema; a contract test that serialises `Api` to OpenAPI and snapshots it.

## 3. Sidecar structure (WP4)

```
apps/sidecar/src/
  main.ts            entrypoint: build Layer graph, print ready line, Layer.launch
  config.ts          Effect Config → Config service
  http/              one file per group: HttpApiBuilder.group(Api, "projects", …)
  repos/             one repository service per aggregate (ProjectRepo, DrawingRepo, …), only place that uses Database.query
  services/          domain services (ToolpathService = WP2 pipeline, CostService, FileService, AiService adapter)
  plugins/           plugin host (WP9)
  auth.ts            Bearer-token middleware (HttpApiMiddleware)
  layers.ts          AppLayer composition
```

- Repositories return domain types decoded with Schema (JSON columns decoded here, never leaked as `unknown`).
- Each repository has a test with `Database.layer({ path: ":memory:", migrationsFolder })`.
- HTTP tests use `HttpRouter.toWebHandler` and call it in-process (see `51_http-server/20_testing.ts`).
- On first start, a `LocalProfile` service ensures exactly one `User` row exists and exposes its id to repositories (`ownerId`).
- Build: `bun build --compile --target=bun-<platform>-<arch> apps/sidecar/src/main.ts --outfile apps/desktop/src-tauri/binaries/sidecar-<target-triple>` for macOS arm64/x64, Windows x64, Linux x64. Provide `bun run --filter @cadcamfun/sidecar build` for the host target and `build:all` for CI.

## 4. Acceptance criteria

- `curl` with the token against a running sidecar creates a project, a drawing with entities, a toolpath, and returns G-code produced by WP2 for it; without a token → 401.
- Restarting the sidecar keeps data; migrations are idempotent.
- Killing the parent closes the DB cleanly (WAL checkpointed — verify with `PRAGMA wal_checkpoint` test).
- `bunx tsc` clean for both packages; coverage of every endpoint by at least one in-process HTTP test.

## 5. Change log

- 2026-10-24: additive assistant evidence implemented through existing handlers. Printer
  discovery retains profiles, manufacturing returns the kernel print report, and stock notes
  describe deposition. Real catalogue/handler/worker tests pass for verified and blocked print
  releases (14 tests together with action discovery); typechecks and API-reference freshness
  pass. No HTTP schema or action identity changed.

- 2026-10-20: Web API reference freshness fix complete: regenerated `packages/web/src/data/api-reference.json` from the current contract (300 operations, 210 paths, 35 groups, 56 named schemas). Added the owner-requested mandatory regeneration rule to `AGENTS.md` while retaining the freshness gate. All 31 web tests pass (1,824 assertions); the full workspace typecheck passes all 15 package tasks plus the root check.

- 2026-10-17: Web API documentation synchronization complete for the current contract: regenerated `packages/web/src/data/api-reference.json` and added the workspace resource page to API navigation. Web typecheck, documentation freshness checks, and all 31 web tests pass.

- 2026-10-16: Added application-only OAuth authorize/complete endpoints, regenerated clients and OpenAPI snapshot. Wired subscription credential changes and OpenCode Zen/Go declarations into the native host. Provider tests exercise real handlers and native plugins against simulated external services.

- 2026-10-16: Regression review: refreshed the OpenAPI snapshot for the assistant extension endpoints and contributed mode ids. The snapshot adds seven paths and removes none; contract assertions and generated-client freshness checks pass.

- 2026-10-16: AI extension endpoints now manage owned-project MCP connections and authenticated local Worker plugin installation, activation and removal. External project bridge tokens cannot manage extensions or native mods. AI extension HTTP tests and the fresh-process native sidecar boot/MCP-config probe pass; API typecheck and generated-client freshness pass.

- 2026-10-15: the existing AI bridge returns the complete structured tool value with normal JSON wire encoding, retaining
  text-only extension compatibility. Preview truncation is reserved for the model text. Shared outcome tags now preserve
  invalid-result uncertainty and stale conflicts; no HTTP schema changed and generated clients remain current.
- 2026-10-14: generated-client integration additionally scopes the existing `packages/httpapi-codegen` Promise type emitter and its regression test: JSON-valued request payloads must emit the recursive `JsonValue` alias even when no response uses it. Generated files remain generator-owned.
- 2026-10-14: owner-requested additive kernel integration: authenticated `POST /api/toolpaths/manufacture` takes a versioned explicit CAD snapshot with material, machine preset, stock/world origin and quality settings, returning a schema-validated kernel result with exact emitted NC, program, claims and identity. This stateless endpoint enriches the existing generator group and does not mutate saved drawings or toolpaths.
- 2026-10-14: RM-01 contract amendment: shared CAM action input schemas live in `ai-cam.ts`, reusing core stock/fixture/solid contracts. G-code generation may return a shared tagged action failure or mutation outcome alongside its existing program result. These envelopes must survive the action and desktop adapters unchanged; revision/receipt storage remains RM-03.
- v1: initial spec.
- Integration: added the generated `ApiClient` Effect service with `layer({ baseUrl, token })`; client-side authorization middleware supplies the per-launch Bearer token without persisting it. Additional contract groups alone do not count as implemented server routes.
- System contract: preserve legacy `GET /api/health` and provide authenticated `GET /health` and `GET /version` for the native boot contract. Version returns `{ version }` from the sidecar configuration.
- Integration (plugins, auth, analytics, waitlist, files): handlers, repos and in-process tests added. `AppConfig` gained optional `appUrl` (`CADCAMFUN_APP_URL`, base of e-mail links) and `debugLinks` (`CADCAMFUN_DEBUG_LINKS`, echo reset/magic links in the response as legacy did in development; there is no mail transport yet). `AuthTokens` signs the legacy HS256 reset/magic/verification JWTs with a per-install secret stored at `<dataDir>/auth-secret`. Request payloads of auth, analytics `track` and `upload` are loosened to optional fields so handlers return the legacy validation messages. `StorageService` gained `downloadBytes` and `deletePrefix`. The test harness now provides a real filesystem (multipart uploads persist to disk).
- Toolpath verification: `POST /api/toolpaths/verify` in the `toolpathGenerator` group takes `cam.verify.VerifyRequestSchema` (`gcode` or `program`, `stock`, `tool`, `fixtures`, optional `target.solids`, `resolution`, `tolerance`) and answers `VerifyResponseSchema`. A problem with the *model* (both or neither of `gcode` / `program`, degenerate stock) is a 200 with `ok: false` and an `InvalidInput` issue; a schema-invalid body is a 400. The AI `ToolHandlers` gained `listOperations`, `updateOperation`, `suggestParameters` and `verifyOperation`, which share one loader for a stored operation (`operation()` in `services/ai.ts`). Test helpers: `makeApp().toolHandlers()` returns the real handlers over the same in-memory database.
- Sessions: the per-launch Bearer token still authenticates the shell, but `Authorization` now also reads an optional `x-session-token` header (the `session` JWT returned by `signin-direct` and, new, by `verify-magic-link` as `token`). A valid token makes `CurrentUser` that account (so every user-scoped route, billing included, acts on it); a missing, expired, forged, wrong-type or orphaned token falls back to the local profile. `set-cookie` response headers of the auth group are now optional in the contract (`fetch` hides them from webviews, so a required header made the typed client fail to decode every sign-in).
- Payments: `PaymentProvider` (`services/payments.ts`, Effect `Context.Service` over `HttpClient`) creates Stripe checkout and billing-portal sessions for `POST /api/subscriptions`, `/api/subscriptions/portal` and the `better-auth-stripe` checkout/portal routes. `AppConfig` gained `stripeSecretKey` (`STRIPE_SECRET_KEY`), `stripePrices` (`STRIPE_PRICE_BASIC|PRO|ENTERPRISE`) and the test hook `stripeApiBase`. Without a key every call fails with `PaymentError { reason: "unconfigured" }` and the routes keep their legacy 500 answers. Checkout stamps `userId` and `plan` on the subscription; `customer.subscription.*` webhooks store plan, customer and subscription ids, creating the row when the user paid before ever opening the subscription page. Open question 3 of spec 00 is decided: Stripe (optional, no license-key path).
- Session lifetime: `AuthTokens.revoke` ends a token before its expiry. `POST /api/auth/signout` revokes the `x-session-token` it carries, and reset-password and verify-magic-link consume their link (a replay answers "Token non valido"). Revoked token ids and their expiry are kept in `<dataDir>/auth-revoked.json` and dropped once expired.
- AI workflow endpoints expose assistant prompts, conversation titles, design analysis, machining parameter recommendations, G-code optimization proposals and contextual design suggestions. G-code optimization is advisory and never updates a stored operation.
- AI persistence: `KvStore` uses Drizzle over the shared SQLite connection for JSON-compatible context, memory and preference values; secrets remain outside the KV table.

### Atomic AI stock changes

Owner-requested CAM persistence alignment (2026-10-14): `CamProgramDocument` is the shared versioned portable/saved program schema, reusing core IR/settings/stock and `CamKernelRequest`/artifact. Existing `Toolpath.data` and `ToolpathVersion.data` JSON columns store it; no migration is needed. Sidecar create/update validates this recognized format and exact duplicated NC. Native evidence supplied by the desktop is accepted only after rerunning its captured kernel request and matching the artifact/NC/IR; existing server-generated originals may be retained unchanged. Edited NC loses earlier native/verification evidence. The sidecar owns source-revision attribution to a matching stored drawing; client revisions cannot certify changed geometry or stock. Native project writes require the same owner/admin/manager scope as AI writes (create/createForDrawing add `Forbidden`); legacy nonportable payload behavior is retained. Version creation requires toolpath write access. Owners include API shared schemas/groups/codegen outputs, sidecar CAM adapter/toolpath handlers, their tests, and desktop CAM/AI snapshot consumers. Atomic execution receipts remain RM-03.

Existing transactional stock invalidation also clears native artifacts/requests/source revision and the portable document's duplicated NC/IR, updating its stock. Reopening an invalidated program must not restore obsolete stock or native claims. Saved portable programs are available to AI listing/static analysis; edited originals are explicitly unverified, and project-level programs without a drawing cannot acquire drawing verification by association.

Owner-requested composite toolpath resources (2026-10-14): portable CAM documents additionally carry an optional ordered `operations` array (id, name, exact operation NC/IR, optional tool, settings and element IDs). Saves, exports and version restores preserve all operations; server validation requires their composed NC to equal the stored NC and rebuilds their IR from each operation's NC. Changed aggregate NC or stock clears obsolete operation results. Existing version-1 documents without this field remain valid. API schema, sidecar persistence adapter and invalidation, desktop CAM stores/sync/save and resource detail components/screens/tests are in scope. Resource details show the stored component geometry in an interactive 3D preview, operation order, tools, parameters and original NC; previews never mutate the editor or substitute its current geometry.

The existing drawing repository owns stock persistence. `configureStock` updates the latest drawing JSON and invalidates generated G-code, responses and verification on its operations inside one synchronous SQLite transaction. Unrelated drawing geometry, operation metadata and chain information survive. The AI handler checks project access and validates stock before invoking this method. No new storage or duplicate drawing model is introduced.

Catalogue transport follow-up: `GET /api/ai/models` accepts optional `configuredOnly` query (`true`/`false`), preserving the existing full-list default. HTTP handlers filter the service result; provider/session ownership remains inside the AI service. Optional telemetry SDKs load only when an exporter is configured.

Runtime startup performs no AI SDK prewarm or model metadata download. The first catalogue access owns its seed request, and scope shutdown aborts and joins it. Native IPC logs use one JSON line per Effect event; Rust preserves its level rather than treating all stderr output as a warning.


## Account identity integration (2026-10-16)

Owner-requested cross-WP scope and verification are defined in `30-identity.md`. Add dedicated CADCAMFUN OAuth account sign-in to desktop and mobile while retaining scoped companion pairing and local profile access.
