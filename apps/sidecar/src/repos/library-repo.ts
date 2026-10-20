import type { LibraryItemRow } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import type { Db } from "@cadcamfun/db"
import { and, desc, eq, inArray, like, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { orgIdsOf } from "./access.ts"

type Row = typeof schema.libraryItemTable.$inferSelect
const toRow = (i: Row): LibraryItemRow => ({ ...i, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString() })

const ownerRef = async (db: Db, ids: ReadonlyArray<string | null>) => {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))]
  const rows = uniq.length ? await db.select({ id: schema.userTable.id, name: schema.userTable.name, email: schema.userTable.email, image: schema.userTable.image })
    .from(schema.userTable).where(inArray(schema.userTable.id, uniq)) : []
  return new Map(rows.map((r) => [r.id, r]))
}

export interface LibraryInput {
  name?: string | undefined; description?: string | null | undefined; category?: string | undefined; type?: string | undefined
  data?: unknown; properties?: unknown; tags?: unknown; isPublic?: boolean | undefined
}

export class LibraryRepo extends Context.Service<LibraryRepo, {
  list(userId: string, f: { category?: string | undefined; type?: string | undefined; search?: string | undefined }): Effect.Effect<LibraryItemRow[], DatabaseError>
  find(userId: string, id: string): Effect.Effect<{ item: Row; row: LibraryItemRow; role: string | undefined } | undefined, DatabaseError>
  isMember(userId: string, organizationId: string): Effect.Effect<boolean, DatabaseError>
  create(userId: string, d: LibraryInput & { name: string; category: string; type: string; data: unknown; organizationId?: string | null | undefined }): Effect.Effect<LibraryItemRow, DatabaseError>
  update(item: Row, d: LibraryInput): Effect.Effect<LibraryItemRow, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
  /** Own + public rows of a catalogue table with the owner embedded (`/api/library/{components,materials,tools}`). */
  catalogue(userId: string, kind: "components" | "materials" | "tools"): Effect.Effect<unknown[], DatabaseError>
}>()("cadcamfun/LibraryRepo") {
  static readonly layer = Layer.effect(
    LibraryRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const T = schema.libraryItemTable
      return LibraryRepo.of({
        list: (userId, f) =>
          query("library.list", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const visible = or(eq(T.ownerId, userId), orgIds.length ? inArray(T.organizationId, orgIds) : undefined)
            // Deviation from legacy: `search` narrows the visible set instead of replacing it.
            const search = f.search ? or(like(T.name, `%${f.search}%`), like(T.description, `%${f.search}%`)) : undefined
            const rows = await db.select().from(T)
              .where(and(visible, search, f.category ? eq(T.category, f.category) : undefined, f.type ? eq(T.type, f.type) : undefined))
              .orderBy(desc(T.updatedAt))
            return rows.map(toRow)
          }),
        find: (userId, id) =>
          query("library.find", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const [item] = await db.select().from(T)
              .where(and(eq(T.id, id), or(eq(T.ownerId, userId), orgIds.length ? inArray(T.organizationId, orgIds) : undefined)))
              .limit(1)
            if (!item) return undefined
            const [m] = item.organizationId
              ? await db.select({ role: schema.userOrganizationTable.role }).from(schema.userOrganizationTable)
                .where(and(eq(schema.userOrganizationTable.userId, userId), eq(schema.userOrganizationTable.organizationId, item.organizationId)))
              : []
            return { item, row: toRow(item), role: m?.role }
          }),
        isMember: (userId, organizationId) =>
          query("library.isMember", async (db) => (await orgIdsOf(db, userId)).includes(organizationId)),
        create: (userId, d) =>
          query("library.create", async (db) => {
            const [row] = await db.insert(T).values({
              name: d.name, description: d.description ?? null, category: d.category, type: d.type, data: d.data,
              properties: d.properties || {}, tags: d.tags || [], ownerId: userId,
              organizationId: d.organizationId ?? null, isPublic: d.isPublic || false
            }).returning()
            return toRow(row!)
          }),
        update: (item, d) =>
          query("library.update", async (db) => {
            const [row] = await db.update(T).set({
              name: d.name || item.name,
              description: d.description !== undefined ? d.description : item.description,
              category: d.category || item.category, type: d.type || item.type,
              data: d.data || item.data, properties: d.properties || item.properties, tags: d.tags || item.tags,
              isPublic: d.isPublic !== undefined ? d.isPublic : item.isPublic,
              updatedAt: new Date()
            }).where(eq(T.id, item.id)).returning()
            return toRow(row!)
          }),
        remove: (id) => query("library.remove", async (db) => void (await db.delete(T).where(eq(T.id, id)))),
        catalogue: (userId, kind) =>
          query("library.catalogue", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const table = kind === "components" ? schema.libraryItemTable : kind === "materials" ? schema.materialTable : schema.toolTable
            const rows = await db.select().from(table).where(or(eq(table.ownerId, userId), orgIds.length ? inArray(table.organizationId, orgIds) : undefined)) as Array<Record<string, unknown> & { ownerId: string | null; createdAt: Date; updatedAt: Date }>
            const owners = await ownerRef(db, rows.map((r) => r.ownerId))
            return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), owner: owners.get(r.ownerId ?? "") ?? null }))
          })
      })
    })
  )
}
