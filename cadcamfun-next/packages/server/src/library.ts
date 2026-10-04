import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { CamLibrary, Machines, Materials, NotInLibrary, Tools } from "@cadcamfun/cam"
import { ItemNotFound, ItemReadOnly, type LibraryKind } from "./api-library"

interface Row {
  readonly id: string
  readonly kind: string
  readonly data: string
  readonly builtin: number
  readonly updated_at: string
}

const schemas = {
  tools: Tools.Tool,
  materials: Materials.Material,
  machines: Machines.Machine,
} as const

export type ItemOf<K extends LibraryKind> = (typeof schemas)[K]["Type"]
export interface Entry<A> {
  readonly item: A
  readonly builtin: boolean
  readonly updatedAt: string
}

export const presets: { readonly [K in LibraryKind]: ReadonlyArray<ItemOf<K>> } = {
  tools: Tools.presets,
  materials: Materials.presets,
  machines: Machines.presets,
}

/** Built-in presets as `library_items` rows (used by the seeding migration). */
export const encodePresets = Effect.forEach(Object.keys(schemas) as ReadonlyArray<LibraryKind>, (kind) =>
  Effect.forEach(presets[kind] as ReadonlyArray<{ readonly id: string }>, (item) =>
    Schema.encodeUnknownEffect(Schema.fromJsonString(schemas[kind] as Schema.Codec<unknown, any>))(item).pipe(
      Effect.map((data) => ({ id: item.id, kind, data })),
    ),
  ),
).pipe(
  Effect.map((groups) => groups.flat()),
  Effect.orDie,
)

export interface Store<A> {
  readonly list: Effect.Effect<ReadonlyArray<Entry<A>>>
  readonly get: (id: string) => Effect.Effect<Entry<A>, ItemNotFound>
  readonly create: (item: A) => Effect.Effect<Entry<A>>
  readonly update: (id: string, item: A) => Effect.Effect<Entry<A>, ItemNotFound | ItemReadOnly>
  readonly remove: (id: string) => Effect.Effect<void, ItemNotFound | ItemReadOnly>
  readonly clone: (id: string) => Effect.Effect<Entry<A>, ItemNotFound>
  readonly importItems: (items: ReadonlyArray<A>) => Effect.Effect<number>
}

/**
 * Tools, materials and machines in one table, each row a schema-validated JSON document.
 * Built-in presets are seeded read-only; users clone them to customise.
 */
export class Library extends Context.Service<
  Library,
  {
    readonly tools: Store<ItemOf<"tools">>
    readonly materials: Store<ItemOf<"materials">>
    readonly machines: Store<ItemOf<"machines">>
  }
>()("@cadcamfun/server/Library") {
  static readonly layer = Layer.effect(
    Library,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const store = <K extends LibraryKind>(kind: K): Store<ItemOf<K>> => {
        const json = Schema.fromJsonString(schemas[kind] as Schema.Codec<ItemOf<K>, any>)
        const decode = (row: Row) =>
          Schema.decodeUnknownEffect(json)(row.data).pipe(
            Effect.map((item): Entry<ItemOf<K>> => ({ item, builtin: row.builtin === 1, updatedAt: row.updated_at })),
          )
        const encode = Schema.encodeEffect(json)

        const get = (id: string) =>
          sql<Row>`SELECT * FROM library_items WHERE kind = ${kind} AND id = ${id}`.pipe(
            Effect.orDie,
            Effect.flatMap((rows) =>
              rows[0] ? decode(rows[0]).pipe(Effect.orDie) : Effect.fail(new ItemNotFound({ kind, id })),
            ),
          )

        const insert = (item: ItemOf<K>) =>
          Effect.gen(function* () {
            const exists = yield* sql<{
              n: number
            }>`SELECT COUNT(*) as n FROM library_items WHERE kind = ${kind} AND id = ${item.id}`
            const id =
              item.id && exists[0]!.n === 0 ? item.id : `${kind.slice(0, -1)}-${crypto.randomUUID().slice(0, 8)}`
            const withId = { ...item, id }
            const now = new Date().toISOString()
            yield* sql`INSERT INTO library_items ${sql.insert({ id, kind, data: yield* encode(withId), builtin: 0, created_at: now, updated_at: now })}`
            return { item: withId, builtin: false, updatedAt: now } satisfies Entry<ItemOf<K>>
          }).pipe(Effect.orDie)

        const writable = (id: string) =>
          get(id).pipe(
            Effect.flatMap((e) => (e.builtin ? Effect.fail(new ItemReadOnly({ kind, id })) : Effect.succeed(e))),
          )

        return {
          list: sql<Row>`SELECT * FROM library_items WHERE kind = ${kind} ORDER BY builtin DESC, updated_at`.pipe(
            Effect.flatMap((rows) => Effect.forEach(rows, decode)),
            Effect.orDie,
          ),
          get,
          create: insert,
          update: (id, item) =>
            Effect.gen(function* () {
              yield* writable(id)
              const now = new Date().toISOString()
              const next = { ...item, id }
              const data = yield* encode(next).pipe(Effect.orDie)
              yield* sql`UPDATE library_items SET data = ${data}, updated_at = ${now} WHERE kind = ${kind} AND id = ${id}`.pipe(
                Effect.orDie,
              )
              return { item: next, builtin: false, updatedAt: now }
            }),
          remove: (id) =>
            writable(id).pipe(
              Effect.andThen(sql`DELETE FROM library_items WHERE kind = ${kind} AND id = ${id}`.pipe(Effect.orDie)),
              Effect.asVoid,
            ),
          clone: (id) =>
            get(id).pipe(Effect.flatMap((e) => insert({ ...e.item, id: "", name: `${e.item.name} (copy)` }))),
          importItems: (items) => Effect.forEach(items, insert).pipe(Effect.map((r) => r.length)),
        }
      }

      return Library.of({ tools: store("tools"), materials: store("materials"), machines: store("machines") })
    }),
  )

  /** `CamLibrary` backed by the database, so CAM and the AI agent see user-defined items. */
  static readonly camLibrary = Layer.effect(
    CamLibrary,
    Effect.gen(function* () {
      const lib = yield* Library
      const items = <A>(s: Store<A>) => s.list.pipe(Effect.map((es) => es.map((e) => e.item)))
      const one =
        <A>(kind: NotInLibrary["kind"], s: Store<A>) =>
        (id: string) =>
          s.get(id).pipe(
            Effect.map((e) => e.item),
            Effect.mapError(() => new NotInLibrary({ kind, id })),
          )
      return CamLibrary.of({
        tools: items(lib.tools),
        materials: items(lib.materials),
        machines: items(lib.machines),
        tool: one("tool", lib.tools),
        material: one("material", lib.materials),
        machine: one("machine", lib.machines),
      })
    }),
  )
}
