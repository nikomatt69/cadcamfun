import type { Database as SQLite } from "bun:sqlite"
import { statSync } from "node:fs"

export interface DatabaseStorage {
  readonly databaseBytes: number
  readonly walBytes: number
  readonly sharedMemoryBytes: number
  readonly totalBytes: number
  readonly pageSize: number
  readonly pageCount: number
  readonly freePages: number
  readonly reclaimableBytes: number
}

function fileBytes(path: string): number {
  try {
    return statSync(path).size
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return 0
    throw cause
  }
}

export function readStorage(sqlite: SQLite, path: string): DatabaseStorage {
  const pageSize = sqlite.query<{ page_size: number }, []>("PRAGMA page_size").get()?.page_size ?? 0
  const pageCount = sqlite.query<{ page_count: number }, []>("PRAGMA page_count").get()?.page_count ?? 0
  const freePages = sqlite.query<{ freelist_count: number }, []>("PRAGMA freelist_count").get()?.freelist_count ?? 0
  const databaseBytes = path === ":memory:" ? 0 : fileBytes(path)
  const walBytes = path === ":memory:" ? 0 : fileBytes(`${path}-wal`)
  const sharedMemoryBytes = path === ":memory:" ? 0 : fileBytes(`${path}-shm`)
  return {
    databaseBytes, walBytes, sharedMemoryBytes,
    totalBytes: databaseBytes + walBytes + sharedMemoryBytes,
    pageSize, pageCount, freePages,
    reclaimableBytes: freePages * pageSize
  }
}

function checkpoint(sqlite: SQLite): void {
  const result = sqlite.query<{ busy: number }, []>("PRAGMA wal_checkpoint(TRUNCATE)").get()
  if (result?.busy) throw new Error("SQLite checkpoint is busy; close other database readers before compaction")
}

export function compactStorage(sqlite: SQLite, path: string) {
  const before = readStorage(sqlite, path)
  checkpoint(sqlite)
  sqlite.run("VACUUM")
  checkpoint(sqlite)
  return { before, after: readStorage(sqlite, path) }
}
