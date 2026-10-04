import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { SqliteMigrator } from "@effect/sql-sqlite-bun"
import { encodePresets } from "./library"

export const MigratorLayer = SqliteMigrator.layer({
  loader: SqliteMigrator.fromRecord({
    "0001_projects": Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          document TEXT NOT NULL,
          setup TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `
      yield* sql`CREATE INDEX projects_updated_at ON projects (updated_at)`
    }),
    "0002_library": Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`
        CREATE TABLE library_items (
          id TEXT NOT NULL,
          kind TEXT NOT NULL,
          data TEXT NOT NULL,
          builtin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (kind, id)
        )
      `
      const now = new Date().toISOString()
      const rows = yield* encodePresets
      if (rows.length > 0) {
        yield* sql`INSERT INTO library_items ${sql.insert(
          rows.map((r) => ({ ...r, builtin: 1, created_at: now, updated_at: now })),
        )}`
      }
    }),
    "0003_toolpaths": Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`
        CREATE TABLE toolpaths (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          controller TEXT NOT NULL,
          gcode TEXT NOT NULL,
          program TEXT,
          setup TEXT,
          stats TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `
      yield* sql`CREATE INDEX toolpaths_project ON toolpaths (project_id, updated_at)`
      yield* sql`
        CREATE TABLE toolpath_versions (
          id TEXT PRIMARY KEY,
          toolpath_id TEXT NOT NULL,
          message TEXT,
          gcode TEXT NOT NULL,
          program TEXT,
          stats TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `
      yield* sql`CREATE INDEX toolpath_versions_toolpath ON toolpath_versions (toolpath_id)`
      yield* sql`
        CREATE TABLE toolpath_comments (
          id TEXT PRIMARY KEY,
          toolpath_id TEXT NOT NULL,
          author TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `
      yield* sql`CREATE INDEX toolpath_comments_toolpath ON toolpath_comments (toolpath_id)`
    }),
  }),
})
