import { Database, DatabaseError, schema } from "@cadcamfun/db"
import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { isOrgMember } from "./access.ts"

type Row = typeof schema.fileUploadTable.$inferSelect

export const toFileRow = (r: Row) => ({
  ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString()
})

export class FileRepo extends Context.Service<FileRepo, {
  isOrgMember(userId: string, organizationId: string): Effect.Effect<boolean, DatabaseError>
  isParticipant(userId: string, conversationId: string): Effect.Effect<boolean, DatabaseError>
  create(input: {
    fileName: string; s3Key: string; s3Bucket: string; s3ContentType: string; s3Size: number
    objectId: string; objectType: string; ownerId: string; organizationId: string
  }): Effect.Effect<ReturnType<typeof toFileRow>, DatabaseError>
}>()("cadcamfun/FileRepo") {
  static readonly layer = Layer.effect(FileRepo, Effect.gen(function*() {
    const { query } = yield* Database
    const P = schema.conversationParticipantTable
    return FileRepo.of({
      isOrgMember: (userId, organizationId) => query("files.isOrgMember", (db) => isOrgMember(db, userId, organizationId)),
      isParticipant: (userId, conversationId) =>
        query("files.isParticipant", async (db) =>
          (await db.select({ id: P.id }).from(P).where(and(eq(P.userId, userId), eq(P.conversationId, conversationId))).limit(1)).length > 0),
      create: (input) => query("files.create", async (db) => {
        const [row] = await db.insert(schema.fileUploadTable).values(input).returning()
        return toFileRow(row!)
      })
    })
  }))
}
