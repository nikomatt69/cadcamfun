import { Context, Data, Effect, Layer } from "effect"
import { Database as BunDatabase } from "bun:sqlite"
import { drizzle, type SQLiteBunDatabase } from "drizzle-orm/bun-sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import * as schema from "./schema.ts"
import { applyUpgrade, backupDatabase, planUpgrade } from "./upgrade.ts"

export * as schema from "./schema.ts"

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

export type Db = SQLiteBunDatabase<typeof schema>

export interface DatabaseConfig {
  /** Path to the SQLite file, or ":memory:". */
  readonly path: string
  /** Folder with drizzle-kit migrations; skipped when omitted. */
  readonly migrationsFolder?: string
  /** Backup directory; defaults to "backups" beside the SQLite file. Keeps the last five. */
  readonly backupsDirectory?: string
}

/**
 * The Drizzle handle plus a helper that lifts any Drizzle query into Effect,
 * mapping thrown errors into a typed `DatabaseError`.
 */
export class Database extends Context.Service<Database, {
  readonly db: Db
  readonly query: <A>(operation: string, run: (db: Db) => PromiseLike<A> | A) => Effect.Effect<A, DatabaseError>
}>()("cadcamfun/Database") {
  static layer = (config: DatabaseConfig): Layer.Layer<Database, DatabaseError> =>
    Layer.effect(
      Database,
      Effect.gen(function*() {
        const existing = yield* Effect.try({
          try: () => config.path !== ":memory:" && existsSync(config.path),
          catch: (cause) => new DatabaseError({ operation: "open", cause })
        })
        const sqlite = yield* Effect.acquireRelease(
          Effect.try({
            try: () => {
              if (config.path !== ":memory:") mkdirSync(dirname(config.path), { recursive: true })
              return new BunDatabase(config.path, { create: true })
            },
            catch: (cause) => new DatabaseError({ operation: "open", cause })
          }),
          (sqlite) => Effect.gen(function*() {
            yield* Effect.try({
              try: () => {
                const result = sqlite.query<{ busy: number }, []>("PRAGMA wal_checkpoint(TRUNCATE)").get()
                if (result?.busy) throw new Error("SQLite checkpoint is busy")
              },
              catch: (cause) => new DatabaseError({ operation: "checkpoint", cause })
            }).pipe(Effect.catchTag("DatabaseError", (error) => Effect.logWarning("Database checkpoint failed", error)))
            yield* Effect.try({
              try: () => sqlite.close(),
              catch: (cause) => new DatabaseError({ operation: "close", cause })
            }).pipe(Effect.catchTag("DatabaseError", (error) => Effect.logWarning("Database close failed", error)))
          })
        )
        yield* Effect.try({
          try: () => {
            sqlite.run("PRAGMA journal_mode = WAL")
            sqlite.run("PRAGMA foreign_keys = ON")
          },
          catch: (cause) => new DatabaseError({ operation: "open", cause })
        })
        if (config.migrationsFolder) {
          const folder = config.migrationsFolder
          const plan = yield* Effect.try({
            try: () => planUpgrade(sqlite, folder),
            catch: (cause) => new DatabaseError({ operation: "migrate", cause })
          })
          if (plan.needed) {
            if (existing) yield* Effect.try({
              try: () => backupDatabase(sqlite, config.path, config.backupsDirectory),
              catch: (cause) => new DatabaseError({ operation: "backup", cause })
            })
            yield* Effect.try({
              try: () => applyUpgrade(sqlite, plan),
              catch: (cause) => new DatabaseError({ operation: "migrate", cause })
            })
          }
        }
        const db = drizzle({ client: sqlite, schema })
        return Database.of({
          db,
          query: (operation, run) =>
            Effect.tryPromise({
              try: async () => run(db),
              catch: (cause) => new DatabaseError({ operation, cause })
            })
        })
      })
    )
}
