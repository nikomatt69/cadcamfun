import { Api, BadRequest, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpServerResponse } from "effect/unstable/http"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { AppConfigService } from "../config.ts"
import { FileRepo } from "../repos/file-repo.ts"
import { StorageService } from "../services/storage.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

/** Local stand-in for the legacy 4everland bucket; objects live under `<dataDir>/storage`. */
const BUCKET = "local"

export const FilesHandlers = HttpApiBuilder.group(Api, "files", Effect.fn(function*(handlers) {
  const repo = yield* FileRepo
  const storage = yield* StorageService
  const config = yield* AppConfigService
  return handlers
    .handle("upload", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const { fileName, fileType, organizationId, conversationId, fileSize } = payload
      if (!fileName || !fileType || !organizationId || !conversationId) {
        return yield* new BadRequest({ message: "Missing required fields" })
      }
      if (!(yield* repo.isOrgMember(user.id, organizationId))) {
        return yield* new Forbidden({ message: "Not a member of this organization" })
      }
      if (!(yield* repo.isParticipant(user.id, conversationId))) {
        return yield* new Forbidden({ message: "Not a participant in this conversation" })
      }
      const extension = fileName.split(".").pop()
      const key = `conversations/${organizationId}/${conversationId}/${crypto.randomUUID()}.${extension}`
      const upload = yield* repo.create({
        fileName, s3Key: key, s3Bucket: BUCKET, s3ContentType: fileType, s3Size: fileSize || 0,
        objectId: conversationId, objectType: "CONVERSATION", ownerId: user.id, organizationId
      })
      const url = yield* storage.signedUrl(key).pipe(
        Effect.catchTag("StorageError", fail("Error generating signed URL for 4everland")))
      return { upload: { ...upload, publicUrl: url }, uploadUrl: url }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to process upload request"))))
    .handle("download", () => Effect.gen(function*() {
      const file = join(config.dataDir, "downloads", "cadcamfun-app.zip")
      const read = yield* Effect.tryPromise({ try: () => readFile(file), catch: (e) => e as NodeJS.ErrnoException }).pipe(
        Effect.map((buf) => ({ buf }) as { buf: Buffer } | { missing: true }),
        Effect.catch((e) => e.code === "ENOENT"
          ? Effect.succeed({ missing: true } as { buf: Buffer } | { missing: true })
          : Effect.logError("Download error", e).pipe(Effect.andThen(Effect.fail(new InternalError({ message: "Internal server error" }))))))
      if ("missing" in read) return yield* new NotFound({ message: "File not found" })
      const bytes = read.buf
      return HttpServerResponse.uint8Array(new Uint8Array(bytes), {
        contentType: "application/zip",
        headers: { "content-disposition": "attachment; filename=CADCAMFUN.zip", "content-length": String(bytes.length) }
      })
    // The success schema is a byte stream; answering with a ready-made response keeps the legacy headers.
    }) as unknown as Effect.Effect<never, NotFound | InternalError>)
}))
