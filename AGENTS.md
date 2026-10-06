# AGENTS.md

CADCAMFUN v6: native CAD/CAM desktop app. **Bun + Effect v4 (rc.112) + Drizzle (SQLite) + Tauri v2.** AI: nikcli (`@nikcli-ai/sdk-next`) as base/provider, AI SDK v7 for direct calls. All code, comments, docs and commit messages are in English.

## Read first

- `specs/00-overview.md` — goal, stack decisions, repo layout, task board (WP0–WP10), parallelisation map, definition of done.
- `specs/01-conventions.md` — Effect v4 rules, DB rules, agent workflow. Effect is pinned to `4.0.0-rc.112` workspace-wide (required by nikcli `sdk-next`); its docs are in `packages/db/node_modules/effect/ai-docs/src/` (the API differs from v3; do not rely on memory).
- The spec of the work package you are working on (`specs/02…10`).

## Rules

- Edit only the directories owned by your WP (see the task board). Cross-WP changes go through the specs first.
- `.reference/` is the legacy Next.js/Prisma codebase: git-ignored, read-only, domain knowledge only. Never import from it.
- Never read or print values from `.env*` files; they are legacy and unused.
- Do not commit unless asked.

## Commands

```bash
bun install                                   # install workspace deps
bun test packages apps                        # all tests
bunx tsc -p packages/<name>/tsconfig.json     # typecheck one package
bun run db:generate                           # drizzle-kit: new migration from schema.ts
bun run db:migrate                            # apply migrations to ./data/cadcamfun.db
```

## Current state

WP0 (`packages/db`) is done: Drizzle schema (51 tables), migration, `Database` Effect service, tests. Everything else is specified but not built yet.
