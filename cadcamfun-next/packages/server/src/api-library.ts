import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Machines, Materials, Tools } from "@cadcamfun/cam"

export class ItemNotFound extends Schema.TaggedError<ItemNotFound>()("ItemNotFound", {
  kind: Schema.String,
  id: Schema.String,
}) {}

export class ItemReadOnly extends Schema.TaggedError<ItemReadOnly>()("ItemReadOnly", {
  kind: Schema.String,
  id: Schema.String,
}) {}

export const LibraryKind = Schema.Literals(["tools", "materials", "machines"])
export type LibraryKind = typeof LibraryKind.Type

/** Stored library entry: the item plus whether it is a built-in (read-only, cloneable) preset. */
const entry = <S extends Schema.Top>(item: S) =>
  Schema.Struct({ item, builtin: Schema.Boolean, updatedAt: Schema.String })

const NotFound = ItemNotFound.pipe(HttpApiSchema.status(404))
const ReadOnly = ItemReadOnly.pipe(HttpApiSchema.status(403))

/**
 * CRUD + clone + bulk import/export for one library kind. All three kinds share the same
 * contract, so the client and the handlers are generic too.
 */
const libraryGroup = <const Name extends LibraryKind, S extends Schema.Top>(name: Name, item: S) =>
  HttpApiGroup.make(name)
    .add(
      HttpApiEndpoint.get("list", "/", { success: Schema.Array(entry(item)) }),
      HttpApiEndpoint.get("get", "/:id", { params: { id: Schema.String }, success: entry(item), error: NotFound }),
      HttpApiEndpoint.post("create", "/", { payload: item, success: entry(item) }),
      HttpApiEndpoint.put("update", "/:id", {
        params: { id: Schema.String },
        payload: item,
        success: entry(item),
        error: [NotFound, ReadOnly],
      }),
      HttpApiEndpoint.delete("remove", "/:id", { params: { id: Schema.String }, error: [NotFound, ReadOnly] }),
      HttpApiEndpoint.post("clone", "/:id/clone", {
        params: { id: Schema.String },
        success: entry(item),
        error: NotFound,
      }),
      HttpApiEndpoint.post("import", "/import", {
        payload: Schema.Struct({ items: Schema.Array(item) }),
        success: Schema.Struct({ imported: Schema.Int }),
      }),
      HttpApiEndpoint.get("export", "/export", {
        success: Schema.Struct({ kind: Schema.Literal(name), items: Schema.Array(item) }),
      }),
    )
    .prefix(`/library/${name}`)

export class ToolsApi extends libraryGroup("tools", Tools.Tool) {}
export class MaterialsApi extends libraryGroup("materials", Materials.Material) {}
export class MachinesApi extends libraryGroup("machines", Machines.Machine) {}
