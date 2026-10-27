/**
 * `bun run corpus` (spec 55 E1): runs the corpus, prints the table and writes `data/corpus-report.json`.
 * Exit code 1 when an entry is `wrong`; `refused` (registered) and `slow` are reported, not failures.
 *   --only=<id>[,<id>]   run only these entries
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { CORPUS, REFUSALS, countOutcomes, manifestProblems, renderTable, runEntry, type EntryResult } from "../packages/core/test/corpus/runner.ts"
import { fingerprint } from "../packages/core/test/corpus/fingerprint.ts"

const only = Bun.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",").filter((s) => s !== "")
const problems = manifestProblems(CORPUS, REFUSALS)
if (problems.length > 0) {
  console.error(`corpus manifest:\n  ${problems.join("\n  ")}`)
  process.exit(2)
}
const unknown = (only ?? []).filter((id) => !CORPUS.some((e) => e.id === id))
if (unknown.length > 0) {
  console.error(`unknown corpus entries: ${unknown.join(", ")}`)
  process.exit(2)
}
const entries = only === undefined ? CORPUS : CORPUS.filter((e) => only.includes(e.id))
const results: EntryResult[] = []
for (const entry of entries) {
  const r = runEntry(entry)
  results.push(r)
  console.error(`${r.outcome.padEnd(7)} ${entry.id} (${r.ms} ms)`)
}
const report = { generatedAt: new Date().toISOString(), complete: only === undefined, machine: fingerprint(), counts: countOutcomes(results), results }
const path = join(import.meta.dir, "..", "data", "corpus-report.json")
mkdirSync(dirname(path), { recursive: true })
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
console.log(renderTable(results))
console.log(`report: ${path}`)
process.exit(report.counts.wrong > 0 ? 1 : 0)
