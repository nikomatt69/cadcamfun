import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, count, desc, eq, inArray, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { createHash, randomBytes } from "node:crypto"
import { orgRef } from "./access.ts"

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export interface ProfileInput {
  name: string; bio: string | null; location: string | null; website: string | null; company: string | null
  title: string | null; publicProfile: boolean; showEmail: boolean; image?: string
}

/** Best-effort cleanup order for `DELETE /api/user/delete-account` (children before parents). */
const ACCOUNT_CLEANUP = [
  `DELETE FROM "ToolpathVersion" WHERE "toolpathId" IN (SELECT t."id" FROM "Toolpath" t JOIN "Project" p ON p."id" = t."projectId" WHERE p."ownerId" = ?1) OR "userId" = ?1`,
  `DELETE FROM "ToolpathComment" WHERE "toolpathId" IN (SELECT t."id" FROM "Toolpath" t JOIN "Project" p ON p."id" = t."projectId" WHERE p."ownerId" = ?1) OR "userId" = ?1`,
  `DELETE FROM "ProductionCostEstimate" WHERE "ownerId" = ?1 OR "toolpathId" IN (SELECT t."id" FROM "Toolpath" t JOIN "Project" p ON p."id" = t."projectId" WHERE p."ownerId" = ?1 OR t."createdBy" = ?1)`,
  `DELETE FROM "Toolpath" WHERE "createdBy" = ?1 OR "projectId" IN (SELECT "id" FROM "Project" WHERE "ownerId" = ?1)`,
  `DELETE FROM "ComponentVersion" WHERE "userId" = ?1 OR "componentId" IN (SELECT c."id" FROM "Component" c JOIN "Project" p ON p."id" = c."projectId" WHERE p."ownerId" = ?1)`,
  `DELETE FROM "ComponentComment" WHERE "userId" = ?1 OR "componentId" IN (SELECT c."id" FROM "Component" c JOIN "Project" p ON p."id" = c."projectId" WHERE p."ownerId" = ?1)`,
  `DELETE FROM "Component" WHERE "projectId" IN (SELECT "id" FROM "Project" WHERE "ownerId" = ?1)`,
  `DELETE FROM "DrawingVersion" WHERE "drawingId" IN (SELECT d."id" FROM "Drawing" d JOIN "Project" p ON p."id" = d."projectId" WHERE p."ownerId" = ?1)`,
  `DELETE FROM "Drawing" WHERE "projectId" IN (SELECT "id" FROM "Project" WHERE "ownerId" = ?1)`,
  `DELETE FROM "Project" WHERE "ownerId" = ?1`,
  `DELETE FROM "LibraryItem" WHERE "ownerId" = ?1`,
  `DELETE FROM "Material" WHERE "ownerId" = ?1`,
  `DELETE FROM "Tool" WHERE "ownerId" = ?1`,
  `DELETE FROM "MachineConfig" WHERE "ownerId" = ?1`,
  `DELETE FROM "ToolWearCost" WHERE "ownerId" = ?1`,
  `DELETE FROM "MaterialCost" WHERE "ownerId" = ?1`,
  `DELETE FROM "OperationCost" WHERE "ownerId" = ?1`,
  `DELETE FROM "CostSettings" WHERE "ownerId" = ?1`,
  `DELETE FROM "ActivityLog" WHERE "userId" = ?1`,
  `DELETE FROM "AIAnalysisLog" WHERE "userId" = ?1`,
  `DELETE FROM "Message" WHERE "senderId" = ?1`,
  `DELETE FROM "ConversationParticipant" WHERE "userId" = ?1`,
  `DELETE FROM "Notification" WHERE "userId" = ?1`,
  `DELETE FROM "PushSubscription" WHERE "userId" = ?1`,
  `DELETE FROM "FileUpload" WHERE "ownerId" = ?1`,
  `DELETE FROM "Subscription" WHERE "id" = ?1`
]

