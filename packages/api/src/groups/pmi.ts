import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Conflict, Forbidden, InternalError, NotFound } from "../errors.ts"

/** PMI of a drawing (spec 49 P1): rides `Drawing.data.pmi`, validated server-side like the title block. */
export const PmiIssueRow = Schema.Struct({ annotationId: Schema.optional(Schema.String), code: Schema.String, message: Schema.String })
export const PmiResponse = Schema.Struct({
  drawingId: Schema.String,
  pmi: Schema.Unknown,
  fingerprint: Schema.String,
  issues: Schema.Array(PmiIssueRow)
})
export type PmiResponse = typeof PmiResponse.Type

export const PmiBody = Schema.Struct({
  pmi: Schema.Unknown,
  /** `updatedAt` of the copy the caller read; a concurrent save is a 409 and nothing is written. */
  baseUpdatedAt: Schema.optional(Schema.String)
})

const id = { id: Schema.String }

export class PmiGroup extends HttpApiGroup.make("pmi")
  .add(
    HttpApiEndpoint.get("get", "/api/drawings/:id/pmi", { params: id, success: PmiResponse, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/drawings/:id/pmi", {
      params: id, payload: PmiBody, success: PmiResponse, error: [BadRequest, Forbidden, NotFound, Conflict, InternalError]
    })
  )
{}
