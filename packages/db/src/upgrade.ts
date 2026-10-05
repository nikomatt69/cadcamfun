import type { Database } from "bun:sqlite"
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator"
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs"
import { basename, dirname, join } from "node:path"

interface JournalRow {
  id: number
  hash: string
  created_at: number
  name: string | null
}

export function planUpgrade(sqlite: Database, migrationsFolder: string) {
  const migrations = readMigrationFiles({ migrationsFolder })
  const columns = sqlite.query<{ name: string }, []>("PRAGMA table_info('__drizzle_migrations')").all()
  const legacy = columns.length > 0 && !columns.some((column) => column.name === "name")
  const rows = columns.length === 0 ? [] : sqlite.query<JournalRow, []>(
    legacy
      ? 'SELECT id, hash, created_at, NULL AS name FROM "__drizzle_migrations"'
      : 'SELECT id, hash, created_at, name FROM "__drizzle_migrations"'
  ).all()
  const backfill = rows.map((row) => {
    if (!legacy) return row
    const candidates = migrations.filter((migration) =>
      migration.folderMillis === Math.floor(Number(row.created_at) / 1000) * 1000)
    const match = candidates.length === 1 ? candidates[0] : candidates.find((migration) => migration.hash === row.hash)
    const migration = match ?? migrations.find((migration) => migration.hash === row.hash)
    if (!migration?.name) throw new Error("Legacy migration journal does not match local migrations")
    return { ...row, name: migration.name }
  })
  const names = new Set(backfill.map((row) => row.name))
  const pending = migrations.filter((migration) => !migration.name || !names.has(migration.name))
  return { pending, legacy, backfill, needed: legacy || pending.length > 0 }
}

export function backupDatabase(sqlite: Database, path: string, directory = join(dirname(path), "backups")) {
  mkdirSync(directory, { recursive: true })
  const prefix = `${basename(path, ".db")}-`
  const backups = readdirSync(directory).filter((file) =>
    file.startsWith(prefix) && /^\d{8}-\d{6}\.\d{3}-[0-9a-f-]{36}-pre-migrate\.db$/.test(file.slice(prefix.length)))
    .sort()
  const latest = backups.at(-1)?.slice(prefix.length, prefix.length + 19)
  const latestMillis = latest === undefined ? 0 : Date.parse(latest.replace(
    /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.(\d{3})$/,
    "$1-$2-$3T$4:$5:$6.$7Z"
  ))
  // UUID ordering cannot establish creation order within the same millisecond.
  const timestamp = new Date(Math.max(Date.now(), latestMillis + 1)).toISOString()
    .replace(/[-:]/g, "").replace("T", "-").replace("Z", "")
  const name = `${prefix}${timestamp}-${crypto.randomUUID()}-pre-migrate.db`
  const destination = join(directory, name)
  const partial = `${destination}.partial`
  try {
    sqlite.run("VACUUM INTO ?", [partial])
    renameSync(partial, destination)
  } finally {
    rmSync(partial, { force: true })
  }
  for (const file of [...backups, name].slice(0, -5)) rmSync(join(directory, file))
}

export function applyUpgrade(sqlite: Database, plan: ReturnType<typeof planUpgrade>) {
  // Drizzle beta.22 mutates the journal before BEGIN; include it in our transaction instead.
  sqlite.transaction(() => {
    sqlite.run(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC, name TEXT, applied_at TEXT
    )`)
    if (plan.legacy) {
      sqlite.run('ALTER TABLE "__drizzle_migrations" ADD COLUMN name TEXT')
      sqlite.run('ALTER TABLE "__drizzle_migrations" ADD COLUMN applied_at TEXT')
      for (const row of plan.backfill) {
        sqlite.run('UPDATE "__drizzle_migrations" SET name = ?, applied_at = NULL WHERE id = ?', [row.name, row.id])
      }
    }
    for (const migration of plan.pending) applyMigration(sqlite, migration)
  }).immediate()
}

function applyMigration(sqlite: Database, migration: MigrationMeta) {
  for (const statement of migration.sql) sqlite.run(statement)
  sqlite.run('INSERT INTO "__drizzle_migrations" (hash, created_at, name, applied_at) VALUES (?, ?, ?, ?)',
    [migration.hash, migration.folderMillis, migration.name ?? null, new Date().toISOString()])
}
