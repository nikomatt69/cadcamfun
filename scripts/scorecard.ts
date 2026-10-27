/**
 * `bun run scorecard` (spec 55 E3): writes `specs/assets/parity-scorecard.md` from the capabilities, the corpus manifest and the
 * last corpus report (`data/corpus-report.json`; run `bun run corpus` first for level 3 to be possible).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import parity from "../packages/core/test/corpus/parity.json"
import { CORPUS } from "../packages/core/test/corpus/runner.ts"
import { renderScorecard, scoreRows, type Capability, type CorpusReport } from "../packages/core/test/corpus/scorecard.ts"

const repo = join(import.meta.dir, "..")
const reportPath = join(repo, "data", "corpus-report.json")
const report = existsSync(reportPath) ? (JSON.parse(readFileSync(reportPath, "utf8")) as CorpusReport) : undefined
const rows = scoreRows(parity.capabilities as ReadonlyArray<Capability>, CORPUS, report, join(repo, "packages", "core"))
const out = join(repo, "specs", "assets", "parity-scorecard.md")
writeFileSync(out, renderScorecard(rows, report, new Date().toISOString().slice(0, 10)))
for (const level of [3, 2, 1, 0]) console.log(`level ${level}: ${rows.filter((r) => r.level === level).map((r) => r.capability.id).join(", ") || "none"}`)
console.log(`scorecard: ${out}`)
