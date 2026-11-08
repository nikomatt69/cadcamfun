import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { Database as SQLite } from "bun:sqlite"
import { Effect } from "effect"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { sql } from "drizzle-orm"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Database, type DatabaseConfig } from "./index.ts"
import { backupDatabase } from "./upgrade.ts"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "cadcamfun-upgrade-"))
  directories.push(directory)
  const path = join(directory, "cadcamfun.db")
  const migrationsFolder = join(directory, "migrations")
  const backupsDirectory = join(directory, "backups")
  mkdirSync(migrationsFolder)
  return { directory, path, migrationsFolder, backupsDirectory }
}

function migration(folder: string, index: number, sql: string) {
  const name = `202610050000${String(index).padStart(2, "0")}_test`
  mkdirSync(join(folder, name))
  writeFileSync(join(folder, name, "migration.sql"), sql)
}

const start = (config: DatabaseConfig) => Effect.runPromise(
  Effect.gen(function*() { yield* Database }).pipe(Effect.provide(Database.layer(config)))
)
const failure = (config: DatabaseConfig) => Effect.runPromise(
  Effect.gen(function*() { yield* Database }).pipe(Effect.provide(Database.layer(config)), Effect.flip)
)

function inspect<A>(path: string, run: (sqlite: SQLite) => A): A {
  const sqlite = new SQLite(path)
  try { return run(sqlite) } finally { sqlite.close() }
}

function backups(directory: string) {
  return existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith("-pre-migrate.db")).sort() : []
}

