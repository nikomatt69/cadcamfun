import { Effect } from "effect"
import { Database } from "./index.ts"

const path = process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/cadcamfun.db"
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname

// Opening the layer applies pending migrations; the scope closes the handle again.
const program = Effect.gen(function*() {
  yield* Database
  yield* Effect.log(`migrated ${path}`)
}).pipe(Effect.provide(Database.layer({ path, migrationsFolder })))

Effect.runPromise(program)
