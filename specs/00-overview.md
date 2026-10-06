# CADCAMFUN v6 — Overview and Task Board

Status: draft v1 · Language of all code, comments, docs and commit messages: **English**.

## 1. Goal

Rebuild the CAD/CAM desktop application described in `README.md` from scratch as a **native desktop app** on:

| Concern | Choice |
| --- | --- |
| Runtime / package manager / test runner | **Bun** (`bun install`, `bun test`) |
| Application logic | **Effect v4**, pinned to exactly `4.0.0-rc.112` workspace-wide (required by `@nikcli-ai/sdk-next`; one copy only, so Layers/`Context` tags are shared) |
| Persistence | **Drizzle ORM + SQLite** (`drizzle-orm@1.0.0-beta.22`, `bun:sqlite`) |
| Desktop shell | **Tauri v2** (Rust shell + webview) |
| UI | **SolidJS** + Vite + TypeScript, visually identical to the legacy React UI; Three.js for the viewport |
| AI | **nikcli** embedded host (`@nikcli-ai/sdk-next`) as base and provider; **AI SDK v7** (`ai`, `@ai-sdk/*`) for direct/one-shot calls |

The previous Next.js + Prisma + Stripe/Better Auth codebase is kept, **read-only and git-ignored**, in `.reference/`. Use it as a source of domain knowledge (types, algorithms, UI behaviour). Do not import from it and do not copy code verbatim without reviewing it; several modules contain bugs (see `04-core-cam.md`).

## 2. Decision: Tauri, not Electron

The stack requires `bun:sqlite` and Effect running in-process with Drizzle. Electron's main process is Node, which has no `bun:sqlite`; we would have to swap in `better-sqlite3`/`libsql` (native rebuilds per Electron ABI). With Tauri, the application logic runs as a **Bun-compiled sidecar** (`bun build --compile`), so the exact stack above runs unchanged, and the Rust shell stays small (window, tray, menus, updater, secure storage, sidecar lifecycle). Rust 1.96 is installed; the Tauri CLI comes from `@tauri-apps/cli` (no `cargo install` needed).

## 3. Repository layout

```
.reference/            legacy code, git-ignored, read-only
specs/                 these documents (source of truth for scope and contracts)
packages/
  db/                  @cadcamfun/db      Drizzle schema, migrations, Effect Database service   [DONE]
  core/                @cadcamfun/core    pure CAD geometry + CAM/G-code domain (no I/O)
  api/                 @cadcamfun/api     schema-first HttpApi definitions + shared domain schemas
  ai/                  @cadcamfun/ai      AI layer: nikcli sdk-next host + AI SDK v7 (Effect services)
  plugin-sdk/          @cadcamfun/plugin-sdk  public plugin API types + host contract
apps/
  sidecar/             @cadcamfun/sidecar Bun Effect server (HttpApi handlers, services, wiring)
  desktop/             @cadcamfun/desktop Vite + React UI and src-tauri/ (Rust shell)
```

Dependency direction (no cycles): `core` ← `api` ← `sidecar`; `db` ← `sidecar`; `ai`, `plugin-sdk` ← `sidecar`; `api` (types only) ← `desktop`. `core` and `api` must not import `db`.

## 4. Task board

Each work package (WP) owns a directory. **An agent edits only files inside its own WP directory** plus the explicit shared files listed in its spec. Cross-WP needs go through the contracts in the specs; if a contract must change, edit the spec first and note it under "Change log" at the bottom of that spec.

