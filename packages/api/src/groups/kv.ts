import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, InternalError, NotFound } from "../errors.ts"

export const KvEntry = Schema.Struct({ key: Schema.String, value: Schema.Unknown, updatedAt: Schema.String })
export const KvSetBody = Schema.Struct({ value: Schema.Unknown })
const key = { key: Schema.String }

/** Persistent key-value state (AI settings, memory and per-project context, UI preferences). */
export class KvGroup extends HttpApiGroup.make("kv")
  .add(
    HttpApiEndpoint.get("list", "/api/kv", { query: { prefix: Schema.optional(Schema.String) }, success: Schema.Struct({ entries: Schema.Array(KvEntry) }), error: InternalError }),
    HttpApiEndpoint.get("get", "/api/kv/:key", { params: key, success: KvEntry, error: [NotFound, InternalError] }),
    HttpApiEndpoint.put("set", "/api/kv/:key", { params: key, payload: KvSetBody, success: KvEntry, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.delete("remove", "/api/kv/:key", { params: key, success: Schema.Struct({ message: Schema.String }), error: [NotFound, InternalError] })
  )
{}
