import { afterEach, expect, test } from "bun:test"
import { Database as SQLite } from "bun:sqlite"
import { Effect } from "effect"
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Database } from "./index.ts"

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

const start = (path: string, migrationsFolder: string) => Effect.runPromise(
  Effect.gen(function*() { yield* Database }).pipe(Effect.provide(Database.layer({ path, migrationsFolder, backupsDirectory: join(path, "..", "backups") })))
)

/** RM-05 upgrade: rows saved before the library history existed come out at version 1, untouched, and the history starts empty. */
test("the library-version migration keeps legacy rows and gives them version 1", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cadcamfun-libver-"))
  directories.push(directory)
  const real = join(import.meta.dir, "..", "drizzle")
  const names = readdirSync(real).filter((name) => /^\d{14}_/.test(name)).sort()
  const last = names.at(-1)!
  expect(last).toContain("sticky_sandman")
  const folder = join(directory, "migrations")
  mkdirSync(folder)
  for (const name of names.slice(0, -1)) cpSync(join(real, name), join(folder, name), { recursive: true })
  const path = join(directory, "cadcamfun.db")

  await start(path, folder)
  const legacy = new SQLite(path)
  try {
    legacy.run("INSERT INTO User (id, name, email, createdAt, updatedAt) VALUES ('u1', 'Legacy', 'legacy@example.com', 1, 1)")
    legacy.run("INSERT INTO Material (id, name, properties, isPublic, createdAt, updatedAt, ownerId) VALUES ('m1', 'Old steel', '{\"density\":7.8}', 0, 1, 1, 'u1')")
    legacy.run("INSERT INTO MachineConfig (id, name, type, config, isPublic, createdAt, updatedAt, ownerId) VALUES ('c1', 'Old mill', 'mill', '{}', 0, 1, 1, 'u1')")
    expect(() => legacy.query("SELECT version FROM Material").all()).toThrow()
  } finally { legacy.close() }

  cpSync(join(real, last), join(folder, last), { recursive: true })
  await start(path, folder)
  const upgraded = new SQLite(path)
  try {
    expect(upgraded.query("SELECT id, name, version, properties FROM Material").all()).toEqual([{ id: "m1", name: "Old steel", version: 1, properties: '{"density":7.8}' }])
    expect(upgraded.query("SELECT id, name, version FROM MachineConfig").all()).toEqual([{ id: "c1", name: "Old mill", version: 1 }])
    expect(upgraded.query("SELECT count(*) AS n FROM LibraryRowVersion").get()).toEqual({ n: 0 })
    expect(upgraded.query("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'LibraryRowVersion_kind_rowId_idx'").all()).toHaveLength(1)
  } finally { upgraded.close() }
})
