import { Effect } from "effect"
import { statSync } from "node:fs"
import { Database } from "./index.ts"

const [path, option, ...extra] = Bun.argv.slice(2)
if (!path || path.startsWith("-") || (option !== undefined && option !== "--compact") || extra.length > 0) {
  console.error("Usage: bun --no-env-file src/storage-cli.ts <existing-database-path> [--compact]")
  process.exit(1)
}
try {
  if (!statSync(path).isFile()) throw new Error("Not a file")
} catch {
  console.error("Database must be an existing local file.")
  process.exit(1)
}

const program = Effect.gen(function*() {
  const database = yield* Database
  return option === "--compact" ? yield* database.compact() : yield* database.storage()
}).pipe(Effect.provide(Database.layer({ path })))

try {
  console.log(JSON.stringify(await Effect.runPromise(program), null, 2))
} catch {
  console.error("Database maintenance failed. Close the app and retry; compaction also requires free disk space.")
  process.exitCode = 1
}
