# Conventions (apply to every WP)

Reference for Effect v4 (pinned to `4.0.0-rc.112`): `packages/db/node_modules/effect/ai-docs/src/` (Bun does not hoist; any workspace package's `node_modules/effect/ai-docs/src/` works). Read the relevant folder before writing Effect code; it is the authoritative, version-matched documentation and may differ from the stable 4.0.0 docs. Do **not** use v3 idioms from memory — the API changed (see §2). Do not bump `effect` in any single package; see `08-ai.md` §6.3.

## 1. General

- English only: identifiers, comments, docs, commit messages, UI strings (UI strings go through the i18n table, default locale `en`).
- TypeScript strict. No `any` in exported signatures; prefer `unknown` + Schema decoding at boundaries.
- Type checking is Bun's built-in checker: `bun check -p <package>/tsconfig.json` (Bun 1.4.4). It reads the workspace `tsconfig.json` and reports the same diagnostics as `tsc`; do not add `tsc`/`tsgo` back as a project checker. A workspace script must not be named `check`, or `bun check` would run that script instead of the checker.
- ES modules, relative imports include the `.ts` extension (`allowImportingTsExtensions` is on).
- Files `kebab-case.ts`; one concept per file; tests next to source as `*.test.ts` using `bun:test`.
- Comments explain *why*, not *what*. Keep modules small and pure where possible.
- Units: **millimetres and radians internally**; convert only at the UI/G-code boundary. Angles in degrees never cross a module boundary.
- Numbers in G-code are formatted with a fixed number of decimals (default 3), never via implicit `toString`.

## 2. Effect v4 rules

- Services: `class X extends Context.Service<X, Shape>()("cadcamfun/X") { static layer = ... }`. Shape is an interface of methods returning `Effect`.
- Functions that return an Effect and benefit from tracing: `Effect.fn("Module.name")(function*(...) { ... })`; hot paths: `Effect.fnUntraced`. Do not write functions that merely wrap and return `Effect.gen`.
- Errors that cross a process boundary (HTTP) are `Schema.TaggedError`. Internal-only errors may use `Data.TaggedError`. Never throw in Effect code; map foreign exceptions with `Effect.try`/`Effect.tryPromise` into a tagged error. Handle with `Effect.catchTag`/`Effect.catchTags`.
- Decode all external input with `Schema.decodeUnknownEffect(schema)`. Domain models are `Schema.Class` (validated construction) or `Schema.Struct`.
- Resources use `Effect.acquireRelease` inside a `Layer`; the Layer owns the lifecycle, callers never close handles.
- Configuration is read once in `apps/sidecar/src/config.ts` via Effect `Config`; everything else receives config through a service.
- Pure geometry/CAM code (`packages/core`) has **no Effect runtime dependency in hot loops**: algorithms are plain functions over readonly arrays; Effect/Schema wrap them only at the edges (validation, errors).
- Tests: plain `bun:test`; run effects with `Effect.runPromise` and provide layers explicitly. Use `:memory:` SQLite for DB tests (see `packages/db/src/database.test.ts`).

## 3. Database rules (Drizzle)

- Only `packages/db` talks to SQLite. Other packages use repository services exported from `apps/sidecar` or the `Database` service.
- Schema changes: edit `packages/db/src/schema.ts` → `bun run db:generate` → commit the generated SQL in `packages/db/drizzle/`. Never edit generated SQL by hand.
- Table and column names are kept identical to the legacy Prisma SQLite database.
- All queries go through `Database.query(operation, run)` so failures become `DatabaseError`.

## 4. Git and agent workflow

- Do not commit unless asked. Do not edit files outside your WP (see `00-overview.md` §4).
- Never read, print or copy values from `.env*` files.
- Before finishing: typecheck, test, and update the WP spec's "Status" and "Change log".

## 5. Error and logging policy

- Log with `Effect.log*` and annotate with `Effect.annotateLogs`; no `console.*` outside entrypoints.
- User-facing errors are typed, have a stable `_tag`, and a human message in English.
