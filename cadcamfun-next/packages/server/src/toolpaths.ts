import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"
import {
  SavedToolpath,
  ToolpathNotFound,
  type ToolpathComment,
  type ToolpathInput,
  type ToolpathSummary,
  type ToolpathVersion,
} from "./api-toolpaths"

interface Row {
  readonly id: string
  readonly project_id: string
  readonly name: string
  readonly description: string | null
  readonly controller: string
  readonly gcode: string
  readonly program: string | null
  readonly setup: string | null
  readonly stats: string
  readonly created_at: string
  readonly updated_at: string
  readonly versions: number
}

interface UpdateInput {
  readonly name?: string
  readonly description?: string
  readonly gcode: string
  readonly program?: SavedToolpath["program"]
  readonly stats?: SavedToolpath["stats"]
  readonly message?: string
}

const decodeSaved = Schema.decodeUnknownEffect(SavedToolpath)
const uuid = () => crypto.randomUUID()

/** Saved toolpaths with full version history and comments. */
export class ToolpathStore extends Context.Service<
  ToolpathStore,
  {
    readonly listForProject: (projectId: string) => Effect.Effect<ReadonlyArray<ToolpathSummary>>
    readonly create: (projectId: string, input: typeof ToolpathInput.Type) => Effect.Effect<SavedToolpath>
    readonly get: (id: string) => Effect.Effect<SavedToolpath, ToolpathNotFound>
    readonly update: (id: string, input: UpdateInput) => Effect.Effect<SavedToolpath, ToolpathNotFound>
    readonly remove: (id: string) => Effect.Effect<void, ToolpathNotFound>
    readonly versions: (id: string) => Effect.Effect<ReadonlyArray<ToolpathVersion>, ToolpathNotFound>
    readonly restore: (id: string, versionId: string) => Effect.Effect<SavedToolpath, ToolpathNotFound>
    readonly comments: (id: string) => Effect.Effect<ReadonlyArray<ToolpathComment>, ToolpathNotFound>
    readonly addComment: (
      id: string,
      author: string,
      content: string,
    ) => Effect.Effect<ToolpathComment, ToolpathNotFound>
    readonly removeComment: (id: string, commentId: string) => Effect.Effect<void, ToolpathNotFound>
  }
