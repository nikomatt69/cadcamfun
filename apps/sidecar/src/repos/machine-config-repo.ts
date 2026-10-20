import { Database, DatabaseError, schema } from "@cadcamfun/db"
import type { Db } from "@cadcamfun/db"
import { and, count, desc, eq, inArray, like, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { LiveEvents } from "../services/live-events.ts"
import { orgIdsOf } from "./access.ts"
import { type ImportResults, importLoop } from "./import-loop.ts"

type Row = typeof schema.machineConfigTable.$inferSelect
const owner = (u: { id: string; name: string | null; email: string | null; image: string | null }) => u

const serialize = (r: Row) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })

async function ownerOf(db: Db, ownerId: string) {
  const [u] = await db.select({ id: schema.userTable.id, name: schema.userTable.name, email: schema.userTable.email, image: schema.userTable.image })
    .from(schema.userTable).where(eq(schema.userTable.id, ownerId)).limit(1)
  return u ? owner(u) : null
}
const usageOf = async (db: Db, id: string) =>
  (await db.select({ n: count() }).from(schema.toolpathTable).where(eq(schema.toolpathTable.machineConfigId, id)))[0]?.n ?? 0

export type MachineConfigView = ReturnType<typeof serialize> & { owner: ReturnType<typeof owner> | null }
export interface Permission { hasAccess: boolean; isOwner: boolean; reason?: string }