| WP | Name | Owns | Spec | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| WP0 | Database | `packages/db` | `02-database.md` | — | **done** (schema generated from Prisma, migration, `Database` layer, tests) |
| WP1 | CAD geometry core | `packages/core/src/cad` | `03-core-cad.md` | — | **done** (288 core tests incl. WP2) |
| WP2 | CAM + G-code core | `packages/core/src/cam` | `04-core-cam.md` | WP1 (types only) | **done** (3 posts, goldens, regression tests for all legacy bugs) |
| WP3 | Shared API contract | `packages/api` | `05-api-sidecar.md` | WP1, WP2 schemas | **in progress** — 67/195 legacy route files in the contract (`bun run --filter @cadcamfun/api coverage`) |
| WP4 | Sidecar server | `apps/sidecar` | `05-api-sidecar.md` | WP0, WP3 | **in progress** — every contract group is now served (plugins, auth, analytics, waitlist, files added); families without a contract are still missing, see `11-api-parity-brief.md` |
| WP5 | Tauri shell | `apps/desktop/src-tauri` | `07-tauri-shell.md` | WP4 (binary contract only) | **M1 done** (clippy + 32 Rust tests; verified with stub sidecar) |
| WP6 | UI shell + project screens | `apps/desktop/src/app`, `…/screens` | `06-desktop-ui.md` | WP3 | **in progress** — Solid + Tailwind v3 foundation, core screens plus plugins, costs, organizations, waitlist, auth and analytics screens; the rest of the 65 pages are still stubs |
| WP7 | 3D/2D viewport | `apps/desktop/src/viewport` | `06-desktop-ui.md` | WP1 | **in progress** — separate session owns `src/viewport`, `src/state` |
| WP8 | AI layer (nikcli + AI SDK v7) | `packages/ai` | `08-ai.md` | — | **done** |
| WP9 | Plugin system | `packages/plugin-sdk`, `apps/sidecar/src/plugins` | `09-plugins.md` | WP3, WP4 | **done** (SDK + host; legacy `/api/plugins/*` HTTP group served, SDK host not exposed over HTTP yet) |
| WP10 | Updates, sync, packaging, CI | `.github/workflows`, `scripts/`, `apps/desktop/src-tauri` (updater only) | `10-release-sync.md` | WP5 | **done** (pipeline + CI + updater; release secrets unset) |

### Parallelisation map

Wave 1 (no dependencies, start together): **WP1, WP8, WP5 (skeleton with a stub sidecar)**.
Wave 2: **WP2, WP3** (after WP1 types land), **WP6/WP7** against mocked API data.
Wave 3: **WP4** (wires WP0 + WP2 + WP3 + WP8), then **WP9**, **WP10**.

Agents in the same wave never touch the same directory, so they can run concurrently without merge conflicts. The only shared files are `package.json` workspaces, `tsconfig.base.json`, and `bun.lock`; only the integrating agent changes those, and adding a new package's own `package.json` is allowed.

## 5. Definition of done (every WP)

1. `bun install` at the repo root succeeds.
2. `bunx tsc -p <package>/tsconfig.json` exits 0 (strict, `noUncheckedIndexedAccess`).
3. `bun test <package dir>` passes; new behaviour has tests; bug fixes have a regression test.
4. Public surface documented in the WP's spec (update it if the surface changed).
5. No imports from `.reference/`, no `any` in exported signatures, no `process.env` reads outside the config module.
6. Conventions in `01-conventions.md` followed.

## 6. Scope and phasing

- **Parity requirement (owner decision)**: the v6 backend exposes the **same HTTP API as the legacy app** — all 195 route files in `specs/api-inventory.md`, same paths, methods, payloads and status codes — and the UI is **visually and functionally identical to the legacy UI, re-implemented in SolidJS**. This supersedes the earlier "deferred" list below: auth, organizations, marketplace, billing, notifications, chat, MCP, ML and analytics routes are all in scope, implemented on SQLite/Drizzle. Where a route depends on a cloud service (Stripe, Polar, email, OAuth), implement it behind an Effect service with a local/no-op default and keep the HTTP contract identical.
- **v6.0 (this plan)**: local-first desktop app — projects, 2D drawing, 3D viewport, toolpaths, G-code generation/export, materials/tools/machine configs library, cost estimates, AI assistant (bring-your-own key), plugin host, auto-update.
- **Previously deferred (now in scope via the parity requirement above; build last, after the core flows)**: cloud sync, organizations and invitations, marketplace, Stripe billing/subscriptions, Better Auth (passkeys, 2FA, magic link), push notifications, chat. Their tables exist in `packages/db` so a later phase can reuse them, but nothing in v6.0 may depend on them.
- Local identity in v6.0: a single local profile row in `User`; no login screen.

## 7. Open questions (decide before WP9/WP10)

1. Cloud sync backend: reuse the old `cadcamfun.xyz` API, or design a new one? (Affects WP10 only.)
2. Plugin sandboxing: run plugins in a Bun `Worker` (recommended) vs. separate processes.
3. Keep Stripe billing at all in v6.x, or drop licensing to a signed license-key check?
4. Does the nikcli host (`sdk-next`, ~20 MB, 60 deps) survive `bun build --compile` inside the sidecar, or must it run as a separate process? (Tracked in `08-ai.md` §6; decided by WP8/WP4.)

## 8. Change log

- v1: initial specs.
