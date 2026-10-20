import { Context, Data, Effect, Layer } from "effect"
import { Database as BunDatabase } from "bun:sqlite"
import { drizzle, type SQLiteBunDatabase } from "drizzle-orm/bun-sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import * as schema from "./schema.ts"
import { applyUpgrade, backupDatabase, planUpgrade } from "./upgrade.ts"
import { compactStorage, readStorage, type DatabaseStorage } from "./storage.ts"

export * as schema from "./schema.ts"
export type { DatabaseStorage } from "./storage.ts"

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
  readonly storage: () => Effect.Effect<DatabaseStorage, DatabaseError>
  readonly compact: () => Effect.Effect<{ readonly before: DatabaseStorage; readonly after: DatabaseStorage }, DatabaseError>
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
            sqlite.run("PRAGMA wal_autocheckpoint = 1000")
            // SQLite applies this after WAL resets; active readers can still delay shrinking.
            sqlite.run("PRAGMA journal_size_limit = 8388608")
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
          storage: Effect.fn("Database.storage")(() => Effect.try({
            try: () => readStorage(sqlite, config.path),
            catch: (cause) => new DatabaseError({ operation: "storage", cause })
          })),
          compact: Effect.fn("Database.compact")(() => Effect.try({
            try: () => compactStorage(sqlite, config.path),
            catch: (cause) => new DatabaseError({ operation: "compact", cause })
          })),
          query: (operation, run) =>
            Effect.tryPromise({
              try: async () => run(db),
              catch: (cause) => new DatabaseError({ operation, cause })
            })
        })
      })
    )
}
