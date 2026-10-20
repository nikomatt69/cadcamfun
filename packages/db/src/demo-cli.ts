import { Effect } from "effect"
import { createDemoDatabase } from "./demo.ts"

const [path, ...extra] = Bun.argv.slice(2)
if (!path || path.startsWith("-") || extra.length > 0) {
  console.error("Usage: bun --no-env-file src/demo-cli.ts <new-database-path>")
  process.exit(1)
}

try {
  const result = await Effect.runPromise(createDemoDatabase(path))
  console.log(JSON.stringify({ synthetic: true, storage: result.after }, null, 2))
} catch {
  console.error("Demo creation failed. Choose a new writable path; existing files are never overwritten.")
  process.exitCode = 1
}
