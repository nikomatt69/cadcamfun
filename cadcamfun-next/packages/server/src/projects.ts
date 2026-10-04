import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { Doc } from "@cadcamfun/core"
import { Operations } from "@cadcamfun/cam"
import { defaultSetup } from "@cadcamfun/ai"
import { ProjectNotFound, type Project, type ProjectSummary } from "./api"

const DocumentJson = Schema.fromJsonString(Doc.CadDocument)
const SetupJson = Schema.fromJsonString(Operations.Setup)

interface Row {
  readonly id: string
  readonly name: string
  readonly document: string
  readonly setup: string
  readonly created_at: string
  readonly updated_at: string
}

/** Project persistence. Documents and setups are stored as schema-validated JSON. */
export class Projects extends Context.Service<
  Projects,
  {
    readonly list: Effect.Effect<ReadonlyArray<ProjectSummary>>
    readonly get: (id: string) => Effect.Effect<Project, ProjectNotFound>
    readonly create: (input: { readonly name: string; readonly units?: Doc.Units }) => Effect.Effect<Project>
    readonly save: (
      id: string,
      input: { readonly name?: string; readonly document: Doc.CadDocument; readonly setup: Operations.Setup },
    ) => Effect.Effect<Project, ProjectNotFound>
    readonly remove: (id: string) => Effect.Effect<void, ProjectNotFound>
  }
>()("@cadcamfun/server/Projects") {
  static readonly layer = Layer.effect(
    Projects,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const decode = (row: Row) =>
        Effect.all({
          document: Schema.decodeUnknownEffect(DocumentJson)(row.document),
          setup: Schema.decodeUnknownEffect(SetupJson)(row.setup),
        }).pipe(
          Effect.map(
            ({ document, setup }): Project => ({
              id: row.id,
              name: row.name,
              document,
              setup,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            }),
          ),
        )

      const encode = (document: Doc.CadDocument, setup: Operations.Setup) =>
        Effect.all({
          document: Schema.encodeEffect(DocumentJson)(document),
          setup: Schema.encodeEffect(SetupJson)(setup),
        })

      const get = Effect.fn("Projects.get")(
        function* (id: string) {
          const rows = yield* sql<Row>`SELECT * FROM projects WHERE id = ${id}`
          if (rows.length === 0) return yield* new ProjectNotFound({ id })
          return yield* decode(rows[0]!)
        },
        Effect.catchTag(["SqlError", "SchemaError"], Effect.die),
      )

      return Projects.of({
        list: sql<Row>`SELECT * FROM projects ORDER BY updated_at DESC`.pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decode)),
          Effect.map((projects) =>
            projects.map((p) => ({
              id: p.id,
              name: p.name,
              updatedAt: p.updatedAt,
              elements: p.document.elements.length,
              operations: p.setup.operations.length,
            })),
          ),
          Effect.orDie,
          Effect.withSpan("Projects.list"),
        ),
        get,
        create: Effect.fn("Projects.create")(function* ({ name, units }) {
          const document = { ...Doc.empty(name, units ?? "mm") }
          const now = new Date().toISOString()
          const json = yield* encode(document, defaultSetup)
          yield* sql`INSERT INTO projects ${sql.insert({
            id: document.id,
            name,
            document: json.document,
            setup: json.setup,
            created_at: now,
            updated_at: now,
          })}`
          return { id: document.id, name, document, setup: defaultSetup, createdAt: now, updatedAt: now }
        }, Effect.orDie),
        save: Effect.fn("Projects.save")(function* (id, input) {
          const current = yield* get(id)
          const json = yield* encode(input.document, input.setup).pipe(Effect.orDie)
          const updatedAt = new Date().toISOString()
          const name = input.name ?? current.name
          yield* sql`UPDATE projects SET name = ${name}, document = ${json.document}, setup = ${json.setup}, updated_at = ${updatedAt} WHERE id = ${id}`.pipe(
            Effect.orDie,
          )
          return { ...current, name, document: input.document, setup: input.setup, updatedAt }
        }),
        remove: Effect.fn("Projects.remove")(function* (id) {
          yield* get(id)
          yield* sql`DELETE FROM projects WHERE id = ${id}`.pipe(Effect.orDie)
        }),
      })
    }),
  )
}
