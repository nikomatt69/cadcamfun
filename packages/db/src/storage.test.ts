import { afterEach, describe, expect, test } from "bun:test"
import { Database as SQLite } from "bun:sqlite"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "./index.ts"
import { createDemoDatabase } from "./demo.ts"

const directories: string[] = []
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "cadcamfun-storage-"))
  directories.push(directory)
  return join(directory, "example.db")
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("Database storage maintenance", () => {
  test("reports metadata and compacts free pages without losing rows", async () => {
    const path = fixture()
    await Effect.runPromise(Effect.gen(function*() {
      const database = yield* Database
      yield* database.query("fixture", (db) => {
        db.run(sql`CREATE TABLE sample (id INTEGER PRIMARY KEY, value BLOB)`)
        db.run(sql`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 400)
          INSERT INTO sample SELECT x, zeroblob(16384) FROM n`)
        db.run(sql`DELETE FROM sample WHERE id > 1`)
      })
      const before = yield* database.storage()
      expect(before.reclaimableBytes).toBeGreaterThan(4 * 1024 * 1024)
      expect(before.totalBytes).toBe(before.databaseBytes + before.walBytes + before.sharedMemoryBytes)
      expect(Object.values(before).every((value) => typeof value === "number")).toBe(true)
      const { after } = yield* database.compact()
      expect(after.freePages).toBe(0)
      expect(after.pageCount).toBeLessThan(before.pageCount)
      expect(after.walBytes).toBe(0)
      expect(yield* database.query("rows", (db) => db.all(sql`SELECT id, length(value) AS bytes FROM sample`)))
        .toEqual([{ id: 1, bytes: 16384 }])
      expect(yield* database.query("integrity", (db) => db.get(sql`PRAGMA integrity_check`)))
        .toEqual({ integrity_check: "ok" })
      expect(yield* database.query("journal limit", (db) => db.get(sql`PRAGMA journal_size_limit`)))
        .toEqual({ journal_size_limit: 8 * 1024 * 1024 })
      expect(yield* database.query("autocheckpoint", (db) => db.get(sql`PRAGMA wal_autocheckpoint`)))
        .toEqual({ wal_autocheckpoint: 1000 })
    }).pipe(Effect.provide(Database.layer({ path }))))
  })

  test("fails explicitly when a reader blocks the checkpoint", async () => {
    const path = fixture()
    await Effect.runPromise(Effect.gen(function*() {
      const database = yield* Database
      yield* database.query("fixture", (db) => db.run(sql`CREATE TABLE sample (value TEXT)`))
      const reader = new SQLite(path)
      try {
        reader.run("BEGIN")
        reader.query("SELECT * FROM sample").all()
        yield* database.query("write", (db) => db.run(sql`INSERT INTO sample VALUES ('synthetic')`))
        const failure = yield* database.compact().pipe(Effect.flip)
        expect(failure.operation).toBe("compact")
        expect(yield* database.query("rows", (db) => db.all(sql`SELECT * FROM sample`)))
          .toEqual([{ value: "synthetic" }])
      } finally {
        reader.run("ROLLBACK")
        reader.close()
      }
    }).pipe(Effect.provide(Database.layer({ path }))))
  })

  test("memory databases report no disk usage", async () => {
    await Effect.runPromise(Effect.gen(function*() {
      const database = yield* Database
      expect((yield* database.storage()).totalBytes).toBe(0)
      expect((yield* database.compact()).after.totalBytes).toBe(0)
    }).pipe(Effect.provide(Database.layer({ path: ":memory:" }))))
  })

  test("storage CLI refuses missing paths without creating a database", () => {
    const path = fixture()
    const result = Bun.spawnSync({ cmd: [process.execPath, "--no-env-file", new URL("./storage-cli.ts", import.meta.url).pathname, path] })
    expect(result.exitCode).toBe(1)
    expect(existsSync(path)).toBe(false)
  })
})

describe("Synthetic demo database", () => {
  test("contains only invented fixtures, no authentication, context, chat or history rows", async () => {
    const path = fixture()
    await Effect.runPromise(createDemoDatabase(path))
    expect(statSync(path).mode & 0o777).toBe(0o600)
    const sqlite = new SQLite(path, { readonly: true })
    try {
      const tables = sqlite.query<{ name: string }, []>("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
      const populated = tables.filter(({ name }) => {
        const identifier = `"${name.replaceAll('"', '""')}"`
        return (sqlite.query<{ count: number }, []>(`SELECT count(*) AS count FROM ${identifier}`).get()?.count ?? 0) > 0
      }).map(({ name }) => name).sort()
      expect(populated).toEqual(["Project", "User", "__drizzle_migrations"])
      expect(sqlite.query("SELECT id, name, email, password FROM User").all()).toEqual([
        { id: "demo-user", name: "Synthetic demo", email: "demo@example.invalid", password: null }
      ])
      expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([])
      expect(sqlite.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" })
    } finally { sqlite.close() }
  })

  test("refuses to overwrite an existing file", async () => {
    const path = fixture()
    writeFileSync(path, "existing synthetic sentinel")
    const failure = await Effect.runPromise(createDemoDatabase(path).pipe(Effect.flip))
    expect(failure.operation).toBe("demo.create")
    expect(await Bun.file(path).text()).toBe("existing synthetic sentinel")
  })

  test("refuses the special in-memory path", async () => {
    const failure = await Effect.runPromise(createDemoDatabase(":memory:").pipe(Effect.flip))
    expect(failure.operation).toBe("demo.create")
  })
})