export class UserRepo extends Context.Service<UserRepo, {
  profile(id: string): Effect.Effect<unknown | undefined, DatabaseError>
  updateProfile(id: string, input: ProfileInput): Effect.Effect<unknown, DatabaseError>
  stats(id: string): Effect.Effect<unknown, DatabaseError>
  components(id: string): Effect.Effect<unknown[], DatabaseError>
  projects(id: string): Effect.Effect<unknown[], DatabaseError>
  toolpaths(id: string): Effect.Effect<unknown[], DatabaseError>
  organizations(id: string): Effect.Effect<unknown[], DatabaseError>
  publicUser(id: string): Effect.Effect<unknown | undefined, DatabaseError>
  apiKeys(id: string): Effect.Effect<unknown[], DatabaseError>
  createApiKey(id: string, name: string): Effect.Effect<string, DatabaseError>
  /** `true` when the key belonged to the user and was deleted. */
  revokeApiKey(userId: string, keyId: string): Effect.Effect<boolean, DatabaseError>
  credential(id: string): Effect.Effect<{ userExists: boolean; accountId?: string; hash?: string | null }, DatabaseError>
  setPassword(userId: string, accountId: string, hash: string): Effect.Effect<void, DatabaseError>
  deleteAccount(id: string): Effect.Effect<boolean, DatabaseError>
  verifyChange(token: string, type: string, password: string | undefined): Effect.Effect<
    { _tag: "ok"; type: string } | { _tag: "missing" } | { _tag: "expired" } | { _tag: "wrongType" } | { _tag: "needsPassword" }, DatabaseError>
}>()("cadcamfun/UserRepo") {
  static readonly layer = Layer.effect(UserRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const U = schema.userTable
    const profileCols = {
      id: U.id, name: U.name, email: U.email, image: U.image, bio: U.bio, location: U.location, website: U.website,
      company: U.company, title: U.title, publicProfile: U.publicProfile, showEmail: U.showEmail
    }
    const thumbs = (rows: Array<{ createdAt: Date; updatedAt: Date; [k: string]: unknown }>) =>
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }))
    return UserRepo.of({
      profile: (id) => query("user.profile", async (db) => {
        const [row] = await db.select({ ...profileCols, createdAt: U.createdAt }).from(U).where(eq(U.id, id)).limit(1)
        if (!row) return undefined
        const [n] = await db.select({ n: count() }).from(schema.projectTable).where(eq(schema.projectTable.ownerId, id))
        return { ...row, createdAt: row.createdAt.toISOString(), _count: { projects: n?.n ?? 0 } }
      }),
      updateProfile: (id, input) => query("user.updateProfile", async (db) => {
        const [row] = await db.update(U).set({
          name: input.name, bio: input.bio, location: input.location, website: input.website, company: input.company,
          title: input.title, publicProfile: input.publicProfile, showEmail: input.showEmail,
          ...(input.image ? { image: input.image } : {})
        }).where(eq(U.id, id)).returning({ ...profileCols, updatedAt: U.updatedAt })
        return { ...row!, updatedAt: row!.updatedAt.toISOString() }
      }),
      stats: (id) => query("user.stats", async (db) => {
        const P = schema.projectTable
        const owned = db.select({ id: P.id }).from(P).where(eq(P.ownerId, id))
        const [u] = await db.select({ createdAt: U.createdAt }).from(U).where(eq(U.id, id)).limit(1)
        const [projects] = await db.select({ n: count() }).from(P).where(eq(P.ownerId, id))
        const [drawings] = await db.select({ n: count() }).from(schema.drawingTable).where(inArray(schema.drawingTable.projectId, owned))
        const [toolpaths] = await db.select({ n: count() }).from(schema.toolpathTable).where(inArray(schema.toolpathTable.projectId, owned))
        const [components] = await db.select({ n: count() }).from(schema.componentTable).where(inArray(schema.componentTable.projectId, owned))
        return {
          projectsCount: projects?.n ?? 0, drawingsCount: drawings?.n ?? 0, toolpathsCount: toolpaths?.n ?? 0,
          componentsCount: components?.n ?? 0, totalDesigns: (drawings?.n ?? 0) + (components?.n ?? 0),
          memberSince: (u?.createdAt ?? new Date()).toISOString()
        }
      }),
      components: (id) => query("user.components", async (db) => {
        const C = schema.componentTable
        return thumbs(await db.select({
          id: C.id, name: C.name, description: C.description, thumbnail: C.thumbnail, createdAt: C.createdAt, updatedAt: C.updatedAt, projectId: C.projectId
        }).from(C).where(inArray(C.projectId, db.select({ id: schema.projectTable.id }).from(schema.projectTable).where(eq(schema.projectTable.ownerId, id))))
          .orderBy(desc(C.updatedAt)))
      }),
      projects: (id) => query("user.projects", async (db) => {
        const P = schema.projectTable
        return thumbs(await db.select({ id: P.id, name: P.name, description: P.description, createdAt: P.createdAt, updatedAt: P.updatedAt })
          .from(P).where(eq(P.ownerId, id)).orderBy(desc(P.updatedAt)))
      }),
      toolpaths: (id) => query("user.toolpaths", async (db) => {
        const T = schema.toolpathTable
        return thumbs(await db.select({
          id: T.id, name: T.name, description: T.description, thumbnail: T.thumbnail, createdAt: T.createdAt, updatedAt: T.updatedAt, projectId: T.projectId
        }).from(T).where(eq(T.createdBy, id)).orderBy(desc(T.updatedAt)))
      }),
      organizations: (id) => query("user.organizations", async (db) => {
        const UO = schema.userOrganizationTable
        const memberships = await db.select().from(UO).where(eq(UO.userId, id))
        const orgs = await db.select().from(schema.organizationTable).where(inArray(schema.organizationTable.id, memberships.map((m) => m.organizationId)))
        const out: unknown[] = []
        for (const m of memberships) {
          const org = orgs.find((o) => o.id === m.organizationId)
          if (!org) continue
          const [users] = await db.select({ n: count() }).from(UO).where(eq(UO.organizationId, org.id))
          const [projects] = await db.select({ n: count() }).from(schema.projectTable).where(eq(schema.projectTable.organizationId, org.id))
          out.push({
            id: org.id, name: org.name, description: org.description, role: m.role, userCount: users?.n ?? 0,
            projectCount: projects?.n ?? 0, createdAt: org.createdAt.toISOString(), updatedAt: org.updatedAt.toISOString()
          })
        }
        return out
      }),
      publicUser: (id) => query("user.publicUser", async (db) => {
        const [row] = await db.select({ id: U.id, name: U.name, email: U.email, image: U.image, createdAt: U.createdAt }).from(U).where(eq(U.id, id)).limit(1)
        if (!row) return undefined
        const memberships = await db.select().from(schema.userOrganizationTable).where(eq(schema.userOrganizationTable.userId, id))
        const refs = await orgRef(db, memberships.map((m) => m.organizationId))
        return {
          ...row, createdAt: row.createdAt.toISOString(),
          organizations: memberships.flatMap((m) => { const o = refs.get(m.organizationId); return o ? [{ id: o.id, name: o.name, role: m.role }] : [] })
        }
      }),
      apiKeys: (id) => query("user.apiKeys", async (db) => {
        const K = schema.apiKeyTable
        return (await db.select({ id: K.id, name: K.name, createdAt: K.createdAt, lastUsed: K.lastUsed, expiresAt: K.expiresAt })
          .from(K).where(eq(K.userId, id)).orderBy(desc(K.createdAt)))
          .map((k) => ({ ...k, createdAt: k.createdAt.toISOString(), lastUsed: iso(k.lastUsed), expiresAt: iso(k.expiresAt) }))
      }),
      createApiKey: (id, name) => query("user.createApiKey", async (db) => {
        const apiKey = `cad_${randomBytes(24).toString("hex")}`
        await db.insert(schema.apiKeyTable).values({ name, keyHash: createHash("sha256").update(apiKey).digest("hex"), userId: id })
        return apiKey
      }),
      revokeApiKey: (userId, keyId) => query("user.revokeApiKey", async (db) => {
        const K = schema.apiKeyTable
        return (await db.delete(K).where(and(eq(K.id, keyId), eq(K.userId, userId))).returning({ id: K.id })).length > 0
      }),
      credential: (id) => query("user.credential", async (db) => {
        const [user] = await db.select({ id: U.id }).from(U).where(eq(U.id, id)).limit(1)
        if (!user) return { userExists: false }
        const A = schema.accountTable
        const [account] = await db.select().from(A).where(and(eq(A.userId, id), eq(A.providerId, "credential"))).limit(1)
        return { userExists: true, ...(account ? { accountId: account.id, hash: account.password } : {}) }
      }),
      setPassword: (userId, accountId, hash) => query("user.setPassword", async (db) => {
        await db.update(schema.accountTable).set({ password: hash, updatedAt: new Date() }).where(eq(schema.accountTable.id, accountId))
        await db.update(U).set({ updatedAt: new Date() }).where(eq(U.id, userId))
      }),
      deleteAccount: (id) => query("user.deleteAccount", async (db) => {
        for (const statement of ACCOUNT_CLEANUP) {
          try { db.run(sql.raw(statement.replaceAll("?1", `'${id.replaceAll("'", "''")}'`))) } catch { /* best effort, as the legacy route */ }
        }
        return (await db.delete(U).where(eq(U.id, id)).returning({ id: U.id })).length > 0
      }),
      verifyChange: (token, type, password) => query("user.verifyChange", async (db) => {
        const T = schema.tokenTable
        const [row] = await db.select().from(T).where(eq(T.token, token)).limit(1)
        if (!row) return { _tag: "missing" as const }
        if (row.expiresAt.getTime() < Date.now()) { await db.delete(T).where(eq(T.token, token)); return { _tag: "expired" as const } }
        if (row.type !== type) return { _tag: "wrongType" as const }
        if (type === "email") {
          const email = (row.metadata as { email?: string } | null)?.email
          await db.update(U).set({ email: email ?? null, emailVerified: new Date() }).where(eq(U.id, row.userId))
        } else if (type === "password") {
          if (!password) return { _tag: "needsPassword" as const }
          await db.update(U).set({ password: await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 }), updatedAt: new Date() }).where(eq(U.id, row.userId))
        }
        await db.delete(T).where(eq(T.token, token))
        return { _tag: "ok" as const, type }
      })
    })
  }))
}