describe("Database upgrade safety", () => {
  test("backs up committed WAL data as a standalone restorable database", async () => {
    const config = fixture()
    const writer = new SQLite(config.path, { create: true })
    try {
      writer.run("PRAGMA journal_mode = WAL")
      writer.run("PRAGMA wal_autocheckpoint = 0")
      writer.run("CREATE TABLE original (value TEXT)")
      writer.run("INSERT INTO original VALUES ('committed in WAL')")
      expect(existsSync(`${config.path}-wal`)).toBe(true)
      migration(config.migrationsFolder, 1, "ALTER TABLE original ADD COLUMN upgraded INTEGER;")
      await start(config)
      const [name] = backups(config.backupsDirectory)
      expect(name).toBeDefined()
      if (!name) throw new Error("Missing backup")
      const restored = join(config.directory, "restored.db")
      writeFileSync(restored, new Uint8Array(await Bun.file(join(config.backupsDirectory, name)).arrayBuffer()))
      inspect(restored, (sqlite) => {
        expect(sqlite.query("SELECT * FROM original").all()).toEqual([{ value: "committed in WAL" }])
        expect(sqlite.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" })
        expect(sqlite.query("SELECT name FROM sqlite_master WHERE name = '__drizzle_migrations'").get()).toBeNull()
      })
      inspect(config.path, (sqlite) => expect(sqlite.query("PRAGMA table_info(original)").all()).toHaveLength(2))
    } finally { writer.close() }
  })

  test("skips backups on first creation, unchanged startup, and memory databases", async () => {
    const config = fixture()
    migration(config.migrationsFolder, 1, "CREATE TABLE original (value TEXT);")
    await start(config)
    await start(config)
    await start({ ...config, path: ":memory:" })
    expect(existsSync(config.backupsDirectory)).toBe(false)
  })

  test("retains only the last five backups without pruning unrelated files", async () => {
    const config = fixture()
    migration(config.migrationsFolder, 1, "CREATE TABLE original (value TEXT);")
    await start(config)
    mkdirSync(config.backupsDirectory)
    writeFileSync(join(config.backupsDirectory, "unrelated.db"), "keep")
    writeFileSync(join(config.backupsDirectory, "cadcamfun-manual-pre-migrate.db"), "keep")
    const created: string[] = []
    for (let index = 2; index <= 8; index++) {
      migration(config.migrationsFolder, index, `INSERT INTO original VALUES ('${index}');`)
      await start(config)
      const current = backups(config.backupsDirectory).filter((name) => name !== "cadcamfun-manual-pre-migrate.db")
      expect(current).toHaveLength(Math.min(index - 1, 5))
      const newest = current.find((name) => !created.includes(name))
      if (!newest) throw new Error("Missing new backup")
      created.push(newest)
    }
    for (const name of created.slice(0, -5)) expect(existsSync(join(config.backupsDirectory, name))).toBe(false)
    expect(existsSync(join(config.backupsDirectory, "unrelated.db"))).toBe(true)
    expect(existsSync(join(config.backupsDirectory, "cadcamfun-manual-pre-migrate.db"))).toBe(true)
  })

  test("backup failure aborts before journal or schema mutation and releases the connection", async () => {
    const config = fixture()
    inspect(config.path, (sqlite) => sqlite.run("CREATE TABLE original (value TEXT)"))
    migration(config.migrationsFolder, 1, "ALTER TABLE original ADD COLUMN upgraded INTEGER;")
    writeFileSync(config.backupsDirectory, "not a directory")
    const error = await failure(config)
    expect(error._tag).toBe("DatabaseError")
    expect(error.operation).toBe("backup")
    inspect(config.path, (sqlite) => {
      expect(sqlite.query("PRAGMA table_info(original)").all()).toHaveLength(1)
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE name = '__drizzle_migrations'").get()).toBeNull()
      sqlite.run("BEGIN EXCLUSIVE")
      sqlite.run("INSERT INTO original VALUES ('unlocked')")
      sqlite.run("COMMIT")
    })
  })

  test("retention preserves creation order when the clock repeats or moves backwards", () => {
    const config = fixture()
    const clock = spyOn(Date, "now")
    try {
      inspect(config.path, (sqlite) => {
        sqlite.run("CREATE TABLE original (value INTEGER)")
        for (let index = 0; index < 7; index++) {
          clock.mockReturnValue(Date.UTC(2026, 9, 5) - index)
          sqlite.run("INSERT INTO original VALUES (?)", [index])
          backupDatabase(sqlite, config.path, config.backupsDirectory)
        }
      })
    } finally { clock.mockRestore() }
    const retained = backups(config.backupsDirectory)
    expect(retained).toHaveLength(5)
    retained.forEach((name, index) => inspect(join(config.backupsDirectory, name), (sqlite) => {
      expect(sqlite.query("SELECT * FROM original").all()).toHaveLength(index + 3)
    }))
  })

  test("retention failure aborts migration with original data and journal unchanged", async () => {
    const config = fixture()
    migration(config.migrationsFolder, 1, "CREATE TABLE original (value TEXT);")
    await start(config)
    const journal = inspect(config.path, (sqlite) => {
      sqlite.run("INSERT INTO original VALUES ('preserved')")
      return sqlite.query("SELECT * FROM __drizzle_migrations").all()
    })
    mkdirSync(config.backupsDirectory)
    for (let index = 0; index < 5; index++) {
      const name = `cadcamfun-20200101-00000${index}.000-00000000-0000-0000-0000-000000000000-pre-migrate.db`
      // A directory with a snapshot-shaped name deterministically makes pruning fail.
      mkdirSync(join(config.backupsDirectory, name))
    }
    migration(config.migrationsFolder, 2, "UPDATE original SET value = 'changed';")
    expect((await failure(config)).operation).toBe("backup")
    inspect(config.path, (sqlite) => {
      expect(sqlite.query("SELECT * FROM original").all()).toEqual([{ value: "preserved" }])
      expect(sqlite.query("SELECT * FROM __drizzle_migrations").all()).toEqual(journal)
    })
    expect(readdirSync(config.backupsDirectory).some((name) => name.endsWith(".partial"))).toBe(false)
  })

  test("broken migration rolls back every pending migration and existing journal rows", async () => {
    const config = fixture()
    migration(config.migrationsFolder, 1, "CREATE TABLE original (value TEXT);")
    await start(config)
    inspect(config.path, (sqlite) => sqlite.run("INSERT INTO original VALUES ('preserved')"))
    const journal = inspect(config.path, (sqlite) => sqlite.query("SELECT * FROM __drizzle_migrations").all())
    migration(config.migrationsFolder, 2, "ALTER TABLE original ADD COLUMN upgraded INTEGER;\n--> statement-breakpoint\nUPDATE original SET value = 'changed';")
    migration(config.migrationsFolder, 3, "CREATE TABLE leaked (id INTEGER);\n--> statement-breakpoint\nINSERT INTO missing VALUES (1);")
    const error = await failure(config)
    expect(error.operation).toBe("migrate")
    inspect(config.path, (sqlite) => {
      expect(sqlite.query("SELECT * FROM original").all()).toEqual([{ value: "preserved" }])
      expect(sqlite.query("SELECT * FROM __drizzle_migrations").all()).toEqual(journal)
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE name = 'leaked'").get()).toBeNull()
      sqlite.run("BEGIN EXCLUSIVE")
      sqlite.run("ROLLBACK")
    })
    expect(backups(config.backupsDirectory)).toHaveLength(1)
  })

  test("broken first migration rolls back journal creation too", async () => {
    const config = fixture()
    inspect(config.path, (sqlite) => sqlite.run("CREATE TABLE original (value TEXT)"))
    migration(config.migrationsFolder, 1, "DROP TABLE original;\n--> statement-breakpoint\nINVALID SQL;")
    expect((await failure(config)).operation).toBe("migrate")
    inspect(config.path, (sqlite) => {
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([{ name: "original" }])
    })
  })

  test("legacy journal upgrades roll back with broken SQL and succeed on retry", async () => {
    const config = fixture()
    migration(config.migrationsFolder, 1, "CREATE TABLE original (value TEXT);")
    inspect(config.path, (sqlite) => {
      sqlite.run("CREATE TABLE original (value TEXT)")
      sqlite.run("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)")
      sqlite.run("INSERT INTO __drizzle_migrations VALUES (1, 'legacy', ?)", [Date.UTC(2026, 9, 5, 0, 0, 1)])
    })
    migration(config.migrationsFolder, 2, "INVALID SQL;")
    expect((await failure(config)).operation).toBe("migrate")
    inspect(config.path, (sqlite) => expect(sqlite.query("PRAGMA table_info(__drizzle_migrations)").all()).toHaveLength(3))
    writeFileSync(join(config.migrationsFolder, "20261005000002_test", "migration.sql"), "INSERT INTO original VALUES ('retry');")
    await start(config)
    inspect(config.path, (sqlite) => {
      expect(sqlite.query("PRAGMA table_info(__drizzle_migrations)").all()).toHaveLength(5)
      expect(sqlite.query("SELECT * FROM original").all()).toEqual([{ value: "retry" }])
    })
  })

  test("a table recreation keeps child rows that cascade from it and leaves enforcement on", async () => {
    const config = fixture()
    migration(config.migrationsFolder, 1, [
      "CREATE TABLE parent (id TEXT PRIMARY KEY, value TEXT);",
      "CREATE TABLE child (id TEXT PRIMARY KEY, parentId TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE);",
      "CREATE TABLE pinned (id TEXT PRIMARY KEY, parentId TEXT NOT NULL REFERENCES parent(id));"
    ].join("\n--> statement-breakpoint\n"))
    await start(config)
    inspect(config.path, (sqlite) => {
      sqlite.run("INSERT INTO parent VALUES ('p', 'kept')")
      sqlite.run("INSERT INTO child VALUES ('c', 'p')")
      sqlite.run("INSERT INTO pinned VALUES ('r', 'p')")
    })
    // The shape drizzle-kit generates for an SQLite column change.
    migration(config.migrationsFolder, 2, [
      "PRAGMA foreign_keys=OFF;",
      "CREATE TABLE `__new_parent` (id TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');",
      "INSERT INTO `__new_parent`(id, value) SELECT id, value FROM `parent`;",
      "DROP TABLE `parent`;",
      "ALTER TABLE `__new_parent` RENAME TO `parent`;",
      "PRAGMA foreign_keys=ON;"
    ].join("--> statement-breakpoint\n"))
    await Effect.runPromise(Effect.gen(function*() {
      const { query } = yield* Database
      const orphan = yield* query("orphan", (db) => db.run(sql`INSERT INTO child VALUES ('x', 'missing')`)).pipe(Effect.flip)
      expect(orphan._tag).toBe("DatabaseError")
    }).pipe(Effect.provide(Database.layer(config))))
    inspect(config.path, (sqlite) => {
      expect(sqlite.query("SELECT * FROM parent").all()).toEqual([{ id: "p", value: "kept" }])
      expect(sqlite.query("SELECT * FROM child").all()).toEqual([{ id: "c", parentId: "p" }])
      expect(sqlite.query("SELECT * FROM pinned").all()).toEqual([{ id: "r", parentId: "p" }])
      expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([])
    })
  })

  test("a migration that leaves a dangling reference rolls back", async () => {
    const config = fixture()
    migration(config.migrationsFolder, 1, [
      "CREATE TABLE parent (id TEXT PRIMARY KEY);",
      "CREATE TABLE child (id TEXT PRIMARY KEY, parentId TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE);"
    ].join("\n--> statement-breakpoint\n"))
    await start(config)
    inspect(config.path, (sqlite) => {
      sqlite.run("INSERT INTO parent VALUES ('p')")
      sqlite.run("INSERT INTO child VALUES ('c', 'p')")
    })
    const journal = inspect(config.path, (sqlite) => sqlite.query("SELECT * FROM __drizzle_migrations").all())
    migration(config.migrationsFolder, 2, "DELETE FROM parent;")
    const error = await failure(config)
    expect(error.operation).toBe("migrate")
    expect(String(error.cause)).toContain("child -> parent")
    inspect(config.path, (sqlite) => {
      expect(sqlite.query("SELECT * FROM parent").all()).toEqual([{ id: "p" }])
      expect(sqlite.query("SELECT * FROM child").all()).toEqual([{ id: "c", parentId: "p" }])
      expect(sqlite.query("SELECT * FROM __drizzle_migrations").all()).toEqual(journal)
    })
  })

  test("upgrading across the real Toolpath recreation keeps its versions, comments and estimates", async () => {
    const config = fixture()
    const real = new URL("../drizzle", import.meta.url).pathname
    const names = readdirSync(real).filter((name) => /^\d{14}_/.test(name)).sort()
    const at = names.findIndex((name) => name.includes("empty_ezekiel"))
    expect(at).toBeGreaterThan(0)
    for (const name of names.slice(0, at)) cpSync(join(real, name), join(config.migrationsFolder, name), { recursive: true })
    await start(config)
    inspect(config.path, (sqlite) => {
      sqlite.run("INSERT INTO User (id, createdAt, updatedAt) VALUES ('u', 1, 1)")
      sqlite.run("INSERT INTO Project (id, name, createdAt, updatedAt, ownerId) VALUES ('p', 'P', 1, 1, 'u')")
      sqlite.run("INSERT INTO Toolpath (id, name, projectId, createdAt, updatedAt, createdBy) VALUES ('t', 'T', 'p', 1, 1, 'u')")
      sqlite.run("INSERT INTO ToolpathVersion (id, toolpathId, userId, createdAt) VALUES ('v', 't', 'u', 1)")
      sqlite.run("INSERT INTO ToolpathComment (id, toolpathId, content, userId, createdAt, updatedAt) VALUES ('c', 't', 'note', 'u', 1, 1)")
      sqlite.run(`INSERT INTO ProductionCostEstimate (id, toolpathId, materialCost, toolWearCost, machineTime, machineTimeCost, operatorTime,
        operatorTimeCost, setupCost, totalCost, details, createdAt, updatedAt, ownerId) VALUES ('e', 't', 1, 1, 1, 1, 1, 1, 1, 4, '{}', 1, 1, 'u')`)
    })
    for (const name of names.slice(at)) cpSync(join(real, name), join(config.migrationsFolder, name), { recursive: true })
    await start(config)
    inspect(config.path, (sqlite) => {
      expect(sqlite.query("SELECT id FROM Toolpath").all()).toEqual([{ id: "t" }])
      expect(sqlite.query("SELECT id FROM ToolpathVersion").all()).toEqual([{ id: "v" }])
      expect(sqlite.query("SELECT id FROM ToolpathComment").all()).toEqual([{ id: "c" }])
      expect(sqlite.query("SELECT id FROM ProductionCostEstimate").all()).toEqual([{ id: "e" }])
      expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([])
    })
  })

  test("initialization failure releases SQLite and graceful close checkpoints WAL", async () => {
    const config = fixture()
    const close = spyOn(SQLite.prototype, "close")
    try {
      expect((await failure({ ...config, migrationsFolder: join(config.directory, "missing") })).operation).toBe("migrate")
      expect(close).toHaveBeenCalledTimes(1)
      await Effect.runPromise(Effect.gen(function*() {
        const { query } = yield* Database
        yield* query("write", (db) => db.run(sql`CREATE TABLE checkpointed (value TEXT)`))
        yield* query("insert", (db) => db.run(sql`INSERT INTO checkpointed VALUES ('persisted')`))
        expect(statSync(`${config.path}-wal`).size).toBeGreaterThan(0)
      }).pipe(Effect.provide(Database.layer({ path: config.path }))))
      expect(close).toHaveBeenCalledTimes(2)
      // Bun may retain an empty WAL file after close; truncation, not removal, is the contract.
      expect(existsSync(`${config.path}-wal`) ? statSync(`${config.path}-wal`).size : 0).toBe(0)
    } finally { close.mockRestore() }
    inspect(config.path, (sqlite) => expect(sqlite.query("SELECT * FROM checkpointed").all()).toEqual([{ value: "persisted" }]))
  })
})