>()("@cadcamfun/server/ToolpathStore") {
  static readonly layer = Layer.effect(
    ToolpathStore,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const toSaved = (row: Row) =>
        decodeSaved({
          id: row.id,
          projectId: row.project_id,
          name: row.name,
          ...(row.description ? { description: row.description } : {}),
          controller: row.controller,
          stats: JSON.parse(row.stats),
          versions: row.versions,
          updatedAt: row.updated_at,
          createdAt: row.created_at,
          gcode: row.gcode,
          ...(row.program ? { program: JSON.parse(row.program) } : {}),
          ...(row.setup ? { setup: JSON.parse(row.setup) } : {}),
        }).pipe(Effect.orDie)

      const get = (id: string) =>
        sql<Row>`SELECT t.*, (SELECT COUNT(*) FROM toolpath_versions v WHERE v.toolpath_id = t.id) AS versions
                 FROM toolpaths t WHERE t.id = ${id}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) => (rows[0] ? toSaved(rows[0]) : Effect.fail(new ToolpathNotFound({ id })))),
        )

      const encodeJson = (value: unknown) => (value === undefined ? null : JSON.stringify(value))

      const update = (id: string, input: UpdateInput) =>
        Effect.gen(function* () {
          const current = yield* get(id)
          const now = new Date().toISOString()
          // The previous state becomes a version, so every edit can be restored.
          yield* sql`INSERT INTO toolpath_versions ${sql.insert({
            id: uuid(),
            toolpath_id: id,
            message: input.message ?? null,
            gcode: current.gcode,
            program: encodeJson(current.program),
            stats: JSON.stringify(current.stats),
            created_at: now,
          })}`.pipe(Effect.orDie)
          yield* sql`UPDATE toolpaths SET
              name = ${input.name ?? current.name},
              description = ${input.description ?? current.description ?? null},
              gcode = ${input.gcode},
              program = ${encodeJson(input.program ?? current.program)},
              stats = ${JSON.stringify(input.stats ?? current.stats)},
              updated_at = ${now}
            WHERE id = ${id}`.pipe(Effect.orDie)
          return yield* get(id)
        })

      return ToolpathStore.of({
        listForProject: (projectId) =>
          sql<Row>`SELECT t.*, (SELECT COUNT(*) FROM toolpath_versions v WHERE v.toolpath_id = t.id) AS versions
                   FROM toolpaths t WHERE t.project_id = ${projectId} ORDER BY t.updated_at DESC`.pipe(
            Effect.orDie,
            Effect.flatMap((rows) => Effect.forEach(rows, toSaved)),
            Effect.map((items) =>
              items.map(({ gcode: _g, program: _p, setup: _s, createdAt: _c, ...summary }) => summary),
            ),
          ),
        create: (projectId, input) =>
          Effect.gen(function* () {
            const id = uuid()
            const now = new Date().toISOString()
            yield* sql`INSERT INTO toolpaths ${sql.insert({
              id,
              project_id: projectId,
              name: input.name,
              description: input.description ?? null,
              controller: input.controller,
              gcode: input.gcode,
              program: encodeJson(input.program),
              setup: encodeJson(input.setup),
              stats: JSON.stringify(input.stats),
              created_at: now,
              updated_at: now,
            })}`.pipe(Effect.orDie)
            return yield* get(id).pipe(Effect.orDie)
          }),
        get,
        update,
        remove: (id) =>
          get(id).pipe(
            Effect.andThen(
              Effect.all([
                sql`DELETE FROM toolpath_comments WHERE toolpath_id = ${id}`,
                sql`DELETE FROM toolpath_versions WHERE toolpath_id = ${id}`,
                sql`DELETE FROM toolpaths WHERE id = ${id}`,
              ]).pipe(sql.withTransaction, Effect.orDie),
            ),
            Effect.asVoid,
          ),
        versions: (id) =>
          get(id).pipe(
            Effect.andThen(
              sql<{ id: string; toolpath_id: string; message: string | null; gcode: string; created_at: string }>`
                SELECT * FROM toolpath_versions WHERE toolpath_id = ${id} ORDER BY created_at DESC, rowid DESC`.pipe(
                Effect.orDie,
              ),
            ),
            Effect.map((rows) =>
              rows.map((r) => ({
                id: r.id,
                toolpathId: r.toolpath_id,
                ...(r.message ? { message: r.message } : {}),
                gcode: r.gcode,
                createdAt: r.created_at,
              })),
            ),
          ),
        restore: (id, versionId) =>
          Effect.gen(function* () {
            const rows = yield* sql<{ gcode: string; program: string | null; stats: string; created_at: string }>`
              SELECT * FROM toolpath_versions WHERE id = ${versionId} AND toolpath_id = ${id}`.pipe(Effect.orDie)
            const v = rows[0]
            if (!v) return yield* new ToolpathNotFound({ id: versionId })
            return yield* update(id, {
              gcode: v.gcode,
              ...(v.program ? { program: JSON.parse(v.program) } : {}),
              stats: JSON.parse(v.stats),
              message: `Restored version from ${v.created_at}`,
            })
          }),
        comments: (id) =>
          get(id).pipe(
            Effect.andThen(
              sql<{ id: string; toolpath_id: string; author: string; content: string; created_at: string }>`
                SELECT * FROM toolpath_comments WHERE toolpath_id = ${id} ORDER BY created_at, rowid`.pipe(
                Effect.orDie,
              ),
            ),
            Effect.map((rows) =>
              rows.map((r) => ({
                id: r.id,
                toolpathId: r.toolpath_id,
                author: r.author,
                content: r.content,
                createdAt: r.created_at,
              })),
            ),
          ),
        addComment: (id, author, content) =>
          Effect.gen(function* () {
            yield* get(id)
            const comment = { id: uuid(), toolpathId: id, author, content, createdAt: new Date().toISOString() }
            yield* sql`INSERT INTO toolpath_comments ${sql.insert({
              id: comment.id,
              toolpath_id: id,
              author,
              content,
              created_at: comment.createdAt,
            })}`.pipe(Effect.orDie)
            return comment
          }),
        removeComment: (id, commentId) =>
          sql`DELETE FROM toolpath_comments WHERE id = ${commentId} AND toolpath_id = ${id}`.pipe(
            Effect.orDie,
            Effect.asVoid,
          ),
      })
    }),
  )
}
