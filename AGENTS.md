# AGENTS.md

CADCAMFUN v6: native CAD/CAM desktop app. **Bun + Effect v4 (rc.112) + Drizzle (SQLite) + Tauri v2.** AI: nikcli (`@nikcli-ai/sdk-next`) as base/provider, AI SDK v7 for direct calls. All code, comments, docs and commit messages are in English.

## Read first

- `specs/00-overview.md` — goal, stack decisions, repo layout, task board (WP0–WP14), parallelisation map, definition of done.
- `specs/01-conventions.md` — Effect v4 rules, DB rules, agent workflow. Effect is pinned to `4.0.0-rc.112` workspace-wide (required by nikcli `sdk-next`); its docs are in `packages/db/node_modules/effect/ai-docs/src/` (the API differs from v3; do not rely on memory).
- The spec of the work package you are working on (`specs/02…14`).
- **Roadmap (when cited):** `specs/roadmap/README.md` — ordered remaining work (RM-00–RM-11). See **Roadmap** below.

## Roadmap

When the user, another spec, or this file cites **the roadmap**, `specs/roadmap`, or an `RM-NN` id, agents **must** follow `specs/roadmap/README.md` and `specs/roadmap/00-how-to-follow.md`. Those files win on **sequence**. Design specs (`specs/00`–`27`) still win on **contracts**.

Rules:

1. Read `specs/roadmap/README.md`. The current step is the first `in progress` row, else the first `pending` row.
2. Open that step spec. Implement only its deliverables. Edit only its owner directories.
3. Do not start a later RM step until its `depends on` rows are `done`, unless the user named that later step **and** those dependencies are already `done`.
4. Effect v4 (`01-conventions.md` §2) and architecture vocabulary (module, interface, implementation, depth, seam, adapter, leverage, locality) apply on every RM step.
5. After the step's Verify commands pass: mark the README row `done`, append the step spec Change log.

Do not treat `20-integral-roadmap.md` or `21-integration-master-plan.md` as the sequence when the roadmap is cited.

## Rules

- Edit only the directories owned by your WP (see the task board) or by the current RM step. Cross-WP changes go through the specs first.
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

WP0–WP14 are built to the levels recorded in `specs/00-overview.md`. Remaining ordered work is `specs/roadmap/README.md` (current step: RM-01 action catalogue). WP11–WP13 (`packages/vcs`, `packages/workflow`, `apps/mobile`; spec `13-vcs-actions-mobile.md`) add git-style history, pull requests, Actions-style workflows and the iOS companion.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