export class MachineConfigRepo extends Context.Service<MachineConfigRepo, {
  list(userId: string, f: { type?: string | undefined; search?: string | undefined; page: number; limit: number }):
    Effect.Effect<{ rows: Array<MachineConfigView & { isOwner: boolean; usageCount: number }>; total: number }, DatabaseError>
  /** Row + owner + permission (owner, public, or a toolpath of a project the user can reach). */
  find(userId: string, id: string): Effect.Effect<{ row: Row; view: MachineConfigView; permission: Permission; usageCount: number } | undefined, DatabaseError>
  create(userId: string, d: { name: string; description?: string | null | undefined; type: string; config: unknown; isPublic: boolean }): Effect.Effect<MachineConfigView, DatabaseError>
  update(id: string, d: { name: string; description: string | null; type: string; config: unknown; isPublic: boolean }): Effect.Effect<{ view: MachineConfigView; usageCount: number }, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
  usage(id: string): Effect.Effect<number, DatabaseError>
  /** Plain lookup for the storage routes (owner / public rule is applied by the handler). */
  byId(id: string): Effect.Effect<Row | undefined, DatabaseError>
  setConfig(id: string, config: unknown): Effect.Effect<void, DatabaseError>
  visibleByIds(userId: string, ids: ReadonlyArray<string>): Effect.Effect<MachineConfigView[], DatabaseError>
  importMany(userId: string, items: ReadonlyArray<Record<string, unknown>>, mode: string): Effect.Effect<ImportResults, DatabaseError>
}>()("cadcamfun/MachineConfigRepo") {
  static readonly layer = Layer.effect(
    MachineConfigRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const events = yield* LiveEvents
      const T = schema.machineConfigTable
      return MachineConfigRepo.of({
        list: (userId, f) =>
          query("machineConfigs.list", async (db) => {
            const base = eq(T.ownerId, userId)
            const where = and(base, f.type ? eq(T.type, f.type) : undefined,
              f.search ? or(like(T.name, `%${f.search}%`), like(T.description, `%${f.search}%`)) : undefined)
            const total = (await db.select({ n: count() }).from(T).where(where))[0]?.n ?? 0
            const rows = await db.select().from(T).where(where).orderBy(desc(T.updatedAt)).limit(f.limit).offset((f.page - 1) * f.limit)
            const out = []
            for (const r of rows) {
              out.push({ ...serialize(r), owner: await ownerOf(db, r.ownerId), isOwner: r.ownerId === userId, usageCount: await usageOf(db, r.id) })
            }
            return { rows: out, total }
          }),
        find: (userId, id) =>
          query("machineConfigs.find", async (db) => {
            const [row] = await db.select().from(T).where(eq(T.id, id)).limit(1)
            if (!row) return undefined
            const view = { ...serialize(row), owner: await ownerOf(db, row.ownerId) }
            const usageCount = await usageOf(db, id)
            let permission: Permission
            if (row.ownerId === userId) permission = { hasAccess: true, isOwner: true }
            else {
              const orgIds = await orgIdsOf(db, userId)
              const projectIds = (await db.select({ p: schema.toolpathTable.projectId }).from(schema.toolpathTable)
                .where(eq(schema.toolpathTable.machineConfigId, id))).map((r) => r.p)
              const reachable = projectIds.length === 0 ? [] : await db.select({ id: schema.projectTable.id }).from(schema.projectTable)
                .where(and(inArray(schema.projectTable.id, projectIds),
                  or(eq(schema.projectTable.ownerId, userId), orgIds.length ? inArray(schema.projectTable.organizationId, orgIds) : undefined)))
              permission = reachable.length > 0
                ? { hasAccess: true, isOwner: false }
                : { hasAccess: false, isOwner: false, reason: "This is a private configuration." }
            }
            return { row, view, permission, usageCount }
          }),
        create: (userId, d) =>
          query("machineConfigs.create", async (db) => {
            const [row] = await db.insert(T).values({ name: d.name, description: d.description ?? null, type: d.type, config: d.config, ownerId: userId, isPublic: d.isPublic }).returning()
            return { ...serialize(row!), owner: await ownerOf(db, userId) }
          }).pipe(Effect.tap((row) => row.ownerId ? events.resourcesChanged(row.ownerId) : Effect.void)),
        update: (id, d) =>
          query("machineConfigs.update", async (db) => {
            const [row] = await db.update(T).set({ ...d, updatedAt: new Date() }).where(eq(T.id, id)).returning()
            return { view: { ...serialize(row!), owner: await ownerOf(db, row!.ownerId) }, usageCount: await usageOf(db, id) }
          }).pipe(Effect.tap((row) => row.view.ownerId ? events.resourcesChanged(row.view.ownerId) : Effect.void)),
        remove: (id) => query("machineConfigs.remove", async (db) => (await db.delete(T).where(eq(T.id, id)).returning({ ownerId: T.ownerId }))[0]).pipe(Effect.tap((row) => row?.ownerId ? events.resourcesChanged(row.ownerId) : Effect.void), Effect.asVoid),
        usage: (id) => query("machineConfigs.usage", (db) => usageOf(db, id)),
        byId: (id) => query("machineConfigs.byId", async (db) => (await db.select().from(T).where(eq(T.id, id)).limit(1))[0]),
        setConfig: (id, config) => query("machineConfigs.setConfig", async (db) => void (await db.update(T).set({ config, updatedAt: new Date() }).where(eq(T.id, id)))),
        visibleByIds: (userId, ids) =>
          query("machineConfigs.visibleByIds", async (db) => {
            if (ids.length === 0) return []
            const rows = await db.select().from(T).where(and(inArray(T.id, [...ids]), eq(T.ownerId, userId)))
            return rows.map((r) => ({ ...serialize(r), owner: null }))
          }),
        importMany: (userId, items, mode) =>
          query("machineConfigs.importMany", (db) => importLoop(items, mode, {
            validate: (c) => (!c.name || !c.type || !c.config ? "Missing required fields (name, type, config)" : undefined),
            exists: async (id, m) => {
              const [row] = await db.select().from(T).where(eq(T.id, id)).limit(1)
              return !!row && (m === "skip" || row.ownerId === userId)
            },
            create: async (c) => (await db.insert(T).values({
              name: String(c.name), description: (c.description as string | undefined) || null, type: String(c.type), config: c.config,
              ownerId: userId, isPublic: false
            }).returning())[0]!.id,
            update: async (id, c) => {
              await db.update(T).set({
                name: String(c.name), description: (c.description as string | undefined) || null, type: String(c.type), config: c.config, updatedAt: new Date()
              }).where(eq(T.id, id))
              return id
            }
          }))
      })
    })
  ).pipe(Layer.provide(LiveEvents.layer))
}
