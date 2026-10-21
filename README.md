# CADCAMFUN v6 — Native CAD/CAM Desktop App

Professional CAD/CAM desktop application: 2D drawing, 3D viewport, toolpath
generation, G-code export, materials/tools/machine library, cost estimates,
AI assistant, plugin host and auto-update. Local-first, offline-capable.

## Stack

| Concern | Choice |
| --- | --- |
| Runtime / package manager / test runner | **Bun** (`bun install`, `bun test`) |
| Application logic | **Effect v4**, pinned to `4.0.0-rc.112` workspace-wide |
| Persistence | **Drizzle ORM + SQLite** (`bun:sqlite`) |
| Desktop shell | **Tauri v2** (Rust shell + webview; app logic runs in a Bun sidecar) |
| UI | **SolidJS** + Vite + TypeScript, Three.js for the viewport |
| AI | **nikcli** embedded host as base/provider; **AI SDK v7** for direct calls |

## Repository layout

```
packages/
  db/          Drizzle schema, migrations, Effect Database service
  core/        pure CAD geometry + CAM/G-code domain (no I/O)
  api/         schema-first HttpApi definitions + shared domain schemas
  ai/          AI layer: nikcli host + AI SDK v7 (Effect services)
  plugin-sdk/  public plugin API types + host contract
  vcs/         git-compatible history: objects, branches, merge, GitHub sync
  workflow/    Actions-style workflow schema, triggers, runner
  web/         Astro docs site
apps/
  sidecar/     Bun Effect server (HttpApi handlers, services, wiring)
  desktop/     SolidJS UI + src-tauri/ (Rust shell)
  mobile/      iOS companion (Expo), thin client of a paired desktop
specs/         source of truth for scope and contracts
```

`packages/web` is the Astro docs site.

Dependency direction (no cycles): `core` ← `api` ← `sidecar`; `db` ← `sidecar`;
`ai`, `plugin-sdk` ← `sidecar`; `api` (types only) ← `desktop`.
`core` and `api` must not import `db`.

Desktop UI source layout (`apps/desktop/src`): `app/` (shell, route table, API
client), `pages/` (one-line route adapters, no logic), `features/<name>/`
(one folder per product area: `screens/`, `components/`, `hooks/`, `lib/`,
`store/`, `types/`, `api/`, `styles/`), `shared/` (`ui/`, `components/`,
`state/`), `styles/` (global CSS), `viewport/` (2D/3D engine), `i18n/`.

## Quickstart

```bash
bun install                                   # install workspace deps
bun test packages apps                        # all tests
bun check -p packages/<name>/tsconfig.json     # typecheck one package
bun run db:generate                           # new migration from schema.ts
bun run db:migrate                            # apply migrations to ./data/cadcamfun.db
bun run desktop:dev                           # build sidecar + Tauri dev window
```

Build scripts live in `scripts/` (`bun run build`, `build:sidecar`,
`build:desktop`). CI, platform builds and releases are in
`.github/workflows/` (`ci.yml`, `build-platforms.yml`, `release.yml`).

## Working here

- Read `AGENTS.md` first, then `specs/00-overview.md` (goal, task board
  WP0–WP14) and `specs/01-conventions.md` (Effect v4 rules, DB rules).
- Remaining ordered work lives in `specs/roadmap/README.md` (RM-00–RM-11);
  it wins on sequence, design specs win on contracts.
- Each work package owns its directory; cross-package changes go through
  the specs first.
- `.reference/` is the legacy Next.js/Prisma codebase: read-only domain
  knowledge, never imported.

## License

CADCAMFUN uses mixed licensing. Original repository material is available under
[Apache-2.0](LICENSES/Apache-2.0.txt), except for the proprietary
[AI package](packages/ai/LICENSE), [CAD kernel](packages/core/src/cad/LICENSE)
and [CAM kernel](packages/core/src/cam/LICENSE). Third-party material retains its
own licenses. The complete application includes proprietary components; it is
not offered as wholly open-source software. See [LICENSE](LICENSE) for scope.

## Community and policies

- [Contributing](CONTRIBUTING.md) and [governance](GOVERNANCE.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security reports](SECURITY.md) and [support/contact](SUPPORT.md)
- [Privacy and application data practices](PRIVACY.md)
- [Usage terms](TERMS.md) and [trademark policy](TRADEMARKS.md)

Maintainer: Nicola Mattioli — [@nikomatt69 on X](https://x.com/nikomatt69).
