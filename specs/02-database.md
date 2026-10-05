# WP0 — Database (`packages/db`)

Status: **done** (upgrade safety verified: 12 tests and strict package typecheck pass). Owner dir: `packages/db`.

## 1. What exists

- `src/schema.ts` — 51 tables and 6 enums, generated once from the legacy Prisma schema by a converter (Prisma is removed from the project). Table and column names are unchanged. Mapping:

| Prisma | Drizzle (`sqlite-core`) |
| --- | --- |
| `String` | `text` |
| `Int` | `integer` |
| `Float` | `real` |
| `Boolean` | `integer({ mode: "boolean" })` |
| `DateTime` | `integer({ mode: "timestamp_ms" })` (JS `Date` in/out) |
| `Json` | `text({ mode: "json" })` |
| `Bytes` | `blob({ mode: "buffer" })` |
| enum | `text({ enum })` + exported `XValues` const and `X` union type |
| `@default(cuid())` | `$defaultFn(newId)` (`crypto.randomUUID()`) |
| `@updatedAt` | `$defaultFn(() => new Date()).$onUpdateFn(() => new Date())` |
| `@relation(..., onDelete)` | `.references(() => table.col, { onDelete })` (no `onDelete` ⇒ restrict) |

  Each table exports `xTable`, `type X` (select) and `type NewX` (insert). Relation objects (`relations()`) are **not** generated; add them per table only when the relational query API is needed.
- `src/index.ts` — `Database` service (`Context.Service`) with `Database.layer({ path, migrationsFolder? })`:
  - opens `bun:sqlite`, sets `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`, creates the parent directory, runs migrations when `migrationsFolder` is given, closes the handle when the layer scope ends;
  - exposes `db` (Drizzle handle) and `query(operation, run)` which lifts any Drizzle call into `Effect<A, DatabaseError>`.
- `src/migrate.ts` — CLI: `bun run db:migrate` (path from `DATABASE_URL`, default `./data/cadcamfun.db`).
- `drizzle/` — generated migration SQL; `drizzle.config.ts` for drizzle-kit.
- `src/database.test.ts` — migrates `:memory:`, round-trips rows, verifies FK enforcement, restrict-by-default and cascade.
- `src/upgrade.ts` and `src/upgrade.test.ts` — atomic upgrade runner and temporary-file safety regressions, including standalone WAL snapshot restoration, last-five retention, backup/retention failure, legacy journal rollback, and scoped cleanup.

## 2. Contracts other WPs rely on

```ts
import { Database, DatabaseError, schema } from "@cadcamfun/db"
const { query } = yield* Database
const projects = yield* query("projects.list", (db) => db.select().from(schema.projectTable))
```

- `Database.layer` is the only way to obtain a connection. The sidecar builds it once in `apps/sidecar/src/main.ts` with a path inside the app data directory (`<appData>/cadcamfun/cadcamfun.db`).
- Migrations are applied at sidecar start, before the HTTP server begins listening.
- The migrations folder is bundled next to the compiled sidecar (WP5/WP10 must ship `drizzle/` as a Tauri resource and pass its path via config).
- Upgrade safety is owned by WP0, not the sidecar. Existing `Database.layer({ path, migrationsFolder? })` callers remain compatible; exported `DatabaseConfig` adds optional `backupsDirectory` (default: `backups` beside the database). No environment reads are introduced.
- Before pending migrations (or a legacy Drizzle journal upgrade) on an existing file, SQLite `VACUUM INTO` creates a standalone, WAL-consistent snapshot. New files and `:memory:` do not need backups; current databases do not create backups on startup. Names include a UTC timestamp and collision-resistant suffix; only this database's last five snapshots are retained. Backup or retention failure aborts startup as `DatabaseError` with operation `backup`.
- Migration planning/execution failures use operation `migrate`. All pending SQL and journal creation/upgrades run in one SQLite transaction; failure preserves the original logical schema, data, and journal (not byte-identical file contents). WP0 uses Drizzle's installed migration-file reader and name-based pending semantics, with an atomic runner because the installed migrator creates/upgrades its journal outside its migration transaction. Migration SQL must not contain transaction control or non-transactional operations such as `VACUUM`.
- Connection acquisition is scoped before initialization, so initialization failures release the handle. Graceful scope release attempts `wal_checkpoint(TRUNCATE)` and always closes SQLite; cleanup failures are logged. Other WPs must not close the handle and must retain the layer scope through shutdown. Migration startup assumes a single sidecar owner; concurrent application upgrades are not supported.
- Snapshot timestamps increase relative to existing snapshots even within one millisecond or after clock rollback, so retention keeps the newest restore point. A busy checkpoint is logged as a cleanup failure without preventing close. Temporary-file tests cover restoration, retention failure, journal rollback, and connection release.

## 3. Known gaps / follow-ups (not blocking)

1. **Local profile bootstrap**: a `LocalProfile` repository in the sidecar must create the single local `User` row on first launch (WP4).
2. **`Json` columns are untyped** (`unknown`): repositories must decode with Schema from `@cadcamfun/api` before returning data. Consider `$type<...>()` per column once the shapes are defined.
3. **Index on foreign keys**: Prisma did not create FK indexes either; add indexes for hot lookups (`Project.ownerId`, `Toolpath.projectId`, `Drawing.projectId`) in a new migration once query patterns are known.
4. **Better Auth tables** (`Session`, `Account`, `Passkey`, `TwoFactor`, `Authenticator`, `VerificationToken`) are retained for the deferred cloud phase and unused in v6.0.
5. The untracked `.env*` files at the repo root are legacy: `.env.local`, `.env.development` and `.env.production` set `DATABASE_URL` to a hosted Postgres instance, while `.env` points at the old Prisma SQLite file. None of them may be used by v6. The local SQLite path comes from sidecar config (`CADCAMFUN_DB_PATH`, default in the app data directory). Agents must not read or print values from those files.

## 4. Rules for changing the schema

See `01-conventions.md` §3. Every schema change ships with: updated `schema.ts`, generated migration, and a test in `database.test.ts` (or a new `*.test.ts`) covering the new constraint or default.

## 5. Change log

- v1: initial import from Prisma, migration `20261004223029_careful_monster_badoon`, service + tests.
- v2: WP0 upgrade-safety contract documented before implementation: optional backup directory, WAL-consistent last-five snapshots, atomic migration/journal rollback, and scoped shutdown; no sidecar changes required.
- v3: finishing prior agent edits; clarify deterministic snapshot retention and busy-checkpoint cleanup before implementation and verification.
- v3 verified: inspected installed Drizzle beta.22 reader, pending-name semantics, journal upgrade, and SQLite migrator; journal changes precede its migration transaction, requiring the atomic WP0 runner. Fixed unfinished test typing and WAL-removal assumptions. `bun test src` passes (12 tests, 56 assertions) and `bun run typecheck` passes from `packages/db`; all checks ran through monitors. No root configuration, environment files, sidecar code, or generated migrations changed.
