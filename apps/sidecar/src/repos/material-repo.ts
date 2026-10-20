import type { MaterialDetail, MaterialRow } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, asc, eq, inArray, like, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { LiveEvents } from "../services/live-events.ts"
import { type ImportResults, importLoop } from "./import-loop.ts"
import { hasOrgWriteAccess, isOrgMember, orgIdsOf, orgRef, userRef } from "./access.ts"

type Row = typeof schema.materialTable.$inferSelect
const toRow = (m: Row): MaterialRow => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() })

export interface MaterialInput {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly properties?: unknown
  readonly organizationId?: string | null | undefined
  readonly isPublic?: boolean | undefined
}

export class MaterialRepo extends Context.Service<MaterialRepo, {
  list(userId: string, opts: { search?: string | undefined }): Effect.Effect<MaterialRow[], DatabaseError>
  /** Visible to the user (own, organisation, public) with owner/organization embedded. */
  find(userId: string, id: string): Effect.Effect<{ material: Row; detail: typeof MaterialDetail.Type; canWrite: boolean } | undefined, DatabaseError>
  isMember(userId: string, organizationId: string): Effect.Effect<boolean, DatabaseError>
  /** Legacy two-step lookup: does it exist, and may this user read it (owner, organisation member, public)? */
  access(userId: string, id: string): Effect.Effect<{ row: Row; allowed: boolean } | undefined, DatabaseError>
  setProperties(id: string, properties: unknown): Effect.Effect<void, DatabaseError>
  /** Materials among `ids` that the user may read. */
  visibleByIds(userId: string, ids: ReadonlyArray<string>): Effect.Effect<Row[], DatabaseError>
  importMany(userId: string, items: ReadonlyArray<Record<string, unknown>>, mode: string): Effect.Effect<ImportResults, DatabaseError>
  create(userId: string, input: MaterialInput & { name: string; properties: unknown }): Effect.Effect<MaterialRow, DatabaseError>
  update(id: string, input: MaterialInput): Effect.Effect<MaterialRow, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
}>()("cadcamfun/MaterialRepo") {
  static readonly layer = Layer.effect(
    MaterialRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const events = yield* LiveEvents
      const T = schema.materialTable
      return MaterialRepo.of({
        list: (userId, { search }) =>
          query("materials.list", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const visible = or(
              eq(T.ownerId, userId),
              orgIds.length ? inArray(T.organizationId, orgIds) : undefined
            )
            // Deviation from legacy: `search` narrows the visible set instead of replacing it.
            const where = search ? and(visible, or(like(T.name, `%${search}%`), like(T.description, `%${search}%`))) : visible
            return (await db.select().from(T).where(where).orderBy(asc(T.name))).map(toRow)
          }),
        find: (userId, id) =>
          query("materials.find", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const [row] = await db.select().from(T)
              .where(and(eq(T.id, id), or(eq(T.ownerId, userId), orgIds.length ? inArray(T.organizationId, orgIds) : undefined)))
              .limit(1)
            if (!row) return undefined
            const [owners, orgs] = await Promise.all([userRef(db, row.ownerId ? [row.ownerId] : []), orgRef(db, row.organizationId ? [row.organizationId] : [])])
            const canWrite = row.ownerId === userId || (!!row.organizationId && await hasOrgWriteAccess(db, userId, row.organizationId))
            return {
              material: row,
              canWrite,
              detail: { ...toRow(row), owner: owners.get(row.ownerId ?? "") ?? null, organization: orgs.get(row.organizationId ?? "") ?? null }
            }
          }),
        // Deviation from legacy: membership is checked for *this* user (legacy matched any member).
        isMember: (userId, organizationId) => query("materials.isMember", (db) => isOrgMember(db, userId, organizationId)),
        access: (userId, id) =>
          query("materials.access", async (db) => {
            const [row] = await db.select().from(T).where(eq(T.id, id)).limit(1)
            if (!row) return undefined
            const allowed = row.ownerId === userId ||
              (!!row.organizationId && await isOrgMember(db, userId, row.organizationId))
            return { row, allowed }
          }),
        setProperties: (id, properties) =>
          query("materials.setProperties", async (db) => void (await db.update(T).set({ properties, updatedAt: new Date() }).where(eq(T.id, id)))),
        visibleByIds: (userId, ids) =>
          query("materials.visibleByIds", async (db) => {
            if (ids.length === 0) return []
            const orgIds = await orgIdsOf(db, userId)
            return db.select().from(T).where(and(
              inArray(T.id, [...ids]),
              or(eq(T.ownerId, userId), orgIds.length ? inArray(T.organizationId, orgIds) : undefined)
            ))
          }),
        importMany: (userId, items, mode) =>
          query("materials.importMany", (db) => importLoop(items, mode, {
            validate: (m) => (m.name ? undefined : "Missing required field (name)"),
            exists: async (id) => (await db.select({ id: T.id }).from(T).where(eq(T.id, id)).limit(1)).length > 0,
            create: async (m) => {
              const [row] = await db.insert(T).values({
                name: String(m.name), description: (m.description as string | undefined) || null,
                properties: m.properties || {}, ownerId: userId
              }).returning()
              return row!.id
            },
            update: async (id, m) => {
              await db.update(T).set({
                name: String(m.name), description: (m.description as string | undefined) || null,
                properties: m.properties || {}, updatedAt: new Date()
              }).where(eq(T.id, id))
              return id
            }
          })),
        create: (userId, input) =>
          query("materials.create", async (db) => {
            const [row] = await db.insert(T).values({
              name: input.name,
              description: input.description ?? null,
              properties: input.properties,
              ownerId: userId,
              organizationId: input.organizationId || null,
              isPublic: input.isPublic || false
            }).returning()
            return toRow(row!)
          }).pipe(Effect.tap((row) => row.ownerId ? events.resourcesChanged(row.ownerId) : Effect.void)),
        update: (id, input) =>
          query("materials.update", async (db) => {
            const [row] = await db.update(T).set({
              ...(input.name && { name: input.name }),
              ...(input.description !== undefined && { description: input.description }),
              ...(input.properties ? { properties: input.properties } : {}),
              ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
              updatedAt: new Date()
            }).where(eq(T.id, id)).returning()
            return toRow(row!)
          }).pipe(Effect.tap((row) => row.ownerId ? events.resourcesChanged(row.ownerId) : Effect.void)),
        remove: (id) => query("materials.remove", async (db) => (await db.delete(T).where(eq(T.id, id)).returning({ ownerId: T.ownerId }))[0]).pipe(Effect.tap((row) => row?.ownerId ? events.resourcesChanged(row.ownerId) : Effect.void), Effect.asVoid)
      })
    })
  ).pipe(Layer.provide(LiveEvents.layer))
}
