import { mutationActor, schema, type MutationTransaction } from "@cadcamfun/db"
import { and, desc, eq } from "drizzle-orm"

type Kind = typeof schema.LibraryKindValues[number]

/**
 * RM-05: before a save replaces a library row, the row as it was goes into `LibraryRowVersion` (inside the same transaction as
 * the save, so the two commit together or not at all). `by` is the person who saved; a write by the assistant names the actor of
 * its governed command. Returns the version the row gets.
 */
export const keepPreviousVersion = (tx: MutationTransaction, kind: Kind, previous: { id: string; version: number }, by?: string): number => {
  tx.insert(schema.libraryRowVersionTable).values({
    kind, rowId: previous.id, version: previous.version, data: previous, changedBy: by ?? mutationActor() ?? null
  }).run()
  return previous.version + 1
}

export interface LibraryVersionEntry {
  readonly id: string
  /** The version the row had before the save that stored this snapshot. */
  readonly version: number
  readonly data: unknown
  readonly changedBy: string | null
  readonly createdAt: string
}

/** The saves of one row, newest first. */
export const readHistory = async (db: import("@cadcamfun/db").Db, kind: Kind, rowId: string): Promise<LibraryVersionEntry[]> => {
  const T = schema.libraryRowVersionTable
  const rows = await db.select().from(T).where(and(eq(T.kind, kind), eq(T.rowId, rowId))).orderBy(desc(T.version))
  return rows.map((r) => ({ id: r.id, version: r.version, data: r.data, changedBy: r.changedBy, createdAt: r.createdAt.toISOString() }))
}
