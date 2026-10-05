/**
 * Golden-file helper. Goldens live in `test/golden/*.nc`. Regenerate only with
 * `UPDATE_GOLDEN=1 bun test packages/core` and review the diff.
 *
 * (Bun 1.4 does not pass `--update-snapshots` through to the test process, so the
 * spec's flag cannot be detected here; an environment variable is the equivalent.)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { expect } from "bun:test"

const goldenDir = join(import.meta.dir, "golden")

const updating = (): boolean => process.env["UPDATE_GOLDEN"] === "1" || process.argv.includes("--update-snapshots")

export const expectGolden = (name: string, actual: string): void => {
  const file = join(goldenDir, name)
  if (updating()) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, actual)
    return
  }
  if (!existsSync(file)) {
    throw new Error(`Missing golden file ${name}; create it with: UPDATE_GOLDEN=1 bun test packages/core`)
  }
  expect(actual).toBe(readFileSync(file, "utf8"))
}
