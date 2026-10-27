import { Config, Effect } from "effect"
import { Database } from "./index.ts"

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname

/** `DATABASE_URL` (a `file:` URL or a path), read through Effect `Config` like the sidecar's configuration. */
const DatabasePath = Config.withDefault(Config.string("DATABASE_URL"), "./data/cadcamfun.db").pipe(
  Config.map((url) => url.replace(/^file:/, ""))
)

// Opening the layer applies pending migrations; the scope closes the handle again.
const program = Effect.gen(function*() {
  const path = yield* DatabasePath
  yield* Effect.gen(function*() {
    yield* Database
    yield* Effect.log(`migrated ${path}`)
  }).pipe(Effect.provide(Database.layer({ path, migrationsFolder })))
})

Effect.runPromise(program)
