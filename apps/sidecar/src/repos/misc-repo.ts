import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { isOrgMember } from "./access.ts"

export class MiscRepo extends Context.Service<MiscRepo, {
  savePush(userId: string, sub: { endpoint: string; p256dh: string; auth: string }): Effect.Effect<string, DatabaseError>
  deletePush(userId: string, endpoint: string): Effect.Effect<void, DatabaseError>
  ownedProjects(userId: string): Effect.Effect<Array<typeof schema.projectTable.$inferSelect>, DatabaseError>
  isMember(userId: string, organizationId: string): Effect.Effect<boolean, DatabaseError>
  createProject(userId: string, input: { name: string; description: string | null; organizationId: string | null; isPublic: boolean }): Effect.Effect<typeof schema.projectTable.$inferSelect, DatabaseError>
  logActivity(userId: string, itemId: string, itemType: string, action: string, details: unknown): Effect.Effect<void>
  userByEmail(email: string): Effect.Effect<{ id: string; name: string | null; email: string | null; image: string | null; createdAt: Date; updatedAt: Date } | undefined, DatabaseError>
}>()("cadcamfun/MiscRepo") {
  static readonly layer = Layer.effect(MiscRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const P = schema.projectTable
    const U = schema.userTable
    return MiscRepo.of({
      savePush: (userId, sub) => query("misc.savePush", async (db) => {
        const T = schema.pushSubscriptionTable
        const [row] = await db.insert(T).values({ userId, ...sub })
          .onConflictDoUpdate({ target: T.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth } }).returning({ id: T.id })
        return row!.id
      }),
      deletePush: (userId, endpoint) => query("misc.deletePush", async (db) => {
        const T = schema.pushSubscriptionTable
        await db.delete(T).where(and(eq(T.userId, userId), eq(T.endpoint, endpoint)))
      }),
      ownedProjects: (userId) => query("misc.ownedProjects", (db) => db.select().from(P).where(eq(P.ownerId, userId)).orderBy(desc(P.updatedAt))),
      isMember: (userId, organizationId) => query("misc.isMember", (db) => isOrgMember(db, userId, organizationId)),
      createProject: (userId, input) => query("misc.createProject", async (db) =>
        (await db.insert(P).values({ name: input.name, description: input.description, ownerId: userId, organizationId: input.organizationId, isPublic: input.isPublic }).returning())[0]!),
      logActivity: (userId, itemId, itemType, action, details) => query("misc.logActivity", async (db) => {
        await db.insert(schema.activityLogTable).values({ userId, itemId, itemType, action, details })
      }).pipe(Effect.ignore),
      userByEmail: (email) => query("misc.userByEmail", async (db) =>
        (await db.select({ id: U.id, name: U.name, email: U.email, image: U.image, createdAt: U.createdAt, updatedAt: U.updatedAt }).from(U).where(eq(U.email, email)).limit(1))[0])
    })
  }))
}
