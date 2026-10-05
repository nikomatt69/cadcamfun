import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "../errors.ts"

const nullable = Schema.NullOr(Schema.String)
// Fields are optional so the handler can answer "Missing required fields" like the legacy route.
export const UploadBody = Schema.Struct({
  fileName: Schema.optional(Schema.String), fileType: Schema.optional(Schema.String),
  organizationId: Schema.optional(Schema.String), conversationId: Schema.optional(Schema.String),
  fileSize: Schema.optional(Schema.Number)
})
export const FileUploadRow = Schema.Struct({
  id: Schema.String, fileName: Schema.String, s3Key: Schema.String, s3Bucket: Schema.String,
  s3ContentType: Schema.String, s3Size: Schema.Number, objectId: nullable, objectType: nullable,
  ownerId: Schema.String, organizationId: nullable, createdAt: Schema.String, updatedAt: Schema.String
})
export const UploadResponse = Schema.Struct({
  upload: Schema.Struct({ ...FileUploadRow.fields, publicUrl: Schema.String }), uploadUrl: Schema.String
})
export class FilesGroup extends HttpApiGroup.make("files")
  .add(
    HttpApiEndpoint.post("upload", "/api/upload", { payload: UploadBody, success: UploadResponse, error: [BadRequest, Forbidden, InternalError] }),
    HttpApiEndpoint.get("download", "/api/download", { success: HttpApiSchema.StreamUint8Array({ contentType: "application/zip" }), error: [NotFound, InternalError] })
  )
{}
