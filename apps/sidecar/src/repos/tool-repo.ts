import type { ToolDetail, ToolRow } from "@cadcamfun/api"
import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, asc, eq, inArray, like, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { LiveEvents } from "../services/live-events.ts"
import { importLoop, type ImportResults } from "./import-loop.ts"
import { hasOrgWriteAccess, isOrgMember, orgIdsOf, orgRef, userRef } from "./access.ts"

type Row = typeof schema.toolTable.$inferSelect
const toRow = (t: Row): ToolRow => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })

export interface ToolInput {
  name?: string | undefined; type?: string | undefined; diameter?: number | undefined; material?: string | undefined
  numberOfFlutes?: number | null | undefined; maxRPM?: number | null | undefined; coolantType?: string | null | undefined
  cuttingLength?: number | null | undefined; totalLength?: number | null | undefined; shankDiameter?: number | null | undefined
  cornerRadius?: number | null | undefined; tipAngle?: number | null | undefined; threadPitch?: number | null | undefined
  holderDiameter?: number | null | undefined; holderLength?: number | null | undefined; stickout?: number | null | undefined
  notes?: string | null | undefined; organizationId?: string | null | undefined; isPublic?: boolean | undefined
}

export class ToolRepo extends Context.Service<ToolRepo, {
  list(userId: string, f: { type?: string | undefined; material?: string | undefined; diameter?: number | undefined; search?: string | undefined}): Effect.Effect<ToolRow[], DatabaseError>
  find(userId: string, id: string): Effect.Effect<{ detail: typeof ToolDetail.Type; canWrite: boolean } | undefined, DatabaseError>
  isMember(userId: string, organizationId: string): Effect.Effect<boolean, DatabaseError>
  access(userId: string, id: string): Effect.Effect<{ row: Row; allowed: boolean } | undefined, DatabaseError>
  touch(id: string): Effect.Effect<void, DatabaseError>
  visibleByIds(userId: string, ids: ReadonlyArray<string>): Effect.Effect<ToolRow[], DatabaseError>
  importMany(userId: string, items: ReadonlyArray<Record<string, unknown>>, mode: string): Effect.Effect<ImportResults, DatabaseError>
  create(userId: string, input: ToolInput & { name: string; type: string; diameter: number; material: string }): Effect.Effect<ToolRow, DatabaseError>
  update(id: string, input: ToolInput): Effect.Effect<ToolRow, DatabaseError>
  remove(id: string): Effect.Effect<void, DatabaseError>
}>()("cadcamfun/ToolRepo") {
  static readonly layer = Layer.effect(
    ToolRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const events = yield* LiveEvents
      const T = schema.toolTable
      return ToolRepo.of({
        list: (userId, f) =>
          query("tools.list", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const visible = or(eq(T.ownerId, userId), orgIds.length ? inArray(T.organizationId, orgIds) : undefined)
            // Deviation from legacy: `search` narrows the visible set instead of replacing it.
            const search = f.search ? or(like(T.name, `%${f.search}%`), like(T.notes, `%${f.search}%`)) : undefined
            const where = and(visible, search, f.type ? eq(T.type, f.type) : undefined, f.material ? eq(T.material, f.material) : undefined,
              f.diameter !== undefined ? eq(T.diameter, f.diameter) : undefined)
            return (await db.select().from(T).where(where).orderBy(asc(T.name))).map(toRow)
          }),
        find: (userId, id) =>
          query("tools.find", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const [row] = await db.select().from(T)
              .where(and(eq(T.id, id), or(eq(T.ownerId, userId), orgIds.length ? inArray(T.organizationId, orgIds) : undefined)))
              .limit(1)
            if (!row) return undefined
            const [owners, orgs] = await Promise.all([userRef(db, row.ownerId ? [row.ownerId] : []), orgRef(db, row.organizationId ? [row.organizationId] : [])])
            const canWrite = row.ownerId === userId || (!!row.organizationId && await hasOrgWriteAccess(db, userId, row.organizationId))
            return { canWrite, detail: { ...toRow(row), owner: owners.get(row.ownerId ?? "") ?? null, organization: orgs.get(row.organizationId ?? "") ?? null } }
          }),
        isMember: (userId, organizationId) => query("tools.isMember", (db) => isOrgMember(db, userId, organizationId)),
        access: (userId, id) =>
          query("tools.access", async (db) => {
            const [row] = await db.select().from(T).where(eq(T.id, id)).limit(1)
            if (!row) return undefined
            const allowed = row.ownerId === userId || (!!row.organizationId && await isOrgMember(db, userId, row.organizationId))
            return { row, allowed }
          }),
        touch: (id) => query("tools.touch", async (db) => void (await db.update(T).set({ updatedAt: new Date() }).where(eq(T.id, id)))),
        visibleByIds: (userId, ids) =>
          query("tools.visibleByIds", async (db) => {
            if (ids.length === 0) return []
            const orgIds = await orgIdsOf(db, userId)
            return (await db.select().from(T).where(and(inArray(T.id, [...ids]),
              or(eq(T.ownerId, userId), orgIds.length ? inArray(T.organizationId, orgIds) : undefined)))).map(toRow)
          }),
        importMany: (userId, items, mode) =>
          query("tools.importMany", (db) => {
            const num = (v: unknown) => (v ? parseFloat(String(v)) : undefined)
            const int = (v: unknown) => (v ? parseInt(String(v)) : undefined)
            const fields = (t: Record<string, unknown>) => ({
              name: String(t.name), type: String(t.type), diameter: parseFloat(String(t.diameter)), material: String(t.material),
              numberOfFlutes: int(t.numberOfFlutes) ?? null, maxRPM: int(t.maxRPM) ?? null, coolantType: (t.coolantType as string) || null,
              cuttingLength: num(t.cuttingLength) ?? null, totalLength: num(t.totalLength) ?? null, shankDiameter: num(t.shankDiameter) ?? null,
              cornerRadius: num(t.cornerRadius) ?? null, tipAngle: num(t.tipAngle) ?? null, threadPitch: num(t.threadPitch) ?? null,
              holderDiameter: num(t.holderDiameter) ?? null, holderLength: num(t.holderLength) ?? null, stickout: num(t.stickout) ?? null,
              notes: (t.notes as string) || null
            })
            return importLoop(items, mode, {
              validate: (t) => {
                const errors: string[] = []
                if (!t.name) errors.push("Name is required")
                if (!t.type) errors.push("Type is required")
                if (!t.diameter) errors.push("Diameter is required")
                if (!t.material) errors.push("Material is required")
                return errors.length ? errors.join(", ") : undefined
              },
              exists: async (id) => (await db.select({ id: T.id }).from(T).where(eq(T.id, id)).limit(1)).length > 0,
              create: async (t) => (await db.insert(T).values({ ...fields(t), ownerId: userId }).returning())[0]!.id,
              update: async (id, t) => {
                await db.update(T).set({ ...fields(t), updatedAt: new Date() }).where(eq(T.id, id))
                return id
              }
            })
          }),
        create: (userId, input) =>
          query("tools.create", async (db) => {
            const [row] = await db.insert(T).values({
              name: input.name, type: input.type, diameter: input.diameter, material: input.material,
              numberOfFlutes: input.numberOfFlutes ?? null, maxRPM: input.maxRPM ?? null, coolantType: input.coolantType ?? null,
              cuttingLength: input.cuttingLength ?? null, totalLength: input.totalLength ?? null, shankDiameter: input.shankDiameter ?? null,
              cornerRadius: input.cornerRadius ?? null, tipAngle: input.tipAngle ?? null, threadPitch: input.threadPitch ?? null,
              holderDiameter: input.holderDiameter ?? null, holderLength: input.holderLength ?? null, stickout: input.stickout ?? null,
              notes: input.notes ?? null, ownerId: userId, organizationId: input.organizationId || null, isPublic: input.isPublic || false
            }).returning()
            return toRow(row!)
          }).pipe(Effect.tap((row) => row.ownerId ? events.resourcesChanged(row.ownerId) : Effect.void)),
        update: (id, i) =>
          query("tools.update", async (db) => {
            // Same truthiness rules as the legacy spread: required text/number fields only when truthy, the rest when defined.
            const [row] = await db.update(T).set({
              ...(i.name && { name: i.name }), ...(i.type && { type: i.type }),
              ...(i.diameter && { diameter: i.diameter }), ...(i.material && { material: i.material }),
              ...(i.numberOfFlutes !== undefined && { numberOfFlutes: i.numberOfFlutes }),
              ...(i.maxRPM !== undefined && { maxRPM: i.maxRPM }),
              ...(i.coolantType !== undefined && { coolantType: i.coolantType }),
              ...(i.cuttingLength !== undefined && { cuttingLength: i.cuttingLength }),
              ...(i.totalLength !== undefined && { totalLength: i.totalLength }),
              ...(i.shankDiameter !== undefined && { shankDiameter: i.shankDiameter }),
              ...(i.cornerRadius !== undefined && { cornerRadius: i.cornerRadius }),
              ...(i.tipAngle !== undefined && { tipAngle: i.tipAngle }),
              ...(i.threadPitch !== undefined && { threadPitch: i.threadPitch }),
              ...(i.holderDiameter !== undefined && { holderDiameter: i.holderDiameter }),
              ...(i.holderLength !== undefined && { holderLength: i.holderLength }),
              ...(i.stickout !== undefined && { stickout: i.stickout }),
              ...(i.notes !== undefined && { notes: i.notes }),
              ...(i.isPublic !== undefined && { isPublic: i.isPublic }),
              updatedAt: new Date()
            }).where(eq(T.id, id)).returning()
            return toRow(row!)
          }).pipe(Effect.tap((row) => row.ownerId ? events.resourcesChanged(row.ownerId) : Effect.void)),
        remove: (id) => query("tools.remove", async (db) => (await db.delete(T).where(eq(T.id, id)).returning({ ownerId: T.ownerId }))[0]).pipe(Effect.tap((row) => row?.ownerId ? events.resourcesChanged(row.ownerId) : Effect.void), Effect.asVoid)
      })
    })
  ).pipe(Layer.provide(LiveEvents.layer))
}
