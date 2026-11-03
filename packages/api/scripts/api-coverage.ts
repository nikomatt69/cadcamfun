// Compares the routes of the v6 API contract with the legacy inventory (specs/api-inventory.md).
// Usage: bun scripts/api-coverage.ts [--missing] [--strict]   (--strict: fail on any route neither covered nor in accepted-gaps.ts)
import { contractCoverage, parseInventory } from "./coverage.ts"
import { readFileSync } from "node:fs"

const result = contractCoverage(parseInventory(readFileSync(new URL("../../../specs/api-inventory.md", import.meta.url), "utf8")))
console.log(`API contract coverage: ${result.covered}/${result.total} legacy route files (${Math.round((result.covered / result.total) * 100)}%). Handler and payload parity require separate HTTP tests.`)
console.log(`Accepted as not ported (scripts/accepted-gaps.ts, each with a reason): ${result.accepted.length}. Open gaps: ${result.open.length}.`)
if (process.argv.includes("--missing")) console.log(result.open.map((row) => `${row.missingMethods.join(",") || "?"} ${row.route}${row.existingMethods.length ? ` (has ${row.existingMethods.join(",")})` : ""}`).join("\n"))
if (process.argv.includes("--strict") && result.open.length > 0) process.exitCode = 1
