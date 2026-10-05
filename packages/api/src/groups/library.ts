import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, KeyedInternal, NotFound } from "../errors.ts"
import { MaterialRow } from "./materials.ts"
import { ToolRow } from "./tools.ts"

const NullStr = Schema.NullOr(Schema.String)

export const LibraryItemRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: NullStr,
  category: Schema.String,
  type: Schema.String,
  data: Schema.Unknown,
  properties: Schema.Unknown,
  tags: Schema.Unknown,
  thumbnail: NullStr,
  isPublic: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  ownerId: NullStr,
  organizationId: NullStr
})
export type LibraryItemRow = typeof LibraryItemRow.Type

export const LibraryItemBody = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(NullStr),
  category: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  data: Schema.optional(Schema.Unknown),
  properties: Schema.optional(Schema.Unknown),
  tags: Schema.optional(Schema.Unknown),
  organizationId: Schema.optional(NullStr),
  isPublic: Schema.optional(Schema.Boolean)
})

const OwnerRef = Schema.Struct({ id: Schema.String, name: NullStr, email: NullStr, image: NullStr })
const withOwner = <A extends Schema.Struct<Schema.Struct.Fields>>(row: A) => Schema.Struct({ ...row.fields, owner: Schema.NullOr(OwnerRef) })
const listOf = <A extends Schema.Top>(item: A) => Schema.Struct({ data: Schema.Array(item) })

const id = { id: Schema.String }
const Message = Schema.Struct({ message: Schema.String })

export class LibraryGroup extends HttpApiGroup.make("library")
  .add(
    HttpApiEndpoint.get("list", "/api/library", {
      query: { category: Schema.optional(Schema.String), type: Schema.optional(Schema.String), search: Schema.optional(Schema.String) },
      success: Schema.Array(LibraryItemRow), error: InternalError
    }),
    HttpApiEndpoint.post("create", "/api/library", {
      payload: LibraryItemBody, success: LibraryItemRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, Forbidden, InternalError]
    }),
    HttpApiEndpoint.get("get", "/api/library/:id", { params: id, success: LibraryItemRow, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/library/:id", { params: id, payload: LibraryItemBody, success: LibraryItemRow, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.delete("remove", "/api/library/:id", { params: id, success: Message, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    // Typed catalogue lists (own + public, with owner); errors use the `{ error }` shape.
    HttpApiEndpoint.get("components", "/api/library/components", { success: listOf(withOwner(LibraryItemRow)), error: KeyedInternal }),
    HttpApiEndpoint.get("materials", "/api/library/materials", { success: listOf(withOwner(MaterialRow)), error: KeyedInternal }),
    HttpApiEndpoint.get("tools", "/api/library/tools", { success: listOf(withOwner(ToolRow)), error: KeyedInternal })
  )
{}
