import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

const failure = { success: Schema.Literal(false), message: Schema.String }
export class WaitlistBadRequest extends Schema.TaggedError<WaitlistBadRequest>()("WaitlistBadRequest", failure, { httpApiStatus: 400 }) {}
export class WaitlistConflict extends Schema.TaggedError<WaitlistConflict>()("WaitlistConflict", failure, { httpApiStatus: 409 }) {}
export class WaitlistInternal extends Schema.TaggedError<WaitlistInternal>()("WaitlistInternal", failure, { httpApiStatus: 500 }) {}
export const WaitlistRequest = Schema.Struct({ email: Schema.String })
export const WaitlistResponse = Schema.Struct({ success: Schema.Literal(true), message: Schema.String })
export class WaitlistGroup extends HttpApiGroup.make("waitlist")
  .add(HttpApiEndpoint.post("join", "/api/waitlist", {
    payload: WaitlistRequest,
    success: WaitlistResponse.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: [WaitlistBadRequest, WaitlistConflict, WaitlistInternal]
  }))
{}
